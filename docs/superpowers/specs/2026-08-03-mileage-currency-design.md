# 마일리지 재화 시스템 설계

- 작성일: 2026-08-03
- 상태: 설계 확정 / 구현 전
- 대체 대상: `LAUNCH_FREE_PREMIUM` 무료 개방 체제, 구독형 프리미엄

---

## 1. 배경과 목표

프리미엄을 구독으로 팔려던 계획을 접고(`featureFlags.ts:50-59`) 앱내 재화 **마일리지**로 전환한다.
재화가 정해지지 않은 동안 프리미엄 혜택을 전원 개방해 둔 상태이므로, 이 설계는 그 개방을 닫으면서
같은 혜택을 마일리지로 되팔 수 있게 만드는 것이 목표다.

**마일리지 획득 경로는 두 가지뿐이다.**

1. 앱내 구매(스토어 소모성 상품)
2. 배지 획득 보상

**소비처는 기존 프리미엄 기능**이고, 이후 커스텀 아이템을 계속 추가한다.

### 확정된 정책 결정

| 항목 | 결정 |
|---|---|
| 소유 모델 | 영구 해금 + 소모성 혼합. **단 1단계는 영구 해금만 구현** |
| 기존 무료 개방분 | 전면 유료 전환 + 얼리 어답터 보상 마일리지 지급 |
| 배지 보상 | 난이도 등급(브론즈/실버/골드)별 차등 |
| 밸런스 | 체험판 수준 — 무과금은 전체의 약 13% 도달 |
| 기존 배지 | 전액 소급 지급 |
| 결제·원장 | Supabase 자체 원장 + `react-native-iap` + Edge Function 영수증 검증 |

---

## 2. 판매 대상

### 2-1. 영구 해금형 19개 (1단계 전량)

| 아이템 | 아이템 ID | 개수 | 현재 게이트 위치 |
|---|---|---|---|
| 아이디 서체 | `font.<id>` | 15 | `handleFonts.ts` (`default` 제외) |
| 네컷 캡션·날짜 스탬프 | `cut.stamp` | 1 | `CutRecordScreen.tsx:106` |
| 네컷 프레임 커스텀 색 | `cut.frameColor` | 1 | `CutRecordScreen.tsx:122` |
| 네컷 프레임 배경 사진 | `cut.frameImage` | 1 | `CutRecordScreen.tsx:150` |
| 네컷 로고 제거 | `cut.noLogo` | 1 | `settingsStore.stripLogoRemoval` |

### 2-2. 판매 대상에서 제외한 것과 그 이유

| 대상 | 이유 |
|---|---|
| 사진 상한 상향 (`limits.ts:5`) | 사용자 결정으로 계획 제외 |
| 사진첩 상한 상향 (`limits.ts:17`) | 사용자 결정으로 계획 제외 |
| 앨범 원본 화질 백업 (`rebackupAlbumOriginals`) | 사용자 결정으로 계획 제외 |
| QR 디자인 (`settingsStore.qrDesign`) | **죽은 값.** QR 전면 제거 때 상태값만 남았고 이를 읽는 화면이 없다 |
| 지구본 스킨 (`globeSkins.ts`) | 애초에 `premium: false`로 전원 무료였다. 프리미엄 혜택이 아니었고, 기본 스킨(`aurora`)을 잠그면 앱 첫 화면이 잠긴다. `premium` 플래그는 향후 신규 스킨용 슬롯으로 유지 |

사진 관련 3종을 제외하면서 **1단계 소모성 아이템이 0개**가 됐다.
`mileage_tickets` 테이블과 소모 로직은 이 문서에만 남기고 구현하지 않는다.
원장 구조가 나중에 소모성을 그대로 받아줄 수 있게 설계돼 있으므로, 필요해지면 그때 붙인다.

---

## 3. 데이터 모델

### 3-1. 핵심 원칙

> **잔액은 클라이언트가 계산하지 않는다. append-only 원장의 서버 합계가 단일 출처다.**

