/**
 * SnapDetector — 백그라운드에서 주기적으로 위치를 확인하고
 * 해외 감지 시 스냅 알림을 예약하는 컴포넌트.
 * App.tsx에서 Provider 내부에 마운트.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '../store/settingsStore';
import {
  detectCurrentCountry,
  isAbroad,
  scheduleRandomSnapNotification,
  sendSnapNotification,
  requestNotificationPermission,
  cancelScheduledSnapNotifications,
} from '../services/snapService';

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4시간마다 체크

export default function SnapDetector() {
  const { homeCountryCode, snapEnabled, notifPrefs } = useSettings();
  const lastCheckRef = useRef(0);
  const hasSentRef = useRef(false);

  useEffect(() => {
    // 알림 마스터 토글도 함께 검사 — 설정 화면은 마스터 OFF 시 스냅 토글을 꺼진 것으로
    // 표시하므로, 실제 발송도 일치해야 한다. 꺼질 때는 이미 예약된 랜덤 알림까지 취소.
    if (!snapEnabled || !notifPrefs.master) {
      cancelScheduledSnapNotifications();
      return;
    }

    const check = async () => {
      const now = Date.now();
      // 마지막 체크 후 4시간 미경과 시 스킵
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      lastCheckRef.current = now;

      const { countryCode, countryName } = await detectCurrentCountry();
      if (!countryCode) return;

      if (isAbroad(countryCode, homeCountryCode)) {
        if (!hasSentRef.current) {
          // 처음 해외 감지 → 즉시 알림
          const hasPermission = await requestNotificationPermission();
          if (hasPermission) {
            await sendSnapNotification(countryName || undefined);
            // 이후 랜덤 알림 예약 (1~3시간 후)
            await scheduleRandomSnapNotification(countryName || undefined, 60, 180);
            hasSentRef.current = true;
          }
        }
      } else {
        // 본국 복귀 시 리셋
        hasSentRef.current = false;
      }
    };

    // 앱 포그라운드 복귀 시 체크
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    // 최초 마운트 시 체크
    check();

    return () => subscription.remove();
  }, [snapEnabled, notifPrefs.master, homeCountryCode]);

  return null; // UI 없음
}
