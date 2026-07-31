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
  // 읽은 '추억 리마인드' 알림 id — 이 알림은 내 기록에서 매번 계산되는 로컬 알림이라
  // 서버 read 컬럼이 없다. 저장하지 않으면 탭해도 다음 진입에 다시 새 알림이 된다.
  memoryNotiRead: '@eorth/memoryNotiRead',
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
  // AsyncStorage '읽기 자체'가 실패한 경우 true — 이 세션 동안 이 키의 자동 저장을 완전히 끈다.
  // 파싱 실패와 달리 raw를 손에 넣지 못해 .corrupt 백업조차 만들 수 없는데, 그대로 hydrated=true가
  // 되면 400ms 뒤 '시드 상태'가 멀쩡히 남아 있는 원본을 백업 없이 영구 덮어쓴다
  // (Android CursorWindow 초과로 큰 records 키 읽기가 실패하는 시나리오 — 사용자 기록 전체 소실).
  // 이 세션의 변경이 저장되지 않는 손실보다 원본 파괴가 훨씬 크므로 저장을 포기하는 쪽을 택한다.
  const saveDisabledRef = useRef(false);

  // ─── 복원 (마운트 시 1회) ───
  useEffect(() => {
    let cancelled = false;
    skipSaveOnceRef.current = false;
    saveDisabledRef.current = false; // key가 바뀌면 새 키 기준으로 다시 판정
    (async () => {
      let raw: string | null = null;
      let readFailed = false;
      // 읽기 실패는 1회 재시도 — 일시적 스토리지 경합이면 두 번째 시도에서 살아난다.
      // (없는 키는 예외가 아니라 null이므로 첫 설치·빈 스토리지는 여기 걸리지 않는다)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          raw = await AsyncStorage.getItem(key);
          readFailed = false;
          break;
        } catch {
          raw = null;
          readFailed = true;
        }
      }
      if (cancelled) return;
      if (readFailed) {
        // 읽기 실패: 원본이 남아 있는데 내용을 모르는 상태 → 이 키의 자동 저장을 세션 내 비활성화
        saveDisabledRef.current = true;
      } else if (raw) {
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
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  // ─── 저장 (디바운스) ───
  useEffect(() => {
    if (!hydrated) return;
    if (saveDisabledRef.current) return; // 읽기 실패 세션 — 원본 보존을 위해 이 키는 저장하지 않는다
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
  await AsyncStorage.multiRemove([STORE_KEYS.records, STORE_KEYS.settings, STORE_KEYS.dm, STORE_KEYS.feedCache, STORE_KEYS.moments, STORE_KEYS.memoryNotiRead]);
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
