# 서버 반영 상태 (Supabase)

이 저장소의 SQL·Edge Function 중 **무엇을 실행해야 하고, 무엇이 이미 됐고, 무엇을 절대 실행하면 안 되는지**를 한 장에 모은 문서다.
파일별 상세 사유는 각 파일 헤더 주석에 있다 — 여기서는 상태와 순서만 다룬다.

- 프로젝트 ref: `blweolnunmsxgztmvzfd`
- 적용 경로: Supabase 대시보드 > SQL Editor (SQL) / `supabase functions deploy <name>` (Edge Function)

> ✅ **2026-08-27 반영 완료 — 부스 뽑기 서버 재고.**
> `schema.sql` 끝의 "부스 뽑기 서버 재고" 절(표 4개 `draw_stock`·`draw_lease_hold`·`draw_log`·
> `draw_config`, RPC 12개)을 **실행했고, 토큰도 실제 값으로 넣었다.**
>
> **실측 근거**(anon 키로 운영 프로젝트에 직접 RPC 호출):
>
> | 호출 | 결과 | 뜻 |
> |---|---|---|
> | `draw_state(올바른 kiosk 토큰)` | `{"ok":true,"open":false}` | RPC 존재 + 토큰 반영됨 |
> | `draw_state(틀린 토큰)` | `{"ok":false,"error":"auth"}` | `_draw_auth`가 실제로 막고 있음 |
> | `draw_admin_state(admin 토큰)` | `{"ok":true,"day":""}` | 관리 토큰도 반영됨 |
>
> 토큰 자체는 저장소에 없다 — `supabase/draw-tokens.local.sql`(`.gitignore`로 차단)에만 있다.
> 토큰을 바꾸려면 `insert`가 아니라 **`update`**여야 한다(`on conflict do nothing`이라 다시 넣어도
> 값이 안 바뀌고 오류도 안 난다). 절차는 `supabase/draw-tokens.example.sql`.
>
> ⚠️ **`active_day`가 지금 비어 있다(`open:false`) — 발권이 안 되는 상태가 정상이다.**
> 행사 당일 노트북 `draw-admin.html`에서 날짜를 열어야 아이패드가 발권을 시작한다.
>
> ⚠️ **`draw_admin_open`은 `on conflict do nothing`이다.** 테스트로 D1을 이미 열었다면 그 행이
> 남아 있어, 행사 당일 D1을 다시 열어도 **초기 수량으로 되돌아가지 않는다.** 행사 전에 확인할 것:
>
> ```sql
> select day, remaining, updated_at from public.draw_stock order by day;
> ```
>
> 수량이 `DAY_POOLS`(`docs/draw-core.js`)와 다르면 관리 콘솔의 되돌리기나
> `draw_admin_set(토큰, 등급, 수량)`으로 맞춘다.
>
> 행사 종료 후 `event_participants`와 함께 파기한다(일회성 표).
> 토큰 폐기는 `draw-tokens.example.sql` 맨 아래 되돌리기 문장.
>
> **2026-08-02 기준 서버 반영은 모두 끝났다.** 아래는 그 근거와, 앞으로 무엇을 건드리면 안 되는지의 기록이다.
>
> - **Edge Function 배포 = 실측.** `supabase functions list` 로 서버에서 직접 받은 값. 4개 전량 최신.
> - **`schema.sql` 실행 = 실측.** 각 라운드에서 '그때 처음 생긴 것'의 존재로 확인했다
>   (2026-08-01 `safe_to_date` 함수 / 2026-08-02 `dm_push_sent` 테이블).
> - **출시 전 감사 수정분 = 실측.** 컬럼 권한·스토리지 정책을 SQL Editor 조회로 직접 확인(아래 2번 표).
> - **개별 항목 실행일 = 작업 기록 기반.** "이미 된 것" 표의 **날짜**는 서버에서 확인한 값이 아니다.
>   다만 `schema.sql` 이 멱등이고 최신 상태로 실행됐으므로, 항목 자체는 모두 반영돼 있다.
>
> 새로 실행·배포했으면 날짜와 함께 이 문서를 갱신한다.
>
> ✅ **2026-08-13 실측 갱신.** anon 키 PostgREST 프로브(아래 "A" 방법)로 **운영·테스트 두 프로젝트를
> 직접 조회**해 아래 상태를 확인했다. 두 프로젝트 상태는 **동일**하다.
> 그 전까지 이 문서가 ⏳(미반영)로 적어 두었던 **매칭 프라이버시 하드닝·`event_participants`는
> 실제로는 이미 반영돼 있었다** — 문서가 뒤처져 있던 것이다. 아래 표로 정정한다.
>
> | 확인 대상 | 실측 |
> |---|---|
> | `profiles.onboarded_at` | ✅ 있음 |
> | `profiles.birthday` · `profiles.gender` | ⚠️ **아직 있음**(= 1차만 실행된 정상 상태) |
> | `profiles.mate_reco_optin` | ✅ 있음 |
> | `rpc_probe_guard` 표 | ✅ 있음 |
> | `k_anon_min()` / `set_mate_reco_optin(boolean)` | ✅ 있음 (200 / 204) |
> | `event_participants` 표 | ✅ 있음 |
> | 기반영분 `mate_suggestions_cache`·`dm_push_sent`·`safe_to_date` | ✅ 있음 |
> | 대조군(없는 표·함수) | ✅ 404 — 조회 자체는 정상 |
>
> **`birthday`·`gender`가 남아 있는데 `onboarded_at`이 있다**는 건, 재실행이 문서 지시대로
> `drop column` 두 줄(schema.sql 61~62행)을 주석 처리한 **1차 절차로 수행됐다**는 증거다.
>
> ⚠️ 이 프로브는 **표·컬럼·함수의 존재만** 본다. **인덱스·컬럼 단위 grant·트리거·pg_cron·
> Edge Function 배포는 볼 수 없다** — 그것들은 아래 "B"와 `functions list`로 따로 확인해야 하며,
> 이번 갱신에서 실측되지 않았다.
>
> ⚠️ **2026-08-07 정정.** 위 "모두 끝났다"에는 예외가 있었다 — pg_cron 3종은 등록만 됐고
> 실행은 이틀간 전부 401 로 실패해 왔다(같은 날 해소, 1번 절).
> **"객체가 존재한다"와 "실제로 동작한다"는 다르다.**
> 이 문서의 ✅ 는 대부분 전자만 확인한 값이니, 스케줄러·Edge Function 처럼 *돌아야* 의미가 있는
> 항목은 반드시 **실행 결과**(`net._http_response` 등)까지 보고 표시할 것.

---

## 1. 지금 해야 하는 것 — 7건 (2026-08-13 실측 기준 3건 + 2026-09-08 추가 2건 + 2026-09-09 추가 1건 + 2026-09-11 추가 1건)

**남은 것은 아래 셋 + 2026-09-08 델타 둘이다.** ①`birthday`·`gender` **2차 drop**(심사 통과 후 — 아래),
②`cron-setup.sql`의 **`purge-probe-guard`** 잡 등록(미실측), ③`delete-account` 재배포 +
`PURGE_SECRET`(1-1절 — 폴백으로 동작 중이라 급하지 않음).
그 외 이 절에 ⏳로 적혀 있던 SQL은 **2026-08-13 실측으로 반영 확인**돼 ✅로 바꿨다.

**2026-09-08 삭제 전파 1차(tombstone 도입)는 같은 날 실행·확인 완료됐다 — 바로 아래 ✅.**
**그 후속(집계 함수 5개 + purge cron)도 2026-09-08 운영·테스트 양쪽 실행·확인 완료 — 그 아래 절.**
**같은 날의 ⏳ 미반영 2건이 바로 아래에 있다 — ①사용자 간 전파(수락 알림 정리 + 공개 전환 알림),
②여행 카드 기기 간 동기화(`user_trip_cards` 신규 표).**
**2026-09-09 추가 ⏳ 1건 — ③댓글 @언급 알림(`mention` 타입 + `notify_on_mention` 트리거).
이건 `send-push` 재배포도 함께 필요하다.**
**2026-09-11 추가 ⏳ 1건 — ④기기 간 동기화의 실시간 트리거(`user_sync_signals` 신규 표 +
`bump_sync_signal` 트리거 3개 + **publication 등재**). 완전 동기화 5단계이고, 앞선 1~4단계와 달리
이번엔 publication 등재를 빠뜨리면 나머지가 다 맞아도 조용히 아무 일도 일어나지 않는다.**

### ⏳ 미반영(실행 대기) — 사용자 간 전파: 수락 시 신청 알림 정리 + 공개 전환 시 이웃 알림 (2026-09-08 추가)

> **2026-09-09 부분 확인 — 한 프로젝트(어느 쪽인지 사용자 확인 대기)에서 확인 쿼리 2번(가드 true/true)·
> 3번(트리거 2개) 통과. 1번(`accept_neighbor` has_cleanup)과 다른 쪽 프로젝트, "새 글 → 이웃 알림 도착"
> 눈 확인은 미완.** 앱 쪽 변경은 이 SQL에 런타임 의존이 없어 같은 날 OTA 4회(베타·정식 × RV 1.1.1/1.1.0)를
> 먼저 발행했다 — 수락 시 신청 알림 정리·공개 전환 이웃 알림 2건만 서버 반영 후 동작한다. 발췌본:
> `supabase/migration-2026-09-08-cross-user-visibility.sql` (schema.sql과 동일 내용).
>
> ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 증상이 사라져 오판하게 된다.
>
> ⚠️ **앱 배포 순서 제약 없음.** 구 번들과 완전히 호환된다 — 반환 계약이 그대로고,
> 없어지는 것은 유령 알림뿐이며 새로 생기는 것은 알림 1건이다. 같은 날의 앱 변경
> (피드 카드 댓글 수·포커스 재조회·알림 UPDATE 구독)은 이 SQL과 독립으로 동작한다.

무엇을 고치나 — 둘 다 "내가 한 일이 상대 화면에 안 나타난다" 계열이다:

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `accept_neighbor` 안에 `delete from public.notifications … type='neighbor_request'` 추가 (수락 알림 insert 전) | 4-e 절 `create or replace function public.accept_neighbor` | 메이트 신청을 **수락해도 신청 알림이 남는다.** 수락은 행 UPDATE라 `trg_cleanup_neighbor_request_notif`(**after delete**)가 안 뜬다 → 눌러도 수락 목록이 비어 있는 유령 알림 |
| 2 | `notify_on_friend_post`에 `tg_op='UPDATE'` 가드(`private → 그 외` 전환만 통과)와 `new.deleted_at is not null` 제외 추가 | 10-e 절 | 비공개로 올린 뒤 공개로 바꾼 글이 **이웃 누구에게도 알려지지 않는다** |
| 3 | 새 트리거 `trg_notify_friend_post_visibility after update of visibility on public.posts` | 10-e 절, `trg_notify_friend_post` 바로 아래 | 2번 함수를 고쳐도 UPDATE 자체가 트리거를 안 태워 아무 일도 일어나지 않는다 |

⚠️ **기존 insert 트리거 `trg_notify_friend_post`는 지우지 말 것.** 새 트리거는 **추가**다.
UPDATE 트리거만 남기면 평범한 새 글 알림이 통째로 죽는다.

⚠️ **`of visibility` 컬럼 한정을 빼지 말 것.** 빼면 좋아요·댓글 카운터 갱신 등 `posts`의
모든 UPDATE마다 이 함수가 호출된다(대부분 `tg_op` 가드에서 즉시 return 하지만 태울 이유가 없다).

반영 확인 쿼리:
```sql
-- 1번 (has_cleanup 이 true 여야 한다)
select p.proname,
       pg_get_functiondef(p.oid) like '%delete from public.notifications%neighbor_request%' as has_cleanup
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'accept_neighbor';

-- 2번 (두 컬럼 모두 true 여야 한다)
select p.proname,
       pg_get_functiondef(p.oid) like '%tg_op = ''UPDATE''%'         as has_update_guard,
       pg_get_functiondef(p.oid) like '%new.deleted_at is not null%' as has_tombstone_guard
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'notify_on_friend_post';

-- 3번 (2행 — insert 1 + update of visibility 1)
--    information_schema.triggers 는 `UPDATE OF <컬럼>` 의 컬럼 목록을 노출하지 않아
--    정의문을 직접 읽는다(tombstone 델타와 같은 이유).
select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgrelid = 'public.posts'::regclass and not tgisinternal
   and tgname in ('trg_notify_friend_post', 'trg_notify_friend_post_visibility')
 order by tgname;
-- 기대: trg_notify_friend_post … AFTER INSERT …
--       trg_notify_friend_post_visibility … AFTER UPDATE OF visibility …
```

⚠️ **확인 쿼리만으로는 부족하다 — 반영 후 새 글 1건을 올려 이웃에게 `friend_post` 알림이 실제로
도착하는지 눈으로 확인할 것.** `notify_on_friend_post` 끝에는 `exception when others then
return null`이 있어 함수 안에서 어떤 오류가 나도 **조용히 삼켜진다**(게시 자체는 성공한다).
위 `pg_get_functiondef` 검사는 정의문이 들어갔는지만 보므로 이 증상을 잡지 못한다.

### ✅ 여행 카드 기기 간 동기화: `user_trip_cards` 신규 표 (2026-09-08 추가 · **2026-09-09 운영·테스트 양쪽 실행·확인 완료**)

