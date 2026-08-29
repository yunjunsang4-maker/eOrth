/**
 * ArrivalNotifier — 해외 도착 감지 시 '(나라) 여행 중' 로컬 알림을 1회 발송.
 * arrivalDetect 토글 + 알림 master가 켜져 있을 때만 동작. SnapDetector와 동일 패턴:
 * 포그라운드/마운트 시 위치 확인 → 첫 해외 감지 시 알림 → 귀국하면 리셋(다음 여행에 재동작).
 * App.tsx에 마운트.
 *
 * 발송 여부를 boolean이 아니라 '알린 나라 코드'로 AsyncStorage에 영속한다:
 * - 컴포넌트 ref면 콜드 스타트마다 false로 리셋돼 여행 내내 앱 켤 때마다 다시 알린다.
 * - 나라 코드로 두면 일본→대만처럼 여행 중 나라가 바뀔 때 새 나라 기준으로 다시 1회 알린다.
 */
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { DETECTOR_KEYS } from '../store/persist';
import { detectCurrentCountry, isAbroad, requestNotificationPermission } from '../services/snapService';
import { countryNameToCode } from '../utils/momentMatch';

// 앱을 포그라운드로 열 때마다 체크(귀국 감지와 동일). 2분 디바운스로 위치 조회 남발만 방지.
const CHECK_INTERVAL = 2 * 60 * 1000;
// 위치 조회 실패 시의 재시도 간격 — 실패에까지 스로틀을 물리면 도착 직후 네트워크가 없는
// 동안의 실패 한 번으로 감지 기회를 날린다. 다만 0이면 포그라운드 연타 시 위치 조회를
// 난타하므로 30초는 띄운다(SnapDetector와 같은 규칙, 간격만 이 화면의 2분 주기에 맞춤).
// ⚠️ 되돌리기 식이 과거 시각이 되려면 RETRY_INTERVAL < CHECK_INTERVAL 이어야 한다(뒤집으면 영구 차단).
const RETRY_INTERVAL = 30 * 1000;
// 이번 도착에 대해 알림을 보낸 나라 ISO2 코드 — 거주국·체류국 복귀 때, 그리고 토글/마스터
// OFF 때 지운다. 후자가 없으면 '해외에서 수신 → OFF → 귀국 → 다음에 같은 나라로 가서 ON'
// 순서에서 값이 고착돼 그 여행 내내 도착 알림이 0건이 된다(SnapDetector와 같은 계열의 함정).
//
// 키 문자열은 store/persist.ts의 DETECTOR_KEYS가 유일한 정의처다(SnapDetector와 같은 규칙).
// 이 키는 MomentNotifier의 양보 판정도 참조하는데, 그쪽은 키를 모른 채
// snapService.willArrivalNotify()를 통해서만 본다 — 키를 아는 곳을 늘리지 않기 위해서다.
const ARRIVAL_SENT_COUNTRY_KEY = DETECTOR_KEYS.arrivalSentCountry;

// 스로틀 기준 시각 — 컴포넌트 ref가 아니라 모듈 스코프(리마운트에도 간격 유지, ReturnDetector와 동일)
let lastCheckAt = 0;
// check() 재진입 방지 — 이 감지기는 스로틀이 2분이라 위치 조회가 그보다 오래 걸리면
// (공항 실내·로밍 미개통) 두 호출이 겹쳐 도착 알림이 2건 나간다. 모듈 스코프인 이유는 lastCheckAt과 같다.
let checking = false;
// 설정 세대 — SnapDetector와 같은 규칙(두 감지기의 상태 표현을 일부러 일치시킨다).
// useEffect cleanup은 이미 시작된 check() 프로미스를 취소하지 못하므로, 위치 조회를 기다리는
// 동안 토글이 꺼지면 옛 클로저가 뒤늦게 알림을 보내고 방금 지운 기록을 되살린다.
// check()가 시작 시점의 세대를 캡처해 발송·기록 직전마다 대조해서 무효분을 버린다.
let generation = 0;

