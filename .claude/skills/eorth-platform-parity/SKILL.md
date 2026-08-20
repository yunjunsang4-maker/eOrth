---
name: eorth-platform-parity
description: iOS와 Android의 코드 비대칭과 알려진 안드로이드·새 아키텍처 함정 재발을 병렬로 훑는 워크플로우. "안드로이드에서만 이상해", "파리티 점검해줘", "플랫폼 차이 확인", "안드로이드 함정 재발했나", "iOS만 되고 안드는 안 돼", "회피 코드 남아 있나", "다시 훑어줘" 요청 시 사용할 것. 코드를 고치는 작업은 eorth-feature-build, 빌드 가능 여부는 eorth-release-gate, 서버-앱 계약은 eorth-server-app-parity가 담당하므로 그쪽이면 쓰지 마라. 이 스킬은 코드 구조만 보며 실기기 동작은 판정하지 않는다.
---

# 플랫폼 파리티 하네스

**실행 모드: 서브 에이전트 고정** (`TeamCreate` 없음).
**아키텍처: 팬아웃/팬인.** 같은 코드를 서로 다른 눈으로 보므로 병렬이 맞다.

```
[오케스트레이터]
   ├─ Agent(platform-branch-scanner, run_in_background:true, model:"opus")
   │     → _workspace/platform-parity/01_platform_branches.md   (분기 구조를 본다)
   ├─ Agent(platform-trap-checker, run_in_background:true, model:"opus")
   │     → _workspace/platform-parity/02_platform_traps.md      (함정 API 사용을 본다)
   └─ 중복 제거 후 병합 → 보고
```

## 이 하네스의 한계 — 먼저 선을 그어라

**실기기 없이는 렌더 결과를 알 수 없다.** 이 하네스는 코드 구조만 본다.
"안드로이드에서 정상 동작함"이라고 결론 내리지 마라. 낼 수 있는 결론은
"코드에서 알려진 위험이 발견되지 않음"까지다.

따라서 보고서의 **"실기기 확인 필요"** 항목이 항상 비어 있지 않아야 정상이다.
비어 있다면 그 자체가 이 하네스가 제 일을 안 했다는 신호다.

## Phase 0: 컨텍스트 확인

| 상태 | 판정 |
|---|---|
| `_workspace/platform-parity/` 없음 | 초기 실행 |
| 있고 "고쳐졌나" 류 | **부분 재실행** — 이전 발견 항목만 재확인 |
| 있고 범위가 달라짐 | 새 실행 — `_workspace/platform-parity_prev/`로 이동 |

## Phase 1: 범위 확정

`src/` 아래 TS/TSX가 346개다. 전수는 무겁다.

- **전수** — 릴리스 전, 또는 안드로이드 광범위 이상 신고 시
- **화면 단위** — 특정 탭·화면만 (증상이 국소적일 때)
- **변경분** — 최근 커밋이 건드린 파일만

증상 신고가 있으면 **증상부터 듣는다.** "소셜 탭이 빈 화면"이면 래퍼 children 통과
문제일 확률이 높고, 범위를 그쪽으로 좁히는 게 전수보다 빠르다.

## Phase 2: 병렬 스캔

두 에이전트를 `run_in_background: true`로 동시에 띄운다.

**branch-scanner 프롬프트:** `.claude/agents/platform-branch-scanner.md`를 읽고 그 역할로.
`scripts/layout-parity.verify.mjs`를 **먼저 읽어** 이미 검증되는 항목을 중복 보고하지
말라고 지시. 범위 전달. 산출물 `_workspace/platform-parity/01_platform_branches.md`.

**trap-checker 프롬프트:** `.claude/agents/platform-trap-checker.md`와
`eorth-android-traps` 스킬을 읽고 그 역할로. 범위 전달.
산출물 `_workspace/platform-parity/02_platform_traps.md`.

## Phase 3: 병합

두 에이전트는 같은 파일을 다른 눈으로 보므로 **같은 지점을 다르게 서술한 발견**이 나온다.
합칠 때:

- 같은 파일:줄이면 하나로 묶되 **두 서술을 모두 남긴다.** 한쪽을 지우면 왜 문제인지가 날아간다
- 한쪽만 발견한 것은 그대로 둔다. 다른 쪽이 못 본 것이지 오탐이 아니다
- `layout-parity.verify.mjs`가 이미 덮는 항목은 "기존 검증됨"으로 표시하고 발견에서 뺀다

## Phase 4: 보고

```
## 범위
전수 / 화면 단위 / 변경분 — 실제로 훑은 파일 수

## 확실한 재발 (알려진 함정)
- 함정 이름 / 위치 / 현재 코드 / 예상 증상 / 회피책

## 회피 코드 소실
- 있어야 할 prop이 사라진 지점

## 비대칭 — 의도로 보이지 않는 것
- 위치 / 무엇이 / 왜 의도로 안 보이는가

## 기존 검증이 덮는 항목
- layout-parity.verify.mjs가 이미 보는 것

## 실기기 확인 필요
- 코드로는 판정 불가한 것들. 비어 있으면 안 된다

## 훑지 못한 범위
- 범위를 좁혔다면 무엇을 못 봤는지
```

## 오탐 재조사 금지

아래는 조사가 끝났다. 다시 올리지 마라:
- AdMob validator "Ad attribution missing" — RN `Text`를 못 읽는 것, 요건 충족됨
- 온보딩 하단 터치 불가 — 탭 좌표 실수
- S21+ 렉 — dev 모드 정상 범위

이 목록에 있는 것을 발견으로 올리면, 사용자가 이미 값을 치르고 닫은 조사를 다시 열게 된다.

## 데이터 전달

**반환값 기반** + **파일 기반**. `_workspace/platform-parity/` 보존 — 다음 점검 때 "이전 발견이 고쳐졌나"의 기준선이 된다.

## 에러 핸들링

| 상황 | 조치 |
|---|---|
| 한 에이전트 실패 | 1회 재호출. 재실패 시 **그 관점은 "미검사"로 명시** (통과 아님) |
| grep 후보가 과다해 전수 불가 | 좁힌 범위를 명시. 표본으로 "깨끗함" 결론 금지 |
| 두 에이전트가 같은 지점을 다르게 판정 | 병기. 보수적으로(문제 있음 쪽으로) 다룬다 |

**코드를 고치지 않는다.** 발견만 보고하고, 수정은 `eorth-feature-build`가 맡는다.

## 테스트 시나리오

**정상:** "소셜 탭이 안드로이드에서 빈 화면" → 범위를 소셜 탭으로 좁힘 → 두 에이전트 병렬 →
trap-checker가 커스텀 래퍼의 `children` 미통과를 발견, branch-scanner가 같은 래퍼의
props 누락을 독립 발견 → 병합해 하나의 확실한 재발로 보고 + 회피책 제시.

**에러:** 전수 요청인데 grep 후보가 400건 넘어 전수 확인 불가 → **"깨끗함"으로 끝내지 않는다.**
"상위 N건만 확인, 나머지 미검사"를 명시하고 못 본 범위를 적는다.
