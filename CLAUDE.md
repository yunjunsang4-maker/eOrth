# eOrth - React Native Expo App

## 개발 및 검증 명령어 (Commands)
- 빌드/타입 체크: `npx tsc --noEmit`
- 앱 실행: `npx expo start`
- 안드로이드 실행: `npx expo start --android`
- iOS 실행: `npx expo start --ios`

## 기술 스택 (Tech Stack)
- Core: React Native (Expo)
- Language: TypeScript
- Navigation: React Navigation (Stack, Bottom Tabs)
- Styling: inline style, StyleSheet (Vanilla CSS-like React Native styling)

## 코드 검증 규칙

새로운 기능이나 코드가 추가될 때마다
반드시 아래 두 가지를 확인해줘:

1. 오류 확인
   - 새로 추가된 코드에 문법 오류가 없는지 확인
   - import 누락이나 잘못된 참조가 없는지 확인
   - TypeScript 타입 오류가 없는지 확인 (`npx tsc --noEmit` 활용)

2. 호환성 확인
   - 새 기능이 기존 화면들과 충돌하지 않는지 확인
   - 공통 컴포넌트 (Toast, ReportModal 등) 와 호환되는지 확인
   - 네비게이션 연결이 올바른지 확인
   - 상태 관리 (useState, Context 등) 가 다른 화면과 충돌하지 않는지 확인

## 디자인 토큰

| 이름 | 값 |
|------|------|
| 배경 | #0A0A0F |
| 카드 | #2E2E3B |
| 보라 네온 | #BF85FC |
| 보라 딥 | #6B21A8 |
| 텍스트 흐림 | #A1A1B0 |
| 구분선 | #1A1A26 |
| 빨강 | #FF3B30 |

## 아이콘 규칙

- 댓글 아이콘: 반드시 SVG 말풍선 (react-native-svg, scaleX: -1, Path: "M21 11.5a8.38...") 사용. 💬 이모지 사용 금지.

## 파일 수정 규칙

- 지시한 파일만 수정할 것
- 다른 파일은 절대 건드리지 말 것
- 수정 전 반드시 기존 코드 확인할 것

## 하네스

**트리거 규칙** — 아래 요청이면 해당 스킬을 사용하라. 단순 질문은 직접 응답 가능.

| 요청 성격 | 스킬 |
|---|---|
| 코드를 실제로 고침 (기능·화면·버그·리팩터링) | `eorth-feature-build` |
| 빌드·OTA·제출해도 되는지 판정 | `eorth-release-gate` |
| Supabase 스키마와 앱 shape 대조 | `eorth-server-app-parity` |
| iOS/Android 비대칭·안드로이드 함정 점검 | `eorth-platform-parity` |

실행 모드는 4개 모두 **서브 에이전트 고정**이다. 이 환경에 `TeamCreate`가 없어
에이전트 팀 모드는 실행 시점에 깨진다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-08-20 | 초기 구성 — 하네스 4개, 에이전트 8, 스킬 8 | 전체 | - |
