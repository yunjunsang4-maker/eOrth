import { useSyncExternalStore } from 'react';

/**
 * '기록 형식 펼치기' 원격 요청 신호 (tabBarVisibility와 같은 패턴).
 *
 * 소셜 빈 화면의 '첫 기록 남기기' → 메인(지구본) 탭으로 이동한 뒤 이 신호로 RecordFab의
 * 형식 부채꼴 메뉴를 펼친다. RecordFab의 열림 상태는 로컬이라 화면에서 직접 못 열어
 * 이 신호를 RecordFab이 구독한다. 소비형(consume) — 한 번 펼치면 플래그를 내려
 * 이후 재마운트에서 다시 펼쳐지지 않게 한다.
 */
let pendingOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const requestOpenRecordFab = () => {
  pendingOpen = true;
  emit();
};

// 요청을 소비한다. 대기 중이었으면 true, 아니면 false.
export const consumeOpenRecordFab = (): boolean => {
  if (!pendingOpen) return false;
  pendingOpen = false;
  emit();
  return true;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => pendingOpen;

export const usePendingOpenRecordFab = () => useSyncExternalStore(subscribe, get, get);
