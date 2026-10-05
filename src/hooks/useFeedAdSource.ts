// 광고 슬롯 하나의 소스를 결정한다.
//
// 우선순위: 제휴 캠페인 → AdMob 네이티브 광고 → 하우스 광고
// 훅이므로 리스트 map 안에서 직접 부를 수 없다 — FeedAdSlot 컴포넌트가 감싼다.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeAd } from 'react-native-google-mobile-ads';
import { getGoogleMobileAds, ensureAdsInitialized } from '../lib/googleMobileAds';
import { requestTrackingPermission } from '../lib/tracking';
import { useHomeSettings } from '../store/settingsStore';
import { useRecordData } from '../store/recordStore';
import { fetchAdCampaigns } from '../services/adCampaigns';
import { pickCampaign, resolveTargetCountry, type AdCampaign } from '../utils/adCampaignSelect';
import { AFFILIATE_ADS_ENABLED, ADMOB_ENABLED } from '../constants/featureFlags';
import { NATIVE_AD_UNIT_ID } from '../constants/adUnits';
import { createAdRetirement, inAdRetryCooldown, isAdExpired } from '../utils/feedAdLifetime';
// 분 단위 공용 시계 — 인스턴스는 TimeAgoText.tsx가 만든 1개를 그대로 쓴다(store/minuteTick.ts는 node 검증 때문에
// react-native를 import하지 않는 공장 함수만 두고, AppState를 주입한 실제 인스턴스는 거기 있다). hooks → components
// 방향이지만 useAccountBoundary → components/AppStateSync 선례가 있고, 새 인스턴스를 만들면 타이머·리스너가 2벌이 된다.
import { useMinuteTick } from '../components/TimeAgoText';

export type FeedAdSource =
  | { kind: 'affiliate'; campaign: AdCampaign }
  | { kind: 'admob'; ad: NativeAd }
  | { kind: 'house' };

// 캠페인 목록은 슬롯마다 다시 받을 필요가 없으므로 모듈 스코프에 한 번만 담는다.
// (AsyncStorage 캐시가 뒤에 또 있지만, 같은 화면의 슬롯 3~4개가 각자 비동기로
//  읽는 것을 막아 첫 렌더를 매끄럽게 한다.)
let campaignsPromise: Promise<AdCampaign[]> | null = null;
// 받은 목록을 동기로도 들고 있는다 — 슬롯이 다시 마운트될 때 첫 렌더부터 판정해 하우스가 한 프레임 비치지 않게.
let campaignsLoaded: AdCampaign[] | null = null;
function loadCampaignsOnce(): Promise<AdCampaign[]> {
  if (!campaignsPromise) campaignsPromise = fetchAdCampaigns().then((list) => { campaignsLoaded = list; return list; });
  return campaignsPromise;
}

