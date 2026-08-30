/**
 * 행사 매칭 리포트 생성기 (로컬 전용)
 *
 *   node scripts/event-match.mjs --event popup01
 *   node scripts/event-match.mjs --event popup01 --exclude test_gayoung,test_nayoon
 *   node scripts/event-match.mjs --fixture scripts/fixtures/event-sample.json   # 네트워크 없이
 *
 * 두 타임으로 끊을 때(경계 시각은 KST, 그 시각 자체는 타임②에 포함):
 *   node scripts/event-match.mjs --event popup01 --slot 1 --boundary "2026-09-10 14:00"
 *   node scripts/event-match.mjs --event popup01 --slot 2 --boundary "2026-09-10 14:00"
 * 타임②는 타임① 미매칭자를 자동으로 합류시킨다. 타임①에서 이미 짝이 된 사람은 다시 나오지 않는다.
 * 산출 파일도 타임별로 갈린다(event-report-slot1/2.local.html) — 타임① 리포트가 덮이지 않는다.
 *
 * ── 이틀 행사(2026-09-09·09-10, 각일 10:00–18:00 KST) 4개 명령 ──
 * `--from`(KST, **포함** 하한)이 없으면 2일차에 1일차 참가자가 전원 다시 풀에 들어와
 * 같은 사람에게 문구가 두 번 나간다. 이틀 행사에서는 --from을 절대 빼지 말 것.
 *
 *   # 9/9 14:00 실행 (1일차 타임①)
 *   node scripts/event-match.mjs --event popup01 --slot 1 --boundary "2026-09-09 14:00" --from "2026-09-09 00:00"
 *   # 9/9 18:05 실행 (1일차 타임②)
 *   node scripts/event-match.mjs --event popup01 --slot 2 --boundary "2026-09-09 14:00" --from "2026-09-09 00:00"
 *   # 9/10 14:00 실행 (2일차 타임①) — 1일차 이월 파일을 읽는다
 *   node scripts/event-match.mjs --event popup01 --slot 1 --boundary "2026-09-10 14:00" --from "2026-09-10 00:00" \
 *     --carry-file event-carry-2026-09-09.local.json
 *   # 9/10 18:05 실행 (2일차 타임②) — 같은 파일을 똑같이 준다
 *   node scripts/event-match.mjs --event popup01 --slot 2 --boundary "2026-09-10 14:00" --from "2026-09-10 00:00" \
 *     --carry-file event-carry-2026-09-09.local.json
 *
 * **조건부 이월 — 상태 파일 방식**: 전날 최종 미매칭자 중 **폼에서 "다음 날 자동 참여"에
 * 체크한 사람만**(`carry_next_day = true`) 다음 날 타임① 풀에 합류한다.
 *   · `--slot 2` 실행이 그 순간의 명단을 `event-carry-<from날짜>.local.json` 으로 **확정**한다.
 *   · 다음 날은 `--carry-file` 로 그 파일을 **그대로 읽는다**(다시 계산하지 않는다).
 *
 * 왜 재계산이 아니라 파일인가 — INSERT 정책은 행사 마지막 날 18시까지 열려 있어서 1일차
 * 타임② 실행(18:05) 이후에도 자정까지 지각 제출이 들어온다. 전날을 다시 계산하면 그 한 건이
 * 짝 구성을 바꿔 **이미 발송한 사람이 다음 날 다시 카드로 나오거나**(중복 발송) 진짜
 * 미매칭 동의자가 **조용히 이월에서 빠진다.** 둘 다 실제로 재현된 결함이다.
 * 파일은 "그때 실제로 보낸 결과"라 지각 제출도 `--exclude` 차이도 결과를 바꾸지 못한다.
 * 같은 날 타임①→② 이월은 기존대로 재계산이다 — `before`는 `created_at < boundary`라
 * 나중에 늘어날 수 없어 이 함정이 없다.
 *
 * --from이 있으면 산출 파일명에 날짜가 들어간다(event-report-2026-09-09-slot1.local.html) —
 * 안 넣으면 2일차 리포트가 1일차 리포트를 덮어써 발송 근거가 사라진다.
 *
 * service_role 키는 .env에서만 읽는다(웹에 절대 나가지 않는다).
 * 산출: event-report.local.html — 참가자 아이디가 들어 있으므로 커밋하지 않는다.
 *       event-carry-<날짜>.local.json — 이월 명단(참가자 행 전체). 역시 커밋하지 않는다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  preparePeople, matchAll, renderMessage, pairScore, rarityOf,
  kstToMs, splitByBoundary, slot2Pool, filterFrom,
  selectCarryRows, buildCarryFile, carrySignature, mergeCarryRows,
} from './event-match-core.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  const next = process.argv[i + 1];
  return i >= 0 && next && !next.startsWith('--') ? next : fallback;
};
/** 값 없는 스위치. arg()는 뒤에 값이 와야 잡히므로 플래그는 따로 본다. */
const flag = (name) => process.argv.includes(`--${name}`);

const EVENT_NAME = 'eOrth 단대축제 부스';
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

