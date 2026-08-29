/**
 * SnapDetector — 백그라운드에서 주기적으로 위치를 확인하고
 * 해외 감지 시 스냅 알림을 예약하는 컴포넌트.
 * App.tsx에서 Provider 내부에 마운트.
 *
 * 상태를 컴포넌트 ref에 두지 않는 이유(ReturnDetector와 같은 규칙):
 * - 스로틀 기준 시각은 모듈 스코프 → 리마운트로 4시간 간격이 초기화되지 않는다.
 * - '이번 해외 체류에서 이미 보냈는가'는 AsyncStorage 영속 → 콜드 스타트마다 false로
 *   리셋되면 해외에서 앱을 열 때마다 예약 알림이 하나씩 쌓인다(하루 5번 열면 5개).
 */
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { DETECTOR_KEYS } from '../store/persist';
import { COUNTRIES } from '../constants/countries';
import {
  detectCurrentCountry,
  isAbroad,
  scheduleRandomSnapNotification,
  sendSnapNotification,
  requestNotificationPermission,
  cancelScheduledSnapNotifications,
} from '../services/snapService';

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4시간마다 체크
// 위치 조회에 실패했을 때의 재시도 간격. 실패에까지 4시간을 물리면 공항 도착 직후
// 로밍이 없는 동안(reverseGeocode는 네트워크가 필요) 한 번 실패한 것만으로 그 여행의
// 첫 감지를 통째로 놓친다. 그렇다고 0으로 두면 AppState 'active'가 연달아 뜨는 상황
// (권한 팝업·카메라 복귀 등)에서 위치·네트워크를 난타하므로 1분만 띄운다.
// ⚠️ 되돌리기 식(now - CHECK_INTERVAL + RETRY_INTERVAL)이 과거 시각이 되려면
//    반드시 RETRY_INTERVAL < CHECK_INTERVAL 이어야 한다. 뒤집으면 영구 차단된다.
//    (scripts/snap-detect-guard.verify.mjs가 이 부등식을 검사한다)
const RETRY_INTERVAL = 60 * 1000;
// 이번 해외 체류에서 스냅을 이미 발송/예약했는가 — 귀국(또는 체류국 복귀) 때, 그리고
// 예약을 취소하는 토글/마스터 OFF 때 지운다. 두 지점 모두 없으면 값이 고착된다.
//
// 키 문자열 자체는 store/persist.ts의 DETECTOR_KEYS가 유일한 정의처다. 여기 복붙해 두면
// clearPersistedStores(데이터 초기화·계정 전환)가 지우는 키와 감지기가 쓰는 키가 갈라져
// '초기화 후 그 여행 내내 스냅 0건'이 된다 — 실제로 그렇게 빠져 있었다(6차 QA 1순위).
// 별칭만 두는 이유는 아래 코드의 가독성이며, 이 한 줄의 대응 관계를 가드가 대조한다.
const SNAP_SENT_KEY = DETECTOR_KEYS.snapSent;

// 스로틀 기준 시각 — 컴포넌트 ref가 아니라 모듈 스코프에 둬서 리마운트에도 4시간 간격이 유지되게 함
let lastCheckAt = 0;
// check() 재진입 방지 — ref가 아니라 모듈 스코프인 이유는 lastCheckAt과 같다.
// 컴포넌트 ref는 언마운트/리마운트로 리셋돼 진행 중인 조회와 새 조회가 겹칠 수 있다.
let checking = false;
// 설정 세대 — 토글·마스터·거주국·체류국이 바뀔 때마다 올린다.
// useEffect의 cleanup은 구독만 해제할 뿐 **이미 시작된 check() 프로미스를 취소하지 못한다.**
// 그래서 위치 조회를 기다리는 동안 사용자가 토글을 끄면, 옛 클로저가 뒤늦게 깨어나
// 방금 취소한 예약을 되살리고 방금 지운 기록까지 'true'로 되돌려 놓는다(= 고착 재발).
// check()는 시작 시점의 세대를 캡처해 두고 발송·예약·기록 직전마다 대조해, 다르면 전부 버린다.
// 이것도 모듈 스코프다 — ref면 리마운트로 세대가 0으로 돌아가 옛 호출이 되살아난다.
let generation = 0;

