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

## 1. 지금 해야 하는 것 — 3건 (2026-08-13 실측 기준)

**남은 것은 아래 셋뿐이다.** ①`birthday`·`gender` **2차 drop**(심사 통과 후 — 아래),
②`cron-setup.sql`의 **`purge-probe-guard`** 잡 등록(미실측), ③`delete-account` 재배포 +
`PURGE_SECRET`(1-1절 — 폴백으로 동작 중이라 급하지 않음).
그 외 이 절에 ⏳로 적혀 있던 SQL은 **2026-08-13 실측으로 반영 확인**돼 ✅로 바꿨다.

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
