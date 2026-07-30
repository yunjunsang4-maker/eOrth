/**
 * 공개 문서를 gh-pages에 게시한다.
 *
 * GitHub Pages는 master의 docs/가 아니라 gh-pages 브랜치 루트에서 서비스된다
 * (repos/.../pages → source.branch = "gh-pages"). 그래서 docs/를 고치고 master에
 * 푸시해도 공개본은 그대로다. 2026-07-31에 이 때문에 위치 정보 수집 고지가 이틀간
 * 공개본에서 빠져 있었고, 개정한 약관도 게시되지 않은 채였다.
 *
 * 사용법
 *   npm run pages:check     차이만 보여준다(기본, 아무것도 바꾸지 않음)
 *   npm run pages:publish   docs/ → gh-pages 복사·커밋·푸시하고 지문을 남긴다
 *
 * 지문(docs/.published.json)은 '무엇을 게시했는지'의 기록이다. npm test의
 * check-docs-sync가 이걸 현재 파일과 비교해 '게시 대기'를 알려준다.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PUBLISHED_FILES, sha, STAMP_PATH, normalizeText } from './lib/pagesFiles.mjs';

const BRANCH = 'gh-pages';
const DOCS = 'docs';
const STAMP = STAMP_PATH;
const publish = process.argv.includes('--publish');

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

// 게시는 되돌리기 어려우므로, 커밋되지 않은 변경 위에서 실행하지 않는다
if (publish) {
  const dirty = git(['status', '--porcelain', '--', DOCS]);
  if (dirty) {
    console.error('❌ docs/에 커밋되지 않은 변경이 있습니다. 먼저 커밋하세요:\n' + dirty);
    process.exit(1);
  }
}

console.log(`원격 ${BRANCH} 가져오는 중…`);
try {
  git(['fetch', 'origin', BRANCH]);
} catch (e) {
  console.error(`❌ ${BRANCH}를 가져오지 못했습니다(네트워크·권한 확인): ${e.message}`);
  process.exit(1);
}

// 어떤 파일이 다른지 먼저 확인
const diffs = [];
for (const f of PUBLISHED_FILES) {
  const local = readFileSync(`${DOCS}/${f}`, 'utf8');
  let remote = null;
  try {
    remote = git(['show', `origin/${BRANCH}:${f}`]);
  } catch {
    remote = null; // 게시본에 아직 없는 파일
  }
  // 줄바꿈까지 정규화해 비교한다 — 작업트리 CRLF vs git 저장본 LF 차이로
  // 모든 파일이 '변경'으로 잡히는 것을 막는다(normalizeText 주석 참조)
  const same = remote !== null && normalizeText(remote) === normalizeText(local);
  diffs.push({ file: f, status: remote === null ? 'new' : same ? 'same' : 'changed' });
}

for (const d of diffs) {
  const mark = d.status === 'same' ? '  =' : d.status === 'new' ? '  + 신규' : '  * 변경';
  console.log(`${mark} ${d.file}`);
}

const toPublish = diffs.filter((d) => d.status !== 'same');
if (toPublish.length === 0) {
  console.log('\n✅ 게시본과 동일합니다. 할 일 없음.');
  process.exit(0);
}

if (!publish) {
  console.log(`\n게시 대기 ${toPublish.length}건 — 반영하려면: npm run pages:publish`);
  process.exit(0);
}

// ── 실제 게시 ──
const wt = join(tmpdir(), `eorth-ghp-${process.pid}`);
if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
console.log(`\n${BRANCH} 워크트리 준비: ${wt}`);
git(['worktree', 'add', wt, BRANCH]);
try {
  git(['-C', wt, 'reset', '--hard', `origin/${BRANCH}`]);
  for (const d of toPublish) copyFileSync(`${DOCS}/${d.file}`, join(wt, d.file));
  git(['-C', wt, 'add', '--', ...toPublish.map((d) => d.file)]);

  const body = toPublish.map((d) => `- ${d.file} (${d.status === 'new' ? '신규' : '변경'})`).join('\n');
  git(['-C', wt, 'commit', '-m', `docs(pages): 공개 문서 게시\n\n${body}\n\nmaster의 docs/를 그대로 복사했습니다(scripts/publish-pages.mjs).`]);
  git(['-C', wt, 'push', 'origin', BRANCH]);
  console.log(`\n✅ ${BRANCH}에 게시했습니다.`);
} finally {
  try { git(['worktree', 'remove', wt, '--force']); } catch { /* 정리 실패는 무시 */ }
  git(['worktree', 'prune']);
}

// 지문 갱신 — 이제부터 npm test가 '게시 대기'를 정확히 판단할 수 있다
const files = {};
for (const f of PUBLISHED_FILES) files[f] = sha(readFileSync(`${DOCS}/${f}`, 'utf8'));
writeFileSync(STAMP, `${JSON.stringify({ branch: BRANCH, files }, null, 2)}\n`, 'utf8');
console.log(`지문 갱신: ${STAMP} — 이 파일도 커밋하세요.`);
console.log('반영까지 GitHub Pages 빌드에 1~2분 걸립니다.');
