/**
 * 스토어 영속성 공용 훅 (AsyncStorage 기반)
 *
 * photoAIStorage.ts와 같은 봉투 스키마 { version, updatedAt, payload }를 사용한다.
 * 스키마가 바뀌면 SCHEMA_VERSION을 올려 과거 데이터를 폐기(시드로 폴백)한다.
 *
 * 동작:
 *  - 마운트 시 1회 AsyncStorage에서 읽어 hydrate 콜백으로 상태 복원
 *  - 복원 완료 후 deps가 바뀔 때마다 디바운스 저장
 *  - 반환값(hydrated)이 false인 동안에는 화면을 렌더하지 않아 시드 데이터 깜빡임을 막는다
 */

import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

export const STORE_KEYS = {
  records: '@eorth/records',
  settings: '@eorth/settings',
  dm: '@eorth/dm',
} as const;

interface Envelope<T> {
  version: number;
  updatedAt: number;
  payload: T;
}

export function usePersistence<T>(
  key: string,
  hydrate: (payload: T) => void,
  serialize: () => T,
  deps: readonly unknown[],
): boolean {
  const [hydrated, setHydrated] = useState(false);

  // 콜백은 매 렌더 최신 클로저를 ref로 유지 (effect 재실행 없이 최신 상태 스냅샷 사용)
  const hydrateRef = useRef(hydrate);
  hydrateRef.current = hydrate;
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;

  // ─── 복원 (마운트 시 1회) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && !cancelled) {
          const env = JSON.parse(raw) as Envelope<T>;
          if (env.version === SCHEMA_VERSION) {
            hydrateRef.current(env.payload);
          }
        }
      } catch {
        // 손상된 데이터는 무시하고 시드로 시작
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  // ─── 저장 (디바운스) ───
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const env: Envelope<T> = {
        version: SCHEMA_VERSION,
        updatedAt: Date.now(),
        payload: serializeRef.current(),
      };
      AsyncStorage.setItem(key, JSON.stringify(env)).catch(() => {
        // 저장 실패(용량 초과 등)는 다음 변경 때 재시도된다
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, ...deps]);

  return hydrated;
}

/** 영속 데이터 전체 삭제 (설정 → 데이터 초기화 등에서 사용) */
export async function clearPersistedStores(): Promise<void> {
  await AsyncStorage.multiRemove([STORE_KEYS.records, STORE_KEYS.settings, STORE_KEYS.dm]);
}
