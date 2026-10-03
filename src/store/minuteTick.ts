/**
 * 분 단위 공용 시계 — "n분 전" 같은 상대 시간 텍스트를 다시 그리게 하는 신호.
 *
 * 왜 필요한가: 상대 시간은 렌더 시점의 Date.now()로 계산되고 타이머가 없다. 예전엔 무관한 스토어
 * 변화(Context 하나에 다 묶여 있었다)마다 카드가 리렌더돼 우연히 최신이었지만, 스토어를 슬라이스로 나눈
 * 뒤(df2ef56·settings/dm 분리)엔 새로고침·포커스 재조회 때만 갱신된다(03_session_audit.md F2).
 *
 * 스냅샷은 '현재 분'(Date.now()/60초 내림)이다 — 분이 바뀔 때만 새 값이 되므로 구독자(시간 텍스트)만
 * 분당 1번 다시 그려진다. getSnapshot이 호출마다 같은 값을 돌려줘야 하는 useSyncExternalStore 계약도
 * 이래서 지켜진다(Date.now()를 그대로 스냅샷으로 쓰면 무한 리렌더).
 *
 * 타이머는 첫 구독자가 생길 때 켜고 마지막 구독자가 빠지면 끈다 — 시간 텍스트가 화면에 하나도 없으면
 * 아무것도 돌지 않는다. setInterval 대신 '다음 분 경계'까지의 setTimeout을 이어 건다: 앱이 백그라운드에
 * 있는 동안 RN이 타이머를 멈췄다 늦게 쏴도, 깨어날 때 현재 분을 다시 재고 다음 경계로 맞춰지므로
 * 어긋남이 쌓이지 않는다. 포그라운드 복귀(AppState active) 때는 경계를 기다리지 않고 즉시 한 번 잰다.
 *
 * 의존(시각·타이머·포그라운드 구독)을 주입받는 공장 함수인 이유: react-native(AppState)를 import하지
 * 않아야 minuteTick.verify.ts가 node에서 돈다. 실제 인스턴스는 components/TimeAgoText.tsx가 만든다.
 */

export const MINUTE_MS = 60_000;

export interface MinuteTickDeps {
  now: () => number;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** 앱이 포그라운드로 돌아올 때 cb를 부르는 구독. 해제 함수를 돌려준다 */
  onForeground: (cb: () => void) => () => void;
}

export function createMinuteTick(deps: MinuteTickDeps) {
  let minute = Math.floor(deps.now() / MINUTE_MS);
  let timer: unknown = null;
  let offForeground: (() => void) | null = null;
  const listeners = new Set<() => void>();

  // 분이 바뀌었을 때만 알린다 — 같은 분이면 구독자 리렌더 0
  const refresh = () => {
    const m = Math.floor(deps.now() / MINUTE_MS);
    if (m === minute) return;
    minute = m;
    listeners.forEach((l) => l());
  };

  // 다음 분 경계 + 여유 50ms(경계 직전에 깨어나 같은 분을 다시 읽는 일 방지)
  const schedule = () => {
    timer = deps.setTimer(() => {
      refresh();
      // refresh의 알림 도중 마지막 구독자가 동기로 빠졌으면 여기서 멈춘다 — 안 그러면 고아 타이머가
      // 영구히 돌고, 재구독 시 루프가 2개가 된다
      if (listeners.size === 0) { timer = null; return; }
      schedule();
    }, MINUTE_MS - (deps.now() % MINUTE_MS) + 50);
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    if (listeners.size === 1) {
      // 쉬는 동안 분이 지났을 수 있다 — 켤 때 한 번 맞춘다(구독 직후라 렌더 중이 아니다: useSyncExternalStore는
      // 커밋 뒤 effect에서 subscribe한다)
      refresh();
      schedule();
      offForeground = deps.onForeground(refresh);
    }
    return () => {
      listeners.delete(l);
      if (listeners.size === 0) {
        deps.clearTimer(timer);
        timer = null;
        offForeground?.();
        offForeground = null;
      }
    };
  };

  const getSnapshot = () => minute;

  return { subscribe, getSnapshot, isRunning: () => timer !== null };
}
