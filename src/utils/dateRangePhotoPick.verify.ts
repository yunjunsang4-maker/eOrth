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
