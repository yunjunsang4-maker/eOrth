/**
 * MomentNotifier — 해외 체류 중 '순간 기록' 상시 알림을 유지하는 컴포넌트.
 * SnapDetector와 같은 패턴: 앱 실행/포그라운드 전환 시 위치 확인.
 * 해외면 알림이 떠 있게 유지(지워졌으면 재게시), 귀국하면 제거. App.tsx에 마운트.
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { detectCurrentCountry, isAbroad, requestNotificationPermission } from '../services/snapService';
import { countryNameToCode } from '../utils/momentMatch';
import { postMomentNotification, isMomentNotificationPresented, dismissMomentNotification } from '../services/momentService';

// 위치 재확인은 4시간마다(SnapDetector와 동일)
const LOCATION_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

export default function MomentNotifier() {
  const { t } = useTranslation();
  const { homeCountryCode, arrivalDetect, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();
  const lastLocCheckRef = useRef(0);
  const abroadRef = useRef<boolean | null>(null); // 마지막 위치 판정 캐시
  const checkingRef = useRef(false); // check() 병렬 실행 방지
  const armedRef = useRef(false); // 도착 순간 1회 건너뛴 뒤 게시 준비됨(도착 알림과 겹침 방지)

  // 진행 중 체류국은 해외로 치지 않는다 (SnapDetector와 동일 규칙)
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    return countryNameToCode(activeStayGroup.countryName);
  }, [activeStayGroup]);

  useEffect(() => {
    if (!notifPrefs.master || !notifPrefs.travelMoment) {
      // 토글 끄면 즉시 내린다
      dismissMomentNotification();
      abroadRef.current = null;
      return;
    }

    // 거주국·체류국이 바뀌면 직전 판정은 무효 — 다음 check에서 재판정
    abroadRef.current = null;
    lastLocCheckRef.current = 0;
    armedRef.current = false;

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const now = Date.now();
        // 위치 판정은 스로틀, 알림 존재 확인·재게시는 매 포그라운드마다
        if (abroadRef.current === null || now - lastLocCheckRef.current >= LOCATION_CHECK_INTERVAL) {
          lastLocCheckRef.current = now;
          const { countryCode } = await detectCurrentCountry();
          if (countryCode) abroadRef.current = isAbroad(countryCode, homeCountryCode, stayCountryCode);
          // countryCode를 못 얻으면 직전 판정 유지(오프라인 대응)
        }
        if (abroadRef.current === true) {
          // 도착 알림(arrivalDetect)이 켜져 있으면 '도착 순간'(첫 감지) 한 번은 게시를 건너뛴다 —
          // 도착 알림과 동시에 뜨지 않게 하고, 다음 포그라운드부터 순간 기억 알림을 유지한다.
          if (arrivalDetect && !armedRef.current) {
            armedRef.current = true;
          } else if (!(await isMomentNotificationPresented())) {
            const ok = await requestNotificationPermission();
            if (ok) await postMomentNotification(t('moments.notifTitle'), t('moments.notifBody'));
          }
        } else if (abroadRef.current === false) {
          armedRef.current = false; // 귀국 → 리셋(다음 여행에서 다시 도착 순간 스킵)
          await dismissMomentNotification(); // 귀국 → 제거
        }
      } finally {
        checkingRef.current = false;
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [notifPrefs.master, notifPrefs.travelMoment, arrivalDetect, homeCountryCode, stayCountryCode, t]);

  return null; // UI 없음
}
