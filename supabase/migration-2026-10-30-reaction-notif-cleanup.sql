-- ============================================================
-- 2026-10-30 · 반응 취소 시 알림 정리 — 좋아요 취소·댓글 삭제·글 삭제의 유령 알림
--
-- 왜: 좋아요 취소(post_likes delete)·댓글 삭제(comments delete)·글 삭제(posts.deleted_at soft
--     delete)를 해도 상대의 알림(public.notifications)이 그대로 남는다. schema.sql 에는 생성
--     트리거(notify_on_like·notify_on_comment·notify_on_mention·notify_on_friend_post)만 있고
--     정리 트리거가 없다. 탭하면 없는 좋아요·댓글·글로 가는 유령 알림이 된다.
--     단순 삭제는 틀리다 — uq_notifications_actor_type 로 알림은 (수신자·행위자·타입)당 1행이고
--     post_id 는 최신 반응만 가리키므로, 같은 사람의 같은 반응이 다른 글에 남아 있으면
--     그 반응을 가리키도록 되돌려야 한다.
--
-- 무엇: (schema.sql 10-f 수정분 + 10-f-2 절과 동일)
--   1) notify_send_push UPDATE 가드: `created_at is distinct from` → `created_at > old.created_at`
--      되돌리기는 created_at 을 과거로 내리므로 푸시가 다시 나가지 않는다.
--      ⚠️ 이 단계가 **반드시 맨 앞**이어야 한다. 옛 가드인 채로 아래 4)를 돌리면 되돌려진 알림마다
--         (read=false 면) send-push 호출이 나간다.
--      ⚠️ 함수 전체를 옮겨 적지 않고 서버에 있는 정의의 그 한 구절만 바꾼다(do 블록).
--         schema.sql 본문을 그대로 붙이면 URL·anon 키가 운영(blweol…) 값이라, 테스트 프로젝트에서
--         실행하는 순간 테스트 푸시가 운영 send-push 로 가서 조용히 죽는다
--         (테스트 DB 정의는 bqwmx… URL·키를 쓴다 — test-schema.local.sql 참고).
--   2) reconcile_reaction_notification(id) — 알림 1행을 남아 있는 원천으로 재계산
--      (원천 없음 → 삭제 / 지금 글에 남아 있음 → 그대로 / 다른 글에 남아 있음 → 그 글·시각으로 되돌림)
--   3) 트리거 3개: post_likes after delete / comments after delete / posts after update of deleted_at
--   4) 1회성 — 지금까지 쌓인 유령 알림 일괄 정리(이 파일에만 있음. schema.sql 에는 없다)
--
-- 호환: 서버만 바뀐다. 앱 코드 변경 없음 — 앱은 알림 목록을 다시 읽을 때 정리된 결과를 본다.
--       이미 나간 푸시는 회수 불가(앱 내 목록·배지만 정리된다).
--
-- ⚠️ 운영(blweol…)·테스트(bqwmx…) 양쪽 SQL Editor에서 실행할 것(베타 앱은 테스트 프로젝트를 본다).
-- 재실행 안전: 1) 은 이미 바뀌었으면 건너뜀, 2)·3) 은 create or replace / drop trigger if exists,
--             4) 는 정리된 뒤 다시 돌면 바뀌는 행이 없다(알림 수만큼 스캔은 돈다).
--
-- 롤백:
--   drop trigger if exists trg_cleanup_like_notif on public.post_likes;
--   drop trigger if exists trg_cleanup_comment_notif on public.comments;
--   drop trigger if exists trg_cleanup_deleted_post_notifs on public.posts;
--   drop function if exists public.cleanup_like_notification();
--   drop function if exists public.cleanup_comment_notification();
--   drop function if exists public.cleanup_deleted_post_notifications();
--   drop function if exists public.reconcile_reaction_notification(uuid);
--   -- 푸시 가드 되돌리기(1)의 반대 — URL·키는 그대로 둔다):
--   do $$ declare def text; begin
--     def := pg_get_functiondef('public.notify_send_push()'::regprocedure);
--     execute replace(def, 'new.created_at > old.created_at', 'new.created_at is distinct from old.created_at');
--   end $$;
--   (4)에서 지운 알림은 되살릴 수 없다 — 원래 유령이었으므로 되살릴 이유도 없다)
--
-- 확인:
--   select proname from pg_proc where proname in ('reconcile_reaction_notification',
--     'cleanup_like_notification','cleanup_comment_notification','cleanup_deleted_post_notifications');  -- 4행
--   select tgname from pg_trigger where tgname in ('trg_cleanup_like_notif',
--     'trg_cleanup_comment_notif','trg_cleanup_deleted_post_notifs');                                    -- 3행
--   select pg_get_functiondef('public.notify_send_push()'::regprocedure) like '%new.created_at > old.created_at%';  -- true
-- ============================================================

