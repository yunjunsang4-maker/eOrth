-- ============================================================
-- 2026-09-08 · 사용자 간 전파 결함 — 수락 시 신청 알림 정리 + 공개 전환 시 이웃 알림
--
-- 같은 날의 tombstone 델타 2개(`migration-2026-09-08-post-soft-delete.sql`,
-- `migration-2026-09-08-tombstone-aggregates.sql`)와는 **독립**이다(선후 없음).
--
-- 고치는 것 두 가지 — 둘 다 "내 기기에서 한 일이 상대 기기에 안 나타난다"는 계열이다.
--
--   ① 메이트 신청을 **수락해도 신청 알림이 남는다.**
--      `accept_neighbor`는 neighbors 행을 지우지 않고 status만 UPDATE 한다. 그런데
--      유령 알림 청소 트리거 `trg_cleanup_neighbor_request_notif`는 **after delete**라
--      수락 경로에서는 뜨지 않는다. 그래서 수락한 뒤에도 알림함에 'OO님이 메이트 신청을
--      보냈어요'가 남고, 눌러도 수락 목록은 비어 있는 유령 알림이 된다.
--      → RPC 안에서 그 알림을 직접 지운다(수락 알림 insert 전에).
--
--   ② **비공개로 올린 뒤 공개로 바꾼 글은 이웃에게 영영 안 알려진다.**
--      `trg_notify_friend_post`는 `after insert` 뿐이다. 앱에는 저장 후 공개범위만 바꾸는
--      경로가 있고(PostDetailScreen → posts.ts updatePost 의 UPDATE), 그 글은 insert
--      시점에 private 이라 알림이 안 나갔고 전환 시점에도 트리거가 없었다.
--      → `after update of visibility` 트리거를 추가하고, 함수는 UPDATE 경로에서
--        'private → 그 외' 전환만 통과시킨다(아니면 글을 고칠 때마다 이웃 전원에게
--        '새 기록' 알림이 다시 간다). 겸사겸사 INSERT·UPDATE 공통으로 삭제표식
--        (`deleted_at is not null`)이 붙은 글은 알림에서 뺀다.
--
-- schema.sql 에 이미 반영돼 있다. 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는
-- 경우용 발췌본이다. 전부 멱등(`create or replace` / `drop trigger if exists` 후 생성)이라
-- 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 앞선 델타에서 운영에만 넣고 발행 직전에 잡힌
--    사례가 있다 — 한쪽만 실행하면 그쪽에서만 증상이 사라져 "고쳐졌다"고 오판하게 된다.
--
-- ⚠️ 앱 코드 변경과의 순서 제약은 없다(구 번들과 완전히 호환된다 — 반환 계약이 그대로고,
--    없어지는 것은 유령 알림뿐이며 새로 생기는 것은 알림 1건이다).
--    같은 날의 앱 변경(피드 카드 댓글 수·포커스 재조회·알림 UPDATE 구독)은 이 SQL과
--    무관하게 동작한다.
--
-- ⚠️ 함수 본문은 schema.sql 과 **내용상 동일**해야 한다. 여기서만 고치면 다음 schema.sql
--    재실행이 조용히 되돌린다. (이 파일은 schema.sql 에서 기계적으로 발췌해 만들었다.
--    단 줄끝이 이 파일은 LF, schema.sql 은 CRLF 라 **바이트 비교는 전부 불일치로 나온다**
--    — 대조할 땐 줄끝을 정규화하고 비교할 것.)
-- ============================================================


