// src/utils/mergeStateFlags.verify.ts
// 부가상태 집합 6종의 기기 간 동기화 — 순수 판정 로직 검증.
//
// 이 파일이 지키는 것 세 가지:
//   ① add-only 규칙(양방향) — 트림이 tombstone을 만들지 않고, 서버 표식이 로컬을 지우지 않는다
//   ② 매핑 유지 규칙 — archived의 remoteId 역매핑이 실패해도 서버 키를 그대로 쓴다
//   ③ push diff의 tombstone 기준 — "로컬에 없다"가 아니라 "이 기기가 올린 적 있는데 지금 없다"
//
// 마지막 블록의 **반증 케이스**는 "통과하도록 짜맞춘 게 아님"을 스스로 증명한다 —
// 그럴듯하지만 틀린 구현이었다면 반드시 깨지는 값을 고정했다.
import {
  classifyServerFlags,
  diffForPush,
  mergeViewedSnap,
  blockedFlagData,
  blockedFlagSig,
  blockedFlagKey,
  flagMapKey,
  parseFlagMapKey,
  isRemovableFlagKind,
  emptyFlagState,
  type LocalFlagState,
  type ServerStateFlagRef,
  type StateFlagKind,
} from './mergeStateFlags';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── 픽스처 ──
/** 부분 집합만 주면 나머지는 빈 배열 */
function local(partial: Partial<Record<StateFlagKind, string[]>>): LocalFlagState {
  const s = emptyFlagState();
  for (const [k, arr] of Object.entries(partial)) {
    s[k as StateFlagKind] = (arr ?? []).map((key) => ({ key }));
  }
  return s;
}
const alive = (kind: StateFlagKind, itemKey: string, updatedAt = 1000): ServerStateFlagRef =>
  ({ kind, itemKey, updatedAt, deletedAt: null });
const dead = (kind: StateFlagKind, itemKey: string): ServerStateFlagRef =>
  ({ kind, itemKey, updatedAt: 2000, deletedAt: 2000 });
/** 결과를 읽기 쉬운 문자열 배열로 */
const keys = (list: { kind: string; itemKey: string }[]) => list.map((c) => `${c.kind}:${c.itemKey}`);
const localKeys = (list: { kind: string; localKey: string }[]) => list.map((c) => `${c.kind}:${c.localKey}`);

// ─────────────────────────────────────────────
// 1) kind 분류 상수
// ─────────────────────────────────────────────
eq(isRemovableFlagKind('archived'), true, '제거 전파 kind: archived');
eq(isRemovableFlagKind('muted'), true, '제거 전파 kind: muted');
eq(isRemovableFlagKind('blocked'), true, '제거 전파 kind: blocked');
eq(isRemovableFlagKind('viewedSnap'), false, 'add-only kind: viewedSnap');
eq(isRemovableFlagKind('reportedPost'), false, 'add-only kind: reportedPost');
eq(isRemovableFlagKind('reportedComment'), false, 'add-only kind: reportedComment');

// ─────────────────────────────────────────────
// 2) classifyServerFlags — 정상 경로
// ─────────────────────────────────────────────
{
  const c = classifyServerFlags(local({ archived: [] }), [alive('archived', 'P-1')]);
  eq(keys(c.missingLocally), ['archived:P-1'], '서버에만 있는 산 항목 → missingLocally');
  eq(c.tombstonedLocally.length, 0, '산 항목은 tombstonedLocally에 안 들어간다');
}
{
  const c = classifyServerFlags(local({ archived: ['P-1'] }), [alive('archived', 'P-1')]);
  eq(c.missingLocally.length, 0, '이미 로컬에 있으면 missingLocally 아님');
  eq(c.tombstonedLocally.length, 0, '이미 로컬에 있고 살아 있으면 아무것도 아님');
}
{
  const c = classifyServerFlags(local({ muted: ['bob'] }), [dead('muted', 'bob')]);
  eq(keys(c.tombstonedLocally), ['muted:bob'], '표식 + 로컬 존재 + removable → tombstonedLocally');
}
{
  const c = classifyServerFlags(local({ muted: [] }), [dead('muted', 'bob')]);
  eq(c.tombstonedLocally.length, 0, '표식인데 로컬에 없으면 아무것도 아님');
  eq(c.missingLocally.length, 0, '표식은 missingLocally로도 절대 안 들어간다(끈 것이 되살아나면 안 된다)');
}
{
  // 여러 kind가 한 프로브에 섞여 온다 — 갈래가 서로 새지 않아야 한다
  const c = classifyServerFlags(
    local({ archived: ['P-1'], muted: ['bob'], blocked: ['carol'] }),
    [alive('archived', 'P-2'), dead('muted', 'bob'), alive('blocked', 'dave'), alive('muted', 'bob')],
  );
  eq(keys(c.missingLocally), ['archived:P-2', 'blocked:dave'], '여러 kind 혼합: missing 2건');
  eq(keys(c.tombstonedLocally), ['muted:bob'], '여러 kind 혼합: tombstone 1건');
}

