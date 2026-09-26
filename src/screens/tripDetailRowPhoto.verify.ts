// src/screens/tripDetailRowPhoto.verify.ts
// 여행 상세 형식 행 배경 사진 선별 규칙 검증.
// 실행: node node_modules/tsx/dist/cli.mjs src/screens/tripDetailRowPhoto.verify.ts
import { classifyRowPhoto, pickRowPhoto, ROW_PHOTO_WEIGHTS, type RowPhotoCategory } from './tripDetailRowPhoto';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 정해진 순서대로 값을 돌려주는 가짜 rand — 호출마다 다음 값으로 나아가야 부류 추첨과
// 부류 안 장 추첨이 구분된다. 값이 바닥나면 마지막 값을 계속 돌려준다(뒷자리를 일일이 안 채우게).
const rand = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

// 부류마다 사진 1장 — 부류 추첨 결과가 그대로 uri로 드러난다(장 추첨이 결과를 흐리지 않음)
const three: { uri: string; category: RowPhotoCategory }[] = [
  { uri: 'L', category: 'landscape' },
  { uri: 'P', category: 'people' },
  { uri: 'F', category: 'food' },
];

// 1) 세 부류가 다 있을 때의 경계 — 누적 구간은 풍경 [0,0.8) · 사람 [0.8,0.95) · 음식 [0.95,1).
//    0.95가 음식으로 떨어지는지가 핵심이다(0.8+0.15를 소수로 더하면 사람으로 새는 자리).
eq(pickRowPhoto(three, rand(0, 0)), 'L', '경계 rand=0 → 풍경');
eq(pickRowPhoto(three, rand(0.79, 0)), 'L', '경계 rand=0.79 → 풍경(0.8 직전)');
eq(pickRowPhoto(three, rand(0.8, 0)), 'P', '경계 rand=0.8 → 사람(풍경 구간은 열린 끝)');
eq(pickRowPhoto(three, rand(0.949, 0)), 'P', '경계 rand=0.949 → 사람');
eq(pickRowPhoto(three, rand(0.95, 0)), 'F', '경계 rand=0.95 → 음식(부동소수 오차로 사람으로 새면 실패)');

// 2) 음식이 없으면 남은 두 부류로 재정규화 — 풍경 80/95(≈0.8421) · 사람 15/95.
//    0.84는 재정규화가 빠지면(풍경 상한 0.8 고정) 사람으로 떨어져 버리는 자리다.
//    두 케이스를 짝으로 둬야 "경계가 0.8이 아니라 0.8421로 올라갔다"가 드러난다.
const noFood = three.filter((c) => c.category !== 'food');
eq(pickRowPhoto(noFood, rand(0.85, 0)), 'P', '음식 없음: rand=0.85 → 사람(풍경 상한이 80/95로 내려감)');
eq(pickRowPhoto(noFood, rand(0.84, 0)), 'L', '음식 없음: rand=0.84 → 풍경(80/95=0.8421 직전)');

// 3) 풍경만 있으면 rand가 무엇이든 풍경 — 재정규화가 단일 부류에서도 성립하는지
const onlyLand: { uri: string; category: RowPhotoCategory }[] = [
  { uri: 'L1', category: 'landscape' },
  { uri: 'L2', category: 'landscape' },
];
eq(pickRowPhoto(onlyLand, rand(0.99, 0)), 'L1', '풍경만: rand=0.99여도 풍경(첫 장)');
eq(pickRowPhoto(onlyLand, rand(0.99, 0.99)), 'L2', '풍경만: 장 추첨 0.99 → 마지막 장(클램프)');

// 4) 전부 미분류(other) — 네이티브가 없는 기기·분석 실패가 여기로 온다.
//    부류 추첨을 건너뛰므로 rand 첫 호출이 곧 장 추첨이다.
const allOther: { uri: string; category: RowPhotoCategory }[] = [
  { uri: 'O1', category: 'other' },
  { uri: 'O2', category: 'other' },
  { uri: 'O3', category: 'other' },
];
eq(pickRowPhoto(allOther, rand(0.5)), 'O2', '전부 미분류: rand=0.5 → 가운데 장');
eq(pickRowPhoto(allOther, rand(0)), 'O1', '전부 미분류: rand=0 → 첫 장');

// 5) 미분류가 섞여 있어도 세 부류가 하나라도 있으면 미분류는 후보에서 빠진다
eq(pickRowPhoto([...allOther, { uri: 'L', category: 'landscape' }], rand(0.99, 0)), 'L', '미분류+풍경: 미분류는 추첨 대상이 아님');

// 6) 경계 — 빈 배열
eq(pickRowPhoto([], rand(0.5)), null, '후보 0장 → null');

// 7) 원본 비변형 — 호출부가 매 렌더 만드는 배열을 공유하므로 제자리 정렬·변형이 있으면 안 된다
const orig = [...three];
pickRowPhoto(orig, rand(0.5, 0.5));
eq(orig.map((c) => c.uri), ['L', 'P', 'F'], '입력 배열을 건드리지 않는다');

// ── classifyRowPhoto 우선순위 ──
// 8) 겹치는 신호: 식탁 사진은 isFood + hasFace가 함께 켜진다 → 음식이 이긴다
eq(classifyRowPhoto({ isFood: true, hasFace: true }), 'food', '겹침: isFood + hasFace → food');
// 9) isUtility는 무엇과 겹쳐도 먼저 잘린다(영수증 위의 얼굴·메뉴판 사진)
eq(classifyRowPhoto({ isUtility: true, isFood: true, hasFace: true, isLandscape: true }), null, 'isUtility는 전부 이기고 제외(null)');
// 10) 구 네이티브 빌드엔 faceCount가 없다 — hasFace만으로 사람이 되어야 한다
eq(classifyRowPhoto({ hasFace: true }), 'people', 'hasFace만 → people(faceCount 없는 구 빌드)');
// 11) 반대로 hasFace가 false인데 faceCount만 있는 경우도 사람
eq(classifyRowPhoto({ hasFace: false, faceCount: 2 }), 'people', 'faceCount>0 → people');
eq(classifyRowPhoto({ faceCount: 0, isLandscape: true }), 'landscape', 'faceCount=0은 사람이 아님 → landscape');
// 12) 랜드마크도 풍경으로 묶는다(사용자 규칙은 세 부류뿐)
eq(classifyRowPhoto({ isLandmark: true }), 'landscape', 'isLandmark → landscape');
// 13) 모르는 값 — 신호가 전부 비면 미분류. 기본값을 풍경으로 두면 분석 실패가 풍경으로 위장된다
eq(classifyRowPhoto({}), 'other', '신호 없음 → other(풍경으로 위장하지 않는다)');
eq(classifyRowPhoto({ isFood: false, hasFace: false, isLandscape: false, isLandmark: false, isUtility: false }), 'other', '전부 false → other');

// 14) 가중치 상수 자체 — 화면과 이 검증이 같은 값을 보는지(합 1.0)
eq(ROW_PHOTO_WEIGHTS.landscape + ROW_PHOTO_WEIGHTS.people + ROW_PHOTO_WEIGHTS.food > 0.999, true, '가중치 합 ≈ 1.0');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
