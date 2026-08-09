# 오프라인 행사 메이트 매칭 이벤트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부스 QR로 들어온 참가자가 14문항 설문과 인스타 아이디를 남기면, 행사 후 로컬 스크립트가 성향·희망 국가로 1:1 짝을 지어 사람별 DM 문구를 뽑아주는 정적 페이지 + 관리자 도구를 만든다.

**Architecture:** 앱 소스(`src/constants/travelDna.ts`, `src/utils/travelDnaScore.ts`, `src/constants/countries.ts`)를 **esbuild로 번들해** `docs/event-dna.js`를 생성한다. 문항·채점·라벨을 옮겨 적지 않으므로 앱과 이벤트가 갈라질 수 없다. 브라우저(`docs/event.html`)와 Node(`scripts/event-match.mjs`)가 **같은 번들 파일**을 ESM으로 import한다. 매칭 로직은 순수 함수 모듈(`scripts/event-match-core.mjs`)로 분리해 `npm test`로 검증하고, Supabase 입출력은 CLI 계층에만 둔다.

**Tech Stack:** 정적 HTML/ESM(빌드 도구 없음, 인라인 스타일), esbuild 0.28.1(이미 설치됨 — tsx의 의존성), Node 18+ 내장 `fetch`, Supabase REST(PostgREST), GitHub Pages(gh-pages 브랜치).

## Global Constraints

- **설계 문서:** `docs/superpowers/specs/2026-08-09-event-mate-matching-design.md`. 값이 충돌하면 스펙이 정본이다.
- **G1(앱 소스 불변):** `src/` 아래 파일은 **읽기만 한다.** 한 글자도 수정하지 않는다. 이벤트 때문에 앱 동작이 바뀌면 안 된다.
- **G2(생성물 단일 출처):** `docs/event-dna.js`는 손으로 고치지 않는다. 항상 `node scripts/build-event-dna.mjs`로 만든다. 최신성은 `npm test`가 강제한다.
- **G3(연락 수단):** 인스타그램 아이디 **하나뿐**이다. 전화번호·이메일을 받는 코드를 넣지 않는다.
- **G4(DOM 조작):** 브라우저 코드에서 `innerHTML`을 쓰지 않는다. `createElement` + `textContent`로 만든다. 이 저장소의 보안 훅이 `innerHTML` 대입을 차단한다.
- **디자인 토큰(정확히 이 값):** 배경 `#0A0A0F` / 카드 `#2E2E3B` / 보라 네온 `#BF85FC` / 텍스트 흐림 `#A1A1B0` / 구분선 `#1A1A26` / 빨강 `#FF3B30`.
- **자리표시자 3종(Task 6에서 확정):** 행사 코드 `popup01`, 행사명 `eOrth 팝업 이벤트`, 행사 종료일. 행사 코드는 **페이지 상수·RLS `with check`·CLI 인자 세 곳이 같아야** 한다.
- **응답 값은 대문자 `'A' | 'B'`** — 앱 `DnaAnswers` 타입과 같아야 `scoreAxes`가 동작한다. (스펙 §4 SQL 주석의 소문자 예시는 오기다.)
- **검증 명령:** `npm test` (= `run-verify.mjs` + WebView 문법 검사 + `check-docs-sync.mjs`). 이 저장소에 jest는 없다. 테스트는 `*.verify.*` 파일이 자체 assert로 ✓/✗를 출력하고 0/1로 종료하는 방식이다 — `src/utils/travelDnaScore.verify.ts`가 본보기다.
- **타입 체크:** `npx tsc --noEmit` (Task 1이 `.ts` 파일을 추가하므로 그 태스크에서 반드시 돌린다).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: `docs/event-dna.js` 생성 파이프라인

앱 소스를 번들해 브라우저·Node 공용 ESM을 만들고, 낡으면 `npm test`가 실패하게 만든다.

**Files:**
- Create: `scripts/event-dna-entry.ts` (번들 진입점)
- Create: `scripts/build-event-dna.mjs` (생성기)
- Create: `scripts/event-dna.verify.mjs` (검증)
- Create: `docs/event-dna.js` (**생성물** — 커밋한다. gh-pages에 올라가야 하므로 무시하지 않는다)
- Modify: `scripts/run-verify.mjs:34-43` (수집 대상에 `scripts/*.verify.mjs` 추가)
- Modify: `scripts/check-docs-sync.mjs` (§3 지문 검사 앞에 생성물 최신성 검사 추가)
- Modify: `scripts/lib/pagesFiles.mjs:9-15` (`PUBLISHED_FILES`에 `event-dna.js` 추가)

**Interfaces:**
- Consumes: `src/constants/travelDna.ts`의 `DNA_QUESTIONS`·`DNA_AXES`·`DNA_LABELS`, `src/utils/travelDnaScore.ts`의 `scoreAxes`·`makeTypeLabel`·`isValidDna`, `src/constants/countries.ts`의 `COUNTRIES` (전부 읽기 전용)
- Produces: `docs/event-dna.js`가 내보내는 것 — 이후 모든 태스크가 이 이름으로 쓴다.
  - `EVENT_QUESTIONS: DnaQuestion[]` — 14개. `{ id: number, axis: string, weight: 2, ko: {s,a,b}, en: {s,a,b} }`
  - `DNA_AXES: string[]` — `['plan','pace','terrain','budget','purpose','crowd','company']`
  - `DNA_LABELS: Record<string, {nounA,nounB,adjA,adjB,enNounA,enNounB,enAdjA,enAdjB}>`
  - `COUNTRIES: {term,flag,name,continent}[]`
  - `scoreAxes(answers: Record<number,'A'|'B'>): Record<string, number>` — 축별 0~100
  - `makeTypeLabel(scores): {key: string, ko: string, en: string}`
  - `isValidDna(answers): boolean`
  - `normalizeInstagram(raw: string): string | null` — 정규화 실패 시 `null`
  - `INSTAGRAM_RE: RegExp` — `/^[a-z0-9._]{1,30}$/`

- [ ] **Step 1: 번들 진입점 작성**

`scripts/event-dna-entry.ts`:

```ts
// docs/event-dna.js의 원본 — esbuild가 이 파일을 번들해 브라우저와 Node가 함께 쓰는 ESM을 만든다.
//
// 왜 번들인가: 문항(36개)·채점 공식·유형 라벨이 이미 앱에 구현돼 있다. 이벤트용으로 옮겨 적으면
// 앱 문항을 고쳤을 때 이벤트만 옛 문구로 남고, 화면에 보여준 유형과 매칭에 쓴 점수가 갈라진다.
// 여기서는 재수출만 하고 로직을 새로 쓰지 않는다.
export { DNA_AXES, DNA_LABELS, DNA_QUESTIONS } from '../src/constants/travelDna';
export { scoreAxes, makeTypeLabel, isValidDna } from '../src/utils/travelDnaScore';
export { COUNTRIES } from '../src/constants/countries';

import { DNA_QUESTIONS } from '../src/constants/travelDna';

// 현장 설문 14문항 = '축당 2문항' = weight 2짜리 전부.
// 앱에서 축당 정확히 2개씩 있으므로 선별 기준을 따로 둘 필요가 없다.
export const EVENT_QUESTIONS = DNA_QUESTIONS.filter((q) => q.weight === 2);

/** 인스타 아이디 규칙 — 소문자 정규화 후의 형태. RLS check 제약과 같은 식이어야 한다. */
export const INSTAGRAM_RE = /^[a-z0-9._]{1,30}$/;

/**
 * 인스타 아이디 정규화 — 실패하면 null.
 *
 * 연락 수단이 이것 하나뿐이라 한 글자만 틀려도 그 사람은 결과를 영영 못 받는다.
 * 그래서 사람들이 실제로 적는 형태(@붙임, 프로필 URL 붙여넣기, 대문자)를 전부 받아준다.
 */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  // 프로필 URL을 통째로 붙여넣는 사람이 많다 — 아이디 조각만 뽑는다
  const url = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@+/, '').trim().toLowerCase();
  return INSTAGRAM_RE.test(v) ? v : null;
}
```

- [ ] **Step 2: 검증 파일 작성 (아직 실패해야 한다)**

`scripts/event-dna.verify.mjs`:

