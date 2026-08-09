/**
 * docs/event-dna.js 생성 — 앱 소스(문항·채점·라벨·나라)를 브라우저/Node 공용 ESM으로 번들한다.
 *
 * 실행: node scripts/build-event-dna.mjs
 * 검사: node scripts/build-event-dna.mjs --check   (다시 만든 결과가 파일과 같은지만 확인)
 *
 * esbuild는 tsx의 의존성으로 이미 설치돼 있다(별도 devDependency 추가 불필요).
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = 'docs/event-dna.js';
const BANNER = [
  '// ⚠️ 생성물입니다. 직접 고치지 마세요 — 다음 npm test에서 되돌려집니다.',
  '// 원본: scripts/event-dna-entry.ts (→ src/constants/travelDna.ts, src/utils/travelDnaScore.ts, src/constants/countries.ts)',
  '// 재생성: node scripts/build-event-dna.mjs',
].join('\n');

/** 번들 결과 문자열. 파일로 쓰지 않으므로 --check가 작업트리를 건드리지 않는다. */
export async function bundleEventDna() {
  const result = await build({
    entryPoints: ['scripts/event-dna-entry.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2020',      // 부스에 오는 실제 단말(구형 안드로이드 크롬 포함)까지 커버
    charset: 'utf8',       // 한글이 \uXXXX로 이스케이프되면 diff를 사람이 못 읽는다
    legalComments: 'none',
    banner: { js: BANNER },
    write: false,
  });
  return result.outputFiles[0].text;
}

// 줄바꿈 정규화 — 작업트리는 CRLF, esbuild 산출은 LF다. 이걸 안 맞추면 --check가 항상 실패한다.
export const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

// CLI 진입점 가드 — check-docs-sync.mjs가 `import { bundleEventDna, norm } from './build-event-dna.mjs'`로
// 이 파일을 라이브러리로도 쓴다. 가드가 없으면 그 import만으로 아래 쓰기 로직이 실행돼
// npm test 때마다 event-dna.js를 조용히 재생성해버린다 — 그러면 check-docs-sync.mjs의 최신성
// 검사가 파일을 읽기 전에 이미 새로 덮어써져 있어 손댄 흔적을 절대 못 잡는다(게이트 무력화).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const isCheck = process.argv.includes('--check');
  const text = await bundleEventDna();

  if (isCheck) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* 파일 없음 = 불일치 */ }
    if (norm(current) !== norm(text)) {
      console.error(`❌ ${OUT}가 원본과 다릅니다 — node scripts/build-event-dna.mjs 로 다시 만드세요.`);
      process.exit(1);
    }
    console.log(`✅ ${OUT} 최신`);
  } else {
    writeFileSync(OUT, text, 'utf8');
    console.log(`생성: ${OUT} (${text.length} bytes)`);
  }
}
