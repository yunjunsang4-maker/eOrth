// 뽑기 서버 스키마 검증 — SQL을 서버에서 실행하기 전에 '빠뜨린 문장'을 잡는다.
//
// 이 표들은 event_participants와 사정이 다르다. anon 키가 정적 페이지에 박혀 있는데
// draw_config에는 **토큰이 평문으로** 들어 있어서, SELECT가 한 줄만 열려도 잠금이 통째로
// 무너진다. 그리고 grant/revoke는 빠져도 겉보기엔 멀쩡해서 눈으로는 절대 못 잡는다.
//
// 여기서 지키는 것 넷:
//   1. 테이블 직접 접근이 아무에게도 열려 있지 않다
//   2. 함수 EXECUTE가 public 롤에서 회수돼 있다 (Postgres 기본값이 '전체 허용'이다)
//   3. 예약(lease)에 1등·2등이 절대 섞이지 않는다
//   4. 서버 추출 알고리즘이 draw-core.js와 같다
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/schema.sql', 'utf8');
const core = readFileSync('docs/draw-core.js', 'utf8');

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fail++;
};
const has = (re, msg) => ok(re.test(sql), msg);

// 뽑기 절만 잘라서 본다 — 파일 전체를 훑으면 다른 기능의 grant/revoke가 섞여 통과한다
const start = sql.indexOf('부스 뽑기 서버 재고');
const draw = start >= 0 ? sql.slice(start) : '';
const inDraw = (re, msg) => ok(re.test(draw), msg);

console.log('뽑기 서버 스키마');
ok(start >= 0, '뽑기 절이 schema.sql에 있다');

console.log('\n1. 테이블·인덱스');
has(/create table if not exists public\.draw_stock/i, 'draw_stock 생성');
has(/create table if not exists public\.draw_lease_hold/i, 'draw_lease_hold 생성');
has(/create table if not exists public\.draw_log/i, 'draw_log 생성');
has(/create table if not exists public\.draw_config/i, 'draw_config 생성');
// 이 인덱스가 멱등성의 전부다. 없으면 응답이 느려 스태프가 한 번 더 누를 때
// 재고가 두 번 빠지고 참가자는 한 장만 받는다.
has(
  /create unique index if not exists draw_log_client_uniq\s+on public\.draw_log \(client_id\)/i,
  'draw_log.client_id 유니크 인덱스 (재시도 멱등성의 근거)',
);

