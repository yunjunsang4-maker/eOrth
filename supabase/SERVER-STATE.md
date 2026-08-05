# 서버 반영 상태 (Supabase)

이 저장소의 SQL·Edge Function 중 **무엇을 실행해야 하고, 무엇이 이미 됐고, 무엇을 절대 실행하면 안 되는지**를 한 장에 모은 문서다.
파일별 상세 사유는 각 파일 헤더 주석에 있다 — 여기서는 상태와 순서만 다룬다.

- 프로젝트 ref: `blweolnunmsxgztmvzfd`
- 적용 경로: Supabase 대시보드 > SQL Editor (SQL) / `supabase functions deploy <name>` (Edge Function)

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

---

## 1. 지금 해야 하는 것 — 없음 (2026-08-06 기준)

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
select name from vault.decrypted_secrets where name = 'service_role_key';

-- 잡이 실제로 돈 결과 (등록 다음 날부터 쌓인다)
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 order by d.start_time desc limit 20;
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
| pg_cron 3종 등록 (`cron-setup.sql`) + Vault `service_role_key` | 2026-08-05 | 실행 보고 | 알림 정리·탈퇴 파기·캐시 정리. 이전까지 한 번도 돈 적 없음 |

### 출시 전 감사(2026-08-02) 반영 상세 — SQL Editor 조회로 실측

| 수정 | 서버 확인 결과 |
|---|---|
| **`profiles` 컬럼 권한** — 사용자가 `deletion_requested_at` 을 위조해 30일 유예를 건너뛰고 계정을 즉시 파기시킬 수 있었다 | UPDATE 가능 컬럼 11개(`id`·`handle`·`emoji`·`bio`·`birthday`·`gender`·`profile_photo`·`country`·`handle_font`·`stay_country`·`stay_status`)만 남고 **`deletion_requested_at` 없음** ✅ |
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
