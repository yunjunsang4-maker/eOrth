---
name: eorth-feature-build
description: eOrth에 새 기능·화면·컴포넌트를 구현하고 곧바로 점진 QA로 검증하는 워크플로우. "기능 추가", "화면 만들어줘", "이 버그 고쳐줘", "리팩터링", "구현하고 검증까지", "아까 만든 것 수정", "그 기능 다시", "이어서 보완" 요청 시 사용할 것. 코드를 실제로 고치는 작업 전반이 대상이다. 단, 빌드·OTA·제출은 eorth-release-gate, 서버 스키마와 앱의 shape 대조는 eorth-server-app-parity, iOS/Android 차이 전수 점검은 eorth-platform-parity가 담당하므로 그쪽 요청이면 이 스킬을 쓰지 마라.
---

# 기능 구현 하네스

**실행 모드: 서브 에이전트 고정.** 이 환경에는 `TeamCreate`가 없다. 팀 모드로 설계하면
실행 시점에 깨지므로, `Agent` 도구를 직접 호출하고 결과는 반환값과 `_workspace/` 파일로 받는다.

**아키텍처: 파이프라인.** 구현 → 검증이 순차 의존이라 병렬 이득이 없다.

```
[오케스트레이터]
   └─ Agent(feature-implementer, model:"opus")
        → _workspace/feature/01_implementer_changes.md
   └─ Agent(feature-qa, model:"opus")
        → _workspace/feature/02_qa_findings.md
   └─ 결과 종합 → 사용자 보고
```

## Phase 0: 컨텍스트 확인

작업을 시작하기 전에 실행 모드를 판별한다.

| 상태 | 판정 |
|---|---|
| `_workspace/feature/` 없음 | **초기 실행** — Phase 1부터 |
| `_workspace/feature/` 있고 사용자가 부분 수정 요청 | **부분 재실행** — 해당 에이전트만 다시 호출 |
| `_workspace/feature/` 있고 사용자가 새 기능 요청 | **새 실행** — 기존을 `_workspace/feature_prev/`로 옮기고 시작 |

## Phase 1: 범위 확정

1. 무엇을 만들/고칠 것인지 한 문장으로 확정한다. 모호하면 **여기서 사용자에게 묻는다.**
   구현이 끝난 뒤 방향이 틀린 것을 알면 되돌리는 비용이 크다.
2. 손댈 파일을 목록으로 확정한다. `CLAUDE.md`의 "지시한 파일만 수정" 규칙 때문에
   이 목록이 곧 implementer의 권한 범위다.
3. 기존 코드를 먼저 읽는다.

## Phase 2: 구현

`Agent(subagent_type: "general-purpose", model: "opus")`로 `feature-implementer`를 호출한다.
프롬프트에 반드시 포함할 것:

- `.claude/agents/feature-implementer.md`를 읽고 그 역할로 수행하라
- `eorth-verify-authoring` 스킬을 읽어라
- 손댈 파일 목록(Phase 1에서 확정한 것)과 **그 밖의 파일은 건드리지 말 것**
- 산출물을 `_workspace/feature/01_implementer_changes.md`에 쓸 것

## Phase 3: 점진 QA

구현이 끝나면 `feature-qa`를 호출한다. **모듈 단위로 끊어서 부른다.** 전부 만든 뒤
한 번 부르면, 문제가 나왔을 때 그 위에 쌓인 코드까지 되돌려야 한다.

프롬프트에 포함할 것:
- `.claude/agents/feature-qa.md`를 읽고 그 역할로 수행하라
- `_workspace/feature/01_implementer_changes.md`를 입력으로 삼아라
- 경계면 교차 비교를 하라 — 존재 확인은 결과가 아니다
- `npx tsc --noEmit`과 `npm test`를 **실제로 돌리고 출력을 읽어라**

## Phase 4: 종합

두 산출물을 읽고 사용자에게 보고한다.

- QA 판정이 **실패**면 Phase 2로 돌아가되, implementer에게 **QA 발견을 그대로 전달**한다.
  요약해서 넘기면 맥락이 날아가 같은 실수가 반복된다.
- 최대 2회 왕복한다. 3회째에도 안 되면 **고쳤다고 하지 말고** 사용자에게 막힌 지점을
  그대로 올린다.

## 데이터 전달

**반환값 기반**(에이전트 결과 수집) + **파일 기반**(`_workspace/feature/`에 산출물 보존).
중간 파일은 지우지 않는다 — 나중에 "왜 이렇게 판단했나"를 되짚을 근거다.

파일명: `{순번}_{에이전트}_{산출물}.md`

## 에러 핸들링

| 상황 | 조치 |
|---|---|
| 에이전트가 결과 없이 종료 | 1회 재호출. 재실패 시 해당 결과 없이 진행하되 **보고서에 누락 명시** |
| `tsc`/`npm test` 실패 | implementer로 되돌림. 2회 왕복 후에도 실패면 사용자에게 |
| 두 에이전트의 판단이 상충 | 삭제하지 말고 **양쪽 다 출처와 함께 병기** |
| 범위 밖 수정이 필요해 보임 | 하지 말고 보고에 올림 |

**절대 하지 않는 것:** 커밋, 빌드, OTA, 서버 SQL 실행, 의존성 설치.
전부 사용자 승인이 필요한 행위다.

## 완료 조건

- `tsc` 오류 0
- `npm test`가 기준선(`event-config.verify.mjs` 1건 실패)보다 나빠지지 않음
- QA 보고서의 "확인 못 한 것"이 비어 있지 않고 실제 내용이 적혀 있음
  (비어 있으면 검증됐다고 오독된다)

## 테스트 시나리오

**정상:** "여행 카드에 날씨 칩 추가해줘" → 범위 확정(`TripCard.tsx`, `weatherKey.ts`) →
implementer가 구현 + `weatherKey.verify.ts` 케이스 추가 → QA가 스토어↔화면 경계면 대조,
`npm test` 실행 → 통과 → 보고.

**에러:** QA가 "스토어는 `weather`를 옵셔널로 내보내는데 화면이 `?.` 없이 접근"을 발견 →
implementer에게 발견 원문 전달 → 수정 → 재검증 → 통과. 3회째에도 실패하면 사용자에게 올림.
