// 행사 코드·행사명이 여러 곳에서 같은지, 접속 값이 채워졌는지 검사한다.
// 어긋나면 제출이 RLS에 막히거나(페이지≠정책), 리포트가 0명으로 나오거나(CLI≠데이터),
// 참가자가 받는 화면과 발송 문구의 행사명이 달라 무슨 이벤트인지 헷갈린다(페이지≠CLI 문구).
import { readFileSync } from 'node:fs';

const html = readFileSync('docs/event.html', 'utf8');
const sqlText = readFileSync('supabase/schema.sql', 'utf8');
const matchJs = readFileSync('scripts/event-match.mjs', 'utf8');

const page = html.match(/const EVENT_CODE = '([^']+)'/)?.[1];
const sql = sqlText.match(/event_code = '([^']+)'/)?.[1];
const pageName = html.match(/<title>([^<]+)<\/title>/)?.[1];
const cliName = matchJs.match(/const EVENT_NAME = '([^']+)'/)?.[1];

let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('행사 설정');
check(Boolean(page) && page === sql, `행사 코드 일치 — event.html=${page}, schema.sql=${sql}`);
check(!html.includes('PASTE_EXPO_PUBLIC'), 'Supabase 접속 값이 채워져 있다');
check(
  Boolean(pageName) && Boolean(cliName) && pageName.includes(cliName),
  `행사명 일치 — event.html<title>=${pageName}, event-match.mjs EVENT_NAME=${cliName}`,
);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
