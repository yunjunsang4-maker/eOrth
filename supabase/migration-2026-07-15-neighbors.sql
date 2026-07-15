-- ============================================================
-- 1회성 데이터 마이그레이션 (2026-07-15) — Supabase SQL 편집기에서 한 번만 실행
-- 팔로우 → 서로이웃 전환.
--
-- ⚠️ 실행 순서 (반드시 이대로):
--   이 마이그레이션의 1)은 아직 살아 있는 follows 테이블을 읽고, neighbors 테이블에 쓴다.
--   즉 "neighbors는 이미 있어야 하고, follows는 아직 안 지워졌어야" 한다. 그래서:
--
--   1단계. schema.sql을 열어 아래 3개 드롭 문을 잠시 주석 처리한다:
--            drop table if exists public.follow_requests cascade;
--            drop table if exists public.follows cascade;
--            alter table public.profiles drop column if exists is_private;
--   2단계. 그 상태로 schema.sql 전체를 실행한다 (neighbors 테이블·RLS·RPC 생성, follows는 아직 유지).
--   3단계. 이 마이그레이션 파일(아래 1)·2))을 실행한다 (맞팔→이웃, 공개범위 이관).
--   4단계. 1단계에서 주석 처리한 그 3줄만 주석 해제해 실행한다 (follows·is_private 최종 드롭).
--
--   ※ schema.sql을 주석 없이 통째로 먼저 돌리면 follows가 사라져 맞팔 이관(1))이 빈 결과가 된다.
--
-- ⚠️ 재실행 금지: 맞팔 이관은 on conflict로 멱등이나, 공개범위 이관은 사용자가 나중에
--   되돌린 값까지 다시 덮을 수 있다.
-- ============================================================

-- 1) 맞팔(양방향 follows)만 accepted 이웃으로 이관. 단방향 follows는 버린다.
insert into public.neighbors (requester_id, addressee_id, status)
select f1.follower_id, f1.following_id, 'accepted'
from public.follows f1
join public.follows f2
  on f2.follower_id = f1.following_id
 and f2.following_id = f1.follower_id
where f1.follower_id < f1.following_id
on conflict do nothing;

-- 2) 게시물 공개범위 이관: public·friends → neighbors, private 유지.
update public.posts
  set visibility = 'neighbors',
      data = jsonb_set(data, '{visibility}', '"neighbors"')
where visibility in ('public', 'friends');

-- 확인용 (주석 해제해 실행):
-- select visibility, count(*) from public.posts group by visibility;
-- select count(*) from public.neighbors where status = 'accepted';
