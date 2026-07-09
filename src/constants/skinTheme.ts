import { useMemo } from 'react';
import { useSettings } from '../store/settingsStore';

// 지구본 스킨 → 앱 강조색 테마 토대.
// 앱 전역 요소를 스킨 색으로 통일하기 위한 단계적 마이그레이션의 기준점.
// 하드코딩된 보라색을 이 훅/헬퍼 값으로 하나씩 옮겨간다.
export interface SkinAccent {
  accent: string;                 // 밝은 강조색 (아이콘·텍스트·활성 표시)
  accentDeep: string;             // 진한 강조 (버튼 배경 등)
  pill: string;                   // 30% 틴트 (탭 알약 등) — 스킨별 지정값
  rgb: [number, number, number];  // 밝은 강조색 RGB (틴트 파생용)
  tint: (alpha: number) => string; // 밝은 강조색의 알파 틴트
}

// aurora는 기존 앱 보라값을 그대로 매핑(현행 유지), cyan/mint는 지정 색.
const SKIN_THEMES: Record<string, { accent: string; accentDeep: string; rgb: [number, number, number]; pill: string }> = {
  aurora: { accent: '#BF85FC', accentDeep: '#6B21A8', rgb: [191, 133, 252], pill: 'rgba(117, 26, 173, 0.3)' },
  cyan:   { accent: '#2F83FF', accentDeep: '#1E5FBF', rgb: [47, 131, 255], pill: 'rgba(47, 131, 255, 0.3)' }, // #2F83FF4D
  mint:   { accent: '#86FFBC', accentDeep: '#188A4A', rgb: [134, 255, 188], pill: 'rgba(134, 255, 188, 0.3)' },
};

export function getSkinAccent(skin: string): SkinAccent {
  const th = SKIN_THEMES[skin] || SKIN_THEMES.aurora;
  const [r, g, b] = th.rgb;
  return {
    accent: th.accent,
    accentDeep: th.accentDeep,
    pill: th.pill,
    rgb: th.rgb,
    tint: (alpha: number) => `rgba(${r},${g},${b},${alpha})`,
  };
}

/** 현재 지구본 스킨 기준 앱 강조색 — 스킨이 바뀌면 자동 갱신 */
export function useSkinAccent(): SkinAccent {
  const { globeSkin } = useSettings();
  return useMemo(() => getSkinAccent(globeSkin), [globeSkin]);
}
