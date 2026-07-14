// 개별 QR 디자인 (프리미엄) — 친구찾기 QR 카드의 내 QR 색상 프리셋.
// ⚠️ QR은 반드시 '밝은 배경 + 어두운 전경(모듈)'이어야 한다. 반전(어두운 배경 + 밝은 무늬)은
// iOS(AVFoundation)·아이폰 기본 카메라가 아예 인식하지 못한다 — 대비만 높아도 소용없음.
// (과거 프리셋이 다크 배경+네온 전경이라 iOS에서 스캔 전멸했던 원인)
// 선택값(id)은 settingsStore.qrDesign에 영속 — 모르는 id는 default 폴백이라 프리셋 교체에 안전.
export interface QrDesign {
  id: string;
  labelKey: string;             // 이름 i18n 키
  fg: string;                   // 전경(모듈) 색 — 어두운 색만. gradient 지정 시 무시됨
  gradient?: [string, string];  // 전경 그라데이션 — 두 색 모두 어두운 색만
  bg: string;                   // 배경색 — 밝은 색만
  light?: boolean;              // 밝은 배경 여부 — 중앙 eOrth 라벨 색 반전용
}

export const QR_DESIGNS: QrDesign[] = [
  { id: 'default', labelKey: 'premium.qrDefault', fg: '#5B1C96', bg: '#FFFFFF', light: true }, // 보라 딥
  { id: 'cyan',    labelKey: 'premium.qrCyan',    fg: '#0E7490', bg: '#FFFFFF', light: true },
  { id: 'mint',    labelKey: 'premium.qrMint',    fg: '#047857', bg: '#FFFFFF', light: true },
  { id: 'aurora',  labelKey: 'premium.qrAurora',  fg: '#5B1C96', gradient: ['#5B1C96', '#0E7490'], bg: '#FFFFFF', light: true },
  { id: 'sunset',  labelKey: 'premium.qrSunset',  fg: '#B91C1C', gradient: ['#B91C1C', '#C2410C'], bg: '#FFF7ED', light: true },
  { id: 'classic', labelKey: 'premium.qrClassic', fg: '#0A0A0F', bg: '#FFFFFF', light: true },
];

/** 디자인 id → 프리셋. 미지정/모르는 id(구 'white' 포함)는 기본(보라) */
export const getQrDesign = (id?: string | null): QrDesign =>
  QR_DESIGNS.find((d) => d.id === id) ?? QR_DESIGNS[0];