> 확인 쿼리 실측(사용자 실행): 컬럼 5·PK(user_id,card_id)·set_updated_at 트리거·RLS all_own 전부 정상. 발췌본:
> `supabase/migration-2026-09-08-trip-cards-sync.sql` (schema.sql과 동일 내용).
>
> ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 카드가 동기화된다.
>
> ⚠️ **전제(확장 등) 없다.** pg_cron 도 필요 없다 — 이번엔 스케줄 잡을 등록하지 않는다
> (직전 델타에서 테스트 프로젝트에 pg_cron 이 없어 3F000 으로 전체 롤백된 사고가 있었다).

**왜 필요한가.** 글은 이제 기기 간 추가·수정·삭제가 전파되는데, **여행 카드는 아니었다.**
기존 `user_trip_state`는 사용자당 1행 jsonb 통째 upsert라 두 기기가 서로의 카드를 덮어썼고
(last-write-wins), 복원은 "로컬 카드가 비어 있을 때만" 돌았다. 그래서 동기화로 들어온 글이
**소스 기기의 진짜 카드**(제목·커버·체류 정보)가 아니라 이 기기의 날짜 규칙으로 새로 만들어진
카드에 붙었다. 카드를 행 단위 표로 올려 posts와 같은 방식(프로브 → tombstone →
`updated_at` 기준 LWW + 병합)을 적용한다. 앱 쪽 대응은 `src/services/tripState.ts`·
`src/utils/mergeTripCards.ts`·`src/store/recordStore.tsx`.

실행할 것 — 전부 `schema.sql`에 반영돼 있고 재실행 안전(멱등):

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `create table if not exists public.user_trip_cards (user_id, card_id, data, updated_at, deleted_at)` — PK `(user_id, card_id)` | 4-c-2b 절(`user_trip_state` 바로 아래) | 앱의 카드 동기화 함수 4개가 전부 조용히 실패 → **기능만 꺼지고 앱은 정상**(아래 하위 호환 절) |
| 2 | `trg_user_trip_cards_updated before update … set_updated_at()` | 같은 절 | **수정이 영영 전파되지 않는다.** `default now()`는 insert에만 걸려, upsert가 update로 떨어지면 `updated_at`이 그대로 남아 상대 기기가 stale로 판정하지 못한다 |
| 3 | RLS 활성화 + `user_trip_cards_all_own` 정책(`user_id = auth.uid()`, using·with check 양쪽) | 같은 절 | 남의 카드가 보이거나(정책 없이 RLS만 켜면) 내 카드도 안 보인다 |
| 4 | 파일 끝 일괄 `revoke truncate, references, trigger` 목록에 `public.user_trip_cards` 추가 | 파일 하단 revoke 블록 | 이웃 표들과 권한 기준이 어긋난다(즉시 증상은 없다) |

⚠️ **컬럼 수준 `grant update`를 걸지 말 것.** posts는 작성자가 바꿔도 되는 컬럼을 좁히려고
컬럼 단위로 회수·재부여했지만, 이 표는 **행 전체가 본인 소유의 백업**이라 좁힐 대상이 없다.
섣불리 `revoke update`를 걸면 컬럼 권한이 없어 tombstone이 `permission denied`로 **조용히**
실패한다 — posts에서 실제로 밟은 함정이다(이웃 표 `user_trip_state`·`user_app_state`도 안 건다).

⚠️ **인덱스를 따로 만들지 않았다.** 앱의 조회는 ①`user_id` 전건 프로브 ②`user_id` + `card_id in(...)`
둘뿐이고 PK 선두 컬럼으로 전부 커버된다.

**하위 호환 — 이 SQL 전에 앱이 먼저 나가도 사고는 없다.**
표가 없으면 `probeTripCards()`→`null` / `fetchTripCards()`→`[]` / `upsertTripCards()`→`null` /
`tombstoneTripCards()`→`false`로 전부 조용히 실패하고, 기존 `user_trip_state` 백업·복원
(dual-write)이 그대로 돈다. 즉 **카드 동기화만 꺼진다.** 그래도 순서(SQL → 확인 → OTA)를
지키는 편이 "카드가 안 넘어와요" 진단이 쉽다.

**tombstone 정리(purge)는 등록하지 않았다** — `schema.sql`·델타에 주석으로만 있다.
사용자당 카드가 수십 개 규모라 표식 행이 쌓여도 무게가 없고(본문 `data`는 삭제 시 `{}`로
비운다), 반대로 주기를 짧게 잡으면 그보다 오래 잠들어 있던 기기가 표식을 놓쳐
**지운 카드가 그 기기에 영구히 남는다.**

반영 확인 쿼리:
```sql
-- 1번: 5개 컬럼(user_id, card_id, data, updated_at, deleted_at)
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='user_trip_cards' order by ordinal_position;

-- 2번: PK 가 (user_id, card_id) 두 컬럼 — 2행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_trip_cards'::regclass and i.indisprimary;

-- 3번: 정의문에 BEFORE UPDATE + set_updated_at — 1행
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_user_trip_cards_updated' and not tgisinternal;

-- 4번: RLS 켜짐(t)
select relrowsecurity from pg_class where oid = 'public.user_trip_cards'::regclass;

-- 5번: 정책 1행, cmd='ALL', qual/with_check 둘 다 auth.uid() 비교
select policyname, cmd, qual, with_check from pg_policies where tablename='user_trip_cards';
```

⚠️ **확인 쿼리는 "객체가 있다"만 본다.** 실제로 도는지는 앱 계정(authenticated) 세션으로
카드 1장을 upsert → 프로브에 뜨는지 → tombstone이 통과하는지까지 봐야 확정된다
(posts의 컬럼 권한 함정이 정확히 "객체는 있는데 안 도는" 사례였다).

### ⏳ 미반영(실행 대기) — 댓글 @언급 알림: `mention` 타입 + `notify_on_mention` 트리거 (2026-09-09 추가)

> **아직 아무 프로젝트에도 실행하지 않았다.** 발췌본:
> `supabase/migration-2026-09-09-comment-mentions.sql` (schema.sql과 동일 내용).
>
> ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 알림이 와 "됐다"고 오판한다.
>
> ⚠️ **`supabase functions deploy send-push` 재배포가 함께 필요하다.** Edge Function의
> `PREF_KEY`에 `mention`이 없으면 `isPushAllowed`가 "알 수 없는 타입"으로 보고 스킵해,
> **앱 알림함에는 뜨는데 푸시만 영영 안 온다.** 코드는 커밋돼 있고 배포만 남았다.
>
> ⚠️ **전제(확장 등) 없다.** pg_cron도 필요 없다.
>
> ⚠️ **앱 배포 순서 제약 없음 — 미반영이어도 앱은 멀쩡하다.** 댓글 본문의 `@아이디` 보라 네온
> 표시·프로필 이동, `@` 자동완성 칩, 답글 `@아이디 ` 자동 삽입은 전부 클라이언트 로직이라
> 그대로 동작한다. **못 하는 것은 언급 알림 발송 하나뿐이다.** 반대로 SQL이 먼저 들어가도
> 구 번들은 모르는 알림 타입을 `TYPE_MAP` 폴백으로 흘려보내 사고가 없다.

**왜 필요한가.** 댓글에 `@아이디`를 적어도 그 사람은 아무것도 모른다. 저장 방식은 A안이라
`comments`에 컬럼을 늘리지 않고 본문 텍스트만 신뢰한다 — 클라이언트가 보낸 '언급 대상 목록'을
받으면 앱이 임의의 사용자 id를 끼워 넣어 스팸 알림을 만들 수 있어, **서버가 본문을 다시 파싱**한다.
앱 쪽 짝은 `src/utils/mentions.ts`(`MENTION_HANDLE_RE`)다.

실행할 것 — 전부 `schema.sql`에 반영돼 있고 재실행 안전(멱등):

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `notifications_type_check`에 `'mention'` 추가 (**두 정의 모두** — 초기 정의와 10-b 재정의) | ~1853행, 10-b 절 | 트리거의 insert가 23514(check 위반)로 실패하는데 함수 끝 `exception when others`가 그걸 삼켜 **아무 흔적 없이** 알림만 안 온다. 이 델타에서 가장 놓치기 쉬운 한 줄 |
| 2 | 같은 자리의 정리용 `delete … where type not in (…)` 목록에도 `'mention'` 추가 | ~1851행 | `schema.sql`을 **재실행할 때마다 언급 알림이 전량 삭제**되고, 이어지는 add constraint도 남은 행 때문에 실패한다 |
| 3 | 새 함수 `public.notify_on_mention()` (security definer, `search_path=public`, plpgsql) | 10-d-2 절(`notify_on_comment` 바로 아래) | 트리거를 걸 대상이 없다 |
| 4 | 새 트리거 `trg_notify_mention after insert on public.comments` | 같은 절 | 함수만 있고 아무 일도 일어나지 않는다 |

⚠️ **기존 `trg_notify_comment`(comment·reply 알림)는 지우지 말 것.** 새 트리거는 **추가**다.
같은 표에 after insert 트리거 두 개가 나란히 뜨고, 중복 알림은 함수 안의 제외 규칙 ④⑤가 막는다.

⚠️ **정규식을 앱과 따로 고치지 말 것.** 서버의
`'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,30})(?![A-Za-z0-9_])'`는 앱 `MENTION_HANDLE_RE`와 같은
규칙이다(앞 경계는 이메일 `a@bcde` 오탐 방지, 뒤 경계는 31자 이상의 앞 30자만 잘라 잡는 오탐 방지).
한쪽만 바꾸면 **앱에선 보라색으로 보이는데 알림은 안 오는** 조용한 어긋남이 된다.

알림을 만들지 않는 경우(중복·프라이버시):

| # | 조건 | 왜 |
|---|---|---|
| ① | 언급 대상 = 댓글 작성자 본인 | 자기 자신에게 알림을 보내지 않는다 |
| ② | `is_blocked_between(대상, 작성자)` | 차단 관계 |
| ③ | 대상이 글 작성자도 아니고 작성자와 `are_neighbors`도 아님 | 그 글을 못 보는 사람 — @만 적어 남의 글의 존재를 흘릴 수 없게 |
| ④ | 답글이고 대상 = 부모 댓글 작성자 | 이미 `reply` 알림이 간다 |
| ⑤ | 최상위 댓글이고 대상 = 글 작성자 | 이미 `comment` 알림이 간다 |
| ⑥ | 글이 `visibility <> 'neighbors'`(=비공개) — **전체 skip** | 최종 `posts_select`는 작성자 외 전원에게 `neighbors` 글만 열어 준다. 그대로 두면 서로이웃이어도 **알림·푸시만 가고 탭하면 아무것도 안 열리는 죽은 딥링크**가 되고, "비공개 글을 썼다"는 사실까지 샌다 |
| ⑦ | 글에 `deleted_at`(삭제표식) — **전체 skip** | 지워진 글의 알림 |

반영 확인 쿼리:
```sql
-- 1번: check 제약 목록에 'mention' 이 들어갔는지 (def 문자열에 mention 이 보여야 한다)
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.notifications'::regclass
   and conname = 'notifications_type_check';

-- 2번: 함수 존재 + 정규식·제외 규칙 (네 컬럼 모두 true). 행이 안 나오면 미반영
--    has_private_guard(post_vis)가 false면 ⑥ 비공개 글 skip이 빠진 옛 본문 — 재실행 필요
select p.proname,
       pg_get_functiondef(p.oid) like '%regexp_matches%'     as has_regex,
       pg_get_functiondef(p.oid) like '%are_neighbors%'      as has_neighbor_guard,
       pg_get_functiondef(p.oid) like '%post_vis%'           as has_private_guard,
       pg_get_functiondef(p.oid) like '%is_blocked_between%' as has_block_guard
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'notify_on_mention';

-- 3번: comments 의 알림 트리거가 2개(기존 comment/reply 1 + 새 mention 1)
select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgrelid = 'public.comments'::regclass and not tgisinternal
   and tgname in ('trg_notify_comment', 'trg_notify_mention')
 order by tgname;
-- 기대: trg_notify_comment … AFTER INSERT ON public.comments …
--       trg_notify_mention … AFTER INSERT ON public.comments …
```

⚠️ **확인 쿼리만으로는 부족하다 — 반영 후 댓글에 `@아이디` 1건을 남겨 언급된 쪽에 알림이
실제로 도착하는지 눈으로 확인할 것.** `notify_on_mention` 끝에는
`exception when others then return null`이 있어 함수 안의 어떤 오류도 **조용히 삼켜진다**
(댓글 저장은 성공한다). 위 `pg_get_functiondef` 검사는 정의문이 들어갔는지만 보므로
이 증상을 잡지 못한다. 제외 규칙 ③ 때문에 **글 작성자와 서로이웃인 계정**으로 시험해야 한다.

### ⏳ 미반영(실행 대기) — 기기 간 동기화의 실시간 트리거: `user_sync_signals` 신규 표 (2026-09-11 추가)

