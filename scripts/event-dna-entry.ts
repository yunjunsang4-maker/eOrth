// docs/event-dna.js의 원본 — esbuild가 이 파일을 번들해 브라우저와 Node가 함께 쓰는 ESM을 만든다.
//
// 왜 번들인가: 문항(36개)·채점 공식·유형 라벨이 이미 앱에 구현돼 있다. 이벤트용으로 옮겨 적으면
// 앱 문항을 고쳤을 때 이벤트만 옛 문구로 남고, 화면에 보여준 유형과 매칭에 쓴 점수가 갈라진다.
// 여기서는 재수출만 하고 로직을 새로 쓰지 않는다.
export { DNA_AXES, DNA_LABELS, DNA_QUESTIONS } from '../src/constants/travelDna';
export { scoreAxes, makeTypeLabel, isValidDna } from '../src/utils/travelDnaScore';
export { COUNTRIES } from '../src/constants/countries';

import { DNA_QUESTIONS } from '../src/constants/travelDna';

// 현장 설문 14문항 = '축당 2문항' = weight 2짜리 전부.
// 앱에서 축당 정확히 2개씩 있으므로 선별 기준을 따로 둘 필요가 없다.
export const EVENT_QUESTIONS = DNA_QUESTIONS.filter((q) => q.weight === 2);

/** 인스타 아이디 규칙 — 소문자 정규화 후의 형태. RLS check 제약과 같은 식이어야 한다. */
export const INSTAGRAM_RE = /^[a-z0-9._]{1,30}$/;

/**
 * 인스타 아이디 정규화 — 실패하면 null.
 *
 * 연락 수단이 이것 하나뿐이라 한 글자만 틀려도 그 사람은 결과를 영영 못 받는다.
 * 그래서 사람들이 실제로 적는 형태(@붙임, 프로필 URL 붙여넣기, 대문자)를 전부 받아준다.
 */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  // 프로필 URL을 통째로 붙여넣는 사람이 많다 — 아이디 조각만 뽑는다
  const url = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@+/, '').trim().toLowerCase();
  return INSTAGRAM_RE.test(v) ? v : null;
}
