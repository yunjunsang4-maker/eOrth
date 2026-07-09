import { useSyncExternalStore } from 'react';

/**
 * 하단 탭 바 잠시 숨김 전역 신호 (coachOverlayState와 같은 패턴).
 *
 * 소셜 탭의 빠른공유(카드 꾹 눌러 드래그) 동안 탭 바가 드롭 영역·딤을 가리지 않게
 * 잠시 숨긴다. 탭 바는 네비게이터 오버레이라 화면 컴포넌트가 직접 제어할 수 없어
 * 이 신호를 CustomTabBar가 구독한다.
 */
let hidden = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const setTabBarHidden = (v: boolean) => {
  if (hidden === v) return;
  hidden = v;
  emit();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => hidden;

export const useTabBarHidden = () => useSyncExternalStore(subscribe, get, get);
