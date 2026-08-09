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
has(/gender_pref\s+text\s+not null\s+check \(gender_pref in \('same','any'\)\)/i, 'gender_pref 제약');
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
