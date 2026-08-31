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
  travelDna: '@eorth/travelDna',
} as const;

/**
 * 상시 감지기(스냅·도착·귀국)의 '이미 보냈는가' 영속 상태 키 — **여기가 유일한 정의처다.**
 *
 * STORE_KEYS와 분리한 이유: 저쪽은 usePersistence의 봉투 스키마({version,updatedAt,payload})로
 * 읽고 쓰는 스토어 키지만, 이쪽은 감지기가 직접 raw 문자열('true' / ISO2 코드)로 읽고 쓴다.
 * 같은 목록에 섞으면 누군가 loadEnvelope로 읽으려 들거나 SCHEMA_VERSION 폐기 대상으로 오해한다.
 *
 * ⚠️ 키 문자열을 감지기 파일에 복붙하지 마라. 한쪽만 고치면 '지우는 쪽이 다른 키를 지워
 *    발송 기록이 고착 → 그 여행 내내 알림 0건'이 되는데, 컴파일도 lint도 통과하고 증상은
 *    해외에 나가야만 나온다. 감지기는 이 상수를 별칭으로 받아 쓴다
 *    (scripts/snap-detect-guard.verify.mjs가 그 별칭 문장을 대조한다).
 */
export const DETECTOR_KEYS = {
  snapSent: '@eorth/snapDetect/sent', // SnapDetector — 이번 해외 체류에서 스냅을 보냈는가('true')
  arrivalSentCountry: '@eorth/arrivalDetect/sentCountry', // ArrivalNotifier — 도착 알림을 낸 나라 ISO2
  returnAbroadLast: '@eorth/returnDetect/abroadLast', // ReturnDetector — 직전 판정이 해외였는가
  // 아래 둘은 '보냈는가'가 아니라 FAB 사진첩 배지의 강조 창(utils/fabHighlight.ts)을 계산하는
  // 시각 값이다. 성격이 조금 다르지만 여기 둔 이유는 지우는 근거가 같기 때문이다 —
  // returnAt은 거주국 기준으로 찍힌 값이라 거주국이 초기화되면 무효고, albumCreatedAt은
  // records와 짝인데 clearPersistedStores가 records를 지운다. 남기면 '앨범이 없는데
  // 만들었다고 판단해 배지가 영영 안 뜨는' 고착이 된다.
  returnAt: '@eorth/returnDetect/returnAt', // 마지막 귀국 판정 시각 (FAB 강조 창 시작점)
  albumCreatedAt: '@eorth/album/lastCreatedAt', // 마지막 사진첩 생성 시각 (강조 해제 근거)
} as const;

/**
 * 감지기 관련 '기기당 1회 안내' UX 플래그 — DETECTOR_KEYS와 목록을 나눠 둔다.
 *
 * 저쪽은 **발송 기록**이라 남으면 증상이 '알림이 영영 안 온다'이고, 이쪽은 **안내 기록**이라
 * 남으면 증상이 '기능을 발견할 경로가 사라진다'다. 지우는 근거가 달라 한 목록에 섞으면
 * 다음 사람이 둘 중 하나의 근거만 읽고 판단하게 된다.
 *
 * 그래도 clearPersistedStores에서는 **함께 지운다.** 이 앱의 관례가 "데이터 초기화 시 1회
 * 안내 플래그도 되돌린다"이기 때문이다 — 같은 성격의 tutorialsSeen(코치마크)을
 * settingsStore.resetSettings가 초기화하고, 데이터 초기화 화면은 그 둘을 같은 흐름에서 부른다
 * (SettingsScreen의 초기화: clearPersistedStores → resetSettings). 넛지 플래그만 raw
 * AsyncStorage에 있어서 그 관례에서 혼자 빠져 있었다(7차 QA 발견 22).
 *
 * 구체적으로: 데이터 초기화는 notifPrefs를 기본값으로 되돌리는데 returnDetect의 기본값이
 * false다. 즉 사용자는 귀국 감지가 **꺼진 상태**로 돌아가는데, 켜라고 권하는 1회 안내는
 * 'true'가 남아 다시 뜨지 않는다 → 그 기능을 다시 알 방법이 없다.
 */
export const NUDGE_KEYS = {
  returnDetectNudged: '@eorth/returnDetect/nudged', // ReturnDetectNudge — 켜기 안내를 이미 띄웠는가
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

/**
 * 영속 데이터 전체 삭제 (계정 전환·데이터 초기화 전용 — 일반 로그아웃은 로컬을 지우지 않는다.
 * records 등은 서버에서 재다운로드하지 않아 지우면 데이터 손실이지만, travelDna는 서버가
 * 진실이라 지워도 다음 진입에 다시 받아온다 — 그래서 여기 포함해도 안전하고, 계정 귀속
 * 데이터라 포함하지 않으면 다음 계정에 이전 계정의 유형이 그대로 남는다).
 *
 * DETECTOR_KEYS도 함께 지운다. 근거는 **이 함수가 STORE_KEYS.settings를 지운다**는 것이다 —
 * 거주국(homeCountryCode)이 초기화되면 세 감지기의 '해외' 기준 자체가 달라지므로, 옛 기준으로
 * 남긴 발송 기록은 전부 무효다. 남겨 두면 상태와 기준이 어긋난 채 고착된다:
 *  · snapDetect/sent='true'가 남으면 그 여행 내내 스냅이 0건(실측). 사용자는 원인도 모르고
 *    되돌릴 수도 없다 — 스냅 토글을 껐다 켜야만 풀린다.
 *  · arrivalDetect/sentCountry가 남으면 같은 나라 도착 알림이 그 여행 내내 침묵한다.
 *  · returnDetect/abroadLast는 지워도 다음 포그라운드 체크가 현재 위치로 곧바로 다시 기록한다.
 *    잃는 것은 '초기화 직후 앱을 한 번도 열지 않고 귀국한' 경우의 귀국 알림 1건뿐이고,
 *    남겼을 때의 위험(옛 거주국 기준의 해외 판정으로 엉뚱한 귀국 알림)과 맞바꿀 값이 아니다.
 * 지웠을 때의 대가는 전부 '알림 1건 중복 또는 누락'이고, 남겼을 때의 대가는 '여행 내내 침묵'이다.
 * 감지기 상태는 계정이 아니라 기기·위치에 묶인 값이지만, 그 판정 기준(거주국)이 여기서
 * 함께 사라지므로 네 호출부(계정 전환·데이터 초기화·탈퇴 파기 2곳) 모두 지우는 쪽이 옳다.
 *
 * NUDGE_KEYS도 함께 지운다(근거는 그 선언부에). 여기서 지워도 안내가 곧바로 다시 뜨지는
 * 않는다 — 넛지의 조건은 '해외 여행 기록이 있을 것'인데 records도 이 함수가 함께 지우므로,
 * 사용자가 해외 기록을 다시 갖게 된 시점에야 뜬다. 그게 원래 의도한 등장 시점이다.
 */
export async function clearPersistedStores(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORE_KEYS.records, STORE_KEYS.settings, STORE_KEYS.dm, STORE_KEYS.feedCache, STORE_KEYS.moments, STORE_KEYS.memoryNotiRead, STORE_KEYS.travelDna,
    // Object.values로 도는 이유: 감지기 키가 늘어나도 여기 한 줄을 고칠 필요가 없다.
    // 열거를 손으로 적어 두면 '새 감지기를 추가하고 여기 빠뜨리는' 사고가 정확히 반복된다.
    ...Object.values(DETECTOR_KEYS),
    ...Object.values(NUDGE_KEYS),
  ]);
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
