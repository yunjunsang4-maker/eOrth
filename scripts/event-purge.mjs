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
  const next = process.argv[i + 1];
  return i >= 0 && next && !next.startsWith('--') ? next : null;
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
