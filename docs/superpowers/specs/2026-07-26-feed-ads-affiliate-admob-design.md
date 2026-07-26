# 피드 광고 실수익화 — 제휴 우선 + AdMob 폴백 (iOS 정식 출시)

작성일: 2026-07-26
관련 메모: 피드 광고 슬롯 · 프리미엄 구독 베타 · 출시 체크리스트

---

## 1. 배경

iOS 정식 출시를 앞두고 피드 광고 슬롯을 하우스 광고(앱 기능 홍보)에서 실제 수익 소스로 전환한다.

### 이미 있는 것

- 광고 슬롯 삽입 로직 — `SocialScreen.tsx:2706~2740`
  - 폴라로이드: 독립 카드, 1번째 게시물 뒤 시작, 5개 주기
  - 스티커: 게시물 위 오버레이, 4번째부터 5개 주기
  - 마지막 게시물 뒤에는 미삽입, `isPremium`이면 슬롯 자체를 만들지 않음
- 렌더러 `components/ads/FeedAdCard.tsx` — 폴라로이드/스티커 2형태, 「광고」 배지와 헤드라인 상시 노출
- 소스 교체 지점 `constants/houseAds.ts`의 `getHouseAd(slot)` 한 곳으로 격리
- 이용약관 제10조(광고) 기재됨

### 없는 것

- 광고 SDK 미설치, `app.json`에 플러그인·광고 앱 ID 없음
- 제휴 캠페인 인프라 없음
- **개인정보처리방침에 광고 조항 없음** — 광고 식별자·제3자 처리위탁 미기재

---

## 2. 확정된 결정 사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 광고 포맷 | 네이티브만 | 전면광고는 검토 후 제외 |
| ATT | 요청하지 않음 | 비개인화(NPA) 고정 |
| 소스 우선순위 | 제휴 → AdMob → 하우스 | |
| AdMob 적용 대상 | 폴라로이드 슬롯만 | 스티커는 하우스 전용 |
| 캠페인 관리 | Supabase 원격 테이블 | 앱 업데이트 없이 교체 |
| 국가 타겟팅 | 포함 | 클라이언트 필터 |
| 1차 제휴사 | Airalo · Klook · 쿠팡 파트너스 · GetYourGuide | |
| 문서 범위 | 방침 + App Store 설문까지 포함 | |

### 스티커를 AdMob에서 제외하는 이유

현재 스티커 슬롯은 AdMob 네이티브 정책과 세 지점에서 충돌한다.

- 프레임 폭 84px 고정, 헤드라인 9px (`FeedAdCard.tsx:178, 213`) — 광고 자산 가독성 요건 미달
- `position:absolute`, `zIndex:20`으로 사용자 콘텐츠 위를 덮음 — 콘텐츠 가림 금지 조항
- 4.2초 표시 → 2.8초 숨김 무한 반복 (`FeedAdCard.tsx:46~79`) — 노출 집계 왜곡·무효 트래픽 판정 위험

하우스 광고일 때는 문제가 없으므로 **현행 구현을 그대로 유지**하고 외부 광고만 제외한다.

### 렌더러를 분리하는 이유

`react-native-google-mobile-ads` v16.4.0의 네이티브 광고는 자산을 `NativeAdView` 안에서 `NativeAsset`으로 감싸야 하고, 클릭·노출 집계를 SDK가 가져간다. 공식 캐비엇에 "자산 뷰를 다른 뷰로 감싸지 말 것"이 명시돼 있다. 따라서 지금 `FeedAdCard`의 `TouchableOpacity onPress` 구조를 재사용할 수 없고, **겉모습이 같은 별도 컴포넌트**가 필요하다.

---

## 3. 소스 체인

```
timelineWithAds  (기존 로직 무변경, adSlotIndex 필드만 추가)
  └─ _adSlot
       └─ FeedAdSlot(slot)              ← 훅 호출 지점
            └─ useFeedAdSource(slot)
                 ① 제휴 캠페인 매칭됨       → AffiliatePolaroidCard
                 ② 없음 & slot < 3        → AdMob 로드
                      ├─ 성공             → AdMobPolaroidCard
                      └─ 실패·미필         → FeedAdCard (하우스)
                 ③ 그 외                  → FeedAdCard (하우스)
```

`SocialScreen`의 `columns[ci].map(...)` 안에서는 훅을 호출할 수 없으므로 `FeedAdSlot`이라는 얇은 래퍼 컴포넌트가 반드시 필요하다.

### AdMob 요청을 상위 3슬롯으로 제한하는 이유

피드가 길면 슬롯이 계속 생성된다. 전부 요청하면 요청 대비 노출 비율(match rate)이 떨어져 AdMob이 필을 줄인다. 4번째 슬롯부터는 하우스 광고로 고정한다.

---