// ─────────────────────────────────────────────
// 3) add-only 규칙 (pull 방향) — **이 파일의 핵심**
// ─────────────────────────────────────────────
{
  const c = classifyServerFlags(local({ viewedSnap: ['S-1'] }), [dead('viewedSnap', 'S-1')]);
  eq(c.tombstonedLocally.length, 0, 'add-only(viewedSnap)의 서버 표식은 무시 — 로컬을 지우지 않는다');
}
{
  const c = classifyServerFlags(local({ reportedPost: ['P-9'] }), [dead('reportedPost', 'P-9')]);
  eq(c.tombstonedLocally.length, 0, 'add-only(reportedPost)의 서버 표식도 무시');
}
{
  const c = classifyServerFlags(local({ reportedComment: ['C-9'] }), [dead('reportedComment', 'C-9')]);
  eq(c.tombstonedLocally.length, 0, 'add-only(reportedComment)의 서버 표식도 무시');
}
{
  const c = classifyServerFlags(local({ viewedSnap: [] }), [alive('viewedSnap', 'S-2')]);
  eq(keys(c.missingLocally), ['viewedSnap:S-2'], 'add-only도 서버에 있으면 받아온다(열람 표시 전파)');
}

// ─────────────────────────────────────────────
// 4) 매핑 유지 규칙 (archived)
// ─────────────────────────────────────────────
{
  // 서버 키는 remoteId. 이 기기에서는 로컬 기록 id가 'rec-1'이다.
  const mapper = (kind: StateFlagKind, key: string) =>
    kind === 'archived' && key === 'REMOTE-1' ? 'rec-1' : key;
  const c = classifyServerFlags(local({ archived: [] }), [alive('archived', 'REMOTE-1')], mapper);
  eq(localKeys(c.missingLocally), ['archived:rec-1'], '역매핑 성공: localKey가 로컬 기록 id');
  eq(keys(c.missingLocally), ['archived:REMOTE-1'], '역매핑돼도 itemKey(서버 키)는 그대로 보존');
}
{
  // 매핑 실패(그 글이 아직 이 기기에 없다) → 서버 키를 그대로 쓴다.
  // 동기화로 오는 기록은 id === remoteId라 이 값이 곧 로컬 id가 된다(자기 치유).
  const mapper = (_k: StateFlagKind, key: string) => key;
  const c = classifyServerFlags(local({ archived: [] }), [alive('archived', 'REMOTE-X')], mapper);
  eq(localKeys(c.missingLocally), ['archived:REMOTE-X'], '역매핑 실패: 서버 키를 그대로 유지');
}
{
  // 로컬에는 역매핑된 표기('rec-1')로 들어 있는데 서버는 remoteId로 말한다 — 중복 추가 금지
  const mapper = (kind: StateFlagKind, key: string) =>
    kind === 'archived' && key === 'REMOTE-1' ? 'rec-1' : key;
  const c = classifyServerFlags(local({ archived: ['rec-1'] }), [alive('archived', 'REMOTE-1')], mapper);
  eq(c.missingLocally.length, 0, '로컬이 매핑 후 표기로 갖고 있으면 다시 넣지 않는다');
}
{
  // 반대 방향: 로컬이 아직 서버 표기(remoteId)로 갖고 있는 경우도 중복 추가 금지
  const mapper = (kind: StateFlagKind, key: string) =>
    kind === 'archived' && key === 'REMOTE-1' ? 'rec-1' : key;
  const c = classifyServerFlags(local({ archived: ['REMOTE-1'] }), [alive('archived', 'REMOTE-1')], mapper);
  eq(c.missingLocally.length, 0, '로컬이 서버 표기로 갖고 있어도 중복 추가하지 않는다');
}
{
  // 표식도 같은 규칙 — 로컬 표기가 매핑본이어도 지워야 한다
  const mapper = (kind: StateFlagKind, key: string) =>
    kind === 'archived' && key === 'REMOTE-1' ? 'rec-1' : key;
  const c = classifyServerFlags(local({ archived: ['rec-1'] }), [dead('archived', 'REMOTE-1')], mapper);
  eq(localKeys(c.tombstonedLocally), ['archived:rec-1'], '표식도 역매핑된 로컬 키로 돌려준다');
}