잔액을 컬럼으로 저장하지 않는 이유: 저장하면 원장과 어긋나는 순간 어느 쪽이 진실인지 알 수 없어진다.
조회는 뷰로 감싼다.

### 3-2. 서버 스키마 (`supabase/schema.sql` 추가)

```sql
-- 원장: 모든 적립·차감을 한 줄씩 남긴다. UPDATE/DELETE 없음.
create table if not exists public.mileage_ledger (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      integer not null,         -- 적립 +, 차감 -
  reason     text not null,            -- 'purchase'|'badge'|'grant'|'spend'|'refund'
  ref_key    text not null,            -- 멱등 키
  item_id    text,                     -- 차감이면 무엇을 샀는지
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref_key)    -- ★ 중복 적립 원천 차단
);

-- 영구 해금 목록. ledger에서 파생되지만 조회를 위해 별도로 둔다.
create table if not exists public.mileage_entitlements (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,            -- 'font.pen', 'cut.frameColor'
  granted_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 스토어 영수증. 재검증·환불 추적용.
create table if not exists public.iap_receipts (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  platform       text not null,        -- 'ios'|'android'
  transaction_id text not null,
  product_id     text not null,
  state          text not null default 'verified',  -- verified|refunded
  raw            jsonb,
  created_at     timestamptz not null default now(),
  unique (platform, transaction_id)    -- ★ 영수증 재사용 차단
);

-- 배지 보상 카탈로그. 상한 계산의 근거.
create table if not exists public.badge_catalog (
  badge_id integer primary key,
  tier     text not null check (tier in ('bronze','silver','gold')),
  reward   integer not null,
  hidden   boolean not null default false
);

-- 판매 아이템 가격표. 가격의 단일 출처는 서버다.
create table if not exists public.item_catalog (
  item_id text primary key,           -- 'font.pen', 'cut.noLogo'
  price   integer not null check (price > 0),
  active  boolean not null default true
);
```

`badge_catalog`과 같은 이유로 테이블이다 — 아이템이 계속 추가될 예정인데
가격을 RPC 내부 상수로 두면 아이템 하나 늘릴 때마다 RPC를 재배포해야 한다.
`active=false`로 내리면 판매만 중단되고 **이미 산 사람의 보유는 유지**된다.

### 3-3. RLS

다섯 테이블 모두:

- `select` — 본인 행만 (`badge_catalog` / `item_catalog`은 전체 읽기 허용)
- `insert` / `update` / `delete` — **전부 차단**

쓰기는 `SECURITY DEFINER` RPC와 Edge Function의 service_role로만 들어간다.
클라이언트가 자기 잔액에 `insert`할 수 있으면 재화 시스템이 아니라 장식이다.

### 3-4. 클라이언트 — `src/store/mileageStore.tsx` (신규)

`settingsStore`에 얹지 않는다. `settingsStore`는 이미 800줄에 가깝고 **로컬 우선(local-first)** 전제인데
마일리지는 정반대로 **서버가 진실**이다. 같은 파일에 두면 두 원칙이 뒤엉킨다.

```ts
interface MileageState {
  balance: number;               // 서버에서 받은 값. 로컬 증감 금지
  entitlements: Set<string>;     // 영구 해금
  pendingBadgeIds: number[];     // 미청구 배지 큐(오프라인 대비)

  has(itemId: string): boolean;  // 게이트가 부르는 유일한 함수
  refresh(): Promise<void>;
  spend(itemId: string): Promise<SpendResult>;
  claimPendingBadges(): Promise<void>;
}
```

로컬에는 **읽기 캐시로만** 저장한다(오프라인에서 이미 산 서체를 못 쓰면 곤란하다).
캐시는 `has()` 판정에만 쓰고 `spend()`는 반드시 온라인이어야 한다.

---

## 4. 밸런스

### 4-1. 배지 등급

`badges.ts`의 `Badge` 인터페이스에 `tier: 'bronze' | 'silver' | 'gold'` 필드를 추가한다.
판정 로직(`badgeRules.ts`)은 손대지 않는다 — 등급은 순수 메타데이터다.

