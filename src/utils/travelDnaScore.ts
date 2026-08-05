/**
 * 여행 DNA 채점 (순수 로직, 테스트 대상)
 *
 * 축 점수는 '답한 문항의 가중치'로 정규화한 뒤 응답량에 비례해 중립으로 수축시킨다.
 *
 *   raw   = 100 × Σ(B를 고른 문항의 w) / Σ(답한 문항의 w)
 *   conf  = Σ(답한 문항의 w) / Σ(그 축 모든 문항의 w)
 *   score = round( 50 + (raw - 50) × conf )
 *
 * ⚠️ 수축이 없으면 온보딩 축약판(축당 1문항)에서 점수가 0 아니면 100이 된다.
 *    7문항만 답한 사람이 모든 축에서 극단으로 찍히고 그대로 매칭에 들어간다.
 *    수축 덕분에 응답이 쌓일수록 점수가 자연히 극단으로 자라나 별도 보정이 필요 없다.
 */
import { DNA_QUESTIONS, DNA_AXES, DNA_LABELS, DNA_LABEL_MIN_STRENGTH, type DnaAxisId, type DnaQuestion } from '../constants/travelDna';

export type DnaAnswers = Record<number, 'A' | 'B'>;
export type DnaScores = Record<DnaAxisId, number>;

// id → 문항 (매 호출마다 배열을 훑지 않게 1회 구성)
const BY_ID = new Map<number, DnaQuestion>(DNA_QUESTIONS.map((q) => [q.id, q]));

/** 응답 수 — 존재하지 않는 문항 id는 세지 않는다 */
export function answeredCount(answers: DnaAnswers): number {
  let n = 0;
  for (const key of Object.keys(answers)) {
    if (BY_ID.has(Number(key))) n += 1;
  }
  return n;
}

export function scoreAxes(answers: DnaAnswers): DnaScores {
  const total: Record<string, number> = {};
  const ans: Record<string, number> = {};
  const bw: Record<string, number> = {};
  for (const axis of DNA_AXES) { total[axis] = 0; ans[axis] = 0; bw[axis] = 0; }

  for (const q of DNA_QUESTIONS) total[q.axis] += q.weight;
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (!q) continue; // 삭제된 문항의 옛 응답 — 조용히 무시
    ans[q.axis] += q.weight;
    if (choice === 'B') bw[q.axis] += q.weight;
  }

  const out = {} as DnaScores;
  for (const axis of DNA_AXES) {
    if (ans[axis] === 0 || total[axis] === 0) { out[axis] = 50; continue; }
    const raw = (100 * bw[axis]) / ans[axis];
    const conf = ans[axis] / total[axis];
    out[axis] = Math.round(50 + (raw - 50) * conf);
  }
  return out;
}

/** 유효 응답 — 모든 축에 답이 1개 이상. 축약판(7문항)도 유효다 */
export function isValidDna(answers: DnaAnswers): boolean {
  const seen = new Set<DnaAxisId>();
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (q && (choice === 'A' || choice === 'B')) seen.add(q.axis);
  }
  return DNA_AXES.every((a) => seen.has(a));
}

export interface DnaTypeLabel { key: string; ko: string; en: string }

/**
 * 유형 라벨 — 가장 강한 축이 명사, 두 번째가 수식어.
 *
 * 7축이면 조합이 128가지라 프로토타입을 미리 쓰는 방식은 커버가 성기다.
 * 조합식이면 작성할 문구가 28개뿐이라 품질을 사람이 통제할 수 있고, 축을 늘려도 규칙이 그대로다.
 *
 * 강도는 중립(50)에서의 거리. 동점이면 DNA_AXES 순서가 빠른 축이 명사를 갖는다 —
 * 결정론적이어야 같은 응답에 항상 같은 라벨이 나온다.
 */
export function makeTypeLabel(scores: DnaScores): DnaTypeLabel {
  const ranked = DNA_AXES
    .map((axis, i) => ({ axis, i, strength: Math.abs(scores[axis] - 50), toB: scores[axis] > 50 }))
    .sort((x, y) => (y.strength - x.strength) || (x.i - y.i));

  const top = ranked[0];
  if (!top || top.strength < DNA_LABEL_MIN_STRENGTH) {
    return { key: 'neutral', ko: '아직 색이 옅은 여행자', en: 'A traveler still taking shape' };
  }
  const second = ranked[1];
  const nl = DNA_LABELS[top.axis];
  const al = DNA_LABELS[second.axis];
  const noun = top.toB ? nl.nounB : nl.nounA;
  const enNoun = top.toB ? nl.enNounB : nl.enNounA;
  const adj = second.toB ? al.adjB : al.adjA;
  const enAdj = second.toB ? al.enAdjB : al.enAdjA;
  return {
    key: `${top.axis}${top.toB ? 'B' : 'A'}-${second.axis}${second.toB ? 'B' : 'A'}`,
    ko: `${adj} ${noun}`,
    en: `${enAdj} ${enNoun}`,
  };
}

/** 축 id 하나 + 방향(A/B) 형식 검증 — labelFromKey에서만 쓰는 조각 */
const KEY_PART_RE = /^([a-z]+)([AB])$/;

/**
 * 저장된 key만으로 라벨 문구를 복원한다(타인의 유형 — 축 점수를 갖고 있지 않을 때).
 *
 * makeTypeLabel의 역함수: 첫 조각의 축이 명사, 두 번째 조각의 축이 수식어를 낸다.
 * 단어 목록은 DNA_LABELS 하나만 참조해 makeTypeLabel과 절대 따로 놀지 않는다.
 *
 * ⚠️ 서버에서 온 값이라 예측 못 한 축 이름(개편 후 옛 키)이 섞일 수 있다 — 파싱 실패는
 *    전부 null로 조용히 처리한다. 여기서 던지면 카드 렌더 자체가 무너진다.
 */
export function labelFromKey(key: string | null | undefined): { ko: string; en: string } | null {
  if (!key) return null;
  if (key === 'neutral') {
    return { ko: '아직 색이 옅은 여행자', en: 'A traveler still taking shape' };
  }
  const parts = key.split('-');
  if (parts.length !== 2) return null;
  const [nounPart, adjPart] = parts;
  if (!nounPart || !adjPart) return null;
  const nm = nounPart.match(KEY_PART_RE);
  const am = adjPart.match(KEY_PART_RE);
  if (!nm || !am) return null;

  const [, nounAxis, nounDir] = nm;
  const [, adjAxis, adjDir] = am;
  if (!(DNA_AXES as string[]).includes(nounAxis) || !(DNA_AXES as string[]).includes(adjAxis)) return null;

  const nl = DNA_LABELS[nounAxis as DnaAxisId];
  const al = DNA_LABELS[adjAxis as DnaAxisId];
  const noun = nounDir === 'B' ? nl.nounB : nl.nounA;
  const enNoun = nounDir === 'B' ? nl.enNounB : nl.enNounA;
  const adj = adjDir === 'B' ? al.adjB : al.adjA;
  const enAdj = adjDir === 'B' ? al.enAdjB : al.enAdjA;
  return { ko: `${adj} ${noun}`, en: `${enAdj} ${enNoun}` };
}
