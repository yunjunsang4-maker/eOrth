-- ============================================================
-- 2026-11-07 · 보안 감사 2건 — ① 수락 없는 메이트 관계 위조 차단 ② 블로그 비공개 메모 서버 정리(선택)
--
-- ① 왜: neighbors_insert_own 의 with check 가 `requester_id = auth.uid()` 와 차단 여부만 봤다.
--       status 를 제한하지 않아 PostgREST 로
--         insert into neighbors (requester_id, addressee_id, status) values (나, 상대, 'accepted')
--       를 바로 넣으면 상대의 수락 없이 are_neighbors(나, 상대) = true 가 됐다.
--       서로이웃은 상대의 '이웃 공개' 기록 열람 권한이다. 상대에게는 알림도 가지 않는다
--       (notify_on_neighbor_request 는 status = 'pending' 일 때만 알린다).
--    무엇: with check 에 `status = 'pending'` 과 `requester_id <> addressee_id` 를 추가한다.
--       앱이 neighbors 에 insert 하는 곳은 src/services/social.ts requestNeighbor 한 곳뿐이고
--       항상 status: 'pending' 이며 자기 자신에겐 신청하지 않는다(uid === targetId 면 return).
--       accepted 전환은 accept_neighbor RPC(security definer — RLS 를 거치지 않음)만 한다.
--    (schema.sql '서로이웃 관계 (양방향·수락제)' 절의 neighbors_insert_own 정의와 동일)
--
-- ② 왜: 블로그 '메모 (비공개) — 나만 볼 수 있는 메모'가 posts.data.memo 로 올라가, posts_select 로
--       이웃에게 data 전체가 내려가면서 이웃의 게시물 상세에 그대로 떴다.
--    앱 수정(이번 OTA): 발행 사본에서 블로그 memo 를 빼고(posts.ts withUploadedMedia), 받은 행에서도
--       뺀다(mapRowToRecord). 작성 기기의 로컬 메모는 mergeServerUpdate 가 지킨다(utils/privateMemo.ts).
--    이 파일 하단 ③ 은 **이미 서버에 올라간 메모를 지우는 선택 실행 블록**이다(기본 주석 처리).
--
-- 호환: ① 서버만 바뀐다. 정상 앱 흐름(pending 신청 → accept_neighbor)은 그대로 통과한다.
--       기존 행에는 영향 없다(with check 는 새 insert 에만 적용) — 이미 위조된 관계는 아래 ②-확인
--       쿼리로 찾아 사람이 판단한다(자동 삭제하지 않는다).
--
-- ⚠️ 운영(blweol…)·테스트(bqwmx…) 양쪽 SQL Editor에서 실행할 것(베타 앱은 테스트 프로젝트를 본다).
--    테스트 정의 사본(test-schema.local.sql)의 neighbors_insert_own 도 같은 내용으로 맞출 것.
-- 재실행 안전(drop policy if exists → create policy).
--
-- 롤백(비권장 — 위조 구멍이 다시 열린다):
--   drop policy if exists "neighbors_insert_own" on public.neighbors;
--   create policy "neighbors_insert_own" on public.neighbors
--     for insert to authenticated with check (
--       requester_id = auth.uid() and not public.is_blocked_between(auth.uid(), addressee_id)
--     );
--
-- 확인:
--   select pg_get_expr(polwithcheck, polrelid) from pg_policy
--    where polname = 'neighbors_insert_own';   -- status = 'pending' · requester_id <> addressee_id 포함
-- ============================================================

-- ① 신청은 pending 으로만, 자기 자신에게는 불가
drop policy if exists "neighbors_insert_own" on public.neighbors;
create policy "neighbors_insert_own" on public.neighbors
  for insert to authenticated with check (
    requester_id = auth.uid()
    and requester_id <> addressee_id
    and status = 'pending'
    and not public.is_blocked_between(auth.uid(), addressee_id)
  );


