// src/utils/dateRangePhotoPick.verify.ts
// 기간 사진 격자의 순수 판정 검증. 기대값은 같은 로컬 타임존으로 만든 Date에서 뽑으므로
// 실행 기기의 타임존과 무관하게 성립한다(UTC 자정으로 밀리는 버그를 잡는 것이 목적).
import {
  dayRangeMs,
  dayKey,
  toggleWithin,
  selectAllWithin,
  deselectAllWithin,
  pickablePhotos,
} from './dateRangePhotoPick';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const at = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0, ms = 0) =>
  new Date(y, m - 1, d, hh, mm, ss, ms).getTime();

// ── dayRangeMs ──────────────────────────────────────────────
// 정상: 시작일은 그날 자정, 종료일은 그날 마지막 ms까지
eq(dayRangeMs(new Date(2026, 8, 13, 14, 30), new Date(2026, 8, 20, 9, 0)),
   { startMs: at(2026, 9, 13), endMs: at(2026, 9, 20, 23, 59, 59, 999) },
   '기간: 시작 00:00:00.000 ~ 종료 23:59:59.999');

// 하루 어긋남 회귀 — 같은 날 하루짜리 기간에서 그날 사진이 통째로 빠지면 안 된다
eq(dayRangeMs(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 1, 0, 1)),
   { startMs: at(2026, 1, 1), endMs: at(2026, 1, 1, 23, 59, 59, 999) },
   '하루짜리 기간도 그날 전체를 덮는다');

// 뒤집힌 입력 — 저장된 글에 종료<시작인 값이 실제로 있다
eq(dayRangeMs(new Date(2026, 8, 20), new Date(2026, 8, 13)),
   { startMs: at(2026, 9, 13), endMs: at(2026, 9, 20, 23, 59, 59, 999) },
   '시작·종료가 뒤집혀 와도 바로잡는다');

// 널 계열 — 셋을 따로 본다. NaN이 새면 조회 조건이 사라져 전체 사진첩이 딸려 온다
eq(dayRangeMs(null, new Date(2026, 8, 13)), null, '시작이 null이면 null');
eq(dayRangeMs(new Date(2026, 8, 13), undefined), null, '종료가 undefined면 null');
eq(dayRangeMs(new Date('nope'), new Date(2026, 8, 13)), null, 'Invalid Date면 null');
eq(dayRangeMs('2026-09-13' as unknown as Date, new Date(2026, 8, 13)), null, 'Date가 아닌 문자열이면 null');

// 월말/연말 경계 — setHours만 만지므로 날짜가 넘어가면 안 된다
eq(dayRangeMs(new Date(2026, 11, 31, 12), new Date(2026, 11, 31, 12)),
   { startMs: at(2026, 12, 31), endMs: at(2026, 12, 31, 23, 59, 59, 999) },
   '연말 하루도 날짜가 넘어가지 않는다');

// ── dayKey ──────────────────────────────────────────────────
eq(dayKey(at(2026, 9, 13, 8, 0)), '2026.09.13', '날짜 키: 한 자리 월·일은 0으로 채운다');
eq(dayKey(at(2026, 12, 5, 23, 59)), '2026.12.05', '날짜 키: 23시대도 그날로 남는다(로컬 기준)');
eq(dayKey(undefined), null, '날짜 키: undefined → null');
eq(dayKey(null), null, '날짜 키: null → null');
eq(dayKey(0), null, '날짜 키: 0(시각 없음) → null');
eq(dayKey(NaN), null, '날짜 키: NaN → null');

// ── 앨범 시간대(tz) — 사진첩 날짜별 사진 추가가 날짜 줄과 같은 날을 고르게 ──
// 입력 Date는 '그날 로컬 자정'(dayKeyToDate·parseDotDate가 만드는 값) — 로컬 연·월·일만 읽으므로 기기 시간대와 무관
// 마드리드 11월 UTC+1: 11/06 00:00 = 11/05 23:00Z, 11/08 00:00 = 11/07 23:00Z
eq(dayRangeMs(new Date(2026, 10, 6), new Date(2026, 10, 7), 'Europe/Madrid'),
   { startMs: Date.UTC(2026, 10, 5, 23), endMs: Date.UTC(2026, 10, 7, 23) - 1 },
   'tz 기간: 마드리드 11/06 00:00 ~ 11/07 23:59:59.999(절대시각)');
