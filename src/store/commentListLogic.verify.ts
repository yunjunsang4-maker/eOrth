// src/store/commentListLogic.verify.ts
import { removeComment, restoreComment } from './commentListLogic';
import type { PostComment } from './recordStore';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const c = (id: string, replies?: PostComment[]): PostComment => ({ id, emoji: '', name: id, text: id, createdAt: 0, ...(replies ? { replies } : {}) });
const ids = (list: PostComment[]) => list.map((x) => (x.replies?.length ? `${x.id}[${x.replies.map((r) => r.id).join(',')}]` : x.id));

const base = [c('a'), c('b', [c('b1'), c('b2')]), c('d')];

// 정상: top-level 삭제 → 되돌리면 원래 자리
const r1 = removeComment(base, 'b');
eq(ids(r1.next), ['a', 'd'], 'top-level 삭제: b 빠짐');
eq(ids(restoreComment(r1.next, r1.removed!)), ['a', 'b[b1,b2]', 'd'], 'top-level 복원: b가 원래 자리(1)로, 답글째');

// 정상: 답글 삭제 → 부모 replies 원래 자리
const r2 = removeComment(base, 'b1');
eq(ids(r2.next), ['a', 'b[b2]', 'd'], '답글 삭제: b1만 빠짐');
eq(ids(restoreComment(r2.next, r2.removed!)), ['a', 'b[b1,b2]', 'd'], '답글 복원: b1이 b 아래 맨 앞으로');

// 핵심(9번 결함 3): 삭제 실패 사이에 새 댓글이 달려도 지워지지 않는다
const between = [...r1.next, c('new')];
eq(ids(restoreComment(between, r1.removed!)), ['a', 'b[b1,b2]', 'd', 'new'], '사이에 단 댓글 new 보존 + b 복원');
const betweenReply = r2.next.map((x) => (x.id === 'b' ? { ...x, replies: [...x.replies!, c('b3')] } : x));
eq(ids(restoreComment(betweenReply, r2.removed!)), ['a', 'b[b1,b2,b3]', 'd'], '사이에 단 답글 b3 보존 + b1 복원');

// 경계: 없는 id → 그대로, removed null
const r3 = removeComment(base, 'zzz');
eq([r3.next === base, r3.removed], [true, null], '없는 id: 목록 그대로·removed null');
eq(ids(removeComment([], 'a').next), [], '빈 목록 삭제: 빈 목록');

// 경계: 이미 되돌아와 있으면 중복 삽입 안 함(refresh가 먼저 서버 사본을 가져온 경우)
eq(ids(restoreComment(base, r1.removed!)), ['a', 'b[b1,b2]', 'd'], '이미 있으면 중복 삽입 안 함(top)');
eq(ids(restoreComment(base, r2.removed!)), ['a', 'b[b1,b2]', 'd'], '이미 있으면 중복 삽입 안 함(답글)');

// 경계: 부모가 사라졌으면 답글은 되돌리지 않는다(고아 답글을 top-level로 만들지 않음)
eq(ids(restoreComment([c('a')], r2.removed!)), ['a'], '부모 사라짐: 답글 복원 안 함');

// 경계: 원래 index가 현재 길이보다 크면 맨 뒤
eq(ids(restoreComment([], r1.removed!)), ['b[b1,b2]'], 'index 초과: 맨 뒤(빈 목록)');

// 입력 불변
removeComment(base, 'b1');
eq(ids(base), ['a', 'b[b1,b2]', 'd'], '입력 목록 mutate 안 함');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
