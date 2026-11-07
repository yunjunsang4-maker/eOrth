/**
 * albumTimeZone.ts — 사진첩(앨범)을 '여행지 날짜'로 나누는 시간대 순수 유틸
 *
 * 왜(2026-11-07 사용자 제보 "22시랑 07시가 같은 날로 되고 있어"): 날짜 줄은 기기 시간대(KST)로 나누는데
 * 하루 보기의 순간 시각은 현지 시각(iOS 역지오코딩 시간대)이라, 스페인 22:00(=KST 다음날 05:00)과
 * 다음날 07:00이 KST 날짜로 같은 날에 묶여 보였다. 이제 날짜 키·dayN·날짜별 사진 추가·추가 안내가 모두
 * 앨범 나라의 대표 시간대(constants/countryTimeZones) 기준이다.
 *
 * 시간대가 없으면(국기 없음·표에 없음·여러 시간대 나라(표의 null)·Intl이 그 id를 모름) 전부 기기 시간대 — 예전 동작 그대로.
 * Intl 폴백 방식은 photoPlace.ts formatClock과 같다: 예외·이상한 모양이면 기기 로컬로.
 * Hermes Intl.DateTimeFormat#formatToParts는 RN 0.81 번들 Hermes 두 플랫폼 모두 구현돼 있다
 * (안드로이드 hermes-android-0.81.5 aar의 com/facebook/hermes/intl/DateTimeFormat.formatToParts,
 *  iOS는 DateTimeFormatApple formatToParts). 그래도 함수가 없거나 결과가 깨지면 기기 로컬로 폴백한다.
 */
import { COUNTRIES } from '../constants/countries';
import { COUNTRY_TIME_ZONES } from '../constants/countryTimeZones';

const pad2 = (n: number) => String(n).padStart(2, '0');
const RI_A = 0x1f1e6; // 지역 표시 문자 🇦

/** 국기 이모지(지역 표시 문자 2개) → ISO2 대문자. 국기가 아니면 undefined */
export function flagToIso2(flag?: string | null): string | undefined {
  const cps = Array.from((flag ?? '').trim()).map((c) => c.codePointAt(0) ?? 0);
  if (cps.length !== 2 || cps.some((c) => c < RI_A || c > RI_A + 25)) return undefined;
  return String.fromCharCode(...cps.map((c) => c - RI_A + 65));
}

/** 한글 국가명 → ISO2 대문자 — COUNTRIES term 첫 토큰이 ISO2 소문자다 */
function nameToIso2(name?: string | null): string | undefined {
  const n = name?.trim();
  const c = n ? COUNTRIES.find((x) => x.name === n) : undefined;
  return c?.term.split(' ')[0].toUpperCase();
}

/**
 * 앨범 기록 → 대표 IANA 시간대. 사진첩은 countryFlag만 저장한다(AlbumCreateScreen — countryName은 지구본·통계 제외로 일부러 비움).
 * 국기 → countries[0] 국기 → countryName → countries[0] 이름 순으로 처음 풀리는 나라. 못 풀면 undefined(= 기기 시간대).
 * 풀린 나라가 여러 시간대 나라(표의 null — 미국·러시아·호주 등)여도 undefined다. 다음 후보로 넘어가지 않는다(나라는 정해졌다).
 */
export function albumTimeZoneOf(rec: {
  countryFlag?: string | null;
  countryName?: string | null;
  countries?: { flag?: string | null; name?: string | null }[] | null;
}): string | undefined {
  const first = rec.countries?.[0];
  const iso = flagToIso2(rec.countryFlag) ?? flagToIso2(first?.flag) ?? nameToIso2(rec.countryName) ?? nameToIso2(first?.name);
  return (iso && COUNTRY_TIME_ZONES[iso]) || undefined;
}

// tz → formatter(못 만들면 null). 사진 수천 장(기간 격자 최대 8,000장)마다 새로 만들지 않게 모듈 캐시.
// 'en-GB'는 기본이 24시간제라 어떤 엔진이 hourCycle을 무시해도 시가 1~12로 떨어지지 않는다 — 시가 12시간 틀리면
// 날짜 키는 멀쩡해도 zonedWallClockToMs 오프셋이 ±12시간 틀려 기간 격자·EXIF 해석이 깨지고, 숫자 검사로는 못 잡는다.
const fmtCache = new Map<string, Intl.DateTimeFormat | null>();
function formatterFor(tz: string): Intl.DateTimeFormat | null {
  let f = fmtCache.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
      if (typeof f.formatToParts !== 'function') f = null;
    } catch {
      f = null; // 모르는 id(RangeError)·Intl 미지원
    }
    fmtCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts { y: number; m: number; d: number; h: number; mi: number; s: number }

