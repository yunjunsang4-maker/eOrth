-- ============================================================
-- 1회성 데이터 마이그레이션 (2026-07-15) — Supabase SQL 편집기에서 한 번만 실행
-- 팔로우 → 서로이웃 전환.
--
-- ⚠️ 실행 순서 (중요):
--   (1) 먼저 이 파일의 1)·2) 블록을 실행한다 — 이 시점엔 follows 테이블이 아직
--       존재해야 하므로, schema.sql 최종형(follows 드롭 포함)을 실행하기 "전"에 돌린다.
--   (2) 그다음 schema.sql(최종형: neighbors 테이블·RLS·RPC + follows·is_private 드롭)을 실행한다.
--   즉 "데이터 이관 먼저, 드롭 나중".
--
-- ⚠️ 재실행 금지: 맞팔 이관은 on conflict로 멱등이나, 공개범위 이관은 사용자가 나중에
--   되돌린 값까지 다시 덮을 수 있다.
--
-- 전제: schema.sql로 neighbors 테이블이 이미 생성돼 있어야 한다(1번 블록의 insert 대상).
--   따라서 정확한 순서는: schema.sql의 neighbors 테이블 생성까지 실행 → 이 마이그레이션 실행
--   → schema.sql의 follows/is_private 드롭 실행. 가장 안전한 방법은 아래 A/B 중 택1:
--     A) schema.sql 전체 실행(neighbors 생성 + follows 드롭까지) 하면 follows가 사라져 1)이
--        빈 결과가 된다 → 맞팔 이관 불가. 그러므로 A는 부적합.
--     B) [권장] schema.sql에서 follows/follow_requests 드롭 문(2줄)과 is_private 드롭 문을
--        잠시 주석 처리하고 전체 실행 → 이 마이그레이션 실행 → 주석 해제한 그 3줄만 실행.
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
