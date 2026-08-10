// 테스트 Supabase용 schema 사본 생성 — 운영 하드코딩(URL·anon 키)을 테스트 값으로 치환한다.
// 치환하지 않고 실행하면 테스트 DB의 푸시/신고 트리거가 '운영' Edge Function을 호출한다
// (send-push의 재조회 검증 덕에 실피해는 없지만 베타 푸시가 영영 안 온다 — spec G3).
// 사용법: node scripts/make-test-schema.mjs <테스트프로젝트ref> <테스트anon키>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , ref, anonKey] = process.argv;
if (!ref || !anonKey) {
  console.error('사용법: node scripts/make-test-schema.mjs <테스트프로젝트ref> <테스트anon키>');
  process.exit(1);
}
const PROD_REF = 'blweolnunmsxgztmvzfd';
let sql = readFileSync('supabase/schema.sql', 'utf8');

// ① 프로젝트 URL 치환 (Edge Function 호출 트리거들)
const urlCount = (sql.match(new RegExp(PROD_REF, 'g')) ?? []).length;
if (urlCount === 0) { console.error('FAIL: 운영 ref가 스키마에 없음 — 스크립트/스키마 불일치'); process.exit(1); }
sql = sql.split(PROD_REF).join(ref);

// ② 운영 anon 키(JWT) 치환 — 'Bearer eyJ…' 형태 전부
const jwtRe = /Bearer eyJ[A-Za-z0-9_.-]+/g;
const jwtCount = (sql.match(jwtRe) ?? []).length;
if (jwtCount === 0) { console.error('FAIL: 하드코딩 anon 키를 찾지 못함'); process.exit(1); }
sql = sql.replace(jwtRe, 'Bearer ' + anonKey);

// ③ 잔존 검사
if (sql.includes(PROD_REF)) { console.error('FAIL: 운영 ref 잔존'); process.exit(1); }

// ④ 오실행 가드 (2026-08-10 실제 사고 재발 방지) — 이 파일이 '운영' SQL Editor에 붙여지면
// 운영은 profiles에 사용자가 있으므로 첫 블록에서 예외로 전체가 중단된다.
// 빈 새 DB(테이블 없음/0행)는 통과. 베타 가입자가 생긴 뒤의 재실행은 막히는데,
// 그때는 안내대로 이 블록만 지우고 실행하면 된다(의도된 마찰).
const GUARD = `-- ⚠️ 테스트 전용 스키마 — 사용자 데이터가 있는 DB(=운영일 가능성)에서는 실행을 거부한다
do $guard$ begin
  if exists (select 1 from public.profiles limit 1) then
    raise exception '이 DB에는 이미 사용자 데이터가 있습니다. 운영 프로젝트가 아닌지 확인하세요. (테스트 프로젝트 재실행이 맞다면 이 do 블록을 지우고 다시 실행)';
  end if;
exception when undefined_table then null; -- 빈 새 DB — 정상 진행
end $guard$;

`;
writeFileSync('supabase/test-schema.local.sql', GUARD + sql);
console.log(`완료: supabase/test-schema.local.sql (URL ${urlCount}곳, anon 키 ${jwtCount}곳 치환, 오실행 가드 포함)`);
