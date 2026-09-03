/**
 * 형식 추천 엔진 — 앨범 저장 직후 백그라운드에서 1회 실행 (설계 §2, §8)
 *
 * fire-and-forget 계약: 어떤 실패도 throw하지 않는다(호출부는 await하지 않음).
 * 실패 시 status:'unavailable' 저장 → UI는 섹션 미노출.
 *
 * 2026-09 개정: 입력이 앨범 사진 복사본에서 여행 보관 사진 참조(pool)로 바뀌었다.
 * 이 엔진은 사진이 앨범에서 왔는지 pool에서 왔는지 몰라야 한다 — 그 판단은
 * recoSource.ts가 혼자 진다(설계 §4). 신호 캐시(signalCache)를 붙여 같은 사진을
 * 두 번 분석하지 않는다.
 */
import * as MediaLibrary from 'expo-media-library';
import { isPhotoVisionAvailable } from '../../../modules/photo-vision';
import { FORMAT_RECO_ENABLED } from '../../constants/featureFlags';
import { CUT_FRAMES, cutSlotCount } from '../../constants/cutFrames';
import { ruleConceptClassifier } from './conceptClassifier';
import { blogCandidates, feedCandidates, stripCandidates } from './formatCandidates';
import { buildStylePrior, rankCandidates } from './personalRanker';
import { getRecoState, saveRecoState } from './recoStorage';
import type { ConceptScores, RecoState } from './recoTypes';
import { groupPhotosBySpot } from './photoGrouping';
import { assessPhotoQuality, makeThumbnail } from './qualityAssessment';
import { applyCached, collectSignals, loadSignalCache, saveSignalCache } from './signalCache';
import { sourceFingerprint } from './recoSource';
import type { PhotoMeta } from './types';
import type { PoolPhoto } from '../../utils/tripPhotoPool';

/**
 * pool 사진(갤러리 참조) → 네이티브에 넘길 file:// 썸네일.
 *
 * 확보 순서는 copyTripCover와 같다: localUri → 자산 id 재조회 → 원본 uri.
 * 각 경로마다 리사이즈를 먼저 시도한다 — 리사이즈가 content://·HEIC를 통과시키고
 * 결과가 앱 캐시라 항상 읽힌다.
 *
 * ⚠️ iOS의 localUri는 PhotoKit 캐시 경로라 만료된다. "있으니 자산 재조회를 건너뛴다"로
 *    만들면 멀쩡한 사진도 전부 실패한다(2026-09-01 실제 발생).
 *
 * 네트워크 다운로드는 하지 않는다(shouldDownloadFromNetwork: false) — 백그라운드
 * 분석이 로밍 데이터와 배터리를 쓰면 안 된다. iCloud 오프로드 사진은 여기서 실패하고
 * 호출부가 건너뛴다.
 */
async function materializeForAnalysis(photo: PhotoMeta): Promise<string | null> {
  const candidates: string[] = [];
  if (photo.id && photo.id !== photo.uri) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(photo.id, { shouldDownloadFromNetwork: false });
      if (info.localUri) candidates.push(info.localUri);
      if (info.uri && info.uri !== info.localUri) candidates.push(info.uri);
    } catch { /* 자산 조회 실패 — 원본 uri로 시도한다 */ }
  }
  candidates.push(photo.uri);

  for (const uri of candidates) {
    const thumb = await makeThumbnail(uri);
    if (thumb) return thumb;
  }
  return null;
}

export interface FormatRecoInput {
  tripGroupId: string;
  /** 이미 pickForAnalysis로 솎인 목록 (recoSource가 만든다) */
  photos: PoolPhoto[];
  pastRecords: { viewType?: string }[]; // 개인화 prior 재료 (호출부가 records 전달)
}

const MIN_PHOTOS = 4;      // 이보다 적으면 추천할 게 없다
const GPS_BATCH = 8;       // getAssetInfoAsync 동시 호출 상한 (OOM 방지 — photoGrouping과 동일 규칙)
const ANALYZE_BATCH = 8;   // 썸네일+네이티브 분석 배치. 하트비트 갱신 주기이기도 하다

