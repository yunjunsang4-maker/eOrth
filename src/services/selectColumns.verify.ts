// src/services/selectColumns.verify.ts
//
// select('*')를 컬럼 목록으로 바꾼 조회(profile.ts 6곳·dm.ts 2곳)의 목록이 '읽는 쪽'과 '서버'에 맞는지 대조한다.
//
// 왜 소스를 텍스트로 읽나: profile.ts·dm.ts는 supabase 클라이언트(react-native·expo 모듈)를 import해서
// node에서 import할 수 없다. 그리고 빠뜨린 컬럼은 tsc가 못 잡는다(응답이 any라 `*`든 목록이든 같은 타입).
// 그래서 연결 고리를 이렇게 나눠 지킨다:
//   소비자가 읽는 키 ⊆ ProfileRow           ← tsc(소비자는 전부 ProfileRow 타입으로 읽는다)
//   ProfileRow 키 ∩ 원천 컬럼 = select 목록  ← 이 파일
//   select 목록 ⊆ schema.sql의 테이블/뷰    ← 이 파일(뷰에 없는 컬럼을 넣으면 쿼리 전체가 실패한다)
//   mapRowToMessage가 읽는 row.X = dm 목록   ← 이 파일(row가 any라 tsc가 못 본다)
//
// 서버가 schema.sql과 같은지는 이 파일이 못 본다 — supabase/SERVER-STATE.md 실측 기록의 몫이다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(HERE, p), 'utf8').replace(/\r\n/g, '\n');
const profileSrc = read('profile.ts');
const dmSrc = read('dm.ts');
const schema = read('../../supabase/schema.sql').replace(/--[^\n]*/g, ''); // SQL 주석 제거(주석 속 컬럼명 오인 방지)

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const listConst = (src: string, name: string): string[] => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`));
  if (!m) { failed++; console.error(`✗ 상수 ${name}를 찾지 못함 — 형식(한 줄 문자열 리터럴)이 바뀌었나`); return []; }
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
};
// 함수 본문 — 선언부터 줄머리의 첫 `}`까지(이 두 파일의 함수는 모두 그 형태다)
const fnBody = (src: string, decl: string) => {
  const i = src.indexOf(decl);
  return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i));
};

// ── schema.sql 파서 ──────────────────────────────────────────────
// 테이블 컬럼 = create table 블록 + 'add column' − 'drop column' (파일 순서대로 실행되는 결과)
function tableColumns(table: string): Set<string> {
  const cols = new Set<string>();
  const create = schema.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (create) {
    for (const line of create[1].split('\n')) {
      const m = line.trim().match(/^([a-z_]+)\s+[a-z]/);
      if (m && !/^(primary|unique|constraint|check|foreign)$/.test(m[1])) cols.add(m[1]);
    }
  }
  const re = new RegExp(`alter table public\\.${table} (add|drop) column if (?:not )?exists ([a-z_]+)`, 'g');
  for (const m of schema.matchAll(re)) (m[1] === 'add' ? cols.add(m[2]) : cols.delete(m[2]));
  return cols;
}
// 뷰 컬럼 = 마지막 create or replace view의 select 목록(최상위 쉼표로 나누고 별칭 또는 맨 식별자)
function viewColumns(view: string): Set<string> {
  const defs = [...schema.matchAll(new RegExp(`create or replace view public\\.${view}[\\s\\S]*?\\bselect\\b([\\s\\S]*?)\\n\\s*from public\\.`, 'g'))];
  // ↑ 줄머리의 from까지 — 같은 줄 안의 서브셀렉트 from(dna_type_key의 `from public.travel_dna`)에서 끊기지 않게
  const body = defs.length ? defs[defs.length - 1][1] : '';
  const items: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { items.push(cur); cur = ''; } else cur += ch;
  }
  items.push(cur);
  return new Set(items.map((it) => {
    const t = it.trim().replace(/\s+/g, ' ');
    return (t.match(/\bas ([a-z_]+)$/) ?? t.match(/^([a-z_]+)$/))?.[1] ?? `?${t}`;
  }));
}

const profilesTable = tableColumns('profiles');
const publicView = viewColumns('public_profiles');
const dmTable = tableColumns('dm_messages');

// 파서 자체 확인 — 아는 사실로 찍는다. 파서가 망가지면 아래 대조가 헛돌므로 먼저 본다
eq(profilesTable.has('deletion_reason'), true, '파서: profiles는 후반부 add column(deletion_reason)까지 반영');
eq(profilesTable.has('birthday'), false, '파서: profiles에서 drop column(birthday)은 빠진다');
eq(profilesTable.has('dna_type_key'), false, '파서: dna_type_key는 profiles 테이블에 없다(뷰가 계산)');
eq(sorted(publicView), sorted(['id', 'handle', 'emoji', 'bio', 'profile_photo', 'created_at', 'handle_font', 'country', 'stay_country', 'stay_status', 'dna_type_key']),
  '파서: public_profiles 최종 정의 11컬럼(SERVER-STATE "컬럼 수 11이어야 정상"과 같다)');
eq(sorted(dmTable), sorted(['id', 'thread_id', 'sender_id', 'type', 'text', 'image_url', 'record', 'created_at', 'read_at']), '파서: dm_messages 9컬럼');

// ── 프로필 ──────────────────────────────────────────────────────
const ifaceBody = profileSrc.match(/export interface ProfileRow \{([\s\S]*?)\n\}/)?.[1] ?? '';
const rowKeys = sorted([...ifaceBody.matchAll(/^\s*([a-z_]+)\??:/gm)].map((m) => m[1]));
eq(rowKeys.length >= 10, true, `ProfileRow 키 추출(${rowKeys.length}개)`);

const own = listConst(profileSrc, 'OWN_PROFILE_COLUMNS');
const pub = listConst(profileSrc, 'PUBLIC_PROFILE_COLUMNS');
// 서버에 없는 컬럼 — 하나라도 있으면 그 쿼리는 통째로 실패한다(특히 PII 제외 뷰)
eq(own.filter((c) => !profilesTable.has(c)), [], '본인 목록 ⊆ profiles 테이블 컬럼');
eq(pub.filter((c) => !publicView.has(c)), [], '타인 목록 ⊆ public_profiles 뷰 컬럼(소유자 전용 컬럼 금지)');
// 빠진 컬럼 — 원천에 있는데 안 받으면 소비자가 undefined를 읽는다
eq(sorted(own), rowKeys.filter((k) => profilesTable.has(k)), '본인 목록 = ProfileRow 키 ∩ profiles 테이블');
eq(sorted(pub), rowKeys.filter((k) => publicView.has(k)), '타인 목록 = ProfileRow 키 ∩ public_profiles 뷰');
// ProfileRow 키는 둘 중 하나에선 반드시 온다 — 어디서도 안 오는 키는 타입이 거짓말을 하는 것
eq(rowKeys.filter((k) => !own.includes(k) && !pub.includes(k)), [], 'ProfileRow의 모든 키가 본인/타인 목록 중 하나엔 있다');
// select('*')가 남아 있으면 이 대조가 무의미해진다(새 조회는 상수를 쓸 것)
eq((profileSrc.match(/\.select\('\*'\)/g) ?? []).length, 0, 'profile.ts에 select(\'*\') 없음');

// ── DM ──────────────────────────────────────────────────────────
const dm = listConst(dmSrc, 'DM_MESSAGE_COLUMNS');
const mapperKeys = [...fnBody(dmSrc, 'export function mapRowToMessage').matchAll(/\brow\.([a-z_]+)/g)].map((m) => m[1]);
const inboxKeys = [...fnBody(dmSrc, 'export async function fetchInboxSince').matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]);
eq(mapperKeys.length >= 7, true, `mapRowToMessage가 읽는 키 추출(${sorted(mapperKeys).length}종)`);
eq(sorted(dm), sorted([...mapperKeys, ...inboxKeys]), 'DM 목록 = mapRowToMessage·fetchInboxSince가 읽는 row 키');
eq(dm.filter((c) => !dmTable.has(c)), [], 'DM 목록 ⊆ dm_messages 테이블 컬럼');
eq((dmSrc.match(/\.select\('\*'\)/g) ?? []).length, 0, 'dm.ts에 select(\'*\') 없음');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
