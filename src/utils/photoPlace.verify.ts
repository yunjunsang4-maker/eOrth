// src/utils/photoPlace.verify.ts — 사진첩 하루 보기 장소 로직
import { localAssetIdOf, formatPlace } from './photoPlace';

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