/**
 * 지문이 같은 채로 'unavailable'이 된 여행을 재시도하지 않는 최소 간격.
 *
 * unavailable(권한 철회·전량 iCloud 오프로드)은 이 쿨다운이 없으면 TripDetail을
 * 여닫을 때마다 GPS 250회 + 자산 재조회 250회를 처음부터 다시 돈다 — 해외 로밍 중
 * 오프로드 사용자가 카드를 열 때마다 그 비용을 낸다(실제 리뷰 지적 사항).
 *
 * 30분으로 잡은 이유: "권한을 다시 허용한 사용자가 너무 오래 기다리지 않을 것"과
 * "여닫을 때마다 수백 회 네이티브 호출을 하지 않을 것" 사이의 절충이다. 사용자가
 * 설정에서 권한을 막 허용하고 돌아온 세션 안에서는 못 볼 수 있지만, 앱을 다시 켜거나
 * 잠깐 있다 돌아오면 재시도된다 — 무한정 막아두는 것보다는 훨씬 낫다. 사진을
 * 추가/삭제해 지문이 바뀌면 이 쿨다운과 무관하게 즉시 재분석된다(아래 조기 반환 참고).
 */
const UNAVAILABLE_RETRY_MS = 30 * 60_000;

/** 기본 카테고리 프레임의 슬롯 수 목록 (스트립 후보 생성기 입력) */
function basicSlotCounts(): number[] {
  return CUT_FRAMES.filter((f) => f.category === '기본').map((f) => cutSlotCount(f.layout));
}