eq(dayRangeMs(new Date(2026, 10, 7, 15), new Date(2026, 10, 6, 9), 'Europe/Madrid'),
   { startMs: Date.UTC(2026, 10, 5, 23), endMs: Date.UTC(2026, 10, 7, 23) - 1 },
   'tz 기간: 뒤집힌 입력·시각이 붙은 Date도 날짜만 본다');
// 서머타임 시작일(3/29)은 23시간 — 다음날 자정 - 1ms라 그날 전체를 덮는다
eq(dayRangeMs(new Date(2026, 2, 29), new Date(2026, 2, 29), 'Europe/Madrid'),
   { startMs: Date.UTC(2026, 2, 28, 23), endMs: Date.UTC(2026, 2, 29, 22) - 1 },
   'tz 기간: 서머타임 시작일 하루(23시간)');
// 월말 — 다음날이 다음달 1일로 넘어간다
eq(dayRangeMs(new Date(2026, 0, 31), new Date(2026, 0, 31), 'Europe/Madrid'),
   { startMs: Date.UTC(2026, 0, 30, 23), endMs: Date.UTC(2026, 0, 31, 23) - 1 },
   'tz 기간: 월말 하루');
// 자정에 서머타임이 시작되는 서반구(아바나 2026-03-08, 산티아고 2026-09-06: 00:00 → 01:00) — 그날은 01:00부터, 전날은 24:00 직전까지.
// 예전엔 그날 시작이 전날 23:00으로 당겨져 전날 1시간이 섞이고 전날 마지막 1시간이 빠졌다(QA 낮음 1)
eq(dayRangeMs(new Date(2026, 2, 8), new Date(2026, 2, 8), 'America/Havana'),
   { startMs: Date.UTC(2026, 2, 8, 5), endMs: Date.UTC(2026, 2, 9, 4) - 1 },
   'tz 기간: 아바나 서머타임 시작일(3/8)은 01:00 CDT부터');
eq(dayRangeMs(new Date(2026, 2, 7), new Date(2026, 2, 7), 'America/Havana'),
   { startMs: Date.UTC(2026, 2, 7, 5), endMs: Date.UTC(2026, 2, 8, 5) - 1 },
   'tz 기간: 아바나 그 전날(3/7)은 23:59:59.999 CST까지');
eq(dayRangeMs(new Date(2026, 8, 6), new Date(2026, 8, 6), 'America/Santiago'),
   { startMs: Date.UTC(2026, 8, 6, 4), endMs: Date.UTC(2026, 8, 7, 3) - 1 },
   'tz 기간: 산티아고 서머타임 시작일(9/6)은 01:00 −03부터');
eq(dayRangeMs(new Date(2026, 8, 5), new Date(2026, 8, 5), 'America/Santiago'),
   { startMs: Date.UTC(2026, 8, 5, 4), endMs: Date.UTC(2026, 8, 6, 4) - 1 },
   'tz 기간: 산티아고 그 전날(9/5)은 23:59:59.999 −04까지');
eq(dayRangeMs(new Date(2026, 8, 13), new Date(2026, 8, 20), 'Not/AZone'), dayRangeMs(new Date(2026, 8, 13), new Date(2026, 8, 20)), 'tz 기간: 잘못된 id → tz 없음과 같다');
eq(dayRangeMs(null, new Date(2026, 8, 13), 'Europe/Madrid'), null, 'tz 기간: 시작이 null이면 tz가 있어도 null');
// 날짜 키 — 마드리드 22:00(21:00Z)은 마드리드로는 11/06, 서울로는 11/07
eq(dayKey(Date.UTC(2026, 10, 6, 21), 'Europe/Madrid'), '2026.11.06', 'tz 날짜 키: 마드리드 22:00 → 그날');
eq(dayKey(Date.UTC(2026, 10, 6, 21), 'Asia/Seoul'), '2026.11.07', 'tz 날짜 키: 같은 순간 서울 기준 → 다음날');
eq(dayKey(0, 'Europe/Madrid'), null, 'tz 날짜 키: 시각 0은 tz가 있어도 null');
eq(dayKey(at(2026, 9, 13, 8), 'Not/AZone'), '2026.09.13', 'tz 날짜 키: 잘못된 id → 기기 로컬');
// 기간 경계 끝(23:59:59.999)은 그 tz로 종료일 — 시트의 기간 라벨이 이 키를 쓴다
{
  const r = dayRangeMs(new Date(2026, 10, 6), new Date(2026, 10, 7), 'Europe/Madrid')!;
  eq([dayKey(r.startMs, 'Europe/Madrid'), dayKey(r.endMs, 'Europe/Madrid')], ['2026.11.06', '2026.11.07'], 'tz 기간 경계 → 같은 tz 날짜 키가 시작·종료일');
}

