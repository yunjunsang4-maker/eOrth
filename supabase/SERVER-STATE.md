# 서버 반영 상태 (Supabase)

이 저장소의 SQL·Edge Function 중 **무엇을 실행해야 하고, 무엇이 이미 됐고, 무엇을 절대 실행하면 안 되는지**를 한 장에 모은 문서다.
파일별 상세 사유는 각 파일 헤더 주석에 있다 — 여기서는 상태와 순서만 다룬다.

- 프로젝트 ref: `blweolnunmsxgztmvzfd`
- 적용 경로: Supabase 대시보드 > SQL Editor (SQL) / `supabase functions deploy <name>` (Edge Function)

> **2026-08-01 기준 서버 반영은 모두 끝났다.** 아래는 그 근거와, 앞으로 무엇을 건드리면 안 되는지의 기록이다.
>
> - **Edge Function 배포 = 실측.** `supabase functions list` 로 서버에서 직접 받은 값. 4개 전량 최신.
> - **`schema.sql` 실행 = 실측.** 감사 커밋에서 처음 도입된 `safe_to_date` 가 서버에 존재함을 확인(방법은 맨 아래).
> - **개별 항목 실행일 = 작업 기록 기반.** "이미 된 것" 표의 **날짜**는 서버에서 확인한 값이 아니다.
>   다만 `schema.sql` 이 멱등이고 최신 상태로 실행됐으므로, 항목 자체는 모두 반영돼 있다.
>
> 새로 실행·배포했으면 날짜와 함께 이 문서를 갱신한다.

---

## 1. 지금 해야 하는 것 — 없음 (2026-08-01 기준)

**서버 반영 작업은 없다.** 2026-08-01 기준으로 `schema.sql` 재실행과 Edge Function 4종 배포가 모두 끝났다.

남은 것은 아래 두 가지뿐이다.
- **4번(정리 대기)** — `tmp-perf-verify.sql` 검증 마무리 또는 폐기. 서버 동작에는 영향 없음.
- **미확인 1건** — `uq_profiles_handle_lower` 인덱스 생성 여부. 인덱스는 PostgREST로 조회할 수 없어
  anon 키로 확인이 안 된다. SQL Editor에서 맨 아래 1)번 쿼리로 확인할 것.
  대소문자만 다른 handle 중복이 있으면 인덱스 생성이 **warning 으로 조용히 건너뛰어지므로**(schema.sql 67·84행),
  빈 결과가 나오면 중복을 정리한 뒤 `schema.sql` 을 다시 실행해야 한다.

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
| 스키마 감사 수정 10건 | 2026-08-01 | ✅ 존재 | `safe_to_date` 로 확인 (커밋 `a828788`·`406116c`) |

> ⚠️ **`follower_counts` 는 없는 게 정상이다.** 2026-06-30에 도입됐다가 7-15 이웃 모델 전환 때
> `neighbor_counts` 로 대체됐고, schema.sql 1295행에서 명시적으로 `drop` 한다. 클라이언트도
> `neighbor_counts` 만 호출한다(`src/services/profile.ts`·`social.ts`). 서버 조회에서 이 이름이
> "없음"으로 나와도 문제가 아니다 — 오히려 drop 이 실행됐다는 증거다.

### Edge Function 배포 (2026-08-01 재배포 후 `supabase functions list`로 실측)

| 함수 | 버전 | 서버 배포 | 코드 최종 커밋 | `verify_jwt` |
|---|---|---|---|---|
| `report-alert` | v5 | 2026-08-01 22:53 | 2026-08-01 04:51 (`b47376a`) | true |
| `login-with-identifier` | v5 | 2026-08-01 22:53 | 2026-08-01 04:51 (`b47376a`) | **false** |
| `send-push` | v3 | 2026-08-01 22:53 | 2026-07-22 15:24 (`d60715e`) | true |
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

### B. SQL Editor에서 확인 (인덱스·권한 등 A로 못 보는 것)

```sql
-- 1) ⬅️ 아직 확인 못 한 유일한 항목. 한 줄 나오면 정상, 빈 결과면 2)의 중복부터 정리할 것.
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
