-- ============================================================
-- 2026-09-08 · 여행 카드의 기기 간 동기화 (완전 동기화 3단계)
--
-- 단계 번호 정리(문서마다 어긋나지 않게 여기 못 박는다):
--   1단계 `migration-2026-09-08-post-soft-delete.sql`      — 글 수정·삭제의 기기 간 전파
--   2단계 `migration-2026-09-08-tombstone-aggregates.sql`  — 1단계 후속(집계 tombstone 제외 + purge)
--   3단계 이 파일                                          — 여행 카드의 기기 간 동기화
--
-- schema.sql 에 이미 반영돼 있다. 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는 경우용
-- 발췌본이다. 전부 멱등이라 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 카드가 동기화되어
--    "안드로이드는 되는데 아이폰은 안 된다" 같은 오판으로 이어진다.
--
-- ⚠️ 배포 순서 강제: 이 SQL 먼저 → 아래 확인 쿼리 → 그 다음에 OTA.
--    다만 앱이 먼저 나가도 **사고는 없다** — 표가 없으면 앱의 카드 동기화 함수 4개가
--    전부 조용히 실패(null/false)하고 기존 user_trip_state 백업·복원 경로로 그대로 돈다
--    (아래 "표가 없을 때" 절). 그래도 순서를 지키는 편이 진단이 쉽다.
--
-- 전제(확장 등): **없다.** pg_cron 도 필요 없다 — 이번엔 스케줄 잡을 등록하지 않는다.
--   (직전 델타에서 테스트 프로젝트에 pg_cron 이 없어 3F000 으로 전체 롤백된 사고가 있었다.
--    이 파일은 확장에 의존하지 않으므로 그 함정이 재발하지 않는다.)
-- ============================================================

-- ── 1) 표 ──
-- 왜 새 표인가: user_trip_state 는 사용자당 1행에 카드 전체를 jsonb 로 통째 넣는다.
-- 두 기기가 같이 쓰면 나중에 쓴 쪽이 상대의 카드를 통째로 덮어쓰고(LWW), 복원은
-- "로컬 카드가 비어 있을 때만" 돈다. 그래서 동기화로 들어온 글이 소스 기기의 진짜 카드가
-- 아니라 이 기기의 날짜 규칙으로 새로 만든 카드에 붙었다. 행으로 쪼개면 posts 와 같은
-- 방식(프로브 → tombstone → updated_at LWW + 병합)이 그대로 적용된다.
--
-- card_id 는 **클라이언트가 만든 id**(`grp-{ms}-{random4}`)다. 기기 간 우연 충돌이 사실상
-- 없어 서버가 id 를 새로 발급할 필요가 없고, 그래서 같은 카드가 두 기기에서 같은 행이 된다.
--
-- deleted_at 은 처음부터 있다 — 행이 그냥 사라지면 클라이언트가 "사용자가 카드를 지웠다"와
-- "이번 조회가 부분 실패했다"를 구분할 수 없다. 앱의 확립된 불변식:
-- **"서버 목록에 없음"은 절대 삭제 근거가 아니다.**
create table if not exists public.user_trip_cards (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  card_id    text not null,          -- 클라이언트 생성 id (grp-{ts}-{rand4}) — 기기 간 충돌 없음
  data       jsonb not null,         -- TripGroup 직렬화 (records 는 remoteId 우선 변환본)
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, card_id)
);

-- 인덱스 추가 없음. 앱의 조회는 ① user_id 전건 프로브 ② user_id + card_id in(...) 둘뿐이라
-- PK(user_id, card_id) 의 선두 컬럼으로 전부 커버된다.

-- ── 2) updated_at 자동 갱신 트리거 ──
-- 이 표의 LWW 판정 기준이 updated_at 이다. 트리거가 없으면 upsert 가 update 로 떨어질 때
-- 값이 그대로 남아 **수정이 영영 전파되지 않는다**(default now() 는 insert 에만 적용된다).
-- 함수는 기존 공용 것을 그대로 쓴다(신규 정의 없음).
drop trigger if exists trg_user_trip_cards_updated on public.user_trip_cards;
create trigger trg_user_trip_cards_updated before update on public.user_trip_cards
  for each row execute function public.set_updated_at();

-- ── 3) RLS ──
-- user_trip_state·user_app_state 와 같은 all_own 패턴. 본인 행만 읽고 쓴다.
alter table public.user_trip_cards enable row level security;

drop policy if exists "user_trip_cards_all_own" on public.user_trip_cards;
create policy "user_trip_cards_all_own" on public.user_trip_cards
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4) 위험 권한 회수 ──
-- schema.sql 끝의 일괄 revoke 목록에 이 표를 추가했다. 발췌 실행 시에도 맞추려면 이 한 줄.
-- ⚠️ 여기서 `revoke update` 로 컬럼 권한을 좁히지 말 것 — posts 에서 실제로 밟은 함정으로,
--    컬럼 권한이 없으면 RLS 를 통과해도 tombstone 이 permission denied 로 조용히 실패한다.
--    이 표는 행 전체가 본인 소유의 백업이라 컬럼을 좁힐 이유 자체가 없다.
revoke truncate, references, trigger on public.user_trip_cards from anon, authenticated;


-- ============================================================
-- 반영 확인 — 위 4개를 실행한 뒤 이 블록을 돌려 결과를 확인한다
-- ============================================================
-- 1번: 5개 컬럼(user_id, card_id, data, updated_at, deleted_at)이 나와야 한다
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='user_trip_cards'
 order by ordinal_position;

-- 2번: PK 가 (user_id, card_id) 두 컬럼이어야 한다 — 2행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_trip_cards'::regclass and i.indisprimary;

-- 3번: 정의문에 `BEFORE UPDATE` 와 set_updated_at 이 보여야 한다 — 1행
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_user_trip_cards_updated' and not tgisinternal;

-- 4번: RLS 켜짐(t) — 1행
select relrowsecurity from pg_class where oid = 'public.user_trip_cards'::regclass;

-- 5번: 정책 1행. cmd='ALL', qual/with_check 둘 다 auth.uid() 비교여야 한다
select policyname, cmd, qual, with_check from pg_policies
 where tablename='user_trip_cards';


-- ============================================================
-- 표가 없을 때(= 이 SQL 을 아직 안 돌렸을 때) 앱은 어떻게 되는가 — 하위 호환 계약
--
--   probeTripCards()   → null   → 카드 pull 이 통째로 건너뛰어진다
--   fetchTripCards()   → []     → 받아올 카드 없음
--   upsertTripCards()  → null   → 기준선을 안 심고 다음 변경 때 재시도
--   tombstoneTripCards() → false → 재시도 대상으로 남는다
--
-- 네 함수 모두 조용히 실패하고 **기존 user_trip_state 백업·복원(legacy dual-write)이
-- 그대로 돈다.** 즉 카드 동기화만 꺼지고 앱은 이전과 똑같이 동작한다.
-- ============================================================


-- ============================================================
-- (선택·미등록) tombstone 정리 — 이번에는 cron 에 등록하지 않는다
--
-- 사용자당 카드가 수십 개 규모라 표식 행이 쌓여도 무게가 없다(본문 data 는 삭제 시 {} 로
-- 비운다). 반대로 주기를 짧게 잡으면 그보다 오래 잠들어 있던 기기가 표식을 놓쳐
-- **지운 카드가 그 기기에 영구히 남는다.** 필요해지면 posts purge 와 같은 30일 기준으로:
--
-- delete from public.user_trip_cards
--  where deleted_at is not null and deleted_at < now() - interval '30 days';
-- ============================================================
