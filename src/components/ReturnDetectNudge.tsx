/**
 * ReturnDetectNudge — 첫 해외 여행 기록이 감지되면 '귀국 감지' 알림을 켜라고 한 번 권한다.
 *
 * - returnDetect가 이미 켜져 있으면 미동작.
 * - 원샷: AsyncStorage 영속 플래그로 기기당 1회만 안내(거부해도 재등장 없음).
 *   단 데이터 초기화·계정 전환은 이 플래그도 되돌린다(clearPersistedStores). 그때는
 *   returnDetect가 기본값 false로 함께 꺼지므로, 안내까지 남겨 두면 그 기능을 다시 알 길이
 *   없어진다. 같은 성격인 코치마크(tutorialsSeen)도 초기화되는 것이 이 앱의 관례다.
 * - 위치 권한은 사용자가 '켜기'를 눌러 returnDetect를 켠 뒤 ReturnDetector가 요청 —
 *   맥락 없이 위치 권한을 먼저 묻지 않는다(기본 OFF 유지 + 맥락 넛지).
 */
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { NUDGE_KEYS } from '../store/persist';
import { COUNTRIES } from '../constants/countries';

// 안내 1회 플래그 — 문자열 자체는 store/persist.ts의 NUDGE_KEYS가 유일한 정의처다.
// 여기 복붙해 두면 clearPersistedStores(데이터 초기화·계정 전환)가 지우는 키와 갈라져
// '초기화했는데 안내가 영영 안 뜬다'가 되고, 컴파일도 lint도 통과한다(감지기 키와 같은 규칙).
const NUDGED_KEY = NUDGE_KEYS.returnDetectNudged;

// 국가명(예: '일본') → ISO2 코드(예: 'JP'). ReturnDetector와 동일 매핑.
function codeOf(name?: string | null): string | null {
  if (!name) return null;
  return COUNTRIES.find((c) => c.name === name)?.term.split(' ')[0].toUpperCase() ?? null;
}

export default function ReturnDetectNudge() {
  const { t } = useTranslation();
  const { homeCountryCode, notifPrefs, setNotifPref } = useSettings();
  const { records } = useRecords();
  const triedRef = useRef(false);

  useEffect(() => {
    if (notifPrefs.returnDetect) return; // 이미 켜짐
    if (triedRef.current) return; // 이번 세션 이미 시도

    const home = (homeCountryCode || 'KR').toUpperCase();
    const hasForeign = records.some((r) => {
      if (r.isMyPost === false) return false; // 타인 기록 제외
      const code = codeOf(r.countryName);
      return code != null && code !== home;
    });
    if (!hasForeign) return;

    triedRef.current = true;
    (async () => {
      const nudged = await AsyncStorage.getItem(NUDGED_KEY).catch(() => null);
      if (nudged === 'true') return;
      await AsyncStorage.setItem(NUDGED_KEY, 'true').catch(() => {});
      Alert.alert(
        t('returnDetect.nudgeTitle'),
        t('returnDetect.nudgeBody'),
        [
          { text: t('returnDetect.nudgeLater'), style: 'cancel' },
          { text: t('returnDetect.nudgeEnable'), onPress: () => setNotifPref('returnDetect', true) },
        ],
      );
    })();
  }, [records, homeCountryCode, notifPrefs.returnDetect, setNotifPref, t]);

  return null;
}
