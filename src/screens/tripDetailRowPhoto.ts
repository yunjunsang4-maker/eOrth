// 여행 상세(TripDetailScreen)의 형식 행 배경 사진 선별 규칙.
//
// 화면에서 떼어낸 이유는 tripDetailSort와 같다 — 순수 함수라야 검증 파일
// (tripDetailRowPhoto.verify.ts)로 규칙을 고정할 수 있다. 확률이 섞인 로직은 화면 안에 두면
// "왜 저 사진이 깔렸나"를 렌더 없이는 확인할 길이 없다.
//
// 분류 신호는 photo-vision 네이티브 분석(NativePhotoAnalysis)에서 오지만 이 파일은 그 타입을
// import하지 않는다 — 필요한 불리언만 받는 구조라 네이티브가 없는 환경에서도 안전하고,
// 검증 파일이 가짜 분석 결과를 손으로 만들어 넣을 수 있다.

export type RowPhotoCategory = 'landscape' | 'people' | 'food' | 'other';

/**
 * 부류 확률(사용자 지정) — 풍경 80% · 사람 15% · 음식 5%.
 * 비어 있는 부류는 빼고 남은 부류끼리 재정규화한다(음식 없음 → 풍경 80/95, 사람 15/95).
 */
export const ROW_PHOTO_WEIGHTS = { landscape: 0.8, people: 0.15, food: 0.05 } as const;

/** 확률 추첨 대상 부류 — 'other'는 여기 없다(세 부류가 다 빌 때의 폴백 전용) */
const WEIGHTED: readonly (keyof typeof ROW_PHOTO_WEIGHTS)[] = ['landscape', 'people', 'food'];

/**
 * 네이티브 분석 한 장 → 부류. `null`은 "배경으로 쓰지 않음"(영수증·문서·스크린샷).
 *
 * 우선순위가 겹치는 사진이 실제로 많다(식탁에 앉은 사람 = isFood + hasFace, 풍경 속 인물 =
 * isLandscape + hasFace). 순서를 음식 → 사람 → 풍경으로 고정해 같은 사진이 매번 같은 부류로
 * 떨어지게 한다. isUtility는 무엇과 겹쳐도 먼저 잘라낸다.
 */
export function classifyRowPhoto(a: {
  isFood?: boolean;
  hasFace?: boolean;
  faceCount?: number;
  isLandscape?: boolean;
  isLandmark?: boolean;
  isUtility?: boolean;
}): RowPhotoCategory | null {
  if (a.isUtility) return null;
  if (a.isFood) return 'food';
  // faceCount는 구 네이티브 빌드에 없어 undefined다 — hasFace를 먼저 본다
  if (a.hasFace || (a.faceCount ?? 0) > 0) return 'people';
  if (a.isLandscape || a.isLandmark) return 'landscape';
  return 'other';
}

/** 목록에서 무작위 한 장. 빈 목록은 null. rand가 1을 돌려줘도 범위를 넘지 않게 클램프한다. */
function pickOne(list: string[], rand: () => number): string | null {
  if (list.length === 0) return null;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(rand() * list.length)));
  return list[i];
}

/**
 * 후보 사진들 중 행 배경으로 쓸 한 장을 고른다. 없으면 null.
 *
 * 1. 풍경/사람/음식 중 실제로 있는 부류만 모아 ROW_PHOTO_WEIGHTS 비율로 부류를 뽑고
 * 2. 그 부류 안에서 무작위 한 장.
 * 3. 세 부류가 모두 비면 미분류(other) 중 무작위 — 네이티브가 없거나 분석이 실패한 기기가
 *    전부 여기로 떨어지므로, 이 폴백이 없으면 행 배경이 영영 안 바뀐다.
 *
 * `rand`를 인자로 받는 이유는 결정적 검증을 위해서다(같은 rand 시퀀스 → 같은 결과).
 * rand 호출 횟수는 1~2회 — 부류 추첨 1회 + 부류 안 추첨 1회(3번 폴백 경로는 1회).
 * 입력 배열·객체는 건드리지 않는다.
 */
export function pickRowPhoto(
  cands: { uri: string; category: RowPhotoCategory }[],
  rand: () => number,
): string | null {
  if (cands.length === 0) return null;

  const byCat = new Map<RowPhotoCategory, string[]>();
  for (const c of cands) {
    const list = byCat.get(c.category);
    if (list) list.push(c.uri);
    else byCat.set(c.category, [c.uri]);
  }

  const present = WEIGHTED.filter((k) => (byCat.get(k)?.length ?? 0) > 0);
  if (present.length === 0) return pickOne(byCat.get('other') ?? [], rand);

  // ⚠️ 누적 경계를 소수로 더하면 안 된다 — 0.8 + 0.15는 0.9500000000000001이 되어
  // rand=0.95가 음식이 아니라 사람으로 떨어진다(경계 1건이 조용히 어긋남).
  // 정수로 더한 뒤 나누면(95/100) 리터럴 0.95와 정확히 같은 double이 나온다.
  const w = present.map((k) => Math.round(ROW_PHOTO_WEIGHTS[k] * 100));
  const total = w.reduce((sum, v) => sum + v, 0);

  const r = rand();
  // rand가 1 이상을 돌려주는 이상 케이스에서도 마지막 부류로 떨어지게 기본값을 둔다
  let cat: RowPhotoCategory = present[present.length - 1];
  let cum = 0;
  for (let i = 0; i < present.length; i++) {
    cum += w[i];
    if (r < cum / total) { cat = present[i]; break; }
  }
  return pickOne(byCat.get(cat) ?? [], rand);
}
