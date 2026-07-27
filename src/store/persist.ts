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
  feedCache: '@eorth/feedCache', // 소셜 피드 캐시(타인 글) — 오프라인 재시작 시 마지막 피드 표시용
  moments: '@eorth/moments', // 여행 기억(순간 메모)
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
  // hydrate 콜백이 중간에 throw한 경우 true — 반쯤 복원된 상태가 마운트 직후 디바운스 저장으로
  // 원본을 즉시 덮어쓰는 것을 1회 막는다(.corrupt 백업과 별개의 방어선). 사용자가 이후 실제로
  // 상태를 바꾸면 그때부터는 현재 상태가 새 원본이므로 정상 저장한다.
  const skipSaveOnceRef = useRef(false);

  // ─── 복원 (마운트 시 1회) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && !cancelled) {
          try {
            const env = JSON.parse(raw) as Envelope<T>;
            if (env.version === SCHEMA_VERSION) {
              hydrateRef.current(env.payload);
            }
          } catch {
            // 파싱/복원 실패: 시드(또는 부분 복원) 상태로 시작하되, 원본을 백업 키로 보존한다.
            // hydrated=true가 되는 순간 디바운스 저장이 현재 상태로 원본을 '덮어쓰기' 때문에,
            // 백업 없이는 복원 실패 한 번이 곧 영구 데이터 파괴가 된다.
            await AsyncStorage.setItem(`${key}.corrupt`, raw).catch(() => {});
            skipSaveOnceRef.current = true; // 마운트 직후 자동 저장 1회 스킵 — 원본 즉시 덮어쓰기 방지
          }
        }
      } catch {
        // 읽기 자체가 실패(스토리지 오류) — 시드로 시작
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
    if (skipSaveOnceRef.current) {
      // 부분 hydrate 직후의 첫 자동 저장은 건너뛴다 — 이후 실제 상태 변경부터 정상 저장
      skipSaveOnceRef.current = false;
      return;
    }
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
    // deps는 호출부가 저장 시점을 제어하는 의도된 가변 배열(정적 검증 불가). key는 저장 키라 포함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key, ...deps]);

  return hydrated;
}

/** 영속 데이터 전체 삭제 (설정 → 데이터 초기화 등에서 사용) */
export async function clearPersistedStores(): Promise<void> {
  await AsyncStorage.multiRemove([STORE_KEYS.records, STORE_KEYS.settings, STORE_KEYS.dm, STORE_KEYS.feedCache, STORE_KEYS.moments]);
}

/**
 * 봉투 스키마 단발 저장/복원 헬퍼 — usePersistence(디바운스 훅)가 과한, 갱신 시점이
 * 명확한 캐시성 데이터용(예: 피드 캐시). 실패는 조용히 무시한다(재생성 가능 데이터).
 */
export async function saveEnvelope<T>(key: string, payload: T): Promise<void> {
  try {
    const env: Envelope<T> = { version: SCHEMA_VERSION, updatedAt: Date.now(), payload };
    await AsyncStorage.setItem(key, JSON.stringify(env));
  } catch {
    // 저장 실패(용량 등) — 다음 갱신 때 재시도되는 셈
  }
}

export async function loadEnvelope<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== SCHEMA_VERSION) return null; // 버전 불일치 — 캐시는 폐기(재생성 가능)
    return env.payload;
  } catch {
    return null;
  }
}
