// 스킨 팔레트 개편(2026-09-28)으로 빠진 활성화색 → 가장 가까운 새 색.
// 저장값(지구본 기본색·국가별·지역별·스킨별 묶음)에 옛 색이 남아 있으면 지구본엔 그대로 칠해지지만
// 옵션 알약 어디에도 선택 표시가 안 뜬다 — 불러올 때 한 번 바꿔 둔다(사용자 확정).
import type { SkinColorSet } from '../store/settingsStore';

const RETIRED: Record<string, string> = {
  '#C88BF6': '#A47DE9', // aurora 라벤더
  '#8FF6BD': '#1DFFBB', // mint
  '#8FF6A0': '#12E17A', // mint
};

export const remapRetiredColor = (c: string): string => RETIRED[c.toUpperCase()] ?? c;

export const remapRetiredColorMap = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'string' ? remapRetiredColor(v) : v]));

export const remapRetiredSkinStore = (s: Record<string, SkinColorSet>): Record<string, SkinColorSet> =>
  Object.fromEntries(Object.entries(s).map(([skin, set]) => [skin, {
    ...set,
    globeColor: typeof set?.globeColor === 'string' ? remapRetiredColor(set.globeColor) : set?.globeColor,
    countryColors: set?.countryColors ? remapRetiredColorMap(set.countryColors) : set?.countryColors,
    regionColors: set?.regionColors ? remapRetiredColorMap(set.regionColors) : set?.regionColors,
  }]));