| 등급 | 보상 | 기준 | 노출 46개 중 |
|---|---|---|---|
| 브론즈 | 30 | 앱을 쓰면 자연히 따는 것 (첫 기록, 대륙 첫발, 동행 유형) | 약 24개 |
| 실버 | 80 | 의도적 행동이 필요 (재방문, 여러 지역, 연속 기록, 소셜) | 약 16개 |
| 골드 | 200 | 장기 누적 (10개국 이상 마일스톤, 1년 습관, 시즌 한정) | 약 6개 |

**2026-08 현재 노출 배지 전량 = 3,200 마일리지.**
이 값은 상수가 아니라 카탈로그에서 계산되는 파생값이다(§5-2).

### 4-2. 가격표

| 아이템 | 가격 | 소계 |
|---|---|---|
| 서체 — 스탠다드 9종<br>`pen` `serif` `maru` `courier` `caveat` `bebas` `playfair` `righteous` `amatic` | 각 900 | 8,100 |
| 서체 — 시그니처 6종<br>`brush` `impact` `pacifico` `marker` `orbitron` `yuyu` | 각 1,500 | 9,000 |
| 네컷 캡션·날짜 스탬프 | 1,200 | 1,200 |
| 네컷 프레임 커스텀 색 | 1,500 | 1,500 |
| 네컷 프레임 배경 사진 | 1,800 | 1,800 |
| 네컷 로고 제거 | 2,500 | 2,500 |
| **전체 컴플리트** | | **24,100** |

무과금 최대 3,200 ÷ 전체 24,100 = **약 13%**.
스탠다드 서체 3개 정도를 공짜로 가질 수 있고, 네컷 기능은 로고 제거를 제외하면 하나 정도 손이 닿는다.

로고 제거를 최고가로 둔 이유: 유일하게 **앱의 브랜드 노출을 지우는** 아이템이다.
원하는 사람이 가장 많고, 싸게 팔면 공유되는 스트립에서 eOrth 로고가 전부 사라진다.

### 4-3. 충전 패키지 (스토어 소모성 상품)

| 상품 ID | 지급 | 가격 | 보너스 |
|---|---|---|---|
| `mileage_1000` | 1,000 | ₩1,100 | — |
| `mileage_3000` | 3,300 | ₩3,300 | +10% |
| `mileage_6000` | 6,900 | ₩6,600 | +15% |
| `mileage_12000` | 15,000 | ₩13,000 | +25% |

대략 **1 마일리지 ≈ 1원**.
예상 실지출은 "서체 1~2개 + 네컷 기능 1개" = 3,000~5,000 마일리지 ≈ ₩3,300~6,600.

---

## 5. 배지 보상의 검증 한계와 방어선

### 5-1. 문제

배지 판정 로직(`badgeRules.ts`)은 클라이언트에 있고, 판정 대상인 `records`도 로컬 우선이다.
서버의 `posts`는 로컬 `records`와 1:1이 아니라 독립적인 재판정이 불가능하다.
`user_app_state.data`에 `badgeEarnedAt`이 백업되지만 이것도 클라이언트가 자유롭게 쓰는 jsonb 블롭이라 신뢰할 수 없다.

그런데 배지 보상은 **실제 돈으로 사는 재화와 같은 지갑**에 들어간다.
즉 클라이언트를 조작하면 무한 적립이 가능한 구조다.

`badgeRules.ts`를 Edge Function에서 재사용하는 방안도 검토했다(순수 로직이라 이미지 의존이 없어 포팅 자체는 된다).
그러나 서버 `posts`와 로컬 `records`의 간극을 맞추는 비용이 얻는 것보다 크다.

### 5-2. 방어선 — 배지 적립에 계정당 총량 상한

```sql
cap := (select coalesce(sum(reward), 0) from public.badge_catalog where not hidden)
-- 검사: 누적_badge_적립 + 이번_적립 <= cap
```