// ── toggleWithin ────────────────────────────────────────────
eq(toggleWithin([], 'a', 3), { next: ['a'], atLimit: false }, '토글: 빈 목록에 추가');
eq(toggleWithin(['a', 'b'], 'a', 3), { next: ['b'], atLimit: false }, '토글: 이미 고른 것은 해제');
eq(toggleWithin(['a', 'b'], 'c', 2), { next: ['a', 'b'], atLimit: true }, '토글: 상한이면 안 담고 atLimit');
eq(toggleWithin(['a', 'b'], 'a', 2), { next: ['b'], atLimit: false }, '토글: 상한이어도 해제는 된다');
eq(toggleWithin([], 'a', 0), { next: [], atLimit: true }, '토글: 남은 자리 0이면 아무것도 못 담는다');

// ── selectAllWithin ─────────────────────────────────────────
eq(selectAllWithin([], ['a', 'b', 'c'], 5),
   { next: ['a', 'b', 'c'], truncated: false }, '전체 선택: 상한 안이면 전부');
eq(selectAllWithin([], ['a', 'b', 'c'], 2),
   { next: ['a', 'b'], truncated: true }, '전체 선택: 상한에서 자르고 잘렸다고 알린다');
eq(selectAllWithin(['b'], ['a', 'b', 'c'], 5),
   { next: ['b', 'a', 'c'], truncated: false }, '전체 선택: 이미 고른 것의 순서는 유지');
eq(selectAllWithin([], ['a', 'a', 'b'], 5),
   { next: ['a', 'b'], truncated: false }, '전체 선택: 같은 uri가 두 번 와도 한 번만');
eq(selectAllWithin(['a'], ['a'], 1),
   { next: ['a'], truncated: false }, '전체 선택: 상한이 찼어도 이미 고른 것뿐이면 잘린 게 아니다');
eq(selectAllWithin([], [], 5), { next: [], truncated: false }, '전체 선택: 후보 0장');

// ── deselectAllWithin ───────────────────────────────────────
eq(deselectAllWithin(['a', 'b', 'c'], ['a', 'c']), ['b'], '전체 해제: 보이는 것만 빼고 나머지는 남긴다');
eq(deselectAllWithin([], ['a']), [], '전체 해제: 고른 게 없으면 그대로');

// ── pickablePhotos ──────────────────────────────────────────
// 수정 모드에서 '담김' 표시가 전무하던 결함의 회귀 — 저장본 경로는 사진첩 uri와 절대 안 겹치므로
// assetId 기준 제외가 없으면 이미 기록에 있는 사진을 그대로 또 담게 된다.
const P = [
  { uri: 'file:///a.jpg', id: 'A' },
  { uri: 'file:///b.jpg', id: 'B' },
  { uri: 'file:///c.jpg' },
];
eq(pickablePhotos(P), P, '제외 목록이 비면 원본 그대로');
eq(pickablePhotos(P, ['file:///b.jpg']), [P[0], P[2]], 'uri로 제외한다(시트가 담은 사진)');
eq(pickablePhotos(P, [], ['A']), [P[1], P[2]], 'assetId로 제외한다(수정 모드 기록의 mediaAssetIds)');
eq(pickablePhotos(P, ['file:///c.jpg'], ['B']), [P[0]], '두 기준을 함께 적용한다');
eq(pickablePhotos(P, [], ['']), P, 'id 없는 사진은 빈 문자열 id와 짝지어지지 않는다');
eq(pickablePhotos(P, ['file:///x.jpg'], ['Z']), P, '안 맞는 제외값은 아무것도 안 뺀다');
eq(pickablePhotos([], ['file:///a.jpg'], ['A']), [], '사진 0장');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
