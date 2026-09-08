-- ============================================================
-- 2026-09-08 · 글 수정·삭제의 기기 간 전파 (완전 동기화 1단계)
--
-- schema.sql 에 이미 반영돼 있다. 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는 경우용
-- 발췌본이다. 전부 멱등이라 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ 배포 순서 강제: 이 SQL 먼저 → 아래 확인 쿼리 → 그 다음에 OTA.
--    앱이 먼저 나가면 deleted_at 컬럼이 없어 타인 프로필 글 목록과 딥링크가 죽는다.
--    (내 기록·피드는 실패 시 병합 no-op / 캐시 고정이라 안전한 것으로 확인됨)
-- ============================================================

-- ── 1) 삭제 표식(tombstone) 컬럼 ──
-- 왜 hard delete가 아닌가: 행이 그냥 사라지면 클라이언트는 "작성자가 지웠다"와
-- "이번 조회가 부분 실패했다"를 구분할 수 없다(프로브는 중간 페이지 실패 시 부분 목록을
-- 돌려주고 MAX_POSTS 상한도 있다). 구분이 안 되면 로컬 기록을 지워도 되는지 판정할 수 없다.
alter table public.posts add column if not exists deleted_at timestamptz;

-- ── 2) 프로브용 커버링 인덱스 ──
-- 내 글 프로브는 (author_id, deleted_at)만 읽는다 — 본문 없이 끝나게 한다.
create index if not exists idx_posts_author_deleted on public.posts (author_id, deleted_at);

-- ── 3) 컬럼 수준 UPDATE 권한 재부여 ──  ★ 이 기능의 단일 최대 함정 ★
-- deleted_at 이 목록에 없으면 RLS를 통과해도 soft delete가 permission denied 로 **조용히**
-- 실패한다. data 는 원래 목록에 있었다(삭제 시 본문도 함께 비우므로 필요).
-- updated_at 은 트리거(set_updated_at)가 채운다 — 컬럼 권한은 'UPDATE 문이 명시한 컬럼'에만
-- 적용되므로 트리거 갱신에는 권한이 필요 없다.
revoke update on public.posts from authenticated;
grant update (visibility, view_type, country_name, data, client_id, deleted_at)
  on public.posts to authenticated;

-- ── 4) posts_select 정책 교체 ──
-- 삭제표식이 찍힌 글은 **남에게는 안 보인다. 단 작성자 본인은 볼 수 있다.**
-- ⚠️ 이 비대칭이 삭제 전파의 전제다. 양쪽 다 막으면(deleted_at is null 만 쓰면) 작성자의
--    프로브가 표식을 못 보고, 그러면 "지워졌다"와 "이 페이지가 실패했다"를 구분할 수 없어
--    삭제 전파가 원리적으로 불가능해진다. 반대로 조건을 아예 안 걸면(클라이언트 필터에만
--    의존) 필터가 없는 구 앱 번들 사용자에게 지운 글이 무기한 노출되고, 그 글에 좋아요·댓글
--    까지 달려 작성자에게 알림이 간다.
-- 부수 효과(의도된 것): 좋아요·댓글 insert 정책(likes_insert_own / comments_insert_own)이
--    `exists (select 1 from public.posts …)` 로 이 정책을 그대로 타므로, 지운 글에 새 반응이
--    달리는 경로도 함께 막힌다.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), posts.author_id)
    and (deleted_at is null or author_id = auth.uid())
    and (
      author_id = auth.uid()
      or (visibility = 'neighbors' and public.are_neighbors(auth.uid(), posts.author_id))
    )
  );

-- ── 5) 메이트 추천 캐시 무효화 트리거 교체 ──
-- `update of deleted_at` 이 필요하다 — 삭제가 hard delete 에서 soft delete(UPDATE)로 바뀌면서
-- `after insert or delete` 만으로는 글을 지워도 트리거가 안 뛰었다(추천 캐시가 TTL 6시간 동안
-- 지운 글을 계속 반영). 컬럼 목록을 붙였으므로 본문 수정 같은 일반 update 에는 발화하지 않는다.
drop trigger if exists trg_posts_invalidate_mate_cache on public.posts;
create trigger trg_posts_invalidate_mate_cache
  after insert or delete or update of deleted_at on public.posts
  for each row execute function public.invalidate_mate_cache();


-- ============================================================
-- 반영 확인 — 위 5개를 실행한 뒤 이 블록을 돌려 결과를 확인한다
-- ============================================================
-- 1번: deleted_at 한 줄이 나와야 한다
select column_name from information_schema.columns
 where table_schema='public' and table_name='posts' and column_name='deleted_at';

-- 2번: idx_posts_author_deleted 한 줄이 나와야 한다
select indexname from pg_indexes
 where tablename='posts' and indexname='idx_posts_author_deleted';

-- 3번: 목록에 deleted_at 과 data 가 **둘 다** 있어야 한다
select column_name from information_schema.column_privileges
 where table_schema='public' and table_name='posts'
   and grantee='authenticated' and privilege_type='UPDATE';

-- 4번: qual 안에 deleted_at 이 보여야 한다
select qual from pg_policies where tablename='posts' and policyname='posts_select';

-- 5번: 정의문에 `UPDATE OF deleted_at` 이 보여야 한다.
--      information_schema.triggers 는 `UPDATE OF <컬럼>` 의 컬럼 목록을 노출하지 않아
--      event_manipulation 만으로는 컬럼 한정 여부를 확인할 수 없다 — 정의문을 직접 읽는다.
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_posts_invalidate_mate_cache' and not tgisinternal;


-- ============================================================
-- 실측 1회 (권장) — 3번 컬럼 권한 판정은 의미론 유추이지 실측이 아니다.
-- **authenticated 세션**(SQL Editor 의 service_role 이 아니라 앱 계정)으로 아래가 통과하는지.
-- 통과하면 그 글은 실제로 삭제 처리되니, 지워도 되는 테스트 글로 할 것.
-- ============================================================
-- update public.posts set deleted_at = now(), data = '{}'::jsonb where id = '<내 글 id>';


-- ============================================================
-- (선택·미등록) tombstone 정리 — 자동 실행하지 않는다
--
-- 등록하지 않으면 표식 행이 영구히 쌓인다(본문 data 는 삭제 시점에 이미 비워진다).
-- 반대로 주기를 짧게 잡으면, 그보다 오래 잠들어 있던 기기가 표식을 놓쳐 그 글이 그 기기에
-- 영구히 남는다. 기간은 "가장 오래 안 켜는 기기"보다 넉넉해야 한다.
--
-- delete from public.posts
--  where deleted_at is not null and deleted_at < now() - interval '30 days';
--
-- ⚠️ Storage 파일은 이 delete 로 안 지워진다. 개별 삭제는 앱이 로컬 기록에서 수집한 URL로
--    지우지만, "데이터 초기화"(deleteAllMyPosts)는 그 경로를 타지 않아 파일이 남는다.
-- ⚠️ post_likes·comments·notifications 의 on delete cascade 는 soft delete(UPDATE)에는 돌지
--    않아 행이 쌓인다. 이 purge 로 실제 행이 지워질 때 함께 정리된다.
-- ============================================================
