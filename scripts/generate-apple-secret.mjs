/**
 * Apple "Sign in with Apple" client secret(JWT) 생성기
 *
 * Supabase Authentication > Providers > Apple 의 "Secret Key (for OAuth)" 칸에 넣을 값.
 * Apple client secret 은 최대 6개월짜리 ES256 서명 JWT 이며, 만료되면 다시 실행해 재발급한다.
 *
 * 실행 (둘 중 하나로 .p8 경로 지정):
 *   PowerShell:  $env:APPLE_P8_PATH = "C:\\path\\AuthKey_XXX.p8"; node scripts/generate-apple-secret.mjs
 *   인자 전달:    node scripts/generate-apple-secret.mjs "C:\\path\\AuthKey_XXX.p8"
 *
 * 식별자도 환경변수로 덮어쓸 수 있다(APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_SERVICES_ID).
 * 비밀값(.p8, 생성된 JWT)은 이 파일에 들어있지 않으므로 커밋해도 안전하다.
 * (외부 패키지 불필요 — Node 16+ 내장 crypto 사용)
 */

import { readFileSync, existsSync } from 'node:fs';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';

// ─── 설정: 식별자는 기본값 제공(커밋 가능한 공개 식별자), 환경변수로 덮어쓰기 가능 ───
const TEAM_ID = process.env.APPLE_TEAM_ID || 'GVSADGHBP7';                  // Team ID (iss)
const KEY_ID = process.env.APPLE_KEY_ID || '2FQAYU939N';                    // Key ID (header.kid)
const SERVICES_ID = process.env.APPLE_SERVICES_ID || 'com.yunjunsang.eorth.web'; // Services ID = client_id (sub)
const EXPIRES_IN = 86400 * 180;                                            // 180일 (Apple 한도 6개월 이내)

// .p8 경로는 하드코딩하지 않는다 — 환경변수 또는 CLI 인자로만 받는다.
const P8_PATH = process.env.APPLE_P8_PATH || process.argv[2];
// ────────────────────────────────────────────────────────────────────

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

if (!P8_PATH) {
  console.error(
    '❌ .p8 키 경로가 필요해요.\n' +
      '   PowerShell:  $env:APPLE_P8_PATH = "C:\\\\path\\\\AuthKey_XXX.p8"; node scripts/generate-apple-secret.mjs\n' +
      '   또는 인자로:  node scripts/generate-apple-secret.mjs "C:\\\\path\\\\AuthKey_XXX.p8"',
  );
  process.exit(1);
}

if (!existsSync(P8_PATH)) {
  console.error(`❌ .p8 키 파일을 찾을 수 없어요:\n   ${P8_PATH}`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + EXPIRES_IN;

const header = { alg: 'ES256', kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: SERVICES_ID,
};

const signingInput = `${b64url(header)}.${b64url(payload)}`;

let privateKey;
try {
  privateKey = createPrivateKey(readFileSync(P8_PATH, 'utf8'));
} catch (e) {
  console.error(`❌ .p8 키를 읽을 수 없어요 (형식 확인): ${e.message}`);
  process.exit(1);
}

// ES256 → JOSE 규격의 raw(r||s, 64바이트) 시그니처가 필요하므로 ieee-p1363 인코딩 사용
const signature = cryptoSign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
}).toString('base64url');

const jwt = `${signingInput}.${signature}`;

console.log('\n=== Apple client secret (JWT) — Supabase Apple Provider 의 Secret Key 칸에 붙여넣기 ===\n');
console.log(jwt);
console.log(`\n발급: ${new Date(now * 1000).toISOString()}`);
console.log(`만료: ${new Date(exp * 1000).toISOString()}  (재발급 필요)`);
console.log('\n⚠️ 이 값은 비밀키입니다. 깃에 커밋하거나 외부에 노출하지 마세요.');