// ─────────────────────────────────────────────
// 5) 경계·널 계열·중복
// ─────────────────────────────────────────────
{
  const c = classifyServerFlags(local({ archived: ['P-1'] }), []);
  eq([c.missingLocally.length, c.tombstonedLocally.length], [0, 0], '서버 응답 0행 → 아무것도 안 한다');
}
{
  // ⚠️ "서버 목록에 없다"는 제거 근거가 아니다 — 로컬에만 있는 항목은 결과에 나오지 않는다
  const c = classifyServerFlags(local({ muted: ['bob', 'carol'] }), [alive('muted', 'bob')]);
  eq(c.tombstonedLocally.length, 0, '서버 목록에 없는 로컬 항목(carol)은 제거 대상이 아니다');
}
{
  const c = classifyServerFlags(local({ muted: [] }), [
    { kind: 'muted', itemKey: 'bob', updatedAt: null, deletedAt: null },
  ]);
  eq(keys(c.missingLocally), ['muted:bob'], 'updatedAt=null이어도 판정에 영향 없다(기준선을 안 본다)');
}
{
  const c = classifyServerFlags(local({ muted: ['bob'] }), [
    { kind: 'muted', itemKey: 'bob', updatedAt: 1, deletedAt: 0 },
  ]);
  eq(c.tombstonedLocally.length, 0, 'deletedAt=0은 표식이 아니다(널 계열 구분)');
}
{
  const c = classifyServerFlags(local({ muted: ['bob'] }), [
    { kind: 'muted', itemKey: 'bob', updatedAt: 1, deletedAt: undefined },
  ]);
  eq(c.tombstonedLocally.length, 0, 'deletedAt=undefined도 표식이 아니다');
}
{
  const c = classifyServerFlags(local({}), [alive('archived', ''), alive('archived', 'P-1')]);
  eq(keys(c.missingLocally), ['archived:P-1'], '빈 itemKey 행은 건너뛴다');
}
{
  const c = classifyServerFlags(local({}), [
    { kind: 'unknownKind' as StateFlagKind, itemKey: 'x' },
    alive('muted', 'bob'),
  ]);
  eq(keys(c.missingLocally), ['muted:bob'], '모르는 kind는 무시한다(상위 호환)');
}
{
  // 중복 행 — 산 행과 죽은 행이 같이 오면 먼저 온 것만 본다(둘 다 처리하면 넣었다 뺐다 한다)
  const c = classifyServerFlags(local({ muted: ['bob'] }), [dead('muted', 'bob'), alive('muted', 'bob')]);
  eq(keys(c.tombstonedLocally), ['muted:bob'], '중복 행: 첫 행만 판정한다');
  eq(c.missingLocally.length, 0, '중복 행: 두 번째 행은 무시된다');
}
{
  // 입력 비변형
  const l = local({ muted: ['bob'] });
  const before = JSON.stringify(l);
  classifyServerFlags(l, [dead('muted', 'bob'), alive('archived', 'P-1')]);
  eq(JSON.stringify(l), before, 'classify는 입력을 변형하지 않는다');
}

