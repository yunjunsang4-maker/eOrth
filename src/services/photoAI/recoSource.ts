/**
 * 추천 입력 소스 해석기 (설계 §4)
 *
 * 추천 엔진은 사진이 어디서 왔는지 몰라야 한다. 이 모듈이 그 판단을 혼자 진다:
 *   여행 보관 목록(tripPhotoPool)이 있으면 그것 → 없으면 앨범 medias를 어댑트
 *   → 분석 상한까지 균등 간격으로 솎기
 *
 * ⚠️ 순수 함수 구역에는 RN·Expo import이 없어야 한다(verify가 tsx로 돌린다).
 *    tripPhotoPool도 순수 구역만 정적 import하고 getTripPool은 지연 import한다.
 */
import { samplePoolPhotos, type PoolPhoto } from '../../utils/tripPhotoPool';

/**
 * 여행 하나당 실제로 분석할 최대 장수.
 *
 * 보관 상한과 다르다 — 보관은 참조라 장당 125바이트로 싸지만, 분석은 썸네일 생성과
 * 네이티브 추론이라 비싸다. 실기기에서 250장 소요 시간을 측정한 뒤 이 값만 조정한다
 * (설계 §7 실기기 체크리스트). 다른 곳에 같은 숫자를 복제하지 말 것.
 */
export const RECO_ANALYZE_MAX = 250;

/** 앨범 기록에서 이 모듈이 쓰는 부분만. TravelRecord 전체를 끌어오지 않는다. */
export interface RecoSourceRecord {
  medias?: string[];
  mediaAssetIds?: Record<string, string>;
  mediaTimes?: Record<string, number>;
}

/**
 * 앨범 기록 → PoolPhoto[]. 표시 순서를 그대로 유지한다.
 *
 * 자산 id가 없는 복사본은 `id` 키 자체를 넣지 않는다 — poolAssetIds가 id 있는 항목만
 * 모으므로, 빈 값이라도 넣으면 재스캔 제외 집합이 오염된다.
 */
export function adaptAlbumToPool(record: RecoSourceRecord): PoolPhoto[] {
  const medias = record.medias ?? [];
  return medias.map((uri) => {
    const id = record.mediaAssetIds?.[uri];
    const creationTime = record.mediaTimes?.[uri];
    // 키 순서(id→uri)를 맞춘다 — eqJson이 JSON.stringify 문자열을 비교해 순서까지 본다
    const out: PoolPhoto = id ? { id, uri } : { uri };
    if (creationTime !== undefined) out.creationTime = creationTime;
    return out;
  });
}

/**
 * 분석 대상 선별. 무작위가 아니라 균등 간격이다 — 처음과 끝을 포함하고 여행 전 구간을
 * 고르게 훑는다. 앞에서 자르면 첫날 사진만 남는다.
 */
export function pickForAnalysis(photos: PoolPhoto[], max: number = RECO_ANALYZE_MAX): PoolPhoto[] {
  return samplePoolPhotos(photos, max);
}

/**
 * 솎기까지 끝난 목록의 지문(djb2). 이 값이 그대로면 재분석하지 않는다.
 *
 * 자산 id를 1순위로 쓰는 이유: iOS ph:// uri는 세션이 지나면 바뀔 수 있는데, uri로
 * 지문을 내면 사진이 하나도 안 바뀌어도 앱을 다시 켤 때마다 전체 재분석이 돈다.
 * 촬영시각은 넣지 않는다 — 신호에 영향을 주지 않으므로 재분석 사유가 아니다.
 */
export function sourceFingerprint(photos: PoolPhoto[]): string {
  let h = 5381;
  const joined = photos.map((p) => p.id || p.uri).join('|');
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return `${photos.length}:${(h >>> 0).toString(36)}`;
}

/**
 * 이 여행의 분석 대상 사진을 정한다.
 *
 * pool을 우선하고, 없거나 비었으면 앨범 medias로 폴백한다. getTripPool은 "읽기 실패"와
 * "없음"을 모두 null로 돌려주므로, 일시적 파일 오류에도 앨범이 있으면 추천이 살아남는다.
 */
export async function resolveRecoPhotos(
  tripGroupId: string,
  albumRecord?: RecoSourceRecord,
): Promise<PoolPhoto[]> {
  let photos: PoolPhoto[] = [];
  if (tripGroupId) {
    try {
      const { getTripPool } = await import('../../utils/tripPhotoPool');
      const pool = await getTripPool(tripGroupId);
      if (pool && pool.photos.length > 0) photos = pool.photos;
    } catch {
      // 폴백으로 진행
    }
  }
  if (photos.length === 0 && albumRecord) photos = adaptAlbumToPool(albumRecord);
  return pickForAnalysis(photos);
}