// 슬롯별 AdMob 광고 — 컴포넌트가 아니라 모듈에 둔다(2026-10-03 소셜 피드 FlashList 가상화).
// 예전 피드는 모든 카드를 계속 마운트해서 슬롯 컴포넌트 수명 = 피드 수명이었고, 요청은 슬롯당 1회였다.
// 가상화 뒤에는 광고 칸이 화면에서 멀어지면 언마운트되고 돌아오면 다시 마운트된다 — 광고를 훅 state에만
// 두면 그때마다 destroy·재요청이 일어나 요청 수가 늘고(match rate 하락), 스크롤을 오갈 때마다 광고가 바뀐다.
// 그래서 요청 Promise를 슬롯 번호로 보관해 재마운트는 같은 광고를 다시 쓴다. 실패(미필·오프라인)는
// 보관하지 않아 다음 마운트 때(쿨다운 뒤) 다시 요청한다(아래 effect의 catch).
// 만료(QA L2'): 받은 시각을 같이 저장하고, 1시간(AD_TTL_MS — Google: 네이티브 광고는 1시간 뒤 만료) 지난 광고는
// 요청 effect가 돌 때(셀 마운트·포그라운드 복귀·소셜 탭 focus·탭을 보는 동안 매분 — foregroundTick 주석) 보관소에서
// 빼고 다시 요청한다. 그래서 탭을 계속 보고 있어도 만료 뒤 늦어도 1분 안에 교체된다.
// 뺀 광고는 adRetirement가 그 광고를 그리는 셀이 0이 될 때 destroy한다(utils/feedAdLifetime.ts 주석 —
// 그리는 중에 destroy하면 NativeAdView가 해제된 광고를 그린다).
// 쿨다운(QA R2·10단계 M1): 실패 시각과 연속 실패 횟수를 슬롯별로 남겨, 대기(30초 → 2분 → 8분 → 10분 상한,
// utils/feedAdLifetime adRetryCooldownMs) 안의 재마운트·재판정은 요청하지 않는다(하우스). 성공하면 기록을 지운다.
// 만료 교체 요청도 같은 catch를 타므로 같은 규칙이다(직전 성공에서 기록이 지워져 있어 1회차부터).
// 쿨다운이 끝난 실패 슬롯도 위 매분 재판정에서 재요청된다(전용 타이머 없음 — 실제 재시도는 대기 뒤 첫 분 경계).
// 미필 지역에서 소셜 탭을 계속 보고 있어도 백오프 덕에 슬롯당 첫 시간 약 8회, 이후 시간당 약 6회다.
// ponytail: 오프라인 복귀 즉시 재시도(utils/connectivity onReconnect로 slotAdFailedAt을 비우기)도 넣지 않았다 —
//           백오프 뒤 오프라인 복귀는 최대 10분(상한) 늦게 광고가 돌아오지만 그동안은 하우스라 화면이 비지 않고,
//           모듈 import만으로 상시 네트워크 리스너가 붙는다. 포그라운드 복귀 초기화도 넣지 않았다. 필률 지표가 나쁘면 그때.
const slotAdRequests = new Map<number, Promise<NativeAd | null>>();
const slotAdLoaded = new Map<number, { ad: NativeAd; loadedAt: number }>();
const slotAdFailedAt = new Map<number, { at: number; count: number }>();
const adRetirement = createAdRetirement<NativeAd>((ad) => {
  if (__DEV__) console.log('[AdMob] 만료 광고 destroy:', ad.headline);
  ad.destroy();
});

// 다시 판정 신호(QA F1) — 만료·쿨다운 판정은 아래 요청 effect가 돌 때만 일어나는데, 피드 상단 광고 칸(slot 0~2)은
// 탭이 lazy:false라 세션 내내 마운트된 채로 남아 그 effect가 다시 돌 일이 없다(몇 시간째 같은 광고).
// 그래서 앱이 포그라운드로 돌아올 때(AppState 'active') 이 값을 올려 요청 effect를 다시 돌린다. 소셜 탭 focus는 훅 안의
// useIsFocused가 맡는다(FeedAdSlot은 SocialScreen 셀에서만 그려진다 — 네비게이터 화면 안이라 쓸 수 있다).
// 포그라운드에서 탭을 계속 보고 있는 동안은 공용 분 시계(useMinuteTick)가 매분 한 번 더 돌린다 — focus일 때만
// (다른 탭에 있는 동안은 재판정할 이유가 없고, 미필 지역에서 보이지도 않는 칸이 분마다 재요청하게 된다).
// 리스너는 훅 인스턴스마다가 아니라 모듈에 1개 — 첫 구독 때 붙이고 마지막 구독이 빠지면 뗀다(store/minuteTick.ts와 같은 방식).
// 다시 돌아도 안전하다: 만료 안 된 슬롯은 보관된 요청을 그대로 다시 기다릴 뿐(재요청 없음, 같은 광고라 setState no-op)이고,
// 만료된 광고는 retire → 새 광고 수신 → 셀 교체 → release에서 destroy 경로를 탄다. 쿨다운이 끝난 실패 슬롯은 이때 재요청된다.
// iOS는 inactive→active(제어 센터 등)에도 오른다 — 재판정은 Map 조회 몇 번이라 걸러내지 않았다.
let foregroundTick = 0;
const foregroundListeners = new Set<() => void>();
let offAppState: (() => void) | null = null;
function subscribeForegroundTick(l: () => void) {
  foregroundListeners.add(l);
  if (!offAppState) {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      foregroundTick++;
      foregroundListeners.forEach((fn) => fn());
    });
    offAppState = () => sub.remove();
  }
  return () => {
    foregroundListeners.delete(l);
    if (foregroundListeners.size === 0) { offAppState?.(); offAppState = null; }
  };
}
const getForegroundTick = () => foregroundTick;

