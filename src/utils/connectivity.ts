/**
 * 네트워크 연결 상태 공용 유틸 (오프라인 견고화)
 *
 * 오지/기내처럼 연결이 없거나 불안정한 환경에서:
 *  - isOnline(): 서버 호출 전에 "확실히 오프라인"인지 빠르게 판정(타임아웃 대기 방지)
 *  - onReconnect(): 오프라인 → 온라인 전환 시점에 미동기화 데이터 재전송 트리거
 *
 * isConnected가 true여도 실제 인터넷 도달은 보장되지 않는다(판정은 낙관적으로,
 * 실패 처리는 호출부의 기존 오류 경로에 맡긴다).
 */

import * as Network from 'expo-network';

/** true=연결됨, false=확실히 오프라인, null=판정 불가(오프라인 취급 금지) */
export async function isOnline(): Promise<boolean | null> {
  try {
    const s = await Network.getNetworkStateAsync();
    return s.isConnected ?? null;
  } catch {
    return null;
  }
}

/**
 * 오프라인 → 온라인 전환 시 콜백 실행. 해제 함수를 반환한다.
 * 최초 상태가 온라인이면 발화하지 않는다(전환만 신호로 사용 — 중복 동기화 방지).
 */
export function onReconnect(cb: () => void): () => void {
  let last: boolean | null = null;
  try {
    const sub = Network.addNetworkStateListener((s) => {
      const now = !!s.isConnected;
      if (last === false && now) cb();
      last = now;
    });
    return () => sub.remove();
  } catch {
    // 리스너 미지원 환경 — 호출부의 다른 트리거(AppState 등)가 폴백
    return () => {};
  }
}