## 4. 파일 구성

### 신규

| 파일 | 책임 |
|---|---|
| `src/constants/adUnits.ts` | AdMob 앱·단위 ID의 채널별 분기 |
| `src/services/adCampaigns.ts` | Supabase 캠페인 조회, AsyncStorage 캐시, 클릭 집계 |
| `src/hooks/useFeedAdSource.ts` | 슬롯별 소스 결정과 AdMob 생명주기 |
| `src/components/ads/adPolaroidStyles.ts` | 폴라로이드 스킨 공용 스타일 |
| `src/components/ads/AffiliatePolaroidCard.tsx` | 제휴 카드 — 이미지·헤드라인·「광고」 배지·고지 문구 |
| `src/components/ads/AdMobPolaroidCard.tsx` | `NativeAdView` 기반 카드 |
| `src/components/ads/FeedAdSlot.tsx` | 훅 호출 + 3단 분기 |

### 수정

| 파일 | 변경 |
|---|---|
| `src/components/ads/FeedAdCard.tsx` | 스타일을 공용 모듈에서 import. **로직·애니메이션 무변경** |
| `src/screens/SocialScreen.tsx` | `_adSlot` 분기(2877~2887행)를 `FeedAdSlot`으로 교체, `adSlotIndex` 필드 추가 |
| `src/constants/featureFlags.ts` | `ADMOB_ENABLED`, `AFFILIATE_ADS_ENABLED` 추가 |
| `app.json` | 광고 플러그인 + iOS 앱 ID + SKAdNetwork 목록 |
| 앱 진입점 | `mobileAds().initialize()` 1회 |
| `supabase/schema.sql` | 섹션 11) 광고 캠페인 추가 |
| `docs/privacy-policy.md` / `.html` | 광고 조항 추가 |

스티커 오버레이 경로(`SocialScreen.tsx:2909~2923`)는 수정하지 않는다.

---

## 5. 데이터 모델

`supabase/schema.sql` 섹션 11)로 추가한다.

### `ad_campaigns`

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | 운영 식별자 |
| `partner` | text | `airalo` / `klook` / `coupang` / `getyourguide` |
| `headline_ko` / `headline_en` | text | 카드 헤드라인 |
| `image_url` | text | 폴라로이드 미디어 영역 |
| `click_url` | text | 제휴 링크 |
| `disclosure_ko` / `disclosure_en` | text | 제휴사별 필수 고지 문구 |
| `target_countries` | text[] | ISO2 배열. 빈 배열이면 전체 대상 |
| `locales` | text[] | `{ko,en}` |
| `weight` | int | 가중치 로테이션 |
| `starts_at` / `ends_at` | timestamptz | 노출 기간 |
| `active` | boolean | 즉시 중단 스위치 |
| `click_count` | int | 익명 클릭 누적 |

**RLS** — 조회는 `active = true` 이고 기간 내인 행만 공개(anon·authenticated). 삽입·수정은 `service_role` 전용.

### 클릭 집계

`log_ad_click(p_campaign_id uuid)` — `security definer` RPC로 `click_count`를 원자적으로 증가시킨다.

**노출은 집계하지 않는다.** 스크롤할 때마다 RPC가 나가고, 사용자 식별자를 넣는 순간 개인정보처리방침에 항목이 추가된다. 제휴 정산은 클릭·전환 기준이므로 익명 클릭 카운터로 충분하다. 노출 집계가 필요해지면 앱 백그라운드 진입 시 배치 전송으로 후속 도입한다.

---

## 6. 국가 타겟팅

사용자가 여행 중이거나 최근 기록한 국가에 맞는 캠페인을 우선 노출한다. 일본 기록을 쓰는 사용자에게 일본 eSIM을 띄우는 식이다. AdMob으로는 불가능한 영역이고, 제휴 전환율은 관련성에 정비례한다.

**매칭은 전적으로 클라이언트에서 수행한다.**

1. 활성 캠페인 목록을 통째로 받아 캐시한다 (캐시 TTL 6시간)
2. 로컬 여행 기록에서 대상 국가를 산출한다
   - 진행 중인 여행 세션이 있으면 **그 여행의 국가**
   - 없으면 **최근 30일 내 기록의 국가** (복수면 최신순)
   - 둘 다 없으면 국가 미지정으로 취급
3. `target_countries`가 비었거나 산출된 국가를 포함하는 캠페인만 후보로 남긴다
4. 국가가 매칭된 캠페인을 우선하고, 동순위는 `weight`로 고른다
5. 같은 캠페인이 연속 슬롯에 나오지 않도록 슬롯 순번으로 회전시킨다

사용자의 여행 국가가 서버로 전송되지 않으므로 개인정보처리방침에 추가할 항목이 늘지 않는다.

---

## 7. 빌드 설정

