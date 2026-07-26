# 피드 광고 실수익화 (제휴 + AdMob) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소셜 피드의 폴라로이드 광고 슬롯을 하우스 광고 고정에서 「제휴 캠페인 → AdMob 네이티브 → 하우스」 3단 소스 체인으로 전환한다.

**Architecture:** `SocialScreen`의 슬롯 생성 로직은 그대로 두고, 렌더 지점만 `FeedAdSlot` 래퍼로 바꾼다. 래퍼가 훅을 호출해 소스를 결정하고 세 종류의 카드 중 하나를 그린다. 제휴 캠페인은 Supabase 원격 테이블에서 받아 캐시하고, 국가 매칭은 전적으로 클라이언트에서 수행한다.

**Tech Stack:** React Native (Expo SDK 54, RN 0.81.5, New Architecture) · TypeScript · Supabase · `react-native-google-mobile-ads` v16.4.0 · `@react-native-async-storage/async-storage`

설계 근거: `docs/superpowers/specs/2026-07-26-feed-ads-affiliate-admob-design.md`

---

## Global Constraints

- **모든 주석·문구·커밋 메시지는 한글로 작성한다.**
- **지시한 파일만 수정한다.** 이 계획에 명시되지 않은 파일은 건드리지 않는다.
- **작업 트리에 사용자의 미커밋 WIP이 다수 존재한다.** 커밋할 때 `git add .`를 절대 쓰지 말고, 각 Task의 `git add`에 나열된 파일만 개별 스테이징한다.
- **`src/components/ads/FeedAdCard.tsx`의 로직·애니메이션은 변경하지 않는다.** Task 1의 스타일 import 전환만 허용된다.
- **`SocialScreen.tsx`의 스티커 오버레이 경로(2909~2923행 부근)는 수정하지 않는다.**
- **`timelineWithAds` useMemo의 슬롯 삽입 규칙(주기·마지막 게시물 제외·프리미엄 게이트)은 변경하지 않는다.** Task 5에서 `adSlotIndex` 필드 추가만 허용된다.
- 테스트 프레임워크는 jest가 아니다. 순수 로직 검증은 `src/**/*.verify.ts` 파일로 작성하고 `npm test`(= `node scripts/run-verify.mjs`)로 실행한다. 각 verify 파일은 자체 `pass`/`fail` 카운터로 `PASS`/`FAIL`을 출력하고 실패 시 `process.exit(1)` 한다.
- 타입 체크는 `npx tsc --noEmit`.
- 디자인 토큰 — 배경 `#0A0A0F` · 카드 `#2E2E3B` · 보라 네온 `#BF85FC` · 보라 딥 `#6B21A8` · 텍스트 흐림 `#A1A1B0` · 구분선 `#1A1A26` · 빨강 `#FF3B30`
- AdMob 광고 단위는 **개발·preview 채널에서 반드시 `TestIds.NATIVE`를 사용한다.** 실제 광고를 개발 중 클릭하면 무효 트래픽으로 계정이 정지된다.
- 광고 요청에는 항상 `requestNonPersonalizedAdsOnly: true`를 붙인다. ATT는 요청하지 않으며 `app.json`에 `userTrackingUsageDescription`을 넣지 않는다.

---

## File Structure

### 신규

| 파일 | 책임 |
|---|---|
| `src/components/ads/adPolaroidStyles.ts` | 폴라로이드 스킨 공용 스타일 (하우스·제휴·AdMob 카드가 공유) |
| `src/services/adCampaigns.ts` | Supabase 캠페인 조회 · AsyncStorage 캐시 · 클릭 집계 |
| `src/utils/adCampaignSelect.ts` | 순수 선택 로직 (국가 필터 · 언어 필터 · 기간 검증 · weight 회전) |
| `src/utils/adCampaignSelect.verify.ts` | 위 순수 로직 검증 |
| `src/components/ads/AffiliatePolaroidCard.tsx` | 제휴 카드 렌더러 |
| `src/hooks/useFeedAdSource.ts` | 슬롯별 소스 결정 + AdMob 생명주기 |
| `src/components/ads/FeedAdSlot.tsx` | 훅 호출 지점 + 3단 분기 |
| `src/constants/adUnits.ts` | AdMob 앱·단위 ID 채널 분기 |
| `src/components/ads/AdMobPolaroidCard.tsx` | `NativeAdView` 기반 카드 |

### 수정

| 파일 | 변경 |
|---|---|
| `src/components/ads/FeedAdCard.tsx` | 스타일을 공용 모듈에서 import (Task 1) |
| `src/constants/featureFlags.ts` | `AFFILIATE_ADS_ENABLED` · `ADMOB_ENABLED` 추가 |
| `src/screens/SocialScreen.tsx` | `_adSlot` 렌더 분기 교체 + `adSlotIndex` 필드 추가 |
| `supabase/schema.sql` | 섹션 11) 광고 캠페인 |
| `app.json` | 광고 플러그인 · iOS 앱 ID · SKAdNetwork |
| `App.tsx` (또는 실제 진입점) | `mobileAds().initialize()` |
| `docs/privacy-policy.md` / `docs/privacy-policy.html` | 광고 조항 |

---

## Task 1: 폴라로이드 스킨 공용 스타일 추출

`FeedAdCard`, `AffiliatePolaroidCard`, `AdMobPolaroidCard`가 같은 폴라로이드 겉모습을 공유해야 한다. 지금 스타일이 `FeedAdCard` 안에 갇혀 있으므로 먼저 꺼낸다. 순수 리팩터링이며 화면에 보이는 결과는 바뀌지 않는다.

