-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ 보류 중 (2026-08-21, 사용자 결정) — 아직 실행하지 말 것.              ║
-- ║                                                                          ║
-- ║  값은 전부 실제 값이라 "바로 실행하면 되는 파일"처럼 보이지만, 실행하면   ║
-- ║  정식 앱 전 사용자에게 광고가 나간다(최대 6시간 뒤).                      ║
-- ║                                                                          ║
-- ║  해제 조건 — 쿠팡 파트너스에 아래 3가지를 문의하고 답변을 보관한 뒤에만:  ║
-- ║    ① 앱 내 배너 노출이 약관상 허용되는가                                  ║
-- ║    ② 쿠팡 제공 배너가 아닌 자체 제작 카드로 게재해도 되는가               ║
-- ║    ③ 상품 상세 이미지를 가공해 그 카드에 써도 되는가                      ║
-- ║  (법 위반보다 계정 정지·수익 몰수 리스크가 실질적이다. 설계서 §13)        ║
-- ║                                                                          ║
-- ║  같이 검토하기로 한 것: 고지 문구 10px → 12px 상향                        ║
-- ║    (캡션이 12px인데 고지가 더 작다. AffiliatePolaroidCard.tsx 의 s.disclosure) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- 2026-08-07: 쿠팡 파트너스 제휴 캠페인 4종 등록
-- 2026-08-21 개정: 실제 상품·링크·이미지로 자리표시자를 전부 채움 (값은 실행 가능 상태)
--
-- ⚠️⚠️ 실행 위치 — **운영 프로젝트(blweolnunmsxgztmvzfd)** 의 SQL Editor 에서 실행할 것.
--   이 저장소의 로컬 `.env` 는 베타 작업 때문에 **테스트 프로젝트(bqwmxxhtsvfuyywfuswo)** 를
--   가리키고 있다(2026-08-21 실측). 대시보드에서 프로젝트를 잘못 고르면 SQL 은 성공했다고
--   나오는데 App Store 정식 앱 사용자에게는 광고가 **영원히 안 뜬다** — 조용히 실패한다.
--   실행 직전에 대시보드 좌상단 프로젝트 이름을 반드시 확인할 것.
--   (같은 함정이 docs/event-operations.md 에도 기록돼 있다.)
--
-- ad_campaigns 는 insert/update 정책이 없어 service_role(= SQL Editor)만 쓸 수 있다.
-- 재실행 안전(slug 충돌 시 갱신).
--
-- 매체 등록 순서 (2026-08-07 확인 — 사전 승인이 아니라 사후 스크린샷 제출이다)
--   쿠팡은 앱 링크를 추가하면 **그 앱에 게재된 화면의 스크린샷**을 요구한다. 즉 광고가
--   앱에 먼저 떠 있어야 등록이 되므로, "승인 후 게재"가 아니라 아래 순서가 된다.
--     ① 이 SQL 을 운영 프로젝트에서 실행 (제휴 슬롯 상한 코드는 빌드 30에 이미 포함됨)
--     ② 최대 6시간 뒤 실기기 소셜 탭에서 광고 카드 확인
--     ③ 광고 카드가 뜬 화면을 스크린샷
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
--   · headline_ko 는 폴라로이드 캡션이 numberOfLines={1}·fontSize 12 라 한 줄에 들어가야 한다.
--     카드 안쪽 폭은 가장 좁은 360dp 기기에서 약 129dp — 아래 4종은 전부 100px 이내로 안전하다.
--     앞에 '쿠팡 · ' 를 붙여 둔 이유: 매체 등록 스크린샷에서 쿠팡 링크임이 한눈에
--     보여야 한다. 우리 카드는 커스텀이라 쿠팡 공식 배너의 COUPANG 워드마크·
--     link.coupang.com 표기가 없고, 남는 단서가 하단 고지 문구(10px)뿐이다.
--   · image_url — 2026-08-21 업로드 완료. 전부 492x492 JPEG, 인증 없이 200 응답 확인함.
--     경로를 `ads/` 로 둔 것은 의도다: delete-account 함수가 `media/<uid>/` 이하만 지우므로
--     사용자 폴더에 두면 그 계정 탈퇴 시 광고 이미지가 같이 삭제된다.
--     로드에 실패하면 그 슬롯은 남은 세션 동안 하우스 광고로 강등된다.
--   · disclosure_ko 는 쿠팡 파트너스 필수 고지 문구. 비우면 약관 위반이다.
--   · weight 는 클수록 먼저 정렬된다. 4종을 고르게 돌리려면 전부 같은 값으로 둘 것.
--
-- 노출 슬롯: 제휴는 피드 상위 폴라로이드 2슬롯까지만 채운다
--   (hooks/useFeedAdSource.ts 의 MAX_AFFILIATE_SLOTS). 그 아래는 AdMob → 하우스.
--   한 세션에 보이는 쿠팡 캠페인은 2개이고, 어느 2개인지는 세션마다 회전한다.
--   ⚠️ 그래서 캠페인은 최소 2개 이상 유지할 것 — 1개만 활성이면 pickCampaign 의
--      slot % 후보수 가 항상 0이라 같은 카드가 두 슬롯에 나란히 뜬다.
--
-- 미해결(설계서 2026-07-26-feed-ads-affiliate-admob-design.md §13)
--   앱 내 배너 노출이 파트너스 약관상 허용되는지 원문 미확인. 매체 등록 화면의
--   "쿠팡 파트너스 이용약관 및 운영정책에 위배되지 않음을 확인합니다" 체크는 본인 책임
--   서약이다. 상품 상세 이미지를 가공해 자체 카드에 쓰는 것(아래 4종 전부)도 같은 묶음이라
--   문의 시 함께 확인할 것.