console.log('\n2. 권한 — 테이블은 아무에게도 열지 않는다');
for (const t of ['draw_stock', 'draw_lease_hold', 'draw_log', 'draw_config']) {
  // \s+ — SQL 쪽이 정렬용 공백을 여러 칸 넣어 두었다. 한 칸으로 고정하면 조용히 못 잡는다.
  has(new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i'), `${t} RLS 활성화`);
  has(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`, 'i'), `${t} 기본 권한 회수`);
}
// draw_config에는 토큰이 평문으로 있다. 여기에 정책이나 grant가 생기면 잠금이 무의미해진다.
ok(!/create policy\s+\S+\s+on public\.draw_(stock|lease_hold|log|config)/i.test(draw),
   '뽑기 표에 RLS 정책이 하나도 없다 (RLS 켜짐 + 정책 없음 = 전부 거부)');
ok(!/grant\s+(select|insert|update|delete|all)[^;]*on public\.draw_/i.test(draw),
   '뽑기 표에 테이블 grant가 하나도 없다');

console.log('\n3. 권한 — 함수 EXECUTE');
// Postgres는 새 함수의 EXECUTE를 public 롤에 자동으로 준다.
// revoke를 빠뜨리면 grant를 아무리 좁게 잡아도 누구나 실행할 수 있다.
const granted = [...draw.matchAll(/grant execute on function public\.(\w+)\(/gi)].map((m) => m[1]);
const revoked = [...draw.matchAll(/revoke execute on function public\.(\w+)\(/gi)].map((m) => m[1]);
const defined = [...draw.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);

ok(defined.length > 0, `함수 정의 ${defined.length}개`);
for (const fn of defined) {
  ok(revoked.includes(fn), `${fn}: public 롤에서 EXECUTE 회수됨`);
}
for (const fn of granted) {
  const r = draw.match(new RegExp(`revoke execute on function public\\.${fn}\\([^;]*from public`, 'i'));
  ok(!!r, `${fn}: grant 전에 public 회수가 있다`);
}
// 내부 헬퍼는 anon에게 열리면 안 된다. security definer 안에서는 호출자 권한과
// 무관하게 실행되므로 열 이유가 없고, 열면 토큰 검사를 우회해 추첨을 돌려볼 수 있다.
for (const fn of ['_draw_auth', '_draw_pick']) {
  ok(!granted.includes(fn), `${fn}: anon에게 EXECUTE를 주지 않는다 (내부 전용)`);
}

console.log('\n4. security definer 위생');
// 함수마다 헤더(선언부 ~ 본문 시작 $)를 따로 잘라서 본다.
// 줄바꿈으로 세면 안 된다 — 이 파일에는 한 줄로 붙여 쓴 헤더와 여러 줄로 편 헤더가 섞여 있고,
// 줄 기준으로 세는 검사는 그걸 놓치면서도 숫자가 그럴듯해 통과처럼 보인다.
const headers = new Map();
for (const m of draw.matchAll(/create or replace function public\.(\w+)\(/gi)) {
  const from = m.index;
  const bodyAt = draw.indexOf('$', draw.indexOf(')', from));   // 본문 여는 달러 인용
  headers.set(m[1], draw.slice(from, bodyAt));
}
ok(headers.size === defined.length, `함수 헤더 ${headers.size}개 파싱`);

for (const [fn, head] of headers) {
  // search_path를 고정하지 않은 security definer 함수는 검색 경로 조작에 노출된다.
  ok(/set search_path = public/i.test(head), `${fn}: search_path 고정`);
}
// anon이 부를 수 있는 함수는 반드시 definer여야 한다 — 아니면 테이블 권한이 없어
// 무조건 실패하고, 그 실패가 부스에서 "왜인지 발권이 안 됨"으로만 보인다.
for (const fn of granted) {
  ok(/security definer/i.test(headers.get(fn) || ''), `${fn}: security definer (anon 노출 함수)`);
}
ok(/security definer/i.test(headers.get('_draw_auth') || ''), '_draw_auth: security definer');

console.log('\n5. 원자성 — 1등 중복을 막는 지점');
// for update 없이 읽고 쓰면 두 아이패드가 같은 순간에 눌렀을 때 둘 다 1등을 가져간다.
const pull = draw.slice(draw.indexOf('function public.draw_pull'), draw.indexOf('function public.draw_lease('));
ok(/select remaining into v_rem\s+from public\.draw_stock where day = v_day for update/i.test(pull),
   'draw_pull이 재고 행을 for update로 잠근다');
ok(/select grade into v_prev from public\.draw_log where client_id = p_client_id/i.test(pull),
   'draw_pull이 같은 client_id를 재생(replay)한다');

console.log('\n6. 예약(lease)에 1등·2등이 섞이지 않는다');
// 예약분은 오프라인에서 기기가 혼자 뽑는다. 쪼갤 수 없는 상품이 섞이면
// 서버가 막아주던 중복 당첨이 그대로 되살아난다.
const lease = draw.slice(draw.indexOf('function public.draw_lease('), draw.indexOf('function public.draw_lease_commit'));
ok(/\(v_rem - 'g1'\) - 'g2'/.test(lease), "draw_lease가 추출 풀에서 g1·g2를 뺀다");
const commit = draw.slice(draw.indexOf('function public.draw_lease_commit'), draw.indexOf('function public.draw_lease_return'));
ok(/not in \('g3','g4','g5','miss'\)/.test(commit),
   'draw_lease_commit이 g1·g2 정산을 거부한다');
const ret = draw.slice(draw.indexOf('function public.draw_lease_return'), draw.indexOf('function public.draw_state'));
ok(/array\['g3','g4','g5','miss'\]/.test(ret), 'draw_lease_return이 예약 등급만 반납한다');

console.log('\n7. 추출 알고리즘이 draw-core.js와 같다');
// 어긋나면 온라인 발권과 오프라인 예약분 발권의 확률이 달라지는데,
// 증상이 "어쩐지 3등이 많이 나온다" 정도라 부스에서는 절대 못 잡는다.
const coreKeys = core.match(/export const GRADE_KEYS = \[([^\]]+)\]/);
ok(!!coreKeys, 'draw-core.js에서 GRADE_KEYS를 읽었다');
const coreOrder = coreKeys ? coreKeys[1].replace(/['\s]/g, '') : '';
const sqlPick = draw.slice(draw.indexOf('function public._draw_pick'), draw.indexOf('function public.draw_pull'));
const sqlKeys = sqlPick.match(/keys text\[\] := array\[([^\]]+)\]/);
ok(!!sqlKeys, '_draw_pick에서 키 배열을 읽었다');
const sqlOrder = sqlKeys ? sqlKeys[1].replace(/['\s]/g, '') : '';
ok(coreOrder === sqlOrder && coreOrder.length > 0,
   `키 순서 일치 — core=[${coreOrder}] sql=[${sqlOrder}]`);
// JS: Math.min(Math.floor(rand() * total), total - 1)
ok(/least\(floor\(random\(\) \* total\)::int, total - 1\)/.test(sqlPick),
   'ticket 계산식이 draw-core.js drawOne()과 같다 (min(floor(r*total), total-1))');

console.log('\n8. 토큰 안전장치');
// ⚠️ 이 두 줄은 "실제 토큰이 저장소에 커밋되는 것"을 막는 게이트다.
//    이 저장소는 공개라, 토큰이 커밋되는 순간 링크를 아는 누구나 소스에서 꺼내
//    재고를 뽑아갈 수 있다. schema.sql에는 placeholder만 두고 실제 값은
//    supabase/draw-tokens.local.sql(gitignore 대상)에서 update로 넣는다.
//    ✗ 가 뜨면 검사를 지우지 말고 schema.sql을 placeholder로 되돌릴 것.
inDraw(/'CHANGE-ME-KIOSK'/, 'schema.sql에 실제 kiosk 토큰이 없다 (placeholder 유지)');
inDraw(/'CHANGE-ME-ADMIN'/, 'schema.sql에 실제 admin 토큰이 없다 (placeholder 유지)');
inDraw(/like 'CHANGE-ME%'/, 'placeholder 그대로면 모든 호출을 거부한다');
inDraw(/if v_kiosk = v_admin then return false/, '키오스크 토큰과 관리 토큰이 같으면 거부한다');
inDraw(/if p_need = 'admin' then return p_token = v_admin/, "admin 경로는 관리 토큰만 통과한다");
// 관리 RPC가 실수로 kiosk 권한으로 열리면 아이패드가 곧 관리자다
for (const fn of ['draw_admin_state', 'draw_admin_open', 'draw_admin_close',
                  'draw_admin_set', 'draw_admin_undo']) {
  const body = draw.slice(draw.indexOf(`function public.${fn}(`));
  const head = body.slice(0, body.indexOf('end $'));
  ok(/_draw_auth\(p_token, 'admin'\)/.test(head), `${fn}: admin 토큰을 요구한다`);
}

console.log('\n9. 토큰 파일이 커밋 경로에 없다');
// 실제 토큰은 supabase/draw-tokens.local.sql 에만 있고 gitignore로 막혀 있어야 한다.
const ignore = readFileSync('.gitignore', 'utf8');
ok(/^supabase\/draw-tokens\*\.local\.sql$/m.test(ignore),
   '.gitignore가 supabase/draw-tokens*.local.sql 을 막는다');
// 템플릿에 실수로 실제 값을 채워 넣고 커밋하는 경로도 막는다
const example = readFileSync('supabase/draw-tokens.example.sql', 'utf8');
ok(/PUT-KIOSK-TOKEN-HERE/.test(example) && /PUT-ADMIN-TOKEN-HERE/.test(example),
   '템플릿에 실제 토큰이 채워져 있지 않다');
// insert로 쓰면 on conflict do nothing 때문에 조용히 아무 일도 안 일어난다
ok(/update public\.draw_config/.test(example) && !/insert into public\.draw_config/.test(example),
   '템플릿이 update를 쓴다 (insert는 on conflict로 무시된다)');

console.log('\n10. 게시 목록');
const pages = readFileSync('scripts/lib/pagesFiles.mjs', 'utf8');
for (const f of ['draw.html', 'draw-admin.html', 'draw-core.js', 'draw-sw.js']) {
  ok(pages.includes(`'${f}'`), `PUBLISHED_FILES에 ${f}가 있다`);
}
// 서비스 워커가 두 페이지를 모두 담아야 오프라인에서 껍데기라도 뜬다
const sw = readFileSync('docs/draw-sw.js', 'utf8');
ok(/ASSETS = \[[^\]]*'\.\/draw\.html'/.test(sw), '서비스 워커가 draw.html을 프리캐시한다');
ok(/ASSETS = \[[^\]]*'\.\/draw-admin\.html'/.test(sw), '서비스 워커가 draw-admin.html을 프리캐시한다');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n뽑기 서버 스키마 ✓ 전부 통과');
process.exit(fail ? 1 : 0);