**Files:**
- Create: `src/components/ads/adPolaroidStyles.ts`
- Modify: `src/components/ads/FeedAdCard.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `polaroidStyles` — `{ wrap, back, front, media, caption, badge, badgeText, mediaEmoji }` 각각 RN 스타일 객체. `SERIF` — `string | undefined` (플랫폼별 세리프 폰트명).

- [ ] **Step 1: 현재 `FeedAdCard.tsx`를 읽어 스타일 정의를 확인한다**

`const s = StyleSheet.create({...})` 블록(141행 부근)에서 아래 키를 확인한다. 폴라로이드 계열 `wrap` `back` `front` `media` `caption`, 공통 `badge` `badgeText` `mediaEmoji`, 스티커 계열 `stickerFrame` `stickerOverlay` `stickerOverlayRight` `stickerOverlayLeft` `stickerPhoto` `stickerEmoji` `stickerTitle`.

**스티커 계열 스타일은 옮기지 않는다.** 스티커는 하우스 전용으로 남으므로 `FeedAdCard`에 그대로 둔다.

- [ ] **Step 2: 공용 스타일 파일을 만든다**

`src/components/ads/adPolaroidStyles.ts`:

```ts
// 피드 광고 폴라로이드 카드 공용 스킨.
//
// 하우스(FeedAdCard) · 제휴(AffiliatePolaroidCard) · AdMob(AdMobPolaroidCard)
// 세 렌더러가 같은 겉모습을 공유한다. AdMob 네이티브는 자산을 NativeAdView 안에서
// NativeAsset으로 감싸야 해서 컴포넌트를 합칠 수 없고, 스타일만 공유한다.
//
// 값은 피드 기록 카드(SocialScreen d.polaWrap/polaBack/polaFront/polaImg/polaCap)와
// 동일하게 맞춘 것이므로 임의로 바꾸지 말 것 — 마소너리 레이아웃이 어긋난다.
import { StyleSheet, Platform } from 'react-native';

export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const polaroidStyles = StyleSheet.create({
  wrap: {},
  back: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2B2B30',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 0,
    transform: [{ rotate: '-5deg' }],
  },
  front: {
    backgroundColor: '#333337',
    borderRadius: 0,
    padding: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: '#2A2735',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { color: '#FFFFFF', fontSize: 12, paddingTop: 8 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  mediaEmoji: {
    fontSize: 44,
  },
});
```

- [ ] **Step 3: `FeedAdCard.tsx`가 공용 스타일을 쓰도록 바꾼다**

파일 상단 import에 추가:

```ts
import { polaroidStyles, SERIF } from './adPolaroidStyles';
```

기존 `const SERIF = Platform.select({...});` 한 줄을 **삭제**한다(공용 모듈 것을 쓴다).

`const s = StyleSheet.create({...})`에서 폴라로이드·공통 키(`wrap` `back` `front` `media` `caption` `badge` `badgeText` `mediaEmoji`)를 **삭제**하고 스티커 키(`stickerFrame` `stickerOverlay` `stickerOverlayRight` `stickerOverlayLeft` `stickerPhoto` `stickerEmoji` `stickerTitle`)만 남긴다.

컴포넌트 본문에서 삭제한 키를 참조하던 곳을 `polaroidStyles.*`로 바꾼다. 구체적으로:

- 스티커 분기의 `s.badge` → `polaroidStyles.badge`, `s.badgeText` → `polaroidStyles.badgeText`
- 폴라로이드 분기의 `s.wrap` → `polaroidStyles.wrap`, `s.back` → `polaroidStyles.back`, `s.front` → `polaroidStyles.front`, `s.media` → `polaroidStyles.media`, `s.mediaEmoji` → `polaroidStyles.mediaEmoji`, `s.badge` → `polaroidStyles.badge`, `s.badgeText` → `polaroidStyles.badgeText`, `s.caption` → `polaroidStyles.caption`

`Platform`이 더 이상 쓰이지 않으면 `react-native` import에서 제거한다.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음 (0 errors)

- [ ] **Step 5: 앱을 띄워 광고 카드 겉모습이 그대로인지 확인**

Run: `npx expo start`

소셜 탭에서 게시물 2개 이상인 상태로 폴라로이드 광고 카드와 스티커 오버레이가 이전과 동일하게 보이는지 눈으로 확인한다. 스티커의 붙었다 떼어지는 애니메이션도 그대로여야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/ads/adPolaroidStyles.ts src/components/ads/FeedAdCard.tsx
git commit -m "refactor(ads): 폴라로이드 스킨 스타일을 공용 모듈로 추출

제휴·AdMob 카드가 같은 겉모습을 공유해야 하는데 스타일이 FeedAdCard에
갇혀 있었다. 스티커 전용 스타일은 하우스 전용이라 그대로 남긴다."
```

---

## Task 2: 캠페인 스키마 (Supabase)

**Files:**
- Modify: `supabase/schema.sql` (파일 끝에 섹션 11) 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `ad_campaigns` 테이블, `log_ad_click(p_campaign_id uuid)` RPC

- [ ] **Step 1: `supabase/schema.sql` 끝부분의 기존 섹션 스타일을 확인한다**

Run: `tail -40 supabase/schema.sql`

섹션 헤더가 `-- ====...`로 감싸인 번호 형식(`-- 10-g) ...`)임을 확인한다. 마지막 섹션 번호가 10-g이므로 새 섹션은 11)이 된다.

- [ ] **Step 2: 파일 끝에 섹션 11)을 추가한다**

```sql
-- ============================================================
-- 11) 피드 광고 캠페인 — 제휴(어필리에이트) 캠페인 원격 관리
-- ============================================================
-- 앱 업데이트 없이 캠페인을 교체·종료하기 위해 서버에서 관리한다.
-- 국가 타겟팅(target_countries)은 서버가 아니라 클라이언트에서 필터링한다 —
-- 사용자의 여행 국가를 서버로 보내지 않기 위함(개인정보처리방침 부담 회피).
-- 따라서 조회는 활성 캠페인 전체를 내려주고, 매칭은 앱이 한다.

create table if not exists public.ad_campaigns (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  partner           text not null,               -- airalo / klook / coupang / getyourguide
  headline_ko       text not null,
  headline_en       text not null,
  image_url         text not null,
  click_url         text not null,
  disclosure_ko     text,                        -- 제휴사 필수 고지 문구(쿠팡 등)
  disclosure_en     text,
  target_countries  text[] not null default '{}',-- ISO2 대문자. 빈 배열이면 전체 대상
  locales           text[] not null default '{ko,en}',
  weight            int  not null default 1,
  starts_at         timestamptz,
  ends_at           timestamptz,
  active            boolean not null default true,
  click_count       int  not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists ad_campaigns_active_idx
  on public.ad_campaigns (active, starts_at, ends_at);

alter table public.ad_campaigns enable row level security;

-- 조회: 활성이고 기간 내인 행만 누구나(비로그인 포함) 볼 수 있다.
drop policy if exists ad_campaigns_select_active on public.ad_campaigns;
create policy ad_campaigns_select_active on public.ad_campaigns
  for select
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

-- 삽입·수정·삭제 정책 없음 → service_role(정책 우회)만 쓰기 가능.

-- 클릭 집계: 익명 카운터. 사용자 식별자를 저장하지 않는다.
-- (노출은 집계하지 않는다 — 스크롤마다 RPC가 나가고 방침에 항목이 늘어난다.)
create or replace function public.log_ad_click(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_campaigns
     set click_count = click_count + 1
   where id = p_campaign_id;
$$;

grant execute on function public.log_ad_click(uuid) to anon, authenticated;
```

