// src/screens/tripDetailSort.verify.ts
// 여행 상세 형식 행 정렬 규칙 검증.
// 실행: node node_modules/tsx/dist/cli.mjs src/screens/tripDetailSort.verify.ts
import { sortFormatModules } from './tripDetailSort';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const FORMAT_ORDER = ['feed', 'blog', 'cut', 'snap', 'album'];
const vts = (mods: { vt: string }[]) => mods.map((m) => m.vt);

// 형식마다 기록이 여러 개일 수 있다 — 기준은 "그 형식의 가장 최근 기록"(최대 timestamp)이지
// 첫 기록이 아니다. album은 옛 기록(100)과 최신 기록(900)을 함께 가져 그 차이를 드러낸다.
const mixed = [
  { vt: 'feed', items: [{ timestamp: 300 }] },
  { vt: 'blog', items: [{ timestamp: 500 }, { timestamp: 200 }] },
  { vt: 'album', items: [{ timestamp: 100 }, { timestamp: 900 }] },
];

// 1) 최신순 — 최근 기록이 있는 형식이 위 (album 900 > blog 500 > feed 300)
eq(vts(sortFormatModules(mixed, 'latest', FORMAT_ORDER)), ['album', 'blog', 'feed'], '최신순: album(900) > blog(500) > feed(300)');

// 2) 오래된순 — 같은 입력의 정반대 순서
eq(vts(sortFormatModules(mixed, 'oldest', FORMAT_ORDER)), ['feed', 'blog', 'album'], '오래된순: feed(300) < blog(500) < album(900)');

// 3) 동률 — 하루짜리 여행이면 timestamp가 전부 같다. 이때는 FORMAT_ORDER 순서로 떨어져야
//    행 순서가 렌더마다 흔들리지 않는다. 입력을 일부러 FORMAT_ORDER와 반대로 준다.
const sameTime = [
  { vt: 'album', items: [{ timestamp: 777 }] },
  { vt: 'snap', items: [{ timestamp: 777 }] },
  { vt: 'feed', items: [{ timestamp: 777 }] },
];
eq(vts(sortFormatModules(sameTime, 'latest', FORMAT_ORDER)), ['feed', 'snap', 'album'], '동률: FORMAT_ORDER(feed→snap→album) 순으로 떨어짐');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
