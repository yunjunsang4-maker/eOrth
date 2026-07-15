-- ============================================================
-- 1회성 데이터 마이그레이션 (2026-07-15) — Supabase SQL 편집기에서 한 번만 실행
--
-- 과거 여행 불러오기(addImportedAlbum)가 기록을 visibility='private'로 발행해
-- 친구 프로필·소셜 피드에서 전혀 안 보이던 문제의 소급 보정.
-- 앱은 이제 기본 'friends'로 발행하며(recordStore.tsx), 기존 private 가져오기
-- 기록을 friends로 승격한다.
--
-- 대상 판정: client_id가 'rec-import-…' — 과거 여행 불러오기만 쓰는 로컬 id 접두사.
--   (가져온 앨범에는 공개범위 변경 UI가 없어, private은 전부 코드가 정한 값이지
--    사용자가 선택한 값이 아니다 → 일괄 승격해도 사용자 의도를 거스르지 않음)
-- visibility 컬럼(RLS 판정)과 data JSON(클라이언트 표시 판정)을 함께 갱신해야 한다.
--
-- ⚠️ schema.sql에 넣지 않는 이유: schema.sql은 재실행 전제 파일이라, 나중에
--    사용자가 직접 private으로 바꾼 기록까지 재실행 때마다 되돌리게 된다.
-- ============================================================

update public.posts
set visibility = 'friends',
    data = jsonb_set(data, '{visibility}', '"friends"')
where visibility = 'private'
  and client_id like 'rec-import-%';

-- 확인용: 남은 private 가져오기 기록이 0이어야 한다
-- select count(*) from public.posts where visibility = 'private' and client_id like 'rec-import-%';
