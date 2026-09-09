# 댓글 @언급 + 소셜 시트 답글 — 설계 (2026-09-09)

## 목표
1. 소셜 탭 피드 카드의 인라인 댓글 시트에서 답글을 달 수 있다.
2. 답글을 누르면 입력창 앞에 `@아이디 `가 자동으로 붙는다(상세·스냅 스토리·소셜 시트 공통).
3. 댓글 입력 중 `@`로 사용자를 태그할 수 있고(자동완성), 태그된 사용자는 앱 내 알림 + 푸시를 받는다.
4. 댓글 본문의 `@아이디`는 보라 네온으로 표시되고 탭하면 그 사람 프로필로 간다.

## 결정
- **저장 방식 A**: `comments.text`에 `@아이디` 텍스트만 저장. 컬럼 추가 없음. 서버 트리거가 본문을 파싱해 알림을 만든다. 클라이언트 목록을 신뢰하지 않는다.
- **토큰 규칙**: `@` + 아이디(`[A-Za-z0-9_]{4,30}`, `HANDLE_RE`와 동일), 뒤에 아이디 문자가 이어지지 않아야 한다. 대소문자 무시(`lower(handle)` 유니크 인덱스 기준).
- **자동완성 후보**: 내 메이트(`useRecords().neighbors`) + 글 작성자 + 이 글의 댓글·답글 작성자. 나 제외, 아이디 중복 제거, 접두 일치(대소문자 무시), 최대 8명. 서버 검색 없음.
- **알림 중복 제거(서버)**: 언급 대상이 ① 본인 ② 차단 관계 ③ 글을 못 보는 사람(글 작성자도 아니고 `are_neighbors`도 아님) ④ 답글의 부모 댓글 작성자(이미 `reply`) ⑤ 최상위 댓글에서 글 작성자(이미 `comment`)면 `mention` 알림을 만들지 않는다. ⑥ **글이 비공개(`visibility <> 'neighbors'`)면 댓글 전체를 skip한다** — 최종 `posts_select`가 작성자 외 전원을 막으므로 ③을 통과한 메이트도 그 글을 못 연다. 빠뜨리면 알림·푸시만 가고 탭하면 안 열리는 죽은 딥링크가 되고 '비공개 글을 썼다'는 사실까지 샌다(1단계 QA 발견 #2). ⑦ 글에 `deleted_at`(삭제표식)이 있어도 전체 skip.
- **알림 타입** `mention` 추가. 유일 인덱스 `(user_id, actor_id, type)`에 맞춰 `on conflict do update`(기존 타입과 같은 collapse 규칙). 트리거 끝에 예외 흡수 — 댓글 저장을 막지 않는다.
- 푸시 설정 키: `mention → 'likes'`(좋아요·댓글 토글에 묶음). 문구 "@x님이 댓글에서 회원님을 언급했어요".

## 구성 요소
| 단위 | 역할 | 의존 |
|---|---|---|
| `src/utils/mentions.ts` | `findActiveMention(text, cursor)`, `applyMention(text, range, handle)`, `splitMentions(text)`, `filterMentionCandidates(candidates, query)` — 순수 함수 | 없음 |
| `src/utils/mentions.verify.ts` | 위 함수 검증 | run-verify |
| `src/components/MentionText.tsx` | 본문을 세그먼트로 렌더, @토큰 보라 네온 + 탭 → `getProfileByHandle` → `FriendProfile` | mentions.ts, profile.ts, navigationRef |
| `src/components/MentionSuggestBar.tsx` | 입력창 위 가로 칩 목록. props: candidates, query, onPick | mentions.ts |
| PostDetailScreen(상세·스냅 시트), SocialScreen(CommentBottomSheet) | 답글 버튼·답글 바·@자동 삽입·자동완성 연결·MentionText 적용 | 위 컴포넌트 |
| `supabase/schema.sql` + 델타 `migration-2026-09-09-comment-mentions.sql` | `notifications_type_check`에 `mention` 추가, `notify_on_mention()` + `trg_notify_mention after insert on comments` | — |
| `supabase/functions/send-push/index.ts` | `PREF_KEY.mention`, `buildMessage` case `mention` | 재배포 필요 |
| `src/services/social.ts` | `AppNotificationType`에 `mention` | — |
| NotiToastHost, NotificationScreen | `TYPE_MAP.mention`(cat comment, key `misc.mentionText`, toPost) | i18n ko/en |

## 데이터 흐름
입력 `@ju` → `findActiveMention` → 후보 칩 → 탭 → `applyMention` → 전송(기존 `addComment`, parent 있으면 답글) → 서버 insert → `notify_on_mention`이 `regexp_matches(text, '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,30})(?![A-Za-z0-9_])', 'g')`(2번 그룹이 아이디)로 토큰 추출 — **앞뒤 경계를 빼고 간소화하지 말 것.** 앞 경계가 없으면 이메일 `a@bcde`가, 뒤 경계가 없으면 31자 문자열의 앞 30자가 언급으로 잡힌다 → `profiles` lower(handle) 조인 → 제외 규칙 → `notifications(type='mention', post_id)` → `notify_send_push` → 앱 목록·배너·푸시.

## 오류 처리
- 자동완성은 로컬 데이터만 사용 — 네트워크 실패 없음.
- 프로필 탭 시 아이디 조회 실패(탈퇴·변경)는 조용히 무시(토스트 없음).
- 서버 트리거 예외는 흡수. 미반영 상태여도 앱은 표시·자동완성·답글이 전부 동작하고 언급 알림만 안 간다.

## 검증
- `mentions.verify.ts`: 경계(`@abc`는 4자 미만이라 토큰 아님, `email@host` 안의 @는 앞이 문자라 토큰 아님, 끝 공백, 커서 중간), 대소문자, 중복 제거, 후보 상한.
- tsc·npm test. 실기기: 키보드 위 칩 바 배치(iOS/Android), 답글 @자동 삽입 후 지우기, 알림 도착(서버 반영 후).

## 범위 밖
- 아이디 변경 시 옛 댓글의 @토큰 재연결(B안 영역).
- 게시물 본문·DM의 @언급.
