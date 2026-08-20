---
name: eorth-release-gate
description: eOrth를 빌드·OTA·스토어 제출하기 전에 설정과 코드·서버·문서 상태를 병렬로 감사해 차단 사유를 모으는 워크플로우. "빌드해도 돼?", "OTA 쏴도 되나", "정식 올리기 전에 점검", "제출 전 확인", "릴리스 체크", "다시 점검해줘", "차단 사유 해소됐나" 요청 시 사용할 것. 코드를 고치는 작업이면 eorth-feature-build를, 서버-앱 shape 대조만 필요하면 eorth-server-app-parity를 쓰고 이 스킬은 쓰지 마라. 이 스킬은 빌드를 실행하지 않고 나가도 되는지만 판정한다.
---

# 릴리스 게이트 하네스

**실행 모드: 서브 에이전트 고정** (`TeamCreate` 없음).
**아키텍처: 팬아웃/팬인.** 설정 검사와 코드·서버·문서 감사는 서로 의존하지 않아 병렬이 맞다.

```
[오케스트레이터]
   ├─ Agent(release-config-checker, run_in_background:true, model:"opus")
   │     → _workspace/release/01_config_check.md
   ├─ Agent(release-auditor, run_in_background:true, model:"opus")
   │     → _workspace/release/02_release_audit.md
   └─ 두 결과 수집 → 차단/경고 병합 → 판정
```

## 이 하네스가 실행하지 않는 것

**빌드·제출·OTA·`pages:publish`·서버 SQL을 실행하지 않는다.** 판정만 한다.
쏘는 것은 사용자의 결정이고, 되돌릴 수 없는 행위이기 때문이다.

대화식 자격증명이 필요한 명령은 사용자가 직접 쳐야 한다. 명령문을 제시하되 실행하지 마라.

## Phase 0: 컨텍스트 확인

| 상태 | 판정 |
|---|---|
| `_workspace/release/` 없음 | 초기 실행 |
| 있고 "차단 사유 해소됐나" 류 요청 | **부분 재실행** — 이전 차단 항목만 다시 확인 |
| 있고 다른 대상(beta→production 등) | 새 실행 — `_workspace/release_prev/`로 이동 |

## Phase 1: 대상 확정

**무엇을 어디로 보내는지 먼저 확정한다.** 이게 정해지지 않으면 검사 기준이 없다.

- 대상: `development` / `beta` / `production`
- 행위: 빌드 / OTA / 스토어 제출

모호하면 **여기서 사용자에게 묻는다.** 정식과 베타는 검사 항목이 다르다.
`eorth-build-routing` 스킬을 읽어 프로필·채널 대응을 확인한다
(특히 `preview` 프로필의 채널이 `beta`라는 점).

## Phase 2: 병렬 감사

두 에이전트를 `run_in_background: true`로 동시에 띄운다.

**config-checker 프롬프트:** `.claude/agents/release-config-checker.md`를 읽고 그 역할로
수행. 대상과 행위를 전달. `eorth-build-routing` 스킬을 읽으라고 지시.
산출물은 `_workspace/release/01_config_check.md`.

**auditor 프롬프트:** `.claude/agents/release-auditor.md`를 읽고 그 역할로 수행.
대상과 행위를 전달. 산출물은 `_workspace/release/02_release_audit.md`.

두 에이전트는 **서로의 결과를 보지 않는다.** 합치는 것은 오케스트레이터의 일이다.

## Phase 3: 병합과 판정

두 파일을 읽고 차단 사유를 하나의 목록으로 합친다.

**판정 규칙:**

| 판정 | 조건 |
|---|---|
| **금지** | 차단 사유가 1건이라도 있음 |
| **조건부** | 차단은 없으나 실기기 확인 필요 항목이 있음 |
| **가능** | 차단 없음 + 검사 항목 전부 실행됨 |

**"검사 불가"를 통과로 바꾸지 마라.** 어느 한쪽이 항목을 못 돌렸다면 판정은
최소한 **조건부**다. 못 본 것을 봤다고 하는 순간 이 게이트는 존재 의미가 없다.

## Phase 4: 보고

```
## 판정
가능 / 조건부 / 금지 — 대상: {variant} / 행위: {빌드|OTA|제출}

## 차단 사유
- 각 항목: 무엇이 / 왜 지금 나가면 안 되는가 / 어떻게 풀 것인가

## 실기기에서 확인해야 할 것
- 이번 빌드에 미검증 상태로 들어가는 기능들

## 검사하지 못한 항목
- 반드시 남길 것

## 사용자가 직접 실행할 명령
- 순서대로. 대화식 자격증명이 필요한 것들
```

## 데이터 전달

**반환값 기반** + **파일 기반**(`_workspace/release/`). 중간 파일 보존 — 릴리스 판단의 감사 추적이다.

## 에러 핸들링

| 상황 | 조치 |
|---|---|
| 한 에이전트가 실패 | 1회 재호출. 재실패 시 **그 영역은 "미검사"로 판정에 반영** (통과 아님) |
| 두 결과가 상충 | 삭제하지 말고 양쪽 병기 후 보수적으로 판정(더 엄한 쪽) |
| `assert-variant-config`가 환경 문제로 실패 | "검사 불가"로 처리, 판정은 조건부 이하 |
| `.env` 불일치 검출 | 행사 관련이면 차단, 아니면 경고 |

## 테스트 시나리오

**정상:** "안드로이드 베타 올려도 돼?" → 대상 `beta`/빌드 확정 → 두 에이전트 병렬 →
config는 변형 단언 통과, auditor는 게이트 통과·서버 반영 완료·게시 대기 없음 →
**가능** 판정 + `eas build --profile preview --platform android` 제시.

**에러:** "정식 OTA 쏴도 돼?" → auditor가 `SERVER-STATE.md`에서 미실행 SQL 1건 발견 →
**금지** 판정. "OTA가 먼저 나가면 신규 기능이 런타임에 깨짐. 서버 SQL 실행 후 재점검" 보고.
명령문은 제시하되 실행하지 않는다.