export default function ArrivalNotifier() {
  const { t } = useTranslation();
  const { homeCountryCode, arrivalDetect, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();

  // 진행 중 체류국은 해외로 치지 않는다 (다른 감지기와 동일 규칙)
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    return countryNameToCode(activeStayGroup.countryName);
  }, [activeStayGroup]);

  useEffect(() => {
    // 설정이 바뀌었다는 뜻이므로 세대를 올려 진행 중인 옛 check()를 무효화한다.
    // 아래 OFF 분기의 삭제가 뒤늦은 write에 덮이지 않도록 반드시 그보다 먼저 올린다.
    generation += 1;
    const myGen = generation;

    // 꺼져 있는 동안에는 위치를 보지 않으므로 '복귀했으니 지운다'가 영영 실행되지 않는다.
    // 그래서 끄는 시점에 기록을 비워 고착을 막는다. 대가는 '해외에서 껐다가 다시 켜면 같은
    // 나라 도착 알림이 또 온다'이고, **한 번으로 끝나지 않는다** — CHECK_INTERVAL이 2분이라
    // OFF/ON을 반복하면 2분마다 다시 발송될 수 있다(6차 QA 실측: OFF/ON 3회 → 알림 4건).
    // 그래도 이 대가를 택했다. 사용자가 방금 스스로 켠 기능이고 다시 끄면 멈추는 반면,
    // 고착은 사용자가 알아채지도 되돌리지도 못한 채 그 여행 내내 침묵한다.
    //
    // 검토했다가 넣지 않은 것: '이번 앱 세션에서 알린 나라'를 모듈 스코프에 하나 더 두면
    // (토글은 effect만 재실행할 뿐 모듈 스코프를 리셋하지 못하므로) 위 반복이 막힌다.
    // 넣지 않은 이유는 **그 모양이라면** 그 변수도 지워야 하는 상태이기 때문이다. 지우는
    // 지점을 여기(OFF 분기)에 두면 반복이 되살아나 아무것도 못 막고, 두지 않으면 '해외에서
    // OFF → (앱이 죽지 않은 채) 귀국 → 같은 나라로 다시 가서 ON'에서 값이 남아 침묵한다.
    //
    // ⚠️ 다만 이것은 '지워야 하는 플래그' 한 가지 모양에만 해당한다 — **일반화하지 말 것.**
    // 8차 QA가 반례를 냈다: 지우지 않고 **시간이 지나면 만료되는(TTL) 메모**로 두면 삭제
    // 지점 자체가 없어져 위 딜레마가 성립하지 않고, 모델 실험에서 OFF/ON 3회 → 1건으로
    // 줄면서 침묵도 열리지 않았다. 지금 안 넣은 건 설계가 불가능해서가 아니라 **발견 7이
    // 낮음(증상=중복)이고 이 코드가 이미 정식 OTA로 나갔기 때문**이다.
    // 다시 손댈 이유가 생기면 TTL 안부터 검토하라 — 재조사 금지 대상이 아니다.
    if (!arrivalDetect || !notifPrefs.master) {
      AsyncStorage.removeItem(ARRIVAL_SENT_COUNTRY_KEY).catch(() => {});
      return;
    }

    // 내가 시작된 뒤 설정이 바뀌었는가 — 바뀌었으면 이 호출의 결과는 전부 버려야 한다.
    const stale = () => myGen !== generation;

    const check = async () => {
      // 재진입 방지 — getItem → 발송 → setItem이 원자적이지 않다. 위치 조회에 타임아웃이 없어
      // (snapService.detectCurrentCountry) 조회가 2분을 넘기면 두 호출이 같이 null을 읽고
      // 도착 알림을 2건 보낸다. MomentNotifier의 checkingRef와 같은 가드다.
      if (checking) return;
      const now = Date.now();
      // 스로틀 판정을 잠금 획득보다 먼저 한다 — try 안이 전부 '선점 이후'가 되어
      // catch에서 선점 여부를 따로 기억할 필요가 없다(SnapDetector와 같은 구조).
      if (now - lastCheckAt < CHECK_INTERVAL) return;
      checking = true;
      // 먼저 선점 — 포그라운드 전환이 연달아 오면 위치 조회가 겹친다
      lastCheckAt = now;
      // 사용자에게 보이는 알림을 실제로 냈는가. 선점을 소모할지 되돌릴지의 유일한 기준이다.
      let emitted = false;
      // 판정 없이 끝날 때 부른다. 선점은 '판정했는가'가 아니라 '보이는 알림을 냈는가'로만
      // 소모한다 — 아무것도 안 보였으면 되돌려서(설정 변경 직후가 감지 공백이 되지 않게),
      // 이미 보였으면 소모한다(되돌리면 RETRY_INTERVAL 뒤에 같은 알림이 또 나간다).
      // SnapDetector와 문장까지 같은 규칙이다.
      const abort = () => { if (!emitted) lastCheckAt = now - CHECK_INTERVAL + RETRY_INTERVAL; };
      try {
        const { countryCode, countryName } = await detectCurrentCountry();
        if (!countryCode) {
          // 스로틀은 '성공했을 때만' 센다. 실패는 되돌리되 RETRY_INTERVAL 만큼만 띄운다.
          abort();
          return;
        }
        // 위치 조회 중에 토글이 꺼졌다면 아래 판정은 이미 무효다(SnapDetector와 같은 지점).
        if (stale()) { abort(); return; }

        const sentCountry = await AsyncStorage.getItem(ARRIVAL_SENT_COUNTRY_KEY).catch(() => null);

        if (isAbroad(countryCode, homeCountryCode, stayCountryCode)) {
          // 저장 형식을 대문자로 고정해 두 값의 비교가 표기 흔들림에 걸리지 않게 한다
          // (geo.isoCountryCode의 대소문자는 기기·OS마다 다르게 오는 경우가 있다)
          const cur = countryCode.toUpperCase();
          if (sentCountry !== cur) {
            // 변수명을 SnapDetector와 맞춘다 — 두 감지기의 관문 문장이 글자까지 같아야
            // 한쪽만 조건이 어긋나는 사고(그리고 가드의 문장 대조)가 성립한다.
            const hasPermission = await requestNotificationPermission();
            // 권한 팝업이 떠 있는 동안 토글이 꺼질 수 있다 — 발송 전 마지막 관문.
            if (hasPermission && stale()) { abort(); return; }
            if (hasPermission) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: t('arrivalDetect.notifTitle', { country: countryName || t('arrivalDetect.abroad') }),
                  body: t('arrivalDetect.notifBody'),
                  data: { type: 'arrival' },
                  sound: true,
                },
                trigger: null, // 즉시 발송
              });
              emitted = true; // 트레이에 떴다 — 여기부터는 선점을 소모한다
              // 발송 직후에 꺼졌다면 기록을 남기지 않는다. 남기면 OFF 분기가 방금 지운 값을
              // 되살리는 셈이라 '꺼진 채 고착 → 다음 여행 내내 침묵'이 된다.
              // 대신 다음에 켰을 때 같은 나라 알림이 한 번 더 올 수 있는데, 고착보다 낫다.
              // abort()는 emitted가 true라 선점을 소모한다 — 60초 뒤 중복 발송을 막는다.
              if (stale()) { abort(); return; }
              await AsyncStorage.setItem(ARRIVAL_SENT_COUNTRY_KEY, cur).catch(() => {});
            }
          }
        } else if (sentCountry !== null) {
          // 거주국·체류국 복귀 시 리셋 → 다음 여행에서 다시 알림 (값이 있을 때만 write)
          await AsyncStorage.removeItem(ARRIVAL_SENT_COUNTRY_KEY).catch(() => {});
        }
      } catch (e) {
        // 알림 권한·발송 API가 throw하면 그냥 두었을 때 unhandled rejection이 되고
        // (check()를 await 없이 부른다) 선점만 소모돼 2분 감지 공백이 생긴다.
        // 삼키고 같은 규칙으로 선점을 정리한다(SnapDetector와 동일).
        // 선점 정리가 먼저다 — console.warn이 throw하면(원격 디버거 등) abort()를 건너뛰어
        // 발견 12가 재발한다. abort()는 순수 대입이라 throw하지 않는다(SnapDetector와 동일).
        abort();
        // 삼킨 예외는 개발 빌드에서만 남긴다 — 없으면 실기기에서도 이 경로를 관측할 수 없다.
        if (__DEV__) console.warn('[ArrivalNotifier] check() 예외 — 선점 정리 후 계속:', e);
      } finally {
        checking = false;
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [arrivalDetect, notifPrefs.master, homeCountryCode, stayCountryCode, t]);

  return null; // UI 없음
}