// ─────────────────────────────────────────────
// 6) diffForPush — 정상 경로
// ─────────────────────────────────────────────
{
  const d = diffForPush(local({ muted: ['bob'] }), new Map());
  eq(keys(d.upserts), ['muted:bob'], '빈 지문 맵(세션 시작) → 전량 upsert(시드)');
  eq(d.tombstones.length, 0, '빈 지문 맵에서는 tombstone이 나올 수 없다(부팅 직후 방어)');
}
{
  const m = new Map([[flagMapKey('muted', 'bob'), '']]);
  const d = diffForPush(local({ muted: ['bob'] }), m);
  eq(d.upserts.length, 0, '이미 올린 그대로면 요청이 나가지 않는다');
  eq(d.tombstones.length, 0, '변화 없음 → tombstone도 없다');
}
{
  const m = new Map([[flagMapKey('muted', 'bob'), '']]);
  const d = diffForPush(local({ muted: [] }), m);
  eq(keys(d.tombstones), ['muted:bob'], '올린 적 있는데 지금 없다 → tombstone(음소거 해제)');
}
{
  const m = new Map([[flagMapKey('archived', 'P-1'), '']]);
  const d = diffForPush(local({ archived: [] }), m);
  eq(keys(d.tombstones), ['archived:P-1'], '보관 해제도 tombstone으로 전파된다');
}
{
  // 같은 키가 로컬 배열에 두 번 있어도 요청은 한 번만
  const s = emptyFlagState();
  s.muted = [{ key: 'bob' }, { key: 'bob' }];
  const d = diffForPush(s, new Map());
  eq(keys(d.upserts), ['muted:bob'], '로컬 중복 키는 한 번만 올린다');
}
{
  const s = emptyFlagState();
  s.muted = [{ key: '' }, { key: 'bob' }];
  const d = diffForPush(s, new Map());
  eq(keys(d.upserts), ['muted:bob'], '빈 키는 올리지 않는다');
}
{
  // 지문 맵에 이상한 키가 섞여도 tombstone으로 새지 않는다
  const m = new Map([['garbage', ''], [flagMapKey('muted', 'bob'), '']]);
  const d = diffForPush(local({}), m);
  eq(keys(d.tombstones), ['muted:bob'], '파싱 불가한 지문 키는 건너뛴다');
}

// ─────────────────────────────────────────────
// 7) add-only 규칙 (push 방향) — **트림이 삭제로 새면 안 된다**
// ─────────────────────────────────────────────
{
  // viewedSnapIds는 `.slice(-500)`으로 앞쪽이 밀려난다. 그건 사용자가 '안 봤다'로 되돌린 게 아니다.
  const m = new Map([
    [flagMapKey('viewedSnap', 'S-old'), ''],
    [flagMapKey('viewedSnap', 'S-new'), ''],
  ]);
  const d = diffForPush(local({ viewedSnap: ['S-new'] }), m);
  eq(d.tombstones.length, 0, '트림으로 사라진 viewedSnap에는 tombstone을 만들지 않는다');
  eq(d.upserts.length, 0, '남아 있는 항목도 지문이 같으면 다시 안 올린다');
}
{
  const m = new Map([[flagMapKey('reportedPost', 'P-9'), '']]);
  const d = diffForPush(local({}), m);
  eq(d.tombstones.length, 0, 'add-only(reportedPost)의 로컬 소실도 무시(신고 취소 경로가 없다)');
}
{
  const m = new Map([[flagMapKey('reportedComment', 'C-9'), '']]);
  const d = diffForPush(local({}), m);
  eq(d.tombstones.length, 0, 'add-only(reportedComment)의 로컬 소실도 무시');
}
{
  // 섞여 있을 때 removable만 골라낸다
  const m = new Map([
    [flagMapKey('viewedSnap', 'S-1'), ''],
    [flagMapKey('muted', 'bob'), ''],
    [flagMapKey('reportedPost', 'P-9'), ''],
    [flagMapKey('blocked', 'carol'), ''],
  ]);
  const d = diffForPush(local({}), m);
  eq(keys(d.tombstones).sort(), ['blocked:carol', 'muted:bob'], '혼합: removable kind만 tombstone');
}

