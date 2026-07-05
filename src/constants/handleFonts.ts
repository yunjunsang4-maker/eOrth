// 아이디(핸들) 표시 폰트 — 프리미엄 기능.
// 폰트 자산은 App.tsx의 useFonts로 이미 로드되는 것만 사용한다(추가 설치 불필요).
// 선택값(id)은 profiles.handle_font로 서버에 저장돼 타인 화면(프로필·피드)에서도 렌더된다.
export interface HandleFont {
  id: string;
  labelKey: string;        // 폰트 이름 i18n 키
  fontFamily?: string;     // 없으면 시스템 기본
}

export const HANDLE_FONTS: HandleFont[] = [
  { id: 'default', labelKey: 'premium.fontDefault' },
  { id: 'pen', labelKey: 'premium.fontPen', fontFamily: 'NanumPenScript_400Regular' },
  { id: 'brush', labelKey: 'premium.fontBrush', fontFamily: 'NanumBrushScript_400Regular' },
  { id: 'serif', labelKey: 'premium.fontSerif', fontFamily: 'NanumMyeongjo_400Regular' },
  { id: 'impact', labelKey: 'premium.fontImpact', fontFamily: 'Gilroy-Black' },
  { id: 'maru', labelKey: 'premium.fontMaru', fontFamily: 'MaruBuri' },
  // 영어 전용 (아이디는 영문 한정이라 한글 글리프 불필요)
  { id: 'pacifico', labelKey: 'premium.fontPacifico', fontFamily: 'Pacifico' },
  { id: 'caveat', labelKey: 'premium.fontCaveat', fontFamily: 'Caveat' },
  { id: 'bebas', labelKey: 'premium.fontBebas', fontFamily: 'BebasNeue' },
  { id: 'courier', labelKey: 'premium.fontCourier', fontFamily: 'CourierPrime' },
  { id: 'righteous', labelKey: 'premium.fontRighteous', fontFamily: 'Righteous' },
  { id: 'amatic', labelKey: 'premium.fontAmatic', fontFamily: 'AmaticSC' },
  { id: 'marker', labelKey: 'premium.fontMarker', fontFamily: 'PermanentMarker' },
  { id: 'playfair', labelKey: 'premium.fontPlayfair', fontFamily: 'PlayfairDisplay' },
  { id: 'orbitron', labelKey: 'premium.fontOrbitron', fontFamily: 'Orbitron' },
  { id: 'yuyu', labelKey: 'premium.fontYuyu', fontFamily: 'Yuyu' },
];

/** 폰트 id → Text에 얹을 스타일 (기본/미지정이면 null) */
export const handleFontStyle = (id?: string | null): { fontFamily: string } | null => {
  const fam = HANDLE_FONTS.find((f) => f.id === id)?.fontFamily;
  return fam ? { fontFamily: fam } : null;
};