> 발췌본: `supabase/migration-2026-09-11-realtime-sync.sql`
> (schema.sql `4-c-3c` 절 + 실시간 publication 블록 + 파일 끝 revoke 목록과 동일 내용).
>
> ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 실시간 반영이 되어
> "아이폰은 바로 뜨는데 안드로이드는 안 뜬다"는 오판으로 이어진다.
>
> ⚠️ **전제(확장 등) 없다.** pg_cron 도 필요 없다.
> ⚠️ **전제(선행 표) 있다** — `posts`·`user_trip_cards`(3단계)·`user_state_flags`(4단계)가 이미
> 있어야 한다. 셋 다 이 문서 기준 반영 완료다. 없으면 트리거 생성이 42P01로 실패하고 델타 전체가
> 롤백된다.
>
> ⚠️ **앱 배포 순서 제약 없음.** 표가 없으면 구독이 조용히 아무 이벤트도 못 받고, 기존 트리거
> (포그라운드 복귀 60초 throttle · 프로필 당겨서 새로고침)로 4단계까지의 동작이 그대로 유지된다.

**왜 필요한가.** 1~4단계로 글·여행 카드·부가상태가 기기 간에 전파되게 됐지만, 반영을 **당기는
트리거**가 ①앱 포그라운드 복귀(60초 throttle) ②프로필 당겨서 새로고침 둘뿐이다. 그래서 두 기기를
**동시에 켜 둔 채** 쓰면 상대 기기의 변경이 화면에 영영 안 나타난다(앱을 껐다 켜야 보인다).
이 표는 "그 사용자의 무언가가 서버에서 바뀌었다"를 Realtime으로 알리는 **초인종**이다.
앱 쪽 대응은 `src/services/syncRealtime.ts`(신규)·`src/store/recordStore.tsx`.

> ⚠️ **이 표는 데이터 경로가 아니라 트리거다.** 앱은 이벤트 페이로드에서 **아무것도 읽지 않고**
> (`domain`조차) 디바운스 뒤 기존 `syncMyRecords()`를 부를 뿐이다. 여기에 두 번째 병합 경로를
> 만들면 1~4단계 QA가 쌓은 보증이 통째로 무효가 된다.

> **왜 posts·user_trip_cards·user_state_flags를 직접 구독하지 않는가.**
> ① `postgres_changes`는 **바뀐 행 전체**를 내려보낸다. `posts.data`(jsonb)는 앨범 글이면 사진
> 100장 URL로 수십 KB인데, 남이 누른 좋아요 하나가 만드는 `likes_count` UPDATE마다 그 본문
> 전체가 작성자의 모든 기기로 내려온다(앱은 그 값을 쓰지도 않는다 — 순수 이그레스).
> ② 표 3개를 구독하면 WAL 디코딩과 구독자별 RLS 평가가 3벌 돈다.
> 이 표는 사용자당 1행·수십 바이트다.

실행할 것 — 전부 `schema.sql`에 반영돼 있고 재실행 안전(멱등):

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `create table if not exists public.user_sync_signals (user_id pk, domain, bumped_at)` | `4-c-3c` 절(`user_state_flags` 바로 아래) | 구독이 조용히 무동작 → **실시간 반영만 꺼지고 앱은 정상** |
| 2 | RLS 활성화 + `user_sync_signals_select_own` **(select 전용)** | 같은 절 | 정책 없이 RLS만 켜면 이벤트가 전달되지 않는다(조용한 무동작) |
| 3 | `bump_sync_signal()` (security definer, 예외 삼킴) + 트리거 3개(`posts`·`user_trip_cards`·`user_state_flags`, **after insert or update**) | 같은 절 | 신호가 만들어지지 않는다 |
| 4 | **`alter publication supabase_realtime add table public.user_sync_signals`** | 실시간 구독 활성화 블록(`dm_messages`·`notifications` 바로 아래) | **가장 조용한 실패.** 1~3이 다 맞아도 이벤트가 영영 안 온다(DM·알림에서 이미 밟은 함정) |
| 5 | 파일 끝 일괄 `revoke truncate, references, trigger` 목록에 `public.user_sync_signals` 추가 | 파일 하단 revoke 블록 | 이웃 표들과 권한 기준이 어긋난다(즉시 증상 없음) |

⚠️ **쓰기 정책(insert/update/delete)을 만들지 말 것.** 쓰는 주체는 트리거뿐이고, 함수가
`security definer`라 정책 없이도 쓴다. 클라이언트에 쓰기를 열면 **남의 기기를 임의로 깨우는
(동기화 폭주) 수단**이 된다. 확인 쿼리 6번이 정확히 이걸 본다(정책이 select 1개여야 한다).

⚠️ **`revoke select`로 더 좁히지 말 것.** Realtime의 `postgres_changes`는 구독자의 select 권한 +
RLS로 전달 여부를 정한다 — select를 회수하면 이벤트가 조용히 끊긴다.

⚠️ **`domain`은 진단용이다. 앱의 판정에 쓰지 않는다.** 신호가 겹치면 마지막 것만 남으므로
이 값으로 "무엇을 동기화할지"를 고르면 반드시 하나를 빠뜨린다(앱은 항상 전체 체인을 돈다).

⚠️ **DELETE 트리거는 일부러 없다.** 1~4단계의 삭제는 전부 tombstone(= `deleted_at`을 채우는
UPDATE)이라 update 트리거가 이미 잡는다. 진짜 hard delete는 purge cron뿐인데, 그 대상은
"표식이 찍힌 지 30일이 지나 이미 모든 기기가 반영을 끝낸 행"이라 기기를 깨울 이유가 없다
(오히려 전 사용자 신호를 한꺼번에 튕겨 동기화 폭주를 만든다).

⚠️ **성능(현 규모 무관, 알아만 둘 것).** 좋아요·댓글 카운터 갱신도 `posts` UPDATE라 트리거가
돈다. upsert 1회(PK 조회 1건)라 비용은 싸지만, **사용자당 1행에 몰리는 구조**라 같은 사용자의
글에 동시 다발 반응이 쏟아지면 그 1행에 행 잠금 경합이 이론상 생긴다. 문제가 되면 첫 수단은
posts 트리거를 `after insert or update of data, deleted_at, visibility`로 좁히는 것이다.

**신호 행은 정리(purge)가 필요 없다** — 사용자당 1행 upsert라 늘지 않고, 계정 삭제 시
`profiles`의 `on delete cascade`가 함께 지운다.

반영 확인 쿼리:
```sql
-- 1번: 3개 컬럼(user_id, domain, bumped_at). domain 은 is_nullable='YES'
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='user_sync_signals' order by ordinal_position;

-- 2번: PK 가 user_id 한 컬럼 — 1행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_sync_signals'::regclass and i.indisprimary;

-- 3번: 트리거 3개, 각각 AFTER INSERT OR UPDATE — 3행
select tgname, pg_get_triggerdef(oid) from pg_trigger
 where tgname in ('trg_posts_bump_sync_signal',
                  'trg_user_trip_cards_bump_sync_signal',
                  'trg_user_state_flags_bump_sync_signal')
   and not tgisinternal order by tgname;

-- 4번: publication 등재 — 가장 조용히 실패하는 항목. 1행이 나와야 한다
select schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'user_sync_signals';

-- 5번: RLS 켜짐(t)
select relrowsecurity from pg_class where oid = 'public.user_sync_signals'::regclass;

-- 6번: 정책이 select 1개뿐이어야 한다(insert/update/delete 가 보이면 잘못 실행된 것)
select policyname, cmd, qual, with_check from pg_policies where tablename='user_sync_signals';
```

⚠️ **확인 쿼리는 "객체가 있다"만 본다.** 실제로 도는지는 앱 계정(authenticated) 세션으로 글을
하나 저장한 뒤 `select * from public.user_sync_signals where user_id = auth.uid();`의 `bumped_at`이
방금 시각으로 올라가는지, 그리고 **다른 기기에서 새로고침 없이 반영되는지**까지 봐야 확정된다.

### ✅ 기록 부가상태 집합 동기화: `user_state_flags` 신규 표 (2026-09-09 추가 · **2026-09-10 운영·테스트 양쪽 실행 완료**)

> 정책(`user_state_flags_all_own`) 존재를 양쪽에서 확인 — 델타는 단일 트랜잭션이라 마지막
> 확인 쿼리가 행을 돌려준 것 자체가 표·트리거·RLS까지 전부 적용됐다는 증거다. 발췌본:
> `supabase/migration-2026-09-09-state-flags-sync.sql` (schema.sql `4-c-3b` 절과 동일 내용).
>
> ⚠️ **운영(`blweolnunmsxgztmvzfd`)과 테스트(`bqwmxxhtsvfuyywfuswo`) 양쪽 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 부가상태가 동기화된다.
>
> ⚠️ **전제(확장 등) 없다.** pg_cron 도 필요 없다 — 이번에도 스케줄 잡을 등록하지 않는다.

**왜 필요한가.** 글·여행 카드는 이제 기기 간에 전파되는데 **부가상태 집합 6종은 아니었다.**
보관(`archivedIds`)·차단(`blockedUsers`)·음소거(`mutedHandles`)·본 스냅(`viewedSnapIds`)·
신고 숨김(`reportedPostIds`·`reportedCommentIds`)이 전부 `user_app_state` **1행 jsonb**에 실려
4초 디바운스로 통째 upsert되기 때문에 두 기기가 서로를 덮어썼다(보관을 풀었는데 되살아나고,
차단이 한쪽 기기에만 남는 류). 이 6종을 행 단위 표로 올려 카드와 같은 방식
(프로브 → tombstone → 병합)을 적용한다. 앱 쪽 대응은 `src/services/appState.ts`(신규 함수 4개)·
`src/utils/mergeStateFlags.ts`·`src/store/recordStore.tsx`.

> **범위 밖(그대로 legacy 유지):** 설정 스칼라·`cardOrder`·`moments`·`countryCovers`는 여전히
> `user_app_state` 통째 백업(last-write-wins)이다. **알려진 한계이며 이번 델타로 해결되지 않는다.**

실행할 것 — 전부 `schema.sql`에 반영돼 있고 재실행 안전(멱등):

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `create table if not exists public.user_state_flags (user_id, kind, item_key, data, updated_at, deleted_at)` — PK `(user_id, kind, item_key)` | `4-c-3b` 절(`user_app_state` 바로 아래) | 앱의 함수 4개가 전부 조용히 실패 → **기능만 꺼지고 앱은 정상**(아래 하위 호환 절) |
| 2 | `trg_user_state_flags_updated before update … set_updated_at()` | 같은 절 | 당장은 증상이 없다(LWW 판정에 안 쓴다). 다만 purge 기준과 진단이 사라지고 이웃 표들과 규격이 어긋난다 |
| 3 | RLS 활성화 + `user_state_flags_all_own` 정책(`user_id = auth.uid()`, using·with check 양쪽) | 같은 절 | 남의 부가상태가 보이거나(정책 없이 RLS만 켜면) 내 것도 안 보인다 |
| 4 | 파일 끝 일괄 `revoke truncate, references, trigger` 목록에 `public.user_state_flags` 추가 | 파일 하단 revoke 블록 | 이웃 표들과 권한 기준이 어긋난다(즉시 증상은 없다) |

⚠️ **컬럼 수준 `grant update`를 걸지 말 것.** 이 표는 행 전체가 본인 소유의 로컬 상태 사본이라
좁힐 대상이 없다. 섣불리 `revoke update`를 걸면 tombstone이 `permission denied`로 **조용히**
실패한다(posts에서 실제로 밟은 함정 — 이웃 표 셋도 안 건다).

⚠️ **인덱스를 따로 만들지 않았다.** 앱의 조회는 ①`user_id` 전건 프로브(페이지네이션)
②`user_id` + `kind` + `item_key in(...)` 둘뿐이고 PK 선두 컬럼으로 전부 커버된다.

**kind별 의미론(앱과 문자 그대로 일치해야 한다).**

| kind | item_key | 제거 전파 |
|---|---|---|
| `archived` | posts.id(remoteId) 우선, 미발행은 로컬 id | ✅ 보관 해제 |
| `muted` | handle | ✅ 음소거 해제 |
| `blocked` | handle (없으면 `name:{표시이름}`) — `data`에 표시용 메타 | ✅ 차단 해제 |
| `viewedSnap` | posts.id(remoteId) | ❌ **add-only** |
| `reportedPost` | 신고한 글 id(피드 글이면 곧 remoteId) | ❌ add-only |
| `reportedComment` | 댓글 id | ❌ add-only |

⚠️ **`blocked` 행은 차단 집행이 아니다.** RLS 집행은 기존 `blocks` 표가 하고 그쪽은 이미
기기와 무관하게 동기화된다(`apiBlock`/`apiUnblock`). 여기 실리는 것은 앱 안 차단 **목록
표시용 메타**(이름·이모지·uuid·차단시각)뿐이다. 두 경로를 합치려 하지 말 것.

⚠️ **`deleted_at`은 두 갈래로만 바뀐다** — "끄기가 켜기를 이기되, **사용자의 재추가는 끄기를
이긴다**"가 최종 규칙이다.
1. 앱의 일반 upsert는 이 컬럼을 **아예 건드리지 않는다**(카드와 같은 규칙). 그래야 앱을 켤 때마다
   나가는 전량 시드 upsert가 다른 기기의 끄기를 통째로 되살리는 사고가 구조적으로 불가능하다.