- [ ] **Step 3: Supabase 대시보드에서 schema.sql을 재실행한다**

Supabase 프로젝트(`blweolnunmsxgztmvzfd`)의 SQL Editor에서 `supabase/schema.sql` 전체를 붙여넣어 실행한다. 이 저장소의 관행상 schema.sql은 멱등(`if not exists` / `create or replace`)하게 작성되어 전체 재실행이 안전하다.

**이 단계는 사람이 직접 수행해야 한다.** 에이전트로 실행 중이라면 여기서 멈추고 사용자에게 재실행을 요청한다.

- [ ] **Step 4: 테이블과 RPC가 생성됐는지 확인한다**

Supabase SQL Editor에서:

```sql
select count(*) from public.ad_campaigns;
select public.log_ad_click('00000000-0000-0000-0000-000000000000'::uuid);
```

Expected: 첫 쿼리 `0`, 두 번째 쿼리 오류 없이 완료(존재하지 않는 id라 아무 행도 갱신되지 않지만 함수는 정상 동작).

- [ ] **Step 5: 테스트용 캠페인 한 건을 넣는다**

실제 제휴 승인 전까지 개발용으로 쓸 더미 캠페인이다. SQL Editor에서 실행한다.

```sql
insert into public.ad_campaigns
  (slug, partner, headline_ko, headline_en, image_url, click_url,
   disclosure_ko, disclosure_en, target_countries, weight)
values
  ('dev-sample-esim', 'airalo',
   '일본 여행, 데이터는 미리 준비하세요',
   'Stay connected in Japan',
   'https://placehold.co/600x600/2A2735/BF85FC/png?text=eSIM',
   'https://example.com/dev-placeholder',
   '제휴 링크가 포함되어 있으며 구매 시 일정액의 수수료를 받습니다.',
   'This post contains affiliate links.',
   '{JP}', 1)
on conflict (slug) do nothing;
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(ads): ad_campaigns 테이블·RLS·클릭 집계 RPC 추가

제휴 캠페인을 앱 업데이트 없이 교체하기 위한 원격 테이블.
국가 타겟팅은 클라이언트가 하므로 조회는 활성 캠페인 전체를 내려준다
(사용자 여행 국가를 서버로 보내지 않기 위함).
노출은 집계하지 않고 클릭만 익명 카운터로 센다."
```

---

## Task 3: 캠페인 선택 순수 로직

네트워크·저장소와 무관한 순수 함수로 분리해 `*.verify.ts`로 검증한다. 국가·언어·기간 필터와 회전 규칙이 여기 모인다.

**Files:**
- Create: `src/utils/adCampaignSelect.ts`
- Create: `src/utils/adCampaignSelect.verify.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type AdCampaign` — `{ id, slug, partner, headlineKo, headlineEn, imageUrl, clickUrl, disclosureKo, disclosureEn, targetCountries: string[], locales: string[], weight: number, startsAt: number | null, endsAt: number | null }`
  - `isCampaignLive(c: AdCampaign, nowMs: number): boolean`
  - `eligibleCampaigns(all: AdCampaign[], opts: { nowMs: number; locale: string; countryCode: string | null }): AdCampaign[]`
  - `pickCampaign(all: AdCampaign[], opts: { nowMs: number; locale: string; countryCode: string | null; slot: number }): AdCampaign | null`
  - `countryNameToIso2(koreanName: string | null | undefined): string | null`
  - `resolveTargetCountry(opts: { currentVisitedCountryCode: string | null; homeCountryCode: string | null; recentTrips: { countryName: string | null; timestamp: number }[]; nowMs: number }): string | null`

- [ ] **Step 1: 검증 파일을 먼저 작성한다 (실패하는 테스트)**

`src/utils/adCampaignSelect.verify.ts`:

```ts
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx tsx src/utils/adCampaignSelect.verify.ts`
Expected: FAIL — `Cannot find module './adCampaignSelect'`

- [ ] **Step 3: 구현한다**

`src/utils/adCampaignSelect.ts`:

```ts
// 제휴 캠페인 선택 순수 로직 — 네트워크·저장소와 무관하므로 단독 검증 가능하다.
// (검증: src/utils/adCampaignSelect.verify.ts)
//
// 국가 매칭을 서버가 아니라 여기서 하는 이유: 사용자의 여행 국가를 서버로 보내지
// 않기 위함이다. 활성 캠페인 전체를 받아 앱 안에서만 걸러낸다.

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
```

import를 파일 상단에 추가한다:

```ts
import { COUNTRIES } from '../constants/countries';
```

- [ ] **Step 4: 검증을 통과시킨다**

Run: `npx tsx src/utils/adCampaignSelect.verify.ts`
Expected: 모든 줄 `PASS`, 마지막에 `ALL PASS`

- [ ] **Step 5: 전체 검증과 타입 체크**

Run: `npm test`
Expected: `✅ 전체 통과 (18개 파일)` — 기존 17개 + 신규 1개

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/utils/adCampaignSelect.ts src/utils/adCampaignSelect.verify.ts
git commit -m "feat(ads): 제휴 캠페인 선택 순수 로직 + 검증

국가·언어·기간 필터와 슬롯 회전 규칙. 국가 매칭을 클라이언트에서 하므로
사용자 여행 국가가 서버로 나가지 않는다."
```

---

## Task 4: 캠페인 조회 서비스 (Supabase + 캐시)

**Files:**
- Create: `src/services/adCampaigns.ts`

**Interfaces:**
- Consumes: `AdCampaign` (Task 3)
- Produces:
  - `fetchAdCampaigns(): Promise<AdCampaign[]>` — 캐시 우선, TTL 6시간, 실패 시 캐시 폴백, 캐시도 없으면 `[]`
  - `logAdClick(campaignId: string): Promise<void>` — 실패해도 throw하지 않음

- [ ] **Step 1: 기존 Supabase 서비스 파일의 관행을 확인한다**

Run: `head -40 src/services/supabase.ts`

`supabase` 클라이언트를 어떻게 export하는지, 환경변수 미설정 시 null을 반환하는지 확인한다. 아래 구현은 `supabase`가 `SupabaseClient | null`인 경우를 가정한다. 실제 export 형태가 다르면 그에 맞춘다.

- [ ] **Step 2: 구현한다**

`src/services/adCampaigns.ts`:

```ts
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
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

