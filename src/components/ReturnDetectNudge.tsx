/**
 * ReturnDetectNudge — 첫 해외 여행 기록이 감지되면 '귀국 감지' 알림을 켜라고 한 번 권한다.
 *
 * - returnDetect가 이미 켜져 있으면 미동작.
 * - 원샷: AsyncStorage 영속 플래그로 기기당 1회만 안내(거부해도 재등장 없음).
 * - 위치 권한은 사용자가 '켜기'를 눌러 returnDetect를 켠 뒤 ReturnDetector가 요청 —
 *   맥락 없이 위치 권한을 먼저 묻지 않는다(기본 OFF 유지 + 맥락 넛지).
 */
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';

const NUDGED_KEY = '@eorth/returnDetect/nudged';

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
