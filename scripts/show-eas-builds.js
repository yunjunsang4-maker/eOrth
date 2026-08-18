// EAS 빌드 목록 요약 출력 — `eas build:list --json` 결과를 한 줄씩 보기 좋게 정리한다.
// 사용법: eas build:list --json --non-interactive > builds.json && node scripts/show-eas-builds.js builds.json
const fs = require('fs');
const builds = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
builds.forEach(x => console.log(
  [x.status, x.buildProfile, 'v' + x.appVersion + ' (' + x.appBuildVersion + ')', x.channel, x.createdAt].join('  |  ')
));
