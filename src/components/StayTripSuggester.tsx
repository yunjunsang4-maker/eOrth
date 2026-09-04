/**
 * StayTripSuggester — 체류 중 주변국 여행을 사진에서 찾아 카드 생성을 제안 (설계 §4)
 *
 * 다른 감지기 4종과 같은 자리(App.tsx 루트)·같은 트리거(포그라운드)지만 판정 재료가
 * GPS 이벤트가 아니라 **최근 14일 사진**이다. 여행 중 앱을 한 번도 안 열어도, 체류
 * 일시정지가 안 돌았어도(프로필 탭 진입에만 걸려 있다) 사진만 있으면 잡힌다.
 *
 * 게이트: 진행 중 체류가 있고 사진 권한이 전체 허용일 때만.
 * 권한 팝업: **위치·사진은 조회만 한다**(`detectCurrentCountry()`를 allowPrompt 없이 호출,
 *         스캐너도 getPermissionsAsync만 — App Store 5.1.1 방어). 다만 **알림 권한은 예외**로,
 *         발송 직전에 `requestNotificationPermission()`을 부르므로 알림을 한 번도 허용한 적 없는
 *         사용자는 여기서 시스템 팝업을 볼 수 있다 — 감지기 4종이 모두 같은 자리에서 같은 함수를
 *         쓰는 관례라 여기만 다르게 하지 않는다.
 * 스로틀: 12시간(영속 — 콜드 스타트에도 유지). **스캔·저장 단계**에서 예외가 나면 checkedAt을
 *         갱신하지 않아 다음 포그라운드에 재시도한다(비용이 좌표 조회 수십 회라 되돌리기 장치가
 *         필요 없다). 반면 **알림 단계**의 예외는 checkedAt·pending이 이미 저장된 뒤라 재시도되지
 *         않고 그 알림은 유실된다 — 알림 한 건 때문에 스캔 비용을 다시 치르지 않으려는 선택이다.
 *         (배너는 pending에 남아 있으므로 사용자가 제안 자체를 잃지는 않는다)
 * 알림: 새 제안 키가 생겼을 때만, 고정 identifier로 교체 발송(트레이 누적 방지).
 *       알림 토글이 꺼져 있어도 스캔·배너는 동작한다 — 토글은 발송만 막는다.
 *       그 결과 **토글이 꺼진 동안 발견된 키는 나중에 토글을 켜도 알림이 다시 나가지 않는다**
 *       (이미 pending에 있어 `added`가 빈다). 배너로는 정상적으로 보이므로 의도된 동작으로 둔다.
 *
 * ReturnDetector처럼 재진입 잠금 외의 세대 무효화·abort는 두지 않는다. 저장하는 것이 발송
 * 기록이 아니라 제안 목록이고 매 검사가 덮어쓰므로 고착이라는 상태가 없다. 예외 처리만
 * 네 감지기와 같은 모양이다(snap-detect-guard 규칙 8).
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from '../i18n';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { detectCurrentCountry, requestNotificationPermission } from '../services/snapService';
import { countryNameToCode } from '../utils/momentMatch';
import { countryLabel } from '../utils/countryLabel';
import { collectImportedAssetIds } from '../utils/scanSampling';
import { poolAssetIds, syncTripPools } from '../utils/tripPhotoPool';
import { scanRecentPhotoCountries } from '../utils/recentPhotoCountryScan';
import { suggestStayTrips, RECENT_WINDOW_MS } from '../utils/stayTripSuggest';
import {
  loadPending, savePending, loadDismissed, loadCheckedAt, saveCheckedAt, mergePending,
} from '../utils/stayTripSuggestStore';

// 검사 간격 — 사진 스캔이라 위치 감지기(2분)보다 훨씬 드물게. 주말 여행 뒤 월요일에
// 앱을 열면 한 번 돌고, 그날은 다시 돌지 않는다.
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
// 고정 identifier — 같은 값으로 다시 보내면 앞 알림을 교체한다(스냅·순간 알림과 같은 관례)
const STAY_TRIP_SUGGEST_NOTIF_ID = 'stay-trip-suggest';
// 재진입 방지 — 스캔이 수 초 걸리는 동안 포그라운드 전환이 연달아 와도 한 번만 돈다
let checking = false;

export default function StayTripSuggester() {
  const { homeCountryCode, notifPrefs } = useSettings();
  const { activeStayGroup, records, tripGroups } = useRecords();
  // 기록·카드 목록은 매 기록마다 바뀐다 — deps에 넣으면 effect가 난사된다. 스캔 시점의
  // 최신 목록만 있으면 되므로 ref로 본다(TravelImportScreen의 recordsRef와 같은 이유).
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const tripGroupsRef = useRef(tripGroups);
  tripGroupsRef.current = tripGroups;

  // 진행 중(종료 아님) 체류국 — paused도 포함한다. 체류국 복귀 판정은 사진·위치가 하지
  // 체류 상태 머신(프로필 탭 진입에만 걸림)에 기대지 않는다.
  const stayCountryCode = useMemo(() => {
    if (!activeStayGroup?.stay || activeStayGroup.stay.status === 'ended') return null;
    return countryNameToCode(activeStayGroup.countryName);
  }, [activeStayGroup]);
  const notifyEnabled = notifPrefs.master && notifPrefs.stayTripSuggest;

  // 직전에 관측한 체류국. 초기값 undefined = '아직 모른다'이며 null = '체류 없음'과 구분한다.
  const prevStayRef = useRef<string | null | undefined>(undefined);

  // 체류가 끝나면 대기 제안을 비운다 — 체류 카드가 없는데 "체류 중 여행" 제안이 남는 것을 막는다.
  //
  // ⚠️ `stayCountryCode === null`만 보고 지우면 안 된다. recordStore의 tripGroups는 초기값이
  //    빈 배열이고 hydrate가 비동기라(`persist.ts`의 usePersistence), 콜드 스타트의 첫 커밋은
  //    체류가 멀쩡히 있어도 **항상** '체류 없음'으로 보인다. 그대로 지우면 앱을 껐다 켤 때마다
  //    제안이 통째로 삭제되는데, checkedAt은 남아 있어 최대 12시간 복구되지 않고 사용자가
  //    걸어 둔 스누즈도 함께 날아간다. 커밋 8a4d729("고아 청소가 hydrate 실패의 빈 상태를
  //    참조 0건으로 오판")와 같은 결함 클래스다.
  //    recordStore는 `hydrated`를 컨텍스트로 노출하지 않으므로(provider value에 없다) 그쪽을
  //    건드리는 대신, 여기서 **non-null → null 전이가 실제로 관측됐을 때만** 지운다.
  //    초기 `undefined → null`은 전이가 아니다 — 아직 모르는 것이지 끝난 것이 아니다.
  useEffect(() => {
    const prev = prevStayRef.current;
    prevStayRef.current = stayCountryCode;
    if (!prev || stayCountryCode) return;
    loadPending().then((p) => { if (p.length > 0) return savePending([]); }).catch(() => {});
  }, [stayCountryCode]);

  useEffect(() => {
    if (!stayCountryCode) return;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const now = Date.now();
        const checkedAt = await loadCheckedAt();
        if (now - checkedAt < CHECK_INTERVAL) return;

        // 위치는 종료 판정 보조 — 못 얻으면 24시간 규칙으로 대체된다(팝업 없음)
        const { countryCode } = await detectCurrentCountry();

        // 이미 카드에 들어간 사진 제외 — 기록의 표지 + 카드에 보관해 둔 분석 사진 전량
        const importedIds = collectImportedAssetIds(recordsRef.current);
        const pools = await syncTripPools(tripGroupsRef.current.map((g) => g.id));
        for (const id of poolAssetIds(pools)) importedIds.add(id);

        const photos = await scanRecentPhotoCountries({
          createdAfter: now - RECENT_WINDOW_MS,
          createdBefore: now,
          excludeIds: importedIds,
        });

        // 기간 겹침 판정은 모든 형식의 기록을 본다 — 피드·블로그로 직접 남긴 여행도 걸러야 한다.
        // (viewType === 'album'으로 좁히면 사용자가 직접 쓴 글과 겹치는 제안이 그대로 뜬다)
        // startDate가 없는 글(옛 피드)은 date 하루로 본다. TravelRecord.date는 필수 string이라
        // `startDate ?? date` 조립은 항상 string이 된다.
        const existingTrips = recordsRef.current.map((r) => ({
          countryName: r.countryName,
          startDate: r.startDate ?? r.date,
          endDate: r.endDate ?? r.startDate ?? r.date,
        }));
        const dismissedKeys = await loadDismissed();
        const fresh = suggestStayTrips({
          photos, stayCountryCode, homeCountryCode, now,
          currentCountryCode: countryCode, importedAssetIds: importedIds, existingTrips, dismissedKeys,
        });

        const prev = await loadPending();
        const prevKeys = new Set(prev.map((s) => s.key));
        const merged = mergePending(prev, fresh, now);
        await savePending(merged);
        await saveCheckedAt(now); // 여기까지 왔으면 이번 검사는 끝난 것 — 예외면 갱신하지 않는다

        const added = fresh.filter((s) => !prevKeys.has(s.key));
        if (added.length === 0 || !notifyEnabled) return;
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) return;
        const total = added.reduce((n, s) => n + s.photoCount, 0);
        await Notifications.scheduleNotificationAsync({
          identifier: STAY_TRIP_SUGGEST_NOTIF_ID,
          content: {
            title: added.length === 1
              ? i18n.t('stayTripSuggest.notifTitle', { country: countryLabel(added[0].countryName, i18n.language) })
              : i18n.t('stayTripSuggest.notifTitleMany', { count: added.length }),
            body: i18n.t('stayTripSuggest.notifBody', { count: total }),
            data: { type: 'stayTripSuggest' },
            sound: true,
          },
          trigger: null, // 즉시 발송
        });
      } catch (e) {
        // 사진 조회·지오코딩·알림 API는 throw할 수 있고 check()는 await 없이 불린다.
        // 삼키지 않으면 unhandled rejection. checkedAt을 갱신하지 않았으므로 다음 포그라운드에 재시도.
        if (__DEV__) console.warn('[StayTripSuggester] check() 예외 — 삼키고 계속:', e);
      } finally {
        checking = false;
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [stayCountryCode, homeCountryCode, notifyEnabled]);

  return null; // UI 없음
}