```js
// docs/event-dna.js(생성물) 검증 — npm test가 실행한다.
// 생성기를 고쳤을 때 14문항 규칙과 채점 결과가 조용히 바뀌는 것을 막는다.
import {
  EVENT_QUESTIONS, DNA_AXES, DNA_LABELS, COUNTRIES,
  scoreAxes, makeTypeLabel, isValidDna, normalizeInstagram,
} from '../docs/event-dna.js';

let fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const truthy = (v, msg) => eq(Boolean(v), true, msg);

console.log('event-dna 번들');

// ── 문항 ──
eq(EVENT_QUESTIONS.length, 14, '문항 14개');
eq(EVENT_QUESTIONS.every((q) => q.weight === 2), true, '전부 weight 2');
for (const axis of DNA_AXES) {
  eq(EVENT_QUESTIONS.filter((q) => q.axis === axis).length, 2, `${axis} 축 2문항`);
}
eq(EVENT_QUESTIONS.map((q) => q.id), [1, 5, 6, 10, 11, 15, 16, 17, 21, 24, 26, 27, 31, 32], '문항 id·순서');
truthy(EVENT_QUESTIONS.every((q) => q.ko.s && q.ko.a && q.ko.b), '한국어 문구 존재');

// ── 채점: 14문항만 답해도 수축(conf) 때문에 극단으로 안 간다 ──
const allB = Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, 'B']));
const allA = Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, 'A']));
// plan 축: 앱 전체 가중치 7(2+1+1+1+2), 여기서 답한 가중치 4 → conf 4/7
eq(scoreAxes(allB).plan, 79, '전부 B → plan 79 (100이 아니라 수축된 값)');
eq(scoreAxes(allA).plan, 21, '전부 A → plan 21');
// company 축만 문항이 6개(31~36)라 전체 가중치가 8 → conf 4/8 = 0.5
eq(scoreAxes(allB).company, 75, '전부 B → company 75 (축마다 conf가 다르다)');
eq(scoreAxes({}).plan, 50, '무응답 → 50 중립');
eq(isValidDna(allB), true, '14문항이면 모든 축에 답이 있다 → 유효');

// ── 라벨: 같은 응답에 항상 같은 결과 ──
const label = makeTypeLabel(scoreAxes(allB));
eq(makeTypeLabel(scoreAxes(allB)), label, '라벨 결정론');
truthy(label.ko.length > 0, '라벨 한국어 문구');
eq(makeTypeLabel(Object.fromEntries(DNA_AXES.map((a) => [a, 50]))).key, 'neutral', '전부 중립 → 폴백 라벨');

// ── 나라 ──
truthy(COUNTRIES.length > 200, `나라 목록 ${COUNTRIES.length}개`);
truthy(COUNTRIES.every((c) => c.name && c.flag && c.term), '나라 항목 필드');

// ── 인스타 아이디 정규화 ──
eq(normalizeInstagram('@Travel_Kim'), 'travel_kim', '@ 제거 + 소문자');
eq(normalizeInstagram('  travel.kim  '), 'travel.kim', '공백 제거');
eq(normalizeInstagram('https://www.instagram.com/travel_kim/'), 'travel_kim', 'URL에서 아이디 추출');
eq(normalizeInstagram('여행김'), null, '한글은 거부');
eq(normalizeInstagram('a'.repeat(31)), null, '31자는 거부');
eq(normalizeInstagram(''), null, '빈 값은 거부');
eq(normalizeInstagram('kim@gmail.com'), null, '이메일은 거부');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: 검증이 실패하는지 확인**

Run: `node node_modules/tsx/dist/cli.mjs scripts/event-dna.verify.mjs`

Expected: FAIL — `Cannot find module .../docs/event-dna.js` (아직 생성 전).

- [ ] **Step 4: 생성기 작성**

`scripts/build-event-dna.mjs`:

```js
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
```

- [ ] **Step 5: 생성하고 검증이 통과하는지 확인**

```powershell
node scripts/build-event-dna.mjs
node node_modules/tsx/dist/cli.mjs scripts/event-dna.verify.mjs
```

Expected: `생성: docs/event-dna.js (...)` 후 검증 전 항목 ✓, 마지막 줄 `✅ 통과`.

`plan 79` / `company 75`가 어긋나면 앱 문항 가중치가 바뀐 것이다. 숫자를 고치기 전에 `src/constants/travelDna.ts`에서 축별 가중치 합을 먼저 확인한다.

- [ ] **Step 6: `npm test`에 편입 — 검증 파일 수집 대상 확장**

`scripts/run-verify.mjs`의 `SRC` 상수와 `collect`·`files` 부분을 아래로 교체한다(주석의 "src 아래" 설명도 함께 갱신):

```js
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// src의 *.verify.ts와 scripts의 *.verify.mjs를 함께 모은다.
// (이벤트 페이지 도구는 앱 소스가 아니라 scripts/에 있지만 같은 게이트로 지켜야 한다)
const ROOTS = [
  [join(ROOT, 'src'), '.verify.ts'],
  [join(ROOT, 'scripts'), '.verify.mjs'],
];
// 에셋 작업용 중간 산출물 디렉터리 — 검증 파일이 없고 크기만 크다
const SKIP_DIRS = new Set(['geo-tmp', 'tmp-frames', 'intro1', 'node_modules']);

function collect(dir, suffix) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full, suffix));
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap(([dir, suffix]) => collect(dir, suffix)).sort();
```

- [ ] **Step 7: 생성물 최신성 검사를 `check-docs-sync.mjs`에 추가**

`import { PUBLISHED_FILES, sha, STAMP_PATH } from './lib/pagesFiles.mjs';` 아래에 import를 하나 더 넣는다:

```js
import { bundleEventDna, norm } from './build-event-dna.mjs';
```

그리고 `// ── 3. 게시본과 어긋나 있지 않은가 (지문 비교) ──` **바로 앞에** 다음 블록을 넣는다:

```js
// ── 2-b. 생성물(event-dna.js)이 앱 소스와 어긋나 있지 않은가 ──
//   앱 문항을 고치고 다시 만들지 않으면, 부스에 옛 문구가 나가고 이벤트에서 계산한
//   유형 라벨이 참가자가 나중에 앱에서 받는 라벨과 달라진다. 실패로 다룬다.
try {
  const fresh = await bundleEventDna();
  if (norm(read('event-dna.js')) !== norm(fresh)) {
    bad('event-dna.js가 앱 소스와 다릅니다 — node scripts/build-event-dna.mjs 로 다시 만드세요');
  } else {
    ok('event-dna.js 최신 (앱 문항·채점과 동일)');
  }
} catch (e) {
  bad(`event-dna.js 검사 실패: ${e.message}`);
}
```

- [ ] **Step 8: 게시 목록에 추가**

`scripts/lib/pagesFiles.mjs`의 `PUBLISHED_FILES` 배열에 한 줄 추가한다(`event.html`은 Task 5에서 추가한다):

```js
  'event-dna.js',            // 행사 이벤트 페이지가 쓰는 생성물 (scripts/build-event-dna.mjs)
```

- [ ] **Step 9: 전체 검증**

```powershell
npx tsc --noEmit
npm test
```

Expected: `tsc` 오류 0. `npm test`에서 `event-dna 번들` 블록 전부 ✓, 공개 문서 검사에 `✓ event-dna.js 최신` 출력. `⚠ 게시 대기 1건: event-dna.js` 경고는 정상이다(아직 gh-pages에 안 올렸다).

- [ ] **Step 10: 최신성 검사가 실제로 잡는지 확인 (게이트가 살아 있는지)**

```powershell
node -e "const f=require('node:fs');f.appendFileSync('docs/event-dna.js','\n// 손댄 흔적\n')"
npm test
```

Expected: **FAIL** — `✗ event-dna.js가 앱 소스와 다릅니다`. 확인했으면 되돌린다:

```powershell
node scripts/build-event-dna.mjs
npm test
```

Expected: 다시 통과. **이 단계를 건너뛰지 말 것** — 검사가 항상 통과하도록 잘못 짜여 있어도 Step 9만으로는 구분되지 않는다.

- [ ] **Step 11: Commit**

```bash
git add scripts/event-dna-entry.ts scripts/build-event-dna.mjs scripts/event-dna.verify.mjs docs/event-dna.js scripts/run-verify.mjs scripts/check-docs-sync.mjs scripts/lib/pagesFiles.mjs
git commit -m "feat(event): 행사 설문 번들 생성 파이프라인 — 앱 문항·채점을 그대로 번들, npm test가 최신성 강제"
```

---

### Task 2: Supabase 스키마

**Files:**
- Modify: `supabase/schema.sql` (파일 끝에 섹션 추가)
- Create: `scripts/event-schema.verify.mjs`
- Modify: `supabase/SERVER-STATE.md` (반영 상태 기록)

**Interfaces:**
- Consumes: 없음
- Produces: `public.event_participants` 테이블. 이후 태스크가 쓰는 컬럼 이름 —
  `id, event_code, name, gender('m'|'f'), gender_pref('same'|'any'), instagram, wish_countries text[], answers jsonb, consent_pii, consent_share, created_at`

- [ ] **Step 1: 검증 파일 작성 (아직 실패해야 한다)**

`scripts/event-schema.verify.mjs`:

```js
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
```

- [ ] **Step 2: 검증이 실패하는지 확인**

Run: `node node_modules/tsx/dist/cli.mjs scripts/event-schema.verify.mjs`

Expected: FAIL — 테이블 생성부터 대부분 ✗.

- [ ] **Step 3: `supabase/schema.sql` 끝에 섹션 추가**

```sql
-- ============================================================
-- 오프라인 행사 메이트 매칭 이벤트 (2026-08-09)
-- 설계: docs/superpowers/specs/2026-08-09-event-mate-matching-design.md
--
-- 앱과 무관한 일회성 테이블이다. 행사 종료 30일 뒤 scripts/event-purge.mjs로 파기하고
-- INSERT 정책도 함께 drop 한다(정책이 살아 있으면 누구든 계속 행을 넣을 수 있다).
-- ============================================================
create table if not exists public.event_participants (
  id             uuid primary key default gen_random_uuid(),
  event_code     text not null,
  name           text not null,
  gender         text not null check (gender in ('m','f')),
  gender_pref    text not null check (gender_pref in ('same','any')),
  instagram      text not null,           -- @ 없이 소문자로 정규화해 저장
  wish_countries text[] not null,
  answers        jsonb not null,          -- {"1":"A","5":"B", ...} 문항 id → 선택
  consent_pii    boolean not null,
  consent_share  boolean not null,
  created_at     timestamptz default now()
);

-- 중복 제출 차단. 두 행이 들어가면 그 사람이 두 명으로 매칭되고,
-- 짝 중 한쪽은 이미 임자가 있는 사람을 받는다.
create unique index if not exists event_participants_uniq
  on public.event_participants (event_code, instagram);

alter table public.event_participants enable row level security;

-- ⚠️ RLS 정책만으로는 부족하다. Supabase는 public 스키마 신규 테이블에 anon·authenticated
--    기본 권한을 주므로, 테이블 권한부터 걷어내고 필요한 것만 다시 준다.
revoke all on public.event_participants from anon, authenticated;
grant insert on public.event_participants to anon;
-- 읽기·수정·삭제는 아무에게도 주지 않는다 → service_role(로컬 스크립트)만 가능.
-- 정적 페이지에 박히는 anon 키는 누구나 소스에서 꺼내볼 수 있어서, SELECT가 열리는 순간
-- 참가자 전원의 이름과 인스타 아이디가 그대로 유출된다.

drop policy if exists event_participants_insert on public.event_participants;
create policy event_participants_insert on public.event_participants
  for insert to anon
  with check (
    event_code = 'popup01'                   -- ⚠️ Task 6에서 실제 행사 코드로 교체
    and consent_pii and consent_share
    and char_length(name) between 1 and 40
    and instagram ~ '^[a-z0-9._]{1,30}$'
    and array_length(wish_countries, 1) between 1 and 3
  );
```