`supabase`가 null 가능 타입이 아니라면 `if (!supabase)` 가드에서 타입 오류가 날 수 있다. 그 경우 Step 1에서 확인한 실제 export 형태에 맞춰 가드를 조정한다.

- [ ] **Step 4: 커밋**

```bash
git add src/services/adCampaigns.ts
git commit -m "feat(ads): 캠페인 조회 서비스 — 캐시 6시간·오프라인 폴백·클릭 집계

네트워크 실패 시 만료 캐시라도 반환한다(빈 슬롯보다 낫다).
기간 만료 캠페인은 선택 단계에서 걸러지므로 안전하다."
```

---

## Task 5: 제휴 카드 렌더러

**Files:**
- Create: `src/components/ads/AffiliatePolaroidCard.tsx`

**Interfaces:**
- Consumes: `AdCampaign` (Task 3), `logAdClick` (Task 4), `polaroidStyles`·`SERIF` (Task 1)
- Produces: `AffiliatePolaroidCard` — props `{ campaign: AdCampaign; tilt?: number; onFallback?: () => void }`

- [ ] **Step 1: 기존 i18n 키를 확인한다**

Run: `grep -n "adBadge" src/i18n/locales/ko.ts src/i18n/locales/en.ts`

`social.adBadge`가 이미 존재한다(「광고」 배지 문구). 이 키를 그대로 재사용하므로 i18n 파일은 수정하지 않는다.

- [ ] **Step 2: 구현한다**

`src/components/ads/AffiliatePolaroidCard.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AdCampaign } from '../../utils/adCampaignSelect';
import { logAdClick } from '../../services/adCampaigns';
import { polaroidStyles, SERIF } from './adPolaroidStyles';

// 제휴(어필리에이트) 광고 카드 — 하우스 폴라로이드와 같은 스킨을 쓴다.
//
// 링크는 시스템 브라우저로 연다. 커스텀 WebView로 열면 Amazon Associates의
// WebView 금지 조항에 걸리고, 나중에 아마존을 붙일 여지가 사라진다.
//
// 고지 문구(disclosure)는 제휴사마다 필수 문안이 다르므로 캠페인 데이터로 받아
// 캡션 아래에 렌더한다. 84px 스티커에는 물리적으로 들어가지 않기 때문에
// 제휴 광고는 폴라로이드 슬롯 전용이다.

interface Props {
  campaign: AdCampaign;
  /** 폴라로이드 기울기(도) */
  tilt?: number;
  /** 이미지 로드 실패 시 상위에 알려 하우스 카드로 강등시킨다 */
  onFallback?: () => void;
}

export default function AffiliatePolaroidCard({ campaign, tilt = -3, onFallback }: Props) {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language?.startsWith('ko');
  const [imageFailed, setImageFailed] = useState(false);

  const headline = isKo ? campaign.headlineKo : campaign.headlineEn;
  const disclosure = isKo ? campaign.disclosureKo : campaign.disclosureEn;

  const handlePress = async () => {
    // 집계 실패가 링크 이동을 막지 않도록 await하지 않는다.
    void logAdClick(campaign.id);
    try {
      await Linking.openURL(campaign.clickUrl);
    } catch {
      // 열 수 없는 URL은 조용히 무시한다.
    }
  };

  // 이미지가 깨지면 빈 사각형이 남으므로 상위에 알려 하우스 카드로 바꾼다.
  const handleImageError = () => {
    setImageFailed(true);
    onFallback?.();
  };

  if (imageFailed) return null;

  return (
    <TouchableOpacity
      style={[polaroidStyles.wrap, { transform: [{ rotate: `${tilt}deg` }] }]}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${t('social.adBadge')} · ${headline}`}
    >
      <View style={polaroidStyles.back} pointerEvents="none" />
      <View style={polaroidStyles.front}>
        <View style={polaroidStyles.media}>
          <Image
            source={{ uri: campaign.imageUrl }}
            style={s.image}
            resizeMode="cover"
            onError={handleImageError}
          />
          <View style={polaroidStyles.badge}>
            <Text style={polaroidStyles.badgeText}>{t('social.adBadge')}</Text>
          </View>
        </View>
        <Text style={[polaroidStyles.caption, { fontFamily: SERIF }]} numberOfLines={1}>
          {headline}
        </Text>
        {!!disclosure && (
          <Text style={s.disclosure} numberOfLines={2}>{disclosure}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  // 제휴사 필수 고지 — 작지만 반드시 읽히는 크기를 유지한다.
  disclosure: {
    color: '#A1A1B0',
    fontSize: 9,
    lineHeight: 12,
    paddingTop: 4,
  },
});
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/ads/AffiliatePolaroidCard.tsx
git commit -m "feat(ads): 제휴 광고 카드 렌더러

하우스 폴라로이드와 같은 스킨. 링크는 시스템 브라우저로 연다
(WebView는 Amazon Associates 조항 위반). 제휴사 필수 고지 문구를
캡션 아래 렌더하고, 이미지 로드 실패 시 하우스로 강등한다."
```

---

## Task 6: 소스 결정 훅 + 슬롯 래퍼 + 배선 (제휴 ↔ 하우스 2단)

이 시점에 앱이 실제로 동작한다. AdMob은 Task 8에서 이 구조에 끼워 넣는다.

**Files:**
- Create: `src/hooks/useFeedAdSource.ts`
- Create: `src/components/ads/FeedAdSlot.tsx`
- Modify: `src/constants/featureFlags.ts`
- Modify: `src/screens/SocialScreen.tsx`

**Interfaces:**
- Consumes: `pickCampaign`·`AdCampaign` (Task 3), `fetchAdCampaigns` (Task 4), `AffiliatePolaroidCard` (Task 5), `FeedAdCard`·`getHouseAd`
- Produces:
  - `useFeedAdSource(slot: number): { kind: 'affiliate'; campaign: AdCampaign } | { kind: 'house' }`
  - `FeedAdSlot` — props `{ slot: number; houseAd: HouseAd; tilt: number }`

- [ ] **Step 1: 피처 플래그를 추가한다**

`src/constants/featureFlags.ts` 파일 끝에 추가:

```ts
/**
 * 제휴(어필리에이트) 캠페인 광고 활성화 여부.
 * 캠페인이 0건이면 자동으로 하우스 광고로 떨어지므로 전 채널 활성으로 둔다.
 */
export const AFFILIATE_ADS_ENABLED = true;

