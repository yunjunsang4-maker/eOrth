// expo config 산출을 파일로 저장 — PowerShell 리다이렉트의 UTF-16/BOM 문제를 피해 node가 직접 쓴다.
// execFileSync + 인자 배열(고정 명령) — 셸 문자열 조립 없음.
// 사용법: node scripts/snapshot-expo-config.mjs <출력파일> [APP_VARIANT값]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , outFile, variant] = process.argv;
if (!outFile) { console.error('사용법: node scripts/snapshot-expo-config.mjs <출력파일> [변형]'); process.exit(1); }
const env = { ...process.env };
if (variant) env.APP_VARIANT = variant; else delete env.APP_VARIANT;
// Windows에서 npx는 .cmd라 shell 없이는 최신 Node가 EINVAL을 던진다.
// 인자가 전부 고정 리터럴이라 shell:true여도 조립되는 사용자 입력이 없다.
const isWin = process.platform === 'win32';
// --type public: expo config가 기본으로 붙이는 `_internal.dynamicConfigPath`(app.config.js의
// 절대경로)를 제거한다. 이 필드는 app.config.js 파일이 "존재하기만" 해도 붙는 진단용 메타데이터로,
// 우리 함수가 무엇을 반환하든(심지어 config를 그대로 반환해도) 항상 값이 채워져 G1 비교를 오염시킨다.
// (검증: node_modules/@expo/config/build/Config.js의 withInternal 스프레드는 함수 실행과 무관하게
// paths.dynamicConfigPath를 주입 — no-op app.config.js로도 동일 diff 재현 확인.) 실제 앱이 쓰는
// name/scheme/ios/android/extra/plugins는 --type public에서도 그대로 남는다.
const out = execFileSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'config', '--json', '--type', 'public'], { encoding: 'utf8', env, shell: isWin });
writeFileSync(outFile, out);
console.log('저장:', outFile, out.length, 'bytes');