2. 예외는 **사용자가 방금 명시적으로 다시 켠 항목**뿐이다(차단 해제 후 재차단 등). 그 행에만
   앱이 `deleted_at = null`을 실어 부활시킨다. 시드·동기화 경로에는 그 자격이 없다.
   (이 예외가 없던 1차 구현에서는 **재차단이 조용히 풀려 서버 `blocks`와 앱 목록이 영구히
   어긋났다** — 2026-09-10 QA H1.)

**데이터 초기화(설정 > 데이터 초기화)는 이 표도 함께 끈다.** `clearTripState()` 안에서
`clearStateFlags()`가 내 행 전체에 표식을 찍는다(hard delete 아님 — 다른 기기에도 전파돼야 한다).
없으면 초기화 후 다음 pull 한 번이 보관·차단·음소거·신고 숨김을 통째로 되살린다.

**하위 호환 — 이 SQL 전에 앱이 먼저 나가도 사고는 없다.**
표가 없으면 `probeStateFlags()`→`null` / `fetchStateFlags()`→`[]` / `upsertStateFlags()`→`false` /
`tombstoneStateFlags()`→`false` / `clearStateFlags()`→`false`로 전부 조용히 실패하고, 기존
`user_app_state` 통째 백업이 그대로 돈다. 즉 **집합 동기화만 꺼진다.**

**tombstone 정리(purge)는 등록하지 않았다** — `schema.sql`·델타에 주석으로만 있다.
표식 행은 대체로 가볍지만(표식을 찍을 때 `data`를 null로 비운다) ⚠️ 그 키를 아직 로컬에 들고
있는 기기의 시드 upsert가 `data`만 다시 채울 수 있다(행은 계속 꺼진 상태 — 기능상 무해).
반대로 주기를 짧게 잡으면 그보다 오래 잠들어 있던 기기가 표식을 놓쳐
**보관 해제·차단 해제가 그 기기에서만 안 먹는다.**

반영 확인 쿼리:
```sql
-- 1번: 6개 컬럼. data 는 is_nullable='YES'
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='user_state_flags' order by ordinal_position;

-- 2번: PK 가 (user_id, kind, item_key) 세 컬럼 — 3행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_state_flags'::regclass and i.indisprimary;

-- 3번: 정의문에 BEFORE UPDATE + set_updated_at — 1행
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_user_state_flags_updated' and not tgisinternal;

-- 4번: RLS 켜짐(t)
select relrowsecurity from pg_class where oid = 'public.user_state_flags'::regclass;

-- 5번: 정책 1행, cmd='ALL', qual/with_check 둘 다 auth.uid() 비교
select policyname, cmd, qual, with_check from pg_policies where tablename='user_state_flags';
```

⚠️ **확인 쿼리는 "객체가 있다"만 본다.** 실제로 도는지는 앱 계정(authenticated) 세션으로
행 1개를 upsert → 프로브에 뜨는지 → tombstone이 통과하는지까지 봐야 확정된다
(posts의 컬럼 권한 함정이 정확히 "객체는 있는데 안 도는" 사례였다).

### ✅ 기기 간 삭제·수정 전파(tombstone) (2026-09-08 추가 · **2026-09-08 실행·확인 완료**)

> 아래 5건을 실행하고 반영 확인 쿼리 5개가 모두 정상임을 확인했다(사용자 실행).
> 발췌본은 `supabase/migration-2026-09-08-post-soft-delete.sql`에 있다(schema.sql과 동일 내용).
>
> **앱은 아직 안 나갔다** — 이 서버 변경은 구 번들과 호환된다. 기존 번들은 hard delete를 쓰고
> 모든 행의 `deleted_at`이 null이라 새 `posts_select` 조건이 아무것도 거르지 않는다.
> 새 번들 사용자가 처음 soft delete를 해야 비로소 구 번들에서 그 글이 사라진다(의도된 동작).

같은 계정의 두 기기 사이에서 **글 삭제와 수정이 전파되지 않던** 문제를 푼다. 행을 지우는 대신
`deleted_at` 표식을 남겨(soft delete), 다른 기기가 "지워졌다"와 "이번 조회가 부분 실패했다"를
구분할 수 있게 한다. 앱 쪽 대응은 `src/services/posts.ts`·`src/utils/mergeMyRecords.ts`·
`src/store/recordStore.tsx`.

실행한 것 — 전부 `schema.sql` 안에 있고 재실행 안전(멱등)하다:

| # | 무엇 | schema.sql 위치 | 빠뜨리면 |
|---|---|---|---|
| 1 | `alter table public.posts add column if not exists deleted_at timestamptz` | posts 표 정의 직후(`client_id` 유니크 인덱스 다음) | 앱의 모든 게시물 조회가 42703으로 실패 |
| 2 | `create index if not exists idx_posts_author_deleted on public.posts (author_id, deleted_at)` | 위와 같은 블록 | 내 글 프로브가 전체 스캔 |
| 3 | **`grant update (…, deleted_at) on public.posts to authenticated`** | 컬럼 수준 권한 재부여 문장(`revoke update on public.posts` 바로 아래) | **삭제가 `permission denied`로 조용히 실패한다.** RLS를 통과해도 컬럼 권한이 없으면 update가 거부된다 — 이 기능의 단일 최대 함정 |
| 4 | `posts_select` 정책 교체 — `and (deleted_at is null or author_id = auth.uid())` 추가 | 파일 하단 최종 `posts_select`(차단·서로이웃 판정이 있는 쪽) | 필터가 없는 **구 앱 번들** 사용자에게 지운 글이 무기한 노출되고, 그 글에 좋아요·댓글까지 달려 작성자에게 알림이 간다 |
| 5 | `trg_posts_invalidate_mate_cache`를 `after insert or delete or update of deleted_at`으로 교체 | 메이트 캐시 무효화 트리거 절 | soft delete는 UPDATE라 트리거가 안 뛰어, 지운 글이 추천 캐시(TTL 6h)에 계속 남는다 |

⚠️ **작성자 본인은 삭제된 행을 읽을 수 있어야 한다(4번의 `or author_id = auth.uid()`).**
양쪽 다 막으면 `fetchMyPostIds`가 표식을 못 보고, 그러면 삭제 전파가 원리적으로 불가능해진다.

⚠️ **배포 순서를 강제할 것 — ① 이 SQL 실행 → ② 반영 확인 → ③ OTA.**
반대로 하면(앱이 먼저 나가면) `deleted_at` 컬럼이 없어 **타인 프로필 글 목록과 딥링크가 사망**하고
피드는 "불러오기 실패" 토스트 + 캐시 고정 상태가 된다.
(내 기록은 안전하다 — `fetchMyPosts`가 `[]`를 내고 병합이 no-op이다. 프로브와 삭제는 컬럼
누락을 감지해 구 동작으로 자기 치유한다.)

반영 확인 쿼리:
```sql
-- 1·2번
select column_name from information_schema.columns
 where table_schema='public' and table_name='posts' and column_name='deleted_at';
select indexname from pg_indexes where tablename='posts' and indexname='idx_posts_author_deleted';
-- 3번 (deleted_at 이 목록에 있어야 한다)
select column_name from information_schema.column_privileges
 where table_schema='public' and table_name='posts' and grantee='authenticated' and privilege_type='UPDATE';
-- 4번 (qual 에 deleted_at 이 보여야 한다)
select qual from pg_policies where tablename='posts' and policyname='posts_select';
-- 5번 (정의문에 `UPDATE OF deleted_at` 이 보여야 한다)
--    information_schema.triggers 는 `UPDATE OF <컬럼>` 의 컬럼 목록을 노출하지 않아
--    event_manipulation 만으로는 컬럼 한정 여부를 확인할 수 없다 — 정의문을 직접 읽는다.
select pg_get_triggerdef(oid) from pg_trigger
 where tgname='trg_posts_invalidate_mate_cache' and not tgisinternal;
```

⚠️ **아직 안 한 것: authenticated 세션 실측 1회.** 확인 쿼리 3번으로 `grant update` 목록에
`deleted_at`·`data`가 있는 것은 확인했으나, 실제 앱 계정 세션의 soft delete가 통과하는지는
앱을 내보내기 전/직후에 한 번 확인하는 것이 좋다. 아래 원문 참고.

원래 문구 — authenticated 세션으로
`update public.posts set deleted_at = now() where id = '<내 글 id>'`가 통과하는지.
3번(컬럼 권한) 판정은 PostgreSQL 의미론과 이 저장소 `profiles`의 실동작에서 유추한 것이고,
운영 DB에서 직접 확인하지는 못했다.

**tombstone 정리(purge)는 이 1차에서는 등록하지 않았다** — `schema.sql`에 주석으로만 있었다.
**후속(아래 절)에서 `cron-setup.sql`에 `purge-deleted-posts` 잡으로 등록했고 양쪽 실행 완료됐다.**

**본문은 표식과 동시에 지운다** — `deletePost`·`deleteAllMyPosts`가 `deleted_at`과 함께
`data = {}` 로 갱신한다. 표식만 남기면 앱이 "되돌릴 수 없이 삭제"라고 안내한 글의 전문과
사진 URL이 purge 전까지 서버에 남는다. 다른 기기는 표식만 보고 지우므로 본문은 필요 없다.
(`grant update` 목록에 `data` 가 이미 있어 추가 권한 변경은 필요 없다.)
남는 것은 **Storage 파일**이다 — 개별 삭제는 앱이 로컬 기록에서 수집한 URL로 지우지만,
"데이터 초기화"(`deleteAllMyPosts`)는 그 경로를 타지 않아 파일이 남는다. 별도 과제다.

### ✅ 집계 함수 tombstone 제외 5개 + purge cron 등록 (2026-09-08 추가 · **같은 날 운영·테스트 양쪽 실행·확인 완료**)

> 확인 쿼리 실측(사용자 실행): 함수 5개 전부 has_filter=true·필터 합계 9,
> `purge-deleted-posts` 등록(50 4 * * *, active), `mate_suggestions` 래퍼 생존.
> ⚠️ 첫 시도는 테스트에서 `schema "cron" does not exist`(3F000)로 전체 롤백 —
> pg_cron 확장이 운영에만 켜져 있었다. 델타에 `create extension if not exists pg_cron;`을
> 넣어 해소(5bf164a). **테스트 프로젝트에는 이제 pg_cron이 켜져 있고 purge 잡도 돈다.**

> 위 ✅(tombstone 도입)의 **후속**이다. 발췌본:
> `supabase/migration-2026-09-08-tombstone-aggregates.sql` (schema.sql·cron-setup.sql과 동일 내용).
>
> ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
> 베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 증상이 사라져 오판하게 된다.
>
> ⚠️ **앱 코드 변경은 없다.** 배포 순서 제약도 없다 — 함수 시그니처(인자·반환 컬럼)가 그대로라
> 구 번들·새 번들 모두와 호환된다. 집계 값이 정확해질 뿐이다.

**왜 필요한가.** 1차에서 `posts_select` RLS에 tombstone 필터를 넣었지만,
**SECURITY DEFINER 함수는 소유자 권한으로 돌아 posts의 RLS 자체가 적용되지 않는다.**
그래서 집계 함수들은 지운 글을 여전히 살아있는 글로 세고 있다. RLS 우회는 이 함수들의
목적(공개 통계를 일관되게 내려면 필요)이라 없앨 수 없고, 함수 본문에서 직접 걸러야 한다.

실행할 것 — 전부 `schema.sql`·`cron-setup.sql`에 반영돼 있고 재실행 안전(멱등):

| # | 무엇 | 서브쿼리 | 빠뜨리면 |
|---|---|---|---|
| 1 | `profile_country_counts` 교체 | 1곳 | 친구 찾기 결과의 **방문국 수**에 지운 글이 계속 잡힌다 |
| 2 | `mate_suggestions_compute` 교체 | 3곳(`pub` / `my_cities` / `ccity_pairs`) | **메이트 추천 점수·근거 문구**(나라·도시 겹침, 희소성 가중치, k-익명 판정 분모)에 지운 글이 계속 반영된다 |
| 3 | `overlap_with` 교체 | 3곳(`my_countries` / `shared` / `shared_k`) | 타인 프로필의 **"겹치는 나라 N곳"** 이 과다. `shared_k`를 빠뜨리면 **k-익명성 분모가 부풀어 이름 공개 임계 판정이 실제보다 관대해진다**(지운 글까지 세서 방문자 수가 k를 넘긴 것처럼 보인다) |
| 4 | `country_visitors` 교체 | 1곳 | 나라별 **"이 나라 다녀온 사람"** 목록과 그 k-익명 판정에 지운 글이 계속 잡힌다 |
| 5 | `post_counts` 교체 | 1곳 | **비이웃 프로필의 글 수가 실제보다 많게 보인다** — 사용자가 가장 먼저 알아채는 증상 |
| 6 | `cron.schedule('purge-deleted-posts', '50 4 * * *', …)` 등록 | — | **표식 행이 영구히 누적된다.** 그리고 `post_likes`·`comments`·`notifications`의 `on delete cascade`가 soft delete(UPDATE)엔 안 돌아 잔여 행도 함께 쌓인다 — 이 purge로 실제 행이 지워질 때 비로소 정리된다 |

⚠️ **함수 시그니처는 하나도 바뀌지 않았다.** `drop function` 없이 `create or replace`만으로
교체된다. 델타 파일에는 `schema.sql`에 있는 `drop function if exists public.mate_suggestions(...)`
3줄을 **일부러 넣지 않았다** — 그걸 옮겨 오면 앱이 실제로 호출하는 캐시 래퍼
`public.mate_suggestions`까지 지워지고 델타가 그걸 다시 만들지 않아 **추천 화면이 통째로 죽는다.**

