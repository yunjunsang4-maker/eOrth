// src/utils/photoPlace.verify.ts — 사진첩 하루 보기 장소 로직
import { localAssetIdOf, formatPlace, pickAssetByTime, TIME_TOL_MS } from './photoPlace';

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
eq(formatPlace({ city: '오사카', district: null, subregion: '주오구' }), '오사카 주오구', '동네 없음 → subregion으로');
eq(formatPlace({ city: '도쿄', district: '도쿄' }), '도쿄', '같은 이름은 한 번만');
eq(formatPlace({ city: '  교토 ', district: ' ' }), '교토', '앞뒤 공백 제거·공백뿐인 값은 빈 값');
eq(formatPlace({ name: 'Eiffel Tower' }), 'Eiffel Tower', '행정명이 다 비면 name');
eq(formatPlace({}), null, '전부 비면 null — 장소 줄을 그리지 않음');
eq(formatPlace(null), null, 'null 입력 → null');
eq(formatPlace(undefined), null, 'undefined 입력 → null');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
