// src/utils/photoPlace.verify.ts — 사진첩 하루 보기 장소 로직
import { localAssetIdOf, formatPlace, formatClock, pickAssetByTime, TIME_TOL_MS } from './photoPlace';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const rec = {
  mediaAssetIds: { 'file:///a.jpg': 'A1', 'file:///b.jpg': 'B1', 'https://x/c.jpg': 'C-OTHER' },
  uploadedMediaUrls: { 'file:///b.jpg': 'https://x/b.jpg', 'https://x/c0.jpg': 'https://x/c.jpg' },
};

// ── localAssetIdOf ──
eq(localAssetIdOf(rec, 'file:///a.jpg'), 'A1', '로컬 경로 → 그 키의 assetId');
eq(localAssetIdOf(rec, 'https://x/b.jpg'), 'B1', '업로드 URL → 업로드 캐시를 거꾸로 따라 로컬 키의 assetId');
// 원격 키에 직접 붙은 assetId는 다른 기기 번호일 수 있다(안드로이드 일련번호) — 쓰면 엉뚱한 사진의 위치가 나온다
eq(localAssetIdOf(rec, 'https://x/c.jpg'), undefined, '원격 키에 바로 붙은 assetId는 쓰지 않음');
// 업로드 캐시의 로컬 쪽이 원격인 쌍(다른 기기 기록 재발행)은 작성 기기 증거가 아니다
eq(localAssetIdOf({ mediaAssetIds: { 'https://x/c0.jpg': 'Z' }, uploadedMediaUrls: rec.uploadedMediaUrls }, 'https://x/c.jpg'), undefined, '로컬 쪽이 원격인 캐시 쌍은 무시');
eq(localAssetIdOf(rec, 'file:///none.jpg'), undefined, '모르는 로컬 경로 → undefined');
eq(localAssetIdOf({}, 'file:///a.jpg'), undefined, 'mediaAssetIds 없음 → undefined');
eq(localAssetIdOf(rec, ''), undefined, '빈 uri → undefined');

// ── pickAssetByTime ── (iOS 원격 URL 사진: 촬영시각으로 기기 사진첩 자산 찾기)
const T = 1_700_000_000_000;
eq(pickAssetByTime([{ id: 'X', creationTime: T }], T, TIME_TOL_MS), 'X', '정확 일치 → 그 자산');
eq(pickAssetByTime([{ id: 'X', creationTime: T + 1500 }], T, 1500), 'X', '허용오차 경계(+1500) 포함');
eq(pickAssetByTime([{ id: 'X', creationTime: T - 1500 }], T, 1500), 'X', '허용오차 경계(-1500) 포함');
eq(pickAssetByTime([{ id: 'X', creationTime: T + 1501 }], T, 1500), undefined, '허용오차 밖(+1501) → 없음');
// 연사처럼 근처에 여러 장 — 가장 가까운 것
eq(pickAssetByTime([{ id: 'A', creationTime: T + 900 }, { id: 'B', creationTime: T - 200 }, { id: 'C', creationTime: T + 400 }], T, 1500), 'B', '여러 후보 → 가장 가까운 것');
eq(pickAssetByTime([{ id: 'A', creationTime: T + 300 }, { id: 'B', creationTime: T - 300 }], T, 1500), 'A', '동률 → 앞의 것');
eq(pickAssetByTime([], T, 1500), undefined, '빈 목록 → 없음');
// creationTime을 못 읽은 자산(0/NaN)은 가까워 보여도 근거가 아니다
eq(pickAssetByTime([{ id: 'Z', creationTime: 0 }, { id: 'N', creationTime: NaN }], T, 1500), undefined, 'creationTime 0/NaN 무시');
eq(pickAssetByTime([{ id: 'N', creationTime: NaN }, { id: 'X', creationTime: T + 10 }], T, 1500), 'X', 'NaN 건너뛰고 유효한 것 선택');
eq(pickAssetByTime([{ id: 'X', creationTime: 500 }], 0, 1500), undefined, 'ts 0 → 없음');
eq(pickAssetByTime([{ id: 'X', creationTime: T }], NaN, 1500), undefined, 'ts NaN → 없음');

