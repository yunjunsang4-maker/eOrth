-- 2026-08-07: 쿠팡 파트너스 제휴 캠페인 4종 등록
--
-- Supabase 대시보드 > SQL Editor 에서 실행. 재실행 안전(slug 충돌 시 갱신).
-- ad_campaigns 는 insert/update 정책이 없어 service_role(= SQL Editor)만 쓸 수 있다.
--
-- ⚠️ 실행 전 확인
--   1) 아래 <PLACEHOLDER> 를 전부 실제 값으로 바꿨는가. 자리표시자 그대로 실행하면
--      이미지가 깨져 슬롯이 하우스 광고로 강등되고, 링크는 열리지 않는다.
--   2) 앱 내 배너 노출이 파트너스 약관상 허용되는가
--      (설계서 2026-07-26-feed-ads-affiliate-admob-design.md §13 미해결 항목).
--      매체 등록 화면의 "쿠팡 파트너스 이용약관 및 운영정책에 위배되지 않음을 확인합니다"
--      체크는 본인 책임 서약이다 — 확답이 필요하면 등록 전에 문의할 것.
--
-- 매체 등록 순서 (2026-08-07 확인 — 사전 승인이 아니라 사후 스크린샷 제출이다)
--   쿠팡은 앱 링크를 추가하면 **그 앱에 게재된 화면의 스크린샷**을 요구한다. 즉 광고가
--   앱에 먼저 떠 있어야 등록이 되므로, "승인 후 게재"가 아니라 아래 순서가 된다.
--     ① useFeedAdSource 슬롯 제한 코드가 들어간 빌드를 배포
--     ② 이 SQL 실행
--     ③ 실기기 소셜 탭에서 광고 카드가 뜬 화면을 스크린샷
--        (전체 화면 + 카드 확대 컷을 한 장에 붙이면 10px 고지 문구까지 읽힌다)
--     ④ 파트너스 > 내 정보 관리 > 모바일 앱 목록에 App Store 링크 + 스크린샷 등록
--   심사는 누적 수익 15만원 도달 시점에 진행되므로 게재 자체가 막히지는 않는다.
--
--   ⚠️ 스크린샷 찍을 때 링크를 반복 클릭하지 말 것 — 자기 클릭은 금지 행위다.
--
-- 반영 시점: 앱은 캠페인 목록을 6시간 캐시한다(services/adCampaigns.ts TTL_MS).
--   → 실행 직후가 아니라 최대 6시간 뒤에 전 사용자 피드에 뜬다. 내릴 때도 같다.
--
-- 값 규칙 (틀리면 조용히 노출되지 않는다)
--   · target_countries = '{}'  ← 반드시 빈 배열.
--     '{KR}' 을 넣으면 한국 사용자에게 **절대** 안 뜬다. utils/adCampaignSelect.ts 의
--     resolveTargetCountry 가 광고 타겟 국가에서 거주국을 의도적으로 제외하기 때문이다
--     ("한국에 있는 사람에게 한국 여행 상품이 뜨면 안 된다"는 규칙).
--     한국 사용자 한정은 locales 로 건다.
--   · locales = '{ko}'         ← 쿠팡은 국내 전용이므로 영어 사용자에게는 띄우지 않는다.
--     단 headline_en 은 not null 이라 값은 채워야 한다(노출되지는 않는다).
--   · headline_ko 는 **12자 이내**. 폴라로이드 캡션이 numberOfLines={1}(12px)이고
--     2단 그리드라 카드 폭이 174px 남짓이다 — 그 이상은 말줄임으로 잘린다.
--     앞에 '쿠팡 · ' 를 붙여 둔 이유: 매체 등록 스크린샷에서 쿠팡 링크임이 한눈에
--     보여야 한다. 우리 카드는 커스텀이라 쿠팡 공식 배너의 COUPANG 워드마크·
--     link.coupang.com 표기가 없고, 남는 단서가 하단 고지 문구(10px)뿐이다.
--   · image_url 은 https 공개 URL + **1:1 정사각형**(카드 사진 영역이 aspectRatio:1).
--     600x600 이면 충분하다. Supabase Storage 의 media 버킷이 public 이라 거기 올려도 된다.
--     로드에 실패하면 그 슬롯은 남은 세션 동안 하우스 광고로 강등된다.
--   · disclosure_ko 는 쿠팡 파트너스 필수 고지 문구. 비우면 약관 위반이다.
--   · weight 는 클수록 먼저 정렬된다. 4종을 고르게 돌리려면 전부 같은 값으로 둘 것.
--
-- 노출 슬롯: 제휴는 피드 상위 폴라로이드 2슬롯까지만 채운다
--   (hooks/useFeedAdSource.ts 의 MAX_AFFILIATE_SLOTS). 그 아래는 AdMob → 하우스.
--   한 세션에 보이는 쿠팡 캠페인은 2개이고, 어느 2개인지는 세션마다 회전한다.

insert into public.ad_campaigns (
  slug, partner,
  headline_ko, headline_en,
  image_url, click_url,
  disclosure_ko, disclosure_en,
  target_countries, locales, weight, active
) values
  (
    'coupang-carry-on-2026-08', 'coupang',
    '쿠팡 · 기내용 캐리어', 'Coupang · Carry-on luggage',
    'https://<이미지 URL 1>', 'https://link.coupang.com/a/<링크1>',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-travel-adapter-2026-08', 'coupang',
    '쿠팡 · 여행 어댑터', 'Coupang · Travel adapter',
    'https://<이미지 URL 2>', 'https://link.coupang.com/a/<링크2>',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-packing-pouch-2026-08', 'coupang',
    '쿠팡 · 정리 파우치', 'Coupang · Packing cubes',
    'https://<이미지 URL 3>', 'https://link.coupang.com/a/<링크3>',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-neck-pillow-2026-08', 'coupang',
    '쿠팡 · 기내 목베개', 'Coupang · Neck pillow',
    'https://<이미지 URL 4>', 'https://link.coupang.com/a/<링크4>',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  )
on conflict (slug) do update set
  partner          = excluded.partner,
  headline_ko      = excluded.headline_ko,
  headline_en      = excluded.headline_en,
  image_url        = excluded.image_url,
  click_url        = excluded.click_url,
  disclosure_ko    = excluded.disclosure_ko,
  disclosure_en    = excluded.disclosure_en,
  target_countries = excluded.target_countries,
  locales          = excluded.locales,
  weight           = excluded.weight,
  active           = excluded.active;

-- 확인 — 4행이 나오고 target_countries 가 전부 비어 있어야 한다
-- select slug, headline_ko, target_countries, locales, weight, active, click_count
--   from public.ad_campaigns where partner = 'coupang' order by slug;

-- 앱과 같은 조건(RLS 정책)으로 실제 노출될지 확인
-- select slug from public.ad_campaigns
--  where active and (starts_at is null or starts_at <= now())
--    and (ends_at is null or ends_at >= now());

-- ── 운영 ──
-- 내리기(즉시 중단이 아니라 캐시 6시간 뒤 반영):
--   update public.ad_campaigns set active = false where partner = 'coupang';
-- 특정 캠페인만 교체:
--   update public.ad_campaigns set click_url = 'https://link.coupang.com/a/...'
--    where slug = 'coupang-carry-on-2026-08';
-- 성과 확인(클릭은 로그인 사용자 기준 대략치 — 중복 호출을 막지 못한다):
--   select slug, click_count from public.ad_campaigns where partner = 'coupang' order by click_count desc;
