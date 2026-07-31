-- ============================================================
-- ⛔ 실행 금지 — 이미 실행 완료된 1회성 마이그레이션 기록물 (2026-07-15 실행됨)
--    다시 실행하지 말 것. 보관 목적으로만 남긴다.
--    (재실행하면 그 사이 사용자가 직접 비공개로 되돌린 기록까지 다시 공개로 승격된다.)
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

-- ⚠️ 값 정정 (감사 2026-08-01): 원본은 'friends' 였으나 이후 follows→neighbors 전환으로
--    'friends' 는 어느 정책·클라이언트도 인정하지 않는 죽은 값이 됐다. 실수로 재실행될
--    경우에 대비해 현행 값 'neighbors' 로 고쳐 둔다.
-- ⚠️ 실행 가드: 마이그레이션 시점(2026-07-15) 이전에 만들어진 기록만 대상으로 좁힌다.
--    이후 발행분은 앱이 이미 올바른 공개범위로 저장하므로 건드릴 이유가 없고,
--    혹시 재실행되더라도 최근 기록의 사용자 선택을 뒤엎지 않는다.
update public.posts
set visibility = 'neighbors',
    data = jsonb_set(data, '{visibility}', '"neighbors"')
where visibility = 'private'
  and client_id like 'rec-import-%'
  and created_at < timestamptz '2026-07-15';

-- 확인용: 남은 private 가져오기 기록이 0이어야 한다
-- select count(*) from public.posts where visibility = 'private' and client_id like 'rec-import-%';
