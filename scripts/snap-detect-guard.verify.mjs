// 해외 감지기(스냅·도착) 상태 영속화 정적 가드
//
// 배경: SnapDetector·ArrivalNotifier의 '이미 보냈는가'는 원래 컴포넌트 ref였고, 콜드
// 스타트마다 리셋돼 해외에서 앱을 열 때마다 알림이 하나씩 쌓였다. AsyncStorage 영속으로
// 고쳤는데, 영속화는 반대 방향의 사고를 새로 연다 — **지우는 지점을 하나라도 빠뜨리면
// 값이 고착돼 여행 내내 알림이 0건이 된다.** 실제로 1차 구현에서 토글 OFF 경로의 삭제가
// 빠져 그 회귀가 났다.
//
// 이 규칙들은 타입 검사도 lint도 잡지 못한다. 삭제 한 줄을 지워도 컴파일되고, iOS에서도
// 안드로이드에서도 조용히 동작하며, 증상은 '해외에 나가서 며칠 뒤'에만 나타난다.
// 그래서 정적 가드로 못 박는다.
//
// ⚠️ 유닛 테스트가 아니라 소스 텍스트 가드인 이유: 판정 로직이 React 컴포넌트 안의
//    부수효과(AsyncStorage·알림·AppState)라 순수 함수로 떨어지지 않고, snapService.ts로
//    빼더라도 tsx로 불러올 수 없다(expo-location/expo-notifications가 react-native를
//    최상위 로드 → esbuild가 Flow 문법에서 실패). scripts/media-exif-guard.verify.mjs와
//    같은 방식이다.
//
// ⚠️ 이 가드가 지키는 것은 **규칙**이지 이름이 아니다. 변수·키 이름을 의도적으로 바꿨다면
//    이 파일도 함께 고쳐라. 그냥 실패한다고 검사를 지우면 위 회귀가 되돌아온다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const rel = (p) => p.split(sep).join('/');
const readSafe = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

let fail = 0;
const check = (ok, msg) => {
  if (ok) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fail++; }
};

/**
 * `const NAME = 4 * 60 * 60 * 1000;` 같은 상수를 실제 숫자로 읽는다.
 * 곱셈 항들의 합만 계산한다 — 이 파일들이 쓰는 형태가 그뿐이고, 코드 평가를 하지 않으려고
 * 직접 파싱한다. 형태가 다르면 null을 돌려주고 검사 자체가 실패하게 둔다(조용히 통과 금지).
 */