**이 상한이 곧 "정직한 사용자가 정당하게 도달 가능한 최대치"와 같은 값이다.**
따라서 클라이언트를 완전히 조작해도 조작으로 인한 실제 손실은 0이다.
서버 재판정 없이 경제가 무너지지 않는다.

상한을 상수로 박지 않고 카탈로그 합계로 계산하는 이유:

- 배지는 계속 추가될 예정이다. 상수면 추가할 때마다 RPC 재배포가 필요하고, **깜빡하면 새 배지를 딴 사용자가 보상을 못 받는다.**
- 숨김 배지(현재 46개) 해제도 `hidden`을 `false`로 내리는 것만으로 상한이 열린다.

여기에 이상 탐지 로그(짧은 시간에 다량 청구)를 남겨 사후 대응 여지를 둔다.

### 5-3. 카탈로그 동기화

`badges.ts`가 단일 출처다(이미지·문구·glow가 거기 있다).
`badge_catalog`는 `id`/`tier`/`hidden`만 뽑은 **파생본**이고 손으로 관리하지 않는다.

```
scripts/build-badge-catalog.ts
  badges.ts + badgeVisibility.ts 읽기
  → supabase/seed-badge-catalog.sql (upsert 문) 생성
```

`countryGeo` 파이프라인과 같은 패턴이다.

**검증 테스트 `src/utils/badgeCatalog.verify.ts`를 추가한다.**
모든 배지에 `tier`가 있는지를 `npm test`에서 잡는다 —
`tier` 없는 배지는 카탈로그에 못 들어가고, 그러면 그 배지는 영원히 보상이 0이 된다.
조용히 지나가기 딱 좋은 종류의 버그다.

> ⚠️ `badgeVisibility.ts`는 `badges.ts`의 이미지 `require`에 묶이면 안 된다(파일 헤더 주석 참조).
> 생성 스크립트도 같은 제약을 지켜야 한다 — node에서 PNG를 파싱하려다 죽는다.

### 5-4. 배지 확장 시 인플레이션 관리 (운영 규칙)

조작 방어와는 별개의 경제 설계 문제다.
배지가 46 → 92개(숨김 전량 해제)가 되면 무과금 획득량이 3,200 → 약 6,000+로 뛴다.
그때 아이템이 그대로면 "체험판 수준"이 "널널하게"로 밀린다.

> **신규 배지 보상 총액 ≤ 동시에 추가하는 신규 아이템 가격 총액 × 0.15**

배지만 늘리지 않고 커스텀도 같이 늘린다는 뜻이다.
어차피 아이템 확장이 예정돼 있으므로 자연스러운 짝이다.

---

## 6. 서버 함수

Edge Function 1개 + RPC 3개.
적립·차감은 **우리 DB만 건드리고 원자성이 필요한 연산**이라 `SECURITY DEFINER` RPC가 맞다
(`follower_counts` / `post_counts` / `mate_suggestions`와 같은 패턴).
외부 HTTP와 스토어 자격증명이 필요한 영수증 검증만 Edge Function이다.

| 이름 | 종류 | 하는 일 |
|---|---|---|
| `verify-purchase` | Edge Function | Apple/Google 영수증 검증 → 적립 |
| `mileage_state()` | RPC (stable) | 잔액 + 보유 아이템을 한 번에 반환 |
| `claim_badge_rewards(ids int[])` | RPC (volatile) | 배지 보상 적립. 상한·중복 검사 |
| `spend_mileage(item_id text)` | RPC (volatile) | 차감 + 해금을 한 트랜잭션으로 |

### `spend_mileage`가 원자적이어야 하는 이유

차감과 해금이 갈라지면 **돈은 빠졌는데 아이템이 없는** 상태가 남는다.
`mileage_entitlements`의 PK `(user_id, item_id)`가 동시 요청 중 두 번째를 막고,
그러면 트랜잭션이 통째로 롤백돼 차감도 취소된다. 별도 잠금 없이 중복 결제가 막힌다.

