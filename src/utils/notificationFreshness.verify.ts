// src/utils/notificationFreshness.verify.ts
import { notificationKey, pickFreshNotifications } from './notificationFreshness';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const ID = '11111111-2222-3333-4444-555555555555';

// ── 키 형식 ──
eq(notificationKey({ id: ID, createdAt: 1000 }), `${ID}:1000`, '키는 id:createdAt');

// ── 첫 도착: 기준선이 비어 있으면 배너 대상 ──
{
  const seen = new Set<string>();
  const fresh = pickFreshNotifications([{ id: ID, createdAt: 1000 }], seen);
  eq(fresh.map((r) => r.createdAt), [1000], '첫 도착 → 새 알림');
}

// ── 같은 id · 같은 createdAt = 이미 본 것(구독 재연결·중복 이벤트) ──
{
  const seen = new Set<string>([`${ID}:1000`]);
  const fresh = pickFreshNotifications([{ id: ID, createdAt: 1000 }], seen);
  eq(fresh.length, 0, '같은 id 같은 createdAt → 무시(중복 배너 방지)');
}

// ── 같은 id · 새 createdAt = collapse 재알림(uq_notifications_actor_type) → 새 배너 ──
{
  const seen = new Set<string>([`${ID}:1000`]);
  const fresh = pickFreshNotifications([{ id: ID, createdAt: 2000 }], seen);
  eq(fresh.map((r) => r.createdAt), [2000], '같은 id 새 createdAt → 새 알림(같은 사람의 두 번째 반응)');
}

// ── 읽음 처리 update(read=true)는 created_at을 안 바꾼다 → 배너 없음 ──
{
  const seen = new Set<string>([`${ID}:2000`]);
  // read만 true로 바뀐 같은 행 — 키는 그대로다
  const fresh = pickFreshNotifications([{ id: ID, createdAt: 2000, read: true }], seen);
  eq(fresh.length, 0, 'read=true 갱신 → 무시(방금 읽은 알림이 배너로 되돌아오지 않게)');
}

// ── 순서: 서버는 최신순으로 주지만 배너 큐는 오래된 순이어야 도착 순서가 맞는다 ──
{
  const seen = new Set<string>();
  const fresh = pickFreshNotifications(
    [{ id: 'c', createdAt: 300 }, { id: 'b', createdAt: 200 }, { id: 'a', createdAt: 100 }],
    seen
  );
  eq(fresh.map((r) => r.id), ['a', 'b', 'c'], '최신순 입력 → 오래된 순 출력');
}

// ── 섞임: 일부만 새것 ──
{
  const seen = new Set<string>(['b:200']);
  const fresh = pickFreshNotifications(
    [{ id: 'c', createdAt: 300 }, { id: 'b', createdAt: 200 }, { id: 'a', createdAt: 100 }],
    seen
  );
  eq(fresh.map((r) => r.id), ['a', 'c'], '본 것만 빠지고 나머지는 오래된 순 유지');
}

// ── 경계: 빈 목록 ──
eq(pickFreshNotifications([], new Set<string>()), [], '빈 목록 → 빈 결과');

// ── 부작용 없음: seen을 함수가 건드리면 뮤트로 건너뛴 알림이 기록되지 않는 사고가 난다 ──
{
  const seen = new Set<string>();
  pickFreshNotifications([{ id: ID, createdAt: 1000 }], seen);
  eq(seen.size, 0, 'pickFresh는 seen을 변경하지 않는다(표시는 호출부 책임)');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
