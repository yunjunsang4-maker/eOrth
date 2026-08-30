import * as Haptics from 'expo-haptics';

/**
 * 앱 공용 햅틱 — **의미로 부른다.**
 *
 * 왜 유틸을 반드시 경유해야 하는가:
 * 1. 강도를 여기서 한 번만 정한다. 호출부가 `Haptics.*`를 직접 부르면 같은 동작(예: 좋아요)인데
 *    화면마다 강도가 달라진다 — 실제로 상세는 Light인데 피드는 무음인 상태였다.
 * 2. 사용자가 끌 수 있어야 한다. 직접 호출은 아래 `enabled` 게이트를 지나치므로,
 *    설정의 '햅틱' 스위치가 그 호출부에는 거짓말이 된다.
 *
 * **새 햅틱은 예외 없이 이 파일의 함수로 추가할 것.**
 */

// settingsStore.hapticsEnabled의 모듈 레벨 거울. components/HapticsBridge가 갱신한다.
// 훅으로 읽지 않는 이유: 햅틱은 PanResponder 콜백·스토어 액션·setTimeout 안처럼
// 훅을 쓸 수 없는 자리에서 더 많이 불린다.
let enabled = true;

/** 브리지 전용. 화면 코드에서 직접 부르지 말 것 — 설정은 settingsStore가 원본이다. */
export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

/**
 * 공통 실행부. 실패는 전부 삼킨다 — 진동 모터가 없는 기기·시뮬레이터·권한 거부에서
 * 햅틱 예외가 올라와 정작 그 버튼의 동작(저장·삭제)을 막으면 안 된다.
 */
const run = (fn: () => Promise<void>) => {
  if (!enabled) return;
  try {
    fn().catch(() => {});
  } catch {
    /* 네이티브 모듈 부재 등 동기 throw */
  }
};

/** 가벼운 탭 — 좋아요, 칩 선택처럼 "눌렸다"만 알리면 되는 곳 */
export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** 값이 바뀜 — 날짜·항목 선택, 연속 이동 중 경계를 넘을 때. 연타에 가장 덜 피로하다 */
export const select = () => run(() => Haptics.selectionAsync());

/** 집기·놓기 — 드래그 시작처럼 물리적 은유가 있는 동작 */
export const grab = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** 성공 — 발행 완료, 배지 획득처럼 축하할 순간 */
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** 경고 — 삭제·차단처럼 되돌릴 수 없는 동작 */
export const warn = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** 실패 — 유효성 오류, 요청 실패 */
export const fail = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
