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
