// APP_VARIANT 변형 산출 단언 — G1의 반대편(변형이 실제로 달라지는가).
// execFileSync + 인자 배열(고정 명령) — 셸 문자열 조립 없음.
import { execFileSync } from 'node:child_process';

// Windows에서 npx는 .cmd라 shell 없이는 최신 Node가 EINVAL을 던진다(고정 인자라 안전).
const isWin = process.platform === 'win32';
// app.config.js의 C1ⓒ 가드(운영 Supabase URL 혼입 시 throw)는 설정 검사와 무관하니
// 로컬 .env에 운영 URL이 남아 있어도 걸리지 않도록 빈 문자열로 명시 우회한다.
const load = (variant) => {
  const env = { ...process.env, APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: '' };
  return JSON.parse(execFileSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'config', '--json'], { encoding: 'utf8', env, shell: isWin }));
};
let failed = 0;
const assert = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) failed++; };
const findPlugin = (cfg, name) => cfg.plugins.find((p) => Array.isArray(p) && p[0] === name)?.[1];

const beta = load('beta');
assert(beta.name === 'eOrth β', 'beta 이름');
assert(beta.scheme === 'eorthbeta', 'beta 스킴');
assert(beta.ios.bundleIdentifier === 'com.yunjunsang.eorth.beta', 'beta iOS 번들');
assert(beta.android.package === 'com.yunjunsang.eorth.beta', 'beta Android 패키지');
assert(beta.extra.appVariant === 'beta', 'beta extra.appVariant');
assert(findPlugin(beta, 'react-native-google-mobile-ads')?.iosAppId === 'ca-app-pub-3940256099942544~1458002511', 'beta AdMob 데모(iOS)');
assert(findPlugin(beta, 'react-native-google-mobile-ads')?.androidAppId === 'ca-app-pub-3940256099942544~3347511713', 'beta AdMob 데모(Android)');

const dev = load('development');
assert(dev.name === 'eOrth Dev', 'dev 이름');
assert(dev.scheme === 'eorthdev', 'dev 스킴');
assert(dev.ios.bundleIdentifier === 'com.yunjunsang.eorth.dev', 'dev iOS 번들');
assert(dev.android.package === 'com.yunjunsang.eorth.dev', 'dev Android 패키지');

console.log(failed ? `실패 ${failed}건` : '전부 통과');
process.exit(failed ? 1 : 0);
