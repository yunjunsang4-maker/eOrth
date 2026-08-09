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

writeFileSync('supabase/test-schema.local.sql', sql);
console.log(`완료: supabase/test-schema.local.sql (URL ${urlCount}곳, anon 키 ${jwtCount}곳 치환)`);