⚠️ **30일 purge 주기의 트레이드오프 (양방향)** —
짧게 잡으면 그보다 오래 잠들어 있던 기기가 표식을 놓쳐 **그 글이 그 기기에만 영구히 남는다**
(되돌릴 방법이 없다). 늘리면 표식 행이 더 오래 쌓이지만, **본문 `data`는 삭제 시점에 이미
비워지므로** 남는 행은 스칼라 몇 컬럼뿐이라 가볍다. 즉 늘리는 쪽의 대가가 훨씬 싸다.
**Storage 파일은 이 purge로 지워지지 않는다**(별도 과제 — 위 ✅ 절 끝 참조).

반영 확인 쿼리:
```sql
-- 1~5번: 5행이 나오고 has_filter 가 전부 true. n(필터 개수) 기대값 —
--        country_visitors 1 / mate_suggestions_compute 3 / overlap_with 3 /
--        post_counts 1 / profile_country_counts 1 (합계 9)
-- ⚠️ 세는 문자열에 앞 점(.)이 붙은 이유: pg_get_functiondef 는 본문의 SQL 주석까지
--    돌려주므로, 점 없이 세면 설명 주석 속 'deleted_at is null' 이 함께 잡힌다.
select p.proname,
       pg_get_functiondef(p.oid) like '%.deleted_at is null%' as has_filter,
       (length(pg_get_functiondef(p.oid))
        - length(replace(pg_get_functiondef(p.oid), '.deleted_at is null', ''))
       ) / length('.deleted_at is null') as n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public'
   and p.proname in ('profile_country_counts', 'mate_suggestions_compute',
                     'overlap_with', 'country_visitors', 'post_counts')
 order by p.proname;

-- 6번: 'purge-deleted-posts' 한 줄이 나와야 한다
select jobname from cron.job where jobname = 'purge-deleted-posts';

-- 사고 확인: 래퍼가 살아 있는지(위 ⚠️ 참조) — 1행이 나와야 한다
select proname from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'mate_suggestions';
```

**의도적으로 고치지 않은 것 (재조사 방지):**
- `cleanup_unconfirmed_accounts`의 `not exists (select 1 from public.posts …)` — 미확인 계정
  **삭제** 방어 로직이다. 표식만 남은 계정도 "활동 있음"으로 보존되는 쪽이 안전하다
  (필터를 넣으면 글이 전부 tombstone인 계정이 삭제 대상이 되고, 계정 삭제는 되돌릴 수 없다).
  purge가 30일 뒤 행을 실제로 지우면 그 계정은 자연히 삭제 대상이 된다.
- 좋아요·댓글 알림 트리거(`notify_on_like` / `notify_on_comment`) — 이 둘은 definer라 tombstone
  글의 작성자를 찾아내지만, **도달 경로가 F3의 RLS로 이미 막혀 있다.** `likes_insert_own` /
  `comments_insert_own`의 `exists (select 1 from public.posts …)`는 정책 서브쿼리라
  **posts의 RLS(posts_select)를 그대로 탄다** → 남의 tombstone 글에는 insert 자체가 거부되고
  트리거가 발화하지 않는다. 남는 창은 "작성자 본인이 자기 tombstone 글에 반응"뿐인데,
  자기 좋아요·자기 댓글은 트리거 자신의 self 검사(`post_author = new.user_id` /
  `target = new.author_id`)가 걸러 알림이 안 만들어진다. 잔여 1건은 아래 "정리 대기"에 적었다.

### ✅ `schema.sql` 재실행 — 매칭 프라이버시 하드닝 (2026-08-11~12) — **반영 확인 2026-08-13**

> **실측:** `profiles.mate_reco_optin`·`rpc_probe_guard`·`k_anon_min()`·
> `set_mate_reco_optin(boolean)` 4종 모두 운영·테스트 양쪽에 존재.
> **단 `idx_posts_country_shared`(5번)는 anon 프로브로 볼 수 없어 미실측** — 아래 ② 쿼리로 확인할 것.
> 아래 배경 설명은 왜 이렇게 만들었는지의 기록으로 남긴다.

발단: 기록의 공개 범위 칩은 **'메이트만'** 인데(`i18n visNeighbors`), 매칭·겹침·나라별
방문자 함수는 `visibility <> 'private'` 로 거른다. 실제로 쓰이는 값이 `neighbors`/`private`
둘뿐이라 **이 조건은 아무것도 거르지 않는다** — 메이트가 아닌 사용자에게도 방문 국가가
쓰이고 있었다. 표시와 동작을 맞추고, 집계로 개인을 되짚는 경로를 막는다.

| # | 내용 | 왜 |
|---|------|-----|
| 1 | `mate_suggestions_compute` 의 `extra_countries[1:30]` 상한 | `overlap_with` 에만 있던 이분 탐색 방어가 여기만 빠져 있었다 — 전 세계 국가를 넣고 배열을 반씩 쪼개면 추천에 뜬 사람의 방문국을 특정할 수 있다 |
| 2 | `rpc_probe_guard` 표 + `probe_guard_ok()` + `purge_probe_guard()` | 상한 30은 '한 번에 통째로' 만 막는다. 나라를 하나씩 바꿔 200번 부르면 그대로 뚫린다 → **서로 다른 파라미터 집합의 종류 수**를 시간당 20종으로 제한(정상 클라이언트는 1~3종). 초과해도 예외 없이 extra 만 버린다 |
| 3 | `k_anon_min()` + `cshared`·`ccity`·`overlap_with`·`country_visitors` 의 이름 노출 필터 | 근거 문구는 희소한 나라를 **일부러 앞세운다**(식별력 최대). 방문자 3명 미만인 나라·도시는 이름을 빼고, `country_visitors` 는 목록 자체를 내주지 않는다. 개수·점수는 그대로라 **추천 순위 정확도는 변하지 않는다** |
| 4 | `profiles.mate_reco_optin` 컬럼 + `set_mate_reco_optin()` + 세 함수의 거부자 필터 | 선택 동의(거부권). **nullable 3-상태** — `null`=미결정(기존 이용자, 종전대로 포함), `true`=동의, `false`=거부 |
| 5 | `idx_posts_country_shared` (부분 인덱스) | `country_name` 단독 인덱스가 없어 `country_visitors` 와 k-익명성 판정이 매번 전체 스캔이었다 |

⚠️ **4번의 판정은 반드시 `is false` / `is distinct from false` 로 쓸 것.** `= false` 나
`not mate_reco_optin` 은 `null` 에서 참이 되지 않아, 유예 중인 **기존 이용자가 통째로
추천에서 사라진다.** 세 함수 모두 이 규칙으로 적혔다.

⚠️ 거부자는 **'후보로 등장하는 쪽'에서만** 빠지고, 본인이 받는 추천은 막지 않는다.
매칭은 이 앱의 본질 기능(여행 기록)이 아니라 부가 기능이라, 선택 동의 거부를 이유로
기능 제공을 거절하면 개인정보보호법 제22조에 걸린다.

재실행 후 실측(①은 2026-08-13 확인 완료 / **②·③은 미실측** — anon 프로브로 인덱스와
행 분포는 볼 수 없다. SQL Editor에서 마저 확인할 것):

```sql
-- ① 새 객체 4종이 있어야 한다 — 2026-08-13 확인 완료(전부 있음)
select to_regclass('public.rpc_probe_guard') is not null as 가드표,
       to_regprocedure('public.k_anon_min()') is not null as k익명,
       to_regprocedure('public.set_mate_reco_optin(boolean)') is not null as 동의rpc,
       exists (select 1 from information_schema.columns
                where table_name='profiles' and column_name='mate_reco_optin') as 동의컬럼;
-- ② 인덱스
select indexname from pg_indexes where indexname = 'idx_posts_country_shared';
-- ③ 기존 이용자가 유예 상태인지 (전부 null 이어야 정상 — 여기서 false 가 나오면 안 된다)
select mate_reco_optin, count(*) from public.profiles group by 1;
```

이어서 `cron-setup.sql` 의 **2-a) `purge-probe-guard`** 블록도 등록할 것(가드 카운터가
계속 누적된다). 나머지 잡은 이미 등록돼 있으므로 그 블록만 실행하면 된다.

클라이언트 짝(같은 커밋): 기록 작성 화면의 공개범위 안내 문구(`visNoticeNeighbors`),
설정 > 계정의 **'메이트 추천에 내 여행 기록 사용'** 토글. 토글은 서버 값을 읽으므로
`schema.sql` 재실행 전에는 저장이 실패한다(화면은 되돌아가고 토스트로 알린다).

**남은 것 — 아직 안 한 작업:** 온보딩 신규 가입자용 동의 화면(`MateRecoConsentScreen`,
기본 꺼짐)과 기존 이용자용 재동의 배너(소셜 탭 최상단, `mate_reco_optin`이 `null`인
계정에만 노출)는 구현 완료됐다. 개인정보처리방침에도 "메이트가 아닌 이용자에게도 방문
국가가 추천 목적으로 집계 이용됨"을 커밋 `0bfe8b7`(2026-08-19 시행)로 명시 완료했다.
남은 위험은 배너를 계속 닫기만 하는 이용자다 — 7일마다 재노출되긴 하지만 그 사이엔
`mate_reco_optin`이 `null`(유예)로 남는다.

### 🟡 `schema.sql` 재실행 — 생일·성별 제거, `onboarded_at` 신설 (2026-08-13, master 병합됨)

> **실측 2026-08-13 — 1차 완료, 2차 대기.** 운영·테스트 양쪽에서 `profiles.onboarded_at`은
> 있고 `birthday`·`gender`는 **아직 있다.** 지금 있어야 할 정확한 상태다.
> **2차(컬럼 drop)는 신버전이 App Store 심사를 통과한 뒤에 실행한다** — 지금 실행하면
> 아직 업데이트받지 못한 구버전 앱이 전원 파손된다(사유는 아래 경고 상자).

발단: App Store 5.1.1(v) 지적으로 생년월일·성별 수집을 폐지한다. `profiles.birthday`는
그동안 "온보딩을 마쳤는가"의 로컬·서버 판정 신호를 겸했는데, 컬럼이 없어지므로 전용
컬럼 `profiles.onboarded_at`(timestamptz)으로 옮긴다. 관련 SQL은 `schema.sql` 45~62행:
`onboarded_at` 컬럼 추가 → `birthday`가 있던 기존 이용자를 `onboarded_at = created_at`으로
백필 → `birthday`/`gender` 컬럼 drop. `grant update` 목록(177~180행)도 이미 `birthday`·
`gender`를 빼고 `onboarded_at`을 넣은 10개 컬럼으로 갱신돼 있다(위 "2번" 표에 반영 완료).

⚠️ **반드시 2단계로 나눠 실행할 것 — 한 번에 원본 그대로 실행하지 말 것.**

> 1차: `drop column` 두 줄을 주석 처리하고 실행 — `onboarded_at` 신설 + 백필까지만.
> 이 상태는 신·구 클라이언트 모두 정상 동작한다.
> 2차: 신버전(생일·성별 제거분)이 배포·심사 통과된 뒤 원본 그대로 재실행 — 그때 두
> 컬럼이 삭제된다.
> 이유: 컬럼을 먼저 지우면 아직 업데이트받지 못한 구버전 앱이 (a) `profile.birthday`가
> 없어 전원 온보딩으로 튕기고, (b) upsert payload에 `birthday`/`gender`가 들어가
> PostgREST가 거부해 프로필 동기화 전체가 실패한다.
> 운영·테스트 두 프로젝트 모두 같은 순서로 적용한다.

재실행(1차) 후 실측 — **①·③은 2026-08-13 확인 완료**(`onboarded_at` 있음 / `birthday`·`gender`도
아직 있음 = 1차 상태 정상). **②(백필된 행 수)는 RLS 때문에 anon 으로 못 본다** — SQL Editor에서 확인할 것:

```sql
-- ① 컬럼 존재 확인 — 2026-08-13 확인 완료(있음)
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'onboarded_at';
-- ② 백필 확인 — birthday가 있던(과거) 이용자는 모두 onboarded_at이 채워져 있어야 한다
select count(*) filter (where onboarded_at is null) as 미채움
  from public.profiles;
-- ③ (1차 상태 동안은 여전히 존재해야 한다 — 2차 실행 전까지) — 2026-08-13 확인 완료(둘 다 있음)
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name in ('birthday', 'gender');
```

2차(컬럼 drop) 실행 후에는 ③의 결과가 빈 집합이어야 한다.

클라이언트 짝(같은 브랜치): `src/store/settingsStore.tsx`의 `onboardedAt` 로컬 사본 +
구버전 저장본(`birthday` 존재)에서 마이그레이션, `BasicInfoScreen`의 만 14세 자기확인
체크박스(생년월일 입력 대체).

---

## 1-1. 이전부터 남아 있던 것 (2026-08-09 기준 → 2026-08-13 정정)

### 🟡 `schema.sql` 재실행 — 유저 상호작용 감사(2026-08-09) 수정분 5건 — **반영된 것으로 추정**