- [ ] **Step 4: 검증 통과 확인**

```powershell
node node_modules/tsx/dist/cli.mjs scripts/event-schema.verify.mjs
npm test
```

Expected: 전 항목 ✓, `npm test` 통과.

- [ ] **Step 5: `supabase/SERVER-STATE.md`에 반영 대기로 기록**

문서 형식을 먼저 읽고(`Read supabase/SERVER-STATE.md`) 기존 항목과 같은 형식으로 한 줄 추가한다. 내용은 다음을 담는다:

- 항목: `event_participants` 테이블·유니크 인덱스·RLS·grant (2026-08-09 추가)
- 상태: **서버 미반영** — Supabase SQL Editor에서 schema.sql의 해당 섹션 실행 필요
- 주의: 행사 코드를 확정(Task 6)한 뒤 실행해야 `with check`의 `popup01`이 맞다

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql scripts/event-schema.verify.mjs supabase/SERVER-STATE.md
git commit -m "feat(event): event_participants 테이블·RLS·권한 — anon은 INSERT만, 중복 제출은 유니크 인덱스로 차단"
```

---

### Task 3: 매칭 엔진 (순수 로직)

네트워크·파일 입출력 없이 배열만 받아 짝을 짓는 모듈. 테스트가 붙는 곳은 여기뿐이다.

**Files:**
- Create: `scripts/event-match-core.mjs`
- Create: `scripts/event-match-core.verify.mjs`

**Interfaces:**
- Consumes: `docs/event-dna.js`의 `scoreAxes`, `makeTypeLabel`, `DNA_AXES` (Task 1)
- Produces:
  - `type Row = {id, name, gender, gender_pref, instagram, wish_countries, answers, created_at}`
  - `preparePeople(rows: Row[]): Person[]` — `Person = Row & {scores, label}`, `created_at`→`id` 순 정렬
  - `rarityOf(people): Map<string, number>` — 나라명 → `1 / 그 나라를 고른 사람 수`
  - `axisScore(a, b): number` — 0~70
  - `countryScore(a, b, rarity, maxRarity): {score: number, shared: string[]}` — score 0~30
  - `isEligible(a, b): boolean`
  - `pairScore(a, b, rarity, maxRarity): {total, axis, country, shared}`
  - `matchAll(people): {pairs, trios, unmatched}` — `pairs: {a, b, score, shared}[]`, `trios: {a, b, c}[]`, `unmatched: {person, reason}[]`
  - `renderMessage({me, partners, score, shared, eventName}): string`

- [ ] **Step 1: 검증 파일 작성 (아직 실패해야 한다)**

`scripts/event-match-core.verify.mjs`:

```js
// 매칭 엔진 검증. 여기서 틀리면 엉뚱한 사람에게 남의 인스타 아이디가 발송된다.
import {
  preparePeople, rarityOf, axisScore, countryScore, isEligible, pairScore, matchAll, renderMessage,
} from './event-match-core.mjs';
import { EVENT_QUESTIONS } from '../docs/event-dna.js';

let fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const near = (got, want, tol, msg) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${got}, want ~${want}`}`);
  if (!ok) fail++;
};

const answersAll = (choice) => Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, choice]));
let seq = 0;
const person = (over = {}) => ({
  id: `p${++seq}`, name: `사람${seq}`, gender: 'f', gender_pref: 'any',
  instagram: `user${seq}`, wish_countries: ['일본'], answers: answersAll('A'),
  created_at: `2026-08-09T10:0${seq}:00Z`, ...over,
});

console.log('매칭 엔진');

// ── 성향 점수 ──
{
  const [a, b] = preparePeople([person(), person()]);
  eq(axisScore(a, b), 70, '응답이 같으면 성향 만점 70');
}
{
  const [a, b] = preparePeople([person(), person({ answers: answersAll('B') })]);
  near(axisScore(a, b), 0, 1, '정반대 응답이면 성향 0점 근처');
}

// ── 나라 겹침: 희소성 가중 ──
{
  const people = preparePeople([
    person({ wish_countries: ['일본', '아이슬란드'] }),
    person({ wish_countries: ['일본', '아이슬란드'] }),
    person({ wish_countries: ['일본'] }),
    person({ wish_countries: ['일본'] }),
  ]);
  const rarity = rarityOf(people);
  eq(rarity.get('일본'), 1 / 4, '일본 rarity = 1/4 (4명이 골랐다)');
  eq(rarity.get('아이슬란드'), 1 / 2, '아이슬란드 rarity = 1/2 (2명)');
  const max = Math.max(...rarity.values());
  const rare = countryScore(people[0], people[1], rarity, max);
  const common = countryScore(people[2], people[3], rarity, max);
  eq(rare.shared, ['일본', '아이슬란드'], '겹친 나라 목록');
  eq(rare.score > common.score, true, '희귀한 나라가 겹치면 점수가 더 높다');
  eq(countryScore(people[0], person({ wish_countries: ['페루'] }), rarity, max).score, 0, '겹침 없으면 0');
}

// ── 성별 조건: 양쪽이 모두 만족해야 한다 ──
{
  const f_same = person({ gender: 'f', gender_pref: 'same' });
  const f_any = person({ gender: 'f', gender_pref: 'any' });
  const m_any = person({ gender: 'm', gender_pref: 'any' });
  const m_same = person({ gender: 'm', gender_pref: 'same' });
  eq(isEligible(f_same, f_any), true, '여-same ↔ 여-any: 동성이라 성립');
  eq(isEligible(f_same, m_any), false, '여-same ↔ 남-any: 한쪽이 same이면 이성 불가');
  eq(isEligible(f_any, m_any), true, '둘 다 any면 이성도 성립');
  eq(isEligible(m_same, f_same), false, 'same끼리라도 이성이면 불가');
}

// ── 짝짓기 ──
{
  // 4명 → 2쌍. 응답이 같은 사람끼리 붙어야 한다.
  const people = preparePeople([
    person({ id: 'x1', answers: answersAll('A') }),
    person({ id: 'x2', answers: answersAll('B') }),
    person({ id: 'x3', answers: answersAll('A') }),
    person({ id: 'x4', answers: answersAll('B') }),
  ]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 2, '4명 → 2쌍');
  eq(trios.length, 0, '3인조 없음');
  eq(unmatched.length, 0, '미매칭 없음');
  const ids = pairs.map((p) => [p.a.id, p.b.id].sort().join('+')).sort();
  eq(ids, ['x1+x3', 'x2+x4'], '성향이 같은 사람끼리 묶인다');
}
{
  // 홀수 → 남는 1명은 최고점 짝에 붙어 3인조가 된다
  const people = preparePeople([person(), person(), person()]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 0, '3명 → 남는 쌍 없음(3인조로 흡수)');
  eq(trios.length, 1, '3인조 1개');
  eq([trios[0].a, trios[0].b, trios[0].c].every(Boolean), true, '3인조에 세 사람이 다 있다');
  eq(unmatched.length, 0, '미매칭 없음');
}
{
  // 성별 조건 때문에 아무와도 못 묶이는 사람은 사유와 함께 남는다
  const people = preparePeople([
    person({ id: 'f1', gender: 'f', gender_pref: 'same' }),
    person({ id: 'f2', gender: 'f', gender_pref: 'same' }),
    person({ id: 'm1', gender: 'm', gender_pref: 'same' }),
  ]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 1, '여성 2명이 한 쌍');
  eq(trios.length, 0, '조건에 안 맞는 사람을 3인조로 밀어넣지 않는다');
  eq(unmatched.map((u) => u.person.id), ['m1'], '남은 사람은 미매칭으로 보고된다');
  eq(typeof unmatched[0].reason, 'string', '사유 문구 존재');
}
{
  // 결정론 — 두 번 돌려도 같은 결과여야 한다(이미 보낸 DM과 어긋나면 안 된다)
  const mk = () => preparePeople([person(), person(), person(), person()]);
  seq = 0; const first = matchAll(mk());
  seq = 0; const second = matchAll(mk());
  eq(first.pairs.map((p) => [p.a.id, p.b.id]), second.pairs.map((p) => [p.a.id, p.b.id]), '같은 입력 → 같은 짝');
}

