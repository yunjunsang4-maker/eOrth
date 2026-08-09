import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useToast } from '../store/toastStore';
import { BADGES } from '../constants/badges';
import { badgeName } from '../utils/badgeText';
import { navigationRef } from '../navigation/navigationRef';

// 신규 배지 획득 → 공용 알림 큐(toastStore)로 발생 순서대로 넘기는 브리지.
// 실제 표시는 ToastHost가 모든 앱내 알림과 함께 순차로 처리한다. (자체 렌더 없음)
// 앱 시작 시 시드 폭주는 settingsStore에서 억제됨.
//
// 예전엔 문구에 🎉·배지 이모지를 끼운 텍스트 전용 토스트였다 — 다른 앱내 알림
// (아바타+제작 아이콘 리치 배너)과 시스템이 달랐고 하드코딩 한국어라 i18n도 빠져 있었다.
// 지금은 visual { icon: 'badge' } 로 같은 배너 시스템을 탄다(별 아이콘, Toast.tsx).
export default function BadgeToastHost() {
  const { t } = useTranslation();
  const { pendingBadgeToasts, dismissBadgeToast } = useSettings();
  const { pushToast } = useToast();

  useEffect(() => {
    if (pendingBadgeToasts.length === 0) return;
    const id = pendingBadgeToasts[0];
    const badge = BADGES.find((b) => b.id === id);
    const message = badge
      ? t('misc.badgeEarnedText', { name: badgeName(badge, t) })
      : t('misc.badgeEarnedDefault');
    // 누르면 프로필 탭의 배지 리스트로 이동
    pushToast(message, () => {
      navigationRef.current?.navigate('Main', { screen: 'ProfileTab', params: { openBadgeList: true } });
    }, { icon: 'badge' });
    dismissBadgeToast(); // 배지측 임시 큐에서 비우고 공용 큐로 이관
  }, [pendingBadgeToasts, pushToast, dismissBadgeToast, t]);

  return null;
}
