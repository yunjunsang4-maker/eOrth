# 프로필 "마이" 티켓 (QR 프로필 공유)

날짜: 2026-07-20 · 상태: 승인됨(기능 범위) · 시각 디자인 TBD(추후 사용자 제공)

## 목적

프로필탭 통계 행(`여행 수 · 이웃`) 옆에 **"마이"** 항목을 추가한다. 탭하면 비행기
티켓 형태의 모달이 뜨고, 그 안의 **QR 코드**로 자신의 프로필을 공유한다. 링크
텍스트 공유는 하지 않는다(QR 전용). 티켓의 시각 디자인은 추후 확정되므로, 지금은
기능(데이터 바인딩·QR·저장·공유)을 완성하고 디자인이 들어올 자리를 플레이스홀더로
둔다.

## 범위 결정(사용자 확정)

1. 공유 수단은 **QR만** — 링크 텍스트 공유 없음
2. QR을 **이미지로 저장·공유**까지 지원(대면 표시 + 원격 전달)
3. **안드로이드 이미지 공유는 현재 RN Share 한계 그대로 둔다**(저장은 정상) —
   다음 EAS 빌드의 expo-sharing 도입 시 앱 전체가 함께 해결됨

## 컴포넌트 구조

### 진입점 — `ProfileScreen.tsx` 통계 행
`statsRow`에 세 번째 셀 "마이" 추가. 숫자 자리에 **티켓 아이콘**(`assets/ticket.png`
— 51×51 RGBA 흰색 글리프, 다크 배경에 흰색으로 표시)을 얹은 pressable, 기존
`StatCard`와 같은 시각 리듬. `Image source={require('../../assets/ticket.png')}`로
표시(`tintColor` 불필요 — 이미 흰색). 탭 → `ProfileTicketModal` 오픈. i18n: ko
`마이` / en `My`.

### 새 파일 — `src/components/ProfileTicketModal.tsx`
Props: `visible`, `onClose`, 프로필 데이터(`handle`, `name`, `photo`,
`homeCountryCode`/`homeCountry` 표시값, `tripCount`, `neighborCount`).

- **티켓 카드(캡처 대상)**: `captureRef`를 걸 `ViewShot`/`View` 하나. 내부에
  프로필 사진·이름/@아이디·거주국·여행 수·이웃 수·중앙 QR. **현재는 플레이스홀더
  레이아웃** — 디자인 확정 시 이 파일의 카드 JSX만 교체하면 되도록 데이터 바인딩을
  미리 배치.
- **QR**: `react-native-qrcode-svg`, 인코딩 값은 `eorth://user/<handle>`
  (친구찾기 스캐너·`appLinks.ts` 파싱과 호환). 스캔 신뢰성 위해 표준 흑백.
  프리미엄 QR 디자인 연동은 티켓 비주얼 확정 시 별도 검토(현 범위 제외).
- **액션 2개**: `이미지로 저장` · `공유`.

## 데이터 흐름 · 동작

1. "마이" 탭 → 모달 오픈(프로필 데이터는 ProfileScreen에서 props로 전달)
2. **저장**: `captureRef(ticketRef)` → temp uri →
   `MediaLibrary.requestPermissionsAsync(true)`(쓰기 전용) →
   `saveToLibraryAsync(uri)` → 성공 토스트(PhotoViewerModal과 동일 패턴)
3. **공유**: `captureRef(ticketRef)` → `Share.share({ url })`
   (iOS 이미지 전송 / Android 제한 — 의도된 현 상태)

## 엣지 케이스

- **아이디 미설정**: QR 자리에 "먼저 아이디를 설정하세요" 안내, 저장·공유 버튼
  비활성(친구찾기 QR과 동일 처리). handle 없으면 캡처 시도하지 않음.
- **캡처/저장/공유 실패**: 실패 토스트, 크래시 없이 무해화(try/catch).
- **권한 거부**: 저장 권한 거부 시 실패 토스트(기존 showPermissionDeniedAlert
  또는 PhotoViewerModal식 Alert 재사용).

## 검증

- `npx tsc --noEmit`
- 수동: 아이디 있는 계정에서 티켓 오픈→QR 표시→저장(갤러리 확인)→공유(iOS 이미지,
  Android 동작 범위 확인), 아이디 미설정 계정에서 안내·버튼 비활성, 친구찾기
  스캐너로 저장한 QR 이미지 스캔 시 내 프로필로 이동

## 파일 요약

- 신규: `src/components/ProfileTicketModal.tsx`
- 수정: `src/screens/ProfileScreen.tsx`(통계 행 "마이" 셀 + 모달 상태),
  `src/i18n/locales/ko.ts`·`en.ts`(마이·티켓 관련 키)
- 의존성 추가 없음(view-shot·media-library·qrcode-svg·RN Share 모두 기존)