// ─────────────────────────────────────────────
// 8) blocked 지문·키·본문
// ─────────────────────────────────────────────
{
  const b = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1', blockedAt: 111 };
  eq(blockedFlagKey(b), 'bob', 'blocked 신원 키: handle 우선');
  eq(blockedFlagKey({ name: '밥', blockedAt: 1 } as any), 'name:밥', 'handle 없으면 name: 접두사');
  eq(blockedFlagKey({} as any), '', '이름도 handle도 없으면 빈 키(호출부가 거른다)');
}
{
  // ⚠️ 지문에 blockedAt이 들어가면 상대 기기 값이 로컬에 심긴 순간 '변경됨'으로 잡혀
  //    무한 재업로드가 된다. 그래서 뺐다.
  const a = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1', blockedAt: 111 };
  const b = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1', blockedAt: 999 };
  eq(blockedFlagSig(a) === blockedFlagSig(b), true, 'blockedAt만 달라도 지문은 같다(무한 재업로드 방지)');
}
{
  const a = { name: '밥', emoji: '🐧', handle: 'bob', id: '' };
  const b = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1' };
  eq(blockedFlagSig(a) === blockedFlagSig(b), false, 'uuid 백필은 지문을 바꾼다(상대 기기에도 가야 한다)');
}
{
  const a = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1' };
  const b = { name: '밥', emoji: '🐼', handle: 'bob', id: 'uuid-1' };
  eq(blockedFlagSig(a) === blockedFlagSig(b), false, '표시 이모지가 바뀌면 지문도 바뀐다');
}
{
  // jsonb는 키 순서를 재정렬해서 돌려준다 — 서버에서 받은 값도 같은 빌더를 통과시켜야 지문이 맞는다
  const fromServer = { blockedAt: 111, id: 'uuid-1', handle: 'bob', emoji: '🐧', name: '밥' };
  const local1 = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1', blockedAt: 111 };
  eq(
    JSON.stringify(blockedFlagData(fromServer)) === JSON.stringify(blockedFlagData(local1)),
    true,
    'jsonb 키 순서가 뒤바뀐 서버 값도 같은 본문으로 정규화된다',
  );
  eq(blockedFlagSig(fromServer) === blockedFlagSig(local1), true, '서버 값에서 만든 지문도 같다');
}
{
  eq(
    blockedFlagData({ name: undefined, emoji: null, handle: 'bob', id: undefined, blockedAt: '나쁜값' }),
    { name: '', emoji: '', handle: 'bob', id: '', blockedAt: 0 },
    '널·타입 이상 필드는 안전한 기본값으로 떨어진다',
  );
}
{
  // 지문이 다르면 upsert 대상이 된다(= 차단 메타 갱신이 전파된다)
  const s = emptyFlagState();
  s.blocked = [{ key: 'bob', sig: 'NEW' }];
  const d = diffForPush(s, new Map([[flagMapKey('blocked', 'bob'), 'OLD']]));
  eq(keys(d.upserts), ['blocked:bob'], '지문이 바뀐 blocked는 다시 올린다');
  eq(d.tombstones.length, 0, '지문만 바뀐 것은 tombstone이 아니다');
}

// ─────────────────────────────────────────────
// 9) 지문 맵 키 왕복
// ─────────────────────────────────────────────
eq(parseFlagMapKey(flagMapKey('muted', 'bob')), { kind: 'muted', itemKey: 'bob' }, '지문 키 왕복: 단순');
eq(
  parseFlagMapKey(flagMapKey('blocked', 'name:홍 길동')),
  { kind: 'blocked', itemKey: 'name:홍 길동' },
  '지문 키 왕복: 항목 키에 공백이 있어도 첫 구분자에서만 자른다',
);
eq(
  parseFlagMapKey(flagMapKey('blocked', 'name:a|b')),
  { kind: 'blocked', itemKey: 'name:a|b' },
  '지문 키 왕복: 항목 키에 구분자가 들어가도 안전하다',
);
eq(parseFlagMapKey('muted'), null, '구분자 없는 지문 키는 null');
eq(parseFlagMapKey('|bob'), null, '구분자가 맨 앞이면 null');
eq(parseFlagMapKey('nope|bob'), null, '모르는 kind면 null');

