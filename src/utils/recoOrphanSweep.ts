// AI 형식 추천 카드를 '수락'하면 사진이 trips/reco-{카드id}-{수락시각}/ 로 복사된다
// (RecoSection.onAccept → copyTripOriginals). 폴더가 수락마다 고유한 것은 의도다 —
// 카드 id가 결정론적이라 폴더를 재사용하면 이미 저장된 글의 복사본을 덮어쓴다.
// 그 대가로 작성 화면을 열었다가 저장하지 않고 나가면 폴더가 고아로 남는다.
// 이 모듈이 그 고아만 골라 지운다.
//
// ⚠️ 저장된 글은 이 폴더 안의 파일을 직접 가리킨다(복사본 경로가 곧 영구 저장).
//    잘못 지우면 이미 저장한 글의 사진이 통째로 사라지고 되돌릴 수 없다. 그래서
//    판정은 필드 열거가 아니라 **전체 직렬화 + 경로 부분문자열**로 한다 —
//    TravelRecord는 medias 외에도 representativePhoto(Source)·perCountryData·
//    blogBlocks·cutPhoto.photos/previewUri/frameImage·snapFront/BackUri·
//    uploadedMediaUrls(키가 로컬 uri) 등 uri가 흩어져 있어, 필드를 하나라도
//    빠뜨리면 그 형식의 글이 깨진다. JSON.stringify는 '/'를 이스케이프하지 않고
//    폴더명 문자집합(영숫자·_·-·UUID의 /)은 encodeURI를 거쳐도 변형되지 않으므로
//    부분문자열 판정은 표기 차이에 흔들리지 않는다.
//
// ⚠️ 컷 카드 id는 스팟 그룹 id(spot_{시각}_{자산id})를 품는데 iOS 자산 id는
//    "UUID/L0/001"처럼 슬래시를 포함한다. 그래서 폴더가 의도보다 깊은 중첩
//    디렉터리가 된다(trips/reco-cut_x_UUID/L0/001-{ts}/…). trips/ 직속 항목만
//    보면 수락 시각(-{ts})이 안 보이므로, 나이 판정은 하위 디렉터리까지 걷는다.
//
// 삭제 조건(전부 충족해야 지운다 — 하나라도 못 지키면 남긴다):
//   0) 참조 소스를 믿을 수 있음 — 전 소스가 비어 있으면 hydrate 실패(persist.ts가
//      읽기 실패를 빈 시드 상태로 렌더하는 실제 시나리오)의 위장일 수 있어 통째로 포기
//   1) 이름이 reco- 접두
//   2) 기록·임시저장·여행 카드·나라 대표핀 어디에도 trips/{이름}/ 참조가 없음
//   3) 수락 시각을 알 수 있고(-13자리 ms 접미), 그 시각이 최소 나이(24h)보다 오래됨
//      — 수락 직후 작성 화면이 아직 살아 있는(저장 전이라 참조가 어디에도 없는)
//        복사본을 지우는 사고를 막는 유예. 미래 시각(시계 이동)도 여기서 걸러진다.
//
// ⚠️ 이 모듈은 recoOrphanSweep.verify.ts가 RN 없이 tsx로 돌린다. 순수 함수 구역에는
//    import이 없어야 하고, expo-file-system은 sweep 안에서 지연 require한다
//    (tripPhotoPool.ts와 같은 방식).

export const RECO_DIR_PREFIX = 'reco-';

// 최소 나이 — "지금 작성 중"일 수 있는 복사본의 유예 기간. 하루면 앱이 살아남아
// 미저장 작성 화면을 유지할 현실적 한계를 한참 넘는다(iOS는 그 전에 jetsam).
// 짧게 줄이고 싶어도 0으로 만들지 말 것 — 수락→작성 화면이 뜬 그 순간의 폴더는
// 어떤 기록도 참조하지 않아, 나이 유예가 없으면 즉시 삭제 대상으로 오판된다.
export const RECO_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

// 중첩 디렉터리 걷기 깊이 상한 — 자산 id 슬래시로 생기는 깊이는 3단 남짓이라
// 6이면 충분하고, 예상 밖 구조에서 무한 재귀로 빠지지 않게 막는다.
export const RECO_SWEEP_MAX_DEPTH = 6;

// ─────────────────────────────────────────────
// 순수 로직 (verify 대상)
// ─────────────────────────────────────────────

/**
 * 참조 판정의 원문 — 기록 등 참조 후보들을 통째로 직렬화해 잇는다.
 * 하나라도 직렬화에 실패하거나 undefined로 사라지면 null: 참조를 전수로 못 본 것이므로
 * 호출부는 청소 전체를 포기해야 한다(빠진 소스의 글이 가리키는 폴더를 지울 수 있다).
 * JSON.stringify(undefined)는 예외가 아니라 undefined를 돌려준다 — ?? ''로 삼키면
 * "소스 누락"이 "참조 0건"으로 위장되므로 반드시 null로 승격한다.
 */