/**
 * CLI가 읽는 Supabase 프로젝트와 docs/event.html이 실제로 쓰는 프로젝트가 다르면 즉시 종료한다.
 * 페이지가 정본이다 — 참가자 데이터는 항상 페이지가 박고 있는 프로젝트에 쌓인다.
 * 어긋난 채로 돌리면(베타 빌드용으로 .env를 테스트 프로젝트로 바꾼 뒤 되돌리지 않은 경우 등)
 * 조용히 빈 프로젝트를 조회해 "미매칭 전원"류의 그럴싸한 오답을 낸다.
 * --fixture 모드는 네트워크를 안 쓰므로 이 함수를 호출하지 않는다(fetchRows 안에서만 호출됨).
 */
function assertSupabaseUrlMatchesPage(envUrl) {
  let html = '';
  try { html = readFileSync('docs/event.html', 'utf8'); } catch { return; }
  const pageUrl = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
  if (pageUrl && pageUrl !== envUrl) {
    console.error('❌ Supabase 프로젝트 불일치 — docs/event.html이 정본입니다.');
    console.error(`   docs/event.html:              ${pageUrl}`);
    console.error(`   .env EXPO_PUBLIC_SUPABASE_URL: ${envUrl}`);
    console.error('   .env를 페이지 값에 맞추거나, 지금 조회하려는 프로젝트가 맞는지 다시 확인하세요.');
    process.exit(1);
  }
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
  assertSupabaseUrlMatchesPage(url);
  const q = `${url}/rest/v1/event_participants?event_code=eq.${encodeURIComponent(eventCode)}&select=*&order=created_at.asc`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`❌ 조회 실패 ${res.status}: ${await res.text()}`);
    // fetch 이후에는 process.exit()을 쓰지 않는다 — Node 24/Windows에서 undici 소켓이
    // 정리되기 전에 강제 종료하면 libuv 어서션이 뜨면서 종료 코드가 127로 바뀐다.
    process.exitCode = 1;
    return null;
  }
  return res.json();
}

/**
 * fixture 파일을 읽고 파싱한다. 행사 후 리포트를 뽑다가 오타를 내는 건 흔한 실수라,
 * Node 원시 스택 대신 무엇이 잘못됐고 무엇을 하면 되는지 한글로 안내하고 조용히 종료한다.
 */