-- ------------------------------------------------------------
-- 1) notify_send_push 가드 — 서버 정의에서 한 구절만 교체(URL·키·나머지 본문은 그대로)
-- ------------------------------------------------------------
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.notify_send_push()'::regprocedure);
  if position('new.created_at > old.created_at' in def) > 0 then
    raise notice 'notify_send_push: 이미 > 가드다 — 건너뜀';
  elsif position('new.created_at is distinct from old.created_at' in def) > 0 then
    execute replace(def, 'new.created_at is distinct from old.created_at', 'new.created_at > old.created_at');
  else
    -- 여기서 멈춰야 4)가 옛 가드로 푸시를 쏘지 않는다
    raise exception 'notify_send_push 가드 구절을 찾지 못했다 — 서버 정의를 직접 확인할 것';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2)·3) 재계산 함수 + 트리거 (schema.sql 10-f-2 와 동일)
-- ------------------------------------------------------------
-- ============================================================
-- 10-f-2) 반응 취소 시 알림 정리 (2026-10-30)
--   좋아요 취소(post_likes delete)·댓글 삭제(comments delete)·글 삭제(posts.deleted_at soft
--   delete)를 해도 상대의 알림이 그대로 남아, 탭하면 없는 좋아요·댓글·글로 가는 유령 알림이 됐다.
--   생성 트리거(10-c·10-d·10-d-2·10-e)만 있고 정리 트리거가 없었다
--   (메이트 신청만 4-c 의 cleanup_neighbor_request_notification 으로 정리한다).
--
--   ⚠️ 그냥 지우면 안 되는 이유: uq_notifications_actor_type 때문에 알림은
--      (수신자·행위자·타입)당 1행으로 collapse 되고 post_id 는 '가장 최근 반응'만 가리킨다.
--      A가 내 글 1·2에 좋아요 → 알림 1행(post_id=2). 글 2 좋아요만 취소하면 글 1 좋아요는
--      여전히 살아 있으므로 알림은 지울 게 아니라 글 1을 가리키도록 되돌려야 한다.
--   → 알림 1행을 '지금 남아 있는 원천(반응)'으로 다시 계산하는 함수 하나를 두고,
--     세 삭제 경로의 트리거가 영향받은 알림마다 이 함수를 부른다.
--
--   푸시: 되돌리기는 created_at 을 남은 반응의 과거 시각으로 내리므로 10-f 의
--   `new.created_at > old.created_at` 가드에 걸려 푸시가 다시 나가지 않는다. read 는 건드리지 않는다.
--   (이미 나간 푸시는 회수 불가 — 앱 내 목록·배지만 정리된다)
--
--   기존 유령 알림의 1회성 일괄 정리는 여기 넣지 않는다 — 이 파일은 재실행되는 파일이라
--   매번 알림 전수 스캔이 돈다. migration-2026-10-30-reaction-notif-cleanup.sql 끝에만 있다.
--
--   ⚠️ public.are_neighbors(4-b)·notifications.post_id(10-b) 정의보다 뒤에 있어야 한다.
-- ============================================================
create or replace function public.reconcile_reaction_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n        public.notifications%rowtype;
  src_post uuid;
  src_at   timestamptz;
  rcpt     text;