-- ============================================================
-- ②-확인 · 이미 위조된 관계 찾기 — **실행하지 않는 확인용 쿼리**(필요할 때 주석 해제해 읽기만)
--
-- 근거: 정상 수락은 accept_neighbor 하나뿐이고, 그 함수는 status 를 accepted 로 바꾸면서
--   notifications (user_id = 신청자 requester_id, actor_id = 수락자 addressee_id, type = 'neighbor_accept')
--   를 upsert 한다(uq_notifications_actor_type 로 쌍당 1행). 위조 insert 는 이 알림을 남기지 않는다
--   (notifications 에는 클라이언트 insert 정책이 없다). 그래서 'accepted 인데 짝 알림이 없는 행'이 후보다.
--
-- ⚠️ 알림이 없는 정상 행도 있다 — 후보는 '확정'이 아니다:
--   · 알림 보존 정리 purge_old_notifications(cron 매일, 30일 경과 삭제). 알림 created_at 은 수락 시각이고
--     수락 시각 ≥ neighbors.created_at(신청 시각)이므로, **neighbors.created_at 이 30일 이내인 행은
--     정상이라면 알림이 반드시 남아 있다** → recent_strong = true 행이 강한 후보.
--   · 2026-07-15 팔로우→서로이웃 이관(migration-2026-07-15-neighbors.sql)은 알림 없이 accepted 를 넣었다.
--   · 신청자가 PostgREST 로 자기 알림을 직접 지웠거나(notifications_delete_own),
--     수락자가 RPC 대신 update (status) 로 직접 수락한 경우(앱 경로 아님).
--   · created_at 은 insert 시 클라이언트가 임의 값을 넣을 수 있다 — 작정한 위조자는 30일 이전으로
--     적어 recent_strong 을 피할 수 있으므로 false 행도 버리지 말고 함께 본다.
--
-- select n.requester_id, n.addressee_id, n.created_at,
--        n.created_at > now() - interval '30 days' as recent_strong
--   from public.neighbors n
--  where n.status = 'accepted'
--    and not exists (
--      select 1 from public.notifications x
--       where x.user_id  = n.requester_id
--         and x.actor_id = n.addressee_id
--         and x.type     = 'neighbor_accept'
--    )
--  order by recent_strong desc, n.created_at desc;
--
-- 보조 — 자기 자신과의 관계(이번 정책 전엔 막혀 있지 않았다. 정상 경로로는 생길 수 없다):
-- select requester_id, status, created_at from public.neighbors where requester_id = addressee_id;
--
-- 정리는 행별로 확인한 뒤 수동으로(예: delete from public.neighbors
--   where requester_id = '<uuid>' and addressee_id = '<uuid>' and status = 'accepted';).
--   일괄 삭제하지 말 것 — 위 '알림 없는 정상 행'까지 끊긴다.
-- ============================================================


-- ============================================================
-- ③ 선택 실행 · 기존 서버 행의 블로그 비공개 메모 정리 — 기본은 실행하지 않는다(주석 처리)
--
-- 앱 수정만으로도 타인 화면에는 더 이상 뜨지 않는다(mapRowToRecord 가 받은 쪽에서 지움).
-- 다만 서버 data 에는 남아 있어, 이웃이 PostgREST 로 posts.data 를 직접 읽으면 여전히 보인다.
-- 그것까지 지우려면 아래 블록을 실행한다.
--
-- 판정 기준: 앱 렌더러·stripPrivateMemo 는 data.viewType === 'blog' 로 판정한다. 컬럼 view_type
--   (schema.sql posts: `view_type text -- feed | blog | cut | snap | album`)은 발행 시 같은 값
--   (rec.viewType ?? 'feed')으로 채워지지만 nullable(옛 행)이라, 둘 중 하나라도 blog 면 대상으로 본다.
--
-- ⚠️ 트레이드오프 — 실행하면 각 작성자의 **다른 기기 신규 설치(재설치·기기 변경)에서 메모가 복구되지
--    않는다.** 지금은 앱이 받은 행에서 메모를 버리므로 새 앱에선 어차피 복구되지 않지만, 서버 사본이
--    남아 있으면 나중에 '본인 행에 한해 복원'하는 길이 남는다. 실행하면 그 길이 영구히 닫힌다.
--    (메모를 가진 작성 기기 자체의 로컬 메모는 영향 없다.)
-- ⚠️ 실행 시점 — **새 앱(OTA)이 충분히 퍼진 뒤에.** 이 update 는 updated_at(trg_posts_updated)과
--    동기화 신호(trg_posts_bump_sync_signal)를 건드려, 작성자의 모든 기기가 그 글을 다시 받는다.
--    옛 앱은 mergeServerUpdate 에 블로그 메모 보존이 없어서 그때 **작성 기기의 로컬 메모를 지운다.**
--
-- 1) 실행 전 영향 행 수(값은 보지 않는다):
-- select count(*) as blog_rows_with_memo
--   from public.posts
--  where (view_type = 'blog' or data->>'viewType' = 'blog')
--    and data ? 'memo';
--
-- 2) 정리(재실행 안전 — 두 번째부터 0행):
-- update public.posts
--    set data = data - 'memo'
--  where (view_type = 'blog' or data->>'viewType' = 'blog')
--    and data ? 'memo';
--
-- 3) 확인: 1) 을 다시 돌려 0
-- ============================================================
