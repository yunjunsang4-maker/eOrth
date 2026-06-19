# 카드 꾹 눌러 DM 빠른 공유 (드래그) — 설계 문서

- 작성일: 2026-06-05
- 대상: eOrth (React Native + Expo)
- 상태: 설계 승인됨 → 구현 계획 작성 예정

## 1. 배경 / 목표

소셜탭의 기록 카드를 **꾹 누르면** 카드 옆에 DM을 많이 주고받은 친구 3명 + "기타" 원형 타깃이
뜨고, 카드 미리보기(고스트)를 **드래그해 친구 원에 놓으면** 그 사람에게 게시물이 DM으로 전송되고
**"○○님에게 전송됨" 토스트**가 뜬다. "기타"에 놓으면 다른 유저를 찾아 전송한다. 전송은 소셜탭을
벗어나지 않고(조용히 전송), 실제로 그 사람 DM 방에 남는다.

### 현재 코드 상태 (확인됨)
- DM 화면(`DMScreen.tsx`)은 대화가 **더미 데이터**(`DUMMY_CHATS`, handle별 메시지 배열)이고
  메시지를 **로컬 useState**로 관리한다. **공용 DM 스토어는 없다.**
- DMScreen은 이미 `route.params.sharePostId`를 받아 해당 기록을 `record` 타입 메시지로 대화에 추가한다
  (= 게시물을 DM으로 공유하는 메시지 형식이 이미 존재).
- 기존 "친구에게 보내기" 경로: `ShareBottomSheet` → 친구 선택 → `navigation.navigate('DM', { friend, sharePostId })`.
- 소셜탭 카드 렌더는 `DiaryCard`(블로그·스트립(cut)·피드·앨범), 탭/더블탭은 `DiaryTappable`의
  `Pressable`(탭=상세, 더블탭=좋아요)로 처리. **롱프레스·드래그는 아직 없다.**
- 제스처는 앱 전반이 `PanResponder` + `Animated`를 사용(ProfileScreen의 DragHandle/PhotoViewer 등).

## 2. 핵심 결정 사항 (확정)

1. **드롭 결과 = 조용히 전송 + 토스트** (DM 채팅을 열지 않음, 소셜탭 유지).
2. **실제 지속됨** — 신규 **DM 스토어(Context)** 에 전송 기록을 저장하고, `DMScreen`이 그 스토어를
   읽도록 전환한다. 그래야 드래그로 보낸 게시물이 나중에 DM 방을 열었을 때 실제로 보인다.
3. **드래그 방식 = 플로팅 고스트** — 꾹 누르면 카드의 가벼운 미리보기(고스트)가 손가락을 따라
   떠오르고, 원래 카드는 자리에 그대로. 마소너리 스크롤/레이아웃과 충돌 없음.
4. **타깃 = 친구 3 + 기타**, 카드 옆 **자동 좌/우**(왼쪽 열 카드 → 오른쪽, 오른쪽 열 카드 → 왼쪽)에
   세로 4개.
5. **"가장 많이 주고받은 3명" = DM 스토어의 대화 메시지 수 기준 상위 3명**(더미에서 시드).
6. **기타 → 친구 검색/선택 → 전송 + 토스트**.

## 3. 범위 / 단계

하나의 결합된 기능이며, 다음 두 단계로 구현한다.

| 단계 | 내용 |
|---|---|
| **Phase 1** | `DMStore` 신설(더미 시드, `sendRecord`, `topFriends`) + `DMScreen`을 스토어 연결(기존 동작 보존) + `App` Provider 트리에 `DMProvider` 추가 |
| **Phase 2** | `QuickShareOverlay`(고스트 드래그 + 원형 타깃 + 히트테스트) + `SocialScreen` 롱프레스 연결 + 토스트 + 기타 피커 |

## 4. 데이터 모델 (`src/store/dmStore.tsx`)

`Message`/`SharedRecord` 타입은 현재 `DMScreen.tsx`에 있는 것을 스토어로 이전해 공용화한다.

```ts
export type MsgType = 'text' | 'image' | 'record';
export interface SharedRecord {
  id: string; country: string; content: string;
  viewType: 'feed' | 'blog' | 'album' | 'snap';
  date: string; mediaUri?: string;
  albumUris?: string[]; snapFrontUri?: string; snapBackUri?: string; snapCaption?: string;
  blogTitle?: string; blogPreview?: string;
}
export interface Message {
  id: string; type: MsgType; text: string; isMine: boolean; time: string;
  imageUri?: string; record?: SharedRecord;
}
export interface Friend { name: string; handle: string; emoji: string; online?: boolean }

interface DMContextType {
  conversations: Record<string /* handle */, Message[]>;   // DUMMY_CHATS 시드
  friends: Friend[];                                        // top-3 + 피커용
  sendRecord: (handle: string, record: import('./recordStore').TravelRecord) => void;
  topFriends: (n: number) => Friend[];                      // 메시지 수 desc 상위 n
}
```

