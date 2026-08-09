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
const hasNot = (re, msg) => {
  const ok = !re.test(sql);
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
// SELECT 정책이 생기면 anon 키로 참가자 전원의 연락처를 긁어갈 수 있다
hasNot(/create policy [^;]*event_participants[^;]*for select/i, 'SELECT 정책 없음');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
