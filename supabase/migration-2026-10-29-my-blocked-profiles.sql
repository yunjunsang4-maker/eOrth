-- ============================================================
-- 2026-10-29 · my_blocked_profiles() — 내가 차단한 사람의 '현재' 아이디
--
-- 왜: 설정 > 차단한 사용자 목록에 아이디를 보여 주는데, 앱은 차단할 때의 handle만 저장한다.
--     상대가 아이디를 바꾸면 목록이 옛 아이디로 남는다. 그런데 public_profiles 뷰는
--     `where not is_blocked_between(auth.uid(), id)` 라 차단한 사람을 아예 돌려주지 않아
--     id로 다시 조회할 길이 없었다.
--
-- 무엇: 내가 차단한 사람(blocks.blocker_id = 나)의 id·handle만 돌려주는 RPC 하나 추가.
--   · 나를 차단한 사람은 안 나온다(blocker_id 조건) — 차단당한 쪽이 상대를 알아낼 길은 열지 않는다.
--   · handle 외 정보(사진·소개·나라)는 내리지 않는다 — 목록은 기본 프사 + 아이디 + 날짜만 쓴다.
--
-- 호환: 신규 함수. 앱은 미반영이면(rpc 오류) 저장해 둔 handle로 폴백한다 — 실행 전에도 정상 동작.
--
-- ⚠️ 운영(blweol…)·테스트(bqwmx…) 양쪽 SQL Editor에서 실행할 것(베타 앱은 테스트 프로젝트를 본다).
-- 재실행 안전(create or replace).
--
-- 롤백: drop function if exists public.my_blocked_profiles();
--
-- 확인:
--   select proname from pg_proc where proname = 'my_blocked_profiles';  -- 1행
-- ============================================================

create or replace function public.my_blocked_profiles()
returns table (id uuid, handle text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;
revoke execute on function public.my_blocked_profiles() from public, anon;
grant execute on function public.my_blocked_profiles() to authenticated;