begin
  select * into n from public.notifications where id = p_id;
  if not found then
    return;
  end if;

  -- 원천 고르기: 지금 가리키는 글에 원천이 남아 있으면 그걸 우선(= 손대지 않음),
  -- 없으면 남은 것 중 가장 최근 반응. 원천은 전부 삭제표식 없는 글에서만 찾는다.
  -- (select into 가 0행이면 src_post 는 null 로 남는다 → 아래에서 삭제)
  if n.type = 'like' then
    select pl.post_id, pl.created_at into src_post, src_at
      from public.post_likes pl
      join public.posts p on p.id = pl.post_id
     where pl.user_id = n.actor_id
       and p.author_id = n.user_id
       and p.deleted_at is null
     order by (pl.post_id = n.post_id) desc, pl.created_at desc
     limit 1;

  elsif n.type = 'comment' then
    select c.post_id, c.created_at into src_post, src_at
      from public.comments c
      join public.posts p on p.id = c.post_id
     where c.author_id = n.actor_id
       and c.parent_id is null
       and p.author_id = n.user_id
       and p.deleted_at is null
     order by (c.post_id = n.post_id) desc, c.created_at desc
     limit 1;

  elsif n.type = 'reply' then
    -- 부모 댓글 삭제로 답글이 cascade 로 지워질 때는 이 조인이 부모를 못 찾아 원천 없음 →
    -- 삭제가 된다. 부모 댓글이 없는 답글 알림은 열 곳이 없으므로 그게 정답이다.
    select c.post_id, c.created_at into src_post, src_at
      from public.comments c
      join public.comments pc on pc.id = c.parent_id
      join public.posts p on p.id = c.post_id
     where c.author_id = n.actor_id
       and pc.author_id = n.user_id
       and p.deleted_at is null
     order by (c.post_id = n.post_id) desc, c.created_at desc
     limit 1;

  elsif n.type = 'mention' then
    -- 토큰 정규식은 10-d-2 notify_on_mention(= 앱 src/utils/mentions.ts)과 **글자 그대로 같다.**
    -- 한쪽만 고치면 '언급이 남아 있는데 알림이 지워지는' 어긋남이 생긴다.
    -- 가시성 조건도 같은 기준: neighbors 글 + (수신자가 작성자이거나 작성자와 서로이웃).
    select handle into rcpt from public.profiles where id = n.user_id;
    select c.post_id, c.created_at into src_post, src_at
      from public.comments c
      join public.posts p on p.id = c.post_id
     where c.author_id = n.actor_id
       and p.deleted_at is null
       and p.visibility = 'neighbors'
       and (n.user_id = p.author_id or public.are_neighbors(n.user_id, p.author_id))
       and exists (
         select 1
           from regexp_matches(c.text, '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,30})(?![A-Za-z0-9_])', 'g') as t(m)
          where lower((t.m)[2]) = lower(rcpt)
       )
     order by (c.post_id = n.post_id) desc, c.created_at desc
     limit 1;

  elsif n.type = 'friend_post' then
    -- 새 기록 알림은 다른 글로 되돌리지 않는다 — 그 글이 살아 있고 공개면 유지, 아니면 삭제.
    -- (되돌리면 이미 본 옛 글이 '새 기록'으로 다시 뜬다)
    select p.id into src_post
      from public.posts p
     where p.id = n.post_id
       and p.deleted_at is null
       and p.visibility <> 'private';

  else
    return; -- neighbor_request / neighbor_accept 는 대상 아님 (4-c 에서 따로 정리)
  end if;

  if src_post is null then
    delete from public.notifications where id = n.id;
  elsif src_post is distinct from n.post_id then
    update public.notifications
       set post_id = src_post, created_at = src_at
     where id = n.id;
  end if;
exception when others then
  return; -- 알림 정리 실패가 좋아요 취소·댓글 삭제·글 삭제를 막으면 안 된다
