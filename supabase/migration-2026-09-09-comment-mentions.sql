-- ============================================================
-- 2026-09-09 · 댓글 @언급(mention) 알림 — 타입 추가 + 파싱 트리거
--
-- 2026-09-08 의 델타 3개(cross-user-visibility / post-soft-delete / tombstone-aggregates /
-- trip-cards-sync)와는 **독립**이다(선후 없음). 어느 순서로 실행해도 된다.
--
-- 무엇을 만드나 — 댓글 본문에 `@아이디` 를 적으면 그 사람이 알림·푸시를 받는다.
--
--   ① `notifications_type_check` 에 `'mention'` 추가.
--      빠뜨리면 아래 트리거의 insert 가 23514(check 위반)로 실패하는데, 함수 끝의
--      `exception when others then return null` 이 그걸 삼켜 **아무 흔적 없이 조용히**
--      언급 알림만 안 온다. 이 델타에서 가장 놓치기 쉬운 한 줄이다.
--
--   ② `notify_on_mention()` + `trg_notify_mention after insert on public.comments`.
--      본문을 정규식으로 파싱해 `profiles.handle` 과 대조하고, 제외 규칙을 통과한
--      대상에게만 `type='mention'` 알림을 넣는다.
--
-- 저장 방식은 A안이다 — `comments` 에 컬럼을 늘리지 않고 본문 텍스트만 신뢰한다.
-- 클라이언트가 보낸 '언급 대상 목록'을 받지 않는 이유: 앱이 임의의 사용자 id 를 끼워
-- 넣어 스팸 알림을 만들 수 있다. 서버가 본문을 다시 파싱하는 쪽이 위조 불가다.
--
-- schema.sql 에 이미 반영돼 있다. 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는
-- 경우용 발췌본이다. 전부 멱등(`drop constraint if exists` 후 add / `create or replace` /
-- `drop trigger if exists` 후 생성)이라 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 앞선 델타에서 운영에만 넣고 발행 직전에 잡힌
--    사례가 있다 — 한쪽만 실행하면 그쪽에서만 동작해 "됐다"고 오판하게 된다.
--
-- ⚠️ **앱 배포 순서 제약 없음.** 구 번들과 완전히 호환된다 — 없던 알림 타입이 하나 늘 뿐이고,
--    옛 앱은 모르는 타입을 `TYPE_MAP` 폴백으로 흘려보낸다. 반대로 SQL 이 미반영이어도
--    앱은 @표시·자동완성·답글이 전부 동작하고 **언급 알림만 안 간다.**
--
-- ⚠️ **`supabase functions deploy send-push` 재배포가 함께 필요하다.** Edge Function 의
--    `PREF_KEY` 에 `mention` 이 없으면 `isPushAllowed` 가 "알 수 없는 타입"으로 보고
--    스킵해, 앱 알림함에는 뜨는데 푸시만 영영 안 온다.
--
-- ⚠️ 함수 본문은 schema.sql 과 **내용상 동일**해야 한다. 여기서만 고치면 다음 schema.sql
--    재실행이 조용히 되돌린다. (schema.sql 에서 기계적으로 발췌했다. 단 줄끝이 이 파일은
--    LF, schema.sql 은 CRLF 라 **바이트 비교는 전부 불일치로 나온다** — 대조할 땐 줄끝을
--    정규화하고 비교할 것.)
-- ============================================================


-- ============================================================
-- 1) notifications 타입 제약에 'mention' 추가
--
-- 정리용 delete 의 목록도 함께 넓힌다. schema.sql 은 재실행 시 '현재 유효한 전체 타입'
-- 밖의 행을 지우는데, 그 목록에 mention 이 없으면 **schema.sql 을 다시 돌릴 때마다
-- 언급 알림이 전량 삭제**되고 이어지는 add constraint 도 실패한다.
-- (이 파일만 실행하는 경우 delete 는 0행 no-op 이다.)
-- ============================================================
alter table public.notifications drop constraint if exists notifications_type_check;
delete from public.notifications
 where type not in ('neighbor_request', 'neighbor_accept', 'like', 'comment', 'reply', 'mention', 'friend_post');
