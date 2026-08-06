// 광고 슬롯 하나의 소스를 결정한다.
//
// 우선순위: 제휴 캠페인 → AdMob 네이티브 광고 → 하우스 광고
// 훅이므로 리스트 map 안에서 직접 부를 수 없다 — FeedAdSlot 컴포넌트가 감싼다.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeAd } from 'react-native-google-mobile-ads';
import { getGoogleMobileAds, ensureAdsInitialized } from '../lib/googleMobileAds';
import { requestTrackingPermission } from '../lib/tracking';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { fetchAdCampaigns } from '../services/adCampaigns';
import { pickCampaign, resolveTargetCountry, type AdCampaign } from '../utils/adCampaignSelect';
import { AFFILIATE_ADS_ENABLED, ADMOB_ENABLED } from '../constants/featureFlags';
import { NATIVE_AD_UNIT_ID } from '../constants/adUnits';

export type FeedAdSource =
  | { kind: 'affiliate'; campaign: AdCampaign }
  | { kind: 'admob'; ad: NativeAd }
  | { kind: 'house' };

// 캠페인 목록은 슬롯마다 다시 받을 필요가 없으므로 모듈 스코프에 한 번만 담는다.
// (AsyncStorage 캐시가 뒤에 또 있지만, 같은 화면의 슬롯 3~4개가 각자 비동기로
//  읽는 것을 막아 첫 렌더를 매끄럽게 한다.)
let campaignsPromise: Promise<AdCampaign[]> | null = null;
function loadCampaignsOnce(): Promise<AdCampaign[]> {
  if (!campaignsPromise) campaignsPromise = fetchAdCampaigns();
  return campaignsPromise;
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
  const { i18n } = useTranslation();
  const { currentVisitedCountryCode, homeCountryCode } = useSettings();
  const { records } = useRecords();
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(null);
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);

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
    let alive = true;
    let created: NativeAd | null = null;

    // 초기화가 끝나기 전의 요청은 Google이 지원하지 않는다 — 앱 시작 직후 소셜 탭으로
    // 바로 들어온 경우를 대비해 공유 초기화 Promise를 먼저 기다린다(이미 끝났으면 즉시 통과).
    // ATT 결과도 함께 기다린다 — 결정 전에 요청하면 그 회차가 동의와 무관하게 나간다.
    Promise.all([ensureAdsInitialized() ?? Promise.resolve(), requestTrackingPermission()])
      .then(([, trackingGranted]) => {
        if (!alive) return null;             // 기다리는 사이 언마운트됐으면 요청하지 않는다
        return ads.NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
          // 추적 동의를 받은 경우에만 개인화 광고. 거부·미결정·안드로이드 기본은 비개인화 —
          // 동의 없이 개인화 광고를 내보내면 정책 위반이다.
          requestNonPersonalizedAdsOnly: !trackingGranted,
        });
      })
      .then((ad) => {
        if (!ad) return;                     // 언마운트로 건너뛴 경우
        created = ad;
        if (__DEV__) console.log(`[AdMob] slot ${slot} 수신:`, ad.headline);
        if (alive) setNativeAd(ad);
        else ad.destroy();                   // 이미 언마운트됐으면 즉시 해제
      })
      .catch((e) => {
        // 미필·네트워크 오류 → 하우스로 떨어진다. 조용히 삼키면 검증 때 원인을 알 수 없어
        // 개발 빌드에서만 사유를 남긴다(프로덕션 동작은 그대로).
        if (__DEV__) console.log(`[AdMob] slot ${slot} 요청 실패:`, e?.message ?? e);
      });

    // destroy를 빠뜨리면 네이티브 메모리가 샌다.
    return () => { alive = false; created?.destroy(); };
  }, [slot, campaignsReady, affiliateFills]);

  // 로딩 중에는 하우스를 먼저 그린다 — 폴라로이드 크기가 같아 레이아웃이 흔들리지 않는다.
  if (!campaignsReady) return { kind: 'house' };

  if (campaign) return { kind: 'affiliate', campaign };
  if (nativeAd) return { kind: 'admob', ad: nativeAd };
  return { kind: 'house' };
}