// ── 발송 문구 ──
{
  const [me, partner] = preparePeople([person({ name: '준상', instagram: 'yun' }), person({ name: '지민', instagram: 'jimin' })]);
  const msg = renderMessage({ me, partners: [partner], score: 87, shared: ['아이슬란드'], eventName: 'eOrth 팝업 이벤트' });
  eq(msg.includes('준상'), true, '내 이름 포함');
  eq(msg.includes('@jimin'), true, '상대 아이디 포함');
  eq(msg.includes('@yun'), false, '내 아이디는 내 문구에 안 들어간다');
  eq(msg.includes('87%'), true, '매칭률 포함');
  eq(msg.includes('아이슬란드'), true, '겹친 나라 포함');
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 검증이 실패하는지 확인**

Run: `node node_modules/tsx/dist/cli.mjs scripts/event-match-core.verify.mjs`

Expected: FAIL — `Cannot find module .../event-match-core.mjs`.

- [ ] **Step 3: 매칭 엔진 구현**

`scripts/event-match-core.mjs`:

```js
/**
 * 행사 매칭 엔진 (순수 로직 — 네트워크·파일 입출력 없음)
 *
 * 점수 100 = 성향 7축 70 + 희망 국가 겹침 30.
 * 설계: docs/superpowers/specs/2026-08-09-event-mate-matching-design.md §7
 */
import { scoreAxes, makeTypeLabel, DNA_AXES } from '../docs/event-dna.js';

const AXIS_POINTS = 70 / DNA_AXES.length;   // 축당 10점
const COUNTRY_POINTS = 30;

/** 행에 축 점수와 유형 라벨을 붙이고 결정론적 순서로 정렬한다. */
export function preparePeople(rows) {
  return rows
    .map((r) => {
      const scores = scoreAxes(r.answers ?? {});
      return { ...r, scores, label: makeTypeLabel(scores) };
    })
    // 동점일 때 순서가 결과를 가르므로 정렬을 고정한다 — 두 번 돌려도 같은 짝이 나와야 한다
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)) || String(x.id).localeCompare(String(y.id)));
}

/**
 * 나라별 희소성 — 이 행사 참가자 풀 안에서 계산한다.
 * 30명짜리 풀에서는 절반이 일본을 고르는 게 정상이라, 앱의 전체 사용자 기준을 쓰면 의미가 없다.
 */
export function rarityOf(people) {
  const count = new Map();
  for (const p of people) {
    for (const c of new Set(p.wish_countries ?? [])) count.set(c, (count.get(c) ?? 0) + 1);
  }
  const rarity = new Map();
  for (const [c, n] of count) rarity.set(c, 1 / n);
  return rarity;
}

/**
 * 성향 유사도 — 축당 10점.
 * 나누는 값이 100이 아니라 50인 이유: 무작위 두 사람의 축별 평균 차가 약 33이다.
 * 100으로 나누면 아무나 0.67을 받아 변별력이 사라진다.
 */
export function axisScore(a, b) {
  let sum = 0;
  for (const axis of DNA_AXES) {
    const d = Math.abs(a.scores[axis] - b.scores[axis]);
    sum += AXIS_POINTS * Math.max(0, 1 - d / 50);
  }
  return sum;
}

export function countryScore(a, b, rarity, maxRarity) {
  const mine = new Set(a.wish_countries ?? []);
  const shared = (b.wish_countries ?? []).filter((c) => mine.has(c));
  if (shared.length === 0 || !maxRarity) return { score: 0, shared: [] };
  const overlap = shared.reduce((s, c) => s + (rarity.get(c) ?? 0), 0);
  // 가장 희귀한 나라 하나가 겹치면 만점. 흔한 나라는 여러 개 겹쳐야 만점에 닿는다.
  return { score: COUNTRY_POINTS * Math.min(1, overlap / maxRarity), shared };
}

/** 성별 조건 — 한쪽이라도 'same'이면 동성이어야 한다. 양쪽이 모두 만족할 때만 후보다. */
export function isEligible(a, b) {
  if (a.id === b.id) return false;
  const sameGender = a.gender === b.gender;
  if (a.gender_pref === 'same' && !sameGender) return false;
  if (b.gender_pref === 'same' && !sameGender) return false;
  return true;
}

export function pairScore(a, b, rarity, maxRarity) {
  const axis = axisScore(a, b);
  const { score: country, shared } = countryScore(a, b, rarity, maxRarity);
  return { total: Math.round(axis + country), axis, country, shared };
}

/**
 * 짝짓기 — 점수 내림차순 그리디.
 *
 * 최적해(최대가중매칭)를 쓰지 않는 이유: 수십~백 명 규모에서 총점 차이가 몇 % 수준인 데 비해
 * 구현·검증 부담이 크다. 대신 동점은 (created_at, id) 순서로 갈라 항상 같은 결과가 나오게 한다.
 */
export function matchAll(people) {
  const rarity = rarityOf(people);
  const maxRarity = rarity.size ? Math.max(...rarity.values()) : 0;

  const candidates = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      if (!isEligible(a, b)) continue;
      candidates.push({ a, b, ...pairScore(a, b, rarity, maxRarity) });
    }
  }
  // 동점이면 먼저 제출한 사람 쪽이 앞선다 — 입력이 같으면 결과가 항상 같아야 한다
  candidates.sort((x, y) => (y.total - x.total)
    || String(x.a.created_at).localeCompare(String(y.a.created_at))
    || String(x.a.id).localeCompare(String(y.a.id))
    || String(x.b.id).localeCompare(String(y.b.id)));

  const taken = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (taken.has(c.a.id) || taken.has(c.b.id)) continue;
    taken.add(c.a.id); taken.add(c.b.id);
    pairs.push({ a: c.a, b: c.b, score: c.total, shared: c.shared });
  }

  // 남은 사람은 이미 만들어진 짝 중 '양쪽 모두와 성별 조건이 맞는' 최고점 짝에 붙여 3인조로.
  // "짝이 없습니다"를 보내는 것보다 낫고, 성비가 기울면 실제로 발생한다.
  const trios = [];
  const unmatched = [];
  const usedPair = new Set();
  for (const p of people) {
    if (taken.has(p.id)) continue;
    let best = null;
    for (const pair of pairs) {
      if (usedPair.has(pair)) continue;
      if (!isEligible(p, pair.a) || !isEligible(p, pair.b)) continue;
      const s = pairScore(p, pair.a, rarity, maxRarity).total + pairScore(p, pair.b, rarity, maxRarity).total;
      if (!best || s > best.s) best = { pair, s };
    }
    if (best) {
      usedPair.add(best.pair);
      trios.push({ a: best.pair.a, b: best.pair.b, c: p });
      taken.add(p.id);
    } else {
      unmatched.push({
        person: p,
        reason: pairs.length === 0
          ? '함께 묶을 참가자가 없습니다(성별 조건 또는 참가자 수)'
          : '성별 조건에 맞는 짝이 없습니다',
      });
    }
  }
  // 3인조로 승격된 짝은 pairs에서 뺀다 — 안 빼면 같은 사람에게 문구가 두 번 나간다
  return { pairs: pairs.filter((p) => !usedPair.has(p)), trios, unmatched };
}

/** 한 사람에게 보낼 DM 문구. partners는 1명(짝) 또는 2명(3인조). */
export function renderMessage({ me, partners, score, shared, eventName }) {
  const who = partners.map((p) => `@${p.instagram} (${p.name} · ${p.label.ko})`).join('\n');
  const many = partners.length > 1;
  const lines = [
    `${me.name}님, ${eventName} 결과입니다 🌍`,
    ``,
    `${me.name}님의 여행 유형은 "${me.label.ko}"예요.`,
    `매칭된 ${many ? '분들' : '분'} (매칭률 ${score}%):`,
    who,
  ];
  if (shared.length) lines.push(`${many ? '세' : '두'} 분 다 ${shared.join('·')}에 가고 싶다고 하셨어요.`);
  lines.push(``, `서로의 아이디를 양쪽에 모두 보내드렸어요. 편하게 인사 나눠보세요!`);
  return lines.join('\n');
}
```

- [ ] **Step 4: 검증 통과 확인**

```powershell
node node_modules/tsx/dist/cli.mjs scripts/event-match-core.verify.mjs
npm test
```

Expected: 전 항목 ✓, `npm test` 통과.

- [ ] **Step 5: Commit**

```bash
git add scripts/event-match-core.mjs scripts/event-match-core.verify.mjs
git commit -m "feat(event): 매칭 엔진 — 성향 70 + 희소성 가중 국가 겹침 30, 성별 조건·3인조·결정론"
```

---

### Task 4: 관리자 CLI — 리포트 생성과 파기

**Files:**
- Create: `scripts/event-match.mjs` (조회 + 리포트)
- Create: `scripts/event-purge.mjs` (파기)
- Create: `scripts/fixtures/event-sample.json` (오프라인 검증용 가짜 데이터)
- Modify: `.gitignore` (리포트 산출물 제외)

**Interfaces:**
- Consumes: Task 3의 `preparePeople`·`matchAll`·`renderMessage`·`pairScore`·`rarityOf`, Task 2의 테이블 컬럼
- Produces: `event-report.local.html` (커밋하지 않는 산출물)

- [ ] **Step 1: 가짜 데이터 작성**

`scripts/fixtures/event-sample.json` — 7명(홀수 → 3인조 발생, 성별 조건 혼재). 실제 사람의 정보가 아니다:

```json
[
  {"id":"11111111-1111-4111-8111-111111111111","event_code":"popup01","name":"가영","gender":"f","gender_pref":"same","instagram":"test_gayoung","wish_countries":["일본","아이슬란드"],"answers":{"1":"A","5":"A","6":"A","10":"A","11":"B","15":"B","16":"A","17":"A","21":"A","24":"A","26":"B","27":"B","31":"A","32":"A"},"created_at":"2026-08-09T10:01:00Z"},
  {"id":"22222222-2222-4222-8222-222222222222","event_code":"popup01","name":"나윤","gender":"f","gender_pref":"any","instagram":"test_nayoon","wish_countries":["일본","아이슬란드"],"answers":{"1":"A","5":"A","6":"A","10":"B","11":"B","15":"B","16":"A","17":"A","21":"A","24":"B","26":"B","27":"B","31":"A","32":"A"},"created_at":"2026-08-09T10:02:00Z"},
  {"id":"33333333-3333-4333-8333-333333333333","event_code":"popup01","name":"다은","gender":"f","gender_pref":"same","instagram":"test_daeun","wish_countries":["일본"],"answers":{"1":"B","5":"B","6":"B","10":"B","11":"A","15":"A","16":"B","17":"B","21":"B","24":"B","26":"A","27":"A","31":"B","32":"B"},"created_at":"2026-08-09T10:03:00Z"},
  {"id":"44444444-4444-4444-8444-444444444444","event_code":"popup01","name":"라진","gender":"m","gender_pref":"any","instagram":"test_rajin","wish_countries":["일본","페루"],"answers":{"1":"B","5":"B","6":"B","10":"B","11":"A","15":"A","16":"B","17":"A","21":"B","24":"B","26":"A","27":"A","31":"B","32":"B"},"created_at":"2026-08-09T10:04:00Z"},
  {"id":"55555555-5555-4555-8555-555555555555","event_code":"popup01","name":"마준","gender":"m","gender_pref":"any","instagram":"test_majun","wish_countries":["페루"],"answers":{"1":"A","5":"B","6":"A","10":"B","11":"A","15":"B","16":"A","17":"B","21":"A","24":"B","26":"A","27":"B","31":"A","32":"B"},"created_at":"2026-08-09T10:05:00Z"},
  {"id":"66666666-6666-4666-8666-666666666666","event_code":"popup01","name":"바현","gender":"m","gender_pref":"any","instagram":"test_bahyun","wish_countries":["일본"],"answers":{"1":"A","5":"B","6":"A","10":"B","11":"B","15":"A","16":"A","17":"B","21":"B","24":"A","26":"B","27":"A","31":"B","32":"A"},"created_at":"2026-08-09T10:06:00Z"},
  {"id":"77777777-7777-4777-8777-777777777777","event_code":"popup01","name":"사랑","gender":"f","gender_pref":"any","instagram":"test_sarang","wish_countries":["아이슬란드"],"answers":{"1":"A","5":"A","6":"B","10":"A","11":"B","15":"B","16":"B","17":"A","21":"A","24":"A","26":"B","27":"A","31":"A","32":"B"},"created_at":"2026-08-09T10:07:00Z"}
]
```

- [ ] **Step 2: 리포트 CLI 구현**

`scripts/event-match.mjs`:

```js
/**
 * 행사 매칭 리포트 생성기 (로컬 전용)
 *
 *   node scripts/event-match.mjs --event popup01
 *   node scripts/event-match.mjs --event popup01 --exclude test_gayoung,test_nayoon
 *   node scripts/event-match.mjs --fixture scripts/fixtures/event-sample.json   # 네트워크 없이
 *
 * service_role 키는 .env에서만 읽는다(웹에 절대 나가지 않는다).
 * 산출: event-report.local.html — 참가자 아이디가 들어 있으므로 커밋하지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { preparePeople, matchAll, renderMessage, pairScore, rarityOf } from './event-match-core.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const EVENT_NAME = 'eOrth 팝업 이벤트';   // ⚠️ Task 6에서 확정
const OUT = 'event-report.local.html';

/** .env 파서 — 이 저장소에 dotenv가 없어서 직접 읽는다(따옴표·주석만 처리하면 충분하다) */
function readEnv() {
  const out = {};
  let text = '';
  try { text = readFileSync('.env', 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function fetchRows(eventCode) {
  const env = readEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ .env에 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
    console.error('   service_role 키는 Supabase 대시보드 > Project Settings > API에서 확인합니다.');
    process.exit(1);
  }
  const q = `${url}/rest/v1/event_participants?event_code=eq.${encodeURIComponent(eventCode)}&select=*&order=created_at.asc`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`❌ 조회 실패 ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderReport({ pairs, trios, unmatched }, total) {
  // 사람별 카드 — 발송은 전부 수동이라 '누구까지 보냈는지'를 리포트가 기억해야 한다.
  // 참가자가 적은 값(이름)이 HTML에 들어가므로 전부 esc()를 거친다.
  const cards = [];
  const push = (me, partners, score, shared) => {
    const msg = renderMessage({ me, partners, score, shared, eventName: EVENT_NAME });
    cards.push(`
      <div class="card" data-key="${esc(me.instagram)}">
        <label class="done"><input type="checkbox" data-check="${esc(me.instagram)}"> 발송함</label>
        <div class="who">@${esc(me.instagram)} · ${esc(me.name)} <span class="label">${esc(me.label.ko)}</span></div>
        <div class="meta">매칭률 ${score}% · 상대 ${partners.map((p) => '@' + esc(p.instagram)).join(', ')}</div>
        <textarea readonly rows="9">${esc(msg)}</textarea>
        <div class="row">
          <button class="copy">문구 복사</button>
          <a class="dm" href="https://instagram.com/${esc(me.instagram)}" target="_blank" rel="noreferrer">DM 열기 ↗</a>
        </div>
      </div>`);
  };

  for (const p of pairs) {
    push(p.a, [p.b], p.score, p.shared);
    push(p.b, [p.a], p.score, p.shared);
  }
  // 3인조는 상대가 둘이라 단일 점수가 없다 — 두 상대와의 평균을 쓴다(0%로 나가면 안 된다)
  for (const t of trios) {
    const rarity = rarityOf([t.a, t.b, t.c]);
    const max = rarity.size ? Math.max(...rarity.values()) : 0;
    const avg = (x, y, z) => Math.round((pairScore(x, y, rarity, max).total + pairScore(x, z, rarity, max).total) / 2);
    const sharedOf = (x, y, z) => [...new Set([
      ...pairScore(x, y, rarity, max).shared, ...pairScore(x, z, rarity, max).shared,
    ])];
    push(t.a, [t.b, t.c], avg(t.a, t.b, t.c), sharedOf(t.a, t.b, t.c));
    push(t.b, [t.a, t.c], avg(t.b, t.a, t.c), sharedOf(t.b, t.a, t.c));
    push(t.c, [t.a, t.b], avg(t.c, t.a, t.b), sharedOf(t.c, t.a, t.b));
  }

  const warn = unmatched.length
    ? `<div class="warn"><b>미매칭 ${unmatched.length}명</b><ul>${unmatched
        .map((u) => `<li>@${esc(u.person.instagram)} (${esc(u.person.name)}) — ${esc(u.reason)}</li>`).join('')}</ul>
        <p>이분들께는 유형 결과만 따로 보내거나, 다음 행사 안내를 보내세요.</p></div>`
    : '';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(EVENT_NAME)} 매칭 리포트</title><style>
body{background:#0A0A0F;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:24px;line-height:1.6}
h1{font-size:20px} .sum{color:#A1A1B0;margin-bottom:20px}
.card{background:#2E2E3B;border:1px solid #1A1A26;border-radius:12px;padding:14px;margin-bottom:12px}
.card.sent{opacity:.45}
.who{font-weight:700} .label{color:#BF85FC;font-weight:400;font-size:13px}
.meta{color:#A1A1B0;font-size:13px;margin-bottom:8px}
textarea{width:100%;background:#0A0A0F;color:#fff;border:1px solid #1A1A26;border-radius:8px;padding:10px;font:13px/1.5 system-ui;resize:vertical}
.row{display:flex;gap:8px;align-items:center;margin-top:8px}
button,.dm{background:#BF85FC;color:#0A0A0F;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;text-decoration:none;font-size:13px}
.done{float:right;color:#A1A1B0;font-size:13px}
.warn{background:#2E2E3B;border-left:4px solid #FF3B30;border-radius:8px;padding:12px;margin:20px 0}
</style></head><body>
<h1>${esc(EVENT_NAME)} 매칭 리포트</h1>
<div class="sum">참가 ${total}명 · 짝 ${pairs.length}쌍 · 3인조 ${trios.length}개 · 미매칭 ${unmatched.length}명</div>
${warn}
${cards.join('\n')}
<script>
// 발송 체크는 localStorage에 남긴다 — 수십 명을 손으로 보내다 보면 어디까지 했는지 반드시 헷갈린다
const KEY='event-sent';
const sent=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
for(const box of document.querySelectorAll('[data-check]')){
  const k=box.dataset.check;
  box.checked=sent.has(k);
  box.closest('.card').classList.toggle('sent',box.checked);
  box.addEventListener('change',()=>{
    box.checked?sent.add(k):sent.delete(k);
    box.closest('.card').classList.toggle('sent',box.checked);
    localStorage.setItem(KEY,JSON.stringify([...sent]));
  });
}
for(const b of document.querySelectorAll('.copy')){
  b.addEventListener('click',()=>{
    navigator.clipboard.writeText(b.closest('.card').querySelector('textarea').value);
    b.textContent='복사됨';setTimeout(()=>b.textContent='문구 복사',1200);
  });
}
</script></body></html>`;
}

const fixture = arg('fixture');
const eventCode = arg('event');
if (!fixture && !eventCode) {
  console.error('사용법: node scripts/event-match.mjs --event <행사코드> [--exclude id1,id2] [--fixture <파일>]');
  process.exit(1);
}

let rows = fixture ? JSON.parse(readFileSync(fixture, 'utf8')) : await fetchRows(eventCode);

const exclude = new Set((arg('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
if (exclude.size) {
  const before = rows.length;
  rows = rows.filter((r) => !exclude.has(r.instagram) && !exclude.has(r.id));
  console.log(`제외 ${before - rows.length}명`);
}

const people = preparePeople(rows);
const result = matchAll(people);
writeFileSync(OUT, renderReport(result, people.length), 'utf8');

console.log(`참가 ${people.length}명 → 짝 ${result.pairs.length}쌍, 3인조 ${result.trios.length}개, 미매칭 ${result.unmatched.length}명`);
for (const u of result.unmatched) console.log(`  ⚠ @${u.person.instagram} — ${u.reason}`);
console.log(`리포트: ${OUT} (브라우저로 여세요)`);
```

- [ ] **Step 3: 오프라인으로 돌려 확인**

```powershell
node scripts/event-match.mjs --fixture scripts/fixtures/event-sample.json
```

Expected: `참가 7명 → ...` 형태로 **7명이 전원 배정되고 미매칭 0명**(짝 2쌍 + 3인조 1개, 또는 짝 3쌍 + 남는 1명이 3인조로 흡수). `event-report.local.html`이 생성된다.

브라우저로 열어 눈으로 확인할 것:
- 카드가 **7개**(사람 수만큼) 있는가 — 짝은 양쪽 모두에게 문구가 나와야 한다
- 문구에 **자기 아이디가 아니라 상대 아이디**가 들어 있는가 (여기서 틀리면 자기 자신을 소개하는 DM이 나간다)
- 매칭률이 `0%`가 아닌가 (3인조 평균 점수가 들어갔는가)
- "발송함" 체크 후 새로고침해도 유지되는가

- [ ] **Step 4: 파기 스크립트 구현**

`scripts/event-purge.mjs`:

```js
/**
 * 행사 데이터 파기 (로컬 전용)
 *
 *   node scripts/event-purge.mjs --event popup01            # 몇 건인지만 보여준다
 *   node scripts/event-purge.mjs --event popup01 --confirm  # 실제 삭제
 *
 * 보관 기간은 '행사 종료 후 30일'이다(개인정보 고지와 같은 값이어야 한다).
 * 삭제 후 Supabase SQL Editor에서 INSERT 정책도 내린다:
 *   drop policy if exists event_participants_insert on public.event_participants;
 */
import { readFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

function readEnv() {
  const out = {};
  let text = '';
  try { text = readFileSync('.env', 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const eventCode = arg('event');
if (!eventCode) {
  console.error('사용법: node scripts/event-purge.mjs --event <행사코드> [--confirm]');
  process.exit(1);
}
const confirmed = process.argv.includes('--confirm');

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ .env에 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const filter = `event_code=eq.${encodeURIComponent(eventCode)}`;

const countRes = await fetch(`${url}/rest/v1/event_participants?${filter}&select=id`, { headers });
if (!countRes.ok) { console.error(`❌ 조회 실패 ${countRes.status}: ${await countRes.text()}`); process.exit(1); }
const rows = await countRes.json();
console.log(`행사 ${eventCode}: ${rows.length}건`);

if (!confirmed) {
  console.log('실제로 지우려면 --confirm 을 붙이세요. (되돌릴 수 없습니다)');
  process.exit(0);
}

const del = await fetch(`${url}/rest/v1/event_participants?${filter}`, {
  method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' },
});
if (!del.ok) { console.error(`❌ 삭제 실패 ${del.status}: ${await del.text()}`); process.exit(1); }
const deleted = await del.json();
console.log(`✅ ${deleted.length}건 삭제했습니다.`);
console.log('마지막으로 SQL Editor에서 INSERT 정책도 내리세요:');
console.log('  drop policy if exists event_participants_insert on public.event_participants;');
```

- [ ] **Step 5: 파기 스크립트 안전장치 확인**

```powershell
node scripts/event-purge.mjs
```

Expected: 사용법 출력 후 종료코드 1. `--confirm` 없이 실행하면 건수만 보고 지우지 않는다는 것도 확인한다(`.env`에 service_role 키가 없으면 그 앞에서 멈추는 것이 정상 — 키는 Task 6 운영 단계에서 넣는다).

- [ ] **Step 6: `.gitignore`에 산출물 추가**

`.gitignore` 끝에 추가:

```
# 행사 매칭 리포트 — 참가자 인스타 아이디가 들어 있는 로컬 산출물(커밋 금지)
event-report.local.html
```

- [ ] **Step 7: 검증**

```powershell
git status --short
npm test
```

Expected: `git status`에 `event-report.local.html`이 **나타나지 않는다**(미추적 파일이 남아 있으면 EAS 빌드가 멈춘다). `npm test` 통과.

- [ ] **Step 8: Commit**

```bash
git add scripts/event-match.mjs scripts/event-purge.mjs scripts/fixtures/event-sample.json .gitignore
git commit -m "feat(event): 매칭 리포트·파기 CLI — service_role은 .env에서만, 발송 체크는 리포트가 기억"
```

---

### Task 5: 설문 페이지 `docs/event.html`

**Files:**
- Create: `docs/event.html`
- Modify: `scripts/lib/pagesFiles.mjs` (`PUBLISHED_FILES`에 `event.html` 추가)

**Interfaces:**
- Consumes: `./event-dna.js`의 `EVENT_QUESTIONS`, `COUNTRIES`, `scoreAxes`, `makeTypeLabel`, `DNA_AXES`, `DNA_LABELS`, `normalizeInstagram` (Task 1)
- Produces: `event_participants` 행 1건 (Task 2 스키마)

- [ ] **Step 1: Supabase 접속 값 확인**

```powershell
node -e "const f=require('node:fs');const t=f.readFileSync('.env','utf8');for(const l of t.split(/\r?\n/))if(/^EXPO_PUBLIC_SUPABASE_/.test(l))console.log(l)"
```

출력된 URL과 anon 키를 Step 2의 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 자리에 그대로 박는다. **anon 키는 이미 앱 번들에 들어가 공개된 값이라 정적 페이지에 넣어도 새로 노출되는 것이 없다.** 방어선은 RLS다(Task 2).

- [ ] **Step 2: 페이지 뼈대 작성 (마크업 + 스타일)**

`docs/event.html` — 아래 내용으로 만든다. `<script type="module">` 본문은 Step 3에서 채운다.

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>eOrth 팝업 이벤트 — 여행 메이트 찾기</title>
<style>
  :root{--bg:#0A0A0F;--card:#2E2E3B;--neon:#BF85FC;--dim:#A1A1B0;--line:#1A1A26;--red:#FF3B30}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:#fff;font-family:system-ui,-apple-system,sans-serif;
       line-height:1.6;padding:24px 20px calc(40px + env(safe-area-inset-bottom))}
  .wrap{max-width:520px;margin:0 auto}
  h1{font-size:26px;margin:8px 0 4px}
  p.sub{color:var(--dim);margin:0 0 24px}
  .bar{height:4px;background:var(--line);border-radius:2px;margin-bottom:20px}
  .bar>i{display:block;height:100%;background:var(--neon);border-radius:2px;transition:width .2s}
  .q{font-size:20px;font-weight:700;margin:8px 0 20px}
  button.opt{display:block;width:100%;text-align:left;background:var(--card);color:#fff;border:1px solid var(--line);
             border-radius:14px;padding:16px;margin-bottom:12px;font-size:16px;line-height:1.4;cursor:pointer}
  button.opt:active{border-color:var(--neon)}
  label{display:block;color:var(--dim);font-size:13px;margin:16px 0 6px}
  input[type=text]{width:100%;background:var(--card);color:#fff;border:1px solid var(--line);
                   border-radius:12px;padding:14px;font-size:16px}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chip{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer}
  .chip.on{border-color:var(--neon);color:var(--neon)}
  .cta{width:100%;background:var(--neon);color:var(--bg);border:0;border-radius:14px;padding:16px;
       font-size:17px;font-weight:800;cursor:pointer;margin-top:24px}
  .cta:disabled{opacity:.4}
  .err{color:var(--red);font-size:14px;margin-top:8px;min-height:20px}
  .consent{background:var(--card);border-radius:12px;padding:14px;margin-top:16px;font-size:14px}
  .consent table{width:100%;border-collapse:collapse;font-size:13px;color:var(--dim);margin:8px 0}
  .consent td{border-top:1px solid var(--line);padding:6px 0;vertical-align:top}
  .consent td:first-child{width:88px;color:#fff}
  .check{display:flex;gap:10px;align-items:flex-start;margin-top:10px}
  .type{font-size:30px;font-weight:800;color:var(--neon);margin:12px 0}
  .axis{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;color:var(--dim)}
  .axis .track{flex:1;height:6px;background:var(--line);border-radius:3px;position:relative}
  .axis .dot{position:absolute;top:-3px;width:12px;height:12px;border-radius:6px;background:var(--neon);transform:translateX(-50%)}
  .hide{display:none}
</style>
</head>
<body>
<div class="wrap">

  <section id="intro">
    <h1>여행 메이트 찾기</h1>
    <p class="sub">14문항, 약 1분 30초.<br>행사가 끝나면 성향이 가장 잘 맞는 분을 인스타 DM으로 알려드려요.</p>
    <p class="sub" style="font-size:13px">※ 결과는 인스타그램 DM으로만 보내드립니다. 인스타 계정이 필요해요.</p>
    <button class="cta" id="start">시작하기</button>
  </section>

  <section id="survey" class="hide">
    <div class="bar"><i id="progress" style="width:0%"></i></div>
    <div class="q" id="qtext"></div>
    <button class="opt" id="optA"></button>
    <button class="opt" id="optB"></button>
  </section>

  <section id="form" class="hide">
    <h1>거의 끝났어요</h1>
    <p class="sub">결과를 보내드릴 정보만 남겨주세요.</p>

    <label>이름 (인사말에 쓰여요. 본명이 아니어도 괜찮아요)</label>
    <input type="text" id="name" maxlength="20" autocomplete="off">

    <label>성별</label>
    <div class="chips" id="gender">
      <div class="chip" data-v="f">여성</div><div class="chip" data-v="m">남성</div>
    </div>

    <label>매칭 상대</label>
    <div class="chips" id="pref">
      <div class="chip" data-v="same">같은 성별만</div><div class="chip" data-v="any">상관없어요</div>
    </div>

    <label>인스타그램 아이디</label>
    <input type="text" id="insta" placeholder="@travel_kim" autocomplete="off" autocapitalize="off" spellcheck="false">

    <label>가고 싶은 나라 (최대 3개)</label>
    <input type="text" id="csearch" placeholder="나라 검색" autocomplete="off">
    <div class="chips" id="picked" style="margin-top:10px"></div>
    <div class="chips" id="clist" style="margin-top:10px"></div>

    <div class="consent">
      <b>개인정보 수집·이용 및 제3자 제공 안내</b>
      <table>
        <tr><td>수집 항목</td><td>이름, 성별, 인스타그램 아이디, 가고 싶은 나라, 설문 응답</td></tr>
        <tr><td>이용 목적</td><td>행사 참가자 간 여행 성향 매칭 및 결과 발송</td></tr>
        <tr><td>제공 대상</td><td>매칭된 참가자 본인 (제공 항목: 이름·인스타그램 아이디·유형)</td></tr>
        <tr><td>보관 기간</td><td>행사 종료 후 30일, 이후 파기</td></tr>
        <tr><td>거부 권리</td><td>동의하지 않으실 수 있으나, 매칭이 불가능해 참여할 수 없습니다</td></tr>
        <tr><td>국외 이전</td><td>미국 리전 서버에 저장됩니다</td></tr>
      </table>
      <label class="check"><input type="checkbox" id="c1"><span>(필수) 개인정보 수집·이용에 동의합니다</span></label>
      <label class="check"><input type="checkbox" id="c2"><span>(필수) 매칭된 상대에게 내 이름과 인스타그램 아이디가 제공되는 것에 동의합니다</span></label>
      <p style="color:var(--dim);font-size:12px;margin:10px 0 0">만 14세 미만은 참여하실 수 없습니다.</p>
    </div>

    <button class="cta" id="submit">제출하기</button>
    <div class="err" id="err"></div>
  </section>

  <section id="confirm" class="hide">
    <h1>이 계정이 맞나요?</h1>
    <p class="sub">결과를 여기로 보내드려요. 아이디가 틀리면 결과를 받지 못해요.</p>
    <div class="type" id="confirmId"></div>
    <button class="cta" id="confirmYes">네, 맞아요</button>
    <button class="cta" id="confirmNo" style="background:var(--card);color:#fff;margin-top:10px">고칠게요</button>
    <div class="err" id="err2"></div>
  </section>

  <section id="done" class="hide">
    <p class="sub">당신의 여행 유형은</p>
    <div class="type" id="typeKo"></div>
    <div id="axes"></div>
    <p class="sub" style="margin-top:20px">매칭 결과는 행사가 끝난 뒤 인스타 DM으로 보내드려요.<br>기다리는 동안 eOrth를 먼저 둘러보세요 🌍</p>
    <a class="cta" style="display:block;text-align:center;text-decoration:none"
       href="https://apps.apple.com/app/id6778678243">eOrth 앱 보러가기</a>
    <button class="cta" id="again" style="background:var(--card);color:#fff">처음으로</button>
  </section>

</div>

<script type="module">
</script>
</body>
</html>
```

- [ ] **Step 3: 페이지 로직 작성**

Step 2에서 비워둔 `<script type="module">` 안에 아래를 그대로 넣는다.

**⚠️ `innerHTML`을 쓰지 않는다(G4).** 칩과 축 그래프는 `createElement` + `textContent`로 만든다. 나라 이름은 우리 상수에서 오지만, DOM API로 만들면 값이 어디서 오든 마크업으로 해석될 여지가 없다.

```js
import { EVENT_QUESTIONS, COUNTRIES, scoreAxes, makeTypeLabel, DNA_AXES, DNA_LABELS, normalizeInstagram }
  from './event-dna.js';

// ⚠️ 이 세 값은 Task 6에서 확정한다. EVENT_CODE는 RLS with check와 반드시 같아야 한다.
const EVENT_CODE = 'popup01';
const SUPABASE_URL = 'PASTE_EXPO_PUBLIC_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'PASTE_EXPO_PUBLIC_SUPABASE_ANON_KEY';

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of ['intro', 'survey', 'form', 'confirm', 'done']) $(s).classList.toggle('hide', s !== id);
  window.scrollTo(0, 0);
};
/** 자식을 전부 비운다 — innerHTML='' 대신(G4) */
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };

// 답변은 문항마다 저장한다 — 부스 네트워크가 끊겨도, 실수로 새로고침해도 처음부터 다시 하지 않는다
const SAVE_KEY = 'eorth-event-' + EVENT_CODE;
let state = { answers: {}, i: 0, countries: [], gender: null, pref: null };
try { Object.assign(state, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch {}
const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify(state));

// ── 설문 ──
function renderQuestion() {
  if (state.i >= EVENT_QUESTIONS.length) { show('form'); renderCountries(''); return; }
  const q = EVENT_QUESTIONS[state.i];
  $('progress').style.width = `${(state.i / EVENT_QUESTIONS.length) * 100}%`;
  $('qtext').textContent = q.ko.s;
  $('optA').textContent = q.ko.a;
  $('optB').textContent = q.ko.b;
}
const answer = (choice) => {
  state.answers[EVENT_QUESTIONS[state.i].id] = choice;
  state.i += 1;
  save();
  renderQuestion();
};
$('optA').onclick = () => answer('A');
$('optB').onclick = () => answer('B');
$('start').onclick = () => { show('survey'); renderQuestion(); };

// ── 나라 선택 ──
function chip(text, dataKey, dataValue, on) {
  const el = document.createElement('div');
  el.className = on ? 'chip on' : 'chip';
  el.textContent = text;
  el.dataset[dataKey] = dataValue;
  return el;
}
function renderCountries(query) {
  const q = (query || '').trim().toLowerCase();
  const list = q ? COUNTRIES.filter((c) => c.term.includes(q)).slice(0, 12) : [];
  clear($('clist'));
  for (const c of list) $('clist').appendChild(chip(`${c.flag} ${c.name}`, 'c', c.name, false));
  clear($('picked'));
  for (const n of state.countries) $('picked').appendChild(chip(`${n} ✕`, 'del', n, true));
}
$('csearch').oninput = (e) => renderCountries(e.target.value);
$('clist').onclick = (e) => {
  const name = e.target.closest('[data-c]')?.dataset.c;
  if (!name || state.countries.includes(name) || state.countries.length >= 3) return;
  state.countries.push(name); save();
  $('csearch').value = ''; renderCountries('');
};
$('picked').onclick = (e) => {
  const name = e.target.closest('[data-del]')?.dataset.del;
  if (!name) return;
  state.countries = state.countries.filter((c) => c !== name); save(); renderCountries($('csearch').value);
};

// ── 성별·선호 칩 ──
for (const [box, key] of [['gender', 'gender'], ['pref', 'pref']]) {
  $(box).onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v) return;
    state[key] = v; save();
    for (const c of $(box).children) c.classList.toggle('on', c.dataset.v === v);
  };
  // 새로고침 복귀 시 이미 고른 값을 다시 칠한다
  if (state[key]) for (const c of $(box).children) c.classList.toggle('on', c.dataset.v === state[key]);
}

// ── 검증 → 확인 화면 ──
let pendingHandle = null;
$('submit').onclick = () => {
  const name = $('name').value.trim();
  const handle = normalizeInstagram($('insta').value);
  const msgs = [];
  if (!name) msgs.push('이름을 적어주세요.');
  if (!state.gender) msgs.push('성별을 골라주세요.');
  if (!state.pref) msgs.push('매칭 상대 조건을 골라주세요.');
  if (!handle) msgs.push('인스타그램 아이디를 확인해주세요 (영문·숫자·밑줄·마침표만).');
  if (state.countries.length === 0) msgs.push('가고 싶은 나라를 1개 이상 골라주세요.');
  if (!$('c1').checked || !$('c2').checked) msgs.push('필수 동의 두 항목에 체크해주세요.');
  $('err').textContent = msgs[0] || '';
  if (msgs.length) return;
  pendingHandle = handle;
  $('confirmId').textContent = '@' + handle;   // 눈으로 한 번 더 보게 한다 — 오타는 곧 미도달이다
  show('confirm');
};
$('confirmNo').onclick = () => show('form');

// ── 제출 ──
$('confirmYes').onclick = async (e) => {
  const btn = e.target;
  btn.disabled = true;                       // 두 번 눌러 두 행이 들어가면 그 사람이 두 명으로 매칭된다
  $('err2').textContent = '보내는 중…';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/event_participants`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_code: EVENT_CODE, name: $('name').value.trim(),
        gender: state.gender, gender_pref: state.pref, instagram: pendingHandle,
        wish_countries: state.countries, answers: state.answers,
        consent_pii: true, consent_share: true,
      }),
    });
    if (res.status === 409) {                // 유니크 인덱스 위반 = 같은 아이디로 이미 참여
      $('err2').textContent = '';
      finish('이미 참여하셨어요!');
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    localStorage.removeItem(SAVE_KEY);
    finish(null);
  } catch (err) {
    console.error(err);
    $('err2').textContent = '전송에 실패했어요. 잠시 후 다시 눌러주세요.';
    btn.disabled = false;                    // 답변은 그대로 남아 있다 — 처음부터 다시 하지 않는다
  }
};

// ── 결과 ──
function finish(notice) {
  const scores = scoreAxes(state.answers);
  const label = makeTypeLabel(scores);
  $('typeKo').textContent = notice || label.ko;

  clear($('axes'));
  for (const a of DNA_AXES) {
    const l = DNA_LABELS[a];
    const row = document.createElement('div');
    row.className = 'axis';

    const left = document.createElement('span');
    left.textContent = l.nounA;

    const track = document.createElement('span');
    track.className = 'track';
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.style.left = `${scores[a]}%`;
    track.appendChild(dot);

    const right = document.createElement('span');
    right.textContent = l.nounB;

    row.append(left, track, right);
    $('axes').appendChild(row);
  }
  show('done');
}
$('again').onclick = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};

// 새로고침 복귀 — 답하던 문항부터 이어서
if (Object.keys(state.answers).length) { show('survey'); renderQuestion(); }
```

- [ ] **Step 4: 게시 목록에 추가**

`scripts/lib/pagesFiles.mjs`의 `PUBLISHED_FILES`에 추가:

```js
  'event.html',              // 오프라인 행사 설문 페이지
```

- [ ] **Step 5: 로컬 서버로 확인**

ESM은 `file://`에서 열리지 않는다. 반드시 HTTP로 띄운다:

```powershell
npx --yes serve docs -l 4173
```

브라우저에서 `http://localhost:4173/event.html`을 열고 확인한다:

1. 시작 → 문항이 14개 나오고 진행바가 찬다
2. 5문항쯤 답하고 **새로고침** → 답한 곳부터 이어진다
3. 이름 없이 제출 → "이름을 적어주세요."
4. 아이디에 `여행김` → 형식 오류 문구
5. 아이디에 `https://instagram.com/Travel_Kim/` 붙여넣기 → 확인 화면에 `@travel_kim`
6. 나라를 4개 고르려 하면 3개에서 멈춘다
7. 동의 미체크 → 제출 안 됨
8. 동의 후 제출 → **Task 2 SQL을 아직 서버에 안 돌렸으면 실패 문구가 뜨는 것이 정상**이다.
   버튼이 다시 눌리는 상태로 돌아오고 답변이 남아 있는지 확인한다
9. 결과 화면 확인 — 브라우저 콘솔에서 페이지를 다시 열지 말고, 8번의 실패 문구를 확인한 뒤
   Task 6에서 서버 반영 후 실제 제출로 확인한다

- [ ] **Step 6: 검증**

```powershell
npm test
```

Expected: 통과. `⚠ 게시 대기 2건: event-dna.js, event.html` 경고는 정상이다.

- [ ] **Step 7: Commit**

```bash
git add docs/event.html scripts/lib/pagesFiles.mjs
git commit -m "feat(event): 행사 설문 페이지 — 14문항·아이디 확인 단계·중복 제출 안내·즉시 유형 결과"
```

---

### Task 6: 값 확정 · 운영 문서 · 게시

**Files:**
- Create: `docs/event-operations.md` (게시 대상 아님 — 저장소 안 운영 문서)
- Modify: `docs/event.html`, `supabase/schema.sql`, `scripts/event-match.mjs` (자리표시자 치환)
- Create: `scripts/event-config.verify.mjs` (세 곳이 같은지 검사)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 실행 가능한 행사 환경

- [ ] **Step 1: 값 확정**

사용자에게 다음 세 값을 받는다. 받기 전에는 이 태스크를 진행하지 않는다.

- 행사 코드 (영문 소문자·숫자, 예: `popup01`)
- 행사명 (예: `eOrth 팝업 이벤트`)
- 행사 종료일 (파기 기준일 = 종료일 + 30일)

- [ ] **Step 2: 일관성 검사 파일 작성**

`scripts/event-config.verify.mjs`:

```js
// 행사 코드가 두 곳에서 같은지, 접속 값이 채워졌는지 검사한다.
// 어긋나면 제출이 RLS에 막히거나(페이지≠정책), 리포트가 0명으로 나온다(CLI≠데이터).
import { readFileSync } from 'node:fs';

const html = readFileSync('docs/event.html', 'utf8');
const sqlText = readFileSync('supabase/schema.sql', 'utf8');
const page = html.match(/const EVENT_CODE = '([^']+)'/)?.[1];
const sql = sqlText.match(/event_code = '([^']+)'/)?.[1];

let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('행사 설정');
check(Boolean(page) && page === sql, `행사 코드 일치 — event.html=${page}, schema.sql=${sql}`);
check(!html.includes('PASTE_EXPO_PUBLIC'), 'Supabase 접속 값이 채워져 있다');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: 자리표시자 치환**

세 파일을 확정값으로 고친다.

- `docs/event.html`: `EVENT_CODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `<title>`, 인트로 문구의 행사명
- `supabase/schema.sql`: RLS `with check`의 `event_code = 'popup01'`
- `scripts/event-match.mjs`: `const EVENT_NAME`

- [ ] **Step 4: 검사 통과 확인**

```powershell
node node_modules/tsx/dist/cli.mjs scripts/event-config.verify.mjs
npm test
```

Expected: 전 항목 ✓.

- [ ] **Step 5: 운영 문서 작성**

`docs/event-operations.md`:

````markdown
# 행사 이벤트 운영 절차

설계: `docs/superpowers/specs/2026-08-09-event-mate-matching-design.md`

## 1. 행사 전 (한 번만)

1. **서버 반영** — Supabase SQL Editor에서 `supabase/schema.sql`의
   "오프라인 행사 메이트 매칭 이벤트" 섹션을 실행한다. `event_code = '<행사코드>'`가
   페이지 상수와 같은지 먼저 확인할 것.
2. **service_role 키 준비** — Supabase 대시보드 > Project Settings > API에서 복사해
   `.env`에 `SUPABASE_SERVICE_ROLE_KEY=...` 한 줄 추가. **이 키는 절대 커밋하지 않는다**
   (`.env`는 이미 무시된다).
3. **게시**

       npm run pages:publish

   docs/에 커밋 안 된 변경이 있으면 게시가 거부된다. 먼저 커밋할 것.
   반영까지 1~2분 걸린다.
4. **실기기 확인** — 휴대폰(가능하면 iOS·안드로이드 각 1대)에서
   `https://yunjunsang4-maker.github.io/eOrth/event.html`을 열어 **실제로 한 건 제출**해본다.
   Supabase Table Editor에서 행이 들어왔는지 확인하고, 확인 후 그 행을 지운다.
5. **QR 인쇄** — 위 URL로 QR을 만들어 부스에 세운다. 파라미터가 없으므로 잘릴 것이 없다.

## 2. 행사 중

- 태블릿으로 받는다면 완료 화면의 "처음으로"를 눌러 다음 사람에게 넘긴다.
- 네트워크가 불안하면 제출 실패 문구가 뜬다. 답변은 남아 있으니 잠시 후 다시 누르면 된다.
- "인스타 계정이 없어요" → 참여 불가다. 결과를 보낼 방법이 없다.

## 3. 행사 후

1. **테스트 제출 제외 목록 확인** — 본인·스태프가 넣은 아이디를 적어둔다.
2. **매칭**

       node scripts/event-match.mjs --event <행사코드> --exclude test_a,test_b

   `event-report.local.html`이 생기면 브라우저로 연다.
3. **미매칭 확인** — 리포트 상단 경고 블록을 먼저 본다. 미매칭이 있으면 그분들께는
   유형 결과만 따로 보낸다.
4. **발송** — 카드마다 "문구 복사" → "DM 열기"로 인스타에 붙여넣는다.
   보낸 사람은 "발송함"에 체크한다(새로고침해도 유지된다).
5. **재실행 주의** — 같은 데이터로 다시 돌리면 결과는 같다(결정론). 다만 **참가자가 늘어난 뒤**
   다시 돌리면 짝이 바뀔 수 있다. 발송을 시작했으면 다시 돌리지 않는다.

## 4. 행사 종료 + 30일 — 파기

    node scripts/event-purge.mjs --event <행사코드>            # 건수 확인
    node scripts/event-purge.mjs --event <행사코드> --confirm  # 삭제

그리고 SQL Editor에서 INSERT 정책도 내린다:

    drop policy if exists event_participants_insert on public.event_participants;

정책이 살아 있으면 행사가 끝난 뒤에도 누구든 anon 키로 행을 넣을 수 있다.
로컬의 `event-report.local.html`도 지운다(참가자 아이디가 들어 있다).
````

- [ ] **Step 6: 게시 전 최종 검증**

```powershell
npm test
node scripts/build-event-dna.mjs --check
npm run pages:check
```

Expected: `npm test` 통과, `✅ docs/event-dna.js 최신`, `pages:check`가 `+ 신규 event.html`·`+ 신규 event-dna.js`를 보여주며 "게시 대기 2건".

- [ ] **Step 7: Commit**

```bash
git add docs/event.html docs/event-operations.md supabase/schema.sql scripts/event-match.mjs scripts/event-config.verify.mjs
git commit -m "feat(event): 행사 값 확정 + 운영 절차 문서 — 코드 일관성 검사 추가"
```

- [ ] **Step 8: 게시 (사용자 확인 후)**

게시는 gh-pages에 push하는 **되돌리기 어려운 외부 공개** 작업이다. 사용자에게 확인받고 실행한다.

```powershell
npm run pages:publish
git add docs/.published.json
git commit -m "chore(pages): 행사 이벤트 페이지 게시 지문 갱신"
```

---

## 실행 후 남는 것 (코드 밖)

- Supabase SQL Editor에서 스키마 섹션 실행 (`docs/event-operations.md` 1-①)
- `.env`에 `SUPABASE_SERVICE_ROLE_KEY` 추가
- 실기기 제출 왕복 확인 — **이걸 안 하고 부스를 열면 아무 데이터도 안 쌓인다**
- QR 인쇄물 제작
- 행사 종료 + 30일 파기 (달력에 등록해둘 것)
