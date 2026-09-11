/**
 * 기기 간 동기화의 **실시간 트리거** 구독 (완전 동기화 5단계, 2026-09-11)
 *
 * 1~4단계로 글(posts)·여행 카드(user_trip_cards)·부가상태(user_state_flags)가 기기 간에
 * 전파되게 됐지만, 반영을 **당기는 트리거**는 두 개뿐이었다 —
 *   ① 앱 포그라운드 복귀(`recordStore`의 AppState 'active' effect, 60초 throttle)
 *   ② 프로필 화면 당겨서 새로고침
 * 그래서 두 기기를 **동시에 켜 둔 채** 쓰면 상대 기기의 변경이 화면에 영영 안 나타났다
 * (앱을 백그라운드로 보냈다 돌아오거나 껐다 켜야 보인다).
 *
 * 이 모듈은 서버의 `user_sync_signals` 행 변경을 Realtime으로 받아 "뭔가 바뀌었다"만 알린다.
 *
 * ⚠️ **이것은 데이터 경로가 아니라 초인종이다.**
 *    콜백은 이벤트 페이로드에서 **아무것도 읽지 않는다**(`domain`조차 진단용이며 앱은 안 본다).
 *    호출부는 디바운스 뒤 기존 `syncMyRecords()`를 부를 뿐이다. 페이로드를 병합에 쓰기 시작하면
 *    병합 로직이 한 벌 더 생겨 1~4단계 QA가 쌓은 보증이 통째로 무효가 된다.
 *
 * ⚠️ **한계 — 이 구독은 보강이지 대체가 아니다.**
 *    Realtime 이벤트는 **소켓이 살아 있는 동안에만** 전달된다. 앱이 백그라운드로 내려가
 *    소켓이 끊긴 사이에 서버에서 일어난 변경은 **재전송되지 않는다**(브로커에 큐가 없다).
 *    따라잡기는 여전히 기존 포그라운드 복귀 sync가 담당한다. 그래서 위 ①②를 **절대 지우면
 *    안 된다** — 이 구독만 남기면 앱을 껐다 켠 기기가 그 사이의 변경을 영영 못 받는다.
 *
 * ⚠️ **서버 표가 없거나 publication 등재가 빠졌으면 조용히 무동작한다**(에러 없음).
 *    `dm_messages`·`notifications`에서 이미 밟은 함정이다 — 진단은
 *    `supabase/migration-2026-09-11-realtime-sync.sql`의 확인 쿼리 4번.
 */

import { supabase } from './supabase';

/**
 * 신호 → 실제 동기화 사이의 트레일링 디바운스(ms).
 *
 * 왜 5초인가: 한 번의 사용자 행동이 서버에서 **여러 신호**를 만든다(글 저장 1건이
 * posts UPDATE + user_trip_cards UPDATE + user_state_flags UPDATE로 이어질 수 있다).
 * 그 묶음을 한 번의 `syncMyRecords()`로 접기에 충분하면서, 사용자가 "반응이 없다"고
 * 느끼기 전이다. (부가상태 push 디바운스가 4초라 그보다 살짝 길게 잡아, 자기 기기가
 * 만든 에코가 대체로 그 안에 접힌다.)
 */
export const SYNC_SIGNAL_DEBOUNCE_MS = 5000;

/**
 * 내 `user_sync_signals` 행의 변경(INSERT/UPDATE)을 구독한다.
 *
 * @param userId 내 uuid. 빈 값이면 no-op(해제 함수만 돌려준다).
 * @param onBump 신호 도착 콜백. **인자가 없다** — 페이로드를 읽지 않는다는 계약을 타입으로 못 박는다.
 * @returns 구독 해제 함수. 언마운트·계정 전환에서 반드시 부를 것.
 *
 * ⚠️ **INSERT와 UPDATE를 둘 다 들어야 한다.** 이 표는 사용자당 1행 upsert라 그 계정의
 *    **첫 신호는 INSERT로 오고 그 뒤로는 전부 UPDATE**다. INSERT만 들으면 신규 사용자만
 *    되고, UPDATE만 들으면 그 계정의 첫 변경 한 번을 놓친다
 *    (`subscribeNotifications`가 collapse UPDATE 때문에 둘 다 듣는 것과 같은 이유).
 *
 * RLS가 본인 행만 전달하지만 필터를 함께 걸어 불필요한 브로드캐스트를 줄인다
 * (`subscribeNotifications`와 같은 패턴).
 */
export function subscribeSyncSignals(userId: string, onBump: () => void): () => void {
  if (!supabase || !userId) return () => {};
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`sync-signals-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_sync_signals', filter },
      () => onBump(), // 페이로드를 읽지 않는다 — 신호일 뿐이다
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'user_sync_signals', filter },
      () => onBump(),
    )
    .subscribe();
  return () => {
    try { supabase!.removeChannel(channel); } catch { /* 무시 */ }
  };
}