> **2026-08-13 판단 근거(직접 실측 아님·추론).** 이 5건은 모두 `schema.sql` 안에 있고
> (`uq_neighbors_pair` 685행, `trg_cleanup_neighbor_request_notif` 1859행, publication 2070행),
> 프라이버시 하드닝(2026-08-11~12분, 파일 뒤쪽)이 **실측으로 반영돼 있다**는 것은
> 그 이후 `schema.sql` **전체 재실행이 있었다**는 뜻이므로 이 5건도 함께 반영됐다고 본다.
> **다만 인덱스·트리거·publication은 anon 프로브로 볼 수 없어 확정이 아니다** —
> 아래 확인 쿼리 2줄을 SQL Editor에서 한 번 돌려 ✅로 확정할 것.

멱등이므로 SQL Editor에서 전체 재실행하면 된다. 이 재실행으로 반영되는 것:

| # | 내용 | 왜 |
|---|------|-----|
| 1 | `neighbors` 중복 쌍 정리 + `uq_neighbors_pair` 대칭 유일 인덱스 | 맞신청 레이스로 (A,B)+(B,A) accepted 2행이 생기면 `notify_on_friend_post`가 21000으로 실패해 **두 사용자 모두 게시물 발행 불가**가 되던 결함의 근본 차단 |
| 2 | `accept_neighbor` — 수락 시 역방향 행 삭제 | 인덱스 이전 잔재 방어 |
| 3 | `notify_on_friend_post` — `select distinct` + 예외 흡수 | 알림 실패가 발행을 롤백시키지 않게 (이중 방어) |
| 4 | `trg_cleanup_neighbor_request_notif` — pending 삭제 시 유령 알림 정리 | 신청 취소·거절 후 수신자에게 '탭해도 빈 목록' 알림이 남던 문제 |
| 5 | Realtime publication에 `dm_messages`·`notifications` 추가(멱등 DO 블록) | 없으면 DM 실시간 수신·벨 배지 실시간 갱신이 에러 없이 무음으로 죽는다 |

재실행 후 실측:

```sql
-- ① 대칭 인덱스 존재
select indexname from pg_indexes where tablename = 'neighbors' and indexname = 'uq_neighbors_pair';
-- ② 실시간 publication에 두 테이블이 보여야 한다
select tablename from pg_publication_tables where pubname = 'supabase_realtime'
 and tablename in ('dm_messages', 'notifications');
```

클라이언트 짝(같은 커밋): requestNeighbor 23505 수렴, DM 스레드 시드(재설치 복원),
fetchMyLikesFor 청크화 — 서버 재실행 없이도 동작하지만 1·4·5의 효과는 재실행이 전제다.

### ⏳ `delete-account` 재배포 + `PURGE_SECRET` 등록 (코드는 커밋됐고 서버 반영만 남음)

sweep 인증을 플랫폼 키(`SUPABASE_SERVICE_ROLE_KEY`)와의 문자열 비교에서 **우리가 정하는
`PURGE_SECRET`** 으로 옮겼다. 아래 표의 "왜"는 바로 다음 절에 있다.

**반영 전까지는 옛 방식 폴백으로 계속 동작하므로 급하지 않다** — 함수에 `PURGE_SECRET` 이 없으면
자동으로 옛 비교(Authorization = service_role env)를 쓴다. 다만 폴백이 살아 있는 한 같은 사고가
재발할 수 있으니 출시 전에는 끝낼 것.

```bash
# ① 랜덤 시크릿 생성 후 함수에 등록 → 배포
supabase secrets set PURGE_SECRET=<랜덤> --project-ref blweolnunmsxgztmvzfd
supabase functions deploy delete-account --project-ref blweolnunmsxgztmvzfd
```

```sql
-- ② 같은 값을 Vault 에 저장 (cron 이 보낼 값)
select vault.create_secret('<①과 똑같은 값>', 'purge_secret');

-- ③ 잡 재등록 — x-purge-secret 헤더가 추가됐다. cron-setup.sql 3)번 블록을 그대로 재실행
--    (cron.schedule 은 같은 이름 잡을 덮어쓴다)

-- ④ 실측 — 200 / {"ok":true,...} 여야 한다
select net.http_post(
  url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/delete-account',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
    'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret')
  ),
  body := '{"scope":"sweep"}'::jsonb
);
select status_code, content from net._http_response order by created desc limit 1;
```

401 이면 `content` 의 `hint` 로 갈린다 — `purge_secret_not_set`(①이 안 됨) /
`purge_secret_mismatch`(①②가 다름) / `INVALID_JWT_FORMAT`(게이트웨이 = Authorization 쪽 문제).

### 🟡 `event_participants` 테이블·유니크 인덱스·RLS·grant (2026-08-09 추가) — **표는 반영 확인됨**

오프라인 행사 부스 참가자 설문(메이트 매칭) 테이블.

> **실측 2026-08-13 — 표는 운영·테스트 양쪽에 존재한다.** 이 문서가 "서버 미반영"으로 적어
> 두었던 건 낡은 기록이었다. `schema.sql` 전체 재실행에 이 섹션이 함께 딸려 들어간 것으로 보인다.
>
> ⚠️ **그러나 "표가 있다"와 "행사에 쓸 수 있다"는 다르다.** INSERT 정책의 `with check`는
> `event_code = 'popup01'` **자리표시자 그대로 박혀 있을 가능성이 높다** — 정책 본문은
> anon 프로브로 볼 수 없어 실측하지 못했다. 행사 코드를 확정한 뒤 **정책을 실제 코드로
> 다시 만들어야 한다.** 확인:
>
> ```sql
> select policyname, with_check from pg_policies where tablename = 'event_participants';
> ```
>
> 📅 이 데이터는 **2026-10-10 파기 기한**이 걸려 있다.

> ✅ **반영 완료 — `gender_pref` 선택지 확장 (2026-08-19, 실측 확인).** 매칭 상대 조건에
> `'opposite'`(이성만)을 추가했다. **표가 이미 있어 `create table if not exists` 로는 제약이
> 바뀌지 않으므로** `schema.sql` 에 alter 두 줄을 넣어 두었고, 그것을 운영 프로젝트에서 실행해
> 아래 결과를 확인했다:
>
> ```sql
> select pg_get_constraintdef(oid) from pg_constraint
>  where conname = 'event_participants_gender_pref_check';
> -- CHECK ((gender_pref = ANY (ARRAY['same'::text, 'any'::text, 'opposite'::text])))  ← 실측값
> ```
>
> 테스트 프로젝트(`bqwmxxhtsvfuyywfuswo`)에는 아직 넣지 않았다. 행사 페이지는 운영 ref를
> 하드코딩하고 있어 부스 동작에는 영향이 없다. 다음번 `schema.sql` 전체 재실행 때 따라 들어간다.

> ✅ **반영 완료 — `intro` 컬럼(간단 자기소개, 2026-08-31 부스 피드백, 같은 날 실측 확인).**
> 선택 입력(nullable), 최대 80자. 값이 있으면 매칭 상대의 DM 문구에 한 줄로 들어간다.
>
> **`gender_pref` 때와 같은 함정이었다.** 표가 이미 있어 `create table if not exists` 로는 컬럼이
> 생기지 않으므로, `schema.sql` 의 alter 한 줄과 INSERT 정책 블록(길이 제약 포함)을 운영
> 프로젝트에서 실행했고 아래 결과를 확인했다:
>
> ```sql
> select policyname, cmd, with_check from pg_policies where tablename = 'event_participants';
> -- with_check 에 ((intro IS NULL) OR ((char_length(intro) >= 1) AND (char_length(intro) <= 80)))
> -- 포함 확인 ← 실측값. 정책이 intro 를 참조한 채 생성됐다 = 컬럼 추가도 성공했다는 뜻이다.
> ```
>
> ⚠️ 이 alter **전에** `docs/event.html` 을 게시했다면 새 페이지가 없는 컬럼(`intro`)을 POST 하게
> 되어 **자기소개 입력 여부와 무관하게 참가자 전원이 100% 제출에 실패**했을 것이다
> (`400 PGRST204` — 2026-08-31 운영 실측. payload 가 값만 `null` 일 뿐 `intro` 키를 항상 포함하고
> PostgREST 가 body 의 **키 집합**으로 INSERT 컬럼을 만들기 때문). 순서를 지켜 서버부터 반영했다.
> **event.html 재게시(`npm run pages:publish`)는 아직 안 했다** — 이제 게시해도 안전하다.
>
> 테스트 프로젝트(`bqwmxxhtsvfuyywfuswo`)에는 넣지 않았다. 행사 페이지는 운영 ref를
> 하드코딩하고 있어 부스 동작에는 영향이 없다. 다음번 `schema.sql` 전체 재실행 때 따라 들어간다.

> ✅ **반영 완료 — `carry_next_day` 컬럼(다음 날 자동 참여, 2026-08-31 이틀 행사 조건부 이월,
> 같은 날 실측 확인).** 참가자가 폼에서 직접 고르는 선호값이다(선택 · 기본 해제). 전날 최종
> 미매칭자 중 이 값이 `true`인 사람만 다음 날 매칭 풀에 합류한다 — 이월 명단은
> `scripts/event-match.mjs` 의 `--slot 2` 실행이 만드는 `event-carry-<날짜>.local.json` 을
> 다음 날 `--carry-file` 로 읽는 구조다(재계산 아님).
>
> 운영 프로젝트(`blweolnunmsxgztmvzfd`)에서 alter 한 줄을 실행했고 아래 결과를 확인했다:
>
> ```sql
> select column_name, data_type, is_nullable, column_default
>   from information_schema.columns
>  where table_name = 'event_participants' and column_name = 'carry_next_day';
> -- boolean / NO / false  ← 실측값 (2026-08-31)
> ```
>
> RLS 정책은 **재실행하지 않았다(불필요)** — boolean 은 `not null` + `default` 로 값 범위가 이미
> 닫혀 있어 INSERT 정책의 with check 에 추가할 제약이 없다(`intro` 처럼 길이 제약이 필요한
> 타입이 아니다).
>
> `intro` 때와 달리 이 alter 는 게시보다 먼저 해도 아무도 안 깨졌다 — 게시 전 옛 `event.html` 은
> `carry_next_day` 키를 **안 보내고**, PostgREST 는 body 의 키 집합으로만 INSERT 컬럼을 만들므로
> DB 의 default(`false`)가 들어간다. (intro 는 반대로 새 페이지가 없는 컬럼을 **보내서** 터졌다.)
> 이로써 **새 event.html 게시의 서버 측 선행 조건(intro·carry_next_day 두 alter)은 모두 충족됐다.**
>
> 반영 확인:
>
> ```sql
> select column_name, data_type, column_default, is_nullable
>   from information_schema.columns
>  where table_name = 'event_participants' and column_name = 'carry_next_day';
> -- 기대: boolean / false / NO   ← 행이 안 나오면 미반영
> ```
>
> 테스트 프로젝트(`bqwmxxhtsvfuyywfuswo`)는 부스 영향이 없어 넣지 않는다.
> 다음번 `schema.sql` 전체 재실행 때 따라 들어간다.

### ✅ 해소됨 — Vault `service_role_key` 불일치로 pg_cron 3종이 계속 실패하던 문제

2026-08-07 베타 계정 초기화 중 발견해 같은 날 고쳤다. **등록일(2026-08-05)부터 이틀간
`purge-deleted-accounts` 를 포함한 잡 3종이 한 번도 성공한 적이 없었다.**

**Vault 에 넣어야 하는 건 레거시 JWT 가 아니라 신형 시크릿 키(`sb_secret_...`)다.**
이 프로젝트의 Edge Function 환경변수 `SUPABASE_SERVICE_ROLE_KEY` 에는 신형 키가 주입돼 있어서,
대시보드 `Legacy API keys` 탭의 `service_role` JWT 를 넣으면 서명은 유효해 게이트웨이는 통과하지만
함수 내부의 문자열 비교(`functions/delete-account/index.ts` 99행)에서 걸린다.

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'service_role_key'),
  '<sb_secret_... 신형 시크릿 키>'
);
-- vault.create_secret 은 이름 중복으로 실패한다. 반드시 update_secret.
```

#### 401 두 종류를 구분하면 원인이 바로 갈린다

| 응답 | 낸 주체 | 뜻 |
|---|---|---|
| `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}` | 게이트웨이 | 키 문자열이 깨졌거나 서명이 이 프로젝트 것이 아님 |
| `{"error":"unauthorized"}` | 함수 자신 (99행) | 서명은 유효하나 **env 값과 문자열이 다름** = 키 종류를 잘못 골랐다 |

#### 함께 겪은 함정 — 복사한 키에 보이지 않는 문자가 섞인다

대시보드에서 복사한 키에 제로폭/NBSP 류가 끼어들어 세그먼트 길이가 헤더 37·서명 44(정상 36·43)가
됐다. `~ '\s'` 로는 안 잡힌다. 넣기 전에 아래로 검사하고, 걸리면 정제 후 다시 저장할 것.

```sql
-- 정상: 조각수 3 / 안전문자만 true. JWT 는 base64url 과 점만 쓴다
select length(decrypted_secret) as 총길이,
       array_length(string_to_array(decrypted_secret, '.'), 1) as 조각수,
       (decrypted_secret ~ '^[A-Za-z0-9_.-]+$') as 안전문자만
  from vault.decrypted_secrets where name = 'service_role_key';

