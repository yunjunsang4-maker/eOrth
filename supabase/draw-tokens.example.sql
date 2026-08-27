-- 부스 뽑기 토큰 설정 — 템플릿
--
-- ⚠️ 이 파일을 직접 고치지 말 것. 아래처럼 복사해서 쓴다.
--
--     supabase/draw-tokens.example.sql  →  supabase/draw-tokens.local.sql
--
--    `*.local.sql`은 .gitignore에 있어 커밋되지 않는다. 이 저장소는 공개라
--    실제 토큰이 커밋되는 순간 링크를 아는 누구나 소스에서 꺼내 재고를 뽑아갈 수 있다.
--    그래서 schema.sql에는 CHANGE-ME placeholder만 두고, 실제 값은 여기서만 넣는다.
--    (scripts/draw-schema.verify.mjs가 schema.sql에 placeholder가 남아 있는지 지킨다.)
--
-- 실행 순서:
--   1. supabase/schema.sql 의 "부스 뽑기 서버 재고" 절을 먼저 실행한다.
--      (draw_config 표가 만들어지고 placeholder 3줄이 들어간다)
--   2. 이 파일을 복사해 토큰을 채우고, Supabase 대시보드 > SQL Editor에 붙여넣어 실행한다.
--   3. 맨 아래 확인 쿼리로 값이 바뀌었는지 본다.
--
-- ⚠️ insert 가 아니라 update 여야 한다. schema.sql의 insert는 `on conflict do nothing`
--    이라 다시 넣어도 값이 바뀌지 않는다 — 여기서 insert를 쓰면 아무 일도 일어나지 않고
--    화면에도 오류가 안 뜬다. 그리고 부스에서는 "토큰이 맞지 않습니다"로만 보인다.

-- ── 토큰 만들기 ──────────────────────────────────────────────
-- 16자 이상 무작위 문자열 두 개. 서로 달라야 한다(같으면 _draw_auth가 거부한다 —
-- 같으면 아이패드가 곧 관리자이기 때문이다).
--
-- 만드는 법 예시:
--   Windows PowerShell : -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | % {[char]$_})
--   macOS/Linux        : openssl rand -base64 24 | tr -d '/+=' | cut -c1-24
--
-- 아이패드 스태프가 손으로 입력하므로, 헷갈리는 글자(O/0, l/I/1)는 빼는 편이 낫다.

update public.draw_config
   set value = 'PUT-KIOSK-TOKEN-HERE'      -- ← 아이패드 A·B에 입력할 값
 where key = 'kiosk_token';

update public.draw_config
   set value = 'PUT-ADMIN-TOKEN-HERE'      -- ← 노트북에만 입력할 값
 where key = 'admin_token';

-- ── 확인 ────────────────────────────────────────────────────
-- 토큰 자체는 찍지 않는다(SQL Editor 결과가 화면에 남고 스크린샷에도 찍힌다).
-- 길이와 앞 3글자만 보고, placeholder가 남아 있지 않은지만 확인한다.
select key,
       length(value)                       as len,
       left(value, 3) || '…'               as head,
       (value like 'CHANGE-ME%'
        or value like 'PUT-%-TOKEN-HERE')  as still_placeholder
  from public.draw_config
 where key in ('kiosk_token', 'admin_token')
 order by key;

-- 위 결과에서 still_placeholder 가 둘 다 false 여야 한다.
-- 하나라도 true면 그 토큰은 반영되지 않은 것이고, 그 상태에서는 _draw_auth가
-- 모든 호출을 거부한다(발권도 관리도 안 된다).

-- 두 값이 같은지도 본다. true가 나오면 둘 중 하나를 다시 바꿔야 한다.
select (select value from public.draw_config where key = 'kiosk_token')
     = (select value from public.draw_config where key = 'admin_token') as tokens_identical;

-- ── 행사 뒤 ─────────────────────────────────────────────────
-- 토큰을 폐기하려면 placeholder로 되돌린다. 그러면 모든 RPC가 즉시 거부한다.
--
--   update public.draw_config set value = 'CHANGE-ME-KIOSK' where key = 'kiosk_token';
--   update public.draw_config set value = 'CHANGE-ME-ADMIN' where key = 'admin_token';
--   update public.draw_config set value = ''                where key = 'active_day';
