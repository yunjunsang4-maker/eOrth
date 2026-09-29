-- ============================================================
-- 2026-09-29 · 댓글 신고가 같은 글의 두 번째 신고부터 조용히 유실되던 문제
--
-- 댓글 신고도 글 id를 post_id로 넣는데, 중복 신고 방지 인덱스 `uq_reports_reporter_post`가
-- (reporter_id, post_id) 로 걸려 있어 **같은 글에서 두 번째 신고**(댓글 2개, 또는 댓글+글)는
-- 23505로 거부됐다. 앱은 이 오류를 삼켜(로컬 숨김은 이미 적용) 운영자에게는 도착하지 않았다.
--
-- 고치는 것: 신고 대상 댓글을 `comment_id`로 따로 들고, 중복 방지를 '글 신고'와 '댓글 신고'로 나눈다.
--   · 글 신고   : (reporter_id, post_id)    where comment_id is null
--   · 댓글 신고 : (reporter_id, comment_id) where comment_id is not null
--
-- 앱 호환: 앱(social.ts reportPostToServer)은 comment_id 컬럼이 없다는 오류(42703/PGRST204)를 받으면
-- comment_id 없이 다시 넣는다 — 이 SQL보다 앱이 먼저 나가도 신고가 사라지지 않는다(예전 동작 그대로).
--
-- ⚠️ comment_id 에 comments FK(on delete set null)를 걸면 안 된다(QA round6): 신고된 댓글이 지워질 때
--    comment_id 가 null 로 바뀌며 그 행이 '글 신고' 인덱스 대상이 되어, 같은 신고자의 기존 글 신고와
--    23505로 충돌 → 댓글 삭제·계정 삭제(cascade)가 통째로 롤백된다. 신고는 감사 기록이라 대상 댓글이
--    지워져도 id를 그대로 남기는 편이 맞다(reason 에도 [comment:id]·본문 앞부분이 남는다).
--
-- 재실행 안전(if not exists / drop if exists). 선후 의존 없음.
-- ============================================================

alter table public.reports
  add column if not exists comment_id uuid; -- FK 없음: 걸면 신고된 댓글 삭제 시 set null → 글 신고 인덱스와 23505 충돌(댓글·계정 삭제 롤백)

drop index if exists public.uq_reports_reporter_post;
create unique index if not exists uq_reports_reporter_post
  on public.reports (reporter_id, post_id) where post_id is not null and comment_id is null;
create unique index if not exists uq_reports_reporter_comment
  on public.reports (reporter_id, comment_id) where comment_id is not null;

-- 확인:
-- select indexname, indexdef from pg_indexes where tablename = 'reports';
