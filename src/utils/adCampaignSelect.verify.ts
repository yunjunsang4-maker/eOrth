/**
 * adCampaignSelect 검증 — npx tsx src/utils/adCampaignSelect.verify.ts
 */
import {
  isCampaignLive, eligibleCampaigns, pickCampaign,
  countryNameToIso2, resolveTargetCountry,
  type AdCampaign,
} from './adCampaignSelect';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n  want=${JSON.stringify(want)}\n  got =${JSON.stringify(got)}`}`);
};

const NOW = Date.parse('2026-07-26T00:00:00Z');
const DAY = 86400000;

const base: AdCampaign = {
  id: 'c0', slug: 's0', partner: 'airalo',
  headlineKo: '가', headlineEn: 'a',
  imageUrl: 'http://i/0', clickUrl: 'http://c/0',
  disclosureKo: null, disclosureEn: null,
  targetCountries: [], locales: ['ko', 'en'],
  weight: 1, startsAt: null, endsAt: null,
};
const mk = (over: Partial<AdCampaign>): AdCampaign => ({ ...base, ...over });

// ── 기간 판정 ──
eq('기간 무제한은 항상 live', isCampaignLive(base, NOW), true);
eq('시작 전이면 아님', isCampaignLive(mk({ startsAt: NOW + DAY }), NOW), false);
eq('종료 후면 아님', isCampaignLive(mk({ endsAt: NOW - DAY }), NOW), false);
eq('기간 내면 live', isCampaignLive(mk({ startsAt: NOW - DAY, endsAt: NOW + DAY }), NOW), true);

// ── 언어 필터 ──
const koOnly = mk({ id: 'ko1', slug: 'ko1', locales: ['ko'] });
eq('ko 사용자에게 ko 전용 노출',
  eligibleCampaigns([koOnly], { nowMs: NOW, locale: 'ko', countryCode: null }).map((c) => c.id), ['ko1']);
eq('en 사용자에게 ko 전용 미노출',
  eligibleCampaigns([koOnly], { nowMs: NOW, locale: 'en', countryCode: null }).map((c) => c.id), []);

// ── 국가 필터 ──
const jp = mk({ id: 'jp1', slug: 'jp1', targetCountries: ['JP'] });
const any = mk({ id: 'any1', slug: 'any1', targetCountries: [] });
eq('JP 사용자에게 JP 캠페인 노출',
  eligibleCampaigns([jp], { nowMs: NOW, locale: 'ko', countryCode: 'JP' }).map((c) => c.id), ['jp1']);
eq('FR 사용자에게 JP 캠페인 미노출',
  eligibleCampaigns([jp], { nowMs: NOW, locale: 'ko', countryCode: 'FR' }).map((c) => c.id), []);
eq('국가 미지정 사용자에게 JP 캠페인 미노출',
  eligibleCampaigns([jp], { nowMs: NOW, locale: 'ko', countryCode: null }).map((c) => c.id), []);
eq('전체 대상 캠페인은 국가 미지정에도 노출',
  eligibleCampaigns([any], { nowMs: NOW, locale: 'ko', countryCode: null }).map((c) => c.id), ['any1']);
eq('소문자 국가코드도 매칭',
  eligibleCampaigns([jp], { nowMs: NOW, locale: 'ko', countryCode: 'jp' }).map((c) => c.id), ['jp1']);

// ── 우선순위: 국가 매칭이 전체 대상보다 앞선다 ──
eq('국가 매칭 우선',
  eligibleCampaigns([any, jp], { nowMs: NOW, locale: 'ko', countryCode: 'JP' }).map((c) => c.id), ['jp1', 'any1']);

// ── weight: 큰 것이 앞 ──
const w5 = mk({ id: 'w5', slug: 'w5', weight: 5 });
const w1 = mk({ id: 'w1', slug: 'w1', weight: 1 });
eq('weight 내림차순',
  eligibleCampaigns([w1, w5], { nowMs: NOW, locale: 'ko', countryCode: null }).map((c) => c.id), ['w5', 'w1']);

// ── 슬롯 회전: 같은 캠페인이 연속으로 나오지 않는다 ──
const three = [mk({ id: 'a', slug: 'a' }), mk({ id: 'b', slug: 'b' }), mk({ id: 'c', slug: 'c' })];
const at = (slot: number) => pickCampaign(three, { nowMs: NOW, locale: 'ko', countryCode: null, slot })?.id;
eq('slot0', at(0), 'a');
eq('slot1', at(1), 'b');
eq('slot2', at(2), 'c');
eq('slot3 회전', at(3), 'a');

// ── 후보 없음 ──
eq('빈 목록이면 null', pickCampaign([], { nowMs: NOW, locale: 'ko', countryCode: null, slot: 0 }), null);
eq('전부 만료면 null',
  pickCampaign([mk({ endsAt: NOW - DAY })], { nowMs: NOW, locale: 'ko', countryCode: null, slot: 0 }), null);

// ── 국가명 → ISO2 ──
eq('일본→JP', countryNameToIso2('일본'), 'JP');
eq('대한민국→KR', countryNameToIso2('대한민국'), 'KR');
eq('모르는 이름은 null', countryNameToIso2('없는나라'), null);
eq('빈 값은 null', countryNameToIso2(null), null);

// ── 대상 국가 산출 ──
const noTrips: { countryName: string | null; timestamp: number }[] = [];

eq('여행 중이면 방문국',
  resolveTargetCountry({
    currentVisitedCountryCode: 'JP', homeCountryCode: 'KR', recentTrips: noTrips, nowMs: NOW,
  }), 'JP');

eq('방문국==거주국이면 여행 중 아님',
  resolveTargetCountry({
    currentVisitedCountryCode: 'KR', homeCountryCode: 'KR', recentTrips: noTrips, nowMs: NOW,
  }), null);

eq('여행 중 아니면 최근 30일 기록의 국가',
  resolveTargetCountry({
    currentVisitedCountryCode: 'KR', homeCountryCode: 'KR', nowMs: NOW,
    recentTrips: [{ countryName: '태국', timestamp: NOW - 10 * DAY }],
  }), 'TH');

eq('30일보다 오래된 기록은 무시',
  resolveTargetCountry({
    currentVisitedCountryCode: 'KR', homeCountryCode: 'KR', nowMs: NOW,
    recentTrips: [{ countryName: '태국', timestamp: NOW - 40 * DAY }],
  }), null);

eq('최근 기록이 여럿이면 가장 최신',
  resolveTargetCountry({
    currentVisitedCountryCode: 'KR', homeCountryCode: 'KR', nowMs: NOW,
    recentTrips: [
      { countryName: '태국', timestamp: NOW - 20 * DAY },
      { countryName: '일본', timestamp: NOW - 3 * DAY },
    ],
  }), 'JP');

eq('최근 기록이 거주국이면 무시',
  resolveTargetCountry({
    currentVisitedCountryCode: 'KR', homeCountryCode: 'KR', nowMs: NOW,
    recentTrips: [{ countryName: '대한민국', timestamp: NOW - 3 * DAY }],
  }), null);

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
if (fail > 0) process.exit(1);