function numericConst(src, name) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9*+\\s]+);`));
  if (!m) return null;
  const expr = m[1].trim();
  if (!/^[0-9][0-9*+\s]*$/.test(expr)) return null;
  return expr
    .split('+')
    .reduce((sum, term) => sum + term.split('*').reduce((prod, n) => prod * Number(n.trim()), 1), 0);
}

console.log('해외 감지기 상태 영속화 가드');

const SNAP = 'src/components/SnapDetector.tsx';
const ARRIVAL = 'src/components/ArrivalNotifier.tsx';
const SERVICE = 'src/services/snapService.ts';

// ── 규칙 1: 두 감지기의 공통 규칙 ──
// 감지기마다 (a) 상태가 모듈 스코프·영속인가 (b) 지우는 지점이 토글 OFF와 복귀 **양쪽**에
// 있는가 (c) 재진입 가드가 있는가 (d) 실패 시 스로틀 되돌리기가 성립하는가 를 본다.
// sendCall — 그 감지기가 실제로 알림을 내보내는 호출. 무효화 검사가 이 호출보다 앞에 있는지
// 위치로 판정하는 데 쓴다. import 목록에도 같은 이름이 있으므로 check() 정의 뒤에서만 찾는다.
const DETECTORS = [
  {
    path: SNAP,
    key: '@eorth/snapDetect/sent',
    keyConst: 'SNAP_SENT_KEY',
    keyMember: 'snapSent',
    sendCall: 'sendSnapNotification(',
  },
  {
    path: ARRIVAL,
    key: '@eorth/arrivalDetect/sentCountry',
    keyConst: 'ARRIVAL_SENT_COUNTRY_KEY',
    keyMember: 'arrivalSentCountry',
    sendCall: 'Notifications.scheduleNotificationAsync(',
  },
];
const DEAD_REFS = ['hasSentRef', 'lastCheckRef']; // 되살아나면 콜드 스타트 리셋 결함이 그대로 재발

for (const d of DETECTORS) {
  const src = readSafe(d.path);
  if (src === null) {
    check(false, `${d.path} 파일이 없다 (이름이 바뀌었으면 이 가드도 함께 고칠 것)`);
    continue;
  }

  // (a) 상태 위치
  check(/^let lastCheckAt = 0;/m.test(src), `${d.path}: 스로틀 기준 시각이 모듈 스코프다`);
  // 키 문자열은 여기 있으면 안 된다 — DETECTOR_KEYS의 별칭이어야 한다(규칙 6이 값을 검사한다).
  // 복붙된 리터럴은 clearPersistedStores가 지우는 키와 조용히 갈라진다.
  check(
    src.includes(`const ${d.keyConst} = DETECTOR_KEYS.${d.keyMember};`),
    `${d.path}: 영속 키가 DETECTOR_KEYS.${d.keyMember}의 별칭이다 (복붙 금지)`,
  );
  for (const ref of DEAD_REFS) {
    check(!new RegExp(`\\b${ref}\\b`).test(src), `${d.path}: 비영속 ${ref}가 부활하지 않았다`);
  }

  // (b) 삭제 지점 2곳 — check() 정의 **앞**(토글/마스터 OFF 분기)과 **뒤**(거주국 복귀 분기).
  //     앞쪽이 빠지면 '해외에서 OFF → 귀국 → 다음 여행에 ON'에서 값이 고착돼 알림이 0건이 된다.
  //     뒤쪽이 빠지면 귀국해도 다음 여행에서 알림이 오지 않는다.
  const checkAt = src.indexOf('const check = async');
  const removals = [...src.matchAll(new RegExp(`removeItem\\(${d.keyConst}\\)`, 'g'))].map((m) => m.index);
  check(checkAt > 0, `${d.path}: check() 정의를 찾았다`);
  check(
    removals.some((i) => i < checkAt),
    `${d.path}: 토글/마스터 OFF 분기에서 ${d.keyConst}를 지운다 (고착 방지)`,
  );
  check(
    removals.some((i) => i > checkAt),
    `${d.path}: 거주국·체류국 복귀 시 ${d.keyConst}를 지운다`,
  );
  check(new RegExp(`setItem\\(${d.keyConst}`).test(src), `${d.path}: 발송 후 ${d.keyConst}에 기록한다`);

  // (c) 재진입 가드 — 위치 조회에 타임아웃이 없어, 조회가 스로틀보다 길어지면 중복 발송된다
  check(/^let checking = false;/m.test(src), `${d.path}: 재진입 플래그가 모듈 스코프다`);
  check(
    /if\s*\(\s*checking\s*\)\s*return\s*;/.test(src) && /checking\s*=\s*true\s*;/.test(src),
    `${d.path}: check() 진입 시 재진입을 차단한다`,
  );
  check(
    /finally\s*\{\s*checking\s*=\s*false\s*;\s*\}/.test(src),
    `${d.path}: finally에서 재진입 플래그를 푼다 (예외에도 잠기지 않게)`,
  );

  // (d) 실패 시 되돌리기 — 없으면 위치 조회 한 번 실패로 다음 시도가 스로틀 주기 뒤로 밀린다
  check(
    /lastCheckAt\s*=\s*now\s*-\s*CHECK_INTERVAL\s*\+\s*RETRY_INTERVAL\s*;/.test(src),
    `${d.path}: 위치 조회 실패 시 스로틀을 되돌린다`,
  );

  // (d-2) 되돌린 값은 반드시 과거 시각이어야 한다. RETRY >= CHECK 이면 미래 시각이 되어
  //       그 감지기가 영구 차단된다. 상수 순서에만 의존하는 식이라 숫자로 직접 검사한다.
  const checkInterval = numericConst(src, 'CHECK_INTERVAL');
  const retryInterval = numericConst(src, 'RETRY_INTERVAL');
  check(
    typeof checkInterval === 'number' && typeof retryInterval === 'number',
    `${d.path}: CHECK_INTERVAL·RETRY_INTERVAL을 숫자로 읽었다 (${checkInterval}, ${retryInterval})`,
  );
  check(
    retryInterval > 0 && retryInterval < checkInterval,
    `${d.path}: 0 < RETRY_INTERVAL(${retryInterval}) < CHECK_INTERVAL(${checkInterval}) — 되돌린 시각이 과거다`,
  );

  // (e) 세대 무효화 — effect cleanup은 이미 시작된 check() 프로미스를 취소하지 못한다.
  //     위치 조회 중에 토글이 꺼지면 옛 클로저가 뒤늦게 깨어나 취소한 예약을 되살리고
  //     지운 기록을 'true'로 되돌린다(= 고착 재발). 세대 대조로 그 write를 버려야 한다.
  //     ⚠️ 이 검사들은 '무효화 검사가 write보다 앞에 있다'는 **구조**만 본다.
  //        실제로 경쟁 상황에서 올바르게 동작하는지는 정적으로 판정할 수 없다.
  check(/^let generation = 0;/m.test(src), `${d.path}: 세대 카운터가 모듈 스코프다`);
  check(/const myGen = generation;/.test(src), `${d.path}: check()가 시작 시점의 세대를 캡처한다`);
  check(/const stale = \(\) => myGen !== generation;/.test(src), `${d.path}: 세대 대조 헬퍼가 있다`);

  // 세대를 올리는 시점이 OFF 분기의 removeItem보다 **앞**이어야 한다.
  // 뒤에 있으면 지우기 전에 시작된 옛 check()가 무효로 판정되지 않아 기록을 되살린다.
  const bumpAt = src.indexOf('generation += 1;');
  const offRemoval = removals.find((i) => i < checkAt);
  check(
    bumpAt > 0 && offRemoval !== undefined && bumpAt < offRemoval,
    `${d.path}: OFF 분기의 removeItem보다 먼저 세대를 올린다 (bump=${bumpAt}, removeItem=${offRemoval})`,
  );

  // 무효화 관문은 **세 곳**이며 위치로 검사한다. 한 곳만 보면 다른 곳을 지워도 통과한다
  // (실제로 처음엔 '발송 전에 하나만 있으면 통과'로 썼다가, 조회 직후 관문을 지운 변이가
  //  빠져나가는 것을 확인하고 아래처럼 구간을 쪼갰다).
  //   1) 조회 뒤 → 저장소 읽기 전  : 무효가 된 호출은 아무 일도 하기 전에 빠져나간다
  //   2) 저장소 읽기 뒤 → 발송 전  : 권한 팝업이 떠 있는 동안 꺼진 경우를 잡는다
  //   3) 발송 뒤 → 기록 전         : 여기가 핵심. 기록을 남기면 OFF가 지운 값이 되살아나 고착된다
  const detectAt = src.indexOf('detectCurrentCountry()', checkAt);
  const getAt = src.indexOf(`getItem(${d.keyConst}`, checkAt);
  const sendAt = src.indexOf(d.sendCall, checkAt);
  const setAt = src.indexOf(`setItem(${d.keyConst}`, checkAt);
  // `const stale = () =>`(정의)는 공백 때문에 `stale()`에 걸리지 않는다 — 호출만 센다.
  const staleAt = [...src.matchAll(/stale\(\)/g)].map((m) => m.index).filter((i) => i > checkAt);
  check(
    detectAt > 0 && getAt > 0 && sendAt > 0 && setAt > 0,
    `${d.path}: 조회·판독·발송·기록 지점을 모두 찾았다 (${detectAt}, ${getAt}, ${sendAt}, ${setAt})`,
  );
  check(
    staleAt.some((i) => i > detectAt && i < getAt),
    `${d.path}: 위치 조회 뒤 · 저장소 판독 전에 무효화 검사가 있다`,
  );
  check(
    staleAt.some((i) => i > getAt && i < sendAt),
    `${d.path}: 저장소 판독 뒤 · 발송 전에 무효화 검사가 있다`,
  );
  check(
    staleAt.some((i) => i > sendAt && i < setAt),
    `${d.path}: 발송 뒤 · 기록(setItem) 전에 무효화 검사가 있다`,
  );

  // (f) 이탈 시 스로틀 선점 정리 — abort()
  //
  // 선점(lastCheckAt = now)은 '판정을 하겠다'는 예약이다. 판정 없이 빠져나가면서 선점을
  // 그대로 두면 스로틀만 소모돼 다음 감지가 CHECK_INTERVAL 뒤로 밀린다 — 하필 사용자가
  // 설정을 바꾼 직후가 감지 공백이 된다. 반대로 **알림이 이미 트레이에 뜬 뒤**라면 되돌리면
  // 안 된다. RETRY_INTERVAL(60초) 뒤에 같은 알림이 또 나가기 때문이다.
  // 그래서 소모 기준은 '판정했는가'가 아니라 `emitted`(보이는 알림을 냈는가) 하나다.
  //
  // ⚠️ 예전에는 `rewind() 호출 수 >= stale() 수 + 1`로 **총량만** 셌다. 죽은 코드
  //    `if (false) { rewind(); }`를 넣고 관문에서 빼면 개수가 유지돼 통과했다.
  //    관문 검사(위)가 인덱스 구간을 보는데 이쪽만 개수를 세는 것이 비일관이었으므로,
  //    아래처럼 **구간마다 하나씩** 있는지로 바꿨다.
  check(
    /const abort = \(\) => \{ if \(!emitted\) lastCheckAt = now - CHECK_INTERVAL \+ RETRY_INTERVAL; \};/.test(src),
    `${d.path}: 이탈 헬퍼(abort)가 emitted 기준으로 선점을 정리한다`,
  );
  check(/^\s*let emitted = false;$/m.test(src), `${d.path}: emitted 플래그를 선언한다`);

  const abortAt = [...src.matchAll(/abort\(\)/g)].map((m) => m.index).filter((i) => i > checkAt);
  // `} catch {`와 `} catch (e) {` 둘 다 받는다 — 바인딩 유무는 규칙과 무관한데
  // 리터럴로 찾으면 바인딩을 추가하는 순간 근거 없이 실패한다(검사가 규칙이 아니라
  // 표기를 강제하게 된다).
  const catchMatch = /\}\s*catch\s*(\([\w$]*\)\s*)?\{/.exec(src.slice(checkAt));
  const catchAt = catchMatch ? checkAt + catchMatch.index : -1;
  const s1 = staleAt[0];
  const s2 = staleAt[1];
  const s3 = staleAt[2];
  check(
    staleAt.length === 3 && catchAt > 0,
    `${d.path}: 관문 3곳과 catch 블록을 찾았다 (stale ${staleAt.length}곳, catch=${catchAt})`,
  );
  // 구간별로 정확히 짚는다 — 죽은 코드를 다른 곳에 넣어도 빠진 구간이 그대로 드러난다.
  const between = (lo, hi) => abortAt.some((i) => i > lo && i < hi);
  check(between(detectAt, s1), `${d.path}: 조회 실패 경로가 선점을 정리한다`);
  check(between(s1, s2), `${d.path}: 관문 ①이 선점을 정리한다`);
  check(between(s2, s3), `${d.path}: 관문 ②가 선점을 정리한다`);
  check(between(s3, catchAt), `${d.path}: 관문 ③이 선점을 정리한다`);
  // (g) 예외 경로 — 서비스 계층(권한·발송·예약)에 try/catch가 없어 throw가 그대로 올라온다.
  //     catch가 없으면 unhandled rejection + 선점 잔존(= 감지 공백)이 동시에 난다.
  check(between(catchAt, src.length), `${d.path}: catch가 선점을 정리한다 (예외 경로)`);

  // (h) emitted를 세우는 위치 — 발송 뒤·기록 전이어야 한다. 발송 전에 세우면 아무것도 안 뜬
  //     경우까지 선점을 소모하고, 기록 뒤에 세우면 관문 ③이 판단할 때 이미 늦다.
  const emittedAt = [...src.matchAll(/emitted = true;/g)].map((m) => m.index);
  check(
    emittedAt.some((i) => i > sendAt && i < setAt),
    `${d.path}: 알림 발송 직후에 emitted를 세운다`,
  );

  // (i) 권한 관문의 문장 자체를 대조한다.
  //     `&&`를 `||`로 바꾸면 정상 경로까지 전부 이탈해 **알림이 영영 안 나가는데**, 구조 검사는
  //     전부 통과한다(관문도 abort도 제자리에 있으므로). 의미를 볼 수 없으니 문장을 고정한다.
  //     두 감지기가 같은 변수명을 쓰는 이유이기도 하다 — 한쪽만 어긋나는 것을 막는다.
  check(
    src.includes('if (hasPermission && stale()) { abort(); return; }'),
    `${d.path}: 권한 관문이 'hasPermission && stale()'이다 (|| 로 바뀌면 알림이 영영 안 나간다)`,
  );
  check(
    src.includes('if (hasPermission) {'),
    `${d.path}: 권한 거부 시에는 이탈하지 않고 폴스루한다 (되돌리지 않는 것이 의도)`,
  );
}

// ── 규칙 2: 두 감지기의 영속 키가 서로 다르다 ──
// 같은 키를 쓰면 한쪽이 다른 쪽의 발송 기록을 지워 조용히 중복 발송 또는 침묵이 난다.
check(DETECTORS[0].key !== DETECTORS[1].key, '스냅·도착 감지기가 서로 다른 영속 키를 쓴다');

// ── 규칙 3: 스냅 알림 두 종류 모두 고정 identifier로 나간다 ──
// 영속 write가 실패해도 알림창에 쌓이지 않게 하는 2차 방어다. 예약분만 막고 즉시분을
// 빠뜨리면, 저장 실패 시 즉시 스냅이 콜드 스타트마다 새로 쌓인다.
const service = readSafe(SERVICE);
if (service === null) {
  check(false, `${SERVICE} 파일이 없다`);
} else {
  for (const [fn, idConst] of [
    ['sendSnapNotification', 'SNAP_INSTANT_NOTIF_ID'],
    ['scheduleRandomSnapNotification', 'SNAP_FOLLOWUP_NOTIF_ID'],
  ]) {
    check(new RegExp(`export const ${idConst} = '`).test(service), `${SERVICE}: ${idConst}를 export 한다`);
    // 함수 본문만 잘라 본다 — 파일 전체를 보면 옆 함수의 identifier에 걸려 통과해 버린다.
    const start = service.indexOf(`export async function ${fn}`);
    const after = service.indexOf('\nexport ', start + 1);
    const body = start < 0 ? '' : service.slice(start, after < 0 ? undefined : after);
    check(body.length > 0, `${SERVICE}: ${fn}()가 있다`);
    check(new RegExp(`identifier:\\s*${idConst}`).test(body), `${SERVICE}: ${fn}()가 ${idConst}로 발송한다`);
  }

  // ── 규칙 4: '전체 취소로 충분하다'는 전제 ──
  // cancelScheduledSnapNotifications는 cancelAllScheduledNotificationsAsync를 부른다. 이 앱의
  // trigger 기반(=예약 목록에 들어가는) 알림이 스냅 follow-up 하나뿐이라는 전제 위에서만
  // 안전하다. 다른 기능이 예약 알림을 추가하면 스냅 토글이 그것까지 지워 버린다.
  check(
    /cancelAllScheduledNotificationsAsync\s*\(/.test(service),
    `${SERVICE}: cancelScheduledSnapNotifications가 전체 취소를 쓴다`,
  );
  const triggered = [];
  for (const p of collect('src')) {
    // `trigger: {` 만 세고 `trigger: null`(즉시 발송)은 제외한다
    const n = [...readFileSync(p, 'utf8').matchAll(/trigger:\s*\{/g)].length;
    if (n > 0) triggered.push(`${rel(p)}(${n})`);
  }
  check(
    triggered.length === 1 && triggered[0].startsWith(SERVICE),
    `trigger 기반 예약 알림은 ${SERVICE} 한 곳뿐 — 전체 취소 전제 유효 (실제: ${triggered.join(', ') || '없음'})`,
  );
}

// ── 규칙 5: 앱 전체의 알림 identifier가 서로 겹치지 않는다 ──
//
// 규칙 2가 영속 키의 유일성을 지키는 것과 정확히 같은 사고를 알림 쪽에서 막는다.
// Android는 `NotificationManagerCompat.notify(tag = identifier, id = 상수)`로 게시하므로
// (expo-notifications의 ExpoPresentationDelegate) **tag(=identifier)만이 유일 판별자**다.
// 두 알림이 같은 값을 쓰면 나중 것이 먼저 것을 조용히 교체해 없앤다. iOS도 같은 identifier면
// pending·delivered가 교체된다. 컴파일도 되고 오류도 없이 알림 하나가 사라지는 종류의 사고다.
//
// snapService 두 개만 보지 않고 **앱 전체**를 보는 이유: 충돌은 기능을 가로질러 난다.
// 예컨대 momentService의 상주 알림과 스냅이 같은 값이 되면 여행 기억 알림이 스냅에 지워진다.
// 파일 하나만 검사하면 같은 결함이 옆 파일에서 그대로 열린다.
const NOTIF_IDS = []; // { name, value, file }
for (const p of collect('src')) {
  const text = readFileSync(p, 'utf8');
  // 따옴표 종류를 가리지 않는다 — 작은따옴표만 보면 "snap-followup"(쌍따옴표)로 쓴 충돌이
  // 검사를 그냥 통과한다. 이 저장소는 작은따옴표가 관례라 지금은 인라인 리터럴이 0건이지만,
  // 관례를 벗어난 한 줄이 정확히 이 검사가 잡아야 할 대상이다.
  for (const m of text.matchAll(/const\s+([A-Za-z0-9_]*NOTIF_ID)\s*=\s*(['"`])([^'"`]*)\2/g)) {
    NOTIF_IDS.push({ name: m[1], value: m[3], file: rel(p) });
  }
  // 상수를 거치지 않고 문자열을 그대로 박은 경우도 같은 충돌을 낸다
  for (const m of text.matchAll(/identifier:\s*(['"`])([^'"`]*)\1/g)) {
    NOTIF_IDS.push({ name: `(인라인 ${rel(p)})`, value: m[2], file: rel(p) });
  }
}

// 스캔이 아무것도 못 찾으면 유일성은 공허하게 참이 된다. 알려진 상수 3개가 잡히는지 먼저 확인해
// '이름이 바뀌어 검사가 조용히 무력화되는' 경로를 막는다(변이 M7이 지적한 실패 양식).
for (const required of ['SNAP_INSTANT_NOTIF_ID', 'SNAP_FOLLOWUP_NOTIF_ID', 'MOMENT_NOTIF_ID']) {
  check(
    NOTIF_IDS.some((e) => e.name === required),
    `알림 identifier 스캔이 ${required}를 찾았다 (못 찾으면 유일성 검사가 무의미해진다)`,
  );
}

// 스캔 범위 자체를 검사한다 — 위 수집은 이름이 `*NOTIF_ID`인 상수만 본다. 누가
// `ARRIVAL_TRAY_ID` 같은 다른 이름으로 상수를 만들어 identifier에 쓰면 충돌해도 안 보인다.
// 이름 패턴을 넓히는 것은 또 다른 명명에서 새므로, 반대 방향으로 검사한다:
// **identifier에 실제로 쓰인 상수는 모두 수집 목록 안에 있어야 한다.**
// (순환이 아니다 — 유일성 검사는 '수집된 값들끼리 겹치는가'이고, 이 검사는 '수집이 실제
//  사용처를 전부 덮는가'다. 서로 다른 명제이며 이쪽이 앞의 전제를 지킨다.)
// expo-notifications를 쓰는 파일로 한정한다 — `identifier:`라는 키는 다른 맥락에도 흔해서
// (타입 표기 `identifier: string`, 무관한 객체 리터럴) 전역 스캔하면 오탐만 나온다.
// 한계: 알림 호출을 감싸는 래퍼를 만들고 그 래퍼가 이 모듈을 임포트하지 않으면 안 보인다.
const knownNames = new Set(NOTIF_IDS.map((e) => e.name));
const unscanned = [];
for (const p of collect('src')) {
  const text = readFileSync(p, 'utf8');
  if (!text.includes('expo-notifications')) continue;
  // 따옴표로 시작하지 않는 것 = 상수 참조
  for (const m of text.matchAll(/identifier:\s*([A-Za-z_$][\w$]*)/g)) {
    if (!knownNames.has(m[1])) unscanned.push(`${m[1]} (${rel(p)})`);
  }
}
check(
  unscanned.length === 0,
  `identifier에 쓰인 상수가 전부 스캔 대상이다 (밖에 있는 것: ${unscanned.join(', ') || '없음'})`,
);

const byValue = new Map();
for (const e of NOTIF_IDS) {
  if (!byValue.has(e.value)) byValue.set(e.value, []);
  byValue.get(e.value).push(e);
}
const collisions = [...byValue.entries()].filter(([, list]) => new Set(list.map((e) => e.name)).size > 1);
check(
  collisions.length === 0,
  `알림 identifier가 앱 전체에서 서로 다르다 (${NOTIF_IDS.length}건 검사${
    collisions.length ? ` — 충돌: ${collisions.map(([v, l]) => `'${v}' ← ${l.map((e) => e.name).join(' + ')}`).join(', ')}` : ''
  })`,
);

// ── 규칙 6: 감지기 영속 키의 정의처는 store/persist.ts 하나뿐이다 ──
//
// 키가 두 곳에 있으면 한쪽만 고쳐도 컴파일되고, 증상은 '해외에서 데이터를 초기화한 뒤
// 그 여행 내내 알림 0건'으로만 나타난다. 실제로 clearPersistedStores가 지우는 목록에
// 감지기 키 3개가 통째로 빠져 있었고(6차 QA 1순위), 감지기마다 문자열을 따로 들고 있었기
// 때문에 어느 쪽을 봐도 어긋난 것이 드러나지 않았다.
const PERSIST = 'src/store/persist.ts';
const DETECTOR_KEY_VALUES = {
  snapSent: '@eorth/snapDetect/sent',
  arrivalSentCountry: '@eorth/arrivalDetect/sentCountry',
  returnAbroadLast: '@eorth/returnDetect/abroadLast',
};
const persist = readSafe(PERSIST);
if (persist === null) {
  check(false, `${PERSIST} 파일이 없다`);
} else {
  check(/export const DETECTOR_KEYS = \{/.test(persist), `${PERSIST}: DETECTOR_KEYS를 export 한다`);
  for (const [member, value] of Object.entries(DETECTOR_KEY_VALUES)) {
    // 값까지 고정한다 — 키 이름이 바뀌면 기존 설치의 저장값이 orphan이 되고, 그 설치는
    // '이미 보냈음'을 잃은 채(또는 영영 지워지지 않은 채) 동작한다.
    check(
      new RegExp(`${member}:\\s*'${value}'`).test(persist),
      `${PERSIST}: DETECTOR_KEYS.${member} = '${value}'`,
    );
  }
  // clearPersistedStores가 세 키를 **빠짐없이** 지우는가. 손으로 열거하면 감지기가 늘 때
  // 다시 빠지므로, 전개(spread)로 전부 도는 형태 자체를 고정한다.
  const clearStart = persist.indexOf('export async function clearPersistedStores');
  const clearBody = clearStart < 0 ? '' : persist.slice(clearStart, persist.indexOf('\n}', clearStart));
  check(clearStart > 0, `${PERSIST}: clearPersistedStores()가 있다`);
  check(
    /\.\.\.Object\.values\(DETECTOR_KEYS\)/.test(clearBody),
    `${PERSIST}: clearPersistedStores가 DETECTOR_KEYS 전체를 지운다 (열거 누락 원천 차단)`,
  );
}

// 키 문자열 리터럴이 persist.ts 밖에 나타나지 않는가 — 별칭 검사(규칙 1)만으로는 '별칭도
// 두고 다른 파일에 리터럴도 두는' 상태를 못 잡는다. 이쪽이 그 뒷문을 막는다.
const strayLiterals = [];
for (const p of collect('src')) {
  const r = rel(p);
  if (r === PERSIST) continue;
  const text = readFileSync(p, 'utf8');
  for (const value of Object.values(DETECTOR_KEY_VALUES)) {
    if (text.includes(`'${value}'`) || text.includes(`"${value}"`)) strayLiterals.push(`${value} (${r})`);
  }
}
check(
  strayLiterals.length === 0,
  `감지기 키 문자열이 ${PERSIST} 밖에 없다 (밖에 있는 것: ${strayLiterals.join(', ') || '없음'})`,
);

// ── 규칙 7: MomentNotifier의 '양보'가 도착 알림 발송 여부와 실제로 연동돼 있다 ──
//
// armedRef 양보는 "도착 알림이 지금 나갈 테니 순간 기억 상주 알림은 한 번 건너뛴다"는
// 전제 위에서만 옳다. ArrivalNotifier의 발송 기록이 영속화되면서 같은 나라 재방문·앱
// 재시작에서는 도착 알림이 나가지 않게 됐고, 전제가 깨진 채 양보만 남으면 **그 회차에
// 아무 알림도 뜨지 않는다**(6차 QA 발견 17, 실측으로 재현됨).
//
// ⚠️ 이 결함이 5차까지 안 잡힌 이유가 정확히 이 가드에 있다 — 수정 대상 3파일만 보고
//    MomentNotifier를 보지 않았다. 감지기 사이의 전제는 **파일 하나 안에 없다.**
const MOMENT = 'src/components/MomentNotifier.tsx';
const moment = readSafe(MOMENT);
if (moment === null) {
  check(false, `${MOMENT} 파일이 없다`);
} else {
  check(
    /import \{[^}]*\bwillArrivalNotify\b[^}]*\} from '\.\.\/services\/snapService'/.test(moment),
    `${MOMENT}: snapService의 willArrivalNotify를 쓴다 (도착 알림 발송 여부와 연동)`,
  );
  // 문장 자체를 고정한다. 구조만 보면 `&& true`·`|| ...`로 조건을 무력화해도 통과한다 —
  // 권한 관문(규칙 1-i)에서 이미 겪은 실패 양식이다.
  check(
    moment.includes(
      'const yieldToArrival = arrivalDetect && !armedRef.current && (await willArrivalNotify(countryCodeRef.current));',
    ),
    `${MOMENT}: 양보 조건이 'arrivalDetect && !armedRef.current && willArrivalNotify(...)'이다`,
  );
  // 양보(armedRef=true)는 그 판정 결과로만 일어나야 한다. 다른 곳에서 세우면 조건이 무의미해진다.
  const armedTrue = [...moment.matchAll(/armedRef\.current = true;/g)].map((m) => m.index);
  const yieldAt = moment.indexOf('if (yieldToArrival) {');
  check(
    yieldAt > 0 && armedTrue.length === 1 && armedTrue[0] > yieldAt,
    `${MOMENT}: armedRef를 세우는 곳은 yieldToArrival 분기 한 곳뿐이다 (${armedTrue.length}곳)`,
  );
  // 판정이 나라 코드를 받으려면 조회 결과를 캐시해야 한다. 이 대입이 빠지면 인자가 늘 null이라
  // willArrivalNotify가 항상 false를 돌려주고 **양보가 통째로 죽는다**(도착 알림과 겹침).
  // 위 문장 고정은 호출 형태만 보므로 이 대입을 따로 못 박는다.
  const detectAtM = moment.indexOf('detectCurrentCountry()');
  const cacheAt = moment.indexOf('countryCodeRef.current = countryCode;');
  check(
    detectAtM > 0 && cacheAt > detectAtM,
    `${MOMENT}: 위치 조회 뒤 나라 코드를 캐시한다 (양보 판정의 입력)`,
  );
}

const svc = readSafe(SERVICE);
if (svc !== null) {
  // 판정 함수는 도착 감지기와 **같은 키·같은 식**을 봐야 한다. 여기서 갈라지면 양보와 발송이
  // 어긋나 (양보했는데 도착 알림은 안 나감) 발견 17이 그대로 되돌아온다.
  const wStart = svc.indexOf('export async function willArrivalNotify');
  const wBody = wStart < 0 ? '' : svc.slice(wStart, svc.indexOf('\n}', wStart));
  check(wStart > 0, `${SERVICE}: willArrivalNotify()를 export 한다`);
  check(
    /getItem\(DETECTOR_KEYS\.arrivalSentCountry\)/.test(wBody),
    `${SERVICE}: willArrivalNotify가 DETECTOR_KEYS.arrivalSentCountry를 읽는다`,
  );
  check(
    /return sent !== countryCode\.toUpperCase\(\);/.test(wBody),
    `${SERVICE}: willArrivalNotify의 판정식이 ArrivalNotifier의 발송 조건과 같다`,
  );
  // ⚠️ 위 검사만으로는 부족하다 — 짝의 **한쪽만** 고정하기 때문이다.
  // `willArrivalNotify`를 그대로 두고 ArrivalNotifier의 발송 조건을 바꾸면(예:
  // `sentCountry !== cur` → `sentCountry === null`) 일본→대만에서 도착 알림은 침묵하는데
  // 판정 함수는 여전히 true를 돌려줘 MomentNotifier가 양보한다 = 발견 17이 글자 그대로 재발한다.
  // 그런데도 위 검사는 통과한다(7차 QA 발견 20, 변이 P13으로 실증).
  // 두 식은 한 쌍이므로 **양쪽 다** 고정해야 한 쌍이 유지된다.
  const arrivalSrc = readSafe(ARRIVAL);
  check(
    arrivalSrc !== null && arrivalSrc.includes('if (sentCountry !== cur) {'),
    `${ARRIVAL}: 발송 조건이 'sentCountry !== cur'이다 (willArrivalNotify와 한 쌍 — 한쪽만 바뀌면 발견 17 재발)`,
  );
  // MomentNotifier에는 try/catch가 없다(범위 밖). 여기서 새는 예외는 곧 unhandled rejection이다.
  check(/\.catch\(\(\) => null\)/.test(wBody), `${SERVICE}: willArrivalNotify가 읽기 실패를 삼킨다`);
}

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