/**
 * AdMob 네이티브 광고 활성화 여부.
 * 실제 광고 단위 ID를 발급받기 전까지는 false로 잠근다 — 켜도 테스트 광고만 나온다.
 */
export const ADMOB_ENABLED = false;
```

- [ ] **Step 2: 국가·기록 데이터의 실제 접근 경로를 확인한다**

Run: `grep -n "currentVisitedCountryCode\|homeCountryCode" src/store/settingsStore.tsx | head -8`

`settingsStore`에 `currentVisitedCountryCode: string`(기본값 `'KR'`)과 `homeCountryCode`가 있다. **실제 여행 감지 전에는 방문국에 거주국가 값이 들어 있으므로** 두 값이 같으면 여행 중이 아니라고 판단해야 한다. 이 판정은 Task 3의 `resolveTargetCountry`가 이미 담당한다.

Run: `grep -n "export const useRecords\|export function useRecords" src/store/recordStore.tsx`

Run: `grep -n "countryName" src/store/recordStore.tsx | head -5`

기록 목록을 노출하는 훅 이름과, 기록에 `countryName`(한글 국가명)·`timestamp`가 있는지 확인한다. 훅 이름이나 목록 필드가 다르면 Step 3 코드에서 그에 맞춰 조정한다 — 필요한 것은 **국가명과 시각을 가진 기록 배열** 하나뿐이다.

- [ ] **Step 3: 훅을 구현한다**

`src/hooks/useFeedAdSource.ts`:

```ts
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
  const { trips } = useRecords();
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
    recentTrips: trips.map((r: any) => ({
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
```

Step 2에서 확인한 실제 훅 이름·목록 필드명에 맞춰 `useRecords()`와 `trips` 부분을 조정한다.

- [ ] **Step 4: 슬롯 래퍼를 구현한다**

`src/components/ads/FeedAdSlot.tsx`:

```tsx
import React, { useState } from 'react';
import { useFeedAdSource } from '../../hooks/useFeedAdSource';
import AffiliatePolaroidCard from './AffiliatePolaroidCard';
import FeedAdCard from './FeedAdCard';
import type { HouseAd } from '../../constants/houseAds';

// 광고 슬롯 하나를 그리는 래퍼.
//
// 존재 이유: SocialScreen의 columns[ci].map(...) 안에서는 훅을 호출할 수 없다.
// 소스 결정(훅)과 렌더 분기를 이 컴포넌트가 떠안는다.

interface Props {
  /** 폴라로이드 슬롯 순번 (0부터) */
  slot: number;
  /** 제휴·AdMob이 모두 없을 때 그릴 하우스 광고 */
  houseAd: HouseAd;
  /** 폴라로이드 기울기(도) */
  tilt: number;
}

export default function FeedAdSlot({ slot, houseAd, tilt }: Props) {
  const source = useFeedAdSource(slot);
  // 제휴 이미지가 깨지면 이 슬롯은 남은 세션 동안 하우스로 고정한다.
  const [degraded, setDegraded] = useState(false);

  if (source.kind === 'affiliate' && !degraded) {
    return (
      <AffiliatePolaroidCard
        campaign={source.campaign}
        tilt={tilt}
        onFallback={() => setDegraded(true)}
      />
    );
  }

  return (
    <FeedAdCard
      ad={houseAd}
      variant="polaroid"
      tilt={tilt}
      onPress={() => { /* 하우스 광고는 눌러도 이동 없음 */ }}
    />
  );
}
```

- [ ] **Step 5: `SocialScreen`에 슬롯 순번 필드를 추가한다**

`src/screens/SocialScreen.tsx`의 `timelineWithAds` useMemo 안, 폴라로이드 슬롯을 push하는 객체(2728~2735행 부근)에 `adSlotIndex`를 추가한다. **다른 필드와 삽입 규칙은 건드리지 않는다.**

```ts
        out.push({
          _adSlot: true,
          id: `ad-slot-${polaroidSlot}`,
          adSlotIndex: polaroidSlot,          // ← 추가: FeedAdSlot이 소스를 고를 때 쓴다
          ad: getHouseAd(polaroidSlot),
          adVariant: 'polaroid' as FeedAdVariant,
          adTilt: polaroidSlot % 2 === 0 ? -3 : 3,
        });
```

- [ ] **Step 6: `SocialScreen`의 렌더 분기를 교체한다**

같은 파일 2877~2887행 부근의 `_adSlot` 분기를 아래로 바꾼다.

변경 전:

```tsx
                  if (item._adSlot) {
                    return (
                      <FeedAdCard
                        key={item.id}
                        ad={item.ad as HouseAd}
                        variant={item.adVariant}
                        tilt={item.adTilt}
                        onPress={() => { /* 광고 클릭 임시 비활성화 — 눌러도 이동 없음 */ }}
                      />
                    );
                  }
```

변경 후:

```tsx
                  if (item._adSlot) {
                    return (
                      <FeedAdSlot
                        key={item.id}
                        slot={item.adSlotIndex as number}
                        houseAd={item.ad as HouseAd}
                        tilt={item.adTilt as number}
                      />
                    );
                  }
```

파일 상단 import에 추가:

```ts
import FeedAdSlot from '../components/ads/FeedAdSlot';
```

**`FeedAdCard` import는 지우지 않는다** — 스티커 오버레이 경로(2913행 부근)가 계속 사용한다.

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 8: 실기기·시뮬레이터에서 세 경로를 확인한다**

Run: `npx expo start`

확인 항목:

1. **하우스 경로** — Task 2 Step 5의 더미 캠페인은 `target_countries='{JP}'`이므로 평상시(여행 중 아님)에는 후보에서 빠진다. 폴라로이드 슬롯에 기존 하우스 광고가 그대로 보여야 한다.
2. **제휴 경로** — Supabase SQL Editor에서 더미 캠페인을 전체 대상으로 바꾼다:
   ```sql
   update public.ad_campaigns set target_countries = '{}' where slug = 'dev-sample-esim';
   ```
   앱을 완전히 종료 후 재실행(모듈 스코프 캐시와 AsyncStorage TTL 때문). 폴라로이드 슬롯에 제휴 카드(플레이스홀더 이미지 + 「광고」 배지 + 고지 문구)가 보여야 한다. 탭하면 시스템 브라우저가 열린다.
3. **프리미엄 게이트** — 설정에서 프리미엄 토글을 켜면 광고 슬롯 자체가 사라져야 한다.
4. **회귀** — 스티커 오버레이가 게시물 위에서 붙었다 떼어지는 애니메이션이 그대로여야 하고, 마소너리 2단 레이아웃과 메이트 추천 카드도 이전과 같아야 한다.

확인이 끝나면 더미 캠페인을 원래대로 되돌린다:
```sql
update public.ad_campaigns set target_countries = '{JP}' where slug = 'dev-sample-esim';
```

- [ ] **Step 9: 커밋**

```bash
git add src/hooks/useFeedAdSource.ts src/components/ads/FeedAdSlot.tsx src/constants/featureFlags.ts src/screens/SocialScreen.tsx
git commit -m "feat(ads): 피드 광고 슬롯을 제휴↔하우스 2단 소스로 전환

map 안에서 훅을 부를 수 없어 FeedAdSlot 래퍼를 둔다. 로딩 중과 후보
없음은 하우스로 떨어지므로 슬롯이 비지 않는다. 여행 중이 아니면
(방문국==거주국) 국가 미지정으로 취급해 엉뚱한 국가 광고를 막는다.

슬롯 삽입 규칙과 스티커 오버레이 경로는 변경하지 않았다."
```

---

## Task 7: 개인정보처리방침 광고 조항

AdMob SDK를 넣기 전에 방침을 먼저 갱신한다. 순서가 뒤바뀌면 광고가 붙은 빌드를 방침 없이 심사에 올리는 위험이 생긴다.

**Files:**
- Modify: `docs/privacy-policy.md`
- Modify: `docs/privacy-policy.html`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (문서)

- [ ] **Step 1: 현재 방침 구조를 확인한다**

Run: `grep -n "^## \|^# " docs/privacy-policy.md`

절 번호와 제목을 파악한다. 국외 이전 조항과 처리위탁 조항이 이미 있는지, 있다면 몇 절인지 확인한다.

Run: `grep -n "<h2" docs/privacy-policy.html`

`.md`와 `.html`의 절 구성이 대응하는지 확인한다. 두 파일은 같은 내용을 담아야 한다.

- [ ] **Step 2: `.md`에 광고 조항을 추가한다**

기존 처리위탁 절이 있으면 그 안에 수탁자를 추가하고, 없으면 국외 이전 절 뒤에 새 절을 만든다. 절 번호는 Step 1에서 확인한 실제 번호에 이어서 매긴다.

포함해야 할 내용:

```markdown
## 광고

1. 서비스는 무료 이용자에게 광고를 게재하며, 광고 게재를 위해 Google LLC의 AdMob 및 제휴 광고 서비스를 이용합니다.

2. 광고 게재 과정에서 다음 정보가 수집될 수 있습니다.
   - IP 주소(대략적인 지역 추정에 사용)
   - 기기 식별자
   - 광고 노출 및 상호작용 기록
   - 앱 진단 데이터(실행 시간, 오류 기록 등)

3. **서비스는 개인 맞춤 광고를 사용하지 않습니다.** 이용자 추적을 위한 앱 추적 투명성(ATT) 권한을 요청하지 않으며, 광고는 비개인화 방식으로만 제공됩니다.

4. 위 정보는 광고 게재 목적으로 Google LLC에 제공되며, 미국에 소재한 서버에서 처리됩니다.

5. 서비스에는 제휴 광고 링크가 포함될 수 있습니다. 링크를 선택하면 해당 제휴사의 사이트로 이동하며, 이후의 개인정보 처리는 각 제휴사의 개인정보처리방침을 따릅니다. 이용자의 구매가 발생하는 경우 운영자는 제휴사로부터 일정액의 수수료를 지급받을 수 있습니다.

6. 광고 수신을 원하지 않는 이용자는 다음 방법을 이용할 수 있습니다.
   - 프리미엄 구독 시 광고가 제거됩니다.
   - iOS 설정 > 개인정보 보호 및 보안 > Apple 광고에서 개인 맞춤 광고를 제한할 수 있습니다.
```

- [ ] **Step 3: `.html`에 같은 내용을 반영한다**

`docs/privacy-policy.html`의 기존 절 마크업 형식(`<h2><span class="num">제N조</span>제목</h2>` + `<ol><li>` 구조)을 그대로 따라 같은 내용을 추가한다. 형식은 Step 1에서 확인한 실제 마크업에 맞춘다.

- [ ] **Step 4: 두 파일의 내용이 일치하는지 확인한다**

`.md`와 `.html`을 나란히 읽어 절 번호·항목 수·문구가 대응하는지 확인한다. 게시되는 것은 `.html`이므로 누락되면 실제 공개 방침에 광고 조항이 빠진다.

- [ ] **Step 5: 커밋**

```bash
git add docs/privacy-policy.md docs/privacy-policy.html
git commit -m "docs(privacy): 광고 조항 추가 — AdMob·제휴·비개인화 명시

광고 식별자와 제3자 제공이 방침에 없어 광고 빌드를 올리면 심사
리스크가 된다. ATT를 요청하지 않고 비개인화만 쓴다는 점, 제휴 링크
이동과 수수료 수취, 프리미엄으로 광고 제거 가능함을 함께 기재한다.

.html이 실제 게시본이므로 두 파일을 같은 내용으로 유지한다."
```

---

## Task 8: AdMob 연동 (3단 체인 완성)

**Files:**
- Create: `src/constants/adUnits.ts`
- Create: `src/components/ads/AdMobPolaroidCard.tsx`
- Modify: `src/hooks/useFeedAdSource.ts`
- Modify: `src/components/ads/FeedAdSlot.tsx`
- Modify: `app.json`
- Modify: 앱 진입점 (`App.tsx` 또는 `index.ts`가 가리키는 루트 컴포넌트)

**Interfaces:**
- Consumes: `FeedAdSource` (Task 6)
- Produces: `FeedAdSource`에 `{ kind: 'admob'; ad: NativeAd }` 분기 추가

- [ ] **Step 1: SDK를 설치한다**

Run: `npx expo install react-native-google-mobile-ads`

Expected: `package.json`에 `react-native-google-mobile-ads` 추가(v16.x)

- [ ] **Step 2: `app.json`에 플러그인을 추가한다**

`expo.plugins` 배열 끝에 추가한다. **기존 플러그인 항목은 순서를 포함해 건드리지 않는다.**

```json
      [
        "react-native-google-mobile-ads",
        {
          "iosAppId": "ca-app-pub-3940256099942544~1458002511",
          "skAdNetworkItems": [
            "cstr6suwn9.skadnetwork",
            "4fzdc2evr5.skadnetwork",
            "2fnua5tdw4.skadnetwork",
            "ydx93a7ass.skadnetwork",
            "p78axxw29g.skadnetwork",
            "v72qych5uu.skadnetwork",
            "ludvb6z3bs.skadnetwork",
            "cp8zw746q7.skadnetwork",
            "3sh42y64q3.skadnetwork",
            "c6k4g5qg8m.skadnetwork",
            "s39g8k73mm.skadnetwork",
            "3qy4746246.skadnetwork",
            "hs6bdukanm.skadnetwork",
            "mlmmfzh3r3.skadnetwork",
            "v4nxqhlyqp.skadnetwork",
            "wzmmz9fp6w.skadnetwork",
            "su67r6k2v3.skadnetwork",
            "yclnxrl5pm.skadnetwork",
            "7ug5zh24hu.skadnetwork",
            "gta9lk7p23.skadnetwork",
            "vutu7akeur.skadnetwork",
            "y5ghdn5j9k.skadnetwork",
            "v9wttpbfk9.skadnetwork",
            "n38lu8286q.skadnetwork",
            "47vhws6wlr.skadnetwork",
            "kbd757ywx3.skadnetwork",
            "9t245vhmpl.skadnetwork",
            "a2p9lx4jpn.skadnetwork",
            "22mmun2rn5.skadnetwork",
            "44jx6755aq.skadnetwork",
            "k674qkevps.skadnetwork",
            "4468km3ulz.skadnetwork",
            "2u9pt9hc89.skadnetwork",
            "8s468mfl3y.skadnetwork",
            "klf5c3l5u5.skadnetwork",
            "ppxm28t8ap.skadnetwork",
            "kbmxgpxpgc.skadnetwork",
            "uw77j35x4d.skadnetwork",
            "578prtvx9j.skadnetwork",
            "4dzt52r2t5.skadnetwork",
            "tl55sbb4fm.skadnetwork",
            "c3frkrj4fj.skadnetwork",
            "e5fvkxwrpn.skadnetwork",
            "8c4e2ghe7u.skadnetwork",
            "3rd42ekr43.skadnetwork",
            "97r2b46745.skadnetwork",
            "3qcr597p9d.skadnetwork"
          ]
        }
      ]
```

`iosAppId` 값은 **구글 공식 테스트 앱 ID**다. AdMob 계정에서 실제 앱 ID를 발급받으면 이 값만 교체한다.

**`userTrackingUsageDescription` 키를 넣지 않는다.** 넣으면 플러그인이 `NSUserTrackingUsageDescription`을 Info.plist에 심어 Apple 심사에서 추적 앱으로 분류된다.

**`androidAppId`도 넣지 않는다.** iOS 단독 출시다.

- [ ] **Step 3: 광고 단위 ID 모듈을 만든다**

`src/constants/adUnits.ts`:

```ts
// AdMob 광고 단위 ID — 채널별 분기.
//
// 개발·preview·로컬에서는 반드시 테스트 ID를 쓴다. 실제 광고를 개발 중 클릭하면
// 무효 트래픽으로 판정돼 AdMob 계정이 정지될 수 있다.
//
// 실제 단위 ID를 발급받으면 PROD_NATIVE_UNIT_ID만 교체하고
// featureFlags.ADMOB_ENABLED를 true로 올린다.
import * as Updates from 'expo-updates';
import { TestIds } from 'react-native-google-mobile-ads';

function getChannel(): string | null {
  try {
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

// AdMob 계정 발급 전까지는 테스트 ID를 그대로 둔다.
const PROD_NATIVE_UNIT_ID = TestIds.NATIVE;

export const NATIVE_AD_UNIT_ID =
  getChannel() === 'production' ? PROD_NATIVE_UNIT_ID : TestIds.NATIVE;
```

- [ ] **Step 4: 앱 진입점에서 SDK를 초기화한다**

Run: `cat index.ts 2>/dev/null || cat index.js 2>/dev/null; grep -n "main" package.json`

진입점 파일을 확인한 뒤, 루트 컴포넌트 파일 상단에 추가한다:

```ts
import mobileAds from 'react-native-google-mobile-ads';
```

그리고 루트 컴포넌트의 `useEffect`(마운트 1회)에 추가한다:

```ts
  // 광고 SDK 초기화 — 실패해도 앱 흐름을 막지 않는다(광고는 부가 기능).
  useEffect(() => {
    mobileAds().initialize().catch(() => {});
  }, []);
```

이미 마운트 1회용 `useEffect`가 있으면 그 안에 한 줄로 넣어도 된다.

- [ ] **Step 5: AdMob 카드를 구현한다**

`src/components/ads/AdMobPolaroidCard.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  type NativeAd,
} from 'react-native-google-mobile-ads';
import { polaroidStyles, SERIF } from './adPolaroidStyles';

// AdMob 네이티브 광고 카드 — 하우스·제휴 폴라로이드와 같은 스킨.
//
// 왜 별도 컴포넌트인가: AdMob은 광고 자산을 NativeAdView 안에서 NativeAsset으로
// 감싸야 하고 클릭·노출 집계를 SDK가 가져간다. 공식 캐비엇에 "자산 뷰를 다른 뷰로
// 감싸지 말 것"이 명시돼 있어 TouchableOpacity onPress 구조를 재사용할 수 없다.
//
// 「광고」 배지와 헤드라인 상시 노출은 AdMob 네이티브 필수 요소를 충족한다.

interface Props {
  ad: NativeAd;
  /** 폴라로이드 기울기(도) */
  tilt?: number;
}

export default function AdMobPolaroidCard({ ad, tilt = -3 }: Props) {
  const { t } = useTranslation();

  return (
    <NativeAdView nativeAd={ad} style={[polaroidStyles.wrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={polaroidStyles.back} pointerEvents="none" />
      <View style={polaroidStyles.front}>
        <View style={polaroidStyles.media}>
          <NativeMediaView style={s.media} resizeMode="cover" />
          <View style={polaroidStyles.badge}>
            <Text style={polaroidStyles.badgeText}>{t('social.adBadge')}</Text>
          </View>
        </View>
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text style={[polaroidStyles.caption, { fontFamily: SERIF }]} numberOfLines={1}>
            {ad.headline ?? ''}
          </Text>
        </NativeAsset>
      </View>
    </NativeAdView>
  );
}

const s = StyleSheet.create({
  media: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
});
```

- [ ] **Step 6: 훅에 AdMob 분기를 추가한다**

`src/hooks/useFeedAdSource.ts`를 수정한다.

import에 추가:

```ts
import { NativeAd, NativeAdRequestOptions } from 'react-native-google-mobile-ads';
import { NATIVE_AD_UNIT_ID } from '../constants/adUnits';
import { AFFILIATE_ADS_ENABLED, ADMOB_ENABLED } from '../constants/featureFlags';
```

타입에 분기 추가:

```ts
export type FeedAdSource =
  | { kind: 'affiliate'; campaign: AdCampaign }
  | { kind: 'admob'; ad: NativeAd }
  | { kind: 'house' };
```

상수 추가(파일 상단, `campaignsPromise` 근처):

```ts
// AdMob 요청은 상위 슬롯 3개까지만. 피드가 길면 슬롯이 계속 생기는데 전부 요청하면
// 요청 대비 노출 비율(match rate)이 떨어져 필률이 깎인다.
const MAX_ADMOB_SLOTS = 3;
```

훅 본문에 AdMob 상태와 로딩 effect를 추가한다. **제휴 판정 뒤, 하우스 폴백 앞**에 들어가야 한다:

```ts
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    if (!ADMOB_ENABLED || slot >= MAX_ADMOB_SLOTS) return;
    let alive = true;
    let created: NativeAd | null = null;

    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,   // ATT를 쓰지 않으므로 비개인화 고정
    })
      .then((ad) => {
        created = ad;
        if (alive) setNativeAd(ad);
        else ad.destroy();                   // 이미 언마운트됐으면 즉시 해제
      })
      .catch(() => { /* 미필·네트워크 오류 → 하우스로 떨어진다 */ });

    // destroy를 빠뜨리면 네이티브 메모리가 샌다.
    return () => { alive = false; created?.destroy(); };
  }, [slot]);
```

반환부를 아래로 바꾼다:

```ts
  const campaign = pickCampaign(campaigns, {
    nowMs: Date.now(),
    locale: i18n.language?.startsWith('ko') ? 'ko' : 'en',
    countryCode,
    slot,
  });

  if (campaign) return { kind: 'affiliate', campaign };
  if (nativeAd) return { kind: 'admob', ad: nativeAd };
  return { kind: 'house' };
```

- [ ] **Step 7: 슬롯 래퍼에 AdMob 분기를 추가한다**

`src/components/ads/FeedAdSlot.tsx`의 import에 추가:

```tsx
import AdMobPolaroidCard from './AdMobPolaroidCard';
```

제휴 분기 바로 다음에 추가:

```tsx
  if (source.kind === 'admob') {
    return <AdMobPolaroidCard ad={source.ad} tilt={tilt} />;
  }
```

- [ ] **Step 8: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

`NativeAssetType`·`NativeMediaView`의 export 이름이 v16에서 다르면 오류가 난다. 그 경우 `node_modules/react-native-google-mobile-ads/lib/typescript/index.d.ts`에서 실제 export 이름을 확인해 맞춘다.

- [ ] **Step 9: dev 빌드를 만들어 실기기에서 확인한다**

**AdMob은 네이티브 모듈이라 Expo Go에서 동작하지 않는다.** dev 빌드가 필요하다.

Run: `npx eas build --profile development --platform ios`

빌드가 끝나면 기기에 설치하고, `src/constants/featureFlags.ts`의 `ADMOB_ENABLED`를 임시로 `true`로 바꾼 뒤 실행한다.

확인 항목:

1. 상위 3개 폴라로이드 슬롯에 **구글 테스트 광고**가 뜬다(테스트 광고는 "Test Ad" 표기가 있다).
2. 4번째 이후 슬롯은 하우스 광고다.
3. 제휴 캠페인이 매칭되는 상황에서는 제휴 카드가 AdMob보다 우선한다.
4. 프리미엄 토글을 켜면 슬롯이 사라지고 광고 요청도 발생하지 않는다.
5. 소셜 탭을 여러 번 드나들어도 크래시나 메모리 경고가 없다(`destroy()` 확인).

확인이 끝나면 `ADMOB_ENABLED`를 **`false`로 되돌린다.** 실제 광고 단위 ID를 발급받기 전까지는 잠가둔다.

- [ ] **Step 10: 커밋**

```bash
git add package.json package-lock.json app.json src/constants/adUnits.ts src/components/ads/AdMobPolaroidCard.tsx src/hooks/useFeedAdSource.ts src/components/ads/FeedAdSlot.tsx
git commit -m "feat(ads): AdMob 네이티브 광고 연동 — 3단 소스 체인 완성

제휴 → AdMob → 하우스. AdMob 요청은 상위 3슬롯까지만(match rate 보호).
비개인화 고정이라 ATT를 요청하지 않고 userTrackingUsageDescription도
넣지 않는다. SKAdNetwork 목록은 ATT와 무관한 어트리뷰션이라 포함한다.

실제 단위 ID 발급 전이라 ADMOB_ENABLED=false로 잠가둔다."
```

진입점 파일도 수정했다면 함께 스테이징한다.

---

## 남은 외부 작업 (코드 아님)

이 계획을 끝내도 아래는 사람이 해야 한다.

- [ ] AdMob 계정 생성 → eOrth 앱 등록 → 네이티브 광고 단위 발급
- [ ] `app.json`의 `iosAppId`와 `src/constants/adUnits.ts`의 `PROD_NATIVE_UNIT_ID`를 실제 값으로 교체
- [ ] `ADMOB_ENABLED = true`로 전환
- [ ] 제휴 가입 신청 — Airalo · Klook(Involve Asia) · 쿠팡 파트너스 · GetYourGuide
- [ ] **각 제휴사에 앱 내 배너 노출이 약관상 허용되는지 문의** (쿠팡 파트너스는 특히 확답 필요 — 공식 약관 원문 미확인)
- [ ] 실제 캠페인 데이터를 `ad_campaigns`에 입력 (제휴사별 필수 고지 문구를 `disclosure_ko`/`disclosure_en`에 정확히 기재)
- [ ] 개발용 더미 캠페인 삭제: `delete from public.ad_campaigns where slug = 'dev-sample-esim';`
- [ ] App Store Connect 개인정보 설문 — 기기 ID · 광고 데이터 · 제품 상호작용 · 대략적 위치 · 진단 데이터를 "제3자 광고" 용도로 신고. **"Used to Track You"는 아니오** (제출 전 구글 공시 표와 대조할 것)
- [ ] 하우스 광고 소재 확충 (현재 `house-invite` 1종 — 폴백 시 반복 노출됨)
- [ ] RevenueCat 연동과 함께 production EAS 빌드