`react-native-google-mobile-ads` v16.4.0을 설치한다. 네이티브 모듈이므로 **EAS 재빌드가 필수**이며 OTA로는 반영되지 않는다.

```json
[
  "react-native-google-mobile-ads",
  {
    "iosAppId": "ca-app-pub-XXXX~YYYY",
    "skAdNetworkItems": ["cstr6suwn9.skadnetwork", "..."]
  }
]
```

- **`userTrackingUsageDescription`을 넣지 않는다.** 이 키를 넣으면 플러그인이 `NSUserTrackingUsageDescription`을 Info.plist에 심고, Apple 심사에서 추적하는 앱으로 취급된다. `requestTrackingAuthorization`도 호출하지 않는다.
- **`skAdNetworkItems`는 넣는다.** SKAdNetwork는 ATT와 무관한 별개의 어트리뷰션이며, 없으면 광고주 캠페인 성과가 잡히지 않아 단가가 낮게 매겨진다.
- **`androidAppId`는 넣지 않는다.** iOS 단독 출시이며 안드로이드 빌드 시점에 추가한다.

### 광고 단위 ID

| 채널 | 사용 ID |
|---|---|
| development / preview / 로컬 | `TestIds.NATIVE` (구글 공식 테스트 ID) |
| production | 실제 단위 ID |

AdMob 계정이 아직 없으므로 실제 ID 발급 전까지는 production 자리에도 테스트 ID를 두고 `ADMOB_ENABLED = false`로 잠근다. 개발 중 자기 광고를 클릭하면 무효 트래픽으로 계정이 정지될 수 있어 채널 분기는 필수다.

---

## 8. 동의·정책·문서

### 광고 요청

모든 요청에 `requestNonPersonalizedAdsOnly: true`를 붙인다. ATT 프롬프트도 UMP 동의 폼도 띄우지 않는다.

### 제휴사 필수 고지

각 제휴사가 요구하는 문구를 `disclosure_*` 컬럼에 담아 카드 하단에 렌더한다.

- 쿠팡 파트너스 — "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다"
- 나머지 제휴사는 가입 후 약관에 명시된 문구를 사용한다

84px 스티커에는 고지 문구가 물리적으로 들어가지 않는다. 제휴를 폴라로이드 전용으로 한정한 결정과 맞물린다.

### 클릭 처리

시스템 브라우저로 연다. 커스텀 WebView를 쓰면 Amazon Associates의 WebView 금지 조항에 걸리며, 나중에 아마존을 붙일 여지를 남기려면 처음부터 이 방식이어야 한다.

### 개인정보처리방침 추가 조항

`docs/privacy-policy.md`와 `.html` 양쪽에 반영한다.

- 광고 목적 처리위탁 — 수탁자 Google(AdMob), 위탁 업무 광고 게재
- 수집 항목 — IP 주소, 기기 식별자, 광고 노출·상호작용 기록, 진단 데이터
- 국외 이전 — 미국 (기존 Supabase 조항과 같은 절에 병기)
- 거부 방법 — 프리미엄 구독으로 광고 제거, iOS 설정의 개인 맞춤 광고 제한
- 비개인화 광고만 사용하며 사용자를 추적하지 않음을 명시
- 제휴 링크 이용 시 해당 제휴사로 이동한다는 안내

### App Store Connect 개인정보 설문

구글이 공시한 SDK 수집 항목 기준으로 신고한다: 기기 ID, 광고 데이터, 제품 상호작용, 대략적 위치(IP 기반), 진단 데이터. 용도는 "제3자 광고".

**"Used to Track You"는 아니오로 신고한다** — ATT를 요청하지 않고 비개인화 광고만 서빙하므로 제3자 데이터와 결합한 추적이 발생하지 않는다. 다만 이는 판단이며, 제출 전 구글의 최신 공시 표와 대조할 것. 잘못 신고하면 심사 리젝이 아니라 사후 앱 삭제 사유가 될 수 있는 항목이다.

---

## 9. 에러 처리

| 상황 | 처리 |
|---|---|
| 캠페인 조회 실패 | AsyncStorage 캐시 사용 → 캐시도 없으면 AdMob으로 강등 |
| 캐시된 캠페인 기간 만료 | 클라이언트에서 재검증 후 제외 — 오래된 캐시로 종료된 광고가 뜨는 것 방지 |
| 제휴 이미지 로드 실패 | 하우스 카드로 강등 — 빈 사각형 방지 |
| AdMob 로드 실패·타임아웃 | 하우스 카드 |
| 컴포넌트 언마운트 | `NativeAd.destroy()` 호출 — 누락 시 네이티브 메모리 누수 |
| 로딩 중 | 하우스 카드를 먼저 그린다. 폴라로이드 크기가 같아 마소너리 레이아웃이 흔들리지 않고, 도착 시 페이드로 교체 |