export function buildReferenceText(sources: unknown[]): string | null {
  const parts: string[] = [];
  for (const s of sources) {
    try {
      const part = JSON.stringify(s);
      if (typeof part !== 'string') return null; // undefined/함수 소스 — 전수 판정 불가
      parts.push(part);
    } catch {
      return null; // 순환 참조 등 — 전수 판정 불가
    }
  }
  return parts.join('\n');
}

/**
 * 참조 소스들이 "믿을 수 있는 상태"인가 — 하나라도 내용(원소 있는 배열 또는 키 있는
 * 객체)이 있어야 true다.
 *
 * 🔴 "빈 배열이면 전부 고아 아닌가?"라고 생각하고 이 게이트를 지우지 마라.
 * persist.ts(:100-145)는 AsyncStorage 읽기가 실패해도(Android CursorWindow 초과로
 * 큰 records 키가 안 읽히는 실제 시나리오 — 기록 많은 사용자일수록 걸린다)
 * hydrated=true로 빈 시드 상태를 렌더한다. 대신 저장을 꺼서 원본은 지켜 두므로
 * 다음 세션에 records는 되살아나는데, 그 세션에서 이 sweep이 빈 records·drafts를
 * "참조 0건"으로 믿고 돌면 되살아날 글이 가리키는 사진 폴더를 먼저 지워버린다 —
 * persist 계층이 지켜낸 데이터를 여기서 파괴하는 셈이다.
 *
 * 즉 "전부 비어 있음"은 (a) 진짜 신규 사용자거나 (b) hydrate 실패의 위장이며,
 * 이 함수로는 둘을 구분할 수 없다(실패 신호 saveDisabledRef는 persist 훅 내부 ref라
 * 밖에서 못 본다). 그래서 구분 불가면 포기한다 — (a)는 지울 reco- 폴더 자체가 없어
 * 잃는 것이 없고, (b)는 복구 불가 파손을 막는다.
 *
 * "모든 소스"를 보는 것으로 충분한 근거: records·drafts·tripGroups·countryCovers는
 * 전부 STORE_KEYS.records 봉투 하나에서 hydrate된다(recordStore hydrate 참조).
 * 읽기 실패는 넷을 동시에 비우므로 "전부 비면 포기"가 곧 "records·drafts가 비면
 * 포기"이고, 위장 상태에서 일부만 비는 조합은 생기지 않는다.
 */
export function hasAnyReferenceContent(sources: unknown[]): boolean {
  for (const s of sources) {
    if (Array.isArray(s)) {
      if (s.length > 0) return true;
    } else if (s && typeof s === 'object') {
      if (Object.keys(s).length > 0) return true;
    }
  }
  return false;
}

/**
 * sweep이 쓰는 단일 관문 — 소스가 위장 빈 상태(hasAnyReferenceContent 참조)거나
 * 직렬화가 불완전하면 null을 돌려 청소 전체를 포기시킨다.
 * null이면 아무것도 지우지 않는다는 불변식은 sweepRecoOrphans가 지킨다.
 */
export function buildTrustedReferenceText(sources: unknown[]): string | null {
  if (!hasAnyReferenceContent(sources)) return null;
  return buildReferenceText(sources);
}

/**
 * 폴더가 어딘가에서 참조되는가. 뒤에 '/'를 붙여 폴더 경계까지 맞춘다 —
 * 'reco-a'가 'trips/reco-ab/0.jpg' 참조에 오탐으로 걸리지 않는다.
 * 중첩 컷 폴더도 참조 uri(trips/reco-cut_x_UUID/L0/…)에 이 접두가 그대로 있어 잡힌다.
 */
export function isRecoFolderReferenced(refText: string, folderName: string): boolean {
  return refText.includes(`trips/${folderName}/`);
}

/**
 * 디렉터리명 끝의 수락 시각(-{Date.now()} 13자리)을 파싱. 없으면 null.
 * 13자리 고정인 이유: Date.now()는 2001~2286년 내내 13자리다. 자릿수를 느슨하게
 * 하면 자산 id 끝의 짧은 숫자(안드로이드 content:// id 등)를 시각으로 오판한다.
 */