// ─────────────────────────────────────────────
// 10) 반증 케이스 — 틀린 구현이었다면 반드시 깨지는 값들
// ─────────────────────────────────────────────
{
  // A. "로컬에서 사라졌으면 무조건 tombstone" 구현이면 트림된 viewedSnap이 여기 들어온다
  const m = new Map([[flagMapKey('viewedSnap', 'S-trimmed'), '']]);
  const d = diffForPush(local({}), m);
  eq(d.tombstones.length, 0, '[반증 A] 트림이 tombstone을 만드는 구현이면 1이 되어 깨진다');
}
{
  // B. "서버 표식이면 무조건 로컬에서 뺀다" 구현이면 add-only 항목이 여기 들어온다
  const c = classifyServerFlags(local({ viewedSnap: ['S-1'] }), [dead('viewedSnap', 'S-1')]);
  eq(c.tombstonedLocally.length, 0, '[반증 B] add-only 표식을 적용하는 구현이면 1이 되어 깨진다');
}
{
  // C. "매핑 안 되면 버린다" 구현이면 missingLocally가 비어 깨진다
  const c = classifyServerFlags(local({}), [alive('archived', 'REMOTE-X')], (_k, key) => key);
  eq(c.missingLocally.length, 1, '[반증 C] 매핑 실패분을 버리는 구현이면 0이 되어 깨진다');
}
{
  // D. "서버 목록에 없음 = 삭제" 구현이면 로컬 전용 항목이 tombstonedLocally에 들어온다
  const c = classifyServerFlags(local({ muted: ['only-local'] }), [alive('muted', 'other')]);
  eq(c.tombstonedLocally.length, 0, '[반증 D] 부재를 삭제로 읽는 구현이면 1이 되어 깨진다');
}
{
  // E. "표식도 일단 받아온다" 구현이면 꺼진 항목이 missingLocally로 되살아난다
  const c = classifyServerFlags(local({}), [dead('muted', 'bob')]);
  eq(c.missingLocally.length, 0, '[반증 E] 표식을 missing으로 넣는 구현이면 1이 되어 깨진다');
}
{
  // F. 지문에 blockedAt을 넣은 구현이면 같은 사람이 매번 다시 올라간다
  const s = emptyFlagState();
  const b = { name: '밥', emoji: '🐧', handle: 'bob', id: 'uuid-1', blockedAt: 999 };
  s.blocked = [{ key: blockedFlagKey(b), sig: blockedFlagSig(b) }];
  // 지난 push 때는 blockedAt이 111이었다(상대 기기 값을 받기 전)
  const older = { ...b, blockedAt: 111 };
  const m = new Map([[flagMapKey('blocked', 'bob'), blockedFlagSig(older)]]);
  const d = diffForPush(s, m);
  eq(d.upserts.length, 0, '[반증 F] 지문에 blockedAt을 넣은 구현이면 1이 되어 무한 재업로드가 된다');
}

// ─────────────────────────────────────────────
// 11) revive — "명시적 재추가"만 꺼진 행을 되살린다 (2026-09-10 QA H1 수정)
// ─────────────────────────────────────────────
const mk = flagMapKey;
{
  // 세션 시작(빈 지문 맵) = 전량 시드. explicitAdds가 비어 있으므로 **하나도 revive되지 않는다.**
  const d = diffForPush(local({ blocked: ['bob'], muted: ['carol'], viewedSnap: ['S-1'] }), new Map());
  eq(d.upserts.map((u) => u.revive), [false, false, false], '시드 upsert는 revive 자격이 없다');
}
{
  const d = diffForPush(local({ blocked: ['bob'] }), new Map(), new Set([mk('blocked', 'bob')]));
  eq(d.upserts.map((u) => u.revive), [true], '명시적 재추가(차단)는 revive한다');
}
{
  // 같은 회차에 시드분과 재추가분이 섞여 있으면 **재추가분만** revive다
  const d = diffForPush(
    local({ blocked: ['bob'], muted: ['carol'] }),
    new Map(),
    new Set([mk('muted', 'carol')]),
  );
  eq(
    d.upserts.map((u) => `${u.kind}:${u.itemKey}=${u.revive}`),
    ['muted:carol=true', 'blocked:bob=false'],
    '혼합 회차: 명시적 재추가만 revive, 나머지 시드는 아니다',
  );
}
{
  // add-only kind도 revive 대상이 될 수 있다 — 데이터 초기화(clearStateFlags)는 그 행에도
  // 표식을 찍으므로, 초기화 뒤 같은 스냅을 다시 보면 되살려야 한다
  const d = diffForPush(local({ viewedSnap: ['S-1'] }), new Map(), new Set([mk('viewedSnap', 'S-1')]));
  eq(d.upserts.map((u) => u.revive), [true], 'add-only도 명시적 재추가면 revive한다(초기화 이후 경로)');
}
{
  // 지문이 같아 upsert 자체가 안 나가면 revive도 없다(요청 0회 유지)
  const d = diffForPush(local({ muted: ['bob'] }), new Map([[mk('muted', 'bob'), '']]), new Set([mk('muted', 'bob')]));
  eq(d.upserts.length, 0, '이미 올린 그대로면 explicitAdds가 있어도 요청이 안 나간다');
}
{
  // explicitAdds에 있는 키가 로컬에서 사라졌다면 그건 tombstone이다(revive가 끄기를 막지 않는다)
  const d = diffForPush(local({}), new Map([[mk('muted', 'bob'), '']]), new Set([mk('muted', 'bob')]));
  eq(keys(d.tombstones), ['muted:bob'], 'explicitAdds가 있어도 로컬에 없으면 tombstone이 나간다');
  eq(d.upserts.length, 0, '그 회차에 upsert는 없다');
}

