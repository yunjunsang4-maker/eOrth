# 발견 허브 3단계 — 초대 귀속 딥링크 설계

**목표:** 초대 링크(eorth://user|profile/<handle>)를 탭했지만 아직 로그인/온보딩 전인 사용자의 초대를 보관했다가, 온보딩 완료 후 첫 메인 진입 시 "초대자와 메이트 연결" 넛지로 소비한다.

**현재 갭:** AppNavigator 딥링크 핸들러는 인증+Main 진입 상태에서만 이동하고, 미인증이면 ~5초 재시도 후 **조용히 유실**. 초대받은 신규 유저(TestFlight 설치 → 링크 탭 → 가입)의 귀속이 끊긴다.

**범위 제한(베타):** 커스텀 스킴(eorth://)은 앱 미설치 시 아무것도 열지 못함 — 미설치 유저의 스토어 유도·설치 후 귀속(deferred deep link)은 도메인+universal link 인프라가 필요해 **출시 후 과제**로 명시적 제외. 이 단계는 "앱은 있으나 미로그인/미온보딩" 흐름을 커버한다.

---

## 1. 구성

### `src/utils/pendingInvite.ts` (신규, 의존성 없는 소형 유틸)
- AsyncStorage 키 `eorth-pending-invite`, 값 `{ handle: string, ts: number }`
- `savePendingInvite(handle)` / `consumePendingInvite(): Promise<string | null>`(읽고 즉시 삭제 — 원샷) / 만료 7일(ts 기준, 소비 시 검사)
- ts는 저장 시점 `Date.now()`

### AppNavigator — 미인증 수신 시 보관
- 기존 profile 링크 분기(`tryGo`)에서: **수신 즉시** 미인증(navigationRef 루트에 'Main' 없음)이면 `savePendingInvite(handle)` 후 기존 재시도 로직은 그대로 진행(재시도 중 인증되면 정상 이동 — 이 경우 보관본은 Main 소비 시점에 "이미 메이트면 무시" 가드로 무해)
- 인증 상태 수신이면 저장하지 않음(기존 동작 그대로)

### MainScreen — 온보딩 완료 후 소비 넛지
- Main 첫 마운트 effect에서 `consumePendingInvite()` → handle 있으면:
  1. `getProfileByHandle(handle)` 조회(실패·미가입이면 조용히 폐기)
  2. 본인 handle이면 폐기. 이미 메이트/신청중이면 폐기(useRecords의 isNeighbor·isNeighborRequested)
  3. Alert 넛지: 제목 `friends.inviteNudgeTitle`, 본문 `friends.inviteNudgeMsg`(@handle 포함) — [나중에] / [메이트 신청]
  4. [메이트 신청] → `requestNeighbor(대상 id)` + `FriendProfile`로 이동
- 소비는 원샷(consume이 삭제) — 넛지 거절 후 재등장 없음

### i18n (friends, ko/en 파리티)
| 키 | ko | en |
|----|----|----|
| inviteNudgeTitle | 메이트 초대 | Mate invite |
| inviteNudgeMsg | @{{handle}}님의 초대로 오셨네요!\n메이트 신청을 보낼까요? | You came from @{{handle}}'s invite!\nSend a mate request? |
| inviteNudgeLater | 나중에 | Later |
| inviteNudgeSend | 메이트 신청 | Send request |

## 2. 서버 변경 없음
자동 연결은 기존 `requestNeighbor`(pending → 상대 수락) 경로 재사용. 귀속 분석 테이블은 YAGNI로 제외. **schema.sql 재실행 불필요.**

## 3. 검증
tsc, ko/en 파리티, 수동 QA: ① 로그아웃 상태에서 초대 링크 탭 → 로그인/가입 → Main 진입 시 넛지 → 신청 시 pending 생성+프로필 이동 ② 로그인 상태 링크 탭 → 기존 프로필 직행(넛지 없음) ③ 이미 메이트인 초대자 → 넛지 없음 ④ 7일 경과 보관본 폐기

## 성공 기준
- 미로그인 상태에서 탭한 초대 링크가 유실되지 않고, 온보딩 완료 직후 초대자 연결 넛지로 이어진다
- 기존 딥링크(로그인 상태 프로필/게시물 직행) 회귀 없음