insert into public.ad_campaigns (
  slug, partner,
  headline_ko, headline_en,
  image_url, click_url,
  disclosure_ko, disclosure_en,
  target_countries, locales, weight, active
) values
  (
    'coupang-lemouton-shoes-2026-08', 'coupang',
    '쿠팡 · 르무통 신발', 'Coupang · Sneakers',
    'https://blweolnunmsxgztmvzfd.supabase.co/storage/v1/object/public/media/ads/lemouton-shoes.jpg',
    'https://link.coupang.com/a/gnywZh4ASG',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-foot-cooling-sheet-2026-08', 'coupang',
    '쿠팡 · 휴족시간', 'Coupang · Foot cooling pads',
    'https://blweolnunmsxgztmvzfd.supabase.co/storage/v1/object/public/media/ads/foot-cooling-sheet.jpg',
    'https://link.coupang.com/a/gnza9PCqe4',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-phone-strap-2026-08', 'coupang',
    '쿠팡 · 폰 스트랩', 'Coupang · Phone strap',
    'https://blweolnunmsxgztmvzfd.supabase.co/storage/v1/object/public/media/ads/phone-strap.jpg',
    'https://link.coupang.com/a/gnAfeVQwMu',
    '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다',
    'Contains Coupang Partners affiliate links, which earn a commission.',
    '{}', '{ko}', 1, true
  ),
  (
    'coupang-packing-pouch-2026-08', 'coupang',
    '쿠팡 · 여행 파우치', 'Coupang · Packing cubes',
    'https://blweolnunmsxgztmvzfd.supabase.co/storage/v1/object/public/media/ads/packing-pouch.jpg',
    'https://link.coupang.com/a/gnAlmBtoAK',
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

-- 확인 ① 4행이 나오고 target_countries 가 전부 비어 있어야 한다
-- select slug, headline_ko, target_countries, locales, weight, active, click_count
--   from public.ad_campaigns where partner = 'coupang' order by slug;

-- 확인 ② 앱과 같은 조건(RLS 정책)으로 실제 노출될지 — 위 4개 slug 가 그대로 나와야 한다
-- select slug from public.ad_campaigns
--  where active and (starts_at is null or starts_at <= now())
--    and (ends_at is null or ends_at >= now());

-- 확인 ③ 여기가 운영 프로젝트가 맞는지 (blweolnunmsxgztmvzfd 가 나와야 한다)
-- select current_setting('request.jwt.claims', true), inet_server_addr();
--   ↑ 확실치 않으면 대시보드 좌상단 프로젝트 이름으로 눈으로 확인하는 편이 빠르다.

-- ── 운영 ──
-- 내리기(즉시 중단이 아니라 캐시 6시간 뒤 반영):
--   update public.ad_campaigns set active = false where partner = 'coupang';
-- 특정 캠페인만 교체:
--   update public.ad_campaigns set click_url = 'https://link.coupang.com/a/...'
--    where slug = 'coupang-lemouton-shoes-2026-08';
-- 성과 확인(클릭은 로그인 사용자 기준 대략치 — 중복 호출을 막지 못한다):
--   select slug, click_count from public.ad_campaigns where partner = 'coupang' order by click_count desc;