가격은 `item_catalog`에서 읽는다. 클라이언트가 보낸 가격은 절대 믿지 않는다.
`src/constants/mileageItems.ts`는 **표시 전용 사본**이고, 어긋나더라도 서버 값이 이긴다.

---

## 7. 흐름

### 7-1. 충전 — `finishTransaction`의 순서가 전부

```
충전 패키지 탭
  → react-native-iap requestPurchase(productId)
  → 스토어 결제 → purchaseUpdatedListener 수신
  → verify-purchase 호출 (영수증 + transactionId)
       Apple : App Store Server API 로 JWS 서명 검증
       Google: Play Developer API purchases.products.get
       iap_receipts UNIQUE(platform, transaction_id) 로 영수증 재사용 차단
       mileage_ledger insert (reason='purchase', ref_key=transaction_id)
  → 200 응답을 받은 뒤에만 finishTransaction()   ★
  → mileageStore.refresh()
```

★ 검증 전에 `finishTransaction`을 부르면 스토어가 "처리 완료"로 간주해 영수증을 회수한다.
그 사이 서버 검증이 실패하면 **결제는 됐는데 마일리지는 없고 복구할 영수증도 사라진** 상태가 된다.
소모성 상품에서 가장 흔한 사고다.

**미완료 트랜잭션 복구**: 앱 시작 시 `getAvailablePurchases()`로 finish되지 않은 영수증을 훑어 재제출한다.
검증 도중 앱이 죽거나 네트워크가 끊긴 경우가 여기서 회수된다.
`ref_key = transaction_id`에 unique가 걸려 있어 몇 번을 재제출해도 적립은 한 번이다.

### 7-2. 배지 적립

`useBadgeEarning`이 `markBadgesEarned`를 호출하는 지점에 청구를 건다.
다만 **훅에서 직접 네트워크를 치지 않는다** — 이 훅은 렌더마다 도는 평가 전용이라 부작용을 넣으면 지저분해진다.
대신 `mileageStore.pendingBadgeIds`에 쌓고, 온라인일 때 배치로 `claim_badge_rewards(ids)`를 부른다.

오프라인이면 큐에 남았다가 다음 접속에 나간다.
중복 청구는 unique 제약이 무해하게 흡수하므로 큐를 낙관적으로 다뤄도 된다.

**소급 지급은 별도 로직이 아니다.**
마일리지 도입 후 첫 실행에서 `badgeEarnedAt`의 전체 id를 그냥 이 경로로 청구하면 끝이다.
서버 배치 SQL도, 일회성 마이그레이션 스크립트도 필요 없다.

### 7-3. 소비와 게이트 교체

현재 게이트는 전부 `isPremium` 불리언 하나를 본다. 이것이 아이템별 `has(itemId)`로 쪼개진다.

| 위치 | 현재 | 변경 후 |
|---|---|---|
| `SettingsScreen.tsx:177` | `if (!isPremium) → Premium` | 모달은 항상 열고 **폰트별로** 잠금 뱃지 표시 |
| `CutRecordScreen.tsx:106` | `if (!isPremium)` | `has('cut.stamp')` |
| `CutRecordScreen.tsx:122` | `if (!isPremium)` | `has('cut.frameColor')` |
| `CutRecordScreen.tsx:150` | `if (!isPremium)` | `has('cut.frameImage')` |
| `SettingsScreen.tsx:435` | `isPremium ? 토글 : 잠금` | `has('cut.noLogo')` |
| `CutRecordScreen.tsx:65` | `isPremium && stripLogoRemoval` | `has('cut.noLogo') && stripLogoRemoval` |
| `ProfileSync.tsx:47` | `isPremium ? handleFont : null` | 소유한 폰트일 때만 서버로 |
| `ProfileScreen.tsx:1621` 외 | `isPremium ? handleFont : null` | 훅으로 통일 |

#### 서체 판정을 훅 하나로 모은다

```ts
// src/hooks/useMyHandleFont.ts
export function useMyHandleFont(): string | null;  // 소유 안 한 폰트면 null
```

