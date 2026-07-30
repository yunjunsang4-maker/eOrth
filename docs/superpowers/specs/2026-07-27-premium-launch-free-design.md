# 프리미엄 구조 개편 — 출시 기념 무료 개방

**작성일:** 2026-07-27
**상태:** 설계 승인됨

## 배경

수익 구조를 **구독(프리미엄)에서 앱내 재화**로 바꾸기로 했다. 재화로 커스텀 요소나 개별 기능을 사는 방식이다.

다만 재화 종류와 가격이 아직 정해지지 않았다. 그래서 **출시 시점에는 프리미엄 구조를 그대로 두되, 출시 기념으로 현재 프리미엄 기능을 전원 무료 개방**한다. 재화 시스템이 준비되면 그때 전환한다.

동시에 현재 혜택 중 **광고 제거**와 **사진첩 원본 백업** 두 가지는 혜택 목록에서 뺀다. 광고 제거는 수익원과 정면으로 충돌하고, 원본 백업은 서버 저장소 비용이 들기 때문이다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 무료 개방 기간 | 기간 제한 없음. 앱내 재화 도입 시 전환 (만료 로직 불필요) |
| 광고 제거 혜택 | 삭제 — 전원 광고 노출 |
| 사진첩 원본 백업 | 잠금 — 전원 압축 업로드, 코드는 재화용으로 남김 |
| 사진 장수 상향 | 이미 제거됨(2026-07 선반영). 그대로 유지 |
| 무료 안내 | 페이월(`PremiumScreen`)을 안내 화면으로 전환 |

## 개편 후 혜택 구성

**남는 혜택 3종** — 무료 개방 플래그로 전원 사용 가능

1. 아이디 폰트 (`handleFont`)
2. 스트립 로고 제거 (`stripLogoRemoval`)
3. 프레임 커스텀

**빠지는 혜택 2종**

- 광고 제거
- 사진첩 원본 백업

**이미 빠져 있던 것** — 사진 장수 상향(기록 100장 / 사진첩 200장). `limits.ts`에서 상향치를 재화용 예약값으로 남겨둔 상태다.

## 구현

### 1. 무료 개방 스위치

`src/constants/featureFlags.ts`

```ts
export const LAUNCH_FREE_PREMIUM = true;
```

`src/store/settingsStore.tsx` — 외부로 내보내는 `isPremium`을 `LAUNCH_FREE_PREMIUM || 저장값`으로 계산한다. 저장값(`setIsPremium`으로 바뀌는 값)은 건드리지 않고 **노출 시점에만** 덮어쓴다. 플래그를 내리면 저장값이 그대로 복원된다.

**이 설계의 핵심은 게이트 코드를 하나도 건드리지 않는 것이다.** `isPremium` 참조가 18개 파일에 흩어져 있는데, 그 전부가 자동으로 열린다. 재화 도입 시에는 플래그를 `false`로 내린 뒤 게이트를 "재화 보유 여부"로 교체하면 된다.

### 2. 광고 제거 혜택 삭제

`src/screens/SocialScreen.tsx:2715`

```ts
// 현재
if (!FEED_ADS_ENABLED || isPremium || timelineItems.length < 2) return timelineItems;
// 변경
if (!FEED_ADS_ENABLED || timelineItems.length < 2) return timelineItems;
```

`isPremium` 조건을 빼면 전원 광고가 노출된다. 무료 개방으로 모두가 프리미엄 상태가 되므로, 이 조건을 남겨두면 **아무에게도 광고가 안 나가** 수익이 0이 된다.

`useMemo` 의존성 배열에서도 `isPremium`을 제거한다.

### 3. 사진첩 원본 백업 잠금

`src/store/recordStore.tsx:814`

```ts
// 현재
albumQuality: rec.albumUploadQuality ?? (isPremium ? 'original' : 'compressed'),
// 변경
albumQuality: rec.albumUploadQuality ?? 'compressed',
```

`rec.albumUploadQuality`가 명시된 기록은 그대로 존중한다(기존 데이터 보존). 기본값만 압축으로 고정한다.

업로드 경로(`services/posts.ts`의 `albumQuality: 'compressed' | 'original'`)는 **그대로 남긴다.** 재화로 해제할 때 이 자리에 조건을 다시 넣으면 된다.

### 4. 페이월 → 안내 화면

`src/screens/PremiumScreen.tsx`

- 혜택 목록에서 `benefitAds`(광고 제거), `benefitBackup`(원본 백업) 행 삭제 → 3행
- `LAUNCH_FREE_PREMIUM`이 참이면 구매 버튼 자리에 **"출시 기념으로 전체 기능을 무료 제공 중"** 안내 표시
- 거짓이면 기존 구매 UI 그대로

조건부로 두는 이유는 재화 전환 시 되돌리기 쉽게 하기 위해서다.

### 5. 설정 토글 숨김

`src/screens/SettingsScreen.tsx:376` — 프리미엄 체험 토글은 무료 개방 중 의미가 없다. `LAUNCH_FREE_PREMIUM`이 참이면 항목을 렌더하지 않는다.

같은 화면의 폰트·스트립 로고 항목은 잠금이 자동으로 풀리므로 수정하지 않는다.

### 6. i18n

`src/i18n/locales/ko.ts`, `en.ts`에 안내 문구 키를 추가한다. 삭제되는 혜택 문구 키(`benefitAdsTitle`/`Desc`, `benefitBackupTitle`/`Desc`)는 **지우지 않고 남긴다** — 재화 도입 시 재사용한다.

> **갱신 (2026-07-31):** 프리미엄 혜택이 3종(폰트·로고·프레임)으로 확정되고 **광고 제거는 도입하지 않기로** 결정되어, `benefitAdsTitle`/`Desc`는 실제로 삭제했다. `benefitBackup*`은 위 방침대로 남아 있다.

## 검증

- `npm run typecheck` — 통과
- `npm test` — 18개 파일 통과
- 실기기 확인
  - 소셜 피드에 광고가 노출된다(프리미엄 상태여도)
  - 아이디 폰트·스트립 로고 설정이 잠금 없이 열린다
  - 사진첩 업로드가 압축본으로 나간다
  - 페이월에 무료 안내가 뜨고 혜택이 3행이다

## 되돌리는 법

재화 시스템 도입 시:

1. `LAUNCH_FREE_PREMIUM = false`
2. 게이트(`isPremium`)를 재화 보유 여부로 교체
3. 필요하면 광고 제거·원본 백업을 재화 상품으로 되살림 — 관련 코드와 i18n 키가 남아 있다

## 범위 밖

- 앱내 재화 시스템 설계(종류·가격·구매 흐름) — 별도 작업
- RevenueCat 등 결제 연동 — 재화 설계 확정 후
- 사진 장수 상향 재도입
