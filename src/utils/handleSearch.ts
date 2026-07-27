// 아이디(handle) 검색 결과 정렬 — 순수 로직(테스트 대상).
//
// 서버는 ilike '%q%'로 부분 일치만 걸러줄 뿐 관련도 순서를 주지 않는다. 그대로 두면
// 'abc'를 검색했을 때 정확히 'abc'인 사람이 'xxabcxx' 뒤로 밀릴 수 있다.
// 여기서 관련도(정확 → 접두 → 부분) 기준으로 다시 세운다.

/** 관련도 순위 — 낮을수록 먼저. 0=정확 일치, 1=접두 일치, 2=부분 포함 */
export function handleMatchRank(handle: string | null | undefined, query: string): number {
  const h = (handle ?? '').trim().toLowerCase();
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!h || !q) return 2;
  if (h === q) return 0;
  if (h.startsWith(q)) return 1;
  return 2;
}

/**
 * 검색 결과 정렬 — 관련도 → 짧은 아이디 → 사전순.
 * 짧은 아이디를 먼저 두는 이유: 같은 접두 일치라면 검색어에 가까운(군더더기 적은) 쪽이
 * 사용자가 찾던 사람일 확률이 높다.
 */
export function sortByHandleRelevance<T extends { handle?: string | null }>(rows: T[], query: string): T[] {
  return [...rows].sort((a, b) => {
    const ra = handleMatchRank(a.handle, query);
    const rb = handleMatchRank(b.handle, query);
    if (ra !== rb) return ra - rb;
    const ha = (a.handle ?? '').toLowerCase();
    const hb = (b.handle ?? '').toLowerCase();
    if (ha.length !== hb.length) return ha.length - hb.length;
    return ha.localeCompare(hb);
  });
}

/** id 기준 중복 제거(앞선 항목 우선) — 정확 일치 조회와 부분 일치 조회를 합칠 때 쓴다 */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