-- ============================================================
-- 1) accept_neighbor — 수락 시 처리된 neighbor_request 알림 삭제
--
-- 시그니처(인자·반환 타입)는 그대로다 — 앱이 호출 중이다. `create or replace` 로 교체된다.
-- grant 는 replace 로 유지되지만, 이 파일만 실행하는 경우를 위해 함께 넣어 둔다(멱등).
-- ============================================================
create or replace function public.accept_neighbor(requester uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.neighbors
    set status = 'accepted'
    where requester_id = requester and addressee_id = me and status = 'pending';
  if found then
    -- 역방향 행 정리(방어) — uq_neighbors_pair 이전에 생긴 맞신청 잔재가 있으면
    -- 여기서 지워 accepted 2행(발행 실패 원인)이 되는 것을 막는다. 관계는 방금
    -- 수락한 행 하나로 성립하므로 삭제해도 잃는 것이 없다.
    delete from public.neighbors
      where requester_id = me and addressee_id = requester;
    -- 처리된 신청 알림 정리 — 수락은 행을 **지우는 게 아니라 UPDATE**라
    -- trg_cleanup_neighbor_request_notif(after delete)가 뜨지 않는다. 그래서 수락한 뒤에도
    -- 내 알림함에 'OO님이 메이트 신청을 보냈어요'가 남아, 눌러도 수락 목록이 비어 있는
    -- 유령 알림이 됐다. 수락 알림을 넣기 **전에** 지운다(신청자↔수락자 방향이 반대라
    -- 아래 insert와 충돌하지 않는다 — 이건 내 알림, 저건 신청자 알림).
    delete from public.notifications
      where user_id = me and actor_id = requester and type = 'neighbor_request';
    insert into public.notifications (user_id, actor_id, type)
      values (requester, me, 'neighbor_accept')
      on conflict (user_id, actor_id, type) do update set created_at = now(), read = false;
  end if;
end; $$;
grant execute on function public.accept_neighbor(uuid) to authenticated;


-- ============================================================
-- 2) notify_on_friend_post — UPDATE(공개 전환) 지원 + tombstone 제외
--
-- 반환 타입(trigger)·인자 없음 그대로라 `create or replace` 로 교체된다.
-- ⚠️ 기존 insert 트리거(`trg_notify_friend_post`)는 **그대로 둔다.** 아래에서 다시 만드는
--    것은 멱등성을 위한 것이고, 지우고 UPDATE 트리거만 남기면 새 글 알림이 통째로 죽는다.
-- ============================================================
create or replace function public.notify_on_friend_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 삭제표식(tombstone)이 붙은 글은 알림 대상이 아니다 — INSERT·UPDATE 공통.
  -- (soft delete 는 deleted_at 만 건드리는 UPDATE 라 아래 visibility 트리거로는 오지 않지만,
  --  지워진 글을 공개로 되돌리는 경로가 생겨도 알림이 나가지 않도록 여기서 막는다)
  if new.deleted_at is not null then
    return null;
  end if;

  -- private 게시물은 이웃에게도 알림 안 함
  if new.visibility = 'private' then
    return null;
  end if;

  -- UPDATE 경로는 '비공개 → 공개' 전환만 통과시킨다(그 외 UPDATE 는 조용히 종료).
  -- visibility 는 not null 이라 null 비교로 판정이 흐려지지 않는다.
  -- ⚠️ old 참조를 **중첩 if 안에** 둔다. 한 줄로 `tg_op = 'UPDATE' and (old...)` 라고 쓰면
  --    INSERT 경로에서도 old 표현식이 평가 대상이 되는데, 이 함수 끝에는
  --    `exception when others then return null` 이 있어 **오류가 조용히 삼켜진다.**
  --    그러면 새 글의 이웃 알림이 통째로 죽고 아무 흔적도 남지 않는다.
  --    (이 저장소의 다른 tg_op 분기도 전부 중첩 if / case 형태다)
  if tg_op = 'UPDATE' then
    if not (old.visibility = 'private' and new.visibility <> 'private') then
      return null;
    end if;
  end if;

  -- accepted 이웃 전원에게 알림 삽입 (on conflict: 같은 작성자의 이전 friend_post 알림 갱신)
  -- distinct 필수 — 대칭 중복 행((A,B)+(B,A) accepted)이 있으면 같은 수신자가 2번 나와
  -- 한 문장 안에서 동일 키 upsert가 2회 충돌 → 21000(cannot affect row a second time)으로
  -- 문장 전체가 실패한다. uq_neighbors_pair로 중복 자체를 막았지만 이중 방어로 둔다.
  insert into public.notifications (user_id, actor_id, type, post_id)
  select distinct
    case
      when n.requester_id = new.author_id then n.addressee_id
      else n.requester_id
    end as user_id,
    new.author_id,
    'friend_post',
    new.id
  from public.neighbors n
  where n.status = 'accepted'
    and (n.requester_id = new.author_id or n.addressee_id = new.author_id)
    -- 차단 관계 제외 — 차단 시 neighbors 행이 트리거로 삭제되지만, 삭제 실패/타이밍 잔존 방어
    -- (is_blocked_between은 대칭 판정이라 한쪽이 작성자면 그대로 쓸 수 있다)
    and not public.is_blocked_between(n.requester_id, n.addressee_id)
  on conflict (user_id, actor_id, type) do update
    set created_at = now(), read = false, post_id = excluded.post_id;

  return null;