---

## 10. 구현 순서

AdMob 계정 발급과 제휴 승인이 외부 의존이므로, 그것들을 기다리지 않고 진행할 수 있는 순서로 쪼갠다.

| 단계 | 내용 | 외부 의존 |
|---|---|---|
| 1 | 폴라로이드 스킨 스타일 공용 추출 + `FeedAdCard` import 전환 | 없음 |
| 2 | `schema.sql` 섹션 11) 캠페인 테이블·RLS·클릭 RPC | 없음 |
| 3 | `adCampaigns.ts` · `useFeedAdSource` · `FeedAdSlot` · `AffiliatePolaroidCard` (제휴 ↔ 하우스 2단) | 없음 |
| 4 | 개인정보처리방침 광고 조항 | 없음 |
| 5 | SDK 설치 · `app.json` · `AdMobPolaroidCard` · 3단 체인 완성 | AdMob 계정 |
| 6 | 실제 캠페인 데이터 입력 | 제휴 승인 |

1~4단계까지만 해도 하우스 광고가 원격 관리되는 상태가 되므로 단독으로 가치가 있다. 5단계는 AdMob 계정이 나온 뒤 붙인다.

---

## 11. 검증

- `npx tsc --noEmit` 통과
- 제휴·AdMob·하우스 3경로를 플래그로 강제해 각각 실기기 확인
- 프리미엄 토글 시 슬롯 미생성 + 광고 요청 0건 확인
- 국가 타겟팅 — 특정 국가 기록이 있는 상태와 없는 상태에서 노출 캠페인이 달라지는지 확인
- 오프라인 — 네트워크 차단 후 캐시 경로와 하우스 폴백 확인
- 회귀 — 스티커 오버레이 애니메이션, 마소너리 2단 레이아웃, 메이트 추천 카드

**AdMob은 네이티브 모듈이라 Expo Go에서 동작하지 않는다.** 확인하려면 EAS dev 빌드가 필요하다. 이 PC는 한글 경로·RAM 문제로 로컬 gradle 빌드가 불가능하므로 EAS를 태워야 한다. 제휴·하우스 경로는 Expo Go에서도 확인 가능하다.

---

## 12. 범위 밖 / 후속

- **하우스 광고 소재 확충** — 현재 `house-invite` 1종뿐이라 폴백이 걸릴 때마다 같은 광고가 반복된다. 초기 fill rate를 감안하면 자주 노출될 것이다. 이번 범위에서는 제외하되 출시 전 확충을 권한다.
- **RevenueCat 결제 연동** — 출시 체크리스트상 같은 EAS 빌드에 묶기로 되어 있다. 광고 작업 완료 후 함께 빌드하면 빌드 횟수를 아낀다.
- **아마존 어소시에이트** — Approved Mobile Application 사전 승인, Creators API/PA-API 경유 필수, PA-API는 적격 판매 3건 선행, 상품 이미지 캐싱 금지(링크 24시간 제한)로 신규 앱에는 진입 불가. 실적이 쌓인 뒤 재검토한다.
- **Trip.com 제휴** — 팔로워 1만 이상 요건으로 초기 제외.
- **노출 집계** — 필요해지면 배치 전송으로 도입.
- **안드로이드** — `androidAppId` 추가 + 별도 빌드.

---

## 13. 확인이 필요한 사항

- **쿠팡 파트너스의 앱 내 배너 노출 허용 여부** — 공식 약관 원문을 확인하지 못했다. 검색으로 확인된 것은 필수 고지 문구, 자기 클릭·구매 금지, 일부 상품 링크 생성 제한뿐이다. 가입 전 파트너스 고객센터에 확답을 받을 것.
- **Klook·GetYourGuide·아고다의 앱 내 사용 조항** — 문서가 블로그·SNS 기준으로 작성되어 있다. 앱 배너가 약관상 허용되는지 각 제휴사에 문의할 것.
- Airalo만 앱 내 전환 추적을 공식 지원한다고 명시되어 있다(Impact + Adjust 연동).

---

## 14. 참고 자료

- [react-native-google-mobile-ads — Native Ads](https://docs.page/invertase/react-native-google-mobile-ads/native-ads)
- [AdMob iOS — Targeting](https://developers.google.com/admob/ios/targeting)
- [AdMob iOS — Data disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure)
- [Amazon Associates Program Policies](https://affiliate-program.amazon.com/help/operating/policies)
- [Airalo 제휴 프로그램](https://partners.airalo.com/solutions/affiliates)
- [Klook 제휴 (Involve Asia)](https://app.involve.asia/directory/klook-affiliate-program)
- [GetYourGuide 파트너 센터](https://partner.getyourguide.support/hc/en-us)
- [쿠팡 파트너스 이용 가이드](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf)