// 초기 state·effect에서만 부른다(렌더 본문에서 보관소를 읽지 않는다 — 이 훅은 'use no memo'지만 같은 규약을 지킨다)
function freshSlotAd(slot: number): NativeAd | null {
  const e = slotAdLoaded.get(slot);
  return e && !isAdExpired(e.loadedAt, Date.now()) ? e.ad : null;
}

// AdMob 요청은 상위 슬롯 3개까지만. 피드가 길면 슬롯이 계속 생기는데 전부 요청하면
// 요청 대비 노출 비율(match rate)이 떨어져 필률이 깎인다.
const MAX_ADMOB_SLOTS = 3;

// 제휴 캠페인이 채울 수 있는 상위 슬롯 수.
//
// 상한이 없으면 제휴가 AdMob보다 우선이라 피드의 모든 광고 슬롯이 제휴로 도배되고
// AdMob은 한 번도 표시되지 않는다(pickCampaign이 slot을 후보 수로 나눈 나머지를 쓰므로
// 캠페인이 1개면 전 슬롯이 같은 캠페인이다). 쿠팡 파트너스처럼 구매 전환형 제휴는
// 노출을 늘려도 수익이 비례하지 않는 반면 AdMob은 노출 기반이라, 상위 슬롯만 제휴에
// 주고 나머지는 AdMob에 넘기는 편이 낫다.
const MAX_AFFILIATE_SLOTS = 2;

// 세션마다 제휴 후보의 시작 위치를 옮긴다.
//
// pickCampaign의 정렬은 안정적(weight 내림차순 → slug 사전순)이라 slot만으로 회전시키면
// 슬롯 상한보다 뒤 순번인 캠페인은 영구히 노출되지 않는다 — 캠페인 4개에 상한 2면 3·4번째는
// 한 번도 안 나온다. 앱을 켤 때마다 시작 위치를 바꿔 전 캠페인이 고르게 돌게 한다.
// 대가: 국가 타겟팅된 캠페인의 '맨 앞' 우선순위가 세션에 따라 밀릴 수 있다(노출 자체는 된다).
const SESSION_ROTATION = Math.floor(Math.random() * 997);