현재 `isPremium ? handleFont : null` 패턴이 8곳에 복붙돼 있다
(`ProfileScreen` `SocialScreen`×3 `PostDetailScreen`×2 `FriendProfileScreen` `ProfileSync`).
한 군데만 빠뜨려도 **안 산 서체가 노출되는** 구멍이 생긴다.
소유가 개별 단위가 되면서 실수 여지가 커지므로 이 정리는 선택이 아니다.

타인의 서체(`item.user.font`)는 서버가 내려준 값이라 그대로 둔다.
`ProfileSync`가 소유 검증 후에만 올리므로 서버 값 자체가 이미 검증된 상태다.

---

## 8. 화면

### `PremiumScreen` → 마일리지 상점으로 개편

새 화면을 만들지 않고 기존 화면을 쓴다.
쇼케이스 카드 3종(`FontShowcaseCard` / `LogoShowcaseCard` / `FrameShowcaseCard`)이
이미 "만져보게 하는" 구조로 짜여 있어 가격과 보유 표시만 얹으면 그대로 상점이 된다.
진입점(`navigation.navigate('Premium')`)도 게이트마다 이미 박혀 있다.

- 상단: 잔액 + 충전 버튼
- 본문: 쇼케이스 카드 3종 (아이템별 가격 / 보유 배지 / 구매 버튼)
- 하단: 충전 패키지 4종

`LAUNCH_FREE_PREMIUM` 분기(`PremiumScreen.tsx:96/114/133/163`)와
`handleSubscribe`(`:60`)는 전부 제거한다.

### `MileageHistoryScreen` (신규)

원장 조회. 실제 돈이 들어가는 재화라 "내가 언제 뭘 샀는지"를 사용자가 볼 수 없으면
환불 문의에 대응할 방법이 없다. 설정에서 진입한다.

### 배지 획득 토스트

`+80 마일리지`를 붙인다. 배지를 따는 순간이 재화 시스템을 인지시키는 가장 좋은 지점이다.

---

## 9. 전환 절차

```
1. seed-badge-catalog.sql 실행                    ← 서버 카탈로그 먼저
2. schema.sql 재실행 (테이블 5 + RPC 3 + RLS + item_catalog 시드)
3. supabase functions deploy verify-purchase
4. 얼리 어답터 보상 SQL 1회 실행
5. App Store / Play Console 소모성 상품 4종 등록·승인
6. LAUNCH_FREE_PREMIUM = false 로 내린 앱 배포     ← 마지막
```

**6번이 마지막인 것이 중요하다.** 순서가 뒤집히면 스토어 상품이 승인되기 전에 게이트가 잠겨
**살 방법이 없는데 잠긴** 상태가 된다.

**1번이 앱 배포보다 먼저인 것도 중요하다.** 순서가 뒤집히면 신규 앱이 서버에 없는 `badge_id`를
청구하고 거부당한다. 구버전 앱은 자기가 아는 배지만 청구하므로 안전하다.
이 순서를 `supabase/SERVER-STATE.md`에 명시한다.

### 얼리 어답터 보상

```sql
insert into public.mileage_ledger (user_id, delta, reason, ref_key)
select id, 2000, 'grant', 'early-adopter-2026-08'
from public.profiles
on conflict (user_id, reason, ref_key) do nothing;
```

`unique (user_id, reason, ref_key)` 덕분에 **재실행해도 안전하다.**
이 프로젝트에 "재실행 금지" 마이그레이션이 이미 두 건 있으므로(가져온 앨범 공개범위, 서로이웃 전환)
지뢰를 하나 더 만들지 않으려고 멱등으로 설계했다.

---

