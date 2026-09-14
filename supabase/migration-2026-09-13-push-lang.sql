-- ============================================================
-- 2026-09-13 · 푸시 알림 문구의 언어 분기 — `push_tokens.lang`
--
-- schema.sql 에 이미 반영돼 있다(10-a 절). 이 파일은 전체 재실행 대신 **바뀐 부분만**
-- 적용하려는 경우용 발췌본이다. 멱등(`add column if not exists`)이라 두 방법 중 아무거나,
-- 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 영어가 나와
--    "고쳐졌다"고 오판하게 된다.
--
-- ⚠️ **`supabase functions deploy send-push` 재배포가 함께 필요하다.**
--    컬럼만 넣고 함수를 그대로 두면 문구는 계속 전부 한국어다(무해하지만 아무 변화도 없다).
--    반대로 함수만 배포하면 `select('token, prefs, lang')` 이 42703(컬럼 없음)으로 실패해
--    **푸시가 통째로 멈춘다** — 그러므로 반드시 이 SQL 이 먼저다.
--
-- ⚠️ **앱 배포 순서 제약은 없다.** 컬럼이 null 허용이고, Edge Function 은 null 과 알 수 없는
--    값을 전부 한국어로 떨어뜨린다 = 구 번들 토큰은 종전 동작 그대로. 새 번들이 upsert 할 때
--    비로소 'ko'/'en' 이 채워진다.
--
-- ⚠️ **전제(확장·pg_cron 등) 없다.**
-- ============================================================


-- ── 1) 문구 언어 컬럼 ──
-- 왜 profiles 가 아니라 push_tokens 인가:
--   ① 언어는 계정이 아니라 **기기** 설정이다. 같은 계정의 아이폰=영어 / 안드로이드=한국어가
--      실제로 가능하고, 그러면 기기마다 다른 문구로 가야 맞다.
--   ② send-push 의 두 발송 경로(handleDm · 메인 핸들러)가 이미 push_tokens 를 조회한다 —
--      조인이 늘지 않는다.
-- 값은 'ko' | 'en' 두 가지. 앱(src/services/pushToken.ts `normalizePushLang`)이
-- 'en-US' 같은 지역 태그를 접어서 넣는다. null = 이 컬럼 이전에 등록된 행.
alter table public.push_tokens add column if not exists lang text;

-- ── 2) RLS·권한: 변경 없음 ──
-- 정책은 `push_tokens_all_own` 하나뿐이고 `for all … using (user_id = auth.uid())` 라
-- 컬럼이 늘어도 그대로 통과한다. posts 와 달리 push_tokens 에는 컬럼 단위
-- `grant update (...)` 가 걸려 있지 않으므로, 삭제 전파 때 겪었던 "권한 목록에 빠져 조용히
-- permission denied" 함정도 해당되지 않는다. (아래 확인 쿼리 3번으로 실제로 없는지 본다)


-- ============================================================
-- 반영 확인 — 위 1)을 실행한 뒤 이 블록을 돌려 결과를 확인한다
-- ============================================================
-- 1번: lang 한 줄이 나와야 한다. is_nullable 이 YES 여야 한다(구 번들 호환의 전제)
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'push_tokens' and column_name = 'lang';

-- 2번: 정책이 `push_tokens_all_own` 하나, cmd 가 ALL 인지 (컬럼 추가로 손댈 것이 없음을 확인)
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'push_tokens';

-- 3번: **행이 하나도 나오지 않아야 한다.** 행이 나오면 어딘가에서 컬럼 단위 UPDATE 권한이
--      걸려 있다는 뜻이고, 그 목록에 lang 이 없으면 앱의 prefs·lang 갱신이 조용히 실패한다.
select column_name from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'push_tokens'
   and grantee = 'authenticated' and privilege_type = 'UPDATE';

-- 4번(선택): 앱 배포 후 실제로 값이 들어오는지. 새 번들로 한 번 포그라운드에 들어갔다
--      나오면 그 기기 행의 lang 이 채워진다. 배포 전에는 전부 null 이 정상이다.
select lang, count(*) from public.push_tokens group by lang order by lang nulls first;


-- ============================================================
-- 실측 1회 (권장) — 확인 쿼리는 "컬럼이 있다"만 본다. 문구가 실제로 갈리는지는
-- 이 SQL + `supabase functions deploy send-push` + 새 앱 번들 셋이 다 있어야 보인다.
--
-- 절차: 앱 설정에서 언어를 English 로 바꾸고 2초 이상 기다린 뒤(PushTokenSync 디바운스),
--       아래로 값이 'en' 인지 확인 → 다른 계정으로 그 글에 좋아요 → 영어 푸시가 오는지 눈으로.
-- ============================================================
-- select token, platform, lang, updated_at from public.push_tokens
--  where user_id = '<내 uid>' order by updated_at desc;
