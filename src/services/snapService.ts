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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DETECTOR_KEYS } from '../store/persist';

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
//
// ⚠️ 기본은 '이미 허용된 경우에만' 동작한다(권한 팝업을 띄우지 않는다).
// 앱 루트에 상주하는 감지기(SnapDetector·ArrivalNotifier·MomentNotifier·ReturnDetector)가
// 마운트 즉시 이 함수를 부르는데, 여기서 권한을 요청하면 **로그인도 하기 전 스플래시 위에**
// 위치 팝업이 뜬다. 맥락 없이 권한을 먼저 요구하는 것은 App Store 5.1.1 의 전형적 거부 사유다.
//
// 실제 요청은 '왜 필요한지가 화면에 드러난 시점'에만 한다 — 사용자가 기록 작성 화면을 연
// 경우(방문 국가 자동 입력이 그 화면의 목적)에만 { allowPrompt: true } 로 부른다.
export async function detectCurrentCountry(opts?: { allowPrompt?: boolean }): Promise<{
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
}> {
  try {
    const { status } = opts?.allowPrompt
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { countryCode: null, countryName: null, city: null };
    }

    // 이 함수의 결과는 국가(+도시명)까지만 쓰이므로 정확도보다 응답 속도가 중요하다.
    // getCurrentPositionAsync는 위치 관리자가 새 픽스를 잡을 때까지 기다리며, 실내에서는
    // 수 초씩 걸린다(expo 문서 명시). 그래서 순서를 둔다:
    //  1) 5분 이내의 마지막 위치가 있으면 즉시 사용 — 5분 사이에 국가가 바뀌는 일은 없다
    //  2) 없을 때만 새로 측정하되 Low(≈1km) — 국가·도시 판정에는 충분하고 Balanced보다 빠르다
    const location =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));

    if (!location) return { countryCode: null, countryName: null, city: null };

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

// ─── 도착 알림이 이번에 나갈 것인가 ───
//
// MomentNotifier가 '순간 기억 상주 알림을 한 번 양보할지'를 정할 때 쓴다. 양보의 전제는
// **도착 알림이 지금 나간다**는 것인데, ArrivalNotifier의 발송 기록이 영속화되면서
// 같은 나라 재방문·앱 재시작에서는 도착 알림이 나가지 않게 됐다. 전제가 깨진 채 양보만
// 남으면 그 회차에 **도착 알림도 순간 알림도 뜨지 않는다**(6차 QA 발견 17, 실측).
//
// 판정을 여기 둔 이유: MomentNotifier가 DETECTOR_KEYS.arrivalSentCountry를 직접 읽으면
// 키를 아는 곳이 셋이 된다. 이 작업 내내 사고는 전부 '키를 아는 곳이 여럿'에서 났다.
// 세 감지기가 모두 이 모듈을 import하므로 판정을 여기로 올려 호출부가 키를 모르게 한다.
//
// ⚠️ 이 함수가 보는 것은 **발송 기록 축 하나뿐**이다. 도착 알림이 실제로 나가려면
//    arrivalDetect 토글·알림 마스터·해외 판정·알림 권한도 함께 성립해야 하는데, 그 넷은
//    호출부(MomentNotifier)가 이미 ArrivalNotifier와 **같은 값**을 보고 있다
//    (같은 settingsStore, 같은 isAbroad·stayCountryCode 규칙, 권한이 없으면 양쪽 다 침묵).
//    그래서 여기서 중복 판정하지 않는다 — 하면 두 벌이 되어 어긋날 표면만 늘어난다.
// ⚠️ throw하지 않는다. 호출부인 MomentNotifier에는 catch가 없어(범위 밖) 여기서 새는 예외가
//    곧 unhandled rejection이 된다. 읽기 실패 시 null은 ArrivalNotifier가 같은 실패에서 읽는
//    값과 같으므로, 스토리지가 죽어도 두 감지기의 판정은 서로 짝이 맞는다.
export async function willArrivalNotify(countryCode: string | null): Promise<boolean> {
  if (!countryCode) return false; // 나라를 모르면 양보하지 않는다 — 겹치는 편이 침묵보다 낫다
  const sent = await AsyncStorage.getItem(DETECTOR_KEYS.arrivalSentCountry).catch(() => null);
  return sent !== countryCode.toUpperCase(); // ArrivalNotifier의 발송 조건과 같은 식
}

// ─── 알림 권한 요청 ───
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── 스냅 알림 발송 ───
// 즉시 스냅에도 고정 identifier를 준다. 예약분(SNAP_FOLLOWUP_NOTIF_ID)만 교체되게 해 두면
// SnapDetector의 '이미 보냈음' 저장이 실패했을 때 즉시 스냅만 콜드 스타트마다 새로 쌓인다.
// 호출부가 SnapDetector 한 곳뿐이고 한 체류에 최대 1건이라, 교체 동작으로 잃는 알림은 없다.
export const SNAP_INSTANT_NOTIF_ID = 'snap-instant';

export async function sendSnapNotification(countryName?: string): Promise<string> {
  const message = SNAP_MESSAGES[Math.floor(Math.random() * SNAP_MESSAGES.length)];
  const title = countryName
    ? `${countryName}에서 여행 중! ⚡`
    : '여행 중이네요! ⚡';

  const id = await Notifications.scheduleNotificationAsync({
    identifier: SNAP_INSTANT_NOTIF_ID, // 같은 id로 다시 보내면 트레이에서 교체된다(누적 방지)
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
// 고정 identifier로 예약한다 — 어떤 경로로 중복 호출되더라도 알림이 쌓이지 않고 교체된다.
// (SnapDetector의 '이미 보냈음' 영속값이 1차 방어, 이 id가 2차 방어. 영속 write가 실패해도
//  알림창에 follow-up은 항상 1개만 남는다. 즉시 스냅은 SNAP_INSTANT_NOTIF_ID가 같은 일을 한다.)
// momentService의 MOMENT_NOTIF_ID와 같은 관례.
export const SNAP_FOLLOWUP_NOTIF_ID = 'snap-followup';

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
    identifier: SNAP_FOLLOWUP_NOTIF_ID, // 같은 id로 다시 예약하면 이전 예약을 교체한다
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
// (2026-08-29 재확인 — trigger가 걸린 알림은 SNAP_FOLLOWUP_NOTIF_ID 하나뿐이고
//  도착·귀국·여행기억 알림은 전부 trigger: null 즉시 발송이라 예약 목록에 들어가지 않는다.
//  앞으로 trigger 기반 알림이 하나라도 늘면 이 전체 취소를 id 지정 취소로 바꿔야 한다.)
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
