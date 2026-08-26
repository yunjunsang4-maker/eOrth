// 뽑기 페이지 ↔ 서버 계약 검증.
//
// draw.html·draw-admin.html은 RPC를 문자열 이름과 문자열 인자 이름으로 부른다.
// 이름이 하나만 어긋나도 타입 검사도 문법 검사도 통과하고, 증상은 부스에서
// "버튼을 눌렀는데 아무 일도 안 남"이다. PostgREST는 인자 이름이 안 맞으면
// 404를 돌려주는데 그것도 화면에는 그냥 네트워크 오류로만 보인다.
//
// 여기서 대조하는 것 넷:
//   1. import 이름 ↔ draw-core.js의 export
//   2. rpc('이름') ↔ schema.sql의 함수 정의 + anon grant
//   3. RPC 인자 이름 ↔ 서버 시그니처 (양방향)
//   4. getElementById(id) ↔ 마크업의 id
import { readFileSync } from 'node:fs';

const core = readFileSync('docs/draw-core.js', 'utf8');
const sql = readFileSync('supabase/schema.sql', 'utf8');
const draw = sql.slice(sql.indexOf('부스 뽑기 서버 재고'));

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fail++;
};

const exported = new Set([...core.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]));

/** 서버 함수의 파라미터 이름 목록. 없으면 null */
function serverParams(fn) {
  const m = draw.match(new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`));
  if (!m) return null;
  return [...m[1].matchAll(/(p_\w+)\s+\w/g)].map((x) => x[1]);
}

// 이 페이지들은 anon 키로 RPC만 부른다. 테이블을 직접 치면 권한이 없어 전부 실패하므로,
// /rest/v1/<table> 형태의 호출이 섞여 들어오지 않았는지도 본다.
const REST_TABLE = /\/rest\/v1\/(?!rpc\/)[a-z_]/;

for (const file of ['docs/draw.html', 'docs/draw-admin.html']) {
  const s = readFileSync(file, 'utf8');
  console.log(`\n▶ ${file}`);

  // 1. import ↔ export
  const imp = s.match(/import \{([\s\S]*?)\} from '\.\/draw-core\.js'/);
  ok(!!imp, 'draw-core.js import 구문이 있다');
  const names = imp ? imp[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  for (const n of names) ok(exported.has(n), `import ${n} → draw-core.js가 export한다`);

  // 2. rpc('이름') ↔ 서버 정의 + grant
  const calls = [...new Set([...s.matchAll(/rpc\('(\w+)'/g)].map((m) => m[1]))];
  ok(calls.length > 0, `RPC 호출 ${calls.length}종`);
  for (const fn of calls) {
    ok(serverParams(fn) !== null, `rpc ${fn} → schema.sql에 정의돼 있다`);
    ok(
      new RegExp(`grant execute on function public\\.${fn}\\(`).test(draw),
      `rpc ${fn} → anon에게 grant돼 있다`,
    );
  }

  // 3. 인자 이름 양방향 대조
  for (const m of s.matchAll(/rpc\('(\w+)',\s*\{([^}]*)\}/g)) {
    const fn = m[1];
    const args = [...m[2].matchAll(/(p_\w+)\s*:/g)].map((x) => x[1]);
    const params = serverParams(fn);
    if (!params) continue;                       // 위 2번에서 이미 실패로 잡혔다
    for (const a of args) ok(params.includes(a), `${fn}: 보낸 인자 ${a}가 서버에 있다`);
    // 빠진 인자도 잡는다. PostgREST는 인자가 모자라면 함수를 아예 못 찾는다.
    for (const p of params) ok(args.includes(p), `${fn}: 서버 인자 ${p}를 클라이언트가 보낸다`);
  }

  // 4. getElementById / $('id') ↔ 마크업
  const ids = new Set();
  for (const m of s.matchAll(/getElementById\('([\w-]+)'\)/g)) ids.add(m[1]);
  for (const m of s.matchAll(/\$\('([\w-]+)'\)/g)) ids.add(m[1]);
  for (const id of ids) ok(s.includes(`id="${id}"`), `id=${id} 가 마크업에 있다`);

  // 5. 테이블 직접 호출 금지
  ok(!REST_TABLE.test(s), 'REST 테이블 직접 호출이 없다 (RPC만 쓴다)');

  // 6. 아이패드 페이지에는 관리 기능이 한 줄도 없어야 한다.
  //    "화면 숨김"이 아니라 "코드 부재"로 지키는 것이 이번 설계의 전제다.
  if (file === 'docs/draw.html') {
    for (const banned of ['draw_admin_state', 'draw_admin_open', 'draw_admin_close',
                          'draw_admin_set', 'draw_admin_undo']) {
      ok(!s.includes(banned), `키오스크에 ${banned} 호출이 없다`);
    }
  }
}

// 관리 콘솔이 여는 날짜 재고는 draw-core.js의 DAY_POOLS를 그대로 보내야 한다.
// SQL에 수량을 또 적어두면 두 벌이 되어 한쪽만 고쳤을 때 조용히 어긋난다.
console.log('\n▶ 초기 재고 단일 출처');
const adminHtml = readFileSync('docs/draw-admin.html', 'utf8');
ok(/p_pool: DAY_POOLS\[day\]/.test(adminHtml), '관리 콘솔이 DAY_POOLS를 그대로 보낸다');
ok(!/g5['"]?\s*:\s*300/.test(draw), 'schema.sql에 초기 수량이 하드코딩돼 있지 않다');

console.log(fail ? `\n❌ ${fail}건 불일치` : '\n뽑기 페이지 계약 ✓ 전부 일치');
process.exit(fail ? 1 : 0);