export default function SnapDetector() {
  const { homeCountryCode, snapEnabled, arrivalDetect, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();

  // 진행 중(active) 체류국 ISO2 코드 — 체류국은 해외로 치지 않는다
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    const name = activeStayGroup.countryName;
    if (!name) return null;
    return COUNTRIES.find((c) => c.name === name)?.term.split(' ')[0].toUpperCase() ?? null;
  }, [activeStayGroup]);

  useEffect(() => {
    // 이 effect가 도는 것은 곧 설정이 바뀌었다는 뜻이다. 세대를 올려 **이전 세대에서 시작돼
    // 아직 위치 조회 중인 check()** 를 전부 무효화한다. 아래 OFF 분기의 취소·삭제가
    // 뒤늦은 write에 덮이지 않게 하는 것이 목적이므로, 반드시 그 분기보다 먼저 올린다.
    generation += 1;
    const myGen = generation;

    // 알림 마스터 토글도 함께 검사 — 설정 화면은 마스터 OFF 시 스냅 토글을 꺼진 것으로
    // 표시하므로, 실제 발송도 일치해야 한다. 꺼질 때는 이미 예약된 랜덤 알림까지 취소.
    //
    // 발송 기록도 **여기서 반드시 함께 지운다.** 상태와 실제 예약은 항상 같이 움직여야 한다.
    // 안 지우면 '해외에서 수신 → 토글 OFF → 귀국(이 return 때문에 아래 거주국 분기까지 못 감)
    // → 다음 여행에서 다시 ON' 순서로 키가 'true'로 고착돼 그 여행 내내 스냅이 0건이 된다.
    // 영속화가 만든 회귀라서, 지우는 쪽이 옳다.
    // 켤 때 곧바로 재예약이 쏟아지지도 않는다 — lastCheckAt이 모듈 스코프라 4시간 스로틀이
    // 토글과 무관하게 살아 있고, 재예약되더라도 SNAP_FOLLOWUP_NOTIF_ID가 예약을 교체한다.
    if (!snapEnabled || !notifPrefs.master) {
      cancelScheduledSnapNotifications();
      AsyncStorage.removeItem(SNAP_SENT_KEY).catch(() => {});
      return;
    }

    // 내가 시작된 뒤 설정이 바뀌었는가 — 바뀌었으면 이 호출의 결과는 전부 버려야 한다.
    const stale = () => myGen !== generation;

    const check = async () => {
      // 재진입 방지 — 스로틀 선점은 '순차' 중복만 막고, getItem → 발송·예약 → setItem 구간의
      // 원자성은 주지 못한다. detectCurrentCountry에는 타임아웃이 없어(위치 픽스·역지오코딩
      // 모두 무한 대기 가능) 조회가 CHECK_INTERVAL을 넘기면 두 호출이 나란히 'null'을 읽고
      // 각각 발송한다. MomentNotifier의 checkingRef와 같은 가드다.
      if (checking) return;
      const now = Date.now();
      // 마지막 체크 후 4시간 미경과 시 스킵.
      // 스로틀 판정을 잠금 획득보다 **먼저** 한다 — 그래야 try 안의 코드가 전부 '선점 이후'가
      // 되어, catch에서 "선점했던가?"를 따로 기억할 필요가 없다.
      if (now - lastCheckAt < CHECK_INTERVAL) return;
      checking = true;
      // 먼저 선점해 둔다 — 포그라운드 전환이 연달아 오면 위치 조회가 겹치기 때문
      lastCheckAt = now;
      // 사용자에게 보이는 알림을 실제로 냈는가. 선점을 소모할지 되돌릴지의 유일한 기준이다.
      let emitted = false;
      // 이 호출을 판정 없이 끝낼 때 부른다. 선점(lastCheckAt)은 '판정했는가'가 아니라
      // **'사용자에게 보이는 알림을 냈는가'** 로만 소모한다:
      //  · 아무것도 안 보였으면 되돌린다. 안 그러면 스로틀만 까먹고 다음 감지가 4시간 뒤로
      //    밀리는데, 세대 무효는 설정을 바꾼 직후에 나므로 하필 그때가 감지 공백이 된다.
      //  · 이미 보였으면 소모한다. 되돌리면 RETRY_INTERVAL(60초) 뒤에 같은 알림이 또 나가서,
      //    총 횟수는 같아도 사용자 눈에는 60초 만의 중복 발송이라 버그로 보인다.
      // 예약을 만들었다가 취소한 것은 '보인 것'이 아니다 — 취소하면 트레이에 흔적이 없고
      // 고정 identifier가 중복 예약도 막으므로, 그 경로에서는 되돌리는 쪽이 맞다.
      const abort = () => { if (!emitted) lastCheckAt = now - CHECK_INTERVAL + RETRY_INTERVAL; };
      try {
        const { countryCode, countryName } = await detectCurrentCountry();
        if (!countryCode) {
          // 4시간 스로틀은 '성공했을 때만' 센다. 실패는 되돌리되 RETRY_INTERVAL 만큼만 띄운다.
          abort();
          return;
        }
        // 위치 조회는 타임아웃이 없어 수 초~수 분이 걸린다. 그 사이 토글이 꺼졌다면
        // 아래 판정은 이미 무효다 — 판정하기 전에 먼저 빠져나간다.
        if (stale()) { abort(); return; }

        if (isAbroad(countryCode, homeCountryCode, stayCountryCode)) {
          // 영속값이라 앱을 껐다 켜도 '이미 보냈음'이 유지된다 → 한 체류당 예약은 1건
          const sent = await AsyncStorage.getItem(SNAP_SENT_KEY).catch(() => null);
          if (sent !== 'true') {
            // 처음 해외 감지
            const hasPermission = await requestNotificationPermission();
            // 권한 팝업이 떠 있는 동안 사용자가 설정으로 가서 토글을 끌 수 있다.
            // 발송·예약을 하기 전 마지막 관문이다.
            if (hasPermission && stale()) { abort(); return; }
            if (hasPermission) {
              // 도착 알림(arrivalDetect)이 켜져 있으면 '도착 순간'은 도착 알림이 담당 —
              // 즉시 스냅은 생략해 겹치지 않게 하고, 스냅은 1~3시간 뒤 지연분으로만 온다.
              if (!arrivalDetect) {
                await sendSnapNotification(countryName || undefined);
                emitted = true; // 트레이에 떴다 — 여기부터는 선점을 소모한다
              }
              await scheduleRandomSnapNotification(countryName || undefined, 60, 180);
              // 발송과 예약 사이에도 토글은 꺼질 수 있다. 마지막으로 한 번 더 대조해서,
              // 무효가 됐으면 방금 만든 예약을 되돌리고 기록도 남기지 않는다.
              // 기록을 남기면 그것이 곧 '토글 꺼진 채 true 고착'(1차 발견 1의 재발)이다.
              // 이미 트레이로 나간 즉시 스냅만은 회수하지 못한다 — 창을 좁힐 뿐이다.
              if (stale()) {
                cancelScheduledSnapNotifications();
                abort();
                return;
              }
              await AsyncStorage.setItem(SNAP_SENT_KEY, 'true').catch(() => {});
            }
          }
        } else {
          // 본국 복귀 시 리셋 + 아직 안 뜬 예약(follow-up) 알림 취소
          // (해외 감지 후 1~3시간 안에 귀국하면 집인데도 예약분이 뜨던 문제 방지)
          const sent = await AsyncStorage.getItem(SNAP_SENT_KEY).catch(() => null);
          if (sent === 'true') {
            cancelScheduledSnapNotifications();
            await AsyncStorage.removeItem(SNAP_SENT_KEY).catch(() => {});
          }
        }
      } catch (e) {
        // 알림 권한·발송·예약 API는 throw할 수 있는데(서비스 계층에 try/catch가 없다)
        // 그냥 두면 두 가지가 동시에 난다: ① check()를 await 없이 부르므로 unhandled
        // rejection ② 선점만 소모돼 다음 감지가 4시간 뒤로 밀린다(발견 10과 같은 증상).
        // 여기서 삼키고, 같은 규칙으로 선점을 정리한다.
        //
        // 선점 정리를 **로그보다 먼저** 한다. abort()는 순수 대입이라 throw할 수 없지만
        // console.warn은 throw할 수 있고(원격 디버거·커스텀 콘솔), 그러면 catch 안에서
        // 다시 예외가 나 abort()가 통째로 건너뛰어진다 — 고치려던 발견 12가 그대로 재발한다.
        abort();
        // 삼키면 관측성이 0이 된다 — 이 컴포넌트는 UI가 없어서 "알림이 안 온다" 외에는
        // 증상이 드러나지 않고, 그마저 정상(스로틀·이미 발송)과 구분되지 않는다.
        // 개발 빌드에서만 남겨 실기기 검증 때 예외 경로가 실제로 도는지 보이게 한다.
        if (__DEV__) console.warn('[SnapDetector] check() 예외 — 선점 정리 후 계속:', e);
      } finally {
        checking = false;
      }
    };

    // 앱 포그라운드 복귀 시 체크
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    // 최초 마운트 시 체크
    check();

    return () => subscription.remove();
  }, [snapEnabled, arrivalDetect, notifPrefs.master, homeCountryCode, stayCountryCode]);

  return null; // UI 없음
}