alter table public.notifications add constraint notifications_type_check
  check (type in ('neighbor_request', 'neighbor_accept', 'like', 'comment', 'reply', 'mention', 'friend_post'));


-- ============================================================
-- 2) notify_on_mention() + trg_notify_mention
--
-- ⚠️ 토큰 규칙은 앱의 src/utils/mentions.ts(MENTION_HANDLE_RE)와 **글자 그대로 같아야**
--    한다. 앞 경계 `(^|[^A-Za-z0-9_])` 는 이메일(`a@bcde`)을 언급으로 오인하지 않게,
--    뒤 경계 `(?![A-Za-z0-9_])` 는 31자 이상 문자열의 앞 30자만 잘라 잡는 오탐을 막는다.
--    한쪽만 고치면 앱에선 보라색으로 보이는데 알림은 안 오는 조용한 어긋남이 생긴다.
--
-- ⚠️ 기존 `trg_notify_comment`(comment·reply 알림)는 **그대로 둔다.** 이건 추가 트리거이고,
--    같은 표의 after insert 트리거 두 개가 나란히 뜬다(제외 규칙 ④⑤가 중복을 막는다).
--
-- ⚠️ 비공개(private) 글은 통째로 skip 한다(⑥). 최종 `posts_select` 는 작성자 외 전원에게
--    'neighbors' 글만 열어 주므로, 서로이웃이어도 private 글은 못 연다 — 알림만 가고
--    탭하면 아무것도 안 열리는 죽은 딥링크가 되고 "비공개 글을 썼다"는 사실까지 샌다.
-- ============================================================
create or replace function public.notify_on_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_author   uuid;
  post_vis      text;
  post_deleted  timestamptz;
  parent_author uuid;
  target        uuid;
begin
  select author_id, visibility, deleted_at into post_author, post_vis, post_deleted
    from public.posts where id = new.post_id;

  -- ⑦ 글이 없거나 지워진 글이면 언급 알림 자체를 만들지 않는다
  if post_author is null or post_deleted is not null then
    return null;
  end if;

  -- ⑥ 비공개 글의 댓글도 전체 skip.
  --    최종 posts_select(이 파일 1522~1531행)는 작성자 외 전원에게 'neighbors' 글만 열어 준다
  --    — 그래서 아래 ③(서로이웃) 을 통과한 사람도 private 글은 **못 연다.** 그대로 두면
  --    알림·푸시는 가는데 탭하면 아무것도 안 열리는 죽은 딥링크가 되고, 덤으로
  --    "그 사람이 비공개 글을 썼다"는 사실 자체가 새어 나간다.
  --    (비공개 글에는 comments_insert_own 때문에 작성자만 댓글을 달 수 있어, 이 경로는
  --     '작성자가 자기 비공개 글 댓글에서 메이트를 언급'하는 한 가지뿐이다.)
  --    `= 'private'` 이 아니라 `<> 'neighbors'` 로 적는다 — 정책과 같은 기준이어야
  --    쓰이지 않는 'public' 값이 되살아나도 둘이 어긋나지 않는다.
  if post_vis is distinct from 'neighbors' then
    return null;
  end if;

  -- 답글이면 부모 댓글 작성자를 미리 구해 둔다(아래 ④ 제외 조건에서 쓴다)
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
  end if;

  -- distinct 필수 — 한 댓글에서 같은 사람을 두 번 언급하면 같은 키 upsert 가 한 문장 안에서
  -- 두 번 충돌해 21000(cannot affect row a second time)이 된다(notify_on_friend_post 와 같은 함정).
  -- 여기서는 대상별로 문장을 나누어 돌지만, 루프 중복 자체가 무의미하므로 미리 접는다.
  for target in
    select distinct p.id
      from regexp_matches(new.text, '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,30})(?![A-Za-z0-9_])', 'g') as t(m)
      join public.profiles p on lower(p.handle) = lower((t.m)[2])
     where p.id <> new.author_id                      -- ① 본인 언급
  loop
    if public.is_blocked_between(target, new.author_id) then
      continue;                                       -- ② 차단 관계
    end if;
    if target <> post_author and not public.are_neighbors(target, post_author) then
      continue;                                       -- ③ 그 글을 못 보는 사람
    end if;
    if new.parent_id is not null and target = parent_author then
      continue;                                       -- ④ 이미 'reply' 알림이 간다
    end if;
    if new.parent_id is null and target = post_author then
      continue;                                       -- ⑤ 이미 'comment' 알림이 간다
    end if;

    -- 언급도 여러 번 올 수 있어 uq_notifications_actor_type 충돌 가능 —
    -- 다른 타입과 같은 collapse 규칙(대상·행위자·타입별 최신 1건)을 따른다.
    insert into public.notifications (user_id, actor_id, type, post_id)
      values (target, new.author_id, 'mention', new.post_id)
      on conflict (user_id, actor_id, type) do update
        set created_at = now(), read = false, post_id = excluded.post_id;
  end loop;

  return null;