// ── formatPlace ──
eq(formatPlace({ city: '도쿄', district: '시부야' }), '도쿄 시부야', '도시 + 동네');
eq(formatPlace({ city: null, region: '서울특별시', district: '종로구' }), '서울특별시 종로구', '도시 없음 → 광역으로');
// 규칙 변경: subregion은 도시가 없을 때만 — 미국 county처럼 시보다 넓은 값이 뒤에 붙지 않게
eq(formatPlace({ city: '오사카', district: null, subregion: '주오구' }), '오사카', '도시 있으면 subregion 안 씀(규칙 변경: county가 시보다 넓어 거꾸로 됨)');
eq(formatPlace({ region: 'Hokkaido', subregion: 'Kamikawa', name: 'Hokkaido' }), 'Hokkaido Kamikawa', '도시 없음 → 광역 + subregion, 광역과 같은 name은 명소 아님');
// ── formatPlace 구체 조각(명소/도로) ──
eq(formatPlace({ city: 'Morristown', subregion: 'Morris County', region: 'NJ', name: 'Morristown Municipal Airport', street: 'Airport Rd', streetNumber: '8' }),
  'Morristown · Morristown Municipal Airport', '미국 명소: county 빼고 도시 · 명소 name');
// name이 번지+도로면 주소 — 도로명만, 번지는 너무 정확한 위치라 뺀다
eq(formatPlace({ city: 'Morristown', subregion: 'Morris County', region: 'NJ', name: '10 South St', street: 'South St', streetNumber: '10' }),
  'Morristown · South St', '미국 주소: name 대신 도로명(번지 뺌)');
eq(formatPlace({ city: '서울특별시', district: '성수동1가', name: '서울숲', street: '뚝섬로', streetNumber: '273' }),
  '서울특별시 성수동1가 · 서울숲', '한국 명소: 도시 동네 · 명소');
eq(formatPlace({ city: '서울특별시', district: '성수동1가', name: '성수이로 20', street: '성수이로', streetNumber: '20' }),
  '서울특별시 성수동1가 · 성수이로', '한국 주소: 도로명만(번지 뺌)');
eq(formatPlace({ city: 'Tokyo', name: 'Tokyo' }), 'Tokyo', 'name이 도시와 같으면 명소 아님 → 도시만');
eq(formatPlace({ name: 'Somewhere' }), 'Somewhere', 'name만 있음 → name');
eq(formatPlace({ city: '도쿄', district: '도쿄' }), '도쿄', '같은 이름은 한 번만');
eq(formatPlace({ city: '  교토 ', district: ' ' }), '교토', '앞뒤 공백 제거·공백뿐인 값은 빈 값');
eq(formatPlace({ name: 'Eiffel Tower' }), 'Eiffel Tower', '행정명이 다 비면 name');
eq(formatPlace({}), null, '전부 비면 null — 장소 줄을 그리지 않음');
eq(formatPlace(null), null, 'null 입력 → null');
eq(formatPlace(undefined), null, 'undefined 입력 → null');

// ── formatClock ── (순간 시각을 사진 찍은 곳의 현지 시간으로 — Node Intl 기준)
const US = 1756477376000; // 2025-08-29T14:22:56Z — 미국 동부 오전 10:22(EDT)에 찍은 사진
const local = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
eq(formatClock(US, 'America/New_York'), '10:22', '뉴욕 시간대 → 현지 10:22(기기 한국 시간 23:22 아님)');
eq(formatClock(US, 'Asia/Seoul'), '23:22', '서울 시간대 → 23:22');
// 자정 직후가 '24:05'로 나오는 엔진이 있다 — 00으로 정규화되는지
eq(formatClock(Date.UTC(2025, 0, 1, 0, 5), 'UTC'), '00:05', 'UTC 자정 직후 → 00:05(24:05 아님)');
// 잘못된 id는 Intl이 RangeError — 화면이 죽지 않고 기기 시간으로
eq(formatClock(US, 'Not/AZone'), local(US), '잘못된 시간대 → 예외 없이 기기 로컬 폴백');
eq(formatClock(US, null), local(US), 'null(안드로이드) → 기기 로컬');
eq(formatClock(US, undefined), local(US), 'undefined(장소 아직 없음) → 기기 로컬');
eq(formatClock(US, ''), local(US), '빈 문자열 → 기기 로컬');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