export function useFeedAdSource(slot: number): FeedAdSource {
  // React Compiler 제외: 아래 nowMs(Date.now())가 컴파일 시 campaigns·records 등에만 메모돼, 소셜 탭 체류 중 캠페인 startsAt/endsAt 경계가 지나도 피드가 갱신될 때까지 판정이 굳는다(2026-10-02). 렌더마다 현재 시각으로 판정하던 컴파일러 이전 동작으로 되돌린다.
  // 렌더 자체도 분 시계(useMinuteTick) 구독으로 분마다 일어나 경계 반영이 최대 1분 늦다(2026-10-05).
  'use no memo';
  const { i18n } = useTranslation();
  const { currentVisitedCountryCode, homeCountryCode } = useHomeSettings();
  const { records } = useRecordData();
  // 초기값을 모듈 보관분에서 — 재마운트(가상화)된 슬롯이 하우스 → 실광고로 한 번 더 바뀌지 않게
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(() => (AFFILIATE_ADS_ENABLED ? campaignsLoaded : []));
  // 만료된 보관분은 초기값으로 쓰지 않는다 — 아래 effect가 빼고 새로 요청한다
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(() => freshSlotAd(slot));
  // 요청 effect를 다시 돌리는 신호 두 가지(위 foregroundTick 주석) — 값은 effect deps로만 쓴다
  const foregroundTickValue = useSyncExternalStore(subscribeForegroundTick, getForegroundTick, getForegroundTick);
  const isFocused = useIsFocused();
  // 세 번째 신호 — 탭을 보는 동안의 분 경과. 구독 자체는 focus와 무관하게 유지돼(훅은 조건부 호출 불가) 이 셀은
  // 분마다 다시 렌더되지만, effect 신호는 focus일 때만 바뀐다(blur 중엔 null 고정 → 재실행 0).
  // 분마다 다시 렌더되는 덕에 아래 제휴 판정의 nowMs도 분 단위로 새로워진다(캠페인 시작·종료 경계).
  const minute = useMinuteTick();
  const recheckMinute = isFocused ? minute : null;

  // 이 셀이 그리는 광고를 adRetirement에 알린다 — 만료로 보관소에서 빠진 광고를 그리는 중에 destroy하지 않게.
  // 아래 요청 effect보다 먼저 선언해야 한다: 같은 커밋에서 retain이 retire보다 먼저 돌아야 '그리는 중'으로 잡힌다.
  // 다른 광고로 바뀌면 cleanup(release)은 새 광고가 커밋된 뒤에 돈다 — NativeAdView는 이미 새 광고로 넘어갔다.
  useEffect(() => {
    if (!nativeAd) return;
    adRetirement.retain(nativeAd);
    return () => adRetirement.release(nativeAd);
  }, [nativeAd]);

  useEffect(() => {
    if (!AFFILIATE_ADS_ENABLED) { setCampaigns([]); return; }
    let alive = true;
    loadCampaignsOnce().then((list) => { if (alive) setCampaigns(list); });
    return () => { alive = false; };
  }, []);

  // 제휴 판정 — 아래 AdMob effect가 이 결과로 요청 여부를 정하므로 effect보다 먼저 계산한다.
  // campaigns가 아직 null(로딩 중)이면 판정할 수 없어 계산하지 않는다.
  const nowMs = Date.now();
  const campaign = campaigns && slot < MAX_AFFILIATE_SLOTS
    ? pickCampaign(campaigns, {
        nowMs,
        locale: i18n.language?.startsWith('ko') ? 'ko' : 'en',
        countryCode: resolveTargetCountry({
          currentVisitedCountryCode,
          homeCountryCode,
          recentTrips: records.map((r) => ({
            countryName: r.countryName ?? null,
            timestamp: typeof r.timestamp === 'number' ? r.timestamp : 0,
          })),
          nowMs,
        }),
        // 세션 오프셋으로 후보 시작 위치를 옮긴다 — SESSION_ROTATION 주석 참고
        slot: slot + SESSION_ROTATION,
      })
    : null;
  const campaignsReady = campaigns !== null;
  const affiliateFills = campaign !== null;

  // 제휴 판정 뒤, 하우스 폴백 앞 단계 — AdMob 상태 로딩.
  // useState/useEffect는 조건부로 호출할 수 없으므로 훅 호출 자체는 항상 실행하고,
  // 실제 요청 여부만 effect 내부 조건으로 제어한다(반환 분기는 아래에서 처리).
  useEffect(() => {
    if (!ADMOB_ENABLED || slot >= MAX_ADMOB_SLOTS) return;
    // 제휴 판정이 끝나기 전에는 요청하지 않는다 — 제휴가 채울 슬롯에 요청을 날리면
    // 그 응답은 화면에 못 나오고 match rate만 깎인다(MAX_ADMOB_SLOTS와 같은 이유).
    if (!campaignsReady || affiliateFills) return;
    // AdMob 네이티브 모듈이 없는 바이너리(구 dev client 등)면 하우스로 떨어진다.
    const ads = getGoogleMobileAds();
    if (!ads) return;

    // 만료 판정 — 이 effect가 돌 때만: 셀 마운트·제휴 판정 완료·포그라운드 복귀·소셜 탭 focus 변화·focus 중 매분.
    // 렌더 중에는 판정하지 않는다(렌더 본문에서 Date.now()·보관소를 읽지 않는다).
    // 만료면 보관소에서 빼고 adRetirement에 넘긴다: 그리는 셀이 없으면 바로, 있으면 마지막 셀이 놓을 때 destroy.
    const now = Date.now();
    const stored = slotAdLoaded.get(slot);
    if (stored && isAdExpired(stored.loadedAt, now)) {
      slotAdLoaded.delete(slot);
      slotAdRequests.delete(slot);
      adRetirement.retire(stored.ad);
    }

    // 슬롯당 요청은 1회 — 이미 보냈거나 받은 슬롯이면 그 결과를 기다리기만 한다(slotAdRequests 주석).
    let request = slotAdRequests.get(slot);
    // 최근에 실패한 슬롯은 쿨다운 동안 요청하지 않는다(하우스 유지) — slotAdFailedAt 주석
    const lastFail = slotAdFailedAt.get(slot);
    if (!request && inAdRetryCooldown(lastFail?.at, lastFail?.count ?? 0, now)) return;
    let alive = true;
    if (!request) {
      // 초기화가 끝나기 전의 요청은 Google이 지원하지 않는다 — 앱 시작 직후 소셜 탭으로
      // 바로 들어온 경우를 대비해 공유 초기화 Promise를 먼저 기다린다(이미 끝났으면 즉시 통과).
      // ATT 결과도 함께 기다린다 — 결정 전에 요청하면 그 회차가 동의와 무관하게 나간다.
      // (예전엔 기다리는 사이 언마운트되면 요청을 접었다. 이제 결과가 모듈에 남아 재마운트 때 쓰이므로
      //  끝까지 보낸다 — 화면 근처(drawDistance)에서만 마운트되므로 곧 다시 보일 슬롯이다.)
      request = Promise.all([ensureAdsInitialized() ?? Promise.resolve(), requestTrackingPermission()])
        .then(([, trackingGranted]) => ads.NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
          // 추적 동의를 받은 경우에만 개인화 광고. 거부·미결정·안드로이드 기본은 비개인화 —
          // 동의 없이 개인화 광고를 내보내면 정책 위반이다.
          requestNonPersonalizedAdsOnly: !trackingGranted,
        }))
        .then((ad): NativeAd | null => {
          if (__DEV__) console.log(`[AdMob] slot ${slot} 수신:`, ad.headline);
          return ad;
        })
        .catch((e) => {
          // 미필·네트워크 오류 → 하우스로 떨어진다. 조용히 삼키면 검증 때 원인을 알 수 없어
          // 개발 빌드에서만 사유를 남긴다(프로덕션 동작은 그대로).
          if (__DEV__) console.log(`[AdMob] slot ${slot} 요청 실패:`, e?.message ?? e);
          // 실패는 보관하지 않는다 — 앱 시작 직후 오프라인이었다고 앱 재시작까지 하우스로 굳지 않게,
          // 이 슬롯이 다음에 마운트될 때(화면 근처로 다시 올 때) 다시 요청한다(QA L2).
          // 요청 중 중복 방지는 그대로다: 이 catch가 돌기 전까지는 Promise가 보관소에 남아 있다.
          // 실패 시각과 연속 실패 횟수를 남겨 백오프 대기 안의 재마운트는 요청하지 않는다(QA R2·10단계 M1).
          slotAdRequests.delete(slot);
          slotAdFailedAt.set(slot, { at: Date.now(), count: (slotAdFailedAt.get(slot)?.count ?? 0) + 1 });
          return null;
        })
        .then((ad) => {
          // 받은 시각 = 수신 시각(요청~수신 사이 수 초는 1시간에 비해 무시한다)
          if (ad) { slotAdLoaded.set(slot, { ad, loadedAt: Date.now() }); slotAdFailedAt.delete(slot); }
          return ad;
        });
      slotAdRequests.set(slot, request);
    }
    request.then((ad) => { if (alive && ad) setNativeAd(ad); });

    // 언마운트해도 destroy하지 않는다 — 광고 객체 소유자는 이 컴포넌트가 아니라 모듈 보관소다.
    // (예전엔 여기서 destroy했다. 지금 destroy하면 재마운트 때 해제된 광고를 다시 그리게 된다)
    // destroy는 만료로 보관소에서 빠진 광고만, 그리는 셀이 0일 때 adRetirement가 한다.
    return () => { alive = false; };
    // foregroundTickValue·isFocused·recheckMinute는 본문에서 읽지 않는다 — 바뀌면 이 effect를 다시 돌려 만료·쿨다운을
    // 재판정하는 신호다. focus가 빠질 때(blur)도 한 번 더 도는데, 그때 갈린 광고는 다음에 볼 때 새것이라 해가 없다.
    // 매분 다시 돌아도 만료 안 된 슬롯은 재요청이 없다: 보관된 요청(이미 resolve)을 다시 기다려 같은 광고 객체로
    // setNativeAd — 같은 값이라 React가 Object.is 비교로 버린다(커밋 없음). 실패·쿨다운 중 슬롯은 Map 조회 후 바로 return.
  }, [slot, campaignsReady, affiliateFills, foregroundTickValue, isFocused, recheckMinute]);

  // 로딩 중에는 하우스를 먼저 그린다 — 폴라로이드 크기가 같아 레이아웃이 흔들리지 않는다.
  if (!campaignsReady) return { kind: 'house' };

  if (campaign) return { kind: 'affiliate', campaign };
  if (nativeAd) return { kind: 'admob', ad: nativeAd };
  return { kind: 'house' };
}
