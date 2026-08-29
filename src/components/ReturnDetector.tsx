/**
 * ReturnDetector — 해외→거주국 복귀 감지 시 로컬 알림 발송.
 *
 * - notifPrefs.master && notifPrefs.returnDetect 모두 켜진 경우에만 동작.
 * - '직전 판정이 해외였고 이번이 거주국'일 때 1회 로컬 알림.
 * - 직전 판정(abroadLast)은 AsyncStorage에 영속 → 앱 재시작 후에도 유지.
 * - 체크는 앱 포그라운드 복귀마다(최소 2분 간격 — 아래 CHECK_INTERVAL).
 *   SnapDetector(4시간)와 다르다. 귀국 직후 앱을 열면 바로 감지돼야 하기 때문이다.
 * App.tsx에서 SnapDetector 옆에 마운트.
 *
 * 다른 감지기와 다른 점(알고 남겨 둔 것 — 빠뜨린 것이 아니다):
 * SnapDetector·ArrivalNotifier에는 재진입 잠금(checking)·세대 무효화(generation)·
 * 스로틀 되돌리기(abort)가 있는데 여기에는 없다. 그것들은 **'이미 보냈다'는 기록이 고착되면
 * 그 여행 내내 침묵**하는 두 감지기의 사고를 막으려고 넣은 장치다. 이쪽이 저장하는 것은
 * 발송 기록이 아니라 '직전 판정'(abroadLast)이고, 매 체크가 현재 위치로 그냥 덮어쓰므로
 * 고착이라는 상태 자체가 없다. 남는 위험은 '조회가 2분을 넘길 때 귀국 알림 2건'뿐이고,
 * 증상이 침묵이 아니라 중복이라 방어를 늘려 얻는 것보다 잠금이 걸린 채 남을 위험이 크다.
 * 예외 처리(아래 catch)만 네 감지기가 같은 모양이다.
 */
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { DETECTOR_KEYS } from '../store/persist';
import { COUNTRIES } from '../constants/countries';
import {
  detectCurrentCountry,
  isAbroad,
  requestNotificationPermission,
} from '../services/snapService';
import i18n from '../i18n';

// 앱을 포그라운드로 열 때마다 체크(귀국 직후 앱을 열면 바로 감지). 2분 디바운스는
// 빠른 앱 전환 시 위치 조회 남발만 막는 용도 — 사실상 "앱 열 때마다 체크".
const CHECK_INTERVAL = 2 * 60 * 1000; // 2분
// 직전 해외 여부 영속 키 — 문자열 자체는 store/persist.ts의 DETECTOR_KEYS가 유일한 정의처다
// (다른 감지기와 같은 규칙). 여기 복붙해 두면 clearPersistedStores가 지우는 키와 갈라진다.
const ABROAD_LAST_KEY = DETECTOR_KEYS.returnAbroadLast;
// 스로틀 기준 시각 — 컴포넌트 ref가 아니라 모듈 스코프에 둬서 리마운트에도 간격이 유지되게 함
let lastCheckAt = 0;

export default function ReturnDetector() {
  const { homeCountryCode, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();

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
      if (now - lastCheckAt < CHECK_INTERVAL) return;
      lastCheckAt = now;

      try {
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
      } catch (e) {
        // AsyncStorage 읽기·쓰기와 알림 권한·발송 API는 throw할 수 있고 서비스 계층에
        // try/catch가 없다. 여기서 삼키지 않으면 check()를 await 없이 부르므로(아래 두 호출부)
        // unhandled rejection이 된다. 네 감지기가 같은 모양이어야 한다는 원칙에 따라
        // SnapDetector·ArrivalNotifier·MomentNotifier의 catch와 문장을 맞췄다.
        //
        // 스로틀 선점(lastCheckAt)은 되돌리지 않는다 — 이 파일에는 RETRY_INTERVAL이 없고,
        // 위치 조회가 null을 돌려준 경우(위 조기 return)도 선점을 그대로 소모한다.
        // 예외에서만 되돌리면 두 실패 경로가 이 파일 안에서 갈라진다. 잃는 것은 2분뿐이다.
        if (__DEV__) console.warn('[ReturnDetector] check() 예외 — 삼키고 계속:', e);
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
