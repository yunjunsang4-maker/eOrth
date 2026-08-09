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
  const next = process.argv[i + 1];
  return i >= 0 && next && !next.startsWith('--') ? next : fallback;
};

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
    process.exit(1);
  }
  return res.json();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderReport({ pairs, trios, unmatched }, total, reportKey) {
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
    // 교집합이어야 한다 — "세 분 다 {나라}"라고 보내는 이상, 그 나라는 세 사람 모두 골랐어야 한다.
    // 합집합을 쓰면 한 사람만 고른 나라까지 "다 같이"로 둔갑해 사실이 아닌 문장이 나간다.
    const sharedOf = (x, y, z) => pairScore(x, y, rarity, max).shared
      .filter((c) => pairScore(x, z, rarity, max).shared.includes(c));
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
  });
}
for(const b of document.querySelectorAll('.copy')){
  b.addEventListener('click',()=>{
    const text=b.closest('.card').querySelector('textarea').value;
    navigator.clipboard.writeText(text).then(()=>{
      b.textContent='복사됨';setTimeout(()=>b.textContent='문구 복사',1200);
    }).catch(()=>{
      // 실패를 무시하면 클립보드에 직전 카드(다른 참가자)의 문구가 남아
      // 운영자가 그걸 그대로 다른 사람에게 붙여넣게 된다.
      b.textContent='복사 실패';setTimeout(()=>b.textContent='문구 복사',1200);
    });
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
// 발송 체크 키를 행사별로 나누는 데 쓴다. --event가 없는 fixture 모드는 EVENT_NAME으로 대신한다.
const reportKey = eventCode || EVENT_NAME;
writeFileSync(OUT, renderReport(result, people.length, reportKey), 'utf8');

console.log(`참가 ${people.length}명 → 짝 ${result.pairs.length}쌍, 3인조 ${result.trios.length}개, 미매칭 ${result.unmatched.length}명`);
for (const u of result.unmatched) console.log(`  ⚠ @${u.person.instagram} — ${u.reason}`);
console.log(`리포트: ${OUT} (브라우저로 여세요)`);