-- 정제
select vault.update_secret(
  (select id from vault.secrets where name = 'service_role_key'),
  (select regexp_replace(decrypted_secret, '[^A-Za-z0-9_.-]', '', 'g')
     from vault.decrypted_secrets where name = 'service_role_key')
);
```

> **왜 이틀간 안 보였나.** `cron.job_run_details` 는 `net.http_post` **호출 자체**가 성공하면
> `succeeded` 로 찍는다. HTTP 응답이 401 이어도 잡은 성공으로 보인다. 스케줄러 상태는
> 반드시 `net._http_response` 까지 봐야 한다. 아래 "2번 확인" 쿼리에 반영해 뒀다.
>
> **설계 개편(2026-08-07, 코드 반영 완료·서버 반영 대기).** 원인은 값 하나가 아니라
> **인증 방식이 플랫폼이 주입하는 env 에 묶여 있던 것**이었다. 키 체계가 또 바뀌면 같은 식으로
> 조용히 죽는다. 그래서 sweep 인가를 우리가 정하는 `PURGE_SECRET`(헤더 `x-purge-secret`)으로
> 옮겼다. `Authorization` 은 이제 **게이트웨이 통과 용도로만** 쓴다 — 두 관심사를 분리한 것이다.
> 401 응답에 `hint` 를 넣고 함수 로그(`console.error`)도 남겨, 다음엔 조용히 죽지 않는다.
> 반영 절차는 이 절 맨 위.

### 여행 DNA 반영은 완료됐다 (2026-08-06)

여행 DNA 설문의 서버 반영(`schema.sql` 재실행)이 **2026-08-06 완료**됐다. 사용자가 SQL Editor에서
실행하고 아래 점검 쿼리로 확인했다.

### 이때 함께 고친 것 — `schema.sql`이 그동안 조용히 한 문장씩 실패하고 있었다

`public_profiles`는 파일에 두 번 정의된다. 조기 정의(146행)는 지울 수 없다 —
`mate_suggestions_compute`·`country_visitors`·`neighbor_list_of` 세 `language sql` 함수가
이 뷰를 조인하는데, `check_function_bodies`가 **CREATE 시점에** 본문을 검증하기 때문이다.

그런데 조기 정의는 7컬럼, 최종 정의(1458행)는 11컬럼이었다. `CREATE OR REPLACE VIEW`는
컬럼을 뺄 수 없으므로, **2026-07-10부터** 기존 DB에 재실행할 때마다 146행이
`cannot drop columns from view`로 실패해 왔다. 뒤 문장들은 계속 실행돼서 겉으로는
"재실행 성공"으로 보였고, 그래서 이 문서의 과거 기록도 그렇게 남아 있었다.

→ 조기 정의를 최종 정의와 **같은 컬럼 이름·순서·타입**(부족분은 `null::text` 자리표시자)으로
맞춰 해소했다. 실제 값은 여전히 1458행 재정의가 채운다.

> ⚠️ **조기 정의의 컬럼 목록을 줄이지 말 것.** "안 쓰는 null"로 보이지만 줄이는 순간
> 재실행이 다시 깨진다. 최종 정의에 컬럼을 추가하면 조기 정의에도 같은 자리에 추가해야 한다.
> 146행 위 주석에 같은 경고를 남겨 뒀다.

### 반영 확인 (재확인이 필요할 때)

```sql
select '① public_profiles 컬럼 수 (11이어야 정상)' as 항목,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='public_profiles') as 값
union all select '② travel_dna 표',
       (select case when to_regclass('public.travel_dna') is null then '없음' else '있음' end)
union all select '③ save_travel_dna 함수',
       (select count(*)::text from pg_proc
         where pronamespace='public'::regnamespace and proname='save_travel_dna')
union all select '④ survey_score 반환 컬럼',
       (select case when pg_get_function_result(oid) like '%survey_score%' then '있음' else '없음' end
          from pg_proc where pronamespace='public'::regnamespace and proname='mate_suggestions')
union all select '⑤ dna_type_key 반환 컬럼',
       (select case when pg_get_function_result(oid) like '%dna_type_key%' then '있음' else '없음' end
          from pg_proc where pronamespace='public'::regnamespace and proname='mate_suggestions')
union all select '⑥ travel_dna 캐시 무효화 트리거',
       (select count(*)::text from pg_trigger where tgname='trg_dna_invalidate_mate_cache')
union all select '⑦ TRUNCATE 남은 표 수 (0이어야 정상)',
       (select count(*)::text from information_schema.table_privileges
         where grantee in ('anon','authenticated') and table_schema='public'
           and privilege_type='TRUNCATE');
```

### 같은 재실행에 포함된 보안 수정 — TRUNCATE 권한 회수

RLS는 **TRUNCATE를 검사하지 않는다**(행 단위 DML에만 적용된다). Supabase 기본 권한이
`anon`/`authenticated`에 폭넓게 부여하므로, 그동안 로그인한 사용자가 `posts`·`dm_messages`·
`notifications` 등을 통째로 비울 수 있었다. 18개 표에 `truncate, references, trigger`를
회수했다(`schema.sql` 끝 쪽 단일 블록). `select/insert/update/delete`는 건드리지 않았다 —
그건 RLS와 컬럼 단위 grant로 이미 통제된다.

2026-08-05 확장성 작업의 서버 반영 2건은 같은 날 완료됐다(아래 2번 표 참조).

> ⚠️ 위 2026-08-05 두 건은 **서버 조회로 실측한 값이 아니라 실행 보고 기반**이다. 어긋남이 의심되면 아래 쿼리로 직접 확인할 것.

### 1번으로 생긴 것 (반영 확인용)

- 표 `public.mate_suggestions_cache` — 사용자·파라미터별 추천 결과 캐시(TTL 6시간)
- 함수 `public.mate_suggestions_compute(int, text[])` — 기존 계산 본체(클라이언트 실행 권한 회수됨)
- 함수 `public.mate_suggestions(int, text[])` — 캐시 래퍼(`language plpgsql`). **클라이언트 호출 이름·시그니처·반환 컬럼은 그대로**라 앱 수정이 필요 없다 → 이미 배포된 빌드에도 즉시 적용된다
- 트리거 `trg_posts_invalidate_mate_cache` — 내 기록이 추가/삭제되면 내 캐시만 즉시 무효화

```sql
-- 1번 확인: mate_suggestions 가 plpgsql(래퍼), _compute 가 sql(본체)로 나와야 한다
select proname, prosecdef, prolang::regtype from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('mate_suggestions', 'mate_suggestions_compute');
select count(*) from public.mate_suggestions_cache;  -- 표가 없으면 에러 = 미반영

-- 캐시가 실제로 도는지: 앱에서 발견/메이트찾기 화면을 연 뒤 행이 생기고,
-- 다시 열어도 computed_at 이 그대로면 재계산을 건너뛴 것이다(정상)
select user_id, params_key, computed_at, jsonb_array_length(rows) as n
  from public.mate_suggestions_cache order by computed_at desc limit 5;

-- 2번 확인: 잡 3건 + Vault 시크릿
select jobname, schedule, active from cron.job order by jobname;
--   purge-deleted-accounts / purge-mate-cache / purge-notifications

-- ⚠️ 시크릿은 '있는지'가 아니라 '맞는지'를 봐야 한다.
--    이름만 확인하다가 값이 틀린 걸 놓쳐서 잡 3종이 계속 401로 죽어 있었다(2026-08-07 발견).
--    role 이 service_role 이어야 하고, 공백이 섞이면 안 된다.
select length(decrypted_secret) as 길이,
       (decrypted_secret ~ '\s') as 공백포함,
       convert_from(decode(
         rpad(translate(split_part(decrypted_secret, '.', 2), '-_', '+/'),
              ((length(split_part(decrypted_secret, '.', 2)) + 3) / 4) * 4, '='),
         'base64'), 'utf8') as 페이로드
  from vault.decrypted_secrets where name = 'service_role_key';
--   페이로드가 비면 JWT 가 아닌 신형 키(sb_secret_...) → 함수 env 와 영원히 불일치

-- 잡이 실제로 돈 결과 (등록 다음 날부터 쌓인다)
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 order by d.start_time desc limit 20;
--   ⚠️ pg_cron 은 net.http_post 호출 자체가 성공하면 succeeded 로 기록한다.
--      HTTP 응답이 401 이어도 여기서는 성공으로 보이므로 아래를 함께 볼 것.
select status_code, content, created
  from net._http_response order by created desc limit 10;
