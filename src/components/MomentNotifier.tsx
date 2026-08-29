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
import { detectCurrentCountry, isAbroad, requestNotificationPermission, willArrivalNotify } from '../services/snapService';
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
  // 마지막으로 조회한 나라 코드 — abroadRef와 짝. 양보 판정(willArrivalNotify)이 나라를 알아야
  // 하는데 위치 조회는 4시간 스로틀이라 매 회차 값이 있지 않다. 판정 캐시와 같이 갱신·같이 무효화.
  const countryCodeRef = useRef<string | null>(null);
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
      countryCodeRef.current = null;
      return;
    }

    // 거주국·체류국이 바뀌면 직전 판정은 무효 — 다음 check에서 재판정
    abroadRef.current = null;
    countryCodeRef.current = null;
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
          if (countryCode) {
            abroadRef.current = isAbroad(countryCode, homeCountryCode, stayCountryCode);
            countryCodeRef.current = countryCode;
          }
          // countryCode를 못 얻으면 직전 판정 유지(오프라인 대응)
        }
        if (abroadRef.current === true) {
          // 도착 알림(arrivalDetect)이 켜져 있으면 '도착 순간'(첫 감지) 한 번은 게시를 건너뛴다 —
          // 도착 알림과 동시에 뜨지 않게 하고, 다음 포그라운드부터 순간 기억 알림을 유지한다.
          //
          // 단 **도착 알림이 실제로 나갈 때만** 양보한다. ArrivalNotifier의 발송 기록이
          // 영속화되면서 같은 나라 재방문·앱 재시작에서는 도착 알림이 나가지 않게 됐고,
          // 그때도 양보하면 그 회차에 도착 알림도 순간 알림도 뜨지 않는다(6차 QA 발견 17).
          // 판정은 snapService에 있다 — 이 파일은 도착 감지기의 영속 키를 몰라야 한다.
          //
          // ⚠️ 남는 경쟁: ArrivalNotifier도 같은 'active' 이벤트로 돌기 때문에, 그쪽이 발송·기록을
          //    먼저 끝내면 여기서는 '이미 알린 나라'로 보여 양보하지 않고 함께 게시한다(알림 2개).
          //    판정을 이 분기의 맨 앞에 둬서 창을 좁혔지만 완전히 닫지는 못한다. 닫으려면 감지기
          //    사이에 '방금 보냈다' 신호를 하나 더 두어야 하는데, 그 신호를 지우는 지점이 또
          //    늘어나고 이 작업의 사고는 전부 거기서 났다. 겹치는 쪽이 침묵보다 낫다.
          //
          //    **이것은 알려진 잔여 경쟁이며 결함이 아니다 — 신호를 추가해 '고치지' 마라.**
          //    (재검토해서 같은 결론을 유지했다. 근거 셋)
          //    ① 실패 방향이 안전하다. 이 경쟁이 실현되면 알림이 겹칠 뿐 사라지지 않는다.
          //       반대로 신호를 추가하면 그 신호가 안 지워지는 경로에서 **침묵**이 나는데,
          //       그게 정확히 이 작업에서 반복해 낸 사고(발송 기록 고착)의 형태다.
          //    ② 흔한 회차에서는 순서가 사실상 확정돼 있다. 위 위치 조회가 4시간 스로틀에
          //       걸리면 여기서는 await가 저장소 읽기 하나뿐이고, ArrivalNotifier는 매번
          //       GPS·역지오코딩을 기다린다 → 그쪽이 기록하기 훨씬 전에 여기 판정이 끝난다.
          //       경쟁이 실제로 열리는 것은 양쪽이 함께 위치를 조회하는 회차뿐이다.
          //    ③ 겹치더라도 한 번뿐이다. 겹친 회차에도 armedRef는 서지 않으므로 다음
          //       포그라운드부터는 정상 흐름으로 돌아간다.
          const yieldToArrival = arrivalDetect && !armedRef.current && (await willArrivalNotify(countryCodeRef.current));
          if (yieldToArrival) {
            armedRef.current = true;
          } else if (!(await isMomentNotificationPresented())) {
            const ok = await requestNotificationPermission();
            if (ok) await postMomentNotification(t('moments.notifTitle'), t('moments.notifBody'));
          }
        } else if (abroadRef.current === false) {
          armedRef.current = false; // 귀국 → 리셋(다음 여행에서 다시 도착 순간 스킵)
          await dismissMomentNotification(); // 귀국 → 제거
        }
      } catch (e) {
        // 알림 권한·게시·해제 API(momentService·snapService)는 throw할 수 있고 서비스 계층에
        // try/catch가 없다. 여기서 삼키지 않으면 check()를 await 없이 부르므로(아래 두 호출부)
        // 곧바로 unhandled rejection이 된다. 네 감지기가 같은 모양이어야 한다는 원칙에 따라
        // SnapDetector·ArrivalNotifier의 catch와 문장을 맞췄다.
        //
        // 다만 저 둘의 abort()(스로틀 선점 되돌리기)에 해당하는 것은 **일부러 두지 않았다.**
        //  · 이 파일에는 RETRY_INTERVAL이 없다. 위치 조회가 null을 돌려준 경우도 선점을
        //    그대로 소모하고 직전 판정을 유지한다(위 '오프라인 대응' 주석). 예외는 그것과
        //    같은 '판정을 못 얻었다'는 상태이므로, 예외에서만 되돌리면 두 실패 경로가
        //    이 파일 안에서 갈라진다.
        //  · 감지 공백도 생기지 않는다. 첫 판정을 얻기 전이면 abroadRef가 null로 남아
        //    위 스로틀 조건(`=== null ||`)이 다음 포그라운드에서 곧바로 다시 조회한다.
        //    이미 판정이 있으면 그 값으로 상주 알림 유지·해제가 계속 돈다.
        if (__DEV__) console.warn('[MomentNotifier] check() 예외 — 삼키고 계속:', e);
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
