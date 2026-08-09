// 행사 코드·행사명이 여러 곳에서 같은지, 접속 값이 채워졌는지 검사한다.
// 어긋나면 제출이 RLS에 막히거나(페이지≠정책), 리포트가 0명으로 나오거나(CLI≠데이터),
// 참가자가 받는 화면과 발송 문구의 행사명이 달라 무슨 이벤트인지 헷갈린다(페이지≠CLI 문구).
import { readFileSync } from 'node:fs';

const html = readFileSync('docs/event.html', 'utf8');
const sqlText = readFileSync('supabase/schema.sql', 'utf8');
const matchJs = readFileSync('scripts/event-match.mjs', 'utf8');

const page = html.match(/const EVENT_CODE = '([^']+)'/)?.[1];
const sql = sqlText.match(/event_code = '([^']+)'/)?.[1];
// <title>은 "행사명 — 부제"처럼 접미사가 붙으므로 접미사를 떼고 정확히 비교한다.
// includes()로 하면 EVENT_NAME이 행사명의 축약형(부분 문자열)으로 잘못 바뀌어도
// title에 여전히 포함되어 통과해버려 검사의 존재 이유(발송 문구≠화면 문구 탐지)가 무력화된다.
const pageTitle = html.match(/<title>([^<]+)<\/title>/)?.[1];
const pageName = pageTitle?.split(' — ')[0]?.trim();
const cliName = matchJs.match(/const EVENT_NAME = '([^']+)'/)?.[1];

let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

// CLI(event-match.mjs·event-purge.mjs)가 .env로 읽는 프로젝트와 페이지가 하드코딩한
// 프로젝트가 어긋나면, 파기 스크립트가 빈 테스트 프로젝트에서 0건 삭제하고 성공한 척 출력한다.
// .env는 추적되지 않는 파일이라 없을 수도 있으므로(CI 등) 있을 때만 검사한다.
function readEnvUrl() {
  try {
    const text = readFileSync('.env', 'utf8');
    const m = text.match(/^\s*EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}
const pageUrl = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const envUrl = readEnvUrl();

console.log('행사 설정');
check(Boolean(page) && page === sql, `행사 코드 일치 — event.html=${page}, schema.sql=${sql}`);
check(!html.includes('PASTE_EXPO_PUBLIC'), 'Supabase 접속 값이 채워져 있다');
check(
  Boolean(pageName) && Boolean(cliName) && pageName === cliName,
  `행사명 일치 — event.html<title>=${pageName}, event-match.mjs EVENT_NAME=${cliName}`,
);
if (envUrl) {
  check(
    Boolean(pageUrl) && pageUrl === envUrl,
    `Supabase 프로젝트 일치 — event.html=${pageUrl}, .env EXPO_PUBLIC_SUPABASE_URL=${envUrl}`,
  );
} else {
  console.log('  · .env 없음 — Supabase 프로젝트 일치 검사 건너뜀');
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
