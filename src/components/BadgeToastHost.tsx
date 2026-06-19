import { useEffect } from 'react';
import { useSettings } from '../store/settingsStore';
import { useToast } from '../store/toastStore';
import { BADGES } from '../constants/badges';
import { navigationRef } from '../navigation/navigationRef';

// 신규 배지 획득 → 공용 알림 큐(toastStore)로 발생 순서대로 넘기는 브리지.
// 실제 표시는 ToastHost가 모든 앱내 알림과 함께 순차로 처리한다. (자체 렌더 없음)
// 앱 시작 시 시드 폭주는 settingsStore에서 억제됨.
export default function BadgeToastHost() {
  const { pendingBadgeToasts, dismissBadgeToast } = useSettings();
  const { pushToast } = useToast();

  useEffect(() => {
    if (pendingBadgeToasts.length === 0) return;
    const id = pendingBadgeToasts[0];
    const badge = BADGES.find((b) => b.id === id);
    const message = badge ? `🎉 배지 획득!  ${badge.emoji} ${badge.name}` : '🎉 새 배지를 획득했어요!';
    // 누르면 프로필 탭의 배지 리스트로 이동
    pushToast(message, () => {
      navigationRef.current?.navigate('Main', { screen: 'ProfileTab', params: { openBadgeList: true } });
    });
    dismissBadgeToast(); // 배지측 임시 큐에서 비우고 공용 큐로 이관
  }, [pendingBadgeToasts, pushToast, dismissBadgeToast]);

  return null;
}