exception when others then
  -- 알림 실패가 댓글 저장을 막으면 안 된다 (notify_on_friend_post·notify_send_push 와 같은 원칙).
  -- 이 예외 흡수가 없으면 정규식·조인 오류 하나가 comments insert 를 통째로 롤백시킨다.
  return null;
end; $$;

drop trigger if exists trg_notify_mention on public.comments;
create trigger trg_notify_mention after insert on public.comments
  for each row execute function public.notify_on_mention();


-- ============================================================
-- 반영 확인 쿼리 (실행 후 SQL Editor 에서)
-- ============================================================

-- 1번: check 제약 목록에 'mention' 이 들어갔는지. def 문자열에 mention 이 보여야 한다.
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.notifications'::regclass
   and conname = 'notifications_type_check';
-- 기대: check ((type = ANY (ARRAY['neighbor_request'…, 'mention'…, 'friend_post'…])))

-- 2번: 함수가 존재하고 정규식·제외 규칙이 들어갔는지. 네 컬럼 모두 true 여야 한다.
--    has_private_guard(post_vis)가 없으면 ⑥ 비공개 글 skip이 빠진 옛 본문이다 — 이 컬럼이
--    없던 시절엔 옛 함수도 세 컬럼이 다 true로 나와 "반영됐다"고 오판할 수 있었다.
select p.proname,
       pg_get_functiondef(p.oid) like '%regexp_matches%'        as has_regex,
       pg_get_functiondef(p.oid) like '%are_neighbors%'         as has_neighbor_guard,
       pg_get_functiondef(p.oid) like '%post_vis%'              as has_private_guard,
       pg_get_functiondef(p.oid) like '%is_blocked_between%'    as has_block_guard
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'notify_on_mention';
-- 행이 안 나오면 미반영

-- 3번: comments 의 알림 트리거가 **2개**(기존 comment/reply 1 + 새 mention 1)인지.
select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgrelid = 'public.comments'::regclass
   and not tgisinternal
   and tgname in ('trg_notify_comment', 'trg_notify_mention')
 order by tgname;
-- 기대:
--   trg_notify_comment … AFTER INSERT ON public.comments …
--   trg_notify_mention … AFTER INSERT ON public.comments …

-- ⚠️ 확인 쿼리만으로는 부족하다 — 반영 후 **다른 계정의 글에 `@내아이디` 를 넣은 댓글 1건**을
--    달아, 언급된 쪽 앱에 알림이 실제로 도착하는지 눈으로 확인할 것.
--    `notify_on_mention` 끝에는 `exception when others then return null` 이 있어 함수 안의
--    어떤 오류도 **조용히 삼켜진다**(댓글 저장은 성공한다). 위 pg_get_functiondef 검사는
--    정의문이 들어갔는지만 보므로 이 증상을 잡지 못한다.
--    (제외 규칙 ③ 때문에 **글 작성자와 서로이웃인 계정**으로 시험해야 알림이 온다.)
