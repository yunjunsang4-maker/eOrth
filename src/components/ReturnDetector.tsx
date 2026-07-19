/**
 * ReturnDetector — 해외→거주국 복귀 감지 시 로컬 알림 발송.
 *
 * - notifPrefs.master && notifPrefs.returnDetect 모두 켜진 경우에만 동작.
 * - '직전 판정이 해외였고 이번이 거주국'일 때 1회 로컬 알림.
 * - 직전 판정(abroadLast)은 AsyncStorage에 영속 → 앱 재시작 후에도 유지.
 * - 체크 주기는 SnapDetector와 동일(앱 포그라운드 복귀 + 최소 4시간 간격).
 * App.tsx에서 SnapDetector 옆에 마운트.
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import {
  detectCurrentCountry,
  isAbroad,
  requestNotificationPermission,
} from '../services/snapService';
import i18n from '../i18n';

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4시간마다 체크
const ABROAD_LAST_KEY = '@eorth/returnDetect/abroadLast'; // 직전 해외 여부 영속 키

export default function ReturnDetector() {
  const { homeCountryCode, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();
  const lastCheckRef = useRef(0);

  // 진행 중(active) 체류국 ISO2 코드
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    const name = activeStayGroup.countryName;
    if (!name) return null;
    return COUNTRIES.find((c) => c.name === name)?.term.split(' ')[0].toUpperCase() ?? null;
  }, [activeStayGroup]);

  useEffect(() => {
    // 마스터 또는 귀국 감지 토글이 꺼져 있으면 아무것도 하지 않음
    if (!notifPrefs.master || !notifPrefs.returnDetect) return;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      lastCheckRef.current = now;

      const { countryCode } = await detectCurrentCountry();
      if (!countryCode) return;

      const abroad = isAbroad(countryCode, homeCountryCode, stayCountryCode);

      // 직전 판정 읽기
      const raw = await AsyncStorage.getItem(ABROAD_LAST_KEY);
      const abroadLast = raw === 'true';

      // 해외→거주국 전환 감지
      if (abroadLast && !abroad) {
        const hasPermission = await requestNotificationPermission();
        if (hasPermission) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: i18n.t('returnDetect.notifTitle'),
              body: i18n.t('returnDetect.notifBody'),
              data: { type: 'returnDetect' },
              sound: true,
            },
            trigger: null, // 즉시 발송
          });
        }
      }

      // 판정 저장 (변경됐을 때만 write)
      if (String(abroad) !== raw) {
        await AsyncStorage.setItem(ABROAD_LAST_KEY, String(abroad));
      }
    };

    // 앱 포그라운드 복귀 시 체크
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    // 최초 마운트 시 체크
    check();

    return () => subscription.remove();
  }, [notifPrefs.master, notifPrefs.returnDetect, homeCountryCode, stayCountryCode]);

  return null; // UI 없음
}
