// 개발 중 구간 시간 계측 — 릴리스 빌드에서는 전부 no-op이다.
//
// 왜 필요한가: 튜토리얼 렉을 네 차례 '추정'으로 고쳤고 그중 두 번이 빗나갔다.
// 어디서 시간이 가는지 숫자로 본 뒤에 고치기 위한 최소 도구다.
//
// 사용법:
//   traceStart('coach:main');
//   traceStep('coach:main', 'measured');   // [perf] coach:main · measured +312ms (총 312ms)
//   traceEnd('coach:main', 'visible');     // [perf] coach:main · visible +18ms (총 330ms) ─ 끝
//
// 릴리스 빌드에서 한 번 재보고 싶으면 아래 TRACE_ENABLED를 true로 바꿔 빌드한다.
// (기본값 __DEV__ 로 커밋할 것 — 릴리스에 로그가 남으면 안 된다)
const TRACE_ENABLED = __DEV__;

type Group = { start: number; last: number };
const groups = new Map<string, Group>();

/** 그룹의 기준점을 잡는다. 같은 이름으로 다시 부르면 기준점이 재설정된다. */
export function traceStart(group: string): void {
  if (!TRACE_ENABLED) return;
  const t = Date.now();
  groups.set(group, { start: t, last: t });
}

/** 직전 지점부터의 경과와 그룹 시작부터의 총합을 찍는다. */
export function traceStep(group: string, label: string): void {
  if (!TRACE_ENABLED) return;
  const g = groups.get(group);
  if (!g) return; // traceStart 없이 호출된 경우(예: 첫 렌더) 조용히 무시한다
  const t = Date.now();
  console.log(`[perf] ${group} · ${label} +${t - g.last}ms (총 ${t - g.start}ms)`);
  g.last = t;
}

/** 마지막 지점을 찍고 그룹을 정리한다. */
export function traceEnd(group: string, label: string): void {
  if (!TRACE_ENABLED) return;
  const g = groups.get(group);
  if (!g) return;
  const t = Date.now();
  console.log(`[perf] ${group} · ${label} +${t - g.last}ms (총 ${t - g.start}ms) ─ 끝`);
  groups.delete(group);
}
