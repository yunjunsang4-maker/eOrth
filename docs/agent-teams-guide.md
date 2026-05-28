# Claude Code 에이전트 팀 가이드

> 공유 작업, 에이전트 간 메시징, 중앙 집중식 관리를 통해 함께 작동하는 여러 Claude Code 인스턴스를 조율하는 방법

---

## 목차

1. [에이전트 팀이란?](#에이전트-팀이란)
2. [활성화 방법](#활성화-방법)
3. [언제 사용하는가](#언제-사용하는가)
4. [Subagent와의 비교](#subagent와의-비교)
5. [첫 번째 팀 시작하기](#첫-번째-팀-시작하기)
6. [팀 제어하기](#팀-제어하기)
7. [아키텍처](#아키텍처)
8. [모범 사례](#모범-사례)
9. [사용 사례 예시](#사용-사례-예시)
10. [문제 해결](#문제-해결)
11. [제한 사항](#제한-사항)

---

## 에이전트 팀이란?

에이전트 팀은 여러 Claude Code 인스턴스가 **함께 협업**하는 기능이다.

- 한 세션이 **팀 리더** 역할을 하여 작업을 조율하고, 작업을 할당하며, 결과를 종합한다.
- **팀원들**은 독립적으로 작동하며, 각각 자신의 컨텍스트 윈도우에서 작동하고, 서로 직접 통신한다.
- Subagent와 달리, 리더를 거치지 않고 개별 팀원과 직접 상호작용할 수도 있다.

> **요구 버전**: Claude Code v2.1.32 이상 (`claude --version`으로 확인)

---

## 활성화 방법

에이전트 팀은 기본적으로 **비활성화**되어 있다. 아래 방법 중 하나로 활성화한다.

### 방법 1: settings.json에 추가

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 방법 2: 셸 환경 변수

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

---

## 언제 사용하는가

에이전트 팀은 **병렬 탐색이 실질적인 가치를 더하는 작업**에 가장 효과적이다.

### 적합한 경우

| 사용 사례 | 설명 |
|-----------|------|
| **연구 및 검토** | 여러 팀원이 문제의 다양한 측면을 동시에 조사 후 발견을 공유 |
| **새로운 모듈/기능** | 팀원들이 각각 별도의 부분을 소유하면서 서로 간섭하지 않음 |
| **경쟁 가설 디버깅** | 팀원들이 다양한 이론을 병렬로 테스트하고 빠르게 답에 수렴 |
| **교차 계층 조율** | 프론트엔드, 백엔드, 테스트에 걸친 변경을 각 팀원이 소유 |

### 부적합한 경우

- 순차적 작업 (A가 끝나야 B를 시작할 수 있는 경우)
- 동일 파일을 여러 팀원이 편집해야 하는 경우
- 많은 종속성이 있는 작업
- 일상적이고 간단한 작업 (토큰 비용 대비 효과 낮음)

---

## Subagent와의 비교

|           | Subagents | 에이전트 팀 |
|-----------|-----------|------------|
| **컨텍스트** | 자신의 컨텍스트 윈도우; 결과는 호출자에게 반환 | 자신의 컨텍스트 윈도우; 완전히 독립적 |
| **통신** | 메인 에이전트에게만 결과 보고 | 팀원들이 서로 직접 메시지 전송 |
| **조율** | 메인 에이전트가 모든 작업 관리 | 자체 조율을 통한 공유 작업 목록 |
| **최적 용도** | 결과만 중요한 집중된 작업 | 논의와 협업이 필요한 복잡한 작업 |
| **토큰 비용** | 낮음 (결과가 메인 컨텍스트로 요약) | 높음 (각 팀원이 별도 Claude 인스턴스) |

**선택 기준**: 워커들이 서로 통신해야 하면 → 에이전트 팀, 결과만 보고하면 → Subagent

---

## 첫 번째 팀 시작하기

Claude에게 자연어로 에이전트 팀을 만들도록 요청한다.

### 예시 프롬프트

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

Claude가 수행하는 작업:
1. 공유 작업 목록을 가진 팀을 생성
2. 각 관점에 대한 팀원 생성
3. 문제를 탐색하고 발견을 종합
4. 완료 시 팀 정리

### 팀원 탐색 (In-process 모드)

- `Shift+Down`: 팀원들을 순환
- 마지막 팀원 이후 `Shift+Down`: 리더로 복귀

---

## 팀 제어하기

### 표시 모드

| 모드 | 설명 | 요구 사항 |
|------|------|-----------|
| **In-process** | 모든 팀원이 메인 터미널 내에서 실행 | 없음 (모든 터미널) |
| **분할 창** | 각 팀원이 자신의 창을 가짐 | tmux 또는 iTerm2 |

설정 방법:

```json
// ~/.claude/settings.json
{
  "teammateMode": "in-process"  // 또는 "tmux", "auto"(기본값)
}
```

단일 세션 강제:

```bash
claude --teammate-mode in-process
```

### In-process 모드 조작

| 키 | 동작 |
|----|------|
| `Shift+Down` | 팀원 순환 |
| `Enter` | 팀원 세션 보기 |
| `Escape` | 현재 턴 중단 |
| `Ctrl+T` | 작업 목록 전환 |

### 팀원 및 모델 지정

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

- 팀원들은 기본적으로 리더의 `/model` 선택을 상속하지 않음
- `/config`에서 **기본 팀원 모델** 설정 가능

### 계획 승인 요구

복잡하거나 위험한 작업에 대해 팀원이 구현 전 계획을 제출하도록 요구:

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

흐름:
1. 팀원이 읽기 전용 계획 모드에서 작동
2. 계획 완료 후 리더에게 승인 요청
3. 리더가 승인 → 구현 시작 / 거부 → 피드백에 따라 수정 후 재제출

### 작업 할당 및 요청

공유 작업 목록 상태: **대기 중** → **진행 중** → **완료됨**

할당 방식:
- **리더 할당**: 리더에게 어느 작업을 어느 팀원에게 줄지 지시
- **자체 요청**: 팀원이 작업 완료 후 다음 미할당, 미차단 작업을 자체 선택

### 팀원 종료

```text
Ask the researcher teammate to shut down
```

### 팀 정리

```text
Clean up the team
```

> **중요**: 항상 리더를 통해 정리할 것. 팀원이 정리를 실행하면 리소스가 일관성 없는 상태로 남을 수 있다.

### Hooks로 품질 게이트 적용

| Hook | 트리거 시점 | 종료 코드 2 효과 |
|------|-------------|-----------------|
| `TeammateIdle` | 팀원이 유휴 상태 진입 시 | 피드백 전송, 팀원 계속 작동 |
| `TaskCreated` | 작업 생성 시 | 생성 방지, 피드백 전송 |
| `TaskCompleted` | 작업 완료 표시 시 | 완료 방지, 피드백 전송 |

---

## 아키텍처

### 구성 요소

| 구성 요소 | 역할 |
|-----------|------|
| **팀 리더** | 팀을 만들고, 팀원을 생성하며, 작업을 조율하는 메인 세션 |
| **팀원들** | 할당된 작업에서 각각 작동하는 별도의 Claude Code 인스턴스 |
| **작업 목록** | 팀원들이 요청하고 완료하는 공유 작업 항목 목록 |
| **메일박스** | 에이전트 간 통신을 위한 메시징 시스템 |

### 저장 위치

- **팀 구성**: `~/.claude/teams/{team-name}/config.json`
- **작업 목록**: `~/.claude/tasks/{team-name}/`

> 팀 구성은 런타임 상태를 포함하므로 수동 편집하지 말 것.

### 통신 방법

| 방법 | 설명 |
|------|------|
| **자동 메시지 전달** | 팀원이 메시지를 보내면 자동으로 수신자에게 전달 |
| **유휴 알림** | 팀원이 완료/중지 시 자동으로 리더에게 알림 |
| **공유 작업 목록** | 모든 에이전트가 작업 상태를 보고 요청 가능 |
| **팀원 메시징** | 이름으로 특정 팀원에게 메시지 전송 |

### Subagent 정의를 팀원으로 사용

기존 subagent 정의를 팀원으로 재사용할 수 있다:

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

- 정의의 `tools` 허용 목록과 `model`을 준수
- 정의 본문은 시스템 프롬프트에 추가 지시로 추가 (대체하지 않음)
- `SendMessage`와 작업 관리 도구는 항상 사용 가능
- `skills`과 `mcpServers` frontmatter 필드는 팀원 실행 시 적용되지 않음

### 권한

- 팀원들은 리더의 권한 설정으로 시작
- 리더가 `--dangerously-skip-permissions`이면 모든 팀원도 동일
- 생성 후 개별 팀원 모드 변경 가능

---

## 모범 사례

### 1. 팀원에게 충분한 컨텍스트 제공

팀원들은 리더의 대화 기록을 상속하지 않는다. 생성 프롬프트에 작업별 세부 사항을 포함:

```text
Spawn a security reviewer teammate with the prompt: "Review the authentication module
at src/auth/ for security vulnerabilities. Focus on token handling, session
management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

### 2. 적절한 팀 크기 선택

- **권장**: 대부분의 워크플로우에 **3-5명**으로 시작
- **기준**: 팀원당 5-6개 작업 유지
- 예: 15개 독립 작업 → 3명의 팀원이 적절
- 세 명의 집중된 팀원이 다섯 명의 산만한 팀원보다 나음

### 3. 작업을 적절히 크기 조정

| 크기 | 문제 |
|------|------|
| 너무 작음 | 조율 오버헤드가 이점을 초과 |
| 너무 큼 | 체크인 없이 너무 오래 작동, 낭비 위험 증가 |
| **적절함** | 함수, 테스트 파일, 검토와 같은 명확한 결과물을 생성하는 자체 포함된 단위 |

### 4. 팀원들이 완료될 때까지 기다리기

리더가 직접 구현을 시작하면:

```text
Wait for your teammates to complete their tasks before proceeding
```

### 5. 연구 및 검토로 시작하기

처음 사용 시 코드 작성 없는 작업부터 시작:
- PR 검토
- 라이브러리 연구
- 버그 조사

### 6. 파일 충돌 피하기

**두 팀원이 동일 파일을 편집하면 덮어쓰기가 발생한다.** 각 팀원이 다른 파일 집합을 소유하도록 작업을 나눌 것.

### 7. 모니터링 및 조율

- 팀원 진행 상황을 주기적으로 확인
- 작동하지 않는 접근 방식을 재지정
- 발견이 들어올 때 종합
- 팀을 무인으로 너무 오래 실행하지 말 것

---

## 사용 사례 예시

### 예시 1: 병렬 코드 검토

```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

각 검토자가 동일 PR에 다른 필터를 적용하고, 리더가 발견을 종합한다.

### 예시 2: 경쟁 가설로 디버깅

```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

핵심: 적극적으로 서로의 이론을 반박하려는 구조가 앵커링 편향을 방지한다.

### 예시 3: 교차 계층 기능 개발

```text
Create an agent team for the new notification feature:
- Frontend teammate: React components in src/components/notifications/
- Backend teammate: API endpoints in src/api/notifications/
- Test teammate: Integration tests in tests/notifications/
Each owns their directory. Coordinate on the API contract first.
```

---

## 문제 해결

### 팀원이 나타나지 않음

1. In-process 모드에서 `Shift+Down`으로 활성 팀원 확인
2. 작업이 팀을 보증할 만큼 복잡한지 확인
3. 분할 창 모드 시 tmux 설치 확인: `which tmux`
4. iTerm2의 경우 `it2` CLI 설치 및 Python API 활성화 확인

### 너무 많은 권한 프롬프트

팀원 생성 전 권한 설정에서 일반적인 작업을 사전 승인한다.

### 팀원들이 오류에서 중지됨

- `Shift+Down` 또는 창 클릭으로 출력 확인
- 직접 추가 지시 제공
- 대체 팀원 생성

### 리더가 작업 완료 전에 종료됨

```text
Continue - wait for all teammates to finish their tasks.
```

### 고아 tmux 세션

```bash
tmux ls
tmux kill-session -t <session-name>
```

---

## 제한 사항

| 제한 | 설명 |
|------|------|
| 세션 재개 불가 | `/resume`, `/rewind`는 in-process 팀원을 복원하지 않음 |
| 작업 상태 지연 | 팀원이 작업을 완료로 표시하지 못해 종속 작업 차단 가능 |
| 종료 지연 | 팀원은 현재 요청/도구 호출 완료 후 종료 |
| 세션당 한 팀 | 새 팀 시작 전 현재 팀 정리 필요 |
| 중첩 팀 불가 | 팀원은 자신의 팀이나 팀원을 생성할 수 없음 |
| 리더 고정 | 팀을 만든 세션이 수명 동안 리더; 이전 불가 |
| 권한 상속 | 모든 팀원은 리더의 권한 모드로 시작 |
| 분할 창 제한 | VS Code 터미널, Windows Terminal, Ghostty에서 미지원 |

> **참고**: `CLAUDE.md`는 정상 작동한다. 팀원들은 작업 디렉토리에서 `CLAUDE.md`를 읽으므로 프로젝트별 지침 제공에 활용 가능.

---

## 빠른 참조 카드

```text
# 팀 생성
"Create an agent team with 3 teammates to [작업 설명]"

# 모델 지정
"Use Sonnet for each teammate"

# 계획 승인 요구
"Require plan approval before they make any changes"

# 팀원 종료
"Ask the [이름] teammate to shut down"

# 팀 정리
"Clean up the team"

# 팀원 대기
"Wait for your teammates to complete their tasks before proceeding"
```

---

## 참고 링크

- [공식 문서 (한글)](https://code.claude.com/docs/ko/agent-teams)
- [Subagents 문서](https://code.claude.com/docs/ko/sub-agents)
- [Git Worktrees](https://code.claude.com/docs/ko/worktrees)
- [Hooks 설정](https://code.claude.com/docs/ko/hooks)
- [권한 설정](https://code.claude.com/docs/ko/permissions)