export function parseAcceptTs(name: string): number | null {
  const m = /-(\d{13})$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** 걷기로 모은 디렉터리명들 중 가장 최근 수락 시각. 하나도 못 읽으면 null. */
export function maxAcceptTs(names: string[]): number | null {
  let max: number | null = null;
  for (const n of names) {
    const ts = parseAcceptTs(n);
    if (ts != null && (max == null || ts > max)) max = ts;
  }
  return max;
}

/**
 * 삭제 판정. 남기는 쪽이 항상 안전하므로 확신이 없는 모든 경우(참조 있음·나이 불명·
 * 아직 어림·미래 시각)는 false다.
 */
export function shouldDeleteRecoFolder(args: {
  name: string;
  refText: string;
  newestTs: number | null;
  now: number;
  minAgeMs?: number;
}): boolean {
  const { name, refText, newestTs, now, minAgeMs = RECO_ORPHAN_MIN_AGE_MS } = args;
  if (!name.startsWith(RECO_DIR_PREFIX)) return false;
  if (isRecoFolderReferenced(refText, name)) return false;
  if (newestTs == null) return false; // 나이를 모르면 지우지 않는다
  if (now - newestTs < minAgeMs) return false; // 어리거나 미래 시각(시계 이동)이면 유예
  return true;
}

// ─────────────────────────────────────────────
// 청소 실행 (expo-file-system/legacy 지연 require — verify는 여기까지 오지 않는다)
// ─────────────────────────────────────────────

type LegacyFs = typeof import('expo-file-system/legacy');

/** dirUri 아래 모든 하위 디렉터리 이름을 out에 모은다(파일은 무시). */
async function collectSubdirNames(
  fs: LegacyFs,
  dirUri: string,
  out: string[],
  depth: number,
): Promise<void> {
  if (depth <= 0) return;
  let children: string[] = [];
  try {
    children = await fs.readDirectoryAsync(dirUri);
  } catch {
    return; // 읽기 실패 — 여기 있던 ts는 못 보지만, 못 본 만큼 판정은 보수(유지) 쪽으로 기운다
  }
  for (const child of children) {
    const uri = `${dirUri}/${child}`;
    try {
      const info = await fs.getInfoAsync(uri);
      if (info.exists && info.isDirectory) {
        out.push(child);
        await collectSubdirNames(fs, uri, out, depth - 1);
      }
    } catch {
      // 파일이거나 조회 실패 — 무시
    }
  }
}

/**
 * trips/ 아래 reco- 접두 폴더 중 고아만 지운다. 실패는 전부 조용히 넘어간다 —
 * 부가 청소가 스캔이나 앱 동작을 막을 이유가 없고, 남은 폴더는 다음 기회에 다시 본다.
 *
 * referenceSources: 참조를 품을 수 있는 모든 데이터(records·drafts·tripGroups·
 * countryCovers). 빠뜨린 소스의 글이 가리키는 폴더를 지우게 되므로, 새 저장소가
 * 로컬 uri를 품게 되면 여기 목록에도 추가할 것.
 */
export async function sweepRecoOrphans(
  referenceSources: unknown[],
  now: number = Date.now(),
): Promise<void> {
  const fs = require('expo-file-system/legacy') as LegacyFs;
  const base = fs.documentDirectory;
  if (!base) return;
  // 참조 원문이 null이면 무조건 전체 포기 — hydrate 실패 위장(전 소스 빈 상태)과
  // 직렬화 불완전(undefined 소스·순환)이 모두 여기로 모인다. 각 근거는 함수 주석에.
  const refText = buildTrustedReferenceText(referenceSources);
  if (refText == null) return;
  const tripsDir = `${base}trips/`;
  let entries: string[] = [];
  try {
    entries = await fs.readDirectoryAsync(tripsDir);
  } catch {
    return; // trips/ 자체가 없으면 지울 것도 없다
  }
  for (const name of entries) {
    if (!name.startsWith(RECO_DIR_PREFIX)) continue; // 일반 여행 폴더(trips/{tripId}/)는 손대지 않는다
    try {
      if (isRecoFolderReferenced(refText, name)) continue;
      // 나이는 하위 디렉터리까지 걷어서 판단 — 중첩 컷 폴더는 최상위 이름에 ts가 없다.
      // 같은 최상위 아래 수락이 여러 번 쌓였을 수 있으므로 '가장 최근' 수락 기준으로 잰다.
      const dirNames = [name];
      await collectSubdirNames(fs, `${tripsDir}${name}`, dirNames, RECO_SWEEP_MAX_DEPTH);
      if (!shouldDeleteRecoFolder({ name, refText, newestTs: maxAcceptTs(dirNames), now })) continue;
      await fs.deleteAsync(`${tripsDir}${name}`, { idempotent: true });
    } catch {
      // 이 항목은 건너뛴다 — 다음 청소 기회에 다시 판정된다
    }
  }
}
