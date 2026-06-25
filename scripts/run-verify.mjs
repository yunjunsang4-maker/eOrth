/**
 * 순수 로직 검증(*.verify.ts) 일괄 실행기
 *
 * 실행: npm test  (= node scripts/run-verify.mjs)
 *
 * src 아래의 모든 `*.verify.ts`를 찾아 각각 별도 프로세스로 tsx로 실행한다.
 * (각 검증 스크립트가 process.exit를 호출하므로 한 프로세스에서 모아 돌릴 수 없어
 *  파일당 1프로세스로 띄운다.) 하나라도 실패하면 종료코드 1로 끝나 CI에서 잡힌다.
 *
 * jest 미사용 — 검증 스크립트는 자체 assert로 ✓/✗를 출력하고 0/1로 종료한다.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// src 트리에서 *.verify.ts 전부 수집
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (name.endsWith('.verify.ts')) out.push(full);
  }
  return out;
}

const files = collect(SRC).sort();
if (files.length === 0) {
  console.log('검증 파일(*.verify.ts)이 없습니다.');
  process.exit(0);
}

// tsx CLI(JS)를 node로 직접 실행한다 — 경로에 공백(예: "바탕 화면")이 있어도
// shell을 거치지 않으므로 안전하다(.cmd 래퍼/따옴표 문제 회피).
const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
try {
  statSync(tsxCli);
} catch {
  console.error('tsx가 설치돼 있지 않습니다. `npm install`을 먼저 실행하세요.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const rel = file.slice(ROOT.length + 1).split(sep).join('/');
  console.log(`\n▶ ${rel}`);
  const res = spawnSync(process.execPath, [tsxCli, file], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log('\n' + '─'.repeat(40));
if (failed === 0) {
  console.log(`✅ 전체 통과 (${files.length}개 파일)`);
  process.exit(0);
} else {
  console.error(`❌ ${failed}/${files.length}개 파일 실패`);
  process.exit(1);
}
