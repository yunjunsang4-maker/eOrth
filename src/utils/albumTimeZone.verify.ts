// src/utils/albumTimeZone.verify.ts
// 사진첩 '여행지 날짜' 시간대 유틸 검증. 실행 기기 시간대와 무관하게 성립하도록
//  - tz가 있는 케이스는 입력을 Date.UTC(절대시각)로, 기대값을 그 시간대 기준으로 적고
//  - tz가 없는(기기 로컬 폴백) 케이스는 기대값도 같은 기기의 new Date 로컬 필드에서 뽑는다.
// TZ=Asia/Seoul · TZ=America/Los_Angeles 두 환경에서 모두 통과해야 한다.
import { flagToIso2, albumTimeZoneOf, zonedParts, zonedDayKey, zonedWallClockToMs } from './albumTimeZone';
import { COUNTRY_TIME_ZONES } from '../constants/countryTimeZones';
import { COUNTRIES } from '../constants/countries';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const localKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`; };
const localParts = (ts: number) => { const d = new Date(ts); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() }; };

// ── 국기 → ISO2 ──
eq(flagToIso2('🇪🇸'), 'ES', '국기: 🇪🇸 → ES');
eq(flagToIso2('🇰🇷'), 'KR', '국기: 🇰🇷 → KR');
eq(flagToIso2(' 🇯🇵 '), 'JP', '국기: 앞뒤 공백은 무시');
eq(flagToIso2(''), undefined, "국기: '' → undefined");
eq(flagToIso2(null), undefined, '국기: null → undefined');
eq(flagToIso2(undefined), undefined, '국기: undefined → undefined');
eq(flagToIso2('ES'), undefined, '국기: 일반 영문자 ES는 국기가 아니다');
eq(flagToIso2('🏳️'), undefined, '국기: 지역 표시 문자가 아닌 깃발 이모지 → undefined');
eq(flagToIso2('🇪🇸🇯🇵'), undefined, '국기: 두 나라가 붙은 문자열 → undefined');
eq(flagToIso2('🇪'), undefined, '국기: 지역 표시 문자 1개 → undefined');

// ── 앨범 기록 → 시간대 ──
eq(albumTimeZoneOf({ countryFlag: '🇪🇸' }), 'Europe/Madrid', '앨범: 스페인 국기 → Europe/Madrid');
eq(albumTimeZoneOf({ countryFlag: '🇯🇵' }), 'Asia/Tokyo', '앨범: 일본 국기 → Asia/Tokyo');
eq(albumTimeZoneOf({ countryFlag: '🇰🇷' }), 'Asia/Seoul', '앨범: 한국 국기 → Asia/Seoul');
// 여러 시간대 나라 → undefined(기기 시간대 = 예전 동작). 대표를 잘못 고르면 괌·블라디보스토크가 예전보다 나빠진다(QA 중간 1)
for (const [flag, name] of [['🇺🇸', '미국'], ['🇷🇺', '러시아'], ['🇦🇺', '호주'], ['🇨🇦', '캐나다'], ['🇧🇷', '브라질'], ['🇲🇽', '멕시코'], ['🇮🇩', '인도네시아'], ['🇰🇿', '카자흐스탄']]) {
  eq(albumTimeZoneOf({ countryFlag: flag }), undefined, `앨범: ${name}(여러 시간대) → undefined`);
}
// 국기가 다중 시간대 나라로 풀리면 이름(단일 시간대 나라)으로 넘어가지 않는다 — 나라는 국기로 정해졌다
eq(albumTimeZoneOf({ countryFlag: '🇺🇸', countryName: '일본' }), undefined, '앨범: 다중 시간대 국기는 이름 폴백 없이 undefined');
eq(albumTimeZoneOf({ countryName: '미국' }), undefined, '앨범: 이름으로 풀린 다중 시간대 나라도 undefined');
eq(albumTimeZoneOf({ countryFlag: '🇦🇶' }), undefined, '앨범: COUNTRIES에 없는 국기(남극) → undefined(기기 시간대)');
eq(albumTimeZoneOf({ countryFlag: '', countryName: '' }), undefined, '앨범: 국기·이름 모두 빈 값 → undefined');
eq(albumTimeZoneOf({}), undefined, '앨범: 필드 없음 → undefined');
// 사진첩이 아닌 옛 기록 모양 — 국기는 비고 이름만 있는 경우도 풀린다
eq(albumTimeZoneOf({ countryFlag: '', countryName: '일본' }), 'Asia/Tokyo', '앨범: 국기 없이 countryName 일본 → Asia/Tokyo');
eq(albumTimeZoneOf({ countryName: ' 일본 ' }), 'Asia/Tokyo', '앨범: countryName 앞뒤 공백 무시');
eq(albumTimeZoneOf({ countryFlag: '', countries: [{ flag: '🇫🇷', name: '프랑스' }] }), 'Europe/Paris', '앨범: countries[0] 국기 → Europe/Paris');
eq(albumTimeZoneOf({ countries: [{ flag: '', name: '이탈리아' }] }), 'Europe/Rome', '앨범: countries[0] 이름만 → Europe/Rome');
eq(albumTimeZoneOf({ countryName: 'Atlantis' }), undefined, '앨범: 모르는 나라 이름 → undefined');
eq(albumTimeZoneOf({ countryFlag: '🇪🇸', countryName: '일본' }), 'Europe/Madrid', '앨범: 국기가 이름보다 우선');

// ── 표가 COUNTRIES 199개를 전부 덮는가 ──
{
  const codes = COUNTRIES.map((c) => c.term.split(' ')[0].toUpperCase());
  // 개수는 고정하지 않는다(2026-11-07 기준 198개) — 나라를 추가하면 아래 누락 검사가 표 갱신을 요구한다.
  // 표의 값: 문자열 = 대표 시간대, null = 다중 시간대 목록(기기 시간대). 둘 중 하나에는 반드시 있어야 한다
  eq(codes.filter((c) => !(c in COUNTRY_TIME_ZONES)), [], '모든 COUNTRIES가 표(대표 시간대) 또는 다중 시간대 목록(null)에 있다');
  eq(Object.keys(COUNTRY_TIME_ZONES).filter((k) => COUNTRY_TIME_ZONES[k] === null).sort(),
    ['AU', 'BR', 'CA', 'CL', 'ID', 'KI', 'KZ', 'MX', 'RU', 'US'], '다중 시간대 목록(null) = 2시간 이상 벗어나는 주요 여행지가 있는 나라 + 최소 목록');
  eq(['ES', 'PT', 'EC', 'MN', 'CD', 'PG', 'FM', 'NZ', 'FR'].filter((c) => typeof COUNTRY_TIME_ZONES[c] !== 'string'), [], '1시간 이하 나라·해외 영토 나라는 대표 유지');
  eq(Object.keys(COUNTRY_TIME_ZONES).filter((k) => !codes.includes(k)), [], '시간대 표에 COUNTRIES 밖 키 없음(오타 방지)');
  // 앨범은 국기로 저장하므로 COUNTRIES의 국기가 term 코드와 같은 ISO2로 풀려야 한다
  eq(COUNTRIES.filter((c) => flagToIso2(c.flag) !== c.term.split(' ')[0].toUpperCase()).map((c) => c.name), [], 'COUNTRIES 국기 → ISO2가 term 코드와 전부 일치');
  // id 오타는 Intl이 RangeError — 조용히 기기 시간대로 떨어지면 고친 의미가 없다
  const bad = Object.entries(COUNTRY_TIME_ZONES).filter(([, tz]) => {
    if (tz === null) return false;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return false; } catch { return true; }
  });
  eq(bad, [], '시간대 표의 IANA id가 전부 유효(Node ICU)');
}

// ── 사용자 증상 재현: 스페인 22:00과 다음날 07:00 ──
// 마드리드 11월은 UTC+1: 11/06 22:00 = 21:00Z, 11/07 07:00 = 06:00Z. 한국 시간으로는 둘 다 11/07(06:00·15:00)
const ES_22 = Date.UTC(2026, 10, 6, 21, 0);
const ES_07 = Date.UTC(2026, 10, 7, 6, 0);
eq([zonedDayKey(ES_22, 'Europe/Madrid'), zonedDayKey(ES_07, 'Europe/Madrid')], ['2026.11.06', '2026.11.07'], '증상: 마드리드 기준이면 22:00과 다음날 07:00은 서로 다른 날');
eq([zonedDayKey(ES_22, 'Asia/Seoul'), zonedDayKey(ES_07, 'Asia/Seoul')], ['2026.11.07', '2026.11.07'], '증상 재현: 한국 시간대로 나누면 같은 날(이전 동작)');
eq(zonedParts(Date.UTC(2026, 10, 6, 21, 5, 7), 'Europe/Madrid'), { y: 2026, m: 11, d: 6, h: 22, mi: 5, s: 7 }, '필드: 마드리드 벽시계 2026-11-06 22:05:07');
eq(zonedParts(Date.UTC(2025, 0, 1, 0, 5), 'UTC').h, 0, '필드: 자정 직후 시는 0(24 아님)');
eq(zonedDayKey(Date.UTC(2026, 0, 1, 0, 0), 'America/Los_Angeles'), '2025.12.31', '음수 오프셋: UTC 새해 0시 = LA 12/31');

// ── tz 없음·잘못된 tz → 기기 로컬(예전 동작) ──
for (const tz of [undefined, null, '', 'Not/AZone']) {
  eq(zonedDayKey(ES_22, tz), localKey(ES_22), `폴백: tz=${JSON.stringify(tz)} → 기기 로컬 날짜 키`);
  eq(zonedParts(ES_22, tz), localParts(ES_22), `폴백: tz=${JSON.stringify(tz)} → 기기 로컬 필드`);
  eq(zonedWallClockToMs(2026, 11, 6, 22, 0, 0, tz), new Date(2026, 10, 6, 22, 0, 0).getTime(), `폴백: tz=${JSON.stringify(tz)} 벽시계 → 기기 로컬 해석`);
}

// ── 오프셋 없는 벽시계 → 절대시각 ──
eq(zonedWallClockToMs(2026, 11, 6, 22, 0, 0, 'Europe/Madrid'), ES_22, '벽시계: 마드리드 겨울 22:00 = 21:00Z');
eq(zonedWallClockToMs(2026, 7, 1, 12, 0, 0, 'Europe/Madrid'), Date.UTC(2026, 6, 1, 10), '벽시계: 마드리드 여름(서머타임) 12:00 = 10:00Z');
eq(zonedWallClockToMs(2026, 11, 7, 7, 0, 0, 'Asia/Seoul'), Date.UTC(2026, 10, 6, 22), '벽시계: 서울 07:00 = 전날 22:00Z');
eq(zonedWallClockToMs(2026, 1, 1, 0, 0, 0, 'Asia/Kathmandu'), Date.UTC(2025, 11, 31, 18, 15), '벽시계: 카트만두 +05:45');
// 서머타임 경계 — 마드리드 2026-03-29 01:00Z에 +1 → +2, 2026-10-25 01:00Z에 +2 → +1
eq(zonedWallClockToMs(2026, 3, 29, 1, 30, 0, 'Europe/Madrid'), Date.UTC(2026, 2, 29, 0, 30), '서머타임 시작일: 전환 전 01:30 = +1');
eq(zonedWallClockToMs(2026, 3, 29, 10, 0, 0, 'Europe/Madrid'), Date.UTC(2026, 2, 29, 8, 0), '서머타임 시작일: 전환 후 10:00 = +2');
eq(zonedWallClockToMs(2026, 10, 25, 0, 30, 0, 'Europe/Madrid'), Date.UTC(2026, 9, 24, 22, 30), '서머타임 종료일: 전환 전 00:30 = +2');
eq(zonedWallClockToMs(2026, 10, 25, 12, 0, 0, 'Europe/Madrid'), Date.UTC(2026, 9, 25, 11, 0), '서머타임 종료일: 전환 후 12:00 = +1');
// 음수 오프셋 서머타임 — 뉴욕 2026-03-08 07:00Z에 -5 → -4
eq(zonedWallClockToMs(2026, 3, 8, 1, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 8, 6, 0), '뉴욕 서머타임 시작일 01:00 = -5');
eq(zonedWallClockToMs(2026, 3, 8, 12, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 8, 16, 0), '뉴욕 서머타임 시작일 12:00 = -4');
// '없는 시각'은 뒤쪽 순간(JS Date 'compatible'과 같은 방향) — 서반구도 앞으로 당기지 않는다(QA 낮음 1)
eq(zonedWallClockToMs(2026, 3, 8, 2, 30, 0, 'America/New_York'), Date.UTC(2026, 2, 8, 7, 30), '없는 시각: 뉴욕 02:30 → 03:30 EDT(01:30 EST 아님)');
eq(zonedWallClockToMs(2026, 3, 29, 2, 30, 0, 'Europe/Madrid'), Date.UTC(2026, 2, 29, 1, 30), '없는 시각: 마드리드 02:30 → 03:30 CEST(예전과 같음)');
// 자정 서머타임 시작 — 아바나 2026-03-08 05:00Z(00:00 −5 → 01:00 −4), 산티아고 2026-09-06 04:00Z(00:00 −4 → 01:00 −3).
// 그날 00:00은 없는 시각 → 그날 첫 순간(01:00)이어야 기간 격자에 전날 23시대가 섞이지 않는다
eq(zonedWallClockToMs(2026, 3, 8, 0, 0, 0, 'America/Havana'), Date.UTC(2026, 2, 8, 5, 0), '자정 서머타임: 아바나 3/8 00:00 → 05:00Z(그날 01:00)');
eq(zonedWallClockToMs(2026, 9, 6, 0, 0, 0, 'America/Santiago'), Date.UTC(2026, 8, 6, 4, 0), '자정 서머타임: 산티아고 9/6 00:00 → 04:00Z(그날 01:00)');
eq(zonedWallClockToMs(2026, 9, 6, 0, 30, 0, 'America/Santiago'), Date.UTC(2026, 8, 6, 4, 30), '자정 서머타임: 산티아고 9/6 00:30 → 01:30 −3(전날 23:30 아님)');
// 두 번 있는 시각(뉴욕 11/1 01:30)은 앞의 것(EDT) — 예전과 같음
eq(zonedWallClockToMs(2026, 11, 1, 1, 30, 0, 'America/New_York'), Date.UTC(2026, 10, 1, 5, 30), '겹치는 시각: 뉴욕 11/1 01:30 → EDT 05:30Z');
// 필드가 넘치면 Date.UTC처럼 넘긴다 — 기간 격자가 '종료 다음날 0시'를 이렇게 만든다
eq(zonedWallClockToMs(2026, 1, 32, 0, 0, 0, 'Europe/Madrid'), Date.UTC(2026, 0, 31, 23), '넘침: 1월 32일 = 2월 1일 0시');

// 날짜 키 메모(15분 구간) — 구간 안 어느 시각이든, 자정 ±1ms·서머타임 전환 앞뒤도 메모 없는 계산과 같다
{
  const exact = (ts: number, tz: string) => { const p = zonedParts(ts, tz); return `${p.y}.${pad2(p.m)}.${pad2(p.d)}`; };
  const miss: string[] = [];
  const probes: [string, number][] = [
    ['Europe/Madrid', Date.UTC(2026, 10, 6, 23, 0)], // 마드리드 자정
    ['Asia/Kathmandu', Date.UTC(2026, 0, 1, 18, 15)], // +5:45 자정(15분 경계)
    ['America/Havana', Date.UTC(2026, 2, 8, 5, 0)], // 자정 서머타임 시작
    ['America/Santiago', Date.UTC(2026, 8, 6, 4, 0)],
    ['Asia/Tehran', Date.UTC(2026, 5, 1, 20, 30)], // +3:30 자정
  ];
  for (const [tz, mid] of probes) {
    for (const d of [-900001, -1, 0, 1, 899999, 900000]) {
      const ts = mid + d;
      if (zonedDayKey(ts, tz) !== exact(ts, tz)) miss.push(`${tz}@${ts}`);
    }
  }
  // 무작위 2만 건 × 시간대 5곳(메모가 이미 찬 구간·빈 구간 섞임)
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 20000; k++) {
    const tz = ['Europe/Madrid', 'Asia/Seoul', 'America/Havana', 'Asia/Kathmandu', 'Pacific/Auckland'][k % 5];
    const ts = Date.UTC(2024, 0, 1) + Math.floor(rnd() * 3 * 365 * 86400000);
    if (zonedDayKey(ts, tz) !== exact(ts, tz)) miss.push(`${tz}@${ts}`);
  }
  eq(miss, [], '날짜 키 메모(15분 구간) = 메모 없는 계산(경계·무작위 2만 건)');
}

// 왕복: 표의 모든 시간대에서 1월·7월 한 시각씩 — 필드 → 벽시계 → 같은 절대시각(초 단위)
{
  const miss: string[] = [];
  for (const tz of new Set(Object.values(COUNTRY_TIME_ZONES).filter((v): v is string => !!v))) {
    for (const ts of [Date.UTC(2026, 0, 15, 13, 47, 21), Date.UTC(2026, 6, 15, 2, 3, 4)]) {
      const p = zonedParts(ts, tz);
      if (zonedWallClockToMs(p.y, p.m, p.d, p.h, p.mi, p.s, tz) !== ts) miss.push(`${tz}@${ts}`);
    }
  }
  eq(miss, [], '왕복: 표의 모든 시간대에서 필드 → 절대시각이 원래 값');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
