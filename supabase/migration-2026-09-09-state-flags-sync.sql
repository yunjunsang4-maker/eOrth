-- ============================================================
-- 2026-09-09 · 기록 부가상태 집합의 기기 간 동기화 (완전 동기화 4단계)
--
-- 단계 번호 정리(문서마다 어긋나지 않게 여기 못 박는다):
--   1단계 `migration-2026-09-08-post-soft-delete.sql`      — 글 수정·삭제의 기기 간 전파
--   2단계 `migration-2026-09-08-tombstone-aggregates.sql`  — 1단계 후속(집계 tombstone 제외 + purge)
--   3단계 `migration-2026-09-08-trip-cards-sync.sql`       — 여행 카드의 기기 간 동기화
--   4단계 이 파일                                          — 부가상태 집합 6종의 기기 간 동기화
--
-- schema.sql 에 이미 반영돼 있다(`4-c-3b) user_state_flags` 절 + 파일 끝 일괄 revoke 목록).
-- 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는 경우용 발췌본이다.
-- 전부 멱등이라 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 부가상태가 동기화되어
--    "아이폰에서 푼 보관이 안드로이드에서 되살아난다" 같은 오판으로 이어진다.
--
-- ⚠️ 배포 순서 강제: 이 SQL 먼저 → 아래 확인 쿼리 → 그 다음에 OTA.
--    다만 앱이 먼저 나가도 **사고는 없다** — 표가 없으면 앱의 함수 4개가 전부 조용히
--    실패(null/false)하고 기존 user_app_state 통째 백업 경로로 그대로 돈다
--    (아래 "표가 없을 때" 절). 그래도 순서를 지키는 편이 진단이 쉽다.
--
-- 전제(확장 등): **없다.** pg_cron 도 필요 없다 — 이번에도 스케줄 잡을 등록하지 않는다.
--   (2단계 델타에서 테스트 프로젝트에 pg_cron 이 없어 3F000 으로 전체 롤백된 사고가 있었다.
--    이 파일은 확장에 의존하지 않으므로 그 함정이 재발하지 않는다.)
-- ============================================================

-- ── 1) 표 ──
-- 왜 새 표인가: user_app_state 는 사용자당 1행 jsonb 통째 upsert(4초 디바운스)라 두 기기가
-- 서로를 덮어쓴다. 한 기기에서 보관을 풀었는데 다른 기기의 백업이 덮어써 되살아나고,
-- 차단이 한쪽에만 남는 증상이 여기서 나왔다. 집합을 행으로 쪼개면 posts·카드와 같은
-- 방식(프로브 → tombstone → 병합)이 그대로 적용된다.
--
-- kind별 의미론(앱 utils/mergeStateFlags.ts 와 문자 그대로 일치해야 한다):
--   archived        | remoteId 우선(미발행은 로컬 id) | ✅ 제거 전파(보관 해제)
--   muted           | handle                          | ✅ 제거 전파(음소거 해제)
--   blocked         | handle (없으면 `name:{표시이름}`)| ✅ 제거 전파(차단 해제) · data에 메타
--   viewedSnap      | remoteId                        | ❌ add-only (500개 트림은 사용자 의도가 아니다)
--   reportedPost    | 신고한 글 id                    | ❌ add-only (신고 취소 경로 없음)
--   reportedComment | 댓글 id                         | ❌ add-only
--
-- ⚠️ blocked 행은 **차단 집행이 아니다.** RLS 집행은 기존 `blocks` 표가 하고 그쪽은 이미
--    기기와 무관하게 동기화된다. 여기 실리는 것은 앱 안 차단 **목록 표시용 메타**뿐이다.
--
-- ⚠️ **deleted_at 은 두 갈래로만 바뀐다.**
--    ① 앱의 일반 upsert 는 이 컬럼을 아예 건드리지 않는다(카드와 같은 규칙). 그래야 앱을 켤
--       때마다 나가는 전량 시드 upsert 가 다른 기기의 끄기를 통째로 되살리는 사고가
--       구조적으로 불가능하다.
--    ② 예외는 **사용자가 방금 명시적으로 다시 켠 항목**뿐이다 — 그 행에만 앱이
--       deleted_at = null 을 실어 부활시킨다(차단 해제 후 재차단 등). 시드·동기화 경로에는
--       그 자격이 없다.
--    즉 "끄기가 켜기를 이기되, 사용자의 재추가는 끄기를 이긴다"가 최종 규칙이다.
create table if not exists public.user_state_flags (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,          -- 'archived'|'muted'|'blocked'|'viewedSnap'|'reportedPost'|'reportedComment'
  item_key   text not null,          -- kind별 키(위 표)
  data       jsonb,                  -- blocked만 사용(name·emoji·handle·id·blockedAt). 나머지는 null
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, kind, item_key)
);

-- 인덱스 추가 없음. 앱의 조회는 ① user_id 전건 프로브(페이지네이션) ② user_id + kind +
-- item_key in(...) 둘뿐이라 PK(user_id, kind, item_key) 의 선두 컬럼으로 전부 커버된다.