export async function runFormatReco(input: FormatRecoInput): Promise<void> {
  // prev는 실패 경로(catch)에서도 읽어야 한다 — 닫음 기록은 재분석 실패에도 유지가 계약이다(설계 §8).
  // try 블록 스코프에 두면 catch가 참조할 수 없어 dismissedIds를 빈 배열로 덮어쓰는 사고가 난다.
  // 초기값 null + 아래 catch의 옵셔널 체이닝이 "getRecoState 자체가 실패한 경우"의 방어도 겸한다.
  let prev: RecoState | null = null;
  const fingerprint = sourceFingerprint(input.photos);
  try {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return;
    if (input.photos.length < MIN_PHOTOS) return;

    prev = await getRecoState(input.tripGroupId);
    if (prev && prev.sourceFingerprint === fingerprint) {
      if (prev.status === 'ready') return; // 이미 최신
      // 지문이 그대로인데 unavailable이면 쿨다운 안에서는 재시도하지 않는다.
      // 지문이 바뀌면(사진 추가/삭제) 이 분기 자체를 안 타므로 즉시 재분석된다 —
      // 사용자가 방금 사진을 넣었는데 30분을 기다리게 하는 일은 없다.
      if (prev.status === 'unavailable' && Date.now() - prev.updatedAt < UNAVAILABLE_RETRY_MS) return;
    }

    const pending: RecoState = {
      tripGroupId: input.tripGroupId,
      sourceFingerprint: fingerprint,
      status: 'pending',
      cards: [],
      dismissedIds: prev?.dismissedIds ?? [], // 닫음 기록은 재분석에도 유지 (설계 §8)
      progress: { done: 0, total: input.photos.length },
      updatedAt: Date.now(),
    };
    await saveRecoState(pending);

    // 1) PoolPhoto → PhotoMeta. id가 없으면 uri를 id로 쓴다(후보 생성기가 id로 되짚는다)
    let photos: PhotoMeta[] = input.photos.map((p) => ({
      id: p.id || p.uri,
      uri: p.uri,
      thumbnailUri: null,
      creationTime: p.creationTime ?? 0,
      width: 0,
      height: 0,
      location: null,
    }));

    // 2) GPS best-effort (자산 id가 있는 것만)
    for (let i = 0; i < photos.length; i += GPS_BATCH) {
      const batch = photos.slice(i, i + GPS_BATCH);
      await Promise.all(batch.map(async (p) => {
        if (p.id === p.uri) return; // 자산 id가 없는 사진
        try {
          // iCloud 원본 네트워크 다운로드는 금지 — 백그라운드 분석이 배터리·데이터를 쓰면 안 된다
          const info = await MediaLibrary.getAssetInfoAsync(p.id, { shouldDownloadFromNetwork: false });
          if (info.location) p.location = { latitude: info.location.latitude, longitude: info.location.longitude };
          if (!p.creationTime && info.creationTime) p.creationTime = info.creationTime;
        } catch { /* GPS 없음 — 시간 그룹핑으로 진행 */ }
      }));
      // 하트비트 — GPS 조회도 250장이면 배치가 30번 넘게 돈다. 다음 하트비트(분석 배치)까지
      // 여기서 갱신하지 않으면 STALE_PENDING_MS(3분)를 넘겨 고착으로 오판될 수 있다
      // (조건 5의 무한 재분석 루프가 이 구간에서 그대로 재현된다). 분석 전 단계라
      // 진행률은 아직 의미가 없으므로 done은 그대로 두고 갱신 시각만 찍는다.
      await saveRecoState({ ...pending, updatedAt: Date.now() });
    }

    // 3) 시각을 끝내 못 구한 사진 처리 — 후보안 (b) "제외"를 택했다.
    //   (a) 다른 사진의 평균/중앙값으로 채우기: 그룹핑 자체가 촬영시각 기준이라(photoGrouping.ts)
    //       없는 시각을 지어내면 엉뚱한 스팟에 섞여 들어간다. 거짓 데이터를 만드는 쪽이라 기각.
    //   (c) 하나라도 결손이면 여행 전체 skip: 사진 한 장만 시각이 없어도 추천이 통째로 죽는다.
    //       과잉 차단이라 기각.
    //   (b) 결손 사진만 빼고 나머지로 분석: 남은 사진 기준으로 일차가 정상 계산되고,
    //       formatCandidates를 건드리지 않아도 되며 침습이 가장 적다. → 채택.
    //
    //   단, "전부 0"인 목록(촬영시각을 통째로 못 구한 경우)은 빼지 않는다.
    //   기준일이 다 같아 dayIndex가 전부 1이 되므로 "결함"이 아예 생기지 않고,
    //   여기서 전부 빼면 멀쩡히 되던 스트립·피드 추천까지 사라진다.
    //   깨지는 건 시각이 있는 사진과 없는 사진이 '섞인' 목록뿐이다.
    const timedCount = photos.filter((p) => p.creationTime > 0).length;
    if (timedCount > 0 && timedCount < photos.length) {
      photos = photos.filter((p) => p.creationTime > 0);
      if (photos.length < MIN_PHOTOS) {
        // 남은 사진이 너무 적으면 억지로 추천하지 않는다 (섹션 미노출)
        await saveRecoState({ ...pending, status: 'unavailable', progress: undefined, updatedAt: Date.now() });
        return;
      }
    }

    // 4) 신호 캐시 적용 — 적중분은 재분석하지 않는다. applyCached는 입력을 변형하지 않고
    //    새 배열을 돌려주므로 아래부터는 반환값(photos)만 갱신해 나간다.
    const cache = await loadSignalCache(input.tripGroupId);
    const { hydrated, missing } = applyCached(photos, cache);
    photos = hydrated;

    const byId = new Map(photos.map((p) => [p.id, p]));
    let done = photos.length - missing.length;
    await saveRecoState({ ...pending, progress: { done, total: photos.length }, updatedAt: Date.now() });

    // 5) 미적중분만 썸네일 + 네이티브 분석 (quality/semantic/signal 채움)
    for (let i = 0; i < missing.length; i += ANALYZE_BATCH) {
      const batch = missing.slice(i, i + ANALYZE_BATCH);
      // 썸네일 확보 — 실패한 장은 분석에서 빠지고 quality.passed=true로 통과시킨다
      const withThumb = await Promise.all(
        batch.map(async (p) => ({ photo: p, thumb: await materializeForAnalysis(p) })),
      );
      for (const { photo, thumb } of withThumb) {
        const target = byId.get(photo.id);
        if (!target) continue;
        if (thumb) target.thumbnailUri = thumb;
        else target.quality = { passed: true };
      }
      const analyzable = withThumb.filter((x) => x.thumb) as { photo: PhotoMeta; thumb: string }[];
      if (analyzable.length > 0) {
        // assessPhotoQuality는 이미 채워진 thumbnailUri를 재사용한다(qualityAssessment.ts:127)
        const assessed = await assessPhotoQuality(analyzable.map((x) => byId.get(x.photo.id)!));
        if (assessed.ok && assessed.data) {
          for (const p of assessed.data) byId.set(p.id, p);
        }
      }
      done += batch.length;
      // 하트비트 — 이 갱신이 없으면 250장 분석이 고착(isPendingStale)으로 오판돼
      // 무한 재분석 루프가 된다(recoTypes.ts 참고).
      await saveRecoState({ ...pending, progress: { done, total: photos.length }, updatedAt: Date.now() });
    }

    photos = Array.from(byId.values());

    // 갤러리 권한이 철회됐거나 전량 iCloud 오프로드면 신호가 하나도 안 잡힌다.
    // 그 상태로 후보를 만들면 라벨·색감 없이 규칙이 돌아 근거 없는 카드가 나온다.
    // 캐시 적중분까지 세어 하나도 없으면 추천하지 않는다(섹션 미노출).
    // 권한 팝업은 띄우지 않는다 — 조용히 물러나는 것이 이 앱의 정책이다(App Store 5.1.1 방어).
    if (photos.every((p) => !p.signal && !p.semantic)) {
      await saveRecoState({ ...pending, status: 'unavailable', progress: undefined, updatedAt: Date.now() });
      return;
    }

    // 이번에 새로 분석된 신호만 캐시에 얹는다(기존 캐시와 병합) — 다음 재분석에서 재사용.
    //
    // ⚠️ quality만 채워진 장(품질 폴백)은 걸러낸다. 썸네일 확보 실패(:194 근처)나
    //    네이티브 분석 실패(qualityAssessment.ts의 raw.error 경로)는 둘 다
    //    signal·semantic 없이 quality={passed:true}만 남긴다 — 이건 "분석에 실패했다"는
    //    뜻이지 "분석해보니 신호가 없더라"가 아니다. collectSignals는 quality만 있어도
    //    캐시에 담으므로, 그대로 넘기면 다음 재분석에서 applyCached가 이 장을 "캐시 적중"
    //    으로 오판해 missing에서 빼버린다. signal·semantic이 영원히 채워지지 않아
    //    컨셉 점수가 0에 수렴하고, 사진이 (Wi-Fi에서 다시 받는 등으로) 나중에 정상
    //    분석 가능해져도 캐시가 막아 영구 배제된다(실제 리뷰 지적 사항).
    //    signal 또는 semantic이 있는(=실제로 분석에 성공한) 장만 캐시에 올린다.
    const analyzedOnly = photos.filter((p) => p.signal || p.semantic);
    await saveSignalCache(input.tripGroupId, { ...cache, ...collectSignals(analyzedOnly) });

    // 6) 스팟 그룹핑 + 컨셉 판정
    const groups = groupPhotosBySpot(photos);
    const concepts = new Map<string, ConceptScores>(
      photos.map((p) => [p.id, ruleConceptClassifier(p)])
    );

    // 7) 후보 생성 + 개인화 재순위
    const cands = [
      ...stripCandidates(photos, groups, concepts, basicSlotCounts()),
      ...feedCandidates(photos, concepts),
      ...blogCandidates(photos, groups, concepts),
    ];
    const ranked = rankCandidates(cands, buildStylePrior(input.pastRecords));

    // 8) 카드에 자산 id를 실어 둔다 — iOS ph:// uri는 카드 저장 후 만료되므로,
    //    나중에 수락 시 복사가 uri만으로는 전부 실패한다(RecoCandidate.photoAssetIds 참고).
    const assetIdByUri = new Map(photos.map((p) => [p.uri, p.id === p.uri ? '' : p.id]));

    await saveRecoState({
      ...pending,
      status: ranked.length > 0 ? 'ready' : 'unavailable',
      cards: ranked.map((c) => ({
        ...c,
        photoAssetIds: c.photoUris.map((u) => assetIdByUri.get(u) ?? ''),
        createdAt: Date.now(),
      })),
      progress: undefined,
      updatedAt: Date.now(),
    });
  } catch {
    // fire-and-forget 계약: 조용히 unavailable 기록 시도
    try {
      await saveRecoState({
        tripGroupId: input.tripGroupId,
        sourceFingerprint: fingerprint,
        status: 'unavailable',
        cards: [],
        dismissedIds: prev?.dismissedIds ?? [], // 실패해도 닫음 기록은 보존 (성공 경로와 같은 계약)
        updatedAt: Date.now(),
      });
    } catch { /* 저장까지 실패하면 포기 */ }
  }
}