exception when others then
  -- 알림 실패가 게시물 발행을 막으면 안 된다 (notify_send_push와 같은 원칙).
  -- 이 예외 흡수가 없으면 트리거 오류가 posts insert를 통째로 롤백시킨다.
  return null;
end; $$;

drop trigger if exists trg_notify_friend_post on public.posts;
create trigger trg_notify_friend_post after insert on public.posts
  for each row execute function public.notify_on_friend_post();

-- 공개범위 전환 트리거 — 비공개로 올린 글을 나중에 공개로 바꿨을 때의 이웃 알림.
-- ⚠️ `of visibility` 로 좁혀 둔다. 컬럼 한정을 빼면 좋아요·댓글 카운터 갱신 등 posts 의
--    모든 UPDATE 마다 이 함수가 호출된다(대부분 위 tg_op 가드에서 즉시 return 하지만,
--    발행량이 많은 표에서 굳이 태울 이유가 없다).
drop trigger if exists trg_notify_friend_post_visibility on public.posts;
create trigger trg_notify_friend_post_visibility after update of visibility on public.posts
  for each row execute function public.notify_on_friend_post();


-- ============================================================
-- 반영 확인 쿼리 (실행 후 SQL Editor 에서)
-- ============================================================

-- 1번: accept_neighbor 정의문에 neighbor_request 삭제가 들어갔는지.
--      has_cleanup 이 true 여야 한다.
select p.proname,
       pg_get_functiondef(p.oid) like '%delete from public.notifications%neighbor_request%' as has_cleanup
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'accept_neighbor';

-- 2번: notify_on_friend_post 정의문에 UPDATE 가드와 tombstone 가드가 들어갔는지.
--      두 컬럼 모두 true 여야 한다.
select p.proname,
       pg_get_functiondef(p.oid) like '%tg_op = ''UPDATE''%'      as has_update_guard,
       pg_get_functiondef(p.oid) like '%new.deleted_at is not null%' as has_tombstone_guard
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'notify_on_friend_post';

-- 3번: posts 의 friend_post 트리거가 **2개**(insert 1 + update of visibility 1)인지.
--      information_schema.triggers 는 `UPDATE OF <컬럼>` 의 컬럼 목록을 노출하지 않아
--      정의문을 직접 읽는다(tombstone 델타에서와 같은 이유).
select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgrelid = 'public.posts'::regclass
   and not tgisinternal
   and tgname in ('trg_notify_friend_post', 'trg_notify_friend_post_visibility')
 order by tgname;
-- 기대:
--   trg_notify_friend_post            … AFTER INSERT ON public.posts …
--   trg_notify_friend_post_visibility … AFTER UPDATE OF visibility ON public.posts …