-- ── 2) updated_at 자동 갱신 트리거 ──
-- 함수는 기존 공용 것을 그대로 쓴다(신규 정의 없음).
-- 이 표에서 updated_at 은 LWW 판정에 쓰지 않지만(존재/표식만 본다), 이웃 표들과 규격을
-- 맞춰 두어야 나중에 "언제 바뀐 행인가"를 서버에서 볼 수 있고 purge 기준도 잡을 수 있다.
drop trigger if exists trg_user_state_flags_updated on public.user_state_flags;
create trigger trg_user_state_flags_updated before update on public.user_state_flags
  for each row execute function public.set_updated_at();

-- ── 3) RLS ──
-- user_trip_cards·user_app_state 와 같은 all_own 패턴. 본인 행만 읽고 쓴다.
alter table public.user_state_flags enable row level security;

drop policy if exists "user_state_flags_all_own" on public.user_state_flags;
create policy "user_state_flags_all_own" on public.user_state_flags
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4) 위험 권한 회수 ──
-- schema.sql 끝의 일괄 revoke 목록에 이 표를 추가했다. 발췌 실행 시에도 맞추려면 이 한 줄.
-- ⚠️ 여기서 `revoke update` 로 컬럼 권한을 좁히지 말 것 — posts 에서 실제로 밟은 함정으로,
--    컬럼 권한이 없으면 RLS 를 통과해도 tombstone 이 permission denied 로 조용히 실패한다.
revoke truncate, references, trigger on public.user_state_flags from anon, authenticated;


-- ============================================================
-- 반영 확인 — 위 4개를 실행한 뒤 이 블록을 돌려 결과를 확인한다
-- ============================================================
-- 1번: 6개 컬럼(user_id, kind, item_key, data, updated_at, deleted_at)이 나와야 한다.
--      data 는 is_nullable='YES' 여야 한다(blocked 외 kind 는 null 로 넣는다)
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='user_state_flags'
 order by ordinal_position;

-- 2번: PK 가 (user_id, kind, item_key) 세 컬럼이어야 한다 — 3행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_state_flags'::regclass and i.indisprimary;

-- 3번: 정의문에 `BEFORE UPDATE` 와 set_updated_at 이 보여야 한다 — 1행
--      (information_schema.triggers 가 아니라 pg_get_triggerdef 를 쓰는 이유:
--       전자는 UPDATE OF 컬럼 목록을 보여주지 않아 "있는데 다르게 걸린" 트리거를 못 잡는다)
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_user_state_flags_updated' and not tgisinternal;

-- 4번: RLS 켜짐(t) — 1행
select relrowsecurity from pg_class where oid = 'public.user_state_flags'::regclass;

-- 5번: 정책 1행. cmd='ALL', qual/with_check 둘 다 auth.uid() 비교여야 한다
select policyname, cmd, qual, with_check from pg_policies
 where tablename='user_state_flags';

-- ⚠️ 위 5개는 "객체가 있다"만 본다. 실제로 도는지는 앱 계정(authenticated) 세션으로
--    행 1개를 upsert → 프로브에 뜨는지 → tombstone 이 통과하는지까지 봐야 확정된다
--    (posts 의 컬럼 권한 함정이 정확히 "객체는 있는데 안 도는" 사례였다).


-- ============================================================
-- 표가 없을 때(= 이 SQL 을 아직 안 돌렸을 때) 앱은 어떻게 되는가 — 하위 호환 계약
--
--   probeStateFlags()     → null   → 부가상태 pull 이 통째로 건너뛰어진다
--   fetchStateFlags()     → []     → 받아올 메타 없음
--   upsertStateFlags()    → false  → 지문을 안 심고 다음 변경 때 재시도
--   tombstoneStateFlags() → false  → 재시도 대상으로 남는다
--   clearStateFlags()     → false  → 데이터 초기화가 이 표를 못 지운다(표가 없으니 지울 것도 없다)
--
-- 네 함수 모두 조용히 실패하고 **기존 user_app_state 통째 백업(legacy)이 그대로 돈다.**
-- 즉 집합 동기화만 꺼지고 앱은 이전과 똑같이 동작한다.
-- ============================================================


-- ============================================================
-- (선택·미등록) tombstone 정리 — 이번에도 cron 에 등록하지 않는다
--
-- 표식 행은 대체로 가볍다(앱이 표식을 찍을 때 data 를 null 로 비운다). ⚠️ 다만 그 키를 아직
-- 로컬에 들고 있는 기기의 시드 upsert 가 data 만 다시 채울 수 있다 — 행은 계속 꺼진 상태라
-- 기능상 무해하지만 "본문이 항상 null"은 아니다. 반대로 주기를 짧게 잡으면 그보다
-- 오래 잠들어 있던 기기가 표식을 놓쳐 **보관 해제·차단 해제가 그 기기에서만 안 먹는다.**
-- 필요해지면 posts·카드와 같은 30일 기준으로:
--
-- delete from public.user_state_flags
--  where deleted_at is not null and deleted_at < now() - interval '30 days';
-- ============================================================
