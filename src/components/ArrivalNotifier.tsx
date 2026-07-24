/**
 * ArrivalNotifier — 해외 도착 감지 시 '(나라) 여행 중' 로컬 알림을 1회 발송.
 * arrivalDetect 토글 + 알림 master가 켜져 있을 때만 동작. SnapDetector와 동일 패턴:
 * 포그라운드/마운트 시 위치 확인 → 첫 해외 감지 시 알림 → 귀국하면 리셋(다음 여행에 재동작).
 * App.tsx에 마운트.
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { detectCurrentCountry, isAbroad, requestNotificationPermission } from '../services/snapService';
import { countryNameToCode } from '../utils/momentMatch';

// 앱을 포그라운드로 열 때마다 체크(귀국 감지와 동일). 2분 디바운스로 위치 조회 남발만 방지.
const CHECK_INTERVAL = 2 * 60 * 1000;

export default function ArrivalNotifier() {
  const { t } = useTranslation();
  const { homeCountryCode, arrivalDetect, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();
  const lastCheckRef = useRef(0);
  const hasSentRef = useRef(false);

  // 진행 중 체류국은 해외로 치지 않는다 (다른 감지기와 동일 규칙)
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    return countryNameToCode(activeStayGroup.countryName);
  }, [activeStayGroup]);

  useEffect(() => {
    if (!arrivalDetect || !notifPrefs.master) return;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      lastCheckRef.current = now;

      const { countryCode, countryName } = await detectCurrentCountry();
      if (!countryCode) return;

      if (isAbroad(countryCode, homeCountryCode, stayCountryCode)) {
        if (!hasSentRef.current) {
          const ok = await requestNotificationPermission();
          if (ok) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t('arrivalDetect.notifTitle', { country: countryName || t('arrivalDetect.abroad') }),
                body: t('arrivalDetect.notifBody'),
                data: { type: 'arrival' },
                sound: true,
              },
              trigger: null, // 즉시 발송
            });
            hasSentRef.current = true;
          }
        }
      } else {
        // 거주국 복귀 시 리셋 → 다음 여행에서 다시 알림
        hasSentRef.current = false;
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [arrivalDetect, notifPrefs.master, homeCountryCode, stayCountryCode, t]);

  return null; // UI 없음
}
