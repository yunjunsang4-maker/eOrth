// 제휴 캠페인 선택 순수 로직 — 네트워크·저장소와 무관하므로 단독 검증 가능하다.
// (검증: src/utils/adCampaignSelect.verify.ts)
//
// 국가 매칭을 서버가 아니라 여기서 하는 이유: 사용자의 여행 국가를 서버로 보내지
// 않기 위함이다. 활성 캠페인 전체를 받아 앱 안에서만 걸러낸다.

import { COUNTRIES } from '../constants/countries';

export interface AdCampaign {
  id: string;
  slug: string;
  partner: string;
  headlineKo: string;
  headlineEn: string;
  imageUrl: string;
  clickUrl: string;
  disclosureKo: string | null;
  disclosureEn: string | null;
  /** ISO2 대문자 배열. 빈 배열이면 전체 대상 */
  targetCountries: string[];
  locales: string[];
  weight: number;
  /** epoch ms. null이면 제한 없음 */
  startsAt: number | null;
  endsAt: number | null;
}

/** 노출 기간 안에 있는가 */
export function isCampaignLive(c: AdCampaign, nowMs: number): boolean {
  if (c.startsAt !== null && c.startsAt > nowMs) return false;
  if (c.endsAt !== null && c.endsAt < nowMs) return false;
  return true;
}

interface SelectOpts {
  nowMs: number;
  /** 'ko' | 'en' */
  locale: string;
  /** ISO2. 여행 국가를 모르면 null */
  countryCode: string | null;
}

/**
 * 노출 가능한 캠페인을 우선순위 순으로 정렬해 반환한다.
 * 정렬 기준: ① 국가 매칭된 것 우선 ② weight 내림차순 ③ slug 사전순(안정 정렬)
 */
export function eligibleCampaigns(all: AdCampaign[], opts: SelectOpts): AdCampaign[] {
  const code = opts.countryCode ? opts.countryCode.toUpperCase() : null;

  const matched = all
    .filter((c) => isCampaignLive(c, opts.nowMs))
    .filter((c) => c.locales.includes(opts.locale))
    .filter((c) => {
      if (c.targetCountries.length === 0) return true;       // 전체 대상
      if (!code) return false;                                // 국가 한정인데 국가를 모름
      return c.targetCountries.some((t) => t.toUpperCase() === code);
    });

  const isTargeted = (c: AdCampaign) => c.targetCountries.length > 0;

  return matched.sort((a, b) => {
    if (isTargeted(a) !== isTargeted(b)) return isTargeted(a) ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * 슬롯 순번에 해당하는 캠페인 하나를 고른다.
 * 후보를 순번으로 회전시켜 같은 캠페인이 연속 슬롯에 나오지 않게 한다.
 */
export function pickCampaign(
  all: AdCampaign[],
  opts: SelectOpts & { slot: number }
): AdCampaign | null {
  const list = eligibleCampaigns(all, opts);
  if (list.length === 0) return null;
  const i = ((opts.slot % list.length) + list.length) % list.length;  // 음수 슬롯 방어
  return list[i];
}

// ─────────────────────────────────────────────────────────────
// 대상 국가 산출
// ─────────────────────────────────────────────────────────────

/**
 * 한글 국가명 → ISO2 대문자.
 * COUNTRIES의 term은 'jp 일본 japan' 형식이라 첫 토큰이 소문자 ISO2다.
 */
export function countryNameToIso2(koreanName: string | null | undefined): string | null {
  if (!koreanName) return null;
  const hit = COUNTRIES.find((c) => c.name === koreanName);
  if (!hit) return null;
  const code = hit.term.split(' ')[0];
  return code ? code.toUpperCase() : null;
}

const RECENT_TRIP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;   // 30일

interface ResolveOpts {
  /** settingsStore.currentVisitedCountryCode — 여행 감지 전엔 거주국가 값이 들어 있다 */
  currentVisitedCountryCode: string | null;
  /** settingsStore.homeCountryCode */
  homeCountryCode: string | null;
  /** 국가명과 시각을 가진 기록 목록 */
  recentTrips: { countryName: string | null; timestamp: number }[];
  nowMs: number;
}

/**
 * 광고 타겟팅에 쓸 국가를 고른다.
 *
 * ① 여행 중이면(방문국 != 거주국) 그 방문국
 * ② 아니면 최근 30일 내 기록 중 거주국이 아닌 가장 최신 국가
 * ③ 둘 다 없으면 null (국가 미지정 → 전체 대상 캠페인만 노출)
 *
 * 거주국을 제외하는 이유: 한국에 있는 사용자에게 "한국 여행 eSIM"이 뜨면 안 된다.
 */
export function resolveTargetCountry(opts: ResolveOpts): string | null {
  const home = opts.homeCountryCode ? opts.homeCountryCode.toUpperCase() : null;
  const visiting = opts.currentVisitedCountryCode
    ? opts.currentVisitedCountryCode.toUpperCase()
    : null;

  // ① 여행 중
  if (visiting && visiting !== home) return visiting;

  // ② 최근 30일 기록 — 최신순으로 훑어 거주국이 아닌 첫 국가
  const cutoff = opts.nowMs - RECENT_TRIP_WINDOW_MS;
  const recent = opts.recentTrips
    .filter((r) => r.timestamp >= cutoff && r.timestamp <= opts.nowMs)
    .sort((a, b) => b.timestamp - a.timestamp);

  for (const r of recent) {
    const code = countryNameToIso2(r.countryName);
    if (code && code !== home) return code;
  }

  // ③ 미지정
  return null;
}