- `sendRecord(handle, record)`: `record`를 `SharedRecord`로 변환해 `conversations[handle]`에
  `{ type:'record', isMine:true, ... }` 메시지로 append (DMScreen의 기존 변환 로직 재사용).
- `topFriends(n)`: `friends`를 `conversations[handle].length` 기준 내림차순 정렬 후 상위 n명.
- 시드: 기존 `DUMMY_CHATS` + 친구 메타(이름/handle/emoji)를 스토어 초기값으로 이전.

## 5. DMScreen 전환 (Phase 1)

- `const [messages, setMessages] = useState(DUMMY_CHATS[handle] || [])` →
  `const { conversations, sendRecord } = useDM();` 로 전환, `messages = conversations[friend.handle] ?? []`.
- 입력 전송/`sharePostId` 첨부도 스토어 액션으로 위임(로컬 상태 제거 또는 스토어 위임).
- 기존 화면 동작(버블 렌더, 입력, 헤더)·외부에서의 `navigate('DM', { sharePostId })` 진입은 그대로 동작.

## 6. QuickShareOverlay (Phase 2) — `src/components/QuickShareOverlay.tsx`

- 입력: `{ visible, postId, cardRect: {x,y,w,h}, side: 'left'|'right', record, onClose, onSent(name) }`.
- 구성(풀스크린 `Modal` 또는 absolute 오버레이):
  1. 어두운 배경(탭/취소 시 닫힘)
  2. **고스트**: 카드 미리보기(이모지/제목/대표 사진 등 가벼운 표현), 초기 위치 = `cardRect`,
     `PanResponder`로 손가락 따라 이동(`Animated` translate)
  3. **타깃 4개**: `topFriends(3)` 원형 아바타 + 기타(⊙), `side`에 따라 카드 옆 세로 배치
  4. 드롭(손 뗌): 손가락 좌표 ↔ 각 타깃 원 사각형 히트테스트
     - 친구 → `dmStore.sendRecord(handle, record)` → `onSent(name)`(토스트) → 닫기
     - 기타 → 친구 검색/선택(기존 친구 리스트/검색 재사용) → 선택 시 `sendRecord` → 토스트 → 닫기
     - 빈 곳/취소 → 닫기만
- 제스처: `PanResponder` + `Animated`(앱 기존 패턴과 일치, 새 라이브러리 도입 없음).

## 7. SocialScreen 연결 (Phase 2)

- `DiaryTappable`/`DiaryCard`에 **롱프레스** 추가(`Pressable`의 `onLongPress`, delay≈250ms).
  탭=상세, 더블탭=좋아요 동작은 보존.
- 롱프레스 시: 카드 `measureInWindow`로 `cardRect` 취득, 카드가 속한 열로 `side` 결정 →
  `QuickShareOverlay`를 `{ postId: item.id, cardRect, side, record }`로 오픈.
- 토스트: 소셜탭의 기존 토스트 패턴 재사용("○○님에게 전송됨").
- 오버레이는 카드마다가 아니라 **화면 레벨 1개**(SocialScreen 상단에서 상태로 제어)로 둬서 중복 렌더 방지.

## 8. 손대는 파일

- **신규:** `src/store/dmStore.tsx`, `src/components/QuickShareOverlay.tsx`
- **수정:** `src/screens/DMScreen.tsx`(스토어 연결), `src/screens/SocialScreen.tsx`(롱프레스+오버레이),
  `App.tsx`(또는 Provider 트리)에 `DMProvider` 추가
- 비고: `DMScreen.tsx`·`SocialScreen.tsx`는 사용자가 작업 중인(WIP) 파일이므로 그 위에 수정하며,
  요청 없이는 커밋하지 않는다.

## 9. 검증

- `npx tsc --noEmit` 통과.
- 기존 DM/소셜 화면 회귀 없음(버블·입력·진입, 탭/더블탭).
- 드래그로 친구에게 전송 → 토스트 표시 → 해당 DM 방을 열면 게시물 메시지가 실제로 남아있음.
- 기타 → 검색/선택 → 동일 전송.
- 마소너리 스크롤·더블탭과 충돌 없음, 빈 곳 드롭 시 취소.

## 10. 범위 밖 (이번 작업 아님)

- 실서버 DM 동기화/푸시.
- 소셜탭 외 화면(상세·프로필 등)에서의 드래그 공유.
- 친구 검색의 신규 검색 백엔드(기존 친구 리스트/검색 UI 재사용).