// ─────────────────────────────────────────────
// 12) mergeViewedSnap — 500칸 창이 회전하지 않고 수렴하는가 (2026-09-10 QA M2 수정)
// ─────────────────────────────────────────────
{
  eq(mergeViewedSnap(['a'], []), ['a'], '받을 게 없으면 그대로');
  eq(mergeViewedSnap(['a'], ['a']), ['a'], '이미 있는 것만 오면 그대로');
  eq(mergeViewedSnap(['a'], ['b', 'c']), ['a', 'b', 'c'], '빈 칸이 넉넉하면 전부 뒤에 붙는다');
  eq(mergeViewedSnap(['a'], ['b', 'b']), ['a', 'b'], 'incoming 자체의 중복도 거른다');
  eq(mergeViewedSnap([], ['x']), ['x'], '로컬이 비어 있어도 동작한다');
}
{
  const prev = ['a'];
  const out = mergeViewedSnap(prev, ['a']);
  eq(out === prev, true, '바뀐 게 없으면 참조 그대로 돌려준다(헛 리렌더·헛 저장 방지)');
}
{
  // 빈 칸이 모자라면 **뒤쪽(최신)부터** 채운다 — incoming은 오래된 것 → 최신 순이다
  eq(mergeViewedSnap(['a', 'b'], ['x', 'y', 'z'], 4), ['a', 'b', 'y', 'z'], '빈 칸 2개면 최신 2개만 받는다');
}
{
  // ★ 핵심: 로컬이 가득 차면 **아무것도 받지 않는다** = 회전이 멈춘다
  eq(mergeViewedSnap(['a', 'b', 'c'], ['x', 'y'], 3), ['a', 'b', 'c'], '가득 차면 서버의 옛 항목이 최신을 못 밀어낸다');
}
{
  // 수렴 확인 — 같은 서버 응답을 두 번 병합해도 결과가 같다(pull이 반복돼도 상태가 안 흔들린다)
  const first = mergeViewedSnap(['a', 'b'], ['x', 'y', 'z'], 4);
  const second = mergeViewedSnap(first, ['x', 'y', 'z'], 4);
  eq(second === first, true, '두 번째 pull은 아무것도 바꾸지 않는다(수렴)');
}
{
  // legacy blob 복원 등으로 prev가 상한을 넘겨 들어와도 **로컬을 자르지 않는다**
  eq(mergeViewedSnap(['a', 'b', 'c'], ['x'], 2), ['a', 'b', 'c'], '상한 초과 prev를 잘라 버리지 않는다');
}

// ─────────────────────────────────────────────
// 13) 2차 반증 케이스
// ─────────────────────────────────────────────
{
  // G. 모든 upsert에 deleted_at:null을 싣는 구현(= revive 무조건)이면 시드가 남의 끄기를 되살린다
  const d = diffForPush(local({ blocked: ['bob'] }), new Map());
  eq(d.upserts[0].revive, false, '[반증 G] 무조건 revive 구현이면 true가 되어 시드가 남의 끄기를 되살린다');
}
{
  // H. revive를 아예 안 하는 구현(1차 코드)이면 재차단이 영영 서버에 반영되지 않는다
  const d = diffForPush(local({ blocked: ['bob'] }), new Map(), new Set([mk('blocked', 'bob')]));
  eq(d.upserts[0].revive, true, '[반증 H] revive 없는 구현이면 false가 되어 재차단이 영구히 풀린다');
}
{
  // I. "받은 뒤 slice(-500)" 구현이면 로컬 최신이 밀려나 창이 회전한다
  const out = mergeViewedSnap(['a', 'b', 'c'], ['x', 'y'], 3);
  eq(out, ['a', 'b', 'c'], '[반증 I] 자르는 구현이면 ["c","x","y"]가 되어 매 pull마다 회전한다');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
