import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 프로필 여행 카드 드래그 순서 — 인스턴스 간 공유 + 영속.
// 기존 모듈 변수(let CARD_ORDER) 방식은 ① 탭 ProfileScreen과 소셜에서 푸시된
// ProfileScreen이 동시에 마운트되면 서로의 재정렬을 못 보고 덮어써 소실되고
// ② 앱 재시작 시 순서가 초기화됐다. 구독 스토어 + AsyncStorage로 둘 다 해결.
const KEY = '@eorth/profileCardOrder';

let order: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// 앱 시작 시 1회 복원 (모듈 로드 시점에 비동기 시작 — 실패는 빈 순서로 무해)
AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      order = parsed;
      emit();
    }
  })
  .catch(() => {});

export function setCardOrder(ids: string[]) {
  order = ids;
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(ids)).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => order;

export const useCardOrder = () => useSyncExternalStore(subscribe, get, get);
