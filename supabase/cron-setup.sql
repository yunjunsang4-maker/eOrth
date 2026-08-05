-- ============================================================
-- pg_cron 정기 작업 등록 (2026-08-05)
--
-- 이 파일은 '한 번 등록하면 계속 도는 작업'을 모아 둔 곳이다. schema.sql 과 달리 매번
-- 재실행할 필요는 없지만, **재실행해도 안전**하다 — cron.schedule 은 같은 이름의 잡을
-- 덮어쓴다(중복 등록되지 않는다).
--
-- 왜 필요한가: 두 정리 작업 모두 함수는 schema.sql 에 이미 있는데 **호출하는 사람이 없었다.**
--   ① notifications 는 지우는 주체가 없어 계속 쌓인다 → 테이블·인덱스가 무한히 커지고
--      unread 집계가 사용자 수에 비례해 느려진다.
--   ② 탈퇴 30일 유예가 지난 계정이 자동 파기되지 않는다 → 개인정보처리방침의 파기 약속이
--      실제로 이행되지 않는 상태이며, Storage 사진도 계속 용량을 차지한다.
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 ref: blweolnunmsxgztmvzfd)
-- ============================================================

-- 0) 확장 활성화 (Dashboard > Database > Extensions 에서 켜도 된다)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 1) 알림 보존 정리 — 매일 04:00 UTC (KST 13:00)
--    30일 지난 알림 행 삭제. 클라이언트 표시 기준은 7일이라 사용자 체감 변화는 없다.
-- ------------------------------------------------------------
select cron.schedule(
  'purge-notifications',
  '0 4 * * *',
  $$select public.purge_old_notifications()$$
);

-- ------------------------------------------------------------
-- 2) 추천 메이트 캐시 정리 — 매일 04:30 UTC
--    TTL(6시간)이 지난 뒤에도 남아 있는 오래된 행을 치운다. 급하지 않지만 표를 작게 유지한다.
-- ------------------------------------------------------------
select cron.schedule(
  'purge-mate-cache',
  '30 4 * * *',
  $$delete from public.mate_suggestions_cache where computed_at < now() - interval '7 days'$$
);

-- ------------------------------------------------------------
-- 3) 탈퇴 유예 만료 계정 파기 — 매일 18:00 UTC (KST 새벽 3시)
--
--    ⚠️ 선행 조건: service_role 키를 Vault 에 넣어야 한다(키가 SQL 본문에 남지 않게).
--       아래 한 줄을 **키를 채워서 먼저** 실행할 것:
--
--         select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
--       이미 넣었는지 확인:
--         select name from vault.decrypted_secrets where name = 'service_role_key';
--
--    SQL 로 직접 지우지 않고 Edge Function(delete-account, scope='sweep')을 부르는 이유는
--    Supabase 가 storage.objects 의 SQL 직접 삭제를 트리거로 막기 때문이다 — SQL 폴백
--    (purge_expired_deletion_requests)은 DB 행만 지우고 사진은 남긴다.
-- ------------------------------------------------------------
select cron.schedule(
  'purge-deleted-accounts',
  '0 18 * * *',
  $cron$
    select net.http_post(
      url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/delete-account',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{"scope":"sweep"}'::jsonb
    );
  $cron$
);

-- ------------------------------------------------------------
-- 확인 — 등록된 잡 목록과 최근 실행 결과
-- ------------------------------------------------------------
-- select jobid, jobname, schedule, active from cron.job order by jobname;
-- select jobid, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 20;

-- 되돌리기(등록 취소):
-- select cron.unschedule('purge-notifications');
-- select cron.unschedule('purge-mate-cache');
-- select cron.unschedule('purge-deleted-accounts');
