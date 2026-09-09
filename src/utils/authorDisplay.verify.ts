// src/utils/authorDisplay.verify.ts
import { mergeAuthorDisplay } from './authorDisplay';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const SNAP = { name: '옛이름', emoji: '🌵', handle: 'old_handle', photo: 'https://cdn/old.jpg', font: 'serif' };

// ── 정상 경로: 임베드가 모든 값을 갖고 있으면 전부 서버 값 ──
eq(
  mergeAuthorDisplay({ handle: 'yun', emoji: '🛩️', profile_photo: 'https://cdn/new.jpg', handle_font: 'mono' }, SNAP),
  { name: 'yun', emoji: '🛩️', handle: 'yun', photo: 'https://cdn/new.jpg', font: 'mono' },
  '임베드 있음: 이름·이모지·사진·폰트 모두 서버 값'
);

// ── 이 함수를 만든 이유 ①: 프로필 사진 삭제가 옛 글에 반영되지 않던 결함 ──
eq(
  mergeAuthorDisplay({ handle: 'yun', emoji: '🛩️', profile_photo: null, handle_font: 'mono' }, SNAP),
  { name: 'yun', emoji: '🛩️', handle: 'yun', photo: undefined, font: 'mono' },
  '임베드 있음 + 사진 null → 사진 없음(스냅샷으로 되살리지 않는다)'
);

// ── 이 함수를 만든 이유 ②: 프리미엄 해지(handle_font null)가 옛 글에 반영되지 않던 결함 ──
eq(
  mergeAuthorDisplay({ handle: 'yun', emoji: '🛩️', profile_photo: 'https://cdn/new.jpg', handle_font: null }, SNAP),
  { name: 'yun', emoji: '🛩️', handle: 'yun', photo: 'https://cdn/new.jpg', font: undefined },
  '폰트 해지: handle_font null → 기본 폰트(스냅샷 serif 부활 금지)'
);

// ── 임베드 없음(차단·탈퇴로 public_profiles가 행을 안 줌) → 스냅샷이 유일한 정보 ──
eq(
  mergeAuthorDisplay(null, SNAP),
  { name: '옛이름', emoji: '🌵', handle: 'old_handle', photo: 'https://cdn/old.jpg', font: 'serif' },
  '임베드 null: 스냅샷 전체 사용(서버가 "없다"고 말한 게 아니라 아무 말도 못 한 경우)'
);
eq(
  mergeAuthorDisplay(undefined, SNAP).photo,
  'https://cdn/old.jpg',
  '임베드 undefined(키 자체 없음)도 null과 동일 취급'
);

// ── 널 계열 구분: '' / null / undefined 를 뭉뚱그리지 않는지 ──
eq(
  mergeAuthorDisplay({ handle: 'yun', emoji: '🛩️', profile_photo: '', handle_font: '' }, SNAP),
  { name: 'yun', emoji: '🛩️', handle: 'yun', photo: undefined, font: undefined },
  "빈 문자열도 '값 없음' — 빈 아바타·빈 폰트가 뜨지 않게"
);
eq(
  mergeAuthorDisplay({ handle: 'yun' }, SNAP),
  { name: 'yun', emoji: '🌵', handle: 'yun', photo: undefined, font: undefined },
  '임베드에 컬럼 자체가 없어도(=undefined) 임베드 있음으로 보고 사진·폰트는 비운다'
);

// ── 경계: 스냅샷조차 없는 글(로컬 생성분 등) ──
eq(
  mergeAuthorDisplay(null, undefined),
  { name: '여행자', emoji: '🧳', handle: '', photo: undefined, font: undefined },
  '임베드·스냅샷 둘 다 없음 → 기본 표시값'
);

// ── name/handle 은 폴백 유지(이름 없는 카드는 글을 못 읽게 만든다) ──
eq(
  mergeAuthorDisplay({ handle: null, emoji: null }, SNAP),
  { name: '옛이름', emoji: '🌵', handle: 'old_handle', photo: undefined, font: undefined },
  'handle null: 이름·이모지는 스냅샷 폴백, 사진·폰트는 비움(규칙이 다르다)'
);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