## 10. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 오프라인 | `has()`는 로컬 캐시로 판정(산 서체는 오프라인에서도 쓰임). `spend()`는 온라인 필수 — "연결 후 구매 가능" 안내 |
| 로그아웃 | 마일리지 캐시는 **지운다.** 기록과 달리 계정 귀속이라 남기면 다음 계정에 남의 잔액이 보인다. `keepIdentity` 규칙과 무관하게 별도 처리 |
| 미로그인 | 상점 진입 시 로그인 유도. 원장이 `auth.users`에 걸려 있어 익명 보유가 불가능 |
| 환불 | **1단계는 수동** — `iap_receipts.state='refunded'` + 보정 원장 삽입. 자동 웹훅은 2단계. 베타 규모에서 웹훅 인프라를 먼저 세울 이유가 없고, 수동 경로만 있어도 분쟁 대응은 된다 |
| 잔액 부족 | 구매 시트에서 부족분과 충전 패키지 추천 |
| 계정 삭제 | `on delete cascade`로 원장까지 삭제. `delete-account` Edge Function 수정 불필요 |
| 기기 변경 | 원장이 서버에 있으므로 로그인만으로 전부 복원 |

---

## 11. 구현 범위 (1단계)

### 신규 파일

- `src/store/mileageStore.tsx`
- `src/hooks/useMyHandleFont.ts`
- `src/screens/MileageHistoryScreen.tsx`
- `src/constants/mileageItems.ts` (아이템 ID·가격 카탈로그, 서버와 동기)
- `src/services/mileage.ts` (RPC·Edge Function 호출)
- `src/services/iap.ts` (`react-native-iap` 래퍼)
- `src/utils/badgeCatalog.verify.ts`
- `scripts/build-badge-catalog.ts`
- `supabase/functions/verify-purchase/index.ts`
- `supabase/seed-badge-catalog.sql`

### 수정 파일

- `supabase/schema.sql` — 테이블 5 + RPC 3 + RLS + `item_catalog` 시드
- `supabase/SERVER-STATE.md` — 실행 순서 기록
- `src/constants/badges.ts` — `tier` 필드 추가
- `src/constants/featureFlags.ts` — `LAUNCH_FREE_PREMIUM` 제거
- `src/screens/PremiumScreen.tsx` — 상점으로 개편
- `src/screens/SettingsScreen.tsx` — 폰트 개별 잠금, 로고 제거 게이트, 내역 진입점
- `src/screens/CutRecordScreen.tsx` — 게이트 3곳 + `hideLogo`
- `src/components/ProfileSync.tsx` — 서체 소유 검증
- `src/screens/ProfileScreen.tsx` / `SocialScreen.tsx` / `PostDetailScreen.tsx` / `FriendProfileScreen.tsx` — 훅 적용
- `src/store/settingsStore.tsx` — `markBadgesEarned`의 토스트 문구에 획득 마일리지 표기
- `src/navigation/types.ts` / `AppNavigator.tsx` — `MileageHistory` 라우트
- `src/i18n/locales/ko.ts` / `en.ts` — 문구
- `package.json` — `react-native-iap` 추가 (**EAS 재빌드 필요**)

### 1단계에서 하지 않는 것

- 소모성 아이템 (`mileage_tickets`) — 팔 것이 없다
- 환불 자동 웹훅 — 수동 경로로 시작
- 신규 커스텀 아이템 — 기존 게이트 이관이 먼저다
- 지구본 스킨 유료화 — 현행 무료 유지

---

## 12. 리스크

| 리스크 | 대응 |
|---|---|
| 배지 보상 서버 검증 불가 | 카탈로그 기반 총량 상한(§5-2). 조작 손실 0 |
| `react-native-iap` 추가로 EAS 재빌드 필요 | 전환 절차 5번(스토어 상품 승인)과 일정을 함께 잡는다 |
| 영수증 검증 자격증명 관리 | Apple `.p8` 키 / Google 서비스 계정 JSON을 Supabase secrets에 보관. 코드·저장소에 넣지 않는다 |
| 무료였던 기능이 잠기는 데 대한 반발 | 얼리 어답터 2,000 + 배지 소급으로 전환 직후 즉시 뭔가를 살 수 있게 한다 |
| `tier` 누락 배지의 조용한 보상 0 | `badgeCatalog.verify.ts`가 `npm test`에서 차단 |
| 서체 소유 검증 누락 | 8곳 복붙을 `useMyHandleFont` 훅 하나로 수렴 |
