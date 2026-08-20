---
name: eorth-server-app-parity
description: Supabase 스키마·RPC·Edge Function과 앱 코드가 서로 어긋났는지 독립 추출 후 대조해 찾는 워크플로우. "서버랑 앱 맞나 확인", "스키마 대조해줘", "RPC 인자 맞나", "서버 SQL 반영 안 된 거 있나", "shape 불일치 찾아줘", "SERVER-STATE 확인", "대조 다시" 요청 시 사용할 것. 코드를 고치는 작업은 eorth-feature-build, 빌드 가능 여부 판정은 eorth-release-gate, iOS/Android 차이는 eorth-platform-parity가 담당하므로 그쪽이면 쓰지 마라. 이 스킬은 서버와 앱 사이의 계약만 본다.
---

# 서버↔앱 정합성 하네스

**실행 모드: 서브 에이전트 고정** (`TeamCreate` 없음).
**아키텍처: 팬아웃/팬인.** 두 추출은 독립이며, **독립이어야만 한다.**

```
[오케스트레이터]
   ├─ Agent(server-contract-extractor, run_in_background:true, model:"opus")
   │     → _workspace/server-parity/01_server_contract.md    (supabase/만 읽음)
   ├─ Agent(client-contract-extractor, run_in_background:true, model:"opus")
   │     → _workspace/server-parity/02_client_contract.md    (src/만 읽음)
   └─ eorth-contract-diff 스킬로 대조 → 판정
```

## 왜 두 에이전트를 격리하는가

한 에이전트가 양쪽을 다 읽으면 "서버가 이러니 앱도 이렇겠지"로 눈이 보정되어,
정확히 찾으려던 불일치를 스스로 덮는다. **각자 자기 쪽만 보고 사실만 옮긴 뒤,
대조는 제3자(오케스트레이터)가 한다.** 이 격리가 이 하네스의 전부다.

프롬프트에서 반드시 못 박아라:
- server 쪽에게: "`src/`를 읽지 마라"
- client 쪽에게: "`supabase/`를 읽지 마라"

## Phase 0: 컨텍스트 확인

| 상태 | 판정 |
|---|---|
| `_workspace/server-parity/` 없음 | 초기 실행 |
| 있고 "그 불일치 고쳐졌나" 류 | **부분 재실행** — 변경된 파일만 다시 추출 |
| 있고 범위가 달라짐 | 새 실행 — `_workspace/server-parity_prev/`로 이동 |

## Phase 1: 범위 확정

전수(19개 서비스 × 2,833줄 스키마)는 무겁다. 범위를 먼저 정한다.

- **전수** — 릴리스 전 또는 큰 스키마 변경 후
- **기능 단위** — 특정 화면/서비스가 쓰는 것만 (예: DM, 프로필, 피드)
- **변경분** — 최근 커밋이 건드린 테이블·서비스만

모호하면 사용자에게 묻는다. 범위가 넓으면 추출 품질이 떨어진다.

## Phase 2: 병렬 추출

두 에이전트를 `run_in_background: true`로 동시에 띄운다.

**server 쪽 프롬프트:** `.claude/agents/server-contract-extractor.md`를 읽고 그 역할로
수행. Phase 1의 범위를 전달. **`src/`를 읽지 마라**고 명시.
산출물은 `_workspace/server-parity/01_server_contract.md`.

**client 쪽 프롬프트:** `.claude/agents/client-contract-extractor.md`를 읽고 그 역할로
수행. Phase 1의 범위를 전달. **`supabase/`를 읽지 마라**고 명시.
산출물은 `_workspace/server-parity/02_client_contract.md`.

## Phase 3: 대조

`eorth-contract-diff` 스킬을 읽고 그 절차대로 대조한다. 8개 축(존재·이름·타입·널 허용·
RPC 시그니처·반환 shape·접근 주체·**반영 상태**)을 전부 돈다.

**대조는 에이전트에게 맡기지 말고 오케스트레이터가 직접 한다.** 두 문서가 이미
구조화돼 있어 추가 탐색이 필요 없고, 여기서 또 에이전트를 띄우면 요약 손실만 생긴다.

## Phase 4: 판정과 보고

`eorth-contract-diff`의 심각도 분류(차단/위험/흔적)로 나눈다.

**누가 앞서갔는지 반드시 판정하라.** 앱이 앞선 것(서버 SQL 미실행)과 서버가 앞선 것
(앱 미수정)은 조치가 정반대다. `SERVER-STATE.md`와 git 이력이 근거다.

```
## 판정 요약
범위: {전수|기능 단위|변경분}
차단 N / 위험 N / 흔적 N

## 차단
- 무엇이 / 서버 근거(파일:줄) / 앱 근거(파일:줄) / 언제 터지는가 /
  누가 앞서갔는가 / 조치

## 위험
## 흔적
## 대조 불가
- 한쪽이 "판독 불가"로 남긴 항목. 통과로 세지 마라

## 제안 조치 순서
1. 서버 실행이 필요한 것 (SQL / functions deploy)
2. 앱 수정이 필요한 것
3. SERVER-STATE.md 갱신
```

## 이 하네스가 실행하지 않는 것

**서버 SQL을 돌리지 않는다. Edge Function을 배포하지 않는다. 앱 코드를 고치지 않는다.**
전부 사용자 승인이 필요하다. 특히 `migration-*.sql` 중 **1회성**은 재실행하면 데이터가
중복 변환된다 — "미반영"으로 보이더라도 함부로 돌리라고 권하지 마라.

## 데이터 전달

**반환값 기반** + **파일 기반**. `_workspace/server-parity/`의 두 추출 파일은 보존한다 —
다음 대조 때 변경분만 다시 뽑으면 되므로 비용이 크게 준다.

## 에러 핸들링

| 상황 | 조치 |
|---|---|
| 한 추출 에이전트 실패 | 1회 재호출. 재실패 시 **대조 불가**로 보고 (한쪽만으로 판정 금지) |
| 추출물에 "판독 불가" 항목 | 해당 항목은 통과로 세지 말고 별도 명시 |
| 두 문서가 상충하는 사실 주장 | 삭제하지 말고 출처와 함께 병기 |
| 앱이 쓰는데 서버에 없음 | `public_profiles` 이중 정의 함정을 먼저 의심 (SQL 재실행이 조용히 실패했을 수 있음) |

## 테스트 시나리오

**정상:** "DM 쪽 서버랑 앱 맞나 봐줘" → 범위=DM 기능 → 두 에이전트 병렬 추출 →
8축 대조 → 차단 1건(`dm_messages.read_at`이 nullable인데 앱이 `?.` 없이 접근) 발견 →
근거 줄번호와 함께 "앱 수정 필요"로 보고.

**에러:** server 추출물의 "판독 불가"에 RPC 2개가 들어 있다 → 그 2개는 **통과로 세지 않고**
"대조 불가 — 서버 쪽 판독 실패"로 별도 표기. 전체 판정에도 이 미확인분을 반영한다.
