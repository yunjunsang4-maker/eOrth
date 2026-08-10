// 배치 파리티 정적 가드 — 코드모드로 대량 치환한 규칙이 조용히 원상복귀되는 것을 막는다.
// 이 저장소는 76곳 코드모드 주입 이력이 있고(8/3 파리티 감사), 그때 오주입 여부를
// 사람 눈으로만 확인했다. 같은 일을 반복하지 않기 위한 자동 검사다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);

function collect(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (p) => p.split(sep).join('/');
// collect·rel은 규칙 3부터 쓴다(Task 4). 지금은 정의만 해둔다 —
// lint가 미사용을 지적하면 규칙 3을 추가할 때 자연히 해소되므로 무시한다.
let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('배치 파리티');

// ── 규칙 1: 루트 클램프가 살아 있다 ──
// 이게 빠지면 폴드·태블릿에서 전 화면이 늘어난다. 값은 stageMath와 같아야 한다.
const stageMath = readFileSync('src/utils/stageMath.ts', 'utf8');
const maxW = Number(stageMath.match(/STAGE_MAX_W = (\d+)/)?.[1]);
const app = readFileSync('App.tsx', 'utf8');
check(maxW === 480, `STAGE_MAX_W === 480 (실제 ${maxW})`);
check(
  app.includes('STAGE_MAX_W') && /maxWidth:\s*STAGE_MAX_W/.test(app),
  'App.tsx가 maxWidth: STAGE_MAX_W로 루트를 클램프한다',
);
check(
  /alignSelf:\s*'center'/.test(app),
  'App.tsx 루트 컨테이너가 중앙 정렬된다',
);

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
