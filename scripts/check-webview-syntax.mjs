/**
 * 템플릿 리터럴 안에 든 WebView용 JS의 문법 검사.
 *
 * tsc는 문자열 안을 보지 않으므로 이 안의 오타는 런타임(빈 화면)에서야 드러난다.
 * <script> ... </script> 블록을 뽑아 `node --check`로 파싱만 시킨다(실행하지 않는다).
 *
 * 실행: node scripts/check-webview-syntax.mjs <파일...>
 *
 * 블록 추출 노트(CountryMapView.tsx에서 실측):
 * - 진짜 WebView <script> 블록은 여는/닫는 태그가 "그 줄에 단독으로" 온다(예: 197행 `<script>`,
 *   675행 `<\/script>`). 닫는 태그가 `<\/script>`로 이스케이프돼 있는 건, d3 인라인 주입용
 *   `${d3Src ? '<script>' + d3Src + '</script>' : ''}` 같은 문자열 리터럴 안의 '</script>'와
 *   런타임에서 실제 태그가 조기 종료되는 걸 막기 위해서다.
 * - 위 인라인 문자열 리터럴은 한 줄 안에 '<script>'…'</script>'가 나란히 있어, "태그가 줄 첫/끝
 *   부분에 단독으로 있어야 한다"는 조건이 없으면 그 사이(따옴표+연산자 몇 글자)를 진짜 블록으로
 *   오매칭해 버그를 놓친 채 항상 "통과"로 나온다(실측: 13자짜리 가짜 블록만 검사하고 통과 처리).
 *   그래서 "줄 단독" 조건을 필수로 건다.
 * - d3 라이브러리 소스(D3_INLINE) 자체는 import된 변수(D3_SRC)를 문자열 결합으로 주입하므로
 *   CountryMapView.tsx의 원본 텍스트에는 리터럴로 들어있지 않다 — 즉 이 파일만 검사할 땐 d3
 *   본문이 매칭 대상에 안 잡힌다. 다만 향후 다른 파일에서 벤더 번들이 통째로 <script> 블록
 *   리터럴로 박혀 들어오는 경우를 대비해, 지나치게 큰 블록은 안전하게 건너뛴다(아래 SKIP_SIZE).
 * - 블록 안에는 `\\u0300`처럼 백슬래시를 두 번 쓴 정규식/이스케이프가 있다(예: normEn의 발음
 *   기호 제거 정규식, `'M\\xe1laga'`). 이는 바깥 템플릿 리터럴이 한 번 평가되면서 `\\`→`\`로
 *   줄어들어야 런타임 WebView가 받는 실제 코드가 되는, 의도된 이중 이스케이프다. 원본 파일
 *   텍스트를 그대로 `node --check`에 넘기면(템플릿 리터럴 평가를 안 거치므로) 이 이중
 *   백슬래시가 그대로 남아 정규식 문자 클래스가 깨진 것으로 오검출된다(실측: "Range out of
 *   order" 오류). 그래서 --check 전에 `\\`→`\` 치환으로 템플릿 리터럴 평가를 흉내낸다.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('사용법: node scripts/check-webview-syntax.mjs <파일...>'); process.exit(1); }

// 벤더 번들(d3 등)이 통째로 <script> 리터럴에 박혀 들어온 경우 파싱 자체는 유효하지만 검사가
// 느려질 뿐이니, 문법 오류 가능성이 낮은 대형 블록은 건너뛰고 그 사실만 보고한다.
const SKIP_SIZE = 50000;

// <script> / </script>(또는 이스케이프된 <\/script>) 가 그 줄에 단독으로 오는 "진짜" 블록만
// 뽑는다. 인라인 문자열 리터럴(예: '<script>' + x + '</script>')은 줄 단독이 아니므로 제외된다.
const BLOCK_RE = /^[ \t]*<script>[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*<\\?\/script>[ \t]*$/gm;

const dir = mkdtempSync(join(tmpdir(), 'wvsyntax-'));
let failed = 0;
try {
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const blocks = [...src.matchAll(BLOCK_RE)].map(m => m[1]);
    if (!blocks.length) { console.log(`- ${file}: <script> 블록 없음 (건너뜀)`); continue; }
    blocks.forEach((body, i) => {
      if (body.length > SKIP_SIZE) {
        console.log(`- ${file} <script> #${i + 1}: 대형 블록(${body.length}자, 벤더 번들 추정) — 건너뜀`);
        return;
      }
      // ${...} 보간은 파서가 못 읽으므로 자리표시자로 치환한다(문법 구조는 보존된다).
      // \\ → \ 치환은 바깥 템플릿 리터럴 평가를 흉내내 실제 런타임 코드와 맞춘다(위 설명 참고).
      const code = body.replace(/\$\{[^}]*\}/g, '0').replace(/\\\\/g, '\\');
      const tmp = join(dir, `block-${i}.js`);
      writeFileSync(tmp, code);
      try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
        console.log(`✓ ${file} <script> #${i + 1} (${code.length}자)`);
      } catch (e) {
        failed++;
        console.error(`✗ ${file} <script> #${i + 1}:\n${String(e.stderr || e.message).trim()}`);
      }
    });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (failed) { console.error(`\n${failed}개 블록 문법 오류`); process.exit(1); }
console.log('\n✅ WebView JS 문법 통과');
