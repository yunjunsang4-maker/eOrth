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

/**
 * CLI가 읽는 Supabase 프로젝트와 docs/event.html이 실제로 쓰는 프로젝트가 다르면 즉시 종료한다.
 * 페이지가 정본이다. 이 스크립트는 삭제를 하므로 어긋남을 놓치면 더 위험하다 —
 * 빈 테스트 프로젝트에서 0건을 지우고 "✅ 0건 삭제했습니다"를 출력해, 파기가 끝난 줄 알지만
 * 실제로는 운영 DB에 참가자 실명·인스타 아이디가 그대로 남는다.
 */
function assertSupabaseUrlMatchesPage(envUrl) {
  let html = '';
  try { html = readFileSync('docs/event.html', 'utf8'); } catch { return; }
  const pageUrl = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
  if (pageUrl && pageUrl !== envUrl) {
    console.error('❌ Supabase 프로젝트 불일치 — docs/event.html이 정본입니다.');
    console.error(`   docs/event.html:              ${pageUrl}`);
    console.error(`   .env EXPO_PUBLIC_SUPABASE_URL: ${envUrl}`);
    console.error('   .env를 페이지 값에 맞추거나, 지금 지우려는 프로젝트가 맞는지 다시 확인하세요.');
    process.exit(1);
  }
}

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ .env에 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}
assertSupabaseUrlMatchesPage(url);
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