/**
 * 절대시각 → 그 시간대의 벽시계 필드(m은 1~12). tz가 없거나 못 다루면 기기 로컬.
 * 요일은 일부러 없다 — 화면 라벨은 날짜 키에서 만든다(albumAddSummary dayKeyToDate(key).getDay(): 달력 날짜의 요일이라 시간대와 무관).
 * ponytail: 사진마다 formatToParts 한 번(안드로이드는 JNI). 기간 격자 8,000장이 느리면 (tz, 15분 구간) → 오프셋 캐시로.
 */
export function zonedParts(ts: number, tz?: string | null): ZonedParts {
  const f = tz ? formatterFor(tz) : null;
  if (f) {
    try {
      const p: Record<string, number> = {};
      for (const { type, value } of f.formatToParts(ts)) p[type] = Number(value);
      // 일부 엔진은 h23에서도 자정을 24로 낸다(photoPlace formatClock 주석) — 0으로
      const out = { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
      if (Object.values(out).every(Number.isFinite)) return out;
    } catch { /* 폴백 */ }
  }
  const d = new Date(ts);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
}

// 날짜 키 메모 — tz별 (15분 구간 → 키). 기간 격자(최대 8,000장)·타임라인이 사진마다 Intl(안드로이드 JNI)을 부르지 않게.
// ponytail: '오프셋 전환은 15분 경계에서만'이라는 전제는 엄밀히 틀리다(Africa/Monrovia 1972년 이전 −0:44:30,
//   Asia/Hebron 2011-04-01 00:01 전환). 둘 다 자정을 넘기지 않아 날짜 키는 같다(QA 실측: 1970~2035 전환 7,945회·표본
//   1,625,734건 불일치 0). 그래서 날짜 키에만 쓰고 시·분(zonedParts)·벽시계 변환(zonedWallClockToMs)에는 쓰지 않는다.
//   tz마다 KEY_MEMO_MAX에서 통째로 비운다(하루 96구간 → 50일치) — LRU가 필요할 만큼 오래 쓰는 값이 아니다.
const KEY_MEMO_MAX = 4800;
const BUCKET_MS = 15 * 60 * 1000;
const keyMemo = new Map<string, Map<number, string>>();

/** 절대시각 → 그 시간대 날짜 키 'YYYY.MM.DD'(타임라인 키 형식). 시각 유효성은 호출부가 거른다 */
export function zonedDayKey(ts: number, tz?: string | null): string {
  if (!tz || !formatterFor(tz)) {
    const d = new Date(ts); // 기기 로컬 — 예전 그대로(싸서 메모하지 않는다)
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  }
  let memo = keyMemo.get(tz);
  if (!memo) keyMemo.set(tz, (memo = new Map()));
  const b = Math.floor(ts / BUCKET_MS);
  let key = memo.get(b);
  if (key === undefined) {
    if (memo.size >= KEY_MEMO_MAX) memo.clear();
    const p = zonedParts(b * BUCKET_MS, tz);
    key = `${p.y}.${pad2(p.m)}.${pad2(p.d)}`;
    memo.set(b, key);
  }
  return key;
}

/**
 * 오프셋 없는 벽시계(그 시간대 현지 시각, mo는 1~12) → 절대시각 ms. tz가 없거나 못 다루면 기기 로컬(new Date(y, mo-1, …)).
 * 오프셋을 한 번 구해 빼고, 결과 시각의 오프셋이 다르면(서머타임 경계) 그 오프셋으로 한 번 더 고친다.
 * 서머타임으로 없는 시각(봄 02:30, 아바나·산티아고는 자정 00:30)은 두 후보 다 왕복에 실패한다 — 뒤쪽 순간(Math.max)을 쓴다
 * (JS Date·Temporal 'compatible'과 같은 방향). 앞쪽으로 당기면 서반구에서 '그날 00:00'이 전날 23:00이 돼 기간 격자에 전날
 * 1시간이 섞였다(QA 2026-11-07). 두 번 있는 시각(가을 01:30)은 둘 중 하나 — 1시간 안쪽, 날짜는 안 바뀐다.
 * 필드가 넘치면(d+1 = 다음달 1일 등) Date.UTC처럼 넘겨 계산한다.
 */
export function zonedWallClockToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz?: string | null): number {
  if (!tz || !formatterFor(tz)) return new Date(y, mo - 1, d, h, mi, s).getTime();
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetAt = (t: number) => {
    const p = zonedParts(t, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
  };
  const off1 = offsetAt(wall);
  const off2 = offsetAt(wall - off1);
  if (off1 === off2) return wall - off1;
  const c2 = wall - off2;
  // c2가 왕복하면(그 순간의 오프셋이 off2) 그 값, 아니면 없는 시각 — 두 후보 중 뒤쪽
  return offsetAt(c2) === off2 ? c2 : Math.max(wall - off1, c2);
}
