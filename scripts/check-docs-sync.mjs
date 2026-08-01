/**
 * 공개 문서(약관·개인정보처리방침·공지) 정합성 검사 — npm test에 포함(오프라인).
 *
 * 왜 필요한가 (2026-07-31에 실제로 겪은 두 가지):
 *  ① md와 html의 시행일이 따로 논다. 같은 문서를 두 벌로 들고 있어 한쪽만 고치기 쉽다.
 *  ② docs/를 고치고 커밋해도 게시본은 그대로다. GitHub Pages는 master의 docs/가 아니라
 *     gh-pages 브랜치에서 서비스되기 때문이다. 이 때문에 위치 정보 수집 고지가 이틀간
 *     공개본에 빠져 있었다.
 *
 * ②는 네트워크 없이 알 수 없으므로, 게시할 때 남긴 지문(docs/.published.json)과 현재
 * 파일 해시를 비교해 '게시 대기'를 알린다. 지문은 scripts/publish-pages.mjs가 갱신한다.
 *
 * 시행일 불일치는 실패(문서가 서로 모순), 게시 대기는 경고(작업 중일 수 있음)로 다룬다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { PUBLISHED_FILES, sha, STAMP_PATH } from './lib/pagesFiles.mjs';

const DOCS = 'docs';
const read = (p) => readFileSync(`${DOCS}/${p}`, 'utf8');

/** 'YYYY-MM-DD' 또는 'YYYY년 M월 D일' → 'YYYY-MM-DD' (없으면 null) */
function normDate(raw) {
  if (!raw) return null;
  let m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return null;
}

/** 문서 머리말의 시행일. md는 '**시행일: ...**', html은 '<p class="meta">시행일: ...' */
function headerEffectiveDate(text) {
  const m = text.match(/시행일[:：]\s*([^<*|\n]+)/);
  return m ? normDate(m[1]) : null;
}

let fail = 0;
let warn = 0;
const bad = (msg) => { fail++; console.error(`  ✗ ${msg}`); };
const nag = (msg) => { warn++; console.warn(`  ⚠ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── 1. md와 html의 시행일이 같은가 ──
for (const base of ['terms', 'privacy-policy']) {
  const md = headerEffectiveDate(read(`${base}.md`));
  const html = headerEffectiveDate(read(`${base}.html`));
  if (!md || !html) bad(`${base}: 시행일을 읽지 못했습니다 (md=${md} html=${html})`);
  else if (md !== html) bad(`${base}: 시행일 불일치 — md=${md}, html=${html} (한쪽만 고쳤을 가능성)`);
  else ok(`${base} 시행일 일치: ${md}`);
}

// ── 1-b. 영문 방침의 시행일이 한국어 원문과 같은가 ──
//   번역본은 한 번 만들어 두면 원문만 고치고 잊기 쉽다. 두 문서가 다른 날짜를 말하면
//   어느 쪽이 유효한지 알 수 없으므로 실패로 다룬다. (형식: 한국어 '시행일: 2026-08-04',
//   영문 'Effective date: August 4, 2026' — 날짜를 정규화해 비교한다)
{
  const MONTHS = ['january','february','march','april','may','june',
                  'july','august','september','october','november','december'];
  const enDate = (text) => {
    const m = text.match(/Effective date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!m) return null;
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi < 0) return null;
    return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  };
  const ko = normDate(headerEffectiveDate(read('privacy-policy.md')));
  const en = enDate(read('privacy-policy-en.html'));
  if (!ko || !en) bad(`privacy-policy-en: 시행일을 읽지 못했습니다 (ko=${ko} en=${en})`);
  else if (ko !== en) bad(`privacy-policy-en: 한국어 원문과 시행일 불일치 — ko=${ko}, en=${en} (번역본만 안 고쳤을 가능성)`);
  else ok(`privacy-policy-en 시행일 일치: ${en}`);
}

// ── 2. notices.json이 유효하고 약관 공지가 약관 시행일과 맞는가 ──
let notices = null;
try {
  notices = JSON.parse(read('notices.json'));
  ok('notices.json 파싱');
} catch (e) {
  bad(`notices.json 파싱 실패: ${e.message}`);
}

if (notices) {
  const list = Array.isArray(notices.notices) ? notices.notices : [];
  const ids = new Set();
  for (const n of list) {
    if (!n?.id) { bad('notices.json: id 없는 항목'); continue; }
    if (ids.has(n.id)) bad(`notices.json: id 중복 — ${n.id}`);
    ids.add(n.id);
    if (!n.title) bad(`notices.json[${n.id}]: title 없음`);
    if (!normDate(n.publishedAt)) bad(`notices.json[${n.id}]: publishedAt 형식 오류 — ${n.publishedAt}`);
  }
  if (list.length) ok(`notices.json 항목 ${list.length}개`);

  // 약관 개정 공지의 시행일은 약관 본문의 시행일과 같아야 한다
  const termsDate = headerEffectiveDate(read('terms.md'));
  for (const n of list.filter((x) => x?.kind === 'terms' && x.effectiveDate)) {
    const d = normDate(n.effectiveDate);
    if (d !== termsDate) bad(`notices.json[${n.id}]: 시행일이 약관과 다름 — 공지=${d}, 약관=${termsDate}`);
    else ok(`약관 공지 시행일 일치: ${d}`);
  }
}

// ── 3. 게시본과 어긋나 있지 않은가 (지문 비교) ──
const stampPath = STAMP_PATH;
if (!existsSync(stampPath)) {
  nag(`.published.json이 없습니다 — 게시 이력을 알 수 없습니다. npm run pages:publish 로 생성됩니다.`);
} else {
  const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
  const pending = [];
  for (const f of PUBLISHED_FILES) {
    const cur = sha(read(f));
    if (stamp.files?.[f] !== cur) pending.push(f);
  }
  if (pending.length) {
    nag(`게시 대기 ${pending.length}건: ${pending.join(', ')}`);
    nag(`  → docs/를 고쳤지만 gh-pages에 반영되지 않았습니다. npm run pages:publish 로 게시하세요.`);
  } else {
    ok(`게시본과 일치 (${PUBLISHED_FILES.length}개 파일)`);
  }
}

console.log('');
if (fail) {
  console.error(`❌ 공개 문서 정합성 ${fail}건 실패`);
  process.exit(1);
}
console.log(warn ? `✅ 공개 문서 정합성 통과 (경고 ${warn}건)` : '✅ 공개 문서 정합성 통과');
