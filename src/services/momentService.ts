// 여행 기억 상시 알림 — 게시/존재확인/제거.
// 문자열은 호출부(MomentNotifier)가 i18n으로 만들어 넘긴다(서비스는 순수 유지).
// 안드로이드: sticky(고정 알림). iOS: sticky 미지원 → 일반 알림 + '지워져 있으면 재게시' 규칙(스펙 ②).
import * as Notifications from 'expo-notifications';

export const MOMENT_NOTIF_ID = 'travel-moment-ongoing';

export async function postMomentNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: MOMENT_NOTIF_ID, // 같은 id로 게시하면 교체되어 중복 알림이 쌓이지 않는다
    content: {
      title,
      body,
      sticky: true, // Android 전용 — iOS에선 무시됨(NotificationContentInput 최상위 필드)
      data: { type: 'moment' },
    },
    trigger: null, // 즉시 게시
  });
}

// 알림창에 아직 떠 있는지 — 떠 있으면 재게시하지 않는다(포그라운드 전환마다 재알림 방지)
export async function isMomentNotificationPresented(): Promise<boolean> {
  const list = await Notifications.getPresentedNotificationsAsync();
  return list.some((n) => n.request.identifier === MOMENT_NOTIF_ID);
}

export async function dismissMomentNotification(): Promise<void> {
  try { await Notifications.dismissNotificationAsync(MOMENT_NOTIF_ID); } catch { /* 없으면 무시 */ }
}
