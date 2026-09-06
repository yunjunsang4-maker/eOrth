/**
 * snapStrip 검증 — node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts
 */
import { putMineFirst } from './snapStrip';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type S = { id: string; mine?: boolean };
const isMine = (s: S) => s.mine === true;

// 경계 — 빈 배열·내 항목 없음은 순서 그대로
eq(putMineFirst<S>([], isMine), [], '빈 배열 → 빈 배열');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }], isMine).map((s) => s.id), ['a', 'b'], '내 항목 없음 → 순서 유지');

// 정상 — 내 항목이 중간에 있으면 맨 앞으로, 나머지 상대 순서 유지
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me', mine: true }, { id: 'b' }], isMine).map((s) => s.id), ['me', 'a', 'b'], '중간의 내 항목 → 맨 앞');
eq(putMineFirst<S>([{ id: 'me', mine: true }, { id: 'a' }], isMine).map((s) => s.id), ['me', 'a'], '이미 맨 앞 → 그대로');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }, { id: 'me', mine: true }], isMine).map((s) => s.id), ['me', 'a', 'b'], '맨 뒤의 내 항목 → 맨 앞');

// 내 항목 2개(나라별 대표) — 첫 번째만 이동, 두 번째는 제자리(다른 항목과의 상대 순서 유지)
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me1', mine: true }, { id: 'b' }, { id: 'me2', mine: true }], isMine).map((s) => s.id),
  ['me1', 'a', 'b', 'me2'], '내 항목 2개(rank 없음) → 첫 번째만 앞으로');

// rank(timestamp) — 모두 열람 상태면 snapItems가 오래된 순이라, 배열 첫 번째가 아니라 가장 최신 내 항목이 앞에 와야 한다(QA F-1)
type R = S & { ts?: number };
const rank = (s: R) => s.ts ?? 0;
eq(putMineFirst<R>([{ id: 'me-old', mine: true, ts: 1 }, { id: 'a', ts: 2 }, { id: 'me-new', mine: true, ts: 3 }], isMine, rank).map((s) => s.id),
  ['me-new', 'me-old', 'a'], 'rank 있음 → 가장 최신 내 항목이 앞, 나머지 순서 유지');
eq(putMineFirst<R>([{ id: 'me1', mine: true, ts: 5 }, { id: 'me2', mine: true, ts: 5 }], isMine, rank).map((s) => s.id),
  ['me1', 'me2'], 'rank 동점 → 먼저 나온 것 유지');
eq(putMineFirst<R>([{ id: 'a' }, { id: 'me', mine: true }], isMine, rank).map((s) => s.id),
  ['me', 'a'], 'rank 있고 timestamp 없음(0) → 그래도 앞으로');

// 원본 불변 — 화면 useMemo 결과를 다른 곳에서도 쓰므로 mutate하면 안 된다
const src: S[] = [{ id: 'a' }, { id: 'me', mine: true }];
putMineFirst(src, isMine);
eq(src.map((s) => s.id), ['a', 'me'], '입력 배열은 그대로');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
