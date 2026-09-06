# 소셜 탭 스냅 바로 찍기 입구 (2026-09-07)

## 배경

팀원 피드백: 소셜 탭에서 바로 스냅을 찍고 싶다. 현재 스냅 입구는 지구본 탭에만 있다 —
탭 바 위 오버레이 `RecordFab`가 `isGlobeActive`일 때만 렌더되고 그 안의 네온 `SnapButton`이
`navigate('SnapRecord')`를 부른다(`CustomTabBar.tsx:655`, `RecordFab.tsx:189`). 소셜 탭 상단에는
인스타 스토리식 스냅 링 줄(`SocialScreen.tsx` `storySection`)이 이미 있다.

## 결정 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 입구 위치 | 스냅 링 줄 **맨 앞 '내 스냅' 칸** (네온 버튼 추가 안 함) |
| 내 스냅 없음 | 내 프로필 사진(없으면 사람 아이콘) + 회색 링 + 우하단 `+` 배지, 라벨 "내 스냅". 어디를 눌러도 카메라 |
| 내 스냅 있음 | 내 대표 링을 맨 앞으로 옮기고 `+` 배지 부착. 링 탭 = 상세(기존), `+` 배지 탭 = 카메라 |
| 데모 스냅 | 내 항목 뒤에 유지 |
| 범위 밖 | `RecordFab`·`SnapRecordScreen`·알림·감지기 변경 없음 |

## 1. 순수 로직 — `src/utils/snapStrip.ts` (신규)

```ts
/** 스냅 링 줄 정렬 — 내 대표 항목이 있으면 맨 앞으로(나머지 순서 유지), 없으면 그대로. */
export function putMineFirst<T>(items: T[], isMine: (item: T) => boolean): T[];
```

- 내 항목이 여러 개(나라별 대표)면 **첫 번째 하나만** 앞으로, 나머지 내 항목은 제자리.
- 빈 배열·내 항목 없음 → 입력과 같은 순서의 새 배열.
- 입력 배열을 mutate하지 않는다.

검증 `src/utils/snapStrip.verify.ts`: 빈 배열, 내 항목 없음, 내 항목이 이미 첫 번째, 중간에 있음,
내 항목 2개(첫 번째만 이동·두 번째 제자리), 원본 불변.

## 2. 소셜 화면 — `src/screens/SocialScreen.tsx`

`snapDisplay` 계산(약 2986행)을 다음 규칙으로 바꾼다:

```ts
const isMineSnap = (s: any) => s.isMyPost || s.user?.handle === globalHandle;
const ordered = putMineFirst(snapItems, isMineSnap);
const hasMine = ordered.length > 0 && isMineSnap(ordered[0]);
// 내 스냅이 없으면 '내 스냅 +' 자리표시 항목을 맨 앞에. 데모 스냅은 그 뒤.
const snapDisplay = hasMine
  ? ordered
  : [MY_SNAP_PLACEHOLDER, ...(ordered.length === 0 ? [{ ...exampleSnap, _hasUnviewed: true }] : ordered)];
```

`MY_SNAP_PLACEHOLDER = { id: '__my-snap-entry__', _mySnapEntry: true }` (모듈 상수).

렌더(약 3058행 map):
- `snap._mySnapEntry`면 별도 분기: `TouchableOpacity`(onPress → `select()` 햅틱 → `navigation.navigate('SnapRecord')`),
  링은 그라데이션 대신 `['#3A3A4A', '#3A3A4A']`(본 스토리와 같은 회색), 아바타는 `globalProfilePhoto`
  있으면 사진, 없으면 `PersonIcon`, 라벨 `t('social.mySnap')`. `accessibilityRole="button"`,
  `accessibilityLabel={t('social.mySnapA11y')}`.
- 기존 항목 중 `isMineSnap(snap)`이고 `ordered[0]`(맨 앞)이면 링 우하단에 `+` 배지를 겹친다.
  배지는 **별도 `TouchableOpacity`**(`hitSlop 8`, onPress → `select()` → `navigate('SnapRecord')`),
  링 본체 탭은 기존대로 상세. 배지는 `storyRing` 바깥 `storyItem` 기준 절대배치(`position:'absolute', right: 0, bottom: 18`).
- `+` 배지: 지름 22, 배경 `skinAccent.accent`, 테두리 2 `#0A0A0F`(링과 분리), 안에 `PlusIcon size 12 color '#0A0A0F'`.
  `PlusIcon`은 `components/icons`에 있다(`index.tsx:1144`).

스타일 추가(`s`): `storyPlusBadge`, `storyPlusBadgeInner`. 새 아키텍처 함정: 배지 아이콘이 RNSVG이므로
**배지 `TouchableOpacity` 안에 `View pointerEvents="none"`으로 감싼 뒤 아이콘을 넣는다**(RNSVG 터치삼킴 방어).

## 3. i18n — `src/i18n/locales/ko.ts`·`en.ts` `social` 섹션

| 키 | ko | en |
|---|---|---|
| `social.mySnap` | 내 스냅 | My snap |
| `social.mySnapA11y` | 스냅 찍기 | Take a snap |

## 4. 흐름·경계

- 촬영 후 `SnapRecordScreen`은 `navigation.goBack()` → 소셜 탭으로 복귀, `records`에 추가된 스냅이 `snapItems`에 잡혀 맨 앞에 뜬다(내 스냅이므로 배지 부착 상태).
- 해외 판정·국가 감지·권한은 촬영 화면이 지금처럼 처리한다. 소셜 탭은 게이트를 두지 않는다(지구본 탭 버튼과 동일).
- 로그인 전/핸들 없음: `globalHandle`이 빈 문자열이어도 `isMineSnap`은 `isMyPost`로도 판정하므로 안전. 프로필 사진 없음 → 사람 아이콘.
- 피드 윈도잉(`FEED_WINDOWING_ENABLED`)·광고 슬롯은 스냅 링 줄과 무관.

## 5. 검증

1. `node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts` 통과, `npx tsc --noEmit` 0, `npm test` 전체 통과.
2. 수동: 스냅 0개 → 링 줄 = [내 스냅 +, 데모]. 내 스냅 1개 → [내 링(+배지), …]. 타인 스냅만 → [내 스냅 +, 타인…].
   `+` 탭 → 카메라 → 촬영·저장 → 소셜 복귀 → 내 링이 맨 앞. 링 본체 탭은 상세.
3. 실기기 검증 전 OTA 금지.
