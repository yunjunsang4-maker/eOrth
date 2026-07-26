// 광고 슬롯 하나의 소스를 결정한다.
//
// 우선순위: 제휴 캠페인 → (Task 8에서 AdMob 추가) → 하우스 광고
// 훅이므로 리스트 map 안에서 직접 부를 수 없다 — FeedAdSlot 컴포넌트가 감싼다.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { fetchAdCampaigns } from '../services/adCampaigns';
import { pickCampaign, resolveTargetCountry, type AdCampaign } from '../utils/adCampaignSelect';
import { AFFILIATE_ADS_ENABLED } from '../constants/featureFlags';

export type FeedAdSource =
  | { kind: 'affiliate'; campaign: AdCampaign }
  | { kind: 'house' };

// 캠페인 목록은 슬롯마다 다시 받을 필요가 없으므로 모듈 스코프에 한 번만 담는다.
// (AsyncStorage 캐시가 뒤에 또 있지만, 같은 화면의 슬롯 3~4개가 각자 비동기로
//  읽는 것을 막아 첫 렌더를 매끄럽게 한다.)
let campaignsPromise: Promise<AdCampaign[]> | null = null;
function loadCampaignsOnce(): Promise<AdCampaign[]> {
  if (!campaignsPromise) campaignsPromise = fetchAdCampaigns();
  return campaignsPromise;
}

export function useFeedAdSource(slot: number): FeedAdSource {
  const { i18n } = useTranslation();
  const { currentVisitedCountryCode, homeCountryCode } = useSettings();
  const { records } = useRecords();
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(null);

  useEffect(() => {
    if (!AFFILIATE_ADS_ENABLED) { setCampaigns([]); return; }
    let alive = true;
    loadCampaignsOnce().then((list) => { if (alive) setCampaigns(list); });
    return () => { alive = false; };
  }, []);

  // 로딩 중에는 하우스를 먼저 그린다 — 폴라로이드 크기가 같아 레이아웃이 흔들리지 않는다.
  if (campaigns === null) return { kind: 'house' };

  const countryCode = resolveTargetCountry({
    currentVisitedCountryCode,
    homeCountryCode,
    recentTrips: records.map((r) => ({
      countryName: r.countryName ?? null,
      timestamp: typeof r.timestamp === 'number' ? r.timestamp : 0,
    })),
    nowMs: Date.now(),
  });

  const campaign = pickCampaign(campaigns, {
    nowMs: Date.now(),
    locale: i18n.language?.startsWith('ko') ? 'ko' : 'en',
    countryCode,
    slot,
  });

  return campaign ? { kind: 'affiliate', campaign } : { kind: 'house' };
}