```

남은 것은 **4번(정리 대기)** — `tmp-perf-verify.sql` 검증 마무리 또는 폐기. 서버 동작에는 영향 없다.

### 코드 밖에 남은 일 (콘솔·외부 — SQL 로는 못 고친다)

| 항목 | 왜 |
|---|---|
| Firebase Android API 키에 앱/API 제한 | `google-services.json` 의 키는 공개돼도 되지만, 제한이 없으면 제3자가 같은 GCP 프로젝트의 활성 API 할당량을 태울 수 있다 |
| `eorth.app` 도메인 확보 | 공유 링크가 이 도메인을 쓴다 — 미등록이면 리뷰어가 공유를 시험할 때 죽은 링크가 된다 |
| 저장소 public 유지 여부 결정 | RLS 정책 전문이 공개돼 있어 공격 비용을 낮춘다. private 전환 또는 침투 테스트 |

**2026-08-01 재실행에 포함된 감사 수정분** (커밋 `a828788` · `406116c`):
- 이웃 관계 위조 방어 — `neighbors.requester_id` 컬럼 단위 grant (schema.sql 584행)
- `sync_likes_count` / `sync_comments_count` 를 `security definer` 로 (288·345행) — 타인 글 카운터가 RLS에 막혀 0에 머물던 문제
- `notifications` 를 `grant update (read)` 로 제한 (1427행) — 자기 알림 update를 통한 푸시 증폭 차단
- 재실행 시 신형 알림을 전량 삭제하던 파괴적 코드를 no-op 으로 (1398행)
- `safe_to_date`, 푸시 트리거 `INSERT OR UPDATE` 확장, `uq_profiles_handle_lower`

---

## 2. 이미 된 것 (재실행해도 안전)

`schema.sql` 은 멱등(`if not exists` / `create or replace`)하게 작성돼 있어 전체 재실행이 안전하다.
따라서 아래 항목들은 개별 실행이 아니라 **`schema.sql` 재실행 한 번으로 모두 최신화된다.**

| 항목 | 실행일 | 서버 확인 | 비고 |
|---|---|---|---|
| RLS 하드닝 · `public_profiles` 뷰 | 2026-07-03 | — | 비공개 계정 + 연락처 제거까지 포함 |
| `neighbor_counts` 배치 RPC | 2026-07-15 | ✅ 존재 | 이웃 모델 전환 때 `follower_counts` 를 대체 (아래 주의) |
| 장기체류(Stay) 모델 | 2026-07-16 | — | |
| `post_counts` RPC (`migration-2026-07-17-post-counts.sql`) | 2026-07-17 | ✅ 존재 | `create or replace` 라 재실행 안전 |
| 여행 DNA 매칭 6축 재설계 | 2026-07-28 | ✅ 존재 | `mate_suggestions` (schema.sql 663행) |
| 스키마 감사 수정 10건 | 2026-08-01 | ✅ 확인 | `safe_to_date` 함수 + `uq_profiles_handle_lower` 인덱스 (커밋 `a828788`·`406116c`) |
| **출시 전 감사 수정** | **2026-08-02** | **✅ 확인** | 아래 상세 (커밋 `f827009`) |
| 추천 메이트 결과 캐시 (`mate_suggestions_cache` + 래퍼) | 2026-08-05 | 실행 보고 | 커밋 `c8498ca`. 확인 쿼리는 1번 절 |
| pg_cron 3종 등록 (`cron-setup.sql`) | 2026-08-05 | ✅ 확인 | `cron.job` 3건 `active=true`. **단 실행은 전부 401 실패** — 아래 행 참조 |
| Vault `service_role_key` | 2026-08-05 → **2026-08-07 교체** | ✅ 확인 (200 실측) | 등록 당시 값이 함수 env 와 불일치해 잡 3종이 이틀간 전부 401. **넣을 값은 레거시 JWT 가 아니라 신형 `sb_secret_...`** — 1번 절 참조 |
| `event_participants` 표 | 2026-08-09~ (일자 미상) | **✅ 실측 2026-08-13** | 표는 있으나 **INSERT 정책의 행사 코드가 자리표시자일 수 있음** — 1-1번 절 |
| `event_participants.gender_pref` 에 `'opposite'`(이성만) 추가 | 2026-08-19 | **✅ 실측 2026-08-19** | 운영에 alter 실행·`pg_get_constraintdef` 로 확인. 테스트 프로젝트는 미반영(부스 영향 없음) — 1-1번 절 |
| `event_participants.intro` (간단 자기소개, 선택·80자) | 2026-08-31 | **✅ 실측 2026-08-31** | 운영에 alter + 정책 재실행, `pg_policies.with_check` 로 확인. 테스트 프로젝트는 미반영(부스 영향 없음). **event.html 재게시는 별도 잔업** — 1-1번 절 |
| `event_participants.carry_next_day` (다음 날 자동 참여, 선택·기본 false) | 2026-08-31 | **✅ 실측 2026-08-31** | 운영에 alter 실행, `information_schema.columns` 로 확인(정책 재실행 불필요). 테스트 프로젝트는 미반영(부스 영향 없음) — 1-1번 절 |
| 매칭 프라이버시 하드닝 (`mate_reco_optin`·`rpc_probe_guard`·`k_anon_min`·`set_mate_reco_optin`) | 2026-08-12~13 | **✅ 실측 2026-08-13** | 인덱스 `idx_posts_country_shared`만 미실측 — 1번 절 |
| 생일·성별 폐지 **1차**(`onboarded_at` 신설·백필) | 2026-08-13 | **✅ 실측 2026-08-13** | **2차(컬럼 drop)는 심사 통과 후** — 1번 절 |

### 출시 전 감사(2026-08-02) 반영 상세 — SQL Editor 조회로 실측

| 수정 | 서버 확인 결과 |
|---|---|
| **`profiles` 컬럼 권한** — 사용자가 `deletion_requested_at` 을 위조해 30일 유예를 건너뛰고 계정을 즉시 파기시킬 수 있었다 | UPDATE 가능 컬럼 10개(`id`·`handle`·`emoji`·`bio`·`profile_photo`·`country`·`handle_font`·`stay_country`·`stay_status`·`onboarded_at`)만 남고 **`deletion_requested_at` 없음** ✅ (2026-08-13 `birthday`·`gender` drop 반영 — 아래 1번 절 참조) |
| **`media_read_own`** — 목록 조회가 열려 있어 남의 폴더 파일명을 받아낸 뒤 public URL 로 원본(비공개 사진·DM 이미지)을 가져갈 수 있었다 | `media_read_all` 제거, `media_read_own` 하나만 존재하며 `qual` 에 `(storage.foldername(name))[1] = auth.uid()` 폴더 제한 확인 ✅ |
| `dm_push_sent` 테이블 — send-push 멱등성 근거 | 존재 확인(PostgREST 조회) ✅ — 배포된 v4 가 이 표를 쓰기 시작하며 멱등성 자동 활성 |
| `overlap_with`·`neighbor_list_of`·`profile_country_counts` 차단 검사, `extra_countries` 상한 30 | 같은 재실행에 포함 |
| `reports` reason 1000자 + 중복 방지 + 트리거 1시간 10건 초과 시 메일 생략 | 같은 재실행에 포함 |
| `comments.text` 1~500자 check | 같은 재실행에 포함 |

> `media` 버킷은 여전히 public 이며, 공개 URL 이미지 표시가 정상임을 확인했다
> (`/storage/v1/object/public/media/<없는파일>` → `Object not found`). 정책 축소는 **목록 조회만** 막는다.

> ⚠️ **`follower_counts` 는 없는 게 정상이다.** 2026-06-30에 도입됐다가 7-15 이웃 모델 전환 때
> `neighbor_counts` 로 대체됐고, schema.sql 1295행에서 명시적으로 `drop` 한다. 클라이언트도
> `neighbor_counts` 만 호출한다(`src/services/profile.ts`·`social.ts`). 서버 조회에서 이 이름이
> "없음"으로 나와도 문제가 아니다 — 오히려 drop 이 실행됐다는 증거다.

### Edge Function 배포 (2026-08-02 `supabase functions list`로 실측)

| 함수 | 버전 | 서버 배포 | 코드 최종 커밋 | `verify_jwt` |
|---|---|---|---|---|
| `report-alert` | v5 | 2026-08-01 22:53 | 2026-08-01 04:51 (`b47376a`) | true |
| `login-with-identifier` | v5 | 2026-08-01 22:53 | 2026-08-01 04:51 (`b47376a`) | **false** |
| `send-push` | v4 | 2026-08-02 02:11 | 2026-08-02 (출시 전 감사) | true |
| `delete-account` | v5 | 2026-07-10 14:00 | 2026-07-07 05:07 (`35ed042`) | true |

넷 모두 배포가 코드 커밋보다 최신이다. 이로써 감사(2026-08-01)의 **신고 위조 차단이 서버에 반영**됐다.

> ⚠️ **배포 시 `verify_jwt` 함정 — 이 저장소엔 `supabase/config.toml` 이 없다.**
> 그래서 `verify_jwt` 는 파일이 아니라 **배포할 때 CLI 플래그로 결정**되고, 플래그를 안 주면 기본값 `true` 가 된다.
> `login-with-identifier` 는 아이디→이메일 변환을 **로그인 전에** 호출하므로 반드시 `false` 여야 한다:
>
> ```
> npx supabase functions deploy login-with-identifier --project-ref blweolnunmsxgztmvzfd --no-verify-jwt
> ```
>
> 이 플래그를 빠뜨리고 배포하면 아이디 로그인이 통째로 깨진다. 나머지 세 함수는 플래그 없이 배포하면 된다.
> (`Docker is not running` 경고는 무시해도 된다 — 원격 배포는 소스를 올려 서버에서 빌드한다.)

재확인 명령: `npx supabase functions list --project-ref blweolnunmsxgztmvzfd`

---

## 3. 실행하면 안 되는 것

| 파일 | 이유 |
|---|---|
| `migration-2026-07-15-imported-albums-friends.sql` | **⛔ 2026-07-15 실행 완료.** 재실행하면 그 뒤 사용자가 직접 비공개로 되돌린 기록까지 다시 공개로 승격된다 |
| `migration-2026-07-15-neighbors.sql` | **⛔ 2026-07-15 실행 완료.** 맞팔 이관은 멱등이지만 공개범위 이관이 사용자가 되돌린 값을 덮는다. `follows` 테이블도 이미 drop 되어 1)은 어차피 빈 결과 |
| `analysis-mate-score-distribution.sql` | **폐기됨.** 2026-07-28에 없어진 구 4축 공식을 재는 파일 — 돌리면 "개선이 없다"는 잘못된 결론이 나온다 |
| `cron-setup.sql` | 실행해도 안전하다(재실행 가능 — `cron.schedule` 은 같은 이름 잡을 덮어쓴다). 위 1번 표 참조 |
| `tmp-perf-verify.sql` | 성능 리팩터 검증용 구 함수 스냅샷(2026-07-28). 아래 4번 참조 |

---

## 4. 정리 대기 (미결 작업)

**`tmp-perf-verify.sql`** — `mate_suggestions` 성능 리팩터의 동작 보존을 증명하려고 리팩터 전 함수를
`mate_suggestions_old` 로 복제해 둔 파일이다. 파일 헤더에 "검증 후 이 파일째로 삭제"라고 적혀 있으나
2026-07-28 이후 그대로 남아 있다 → **검증이 끝나지 않았다는 신호.**

둘 중 하나로 마무리할 것:
- 검증을 진행한다: 이 파일을 실행해 `mate_suggestions_old` 를 만들고, 현재 `mate_suggestions` 와 출력을 대조한다.
- 검증을 포기한다: `drop function if exists public.mate_suggestions_old(int, text[]);` 를 실행하고 이 파일을 삭제한다.

어느 쪽이든 끝난 뒤에는 이 절과 파일을 함께 지운다.

**tombstone 알림 잔여 창 1건 (2026-09-08, 미수정·저위험).** 좋아요·댓글 insert는 F3의 RLS로
막혀 알림 트리거에 도달하지 못한다. 단 **작성자 본인**은 자기 tombstone 글을 select할 수 있어
(그게 삭제 전파의 전제다) insert도 통과한다. 자기 좋아요·자기 댓글은 트리거의 self 검사가
걸러 알림이 안 나가지만, **작성자가 자기 tombstone 글에 달린 남의 댓글에 답글을 달면**
그 댓글 작성자에게 `reply` 알림이 가고, 탭하면 `fetchPostById`가 null이라 죽은 링크가 된다.
앱 UI에는 지운 글로 들어갈 경로가 없어(삭제 즉시 화면에서 빠진다) 실제로는 직접 API 호출이나
낡은 화면으로만 재현된다. 고치려면 두 트리거에 `and deleted_at is null`을 더하면 되지만,
알림 트리거는 이번 작업 범위 밖이라 손대지 않았다.

---

## 5. 의도적으로 안 켠 것 (필요할 때만 수동 실행)

`schema.sql` 안에 있지만 **자동 실행되지 않도록 주석 처리되었거나 함수 정의만 해둔** 것들이다.
"빠뜨린 것"이 아니라 의도된 상태이므로 실수로 켜지 말 것.

| 위치 | 내용 | 켜기 전 조건 |
|---|---|---|
| 362행 | 카운터 소급 보정 | `security definer` 전환 이전에 쌓인 좋아요·댓글 수 복구용. 전체 posts update라 무거워 수동 실행 |
| 170행 | `cleanup_unconfirmed_accounts()` | 반쪽 계정 정리. 함수만 생성돼 있고 호출은 안 함. 필요 시 직접 호출하거나 pg_cron 등록 |
| 1626행 | `media` 버킷 private 전환 | ⚠️ **클라이언트의 서명 URL(`createSignedUrl`) 전환과 반드시 함께.** 먼저 실행하면 기존 공개 URL 이미지가 전부 깨진다 |

---

## 실제 서버 상태 확인

### A. anon 키로 함수 존재 확인 (SQL Editor 없이, 로컬에서)

`.env` 의 `EXPO_PUBLIC_SUPABASE_*` 로 PostgREST를 두드려 **함수가 서버에 있는지** 알 수 있다.
없는 함수는 `HTTP 404` + `code: PGRST202` 로 답한다.

```js
const r = await fetch(`${URL}/rest/v1/rpc/safe_to_date`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ s: '2026-01-01' }),
});
// 404 + PGRST202 → 없음 / 그 외 → 존재
```

**함정 두 가지.**
1. PostgREST는 **인자 이름으로 함수를 찾는다.** 인자 이름을 틀리면 함수가 있어도 `PGRST202` 가 나온다
   (예: `post_counts` 는 `{ids: [...]}`, `safe_to_date` 는 `{s: '...'}`). "없음"이 나오면 먼저 시그니처를 의심할 것.
2. **인덱스·컬럼 권한·트리거는 이 방법으로 볼 수 없다.** 그건 아래 B로 확인한다.

존재하지 않는 이름(예: `this_fn_never_existed`)을 대조군으로 같이 던져, 조회 자체가 멀쩡한지 먼저 확인하면 좋다.

**컬럼 존재도 같은 방법으로 본다.** `GET /rest/v1/profiles?select=<컬럼>&limit=1` → `200`이면 있음,
`400`(`42703`)이면 없음. `onboarded_at`·`birthday`·`gender` 확인은 이걸로 충분하다.

> 💡 **두 프로젝트를 한 번에 볼 것.** `.env`에는 운영(`blweolnunmsxgztmvzfd`)과
> 테스트(`bqwmxxhtsvfuyywfuswo`) 중 **한쪽만 활성이고 다른 쪽은 주석 처리**돼 있다.
> 활성 값만 보고 "반영됐다"고 판단하면 **반대쪽 프로젝트를 통째로 놓친다.**
> 주석 줄(`^#\s*EXPO_PUBLIC_SUPABASE_...`)까지 같이 읽어 양쪽을 대조하는 게 안전하다.
> 2026-08-13 확인에서는 두 프로젝트 상태가 동일했다.

**테이블도 같은 방법으로 본다.** `GET /rest/v1/<테이블>?select=*&limit=1` → 없으면 `404` + `PGRST205`,
있으면 `200`(RLS 로 막혀도 빈 배열). 재실행이 반영됐는지는 **그 라운드에서 처음 생긴 것**으로 확인하는 게 확실하다
(2026-08-02 라운드는 `dm_push_sent`).

**버킷이 public 인지**도 확인할 수 있다. `GET /storage/v1/object/public/media/<없는파일>` 응답이
`Object not found` 면 버킷 존재 + public(이미지 표시 정상), `Bucket not found` 면 public 이 아니다.

### B. SQL Editor에서 확인 (인덱스·권한 등 A로 못 보는 것)

```sql
-- 0) 출시 전 감사(2026-08-02) 치명 2건 — 둘 다 확인 완료. 재실행 후 어긋나면 여기서 잡힌다.
--    ①은 11개 컬럼만 나와야 하고 deletion_requested_at 이 있으면 안 된다.
--    ②는 media_read_own 한 줄만 나와야 한다(media_read_all 이 남아 있으면 구멍이 열린 것).
select column_name from information_schema.column_privileges
 where table_name='profiles' and privilege_type='UPDATE' and grantee='authenticated'
 order by column_name;

select policyname, qual from pg_policies
 where tablename='objects' and policyname like 'media_read%';

-- 1) 유니크 인덱스 (2026-08-01 확인: 존재). 빈 결과로 바뀌면 2)의 중복부터 정리할 것.
select indexname from pg_indexes
 where schemaname = 'public' and indexname = 'uq_profiles_handle_lower';

select proname, prosecdef from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('sync_likes_count','sync_comments_count','safe_to_date');

select privilege_type, column_name from information_schema.column_privileges
 where table_name = 'notifications' and privilege_type = 'UPDATE';

-- 2) 대소문자만 다른 중복 handle (있으면 위 유니크 인덱스가 안 만들어진다)
select lower(handle), count(*) from public.profiles
 group by 1 having count(*) > 1;

-- 3) 검증용 임시 함수가 남아 있는지 (4번 항목)
select proname from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'mate_suggestions_old';
```

Edge Function 배포 상태는 `supabase functions list` 로 확인한다.