end; $$;
-- 트리거(소유자 권한)와 SQL Editor 에서만 부른다. 클라이언트 RPC 로 열 이유가 없다.
revoke execute on function public.reconcile_reaction_notification(uuid) from public, anon, authenticated;

-- 좋아요 취소 → 그 좋아요를 가리키던 like 알림 재계산.
-- post_id 조건: 알림이 이미 다른(더 최근) 글을 가리키고 있으면 이 취소와 무관하다.
create or replace function public.cleanup_like_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from public.notifications
     where post_id = old.post_id and actor_id = old.user_id and type = 'like'
  loop
    perform public.reconcile_reaction_notification(r.id);
  end loop;
  return null;
exception when others then
  return null; -- 알림 정리 실패가 좋아요 취소를 막으면 안 된다
end; $$;

drop trigger if exists trg_cleanup_like_notif on public.post_likes;
create trigger trg_cleanup_like_notif after delete on public.post_likes
  for each row execute function public.cleanup_like_notification();

-- 댓글 삭제 → 그 댓글이 만들었을 수 있는 comment/reply/mention 알림 재계산.
-- 부모 댓글을 지워 답글이 cascade 로 함께 지워질 때도 맞다: AFTER 트리거는 문장 끝에 돌아
-- 부모 행이 이미 없으므로, reply 원천 조인이 부모를 못 찾아 그 답글 알림은 삭제된다.
create or replace function public.cleanup_comment_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from public.notifications
     where post_id = old.post_id and actor_id = old.author_id
       and type in ('comment', 'reply', 'mention')
  loop
    perform public.reconcile_reaction_notification(r.id);
  end loop;
  return null;
exception when others then
  return null; -- 알림 정리 실패가 댓글 삭제를 막으면 안 된다
end; $$;

drop trigger if exists trg_cleanup_comment_notif on public.comments;
create trigger trg_cleanup_comment_notif after delete on public.comments
  for each row execute function public.cleanup_comment_notification();

-- 글 soft delete(deleted_at null → 값) → 그 글을 가리키는 반응·새 기록 알림 전부 재계산.
-- (좋아요·댓글 행은 tombstone 동안 남아 있지만, 원천 조회가 deleted_at is null 글만 보므로
--  다른 글로 되돌아가거나 지워진다)
-- UPDATE 전용 트리거라 old 가 항상 있다 — notify_on_friend_post 의 'INSERT 경로에서 old 평가'
-- 함정은 여기 해당하지 않는다.
create or replace function public.cleanup_deleted_post_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not (old.deleted_at is null and new.deleted_at is not null) then
    return null; -- 이미 지워진 글의 재표식·복원은 대상 아님
  end if;
  for r in
    select id from public.notifications
     where post_id = new.id
       and type in ('like', 'comment', 'reply', 'mention', 'friend_post')
  loop
    perform public.reconcile_reaction_notification(r.id);
  end loop;
  return null;
exception when others then
  return null; -- 알림 정리 실패가 글 삭제를 막으면 안 된다
end; $$;

-- `of deleted_at` 로 좁힌다 — 좋아요·댓글 카운터 갱신 등 posts 의 다른 UPDATE 에는 안 탄다.
drop trigger if exists trg_cleanup_deleted_post_notifs on public.posts;
create trigger trg_cleanup_deleted_post_notifs after update of deleted_at on public.posts
  for each row execute function public.cleanup_deleted_post_notifications();

-- ------------------------------------------------------------
-- 4) 1회성 — 지금까지 쌓인 유령 알림 정리 (schema.sql 에는 넣지 않는다: 재실행마다 전수 스캔)
--    전후 행수 비교용(실행 전·후에 각각 돌려 볼 것):
--    select type, count(*) from public.notifications
--     where type in ('like','comment','reply','mention','friend_post') group by type order by type;
-- ------------------------------------------------------------
select public.reconcile_reaction_notification(id)
  from public.notifications
 where type in ('like', 'comment', 'reply', 'mention', 'friend_post');
