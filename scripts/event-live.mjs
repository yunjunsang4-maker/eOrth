/**
 * 부스 실시간 현황판 — **읽기 전용**. 서버에 아무것도 쓰지 않는다.
 *
 *   node scripts/event-live.mjs --from "2026-09-09 00:00"
 *
 * 30초마다 event_participants를 조회해 event-live.local.html을 다시 쓰고,
 * 그 HTML은 15초마다 스스로 새로고침한다. 브라우저로 한 번만 열어 두면 된다.
 *
 * ⚠️ 여기 나오는 짝은 **지금 이 순간의 예상치**다. 사람이 더 들어오면 짝 구성이 통째로
 *    바뀐다(매칭은 풀 전체를 점수순으로 훑어 짝짓는다). 발송은 17:30 확정 리포트로만 한다.
 *    그래서 이 화면에는 DM 문구도 복사 버튼도 일부러 없다.
 *
 * event-match.mjs 와 갈라지지 않도록 매칭 로직은 event-match-core.mjs 를 그대로 쓴다.
 * **이월 파일도 리포트도 만들지 않으므로 17:30 예약 실행과 부딪히지 않는다** — 이게 이
 * 스크립트가 따로 존재하는 이유다(event-match.mjs 를 미리 돌리면 이월 파일이 생겨
 * 정작 17:30 본실행이 "명단이 다르다"로 멈춘다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { preparePeople, matchAll, kstToMs, filterFrom } from './event-match-core.mjs';

const OUT = 'event-live.local.html';
const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  const v = argv[i + 1];
  return i >= 0 && v && !v.startsWith('--') ? v : d;
};

const eventCode = arg('event', 'popup01');
const fromText = arg('from');
const interval = Math.max(10, Number(arg('interval', '30'))) * 1000;
const once = argv.includes('--once');
const fixture = arg('fixture');
const exclude = new Set((arg('exclude', '') || '').split(',').map((s) => s.trim()).filter(Boolean));

function readEnv() {
  const out = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// event-match.mjs 와 같은 가드. .env가 테스트 프로젝트를 보고 있으면 "0명"을 정상처럼 보여준다.
const env = readEnv();
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error('❌ .env에 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}
const pageUrl = readFileSync('docs/event.html', 'utf8').match(/const SUPABASE_URL = '([^']+)'/)?.[1];
if (pageUrl && pageUrl !== BASE) {
  console.error('❌ Supabase 프로젝트 불일치 — docs/event.html이 정본입니다.');
  console.error(`   페이지 ${pageUrl}`);
  console.error(`   .env  ${BASE}`);
  process.exit(1);
}
const fromMs = fromText ? kstToMs(fromText) : null;
if (fromText && fromMs === null) {
  console.error(`❌ --from 형식이 올바르지 않습니다: ${fromText}  (예: "2026-09-09 00:00")`);
  process.exit(1);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmmKst = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(11, 16);

function tally(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] === null || r[key] === undefined || r[key] === '' ? '(없음)' : r[key];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function render(rows, result, note) {
  const now = new Date();
  const hours = new Map();
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (Number.isNaN(t)) continue;
    const h = hhmmKst(t).slice(0, 2) + '시';
    hours.set(h, (hours.get(h) || 0) + 1);
  }
  const maxH = Math.max(1, ...hours.values());
  const bar = (n) => `<div class="bar" style="width:${Math.round((n / maxH) * 100)}%"></div>`;
  const chip = (list) => list.map(([k, v]) => `<span class="chip">${esc(k)} <b>${v}</b></span>`).join('');
  const carry = rows.filter((r) => r.carry_next_day).length;
  const recent = rows.slice(-8).reverse();

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="15"><title>부스 실시간 현황</title><style>
:root{--bg:#0A0A0F;--card:#2E2E3B;--neon:#BF85FC;--dim:#A1A1B0;--line:#1A1A26;--red:#FF3B30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#fff;
font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;padding:20px}
h1{font-size:20px;margin:0 0 2px}.sub{color:var(--dim);font-size:13px;margin:0 0 16px}
.warn{background:rgba(255,59,48,.12);border:1px solid var(--red);border-radius:10px;
padding:10px 14px;margin:0 0 16px;font-size:13px;color:#FFB4AF}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.stat{background:var(--card);border-radius:12px;padding:14px 16px}
.stat .n{font-size:30px;font-weight:700;color:var(--neon);line-height:1.1}
.stat .l{font-size:12px;color:var(--dim);margin-top:2px}
.sec{background:var(--card);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.sec h2{font-size:13px;color:var(--dim);margin:0 0 10px;font-weight:600;letter-spacing:.03em}
.chip{display:inline-block;background:rgba(191,133,252,.14);border-radius:999px;
padding:3px 11px;margin:0 6px 6px 0;font-size:13px}.chip b{color:var(--neon)}
.row{display:flex;align-items:center;gap:10px;margin-bottom:5px;font-size:13px}
.row span:first-child{width:44px;color:var(--dim)}
.bar{height:9px;background:var(--neon);border-radius:5px;min-width:3px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:5px 0;border-bottom:1px solid var(--line)}td:last-child{text-align:right;color:var(--dim)}
.un{color:#FFB4AF;font-size:13px;margin-bottom:4px}
.empty{color:var(--dim);font-size:13px}
</style></head><body>
<h1>부스 실시간 현황 <span style="color:var(--dim);font-weight:400;font-size:14px">${esc(eventCode)}</span></h1>
<p class="sub">${esc(now.toLocaleTimeString('ko-KR'))} 기준 · 15초마다 자동 새로고침${note ? ' · ' + esc(note) : ''}</p>
<div class="warn">아래 짝은 <b>지금 이 순간의 예상치</b>입니다. 사람이 더 들어오면 짝이 바뀝니다 —
<b>이 화면 보고 DM을 보내지 마세요.</b> 확정 리포트는 17:30 자동 실행본입니다.</div>
<div class="grid">
<div class="stat"><div class="n">${rows.length}</div><div class="l">지금까지 제출</div></div>
<div class="stat"><div class="n">${result.pairs.length}</div><div class="l">예상 짝</div></div>
<div class="stat"><div class="n">${result.trios.length}</div><div class="l">예상 3인조</div></div>
<div class="stat"><div class="n">${result.unmatched.length}</div><div class="l">지금 미매칭</div></div>
<div class="stat"><div class="n">${carry}</div><div class="l">내일 이월 희망</div></div>
</div>
<div class="sec"><h2>시간대별 제출</h2>${hours.size
    ? [...hours.entries()].sort().map(([h, n]) => `<div class="row"><span>${h}</span>${bar(n)}<span style="width:auto">${n}</span></div>`).join('')
    : '<p class="empty">아직 없습니다.</p>'}</div>
<div class="sec"><h2>성별</h2>${rows.length ? chip(tally(rows, 'gender')) : '<p class="empty">—</p>'}</div>
<div class="sec"><h2>매칭 상대 조건</h2>${rows.length ? chip(tally(rows, 'gender_pref')) : '<p class="empty">—</p>'}</div>
<div class="sec"><h2>지금 짝이 없는 분 ${result.unmatched.length}명</h2>${result.unmatched.length
    ? result.unmatched.map((u) => `<div class="un">@${esc(u.person.instagram)} — ${esc(u.reason)}</div>`).join('')
    : '<p class="empty">없습니다.</p>'}</div>
<div class="sec"><h2>최근 제출</h2>${recent.length
    ? `<table>${recent.map((r) => `<tr><td>@${esc(r.instagram)}</td><td>${esc(r.name)}</td><td>${esc(hhmmKst(Date.parse(r.created_at)))}</td></tr>`).join('')}</table>`
    : '<p class="empty">아직 없습니다.</p>'}</div>
</body></html>`;
}

async function fetchRows() {
  // --fixture 는 리허설용이다. 서버를 안 건드리고 화면이 제대로 그려지는지만 본다.
  if (fixture) return JSON.parse(readFileSync(fixture, 'utf8'));
  const q = `${BASE}/rest/v1/event_participants?event_code=eq.${encodeURIComponent(eventCode)}&select=*&order=created_at.asc`;
  let res;
  try {
    res = await fetch(q, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  } catch (err) {
    // 부스 와이파이가 끊기면 여기로 온다. 죽이지 않는다 — 다음 주기에 다시 붙는다.
    console.error(`⚠ 조회 실패(네트워크): ${err.message}`);
    return null;
  }
  if (!res.ok) {
    console.error(`⚠ 조회 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

async function tick() {
  let rows = await fetchRows();
  if (!rows) return;
  let note = '';
  const addNote = (s) => { note += (note ? ' · ' : '') + s; };
  if (exclude.size) {
    const before = rows.length;
    rows = rows.filter((r) => !exclude.has(r.instagram) && !exclude.has(r.id));
    if (before !== rows.length) addNote(`제외 ${before - rows.length}명`);
  }
  if (fromMs !== null) {
    const { kept, dropped, undated } = filterFrom(rows, fromMs);
    // undated 를 조용히 버리면 그 사람만 어느 화면에도 안 나온다 — 항상 화면에 적는다
    if (undated.length) addNote(`created_at 깨진 행 ${undated.length}건(집계 제외)`);
    if (dropped.length) addNote(`${fromText} 이전 ${dropped.length}명 제외`);
    rows = kept;
  }
  const result = matchAll(preparePeople(rows));
  writeFileSync(OUT, render(rows, result, note), 'utf8');
  console.log(`${new Date().toLocaleTimeString('ko-KR')}  제출 ${rows.length}명 → 짝 ${result.pairs.length}쌍, 3인조 ${result.trios.length}, 미매칭 ${result.unmatched.length}`);
}

await tick();
if (!once) {
  console.log(`\n${OUT} 을 브라우저로 열어 두세요. ${interval / 1000}초마다 갱신합니다. (Ctrl+C 로 종료)`);
  setInterval(tick, interval);
}