function loadFixture(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`❌ fixture 파일을 찾을 수 없습니다: ${path}`);
      console.error('   경로를 다시 확인하거나, --fixture 없이 --event로 Supabase에서 직접 조회하세요.');
    } else {
      console.error(`❌ fixture 파일을 읽을 수 없습니다: ${path}`);
      console.error(`   ${err.message}`);
    }
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`❌ fixture 파일이 올바른 JSON이 아닙니다: ${path}`);
    console.error(`   ${err.message}`);
    console.error('   따옴표·쉼표·괄호가 맞는지 확인하세요.');
    process.exit(1);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderReport({ pairs, trios, unmatched }, total, reportKey, opts = {}) {
  const { slotLine = '', carried = new Set(), carriedPrev = new Set(), meetNow = false,
    carryOutIds = new Set() } = opts;
  // 사람별 카드 — 발송은 전부 수동이라 '누구까지 보냈는지'를 리포트가 기억해야 한다.
  // 참가자가 적은 값(이름)이 HTML에 들어가므로 전부 esc()를 거친다.
  //
  // 주 동선은 "복사하고 DM 열기" 한 버튼이다: 복사에 **성공했을 때만** ig.me DM 창을 연다.
  // https://ig.me/m/<아이디> 는 인스타 공식 DM 딥링크로(완료 화면 docs/event.html 203행과 같은 형식),
  // 웹에서는 로그인된 계정으로 그 사람과의 대화창이 바로 열린다 — 프로필을 거쳐 DM 버튼을
  // 찾아 누르는 단계가 사라진다. 아이디는 `[a-z0-9._]` 만 허용되지만(docs/event-dna.js
  // INSTAGRAM_RE) DB에서 곧장 오는 값이라 encodeURIComponent 를 한 번 더 거친다.
  // 보조로 남기는 "문구 복사" 단독 버튼과 프로필 링크는 ig.me가 막힌 환경(회사망·앱 미설치 등)의
  // 폴백이다 — 지우지 말 것.
  const cards = [];
  const push = (me, partners, score, shared) => {
    const msg = renderMessage({ me, partners, score, shared, eventName: EVENT_NAME, meetNow });
    // 이월된 사람은 이미 한 번 기다린 분들이다 — 발송 우선순위를 눈으로 알아보게 표시한다.
    // 두 배지는 같이 붙을 수 있다: 전날 이월자가 당일 타임①에서도 못 맞아 타임②로 또 넘어간 경우다.
    const badge = (carriedPrev.has(me.instagram) ? ' <span class="carry prev">전날 이월</span>' : '')
      + (carried.has(me.instagram) ? ' <span class="carry">타임① 이월</span>' : '');
    cards.push(`
      <div class="card" data-key="${esc(me.instagram)}">
        <label class="done"><input type="checkbox" data-check="${esc(me.instagram)}"> 발송함</label>
        <div class="who">@${esc(me.instagram)} · ${esc(me.name)} <span class="label">${esc(me.label.ko)}</span>${badge}</div>
        <div class="meta">매칭률 ${score}% · 상대 ${partners.map((p) => '@' + esc(p.instagram)).join(', ')}</div>
        <textarea readonly rows="9">${esc(msg)}</textarea>
        <div class="row">
          <button class="send" data-dm="https://ig.me/m/${esc(encodeURIComponent(me.instagram))}">복사하고 DM 열기 ↗</button>
          <button class="copy">문구 복사</button>
          <a class="dm" href="https://instagram.com/${esc(encodeURIComponent(me.instagram))}" target="_blank" rel="noreferrer">프로필 ↗</a>
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
    // 교집합이어야 한다 — "세 분 다 {나라}"라고 보내는 이상, 그 나라는 세 사람 모두 골랐어야 한다.
    // 합집합을 쓰면 한 사람만 고른 나라까지 "다 같이"로 둔갑해 사실이 아닌 문장이 나간다.
    const sharedOf = (x, y, z) => pairScore(x, y, rarity, max).shared
      .filter((c) => pairScore(x, z, rarity, max).shared.includes(c));
    push(t.a, [t.b, t.c], avg(t.a, t.b, t.c), sharedOf(t.a, t.b, t.c));
    push(t.b, [t.a, t.c], avg(t.b, t.a, t.c), sharedOf(t.b, t.a, t.c));
    push(t.c, [t.a, t.b], avg(t.c, t.a, t.b), sharedOf(t.c, t.a, t.b));
  }

  // 타임①의 미매칭자는 타임②에서 자동으로 다시 시도된다 — 여기서 "따로 보내세요"라고 안내하면
  // 곧 짝이 생길 사람에게 미매칭 문구를 먼저 보내게 된다.
  // 타임②(carryOutIds가 있는 실행)에서는 미매칭자가 **둘로 갈린다**: 다음 날 자동 참여에
  // 동의한 사람은 내일 다시 시도되므로 지금 보내면 안 되고, 동의 안 한 사람만 오늘로 끝난다.
  // 한 덩어리로 안내하면 둘 중 한쪽에게 반드시 틀린 안내가 나간다.
  const carryCount = unmatched.filter((u) => carryOutIds.has(u.person.instagram)).length;
  let warnTail;
  if (opts.willCarry) {
    warnTail = '<p><b>지금은 아무것도 보내지 마세요.</b> 이분들은 타임② 매칭에 자동으로 합류합니다. 거기서도 남으면 그때 따로 보냅니다.</p>';
  } else if (carryCount) {
    warnTail = `<p><b>「다음 날 이월」 표시가 붙은 ${carryCount}명에게는 지금 아무것도 보내지 마세요.</b>`
      + ` 내일 매칭에 자동으로 합류합니다.<br>표시가 없는 ${unmatched.length - carryCount}명께만 유형 결과를 따로 보내세요.</p>`;
  } else {
    warnTail = '<p>이분들께는 유형 결과만 따로 보내거나, 다음 행사 안내를 보내세요.</p>';
  }
  const warn = unmatched.length
    ? `<div class="warn"><b>미매칭 ${unmatched.length}명</b><ul>${unmatched
        .map((u) => `<li>@${esc(u.person.instagram)} (${esc(u.person.name)})`
          + `${carryOutIds.has(u.person.instagram) ? ' <span class="carry prev">다음 날 이월</span>' : ''}`
          + ` — ${esc(u.reason)}</li>`).join('')}</ul>
        ${warnTail}</div>`
    : '';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(EVENT_NAME)} 매칭 리포트</title><style>
/* 하단 여백은 플로팅 진행 바 높이(약 56px) + 여유 — 안 주면 마지막 카드의 버튼이 바에 가려 못 누른다 */
body{background:#0A0A0F;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:24px 24px 112px;line-height:1.6}
h1{font-size:20px} .sum{color:#A1A1B0;margin-bottom:20px}
.card{background:#2E2E3B;border:1px solid #1A1A26;border-radius:12px;padding:14px;margin-bottom:12px;scroll-margin-top:16px}
.card.sent{opacity:.45}
/* '다음 미발송 ↓'로 이동했을 때 어느 카드로 왔는지 눈으로 잡아주는 잠깐의 강조 */
.card.flash{outline:2px solid #BF85FC;box-shadow:0 0 0 5px rgba(191,133,252,.22)}
.who{font-weight:700} .label{color:#BF85FC;font-weight:400;font-size:13px}
.meta{color:#A1A1B0;font-size:13px;margin-bottom:8px}
textarea{width:100%;background:#0A0A0F;color:#fff;border:1px solid #1A1A26;border-radius:8px;padding:10px;font:13px/1.5 system-ui;resize:vertical}
.row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
button,.dm{background:#BF85FC;color:#0A0A0F;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;text-decoration:none;font-size:13px}
.send{padding:10px 16px;font-size:14px}
/* 보조 동선(ig.me가 안 열리는 환경용 폴백)은 눈에 덜 띄게 — 주 버튼 하나만 누르는 흐름을 흐리지 않는다 */
.copy,.dm{background:transparent;color:#A1A1B0;border:1px solid #1A1A26;padding:6px 10px;font-size:12px;font-weight:600}
.done{float:right;color:#A1A1B0;font-size:13px}
/* 플로팅 진행 바 — 인스타 창을 오갈 때 "지금 붙여넣을 게 누구 것인지"를 항상 보이게 둔다 */
.bar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;gap:12px;align-items:center;
  background:rgba(46,46,59,.97);border-top:1px solid #1A1A26;padding:10px 16px;font-size:13px;
  box-shadow:0 -6px 20px rgba(0,0,0,.45)}
.bar .prog{font-weight:700;white-space:nowrap}
.bar .prog b{color:#BF85FC}
.bar .last{color:#A1A1B0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar .last b{color:#fff}
.bar button{white-space:nowrap}
.bar button:disabled{background:#1A1A26;color:#A1A1B0;cursor:default}
.warn{background:#2E2E3B;border-left:4px solid #FF3B30;border-radius:8px;padding:12px;margin:20px 0}
.carry{background:#6B21A8;color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px;margin-left:6px}
.carry.prev{background:#BF85FC;color:#0A0A0F}
.slot{color:#BF85FC;font-size:14px;margin:-12px 0 12px}
</style></head><body>
<h1>${esc(EVENT_NAME)} 매칭 리포트</h1>
${slotLine ? `<div class="slot">${esc(slotLine)}</div>` : ''}
<div class="sum">참가 ${total}명 · 짝 ${pairs.length}쌍 · 3인조 ${trios.length}개 · 미매칭 ${unmatched.length}명</div>
${warn}
${cards.join('\n')}
${cards.length ? `<div class="bar" id="bar">
  <span class="prog">발송 <b id="barDone">0</b> / 전체 ${cards.length}</span>
  <span class="last">마지막 복사 <b id="barLast">아직 없음</b></span>
  <button id="barNext">다음 미발송 ↓</button>
</div>` : ''}
<script>
// 발송 체크는 localStorage에 남긴다 — 수십 명을 손으로 보내다 보면 어디까지 했는지 반드시 헷갈린다.
// 키를 행사별로 나눈다 — 안 나누면 다음 행사에서 같은 아이디가 다시 나왔을 때 체크가 미리 켜져
// 있어 발송이 누락된다.
const KEY=${JSON.stringify(`event-sent-${reportKey}`)};
const sent=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
for(const box of document.querySelectorAll('[data-check]')){
  const k=box.dataset.check;
  box.checked=sent.has(k);
  box.closest('.card').classList.toggle('sent',box.checked);
  box.addEventListener('change',()=>{
    box.checked?sent.add(k):sent.delete(k);
    box.closest('.card').classList.toggle('sent',box.checked);
    localStorage.setItem(KEY,JSON.stringify([...sent]));
    syncBar();
  });
}

// 복사는 한 경로로만 한다 — 주 버튼('복사하고 DM 열기')과 보조 버튼('문구 복사')이
// 성공/실패 판정을 서로 다르게 하면 "복사는 실패했는데 DM은 열렸다"가 생긴다.
// 성공했을 때만 resolve 하는 Promise를 돌려주고, 호출부는 then 안에서만 다음 동작을 한다.
function copyCard(card){
  const text=card.querySelector('textarea').value;
  try{
    // navigator.clipboard 자체가 없는 환경(구형 브라우저 등)에서는 여기서 동기 예외가 난다.
    // 그대로 두면 .catch가 안 걸려 버튼이 아무 반응도 안 하고, 운영자는 복사된 줄 알고
    // 직전 카드(다른 참가자)의 문구를 붙여넣는다 — 반드시 '실패'로 떨궈야 한다.
    return navigator.clipboard.writeText(text).then(()=>card.dataset.key);
  }catch(e){ return Promise.reject(e); }
}
/** 버튼 라벨을 잠깐 바꿨다가 원래대로 되돌린다(기존 '복사됨/복사 실패' 패턴을 그대로 씀) */
function blip(b,label){
  if(!b.dataset.label) b.dataset.label=b.textContent;
  b.textContent=label;
  setTimeout(()=>{b.textContent=b.dataset.label;},1200);
}

for(const b of document.querySelectorAll('.copy')){
  b.addEventListener('click',()=>{
    copyCard(b.closest('.card')).then((k)=>{
      blip(b,'복사됨');markCopied(k);
    }).catch(()=>{
      // 실패를 무시하면 클립보드에 직전 카드(다른 참가자)의 문구가 남아
      // 운영자가 그걸 그대로 다른 사람에게 붙여넣게 된다.
      blip(b,'복사 실패');
    });
  });
}

// 주 동선: 복사 → **성공했을 때만** ig.me DM 창을 연다.
// 실패했는데 창부터 열면 위 주석의 사고(직전 참가자 문구를 그대로 붙여넣기)가 그대로 재현된다.
for(const b of document.querySelectorAll('.send')){
  b.addEventListener('click',()=>{
    copyCard(b.closest('.card')).then((k)=>{
      markCopied(k);
      // 세 번째 인자로 'noopener'를 주면 window.open 이 **항상 null**을 돌려줘 팝업 차단을
      // 구분할 수 없다 — 창이 하나도 안 떴는데 버튼은 'DM 열림'이라고 거짓말을 하게 된다.
      // 대신 창 핸들을 받아 opener 를 직접 끊는다(역 탭내빙 방어는 동일).
      const w=window.open(b.dataset.dm,'_blank');
      if(!w){ blip(b,'복사됨 · 팝업 차단'); return; }
      try{ w.opener=null; }catch(e){}
      blip(b,'복사됨 · DM 열림');
    }).catch(()=>{
      blip(b,'복사 실패 — DM 안 엶');
    });
  });
}

// ── 플로팅 진행 바 ──
// 인스타 창을 오가다 보면 "지금 클립보드에 든 게 누구 것인지"를 반드시 잃어버린다.
// 마지막으로 복사한 아이디를 항상 띄워 두는 게 이 바의 주목적이다(오발송 방지).
const bar=document.getElementById('bar');
function markCopied(k){
  if(!bar||!k) return;
  // textContent 로만 넣는다 — 아이디는 참가자가 적은 값이라 innerHTML 로 넣으면 안 된다.
  document.getElementById('barLast').textContent='@'+k;
}
function syncBar(){
  if(!bar) return;
  // 발송 수는 DOM의 체크 상태로 센다 — localStorage의 sent 에는 같은 행사 다른 타임 리포트의
  // 아이디도 들어 있어서, sent.size 를 쓰면 이 리포트에 없는 사람까지 세어 진행률이 부풀려진다.
  const boxes=[...document.querySelectorAll('[data-check]')];
  const done=boxes.filter((x)=>x.checked).length;
  document.getElementById('barDone').textContent=done;
  const btn=document.getElementById('barNext');
  const all=done===boxes.length;
  btn.disabled=all;
  btn.textContent=all?'모두 발송 완료 🎉':'다음 미발송 ↓';
}
if(bar){
  document.getElementById('barNext').addEventListener('click',()=>{
    const rest=[...document.querySelectorAll('.card')].filter((c)=>!c.querySelector('[data-check]').checked);
    if(!rest.length) return;
    // 현재 위치보다 아래에 있는 첫 미발송으로 간다. 없으면 맨 위 미발송으로 되감는다 —
    // 위쪽에 건너뛴 사람이 남아 있으면 끝까지 간 뒤 다시 훑어야 하기 때문이다.
    const y=window.scrollY+80;
    const card=rest.find((c)=>c.offsetTop>y)||rest[0];
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('flash');
    setTimeout(()=>card.classList.remove('flash'),1400);
  });
  syncBar();
}
</script></body></html>`;
}

/**
 * --slot / --boundary 를 해석한다. 둘은 항상 함께 온다 —
 * 하나만 주면 "탔다고 생각했는데 안 탄" 상태로 전원을 한 타임에 몰아넣게 된다.
 * 반환 null = 타임을 쓰지 않는 기존 동작(행사 전체를 한 번에).
 */
function readSlot() {
  const slotRaw = arg('slot');
  const boundaryRaw = arg('boundary');
  if (!slotRaw && !boundaryRaw) return null;
  if (!slotRaw || !boundaryRaw) {
    console.error('❌ --slot 과 --boundary 는 함께 써야 합니다.');
    console.error('   예: --slot 1 --boundary "2026-09-10 14:00"   (KST 기준)');
    process.exit(1);
  }
  if (slotRaw !== '1' && slotRaw !== '2') {
    console.error(`❌ --slot 은 1 또는 2 여야 합니다 (받은 값: ${slotRaw})`);
    process.exit(1);
  }
  const boundaryMs = kstToMs(boundaryRaw);
  if (boundaryMs === null) {
    console.error(`❌ --boundary 형식이 올바르지 않습니다: ${boundaryRaw}`);
    console.error('   "YYYY-MM-DD HH:MM" 형식으로 KST 기준 경계를 적어주세요. 예: "2026-09-10 14:00"');
    process.exit(1);
  }
  return { slot: Number(slotRaw), boundaryMs, boundaryText: boundaryRaw };
}

/**
 * `--from` 을 해석한다. 반환 null = 하한 없음(기존 동작).
 *
 * `--slot` 과 짝지어 쓰라고 강제하지 않는다 — `--slot` 없는 일괄 매칭에서도
 * "그날 참가자만"이 필요하기 때문이다(이틀 행사에서 하루치만 한 번에 돌리는 경우).
 * 검증·에러 안내는 `--boundary` 와 같은 방식(kstToMs)으로 통일한다.
 */
function readFrom() {
  const raw = arg('from');
  if (!raw) return null;
  const fromMs = kstToMs(raw);
  if (fromMs === null) {
    console.error(`❌ --from 형식이 올바르지 않습니다: ${raw}`);
    console.error('   "YYYY-MM-DD HH:MM" 형식으로 KST 기준 하한을 적어주세요. 예: "2026-09-10 00:00"');
    console.error('   (이 시각 정각은 포함됩니다. 그 이전 제출은 매칭 풀에서 제외됩니다.)');
    process.exit(1);
  }
  // 파일명에 넣을 날짜. kstToMs를 이미 통과했으므로 이 정규식은 반드시 맞는다.
  const day = String(raw).trim().slice(0, 10);
  return { fromMs, fromText: raw, day };
}

/** 이월 파일 이름은 `--from`의 날짜 하나로만 정해진다 — 재실행해도 파일명이 갈리면 안 된다. */
const carryPathFor = (day) => `event-carry-${day}.local.json`;

/**
 * 이월 파일을 읽는다. **없으면 조용히 "이월 0명"으로 넘어가지 않고 멈춘다** —
 * 그냥 넘어가면 전날 기다린 분들이 통째로 사라지고 콘솔엔 아무 신호도 안 남는다.
 */
function loadCarryFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`❌ 이월 파일이 없습니다: ${path}`);
      console.error('   이 파일은 **전날 타임②(--slot 2) 실행이 만듭니다.** 그 실행을 건너뛰었거나 파일을 지운 것입니다.');
      console.error('   전날 타임② 명령을 먼저 실행한 뒤 다시 시도하세요. 예:');
      console.error('     node scripts/event-match.mjs --event popup01 --slot 2 --boundary "2026-09-09 14:00" --from "2026-09-09 00:00"');
      console.error('   ⚠ 다만 지금 다시 만들면 그 사이 들어온 지각 제출이 섞여 전날과 다른 명단이 나올 수 있습니다.');
      console.error('     docs/event-operations.md §2-1 "이월 파일을 잃어버렸을 때"를 먼저 읽으세요.');
    } else {
      console.error(`❌ 이월 파일을 읽을 수 없습니다: ${path}`);
      console.error(`   ${err.message}`);
    }
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    console.error(`❌ 이월 파일이 올바른 JSON이 아닙니다: ${path}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
  if (!payload || !Array.isArray(payload.rows)) {
    console.error(`❌ 이월 파일에 rows 배열이 없습니다: ${path}`);
    console.error('   손상됐을 수 있습니다. 파일을 열어 확인하세요.');
    process.exit(1);
  }
  return payload;
}

async function main() {
  const fixture = arg('fixture');
  const eventCode = arg('event');
  if (!fixture && !eventCode) {
    console.error('사용법: node scripts/event-match.mjs --event <행사코드> [--exclude id1,id2] [--fixture <파일>]');
    console.error('  두 타임으로 끊으려면: --slot 1|2 --boundary "2026-09-10 14:00"   (KST, 경계 시각은 타임②에 포함)');
    console.error('  이틀 행사라면 반드시: --from "2026-09-10 00:00"   (KST, 이 시각 이전 제출은 풀에서 제외 — 전날 참가자 재매칭 방지)');
    console.error('  2일차에 전날 동의자를 이월하려면: --carry-file event-carry-2026-09-09.local.json');
    console.error('    (그 파일은 1일차 타임②(--slot 2) 실행이 만든다. --overwrite-carry 는 명단을 덮어쓸 때만.)');
    process.exitCode = 1;
    return;
  }
  const slotOpt = readSlot();
  const fromOpt = readFrom();
  const carryFileIn = arg('carry-file');
  const overwriteCarry = flag('overwrite-carry');

  let rows = fixture ? loadFixture(fixture) : await fetchRows(eventCode);
  if (!rows) return; // 조회 실패 — fetchRows가 이미 사유를 안내하고 exitCode를 세웠다

  const exclude = new Set((arg('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (exclude.size) {
    const before = rows.length;
    rows = rows.filter((r) => !exclude.has(r.instagram) && !exclude.has(r.id));
    console.log(`제외 ${before - rows.length}명`);
  }

  // --from 은 --exclude 다음, slot 분리 앞이다. slot 앞이어야 하는 이유: 전날 행이 남아 있으면
  // 타임① before 에 통째로 섞이고, 타임②는 그 사람들의 미매칭까지 이월해 버린다.
  let fromLine = '';
  if (fromOpt) {
    const { kept, dropped, undated } = filterFrom(rows, fromOpt.fromMs);
    if (undated.length) {
      // slot의 undated와 같은 처리 — 판정 불가한 행을 조용히 버리면 그 사람만 어느 리포트에도 안 나온다
      console.error(`❌ created_at 이 없거나 깨진 행 ${undated.length}건이 있어 --from 하한을 적용할 수 없습니다.`);
      for (const r of undated) console.error(`   @${r.instagram} (${r.name})`);
      console.error('   Supabase에서 해당 행의 created_at 을 확인하거나, 그 행을 --exclude 로 빼고 다시 돌리세요.');
      process.exitCode = 1;
      return;
    }
    rows = kept;
    // 조용한 제외는 "전원 미매칭"류의 그럴싸한 오답을 낳는다 — 몇 명이 왜 빠졌는지 항상 찍는다
    fromLine = `--from ${fromOpt.fromText}(KST) 이전 ${dropped.length}명 제외(전날 참가·테스트 행) → 남은 ${kept.length}명`;
    console.log(fromLine);
  }

  // 전날 이월 — **다시 계산하지 않고 파일을 그대로 읽는다.**
  // 재계산하면 1일차 타임② 실행 이후 자정까지 들어온 지각 제출이 섞여 짝 구성이 바뀌고,
  // 이미 발송한 사람이 다시 카드로 나온다(중복 발송). 파일은 그때 실제로 보낸 결과다.
  let carriedPrev = new Set();
  let prevCarriedRows = [];
  let prevLine = '';
  if (carryFileIn) {
    const payload = loadCarryFile(carryFileIn);
    prevCarriedRows = payload.rows;
    carriedPrev = new Set(prevCarriedRows.map((r) => r.instagram));
    prevLine = `전날 이월 파일 ${carryFileIn} — ${payload.day ?? '?'}일자 명단 ${prevCarriedRows.length}명 합류`;
    console.log(prevLine);
    // 누가 넘어왔는지 항상 이름으로 찍는다 — 숫자만 보면 "0명"이 정상인지 사고인지 구분이 안 된다
    for (const r of prevCarriedRows) console.log(`  ↪ @${r.instagram} (${r.name}) — 전날 이월`);
  }

  // 산출 파일명. --from 이 있으면(=이틀 이상 행사) 날짜를 끼워 넣는다 —
  // 안 넣으면 2일차 event-report-slot1.local.html 이 1일차 것을 조용히 덮어써서
  // "누구에게 무엇을 보냈는지"의 유일한 근거가 사라진다. .gitignore 의
  // `event-report*.local.html` 와일드카드가 이 변형까지 이미 덮는다.
  const stem = fromOpt ? `event-report-${fromOpt.day}` : 'event-report';
  let out = OUT;
  let slotLine = '';
  let carried = new Set();
  let willCarry = false;
  let meetNow = false;

  if (fromOpt) out = `${stem}.local.html`;

  if (slotOpt) {
    const { before, after, undated } = splitByBoundary(rows, slotOpt.boundaryMs);
    if (undated.length) {
      // 판정 불가한 행을 조용히 버리면 그 사람만 어느 리포트에도 안 나온다
      console.error(`❌ created_at 이 없거나 깨진 행 ${undated.length}건이 있어 타임을 가를 수 없습니다.`);
      for (const r of undated) console.error(`   @${r.instagram} (${r.name})`);
      console.error('   Supabase에서 해당 행의 created_at 을 확인하거나, --slot 없이 전체를 한 번에 매칭하세요.');
      process.exitCode = 1;
      return;
    }
    // 두 타임 모두 행사 당일에 발송한다(타임①은 행사 중, 타임②는 18시 종료 직후) →
    // 양쪽 다 "지금 만나보세요"가 유효하다. 타임을 쓰지 않는 일괄 매칭만 이 문장이 빠진다.
    meetNow = true;
    // 당일 타임① 풀 = 당일 경계 이전 참가자 + **전날 이월자**.
    // slot 2 도 이 풀을 기반으로 재계산되므로(slot2Pool), 같은 --carry-file 을 주면
    // slot 1·2 어느 쪽으로 돌려도 이월자가 일관되게 반영된다.
    const { merged: slot1Pool, added: prevAdded, skipped: prevSkipped } = mergeCarryRows(before, prevCarriedRows);
    if (prevSkipped.length) {
      // 당일 풀에 이미 있는 사람을 또 넣으면 한 사람이 두 번 매칭된다 — 막았다는 사실을 알린다
      console.log(`  ⚠ 이월 파일의 ${prevSkipped.length}명은 이미 당일 풀에 있어 건너뜁니다: `
        + prevSkipped.map((r) => '@' + r.instagram).join(', '));
    }
    const prevIds = new Set(prevAdded.map((r) => r.id));
    if (slotOpt.slot === 1) {
      rows = slot1Pool;
      willCarry = true;   // 타임①의 미매칭자는 타임②로 넘어간다 — 지금 따로 보내면 안 된다
      // 인원 = before + 이월자. 이 줄의 숫자 합이 아래 "참가 N명"과 반드시 같아야 한다.
      const prevTail = prevAdded.length ? ` + 전날 이월 ${prevAdded.length}명` : '';
      slotLine = `타임① — ${slotOpt.boundaryText}(KST) 이전 참가자 ${before.length}명${prevTail}`;
      out = `${stem}-slot1.local.html`;
    } else {
      const { pool, carried: carriedRows } = slot2Pool(slot1Pool, after);
      rows = pool;
      carried = new Set(carriedRows.map((r) => r.instagram));
      // 타임② 풀 = after + carriedRows. 이월자 중 타임①에서 짝이 된 사람은 여기 없고,
      // 남은 사람은 이미 carriedRows 안에 들어 있다 — 그래서 전날 이월을 **따로 더하면 안 된다**
      // (그러면 같은 사람을 두 번 세어 인원 합이 "참가 N명"과 어긋난다). 괄호로 내역만 밝힌다.
      const prevInSlot2 = carriedRows.filter((r) => prevIds.has(r.id)).length;
      const prevNote = prevInSlot2 ? `(전날 이월 ${prevInSlot2}명 포함)` : '';
      slotLine = `타임② — ${slotOpt.boundaryText}(KST) 이후 참가자 ${after.length}명`
        + ` + 타임① 미매칭 ${carriedRows.length}명 이월${prevNote}`;
      out = `${stem}-slot2.local.html`;
    }
    console.log(slotLine);
  } else if (prevCarriedRows.length) {
    // --slot 없이 일괄로 돌릴 때도 이월자를 넣는다 — 안 넣으면 --carry-file 을 준 의미가 없다
    rows = mergeCarryRows(rows, prevCarriedRows).merged;
  }

  const people = preparePeople(rows);
  const result = matchAll(people);
  // 발송 체크 키를 행사별로 나누는 데 쓴다. --event가 없는 fixture 모드는 EVENT_NAME으로 대신한다.
  // 타임별·날짜별로 키를 나누지 않는 이유: 한 사람의 카드는 여러 리포트 중 한쪽에만 나오므로
  // 섞일 일이 없고, 키를 나누면 리포트를 다시 뽑았을 때 발송 체크가 통째로 사라진다.
  //
  // 이틀 체제에서도 이 전제("한 사람의 카드는 한쪽에만 나온다")는 유지된다 —
  // 한 사람의 제출은 한 행이고, 그 행의 created_at은 하루·한 타임에만 속한다.
  // 2일차 실행은 --from 이 1일차 행을 아예 빼므로 카드가 겹칠 경로 자체가 없다.
  // **조건부 이월(--carry-file)이 생긴 뒤에도 전제는 유지된다**: 이월되는 사람은 전날 최종
  // '미매칭자'뿐이고, 미매칭자는 전날 리포트에서 카드가 아니라 경고 블록의 명단으로만 나온다.
  // 즉 카드는 여전히 그 사람이 실제로 짝을 받은 날 하루치에만 생긴다.
  //
  // "같은 사람이 이틀 다 참가해 카드가 둘"은 **일어날 수 없다** —
  // `create unique index event_participants_uniq on (event_code, instagram)` 때문에 같은 아이디로는
  // 두 번째 행이 아예 안 들어간다(페이지도 409를 받아 "이미 참여하셨어요!"로 끝낸다).
  // 그래서 아이디를 키로 쓰는 발송 체크가 두 리포트에서 충돌할 경로가 없다.
  const reportKey = eventCode || EVENT_NAME;

  // ── 다음 날로 넘길 명단을 파일로 확정한다 (타임② 실행만) ──
  // 리포트보다 **먼저** 검사한다. 명단이 달라졌는데 리포트만 새로 뽑아 두면
  // 운영자가 그걸 보고 발송을 시작해 버린다 — 그 전에 멈춰야 한다.
  let carryOutPath = null;
  let carryRowsOut = [];
  if (slotOpt?.slot === 2 && fromOpt) {
    carryOutPath = carryPathFor(fromOpt.day);
    carryRowsOut = selectCarryRows(result.unmatched, rows);
    const payload = buildCarryFile({
      event: eventCode, day: fromOpt.day, from: fromOpt.fromText,
      boundary: slotOpt.boundaryText, exclude: arg('exclude') ?? '', rows: carryRowsOut,
    });
    if (existsSync(carryOutPath) && !overwriteCarry) {
      let prev = null;
      try { prev = JSON.parse(readFileSync(carryOutPath, 'utf8')); } catch { prev = null; }
      if (prev && carrySignature(prev) !== carrySignature(payload)) {
        // 리포트 재발급하려고 다시 돌렸는데 그 사이 지각 제출이 들어와 명단이 바뀐 경우다.
        // 조용히 덮어쓰면 다음 날이 **전날 실제 발송과 다른 명단**을 읽는다(중복 발송의 잔여 경로).
        console.error(`❌ 이월 명단이 기존 파일과 다릅니다: ${carryOutPath}`);
        console.error(`   기존 ${prev.rows?.length ?? '?'}명 → 지금 ${carryRowsOut.length}명`);
        const prevIds = new Set((prev.rows ?? []).map((r) => r.instagram));
        const nowIds = new Set(carryRowsOut.map((r) => r.instagram));
        const gone = [...prevIds].filter((h) => !nowIds.has(h));
        const added = [...nowIds].filter((h) => !prevIds.has(h));
        if (gone.length) console.error(`   빠짐: ${gone.map((h) => '@' + h).join(', ')}`);
        if (added.length) console.error(`   추가: ${added.map((h) => '@' + h).join(', ')}`);
        console.error('   이 실행 뒤에 들어온 지각 제출이 짝 구성을 바꾼 것입니다.');
        console.error('   · 리포트를 다시 보려던 것뿐이라면 **기존 산출 파일을 그대로 여세요**(다시 돌리지 마세요).');
        console.error('   · 명단을 정말 갱신하려면 --overwrite-carry 를 붙여 다시 실행하세요.');
        console.error('     단, 이미 발송을 시작했다면 갱신하면 안 됩니다 — 이미 보낸 사람이 다음 날 다시 나옵니다.');
        process.exitCode = 1;
        return;
      }
    }
    writeFileSync(carryOutPath, JSON.stringify(payload, null, 1), 'utf8');
  }

  // 리포트 상단 줄에 from 필터도 함께 적는다 — 인원이 적어 보이는 이유를 리포트만 보고 알아야 한다
  const headLine = [slotLine, fromLine, prevLine].filter(Boolean).join('  ·  ');
  const carryOutIds = new Set(carryRowsOut.map((r) => r.instagram));
  writeFileSync(out, renderReport(result, people.length, reportKey,
    { slotLine: headLine, carried, carriedPrev, meetNow, willCarry, carryOutIds }), 'utf8');

  console.log(`참가 ${people.length}명 → 짝 ${result.pairs.length}쌍, 3인조 ${result.trios.length}개, 미매칭 ${result.unmatched.length}명`);
  for (const u of result.unmatched) console.log(`  ⚠ @${u.person.instagram} — ${u.reason}`);
  if (willCarry && result.unmatched.length) {
    console.log('  → 이분들은 타임② 매칭에 자동 합류합니다. 지금은 보내지 마세요.');
  }
  if (carryOutPath) {
    console.log(`이월 명단: ${carryOutPath} — 다음 날 ${carryRowsOut.length}명 합류 예정`);
    for (const r of carryRowsOut) console.log(`  ↪ @${r.instagram} (${r.name}) — 다음 날 자동 참여 동의함(지금 보내지 마세요)`);
    const declined = result.unmatched.filter((u) => !carryOutIds.has(u.person.instagram));
    for (const u of declined) console.log(`  · @${u.person.instagram} — 동의 안 함(오늘로 끝, 유형 결과만 따로 보내세요)`);
  }
  console.log(`리포트: ${out} (브라우저로 여세요)`);
  // 예약 실행 래퍼(scripts/event-day-run.ps1)가 이 줄을 정규식으로 파싱해 리포트를 브라우저로 연다.
  // 일부러 ASCII만 쓴다 — 콘솔 인코딩이 어긋나도 이 줄만은 깨지지 않아야 파일을 못 찾는 사고가 없다.
  // 형식을 바꾸면 event-day-run.ps1 의 정규식도 함께 고칠 것.
  console.log(`REPORT_FILE=${out}`);
}

await main();
