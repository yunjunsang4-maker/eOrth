/**
 * mentions 검증 — node node_modules/tsx/dist/cli.mjs src/utils/mentions.verify.ts
 *
 * 이 규칙은 서버 트리거(notify_on_mention)의 정규식과 짝이다. 여기가 깨지면
 * "보라색으로 보이는데 알림은 안 오는" 어긋남이 생기므로 경계 케이스를 촘촘히 둔다.
 */
import {
  splitMentions, extractMentionHandles, findActiveMention,
  applyMention, filterMentionCandidates, buildReplyPrefix, ensureReplyPrefix,
} from './mentions';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n  want=${JSON.stringify(want)}\n  got =${JSON.stringify(got)}`}`);
};

// ── 토큰 인정/거부 경계 ──────────────────────────────────────────────
// 4자 미만은 아이디가 될 수 없다(HANDLE_RE {4,30}) — 흔한 감탄사 `@ㅋㅋ`류 오탐 방지
eq('3자는 토큰 아님', extractMentionHandles('@abc 안녕'), []);
eq('4자는 토큰', extractMentionHandles('@abcd 안녕'), ['abcd']);

// 이메일 오탐 — `@` 앞이 아이디 문자면 언급이 아니다. 이게 없으면 남의 주소를 적기만 해도
// 엉뚱한 사람에게 알림이 간다.
eq('이메일 안의 @는 토큰 아님', extractMentionHandles('a@bcde 로 보내줘'), []);
eq('이메일 전체도 토큰 아님', extractMentionHandles('yunjun@gmail.com'), []);

// 앞뒤 경계 — 문장 처음/중간/구두점 앞
eq('문장 처음', extractMentionHandles('@user_1 hi'), ['user_1']);
eq('문장 중간', extractMentionHandles('hi @user_1'), ['user_1']);
eq('쉼표 앞', extractMentionHandles('@user_1, 고마워'), ['user_1']);
eq('한글 바로 뒤에 붙어도 인정', extractMentionHandles('고마워@user_1'), ['user_1']);
eq('아이디 문자가 이어지면 거부(31자)',
  extractMentionHandles('@' + 'a'.repeat(31)), []);
eq('정확히 30자는 인정',
  extractMentionHandles('@' + 'a'.repeat(30)), ['a'.repeat(30)]);

// 대소문자 정규화·중복 제거 — 서버 아이디 유일성이 lower(handle) 기준이다
eq('대소문자 정규화·중복 제거·등장 순',
  extractMentionHandles('@Alice @bobby 님 @alice 다시'), ['alice', 'bobby']);

// 널 계열 — '' / undefined 를 뭉뚱그리지 않는다
eq('빈 문자열', extractMentionHandles(''), []);
eq('undefined 방어', extractMentionHandles(undefined as unknown as string), []);

// ── splitMentions ────────────────────────────────────────────────────
eq('세그먼트 분해',
  splitMentions('hi @user_1, 반가워'),
  [
    { type: 'text', value: 'hi ' },
    { type: 'mention', value: '@user_1', handle: 'user_1' },
    { type: 'text', value: ', 반가워' },
  ]);
eq('언급 없으면 텍스트 1개', splitMentions('그냥 댓글'), [{ type: 'text', value: '그냥 댓글' }]);
eq('빈 문자열은 빈 배열', splitMentions(''), []);
eq('연속 언급 사이 공백 보존',
  splitMentions('@abcd @efgh'),
  [
    { type: 'mention', value: '@abcd', handle: 'abcd' },
    { type: 'text', value: ' ' },
    { type: 'mention', value: '@efgh', handle: 'efgh' },
  ]);
// value 를 이으면 원문과 같아야 한다 — 렌더에서 글자가 사라지지 않는 불변식
eq('세그먼트 이으면 원문 복원',
  splitMentions('a@bcde @abcd 끝').map((s) => s.value).join(''), 'a@bcde @abcd 끝');
// 원문 대소문자는 그대로 보이고, handle 만 원문 표기를 유지한다(정규화는 extract 담당)
eq('mention value 는 원문 표기 유지',
  splitMentions('@Alice').map((s) => s.value), ['@Alice']);

// ── findActiveMention ────────────────────────────────────────────────
eq('커서가 토큰 끝', findActiveMention('hi @use', 7), { start: 3, end: 7, query: 'use' });
eq('@만 친 순간(검색어 0자)', findActiveMention('hi @', 4), { start: 3, end: 4, query: '' });
eq('커서가 토큰 중간이면 커서까지가 검색어',
  findActiveMention('hi @useful 뒤', 7), { start: 3, end: 7, query: 'use' });
eq('공백 뒤 커서면 null', findActiveMention('hi @user ', 9), null);
eq('@ 없는 곳이면 null', findActiveMention('그냥 댓글', 5), null);
eq('이메일 중간이면 null', findActiveMention('a@bcde', 6), null);
eq('빈 문자열이면 null', findActiveMention('', 0), null);
eq('커서 0이면 null', findActiveMention('@abcd', 0), null);
eq('31자 넘게 이어지면 null', findActiveMention('@' + 'a'.repeat(31), 32), null);

