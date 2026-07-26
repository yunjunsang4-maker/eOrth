// 제휴 캠페인 조회·캐시·클릭 집계.
//
// 캐시를 두는 이유: 피드를 열 때마다 네트워크를 타면 스크롤이 늦고, 오프라인·오지에서
// 광고 슬롯이 통째로 비어버린다. TTL이 지나도 네트워크가 실패하면 만료 캐시를 그대로
// 쓴다(빈 화면보다 낫다) — 대신 기간이 끝난 캠페인은 선택 단계에서 걸러진다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { AdCampaign } from '../utils/adCampaignSelect';

const CACHE_KEY = 'eorth.adCampaigns.v1';
const TTL_MS = 6 * 60 * 60 * 1000;   // 6시간

interface CacheShape {
  fetchedAt: number;
  campaigns: AdCampaign[];
}

/** DB 행(snake_case) → 앱 타입(camelCase) */
function fromRow(r: any): AdCampaign {
  return {
    id: String(r.id),
    slug: String(r.slug),
    partner: String(r.partner),
    headlineKo: String(r.headline_ko ?? ''),
    headlineEn: String(r.headline_en ?? ''),
    imageUrl: String(r.image_url ?? ''),
    clickUrl: String(r.click_url ?? ''),
    disclosureKo: r.disclosure_ko ?? null,
    disclosureEn: r.disclosure_en ?? null,
    targetCountries: Array.isArray(r.target_countries) ? r.target_countries.map(String) : [],
    locales: Array.isArray(r.locales) ? r.locales.map(String) : ['ko', 'en'],
    weight: Number.isFinite(r.weight) ? Number(r.weight) : 1,
    startsAt: r.starts_at ? Date.parse(r.starts_at) : null,
    endsAt: r.ends_at ? Date.parse(r.ends_at) : null,
  };
}

async function readCache(): Promise<CacheShape | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.campaigns)) return null;
    return parsed as CacheShape;
  } catch {
    return null;
  }
}

async function writeCache(campaigns: AdCampaign[]): Promise<void> {
  try {
    const payload: CacheShape = { fetchedAt: Date.now(), campaigns };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 캐시 쓰기 실패는 조용히 넘긴다 — 광고는 부가 기능이라 앱 흐름을 막지 않는다.
  }
}

/**
 * 활성 캠페인 목록. 신선한 캐시가 있으면 네트워크를 타지 않는다.
 * 네트워크 실패 시 만료 캐시라도 반환하고, 그것도 없으면 빈 배열.
 */
export async function fetchAdCampaigns(): Promise<AdCampaign[]> {
  const cached = await readCache();
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.campaigns;

  if (!supabase) return cached?.campaigns ?? [];

  try {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('id,slug,partner,headline_ko,headline_en,image_url,click_url,disclosure_ko,disclosure_en,target_countries,locales,weight,starts_at,ends_at');
    if (error || !data) return cached?.campaigns ?? [];

    const campaigns = data.map(fromRow);
    await writeCache(campaigns);
    return campaigns;
  } catch {
    // 테이블이 아직 없거나(schema 미실행) 네트워크가 끊긴 경우 등 — 조용히 폴백.
    return cached?.campaigns ?? [];
  }
}

/** 클릭 집계 — 익명 카운터. 실패해도 사용자 흐름을 막지 않는다. */
export async function logAdClick(campaignId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('log_ad_click', { p_campaign_id: campaignId });
  } catch {
    // 집계 실패는 무시 — 링크 이동이 우선이다.
  }
}
