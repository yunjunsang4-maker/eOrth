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
import { DNA_QUESTIONS, DNA_AXES, type DnaAxisId, type DnaQuestion } from '../constants/travelDna';

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
