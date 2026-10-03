import { useSyncExternalStore } from 'react';

/**
 * 아이콘 팔레트 — 지구본 스킨에 따라 바뀌는 아이콘 기본색(색 prop을 안 준 아이콘이 쓰는 그라데이션).
 *
 * 예전에는 모듈 가변 객체 `COLORS`를 `Object.assign`으로 갈아끼우고, 아이콘은 "부모가 리렌더되면
 * 나도 다시 그려진다"에 기대 새 색을 읽었다. React Compiler(2f9f04b)를 켠 뒤 그 가정이 깨졌다 —
 * 컴파일된 부모가 props가 상수인 `<XIcon size={22} />` 엘리먼트를 캐시해 재사용하면 React가 아이콘
 * 렌더를 건너뛰어, 스킨을 바꿔도 화면을 다시 열 때까지 옛 색이 남았다(설정 메뉴 아이콘 28개 등).
 * 컴파일된 아이콘 자신도 상수로 보이는 `COLORS.x` 읽기를 sentinel 캐시에 넣어 굳혔다(PartlyCloudyIcon).
 *
 * 그래서 아이콘이 이 저장소를 직접 구독한다(coachOverlayState·recordFabState와 같은 useSyncExternalStore
 * 패턴). 부모 캐시와 무관하게 팔레트가 바뀐 아이콘만 다시 렌더되고, 훅이 돌려준 객체를 읽으므로
 * 컴파일러도 그 값을 의존성으로 다룬다.
 *
 * 스냅샷은 PALETTES의 항목 객체를 복사 없이 그대로 가리킨다 — 같은 이름을 다시 설정하면 참조도 같아서
 * 알림이 없고(전 아이콘 헛 리렌더 방지), getSnapshot이 매번 새 객체를 만들지 않으니 무한 루프도 없다.
 * react-native-svg를 import하지 않는 별도 파일인 이유: palette.verify.ts가 node에서 돌아야 해서.
 */
export const PALETTES = {
  purple: {
    purpleTop: '#E0C9FF', purpleMid: '#A78BFA', purpleBot: '#7C3AED',
    goldTop:   '#FFE98A', goldBot:   '#E5B100',
    redTop:    '#FF8080', redBot:    '#FF3B30',
    dot:       '#FF4D4D',
  },
  neon: {
    purpleTop: '#F5A6FF', purpleMid: '#C77DFF', purpleBot: '#9D4EDD',
    goldTop:   '#FFE99A', goldBot:   '#E5B100',
    redTop:    '#FF8FA8', redBot:    '#FF477E',
    dot:       '#FF477E',
  },
  cyan: {
    purpleTop: '#B5F5FF', purpleMid: '#5FB8FF', purpleBot: '#2563EB',
    goldTop:   '#FFE57A', goldBot:   '#E0A600',
    redTop:    '#FF8E91', redBot:    '#FF5A5F',
    dot:       '#FF5A5F',
  },
  mint: {
    purpleTop: '#C9FFE5', purpleMid: '#5FE3A1', purpleBot: '#10B981',
    goldTop:   '#FFE57A', goldBot:   '#E5B100',
    redTop:    '#FF9999', redBot:    '#FF6B6B',
    dot:       '#FF6B6B',
  },
} as const;

export type PaletteName = keyof typeof PALETTES;
export type Palette = { readonly [K in keyof typeof PALETTES.purple]: string };

let current: Palette = PALETTES.purple; // 예전 COLORS 초깃값과 같다
const listeners = new Set<() => void>();

// 호출부는 settingsStore의 applyIconPalette 하나뿐이고 전부 렌더 밖(스킨 전환 콜백, 하이드레이트,
// resetSettings, 백업 복원)이다 — 렌더 중에 알리면 "다른 컴포넌트 렌더 중 setState" 경고가 나므로
// 렌더 본문에서 부르지 말 것.
export function setPalette(name: PaletteName) {
  const next = PALETTES[name];
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export const getPalette = (): Palette => current;

export const subscribePalette = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const usePalette = () => useSyncExternalStore(subscribePalette, getPalette, getPalette);
