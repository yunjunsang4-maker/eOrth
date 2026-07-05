// 개별 QR 디자인 (프리미엄) — 친구찾기 QR 카드의 내 QR 색상 프리셋.
// QR은 대비가 낮으면 스캔이 안 되므로 자유 색상 대신 검증된 프리셋만 제공한다.
// 선택값(id)은 settingsStore.qrDesign에 영속 — 기기 내 표시용이라 서버 동기화 불필요.
export interface QrDesign {
  id: string;
  labelKey: string;             // 이름 i18n 키
  fg: string;                   // 전경(모듈) 색 — gradient 지정 시 무시됨
  gradient?: [string, string];  // 전경 그라데이션 (react-native-qrcode-svg linearGradient)
  bg: string;                   // 배경색
  light?: boolean;              // 밝은 배경 여부 — 중앙 eOrth 라벨 색 반전용
}

export const QR_DESIGNS: QrDesign[] = [
  { id: 'default', labelKey: 'premium.qrDefault', fg: '#BF85FC', bg: '#0A0A0F' },
  { id: 'cyan',    labelKey: 'premium.qrCyan',    fg: '#00D7F3', bg: '#0A0A0F' },
  { id: 'mint',    labelKey: 'premium.qrMint',    fg: '#86FFBC', bg: '#0A0A0F' },
  { id: 'white',   labelKey: 'premium.qrWhite',   fg: '#FFFFFF', bg: '#0A0A0F' },
  { id: 'aurora',  labelKey: 'premium.qrAurora',  fg: '#BF85FC', gradient: ['#BF85FC', '#00D7F3'], bg: '#0A0A0F' },
  { id: 'sunset',  labelKey: 'premium.qrSunset',  fg: '#FF5F6D', gradient: ['#FF5F6D', '#FFC371'], bg: '#0A0A0F' },
  { id: 'classic', labelKey: 'premium.qrClassic', fg: '#0A0A0F', bg: '#FFFFFF', light: true },
];

/** 디자인 id → 프리셋. 미지정/모르는 id는 기본(보라) */
export const getQrDesign = (id?: string | null): QrDesign =>
  QR_DESIGNS.find((d) => d.id === id) ?? QR_DESIGNS[0];
