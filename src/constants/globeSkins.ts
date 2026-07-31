// 지구본 스킨 — 네온(aurora, 색 활성화) 폼 전용 본체 팔레트.
// classic(사진) 폼에는 적용하지 않는다 (MainScreen에서 aurora일 때만 themeOverride 전달).
// 팔레트는 디자인 시안(Ellipse 2970 SVG 2종)의 값을 그대로 사용:
// 베이스 원 색 + (상→하) 선형 그라데이션 오버레이(불투명도). 공통 음영 레이어는 셰이더에 내장.
import type { NeonSkinTheme } from '../components/GlobeView';

export interface GlobeSkin {
  id: string;
  labelKey: string;          // 스킨 이름 i18n 키
  premium: boolean;          // 유료 스킨 여부 (현재 2종은 무료)
  preview: [string, string]; // 설정 미리보기 그라데이션 색
  theme?: NeonSkinTheme;     // 없으면 셰이더 기본(보라 발광 행성) 사용
  /**
   * 유리 구슬(classic·사진 폼) 배경 이미지의 색상 회전(deg).
   *
   * 배경은 래스터라 네온처럼 팔레트를 갈아 끼울 수 없다. 대신 CSS hue-rotate로 돌린다 —
   * 원본이 '보라 성운 + 흰 별 + 검정'이라 채도 0인 별·배경은 그대로 두고 성운만 돌아간다.
   * 기준은 원본 성운의 보라(약 275°)에서 각 스킨 본체색까지의 차이다.
   */
  glassBgHue: number;
}

export const GLOBE_SKINS: GlobeSkin[] = [
  // 기본 — 보라 발광 행성(셰이더 내장 기본 팔레트: #FF14E4 + #1D0930→#7519AE @70% 3겹)
  { id: 'aurora', labelKey: 'premium.skinAurora', premium: false, preview: ['#1D0930', '#C982FF'], glassBgHue: 0 },
  // 무료 스킨 1 — Ellipse 2970.svg: 시안 #00D7F3 + #1D0930→#7519AE @60%
  {
    id: 'cyan', labelKey: 'premium.skinCyan', premium: false, preview: ['#7519AE', '#00D7F3'],
    theme: { base: '#00D7F3', gradFrom: '#1D0930', gradTo: '#7519AE', gradAlpha: 0.6 },
    glassBgHue: -85, // 보라(275°) → 시안(190°)
  },
  // 무료 스킨 2 — Ellipse 2970 (1).svg: 민트 #86FFBC + #1D0930→#00D8F3 @50%
  {
    id: 'mint', labelKey: 'premium.skinMint', premium: false, preview: ['#00D8F3', '#86FFBC'],
    theme: { base: '#86FFBC', gradFrom: '#1D0930', gradTo: '#00D8F3', gradAlpha: 0.5 },
    glassBgHue: -130, // 보라(275°) → 민트(145°)
  },
];

/** 스킨 id → 유리 구슬 배경 색상 회전(deg). 미지정이면 0(원본 보라) */
export const getGlassBgHue = (id?: string | null): number =>
  GLOBE_SKINS.find((s) => s.id === id)?.glassBgHue ?? 0;

/** 스킨 id → 네온 셰이더 팔레트. 기본(aurora)/미지정이면 undefined → 셰이더 기본값 사용 */
export const getGlobeSkinTheme = (id?: string | null): NeonSkinTheme | undefined =>
  GLOBE_SKINS.find((s) => s.id === id)?.theme;
