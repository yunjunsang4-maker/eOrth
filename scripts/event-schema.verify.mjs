// schema.sql의 이벤트 테이블 정의 검증 — SQL을 서버에서 실행하기 전에 '빠뜨린 문장'을 잡는다.
// 특히 grant/revoke는 빠져도 RLS 정책이 있어 겉보기엔 멀쩡해 보이므로 눈으로는 놓치기 쉽다.
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/schema.sql', 'utf8');
let fail = 0;
const has = (re, msg) => {
  const ok = re.test(sql);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};
const assert = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('event_participants 스키마');
has(/create table if not exists public\.event_participants/i, '테이블 생성');
has(/gender\s+text\s+not null\s+check \(gender in \('m','f'\)\)/i, 'gender 제약');
has(/gender_pref\s+text\s+not null\s+check \(gender_pref in \('same','any','opposite'\)\)/i, 'gender_pref 제약');
// 표가 이미 서버에 있으면 create table if not exists 는 제약을 갱신하지 않는다 →
// 선택지를 늘릴 때 alter 를 같이 넣지 않으면 '이성만' 제출만 전부 거부된다.
has(
  /alter table public\.event_participants\s+drop constraint if exists event_participants_gender_pref_check;/i,
  'gender_pref 제약 재적용: 기존 제약 drop',
);
has(
  /add constraint event_participants_gender_pref_check\s+check \(gender_pref in \('same','any','opposite'\)\)/i,
  'gender_pref 제약 재적용: 새 제약 add (기존 표에도 적용된다)',
);
// 자기소개(intro)도 같은 함정을 밟는다 — create table if not exists 는 이미 있는 표에 컬럼을
// 추가하지 않는다. alter 를 빠뜨린 채 event.html을 게시하면 **자기소개 입력 여부와 무관하게
// 참가자 전원이 100% 제출에 실패한다**(400 PGRST204, 없는 컬럼 POST). 비운 사람도 막히는 이유는
// payload 가 값만 null 일 뿐 intro 키를 항상 포함하고, PostgREST 가 body 의 키 집합으로
// INSERT 컬럼 목록을 만들기 때문이다 — 그래서 이 검사가 부스 전면 중단을 막는 마지막 방어선이다.
has(
  /alter table public\.event_participants\s+add column if not exists intro text;/i,
  'intro 컬럼 추가 alter (기존 표에도 적용된다)',
);
has(
  /\(intro is null or char_length\(intro\) between 1 and 80\)/i,
  'INSERT 정책의 intro 길이 제약 (null 허용 · 최대 80자)',
);
// 다음 날 자동 참여(carry_next_day)도 같은 alter 함정을 밟는다. intro 와 다른 점은
// **not null default false** 라서 아직 이 키를 안 보내는 옛 페이지는 안 깨진다는 것 —
// 그래도 **새 event.html 을 게시하기 전에는 이 alter 가 반드시 끝나 있어야 한다**
// (새 페이지는 carry_next_day 키를 항상 보내므로, 컬럼이 없으면 전원이 400 PGRST204).
// default 를 빠뜨리면 not null 컬럼에 값이 안 들어와 옛 페이지 제출이 전부 거부되므로
// default 까지 함께 본다.
has(
  /alter table public\.event_participants\s+add column if not exists carry_next_day boolean not null default false;/i,
  'carry_next_day 컬럼 추가 alter (not null default false — 옛 페이지도 안전)',
);
has(
  /carry_next_day boolean not null default false,/i,
  'create table 정의에도 carry_next_day 가 있다 (새 프로젝트에서 alter 없이도 생성된다)',
);
has(/instagram\s+text\s+not null/i, 'instagram 컬럼');
has(/create unique index if not exists event_participants_uniq/i, '중복 제출 방지 유니크 인덱스');
has(/alter table public\.event_participants enable row level security/i, 'RLS 활성화');
has(/revoke all on public\.event_participants from anon, authenticated/i, '기본 권한 회수');
has(/grant insert on public\.event_participants to anon/i, 'anon INSERT 권한');
has(/create policy event_participants_insert/i, 'INSERT 정책');
has(/consent_pii and consent_share/i, '동의 없는 행 차단');
has(/instagram ~ '\^\[a-z0-9\._\]\{1,30\}\$'/i, '아이디 형식 제약');

// --- 화이트리스트 검사: SELECT가 어디로도 열리지 않는지 ---
// "for select"를 찾는 정규식은 `for all`(SELECT 포함)이나 FOR절 생략(Postgres 기본값이 ALL)을
// 못 잡는다. 그래서 event_participants를 대상으로 하는 정책 문장을 전부 뽑아 화이트리스트로 검사한다.
// [^;]*로 세미콜론을 건너뛰지 않게 해 문장 경계를 넘어 다른 grant/policy와 섞이지 않게 한다.
const policyStatements = [
  ...sql.matchAll(/create\s+policy\s+\S+\s+on\s+public\.event_participants\b[^;]*;/gi),
].map((m) => m[0]);
assert(policyStatements.length === 1, `event_participants 정책은 정확히 1개 (발견 ${policyStatements.length}개)`);
assert(
  policyStatements.length === 1 && /\bfor\s+insert\b/i.test(policyStatements[0]),
  '그 하나뿐인 정책은 FOR INSERT (FOR ALL·FOR 생략은 SELECT까지 연다)'
);

// grant류 화이트리스트 — event_participants 대상 grant 문장 중
// 'grant insert on public.event_participants to anon' 이외의 것이 하나라도 있으면
// select/update/delete/all 권한이 새는 것이다.
const grantStatements = [
  ...sql.matchAll(/grant\s+[^;]*?\bon\s+public\.event_participants\b[^;]*;/gi),
].map((m) => m[0].replace(/\s+/g, ' ').trim().toLowerCase());
const allowedGrant = 'grant insert on public.event_participants to anon;';
const badGrants = grantStatements.filter((g) => g !== allowedGrant);
assert(
  badGrants.length === 0,
  `허용 목록(anon INSERT) 밖의 grant 없음${badGrants.length ? ` — 발견: ${JSON.stringify(badGrants)}` : ''}`
);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