// ── applyMention ─────────────────────────────────────────────────────
eq('범위를 @아이디+공백으로 교체',
  applyMention('hi @use', { start: 3, end: 7 }, 'user_1'),
  { text: 'hi @user_1 ', cursor: 11 });
eq('뒤 텍스트 보존·커서는 삽입 직후',
  applyMention('hi @use 끝', { start: 3, end: 7 }, 'bob_1'),
  { text: 'hi @bob_1  끝', cursor: 10 });

// ── filterMentionCandidates ──────────────────────────────────────────
const cands = [
  { handle: 'alice' }, { handle: 'Alicia' }, { handle: 'bob_1' }, { handle: 'ALICE' },
];
eq('접두 일치(대소문자 무시)',
  filterMentionCandidates(cands, 'ali').map((c) => c.handle), ['alice', 'Alicia']);
eq('중복 아이디는 첫 등장만',
  filterMentionCandidates(cands, '').map((c) => c.handle), ['alice', 'Alicia', 'bob_1']);
eq('exclude(내 아이디) 제외 — 대소문자 무시',
  filterMentionCandidates(cands, '', { exclude: 'ALICE' }).map((c) => c.handle), ['Alicia', 'bob_1']);
eq('limit 상한',
  filterMentionCandidates(cands, '', { limit: 2 }).map((c) => c.handle), ['alice', 'Alicia']);
eq('일치 없으면 빈 배열', filterMentionCandidates(cands, 'zzz'), []);
eq('후보 0개', filterMentionCandidates([], 'a'), []);
eq('기본 상한 8 — 10명 중 8명',
  filterMentionCandidates(
    Array.from({ length: 10 }, (_, i) => ({ handle: `user${i}` })), '',
  ).length, 8);

// 아이디 형식 검사 — 후보의 handle 자리에는 폴백 표시명이 섞여 들어온다
// (`social.ts` `p.handle || '여행자'`, `recordStore` `handle || '나'`, 메이트 `p.handle || p.id`).
// 이런 값이 칩으로 뜨면 탭했을 때 `@여행자 ` 처럼 규칙을 못 지키는 죽은 토큰이 본문에 박힌다.
const junk = [
  { handle: '여행자' },      // 한글 표시명 폴백
  { handle: '나' },          // 내 로컬 댓글 폴백
  { handle: '4f3c2b1a-9d8e-4c7b-8a6f-5e4d3c2b1a09' }, // uuid 폴백(하이픈·36자)
  { handle: 'abc' },         // 3자 — 아이디 하한 미만
  { handle: 'a'.repeat(31) },// 31자 — 아이디 상한 초과
  { handle: 'bob.kim' },     // 허용 문자 아님(`.`)
  { handle: 'good_1' },      // 유일하게 유효
];
eq('한글 표시명 후보 제외', filterMentionCandidates(junk, '').map((c) => c.handle), ['good_1']);
eq('uuid 후보 제외', filterMentionCandidates([{ handle: '4f3c2b1a-9d8e-4c7b-8a6f-5e4d3c2b1a09' }], ''), []);
eq('빈 검색어여도 형식 미달은 안 뜬다', filterMentionCandidates([{ handle: '여행자' }, { handle: '나' }], ''), []);
eq('경계 4자는 통과', filterMentionCandidates([{ handle: 'abcd' }], '').map((c) => c.handle), ['abcd']);
eq('경계 30자는 통과', filterMentionCandidates([{ handle: 'a'.repeat(30) }], '').length, 1);
// 형식 검사가 접두 일치보다 먼저 걸러져야 한다 — `@나`를 치던 중에도 칩이 뜨면 안 된다
eq('접두가 맞아도 형식 미달이면 제외', filterMentionCandidates([{ handle: '나그네' }], '나'), []);

// ── 답글 접두사 ───────────────────────────────────────────────────────
eq('접두사 형식', buildReplyPrefix('bob_1'), '@bob_1 ');
eq('없으면 붙인다', ensureReplyPrefix('고마워', 'bob_1'), '@bob_1 고마워');
eq('이미 있으면 그대로(대소문자 무시)', ensureReplyPrefix('@Bob_1 고마워', 'bob_1'), '@Bob_1 고마워');
// 경계 확인 — `@username…` 을 `@user` 가 이미 있다고 오판하면 엉뚱한 사람에게 답글이 간다
eq('더 긴 아이디로 시작하면 붙인다', ensureReplyPrefix('@username 님', 'user'), '@user @username 님');
eq('빈 본문', ensureReplyPrefix('', 'bob_1'), '@bob_1 ');

console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAILED`);
if (fail > 0) process.exit(1);
