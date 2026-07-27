-- 2026-07-17: 비이웃 프로필의 여행수(기록 수) 스탯 동기화용 집계 RPC
-- Supabase SQL 에디터에서 1회 실행. 재실행 안전(create or replace).
-- 각 사용자의 공유 기록 수(visibility='neighbors' 글)를 집계값으로 반환.
-- 이웃수(neighbor_counts)와 동일한 공개 수준 — 개별 글은 여전히 RLS로 이웃 전용.

create or replace function public.post_counts(ids uuid[])
returns table (user_id uuid, post_count int)
language sql stable security definer set search_path = public as $$
  select u as user_id,
    (select count(*) from public.posts p
      where p.author_id = u and p.visibility = 'neighbors')::int
  from unnest(ids) as u;
$$;
grant execute on function public.post_counts(uuid[]) to authenticated;

-- 확인:
-- select * from public.post_counts(array['<user-uuid>']::uuid[]);
