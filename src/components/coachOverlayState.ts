import { useSyncExternalStore } from 'react';

/**
 * 튜토리얼(코치마크) 활성 여부 + 현재 밝게 둘 하단 버튼 전역 신호.
 *
 * 코치마크 딤은 MainScreen 안에 그려지지만, 탭 바(CustomTabBar)와 FAB·스냅
 * 버튼(RecordFab)은 네비게이터 오버레이라 그 위에 떠서 밝게 남는다. 이들이
 * 이 신호를 구독해 튜토리얼 중 스스로 어둡게 처리한다.
 *  - active: 튜토리얼 진행 중 여부
 *  - bright: 현재 단계에서 강조 중이라 밝게 유지할 하단 버튼('snap' | 'fab' | null)
 */
export type CoachBright = 'snap' | 'fab' | null;

let active = false;
let bright: CoachBright = null;
let snapshot: { active: boolean; bright: CoachBright } = { active, bright };
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { active, bright };
  listeners.forEach((l) => l());
};

export const setCoachActive = (v: boolean) => {
  if (!v) {
    if (!active && bright === null) return;
    active = false;
    bright = null;
    emit();
    return;
  }
  if (active) return;
  active = true;
  emit();
};

export const setCoachBright = (v: CoachBright) => {
  if (bright === v) return;
  bright = v;
  emit();
};

/**
 * 튜토리얼이 떠 있는 동안 지구본(WebGL) 렌더 루프를 재우라는 신호.
 *
 * 코치마크는 딤·링·말풍선을 지구본 WebView 위에 겹쳐 그리는데, 그 아래에서 three.js가 60fps로
 * 돌면(라벨 캔버스 갱신 포함) GPU·UI 스레드를 두고 서로 프레임을 뺏어 전환이 눈에 띄게 끊긴다.
 * 자동회전이 45초에 한 바퀴라 튜토리얼(수십 초) 동안 멈춰 있어도 사실상 티가 나지 않는다.
 *
 * 스냅샷(snapshot)은 건드리지 않는다 — RecordFab·탭 바가 불필요하게 리렌더되지 않도록.
 */
let freezeGlobeNow = false;
const freezeListeners = new Set<(v: boolean) => void>();

export const setCoachFreezeGlobe = (v: boolean) => {
  if (freezeGlobeNow === v) return;
  freezeGlobeNow = v;
  freezeListeners.forEach((l) => l(v));
};

/** 리렌더 없이 명령형으로 구독(WebView에 주입만 하면 되는 쪽용) */
export const subscribeCoachFreezeGlobe = (l: (v: boolean) => void) => {
  freezeListeners.add(l);
  return () => {
    freezeListeners.delete(l);
  };
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const getActive = () => active;
const getOverlay = () => snapshot;

/** 탭 바용 — 튜토리얼 활성 여부만 필요 */
export const useCoachActive = () => useSyncExternalStore(subscribe, getActive, getActive);

/** RecordFab용 — 활성 여부 + 밝게 둘 버튼 */
export const useCoachOverlay = () => useSyncExternalStore(subscribe, getOverlay, getOverlay);
