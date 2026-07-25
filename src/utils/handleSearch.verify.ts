// 아이디 검색 정렬 검증 (jest 미사용). 실행: npx tsx src/utils/handleSearch.verify.ts
import { handleMatchRank, sortByHandleRelevance, dedupeById } from './handleSearch';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// ── handleMatchRank ──
{
  assert(handleMatchRank('abc', 'abc') === 0, '정확 일치 = 0');
  assert(handleMatchRank('ABC', 'abc') === 0, '대소문자 무시');
  assert(handleMatchRank('abc', '@abc') === 0, '@ 접두 입력 허용');
  assert(handleMatchRank('abcdef', 'abc') === 1, '접두 일치 = 1');
  assert(handleMatchRank('xxabcxx', 'abc') === 2, '부분 포함 = 2');
  assert(handleMatchRank('', 'abc') === 2, '빈 핸들은 최하위');
  assert(handleMatchRank(null, 'abc') === 2, 'null 핸들 안전');
  assert(handleMatchRank('abc', '') === 2, '빈 검색어 안전');
  assert(handleMatchRank(' abc ', 'abc') === 0, '공백 트림');
}

// ── sortByHandleRelevance ──
{
  const rows = [
    { handle: 'xxabcxx' },   // 부분
    { handle: 'abcdef' },    // 접두(긴)
    { handle: 'abc' },       // 정확
    { handle: 'abcd' },      // 접두(짧)
  ];
  const sorted = sortByHandleRelevance(rows, 'abc');
  assert(sorted.map((r) => r.handle).join(',') === 'abc,abcd,abcdef,xxabcxx',
    '정확 → 접두(짧은 순) → 부분 순서');

  // 원본 배열을 변형하지 않는다
  assert(rows[0].handle === 'xxabcxx', '원본 배열 불변');

  // 같은 길이면 사전순
  const tie = sortByHandleRelevance([{ handle: 'abcz' }, { handle: 'abca' }], 'abc');
  assert(tie[0].handle === 'abca', '동률이면 사전순');

  // 핸들 없는 행도 떨어뜨리지 않는다
  const withNull = sortByHandleRelevance([{ handle: null }, { handle: 'abc' }], 'abc');
  assert(withNull.length === 2 && withNull[0].handle === 'abc', 'null 핸들 행도 유지(뒤로)');

  assert(sortByHandleRelevance([], 'abc').length === 0, '빈 배열 안전');
}

// ── dedupeById ──
{
  const rows = [
    { id: 'a', handle: 'exact' },
    { id: 'b', handle: 'other' },
    { id: 'a', handle: 'dup' },
  ];
  const out = dedupeById(rows);
  assert(out.length === 2, '중복 id 제거');
  assert(out[0].handle === 'exact', '앞선 항목이 남는다(정확 일치 조회 우선)');
  assert(dedupeById([]).length === 0, '빈 배열 안전');
}

// ── 통합: 정확 일치 조회 + 부분 조회 병합 시나리오 ──
{
  const exact = [{ id: '1', handle: 'jun' }];
  const partial = [
    { id: '9', handle: 'junsang99' },
    { id: '1', handle: 'jun' },      // 중복
    { id: '7', handle: 'myjun' },
  ];
  const merged = sortByHandleRelevance(dedupeById([...exact, ...partial]), 'jun');
  assert(merged.map((r) => r.id).join(',') === '1,9,7', '정확 일치가 맨 앞, 중복 제거됨');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
