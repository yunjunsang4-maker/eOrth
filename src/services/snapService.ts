/**
 * 스냅 서비스 — 해외 감지 + 알림 + 타이머
 *
 * 흐름:
 * 1. expo-location으로 현재 좌표 → reverseGeocode → 국가코드
 * 2. 거주국(settingsStore.homeCountry)과 비교
 * 3. 해외라면 랜덤 딜레이 후 로컬 알림 발송
 * 4. 알림 탭 → SnapRecord 화면으로 이동
 */

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

// ─── 알림 채널 설정 ───
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── 스냅 알림 문구 (랜덤) ───
const SNAP_MESSAGES = [
  '지금 이 순간, 어디에 있나요? 📸',
  '여행 중이네요! 지금 뭐 보고 있어요? 👀',
  '이 순간을 놓치지 마세요! ⚡',
  '3, 2, 1... 지금 바로 찍어보세요! 🔥',
  '지금 그곳의 풍경이 궁금해요! 🌍',
  '여행지에서의 리얼한 순간을 남겨봐요! ✨',
  '꾸미지 않은 지금 이 순간! 📷',
  '지금 눈앞에 뭐가 보이나요? 🧭',
];

// ─── 현재 국가 감지 ───
export async function detectCurrentCountry(): Promise<{
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
}> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { countryCode: null, countryName: null, city: null };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [geo] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (!geo) return { countryCode: null, countryName: null, city: null };

    return {
      countryCode: geo.isoCountryCode || null,
      countryName: geo.country || null,
      city: geo.city || geo.district || null,
    };
  } catch {
    return { countryCode: null, countryName: null, city: null };
  }
}

// ─── 해외 여부 판단 ───
// 거주국은 물론, 진행 중 체류국(장기체류 active)도 '홈'으로 취급해 해외 알림을 억제한다.
// stayCountryCode: 진행 중(active) 체류국 ISO2 코드. 없거나 null이면 기존 동작 유지.
export function isAbroad(
  currentCountryCode: string | null,
  homeCountryCode: string,
  stayCountryCode?: string | null
): boolean {
  if (!currentCountryCode) return false;
  const cur = currentCountryCode.toUpperCase();
  if (cur === homeCountryCode.toUpperCase()) return false;
  if (stayCountryCode && cur === stayCountryCode.toUpperCase()) return false;
  return true;
}

// ─── 알림 권한 요청 ───
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── 스냅 알림 발송 ───
export async function sendSnapNotification(countryName?: string): Promise<string> {
  const message = SNAP_MESSAGES[Math.floor(Math.random() * SNAP_MESSAGES.length)];
  const title = countryName
    ? `${countryName}에서 여행 중! ⚡`
    : '여행 중이네요! ⚡';

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: message,
      data: { type: 'snap', timestamp: Date.now() },
      sound: true,
    },
    trigger: null, // 즉시 발송
  });

  return id;
}

// ─── 예약 스냅 알림 (랜덤 딜레이) ───
export async function scheduleRandomSnapNotification(
  countryName?: string,
  minDelayMinutes = 30,
  maxDelayMinutes = 180
): Promise<string | null> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return null;

  const delayMs =
    (minDelayMinutes + Math.random() * (maxDelayMinutes - minDelayMinutes)) *
    60 *
    1000;
  const delaySec = Math.round(delayMs / 1000);

  const message = SNAP_MESSAGES[Math.floor(Math.random() * SNAP_MESSAGES.length)];
  const title = countryName
    ? `${countryName}에서 여행 중! ⚡`
    : '여행 중이네요! ⚡';

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: message,
      data: { type: 'snap', timestamp: Date.now() + delayMs },
      sound: true,
    },
    trigger: { seconds: delaySec, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
  });

  return id;
}

// ─── 예약 알림 취소 ───
// 스냅 토글/알림 마스터를 끄면 이미 예약된 랜덤 알림(최대 3시간 후)도 취소해야
// "껐는데 알림이 온다"는 불일치가 없다. 이 앱의 예약 알림은 스냅뿐이라 전체 취소로 충분.
export async function cancelScheduledSnapNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // 취소 실패는 무시 (권한 회수 등) — 다음 토글 변경 때 재시도됨
  }
}

// ─── 촬영 지연시간 포맷 ───
export function formatLateSeconds(seconds?: number): string {
  if (!seconds || seconds <= 0) return '즉시 촬영';
  if (seconds < 60) return `${seconds}초 후 촬영`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}분 ${s}초 후 촬영` : `${m}분 후 촬영`;
}

export const SNAP_MESSAGES_LIST = SNAP_MESSAGES;
