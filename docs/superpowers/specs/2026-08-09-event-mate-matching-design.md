# 오프라인 행사 메이트 매칭 이벤트 설계

- 작성일: 2026-08-09
- 상태: 설계 확정 / 구현 전
- 영향: `docs/` 게시 페이지 1장 + 생성물 1개, Supabase 테이블 1개(`event_participants`), 로컬 스크립트 2개. **앱 코드는 건드리지 않는다.**

---

## 1. 배경

오프라인 홍보 행사(팝업 부스)에서 참가자에게 여행 성향 설문을 받고, 행사 후 성향이 맞는
사람끼리 1:1로 짝지어 서로의 연락처를 보내주는 이벤트다. 목적은 두 가지다 —
**부스에서 앱 브랜드를 각인시키는 것**과 **참가자에게 실제로 쓸모 있는 결과를 남기는 것**.

앱과는 분리된 웹페이지로 만든다. 설치를 전제하면 부스 이탈이 크고, 이 행사에 온 사람들끼리만
연결하는 팝업 성격이라 앱의 전체 사용자 풀과 섞이면 안 된다.

## 2. 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 접근 방식 | **A. 정적 페이지 + 앱과 같은 Supabase** | 추가 인프라 0. 구글 폼은 브랜딩이 0이라 홍보 목적과 어긋남 |
| 참여 장벽 | 앱 설치 **불필요** | 부스 회전율 |
| 매칭 타이밍 | 행사 종료 후 **배치** | 즉시 매칭은 초반 참가자의 풀이 비어 부실 |
| 결과 전달 | 인스타 DM 또는 문자로 **수동 발송** | 인스타는 공식 API로 자동 발송 불가(선발신 사용자 한정) |
| 결과 내용 | **서로의 연락처 교환** | 제3자 제공 동의 필수(§9) |
| 매칭 인원 | **1:1 상호 매칭 1명** | "당신의 짝"이라는 서사. 연락처가 여러 명에게 흩어지지 않음 |
| 매칭 조건 | 성향 + 성별 + 가고 싶은 나라 | 환경(도시↔자연)은 성향 ③축이라 별도 항목 아님 |
| 성별 처리 | 참가자가 **같은 성별만 / 상관없음** 선택 | 양쪽 조건이 모두 맞을 때만 후보 |
| 설문 분량 | **14문항** = 축당 2문항 | 약 1분 30초. 부스 줄이 안 막히는 현실적 상한 |
| 문항 출처 | `src/constants/travelDna.ts`의 **`weight: 2` 문항 전부** | §5 |
| 행사 코드 | 페이지에 **상수로 고정** (URL 파라미터 없음) | QR을 이번 행사에만 사용 |
| 관리자 도구 | 로컬 Node 스크립트 + HTML 리포트 | `service_role` 키가 웹에 안 나감 |

### 비목표

- 앱 계정과의 연결(참가자가 나중에 가입했는지 추적) — 하지 않는다. 어트리뷰션을 넣으려면
  식별자를 하나 더 받아야 하는데, 개인정보를 늘린 만큼의 값을 이번 행사에서 회수할 수 없다.
- 자동 문자 발송(솔라피 등) — 발신번호 사전등록·유료 결제·광고성 문자 규제 검토가 필요하다.
  수십~백 명 규모에서는 복사·붙여넣기가 더 싸다.
- 여러 행사 재사용 — 이번 QR은 이번 행사 전용이다. 재사용이 필요해지면 `event_code`가
  이미 컬럼으로 있으므로 페이지 상수만 바꿔 복제하면 된다.

## 3. 전체 구조

```
[부스 QR] → https://yunjunsang4-maker.github.io/eOrth/event.html
              ↓ (14문항 + 정보 입력 + 동의)
           Supabase  event_participants   (anon: INSERT만)
              ↓
[행사 후] node scripts/event-match.mjs --event <코드>
              ↓
           event-report.local.html  (짝 목록 + 사람별 발송 문구)
              ↓ 복사·붙여넣기 (수동)
           인스타 DM / 문자
              ↓ (행사 후 30일)
           node scripts/event-purge.mjs --event <코드> --confirm
```

게시 파일은 `docs/event.html`(스타일·로직 전체 인라인)과 `docs/event-dna.js`(문항·나라 목록·채점,
**생성물**) 둘이다. gh-pages는 `docs/`를 루트로 평평하게 복사하므로 하위 폴더를 쓰지 않고
두 파일을 `scripts/lib/pagesFiles.mjs`의 `PUBLISHED_FILES`에 추가한다.

## 4. 데이터 · 보안

```sql
create table event_participants (
  id             uuid primary key default gen_random_uuid(),
  event_code     text not null,
  name           text not null,
  gender         text not null check (gender in ('m','f')),
  gender_pref    text not null check (gender_pref in ('same','any')),
  contact_type   text not null check (contact_type in ('instagram','phone')),
  contact        text not null,
  wish_countries text[] not null,
  answers        jsonb not null,          -- {"1":"a","5":"b", ...} 문항 id → 선택
  consent_pii    boolean not null,
  consent_share  boolean not null,
  created_at     timestamptz default now()
);
```

RLS는 **anon에게 INSERT만** 열고 SELECT·UPDATE·DELETE는 전부 막는다.

```sql
alter table event_participants enable row level security;

-- ⚠️ RLS 정책만으로는 부족하다. Supabase는 public 스키마 신규 테이블에 anon·authenticated
--    기본 권한을 주므로, 테이블 권한부터 걷어내고 필요한 것만 다시 준다.
--    (schema.sql의 public_profiles·dm_messages가 쓰는 방식과 동일)
revoke all on public.event_participants from anon, authenticated;
grant insert on public.event_participants to anon;
-- 읽기·수정·삭제 권한은 아무에게도 주지 않는다 → service_role(로컬 스크립트)만 가능.

create policy event_participants_insert on event_participants
  for insert to anon
  with check (
    event_code = 'popup01'          -- ⚠️ 실제 행사 코드로 교체
    and consent_pii and consent_share
    and char_length(name) between 1 and 40
    and char_length(contact) between 1 and 80
    and array_length(wish_countries, 1) between 1 and 3
  );
-- SELECT/UPDATE/DELETE 정책 없음 = 전면 차단. 읽기는 service_role(로컬 스크립트)만.
```

**정적 페이지에 박히는 anon 키는 누구나 소스에서 꺼내볼 수 있다.** SELECT가 열려 있으면
참가자 전원의 이름·전화번호·인스타 아이디가 그대로 유출된다. RLS가 유일한 방어선이다.

`with check`의 나머지 조건이 하는 일:
- `event_code` 고정 — 임의 코드로 행을 만들어 테이블을 오염시키는 것을 막는다.
- 동의 두 개 — 동의 없는 행이 **애초에 안 들어간다**. 나중에 걸러내는 것보다 안전하다.
- 길이·개수 상한 — 대용량 문자열 삽입으로 테이블을 부풀리는 것을 막는다.

**행사 종료 후 INSERT 정책을 drop 한다.** 파기(§9) 전까지 정책이 살아 있으면 누구든 계속
행을 넣을 수 있고, 그 행이 매칭 결과에 섞인다.

축 점수와 유형 라벨은 **저장하지 않는다.** `answers` 원본만 두고, 화면 표시용은 브라우저가
매칭용은 스크립트가 같은 파일(`event-dna.js`)의 같은 공식으로 계산한다. 저장해두면 나중에
문항 가중치를 고쳤을 때 옛 행의 점수만 낡은 채로 남는다.

## 5. 문항 — 앱에서 생성한다

`src/constants/travelDna.ts`가 36문항·7축·가중치의 단일 출처이고, **축당 `weight: 2`인 문항이
정확히 2개씩, 총 14개**다. 확정된 "14문항 = 축당 2문항"이 곧 "가중치 2짜리 전부"이므로
선별 기준을 따로 정할 필요가 없다.

| 축 | 문항 id |
|---|---|
| ① plan (계획↔즉흥) | 1, 5 |
| ② pace (휴식↔활동) | 6, 10 |
| ③ terrain (도시↔자연) | 11, 15 |
| ④ budget (알뜰↔아낌없이) | 16, 17 |
| ⑤ purpose (미식↔관광) | 21, 24 |
| ⑥ crowd (북적임↔한적함) | 26, 27 |
| ⑦ company (혼자↔함께) | 31, 32 |

```
src/constants/travelDna.ts + src/constants/countries.ts   (단일 출처)
        ↓  node node_modules/tsx/dist/cli.mjs scripts/build-event-dna.ts
docs/event-dna.js   (생성물 — 브라우저 <script>와 Node 양쪽이 읽는다)
```

`tsx`가 이미 devDependency이고 `scripts/build-region-aliases.ts`라는 선례가 있어 TS 상수를
그대로 import할 수 있다.

**손으로 옮겨 적지 않는 이유**: 앱 문항을 고쳤을 때 이벤트 문항만 옛 문구로 남고, 그 상태로
계산한 유형 라벨은 참가자가 나중에 앱에서 받는 라벨과 어긋난다. 채점 공식이 두 벌이 되면
화면에 보여준 유형과 실제 매칭에 쓴 점수가 달라지는 더 나쁜 형태가 된다.

`scripts/check-docs-sync.mjs`에 **생성물 최신성 검사**를 추가한다 — `build-event-dna.ts`를
다시 돌린 결과가 `docs/event-dna.js`와 다르면 `npm test`가 실패한다. 커밋 시점에 걸리지 않으면
"소스는 고쳤는데 게시본은 옛날 문항"이 그대로 부스에 나간다.

`event-dna.js`가 내보내는 것:
- `EVENT_QUESTIONS` — 14문항 (id, axis, weight, 상황·A·B 한국어 문구)
- `EVENT_COUNTRIES` — 나라 목록 (이름·국기·검색어 `term`)
- `scoreAxes(answers)` — 축별 점수 계산 (§6)
- `axisLabel(scores)` — 유형 라벨 조합 (앱 §6 규칙 그대로)

## 6. 채점

앱의 공식(`2026-08-05-travel-dna-survey-design.md` §5)을 그대로 쓴다.

```
raw   = 100 × Σ(B를 고른 문항의 w) / Σ(답한 문항의 w)
conf  = Σ(답한 문항의 w) / Σ(그 축 모든 문항의 w)     -- 앱 36문항 기준
score = round( 50 + (raw - 50) × conf )
```

14문항만 답하므로 축별 `conf`는 0.4~0.5 근처다. **수축이 있어야 점수가 극단으로 튀지 않는다** —
축당 2문항으로 0 또는 100을 찍으면 "확신에 찬 오답"이 되어 매칭이 망가진다.

유형 라벨(§6 앱 표, 명사 7쌍 + 수식어 7쌍)은 그대로 재사용한다. 폴백도 동일하게
"모든 축이 중립에서 15 이내면 `아직 색이 옅은 여행자`". 이렇게 해야 이벤트에서 받은 라벨과
나중에 앱에서 받는 라벨이 같은 체계 안에 있다.

## 7. 매칭

### 점수 100점

| 항목 | 배점 | 계산 |
|---|---|---|
| 성향 7축 | 70 | 축당 10점 — `10 × max(0, 1 − |내 점수 − 상대 점수| / 50)` |
| 가고 싶은 나라 겹침 | 30 | 희소성 가중(아래) |

**`/100`이 아니라 `/50`인 이유**: 무작위 두 사람의 축별 평균 차가 약 33이다. `/100`으로 나누면
아무나 0.67을 받아 변별력이 사라진다(앱과 같은 근거).

**나라 겹침의 희소성 가중은 이 행사 참가자 풀 안에서 계산한다.** 앱은 전체 사용자 기준이지만,
30명짜리 풀에서는 절반이 일본을 고르는 게 정상이다.

```
rarity(나라)  = 1 / (그 나라를 고른 참가자 수)
overlap       = Σ rarity(두 사람이 함께 고른 나라)
겹침 점수     = 30 × min(1, overlap / MAX_RARITY)      -- MAX_RARITY = 풀 내 최대 rarity
```

일본 겹침은 흔해서 낮고, 아이슬란드 겹침은 그 자체로 만점에 가깝다.

### 짝짓기

1. **후보 필터** — 양쪽의 성별 조건이 모두 만족될 때만 후보다. 한쪽이라도 `same`이면
   동성이어야 한다. (`same`↔`any`는 동성일 때만 성립)
2. **그리디 매칭** — 후보 쌍을 점수 내림차순으로 훑으며, 둘 다 아직 안 묶였으면 확정.
3. **동점은 제출 순서(`created_at`, `id`)로 결정** — 같은 데이터에 항상 같은 결과가 나와야 한다.
   두 번 돌렸는데 짝이 바뀌면 이미 보낸 문자와 어긋난다.
4. **잔여 처리** — 남은 사람끼리 한 번 더 돌리고, 그래도 남으면 **점수가 가장 높은 기존 짝에
   붙여 3인조**로 만든다(연락처는 3자 모두 교환). 홀수이거나 성별 조건이 기울면
   (예: `same`만 고른 남성이 3명) 실제로 발생한다.
5. **끝내 짝이 없는 사람은 리포트에 사유와 함께 표시**한다. 조용히 빠지면 그 사람만
   아무 연락도 못 받는다.

최적해(최대가중매칭)를 쓰지 않는 이유: 수십~백 명 규모에서 그리디와의 총점 차이가 몇 % 수준인
데 비해 구현·검증 부담이 크다.

## 8. 관리자 도구

```powershell
node scripts/event-match.mjs --event popup01                # 리포트 생성
node scripts/event-match.mjs --event popup01 --exclude 3,7  # 테스트 제출 제외
node scripts/event-purge.mjs --event popup01 --confirm      # 파기
```

`service_role` 키는 `.env`에서만 읽는다(웹에 나가지 않는다). 산출물은
`event-report.local.html` — 브라우저로 열면:

- **짝 목록** — 점수·겹친 나라·양쪽 유형 라벨
- **사람별 발송 문구 + 복사 버튼**, 채널별로 분리 (문자 먼저 / 인스타는 수동 DM이라 별도 묶음)
- **경고 블록** — 미매칭 인원과 사유, 같은 연락처의 중복 제출, 이름 누락 등

발송 문구:

```
{이름}님, eOrth 팝업 이벤트 결과입니다 🌍
{이름}님은 "{내 유형}", 매칭된 분은 "{상대 유형}"이에요.
두 분 다 {겹친 나라}를 가고 싶다고 하셨네요 (매칭률 {점수}%)
상대방 연락처: {상대 연락처}
상대방에게도 {이름}님 연락처를 함께 보냈습니다.
```

리포트는 연락처가 든 생성물이므로 `.gitignore`에 `*.local.html`을 추가한다.
**미추적 파일이 남아 있으면 EAS 빌드가 멈춘다**(`.gitignore` 기존 주석 참고).

## 9. 개인정보

연락처를 서로에게 넘기는 순간 **제3자 제공**이다. 체크박스만으로는 부족하고, 폼에 아래 표가
그대로 보여야 한다.

| 항목 | 내용 |
|---|---|
| 수집 항목 | 이름, 성별, 연락처(인스타 아이디 또는 휴대폰 번호), 가고 싶은 나라, 설문 응답 |
| 목적 | 행사 참가자 간 여행 성향 매칭 및 결과 발송 |
| 제공 대상 | **매칭된 참가자 본인** (제공 항목: 이름·연락처·유형 라벨) |
| 보관 기간 | **행사 종료 후 30일**, 이후 파기 |
| 거부 권리 | 동의하지 않으면 참여 불가(매칭이 서비스의 전부이므로) |
| 국외 이전 | Supabase 미국 리전 저장 — 앱 개인정보처리방침과 동일 |

동의는 **두 개를 분리**한다. ⓐ 수집·이용 ⓑ 매칭 상대에게 연락처 제공. 하나로 묶으면
제3자 제공 동의를 따로 받은 것으로 인정되지 않는다.

`gender`는 개인정보보호법상 민감정보가 아니다(민감정보는 사상·신념·건강·성생활 등). 다만
필터로 쓰는 이상 수집 항목에 명시한다.

**만 14세 미만은 참여 불가**를 고지한다(앱 정책과 동일 — 법정대리인 동의 절차가 없으므로).

파기는 잊히기 쉬우니 스크립트로 만든다. A안(앱 프로덕션 DB에 얹기)을 고른 이상,
`event-purge.mjs`가 B안(별도 프로젝트)의 "프로젝트 삭제 한 번으로 끝" 이점을 대신한다.
파기 시 INSERT 정책도 함께 drop 한다.

## 10. 화면 흐름 (docs/event.html)

```
① 인트로     행사명 + "1분 30초, 14문항" + 시작 버튼
② 설문       한 화면 1문항, 2지선다, 탭하면 자동 다음 (14회, 진행바)
③ 정보 입력   이름 · 성별 · 매칭 선호 · 연락처(타입 택1) · 가고 싶은 나라(1~3개)
④ 동의       ⓐ 수집·이용  ⓑ 연락처 제3자 제공  (둘 다 필수) + §9 표
⑤ 완료       내 유형 라벨 + 7축 그래프 + "결과는 행사 후 연락처로" + 앱 설치 버튼
```

⑤에서 **유형 라벨을 즉시 보여주는 것**이 이 이벤트의 회수 지점이다. 매칭 결과는 행사 후지만
참가자는 부스를 떠나기 전에 받아 갈 것이 있어야 하고, "즉흥적인 혼행자" 같은 라벨은 그 자리에서
친구에게 보여주는 물건이 된다.

**나라는 자유 입력이 아니라 목록에서 고른다.** "일본"과 "japan"과 "도쿄"가 섞여 들어오면
겹침 계산이 그 자리에서 무너진다. 검색은 `COUNTRIES[].term`(한/영/코드 포함)으로 한다.

디자인은 앱 토큰을 인라인한다 — 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`,
흐린 텍스트 `#A1A1B0`. 폰트는 웹 기본 산세리프(앱 폰트를 웹에 올리려면 라이선스를 따로 봐야 한다).

### 부스 현실 대응

- 행사장 네트워크가 몰려 제출이 실패한다. 답변은 문항마다 `localStorage`에 쌓고, 실패 시
  **답을 유지한 채** "재시도" 버튼을 띄운다.
- 제출 응답을 받기 전까지 버튼을 잠근다. 두 번 눌러 두 행이 들어가면 **그 사람이 두 명으로
  매칭된다.**
- 완료 화면에 "처음으로" 버튼을 둬 다음 참가자가 바로 시작할 수 있게 한다(태블릿 운영 시).

## 11. 파일 목록

| 파일 | 성격 |
|---|---|
| `docs/event.html` | 신규 — 게시 대상 |
| `docs/event-dna.js` | 신규 — **생성물**, 게시 대상 |
| `scripts/build-event-dna.ts` | 신규 — 생성기 |
| `scripts/event-match.mjs` | 신규 — 로컬 관리자 |
| `scripts/event-purge.mjs` | 신규 — 로컬 파기 |
| `scripts/lib/pagesFiles.mjs` | 수정 — `PUBLISHED_FILES`에 2건 추가 |
| `scripts/check-docs-sync.mjs` | 수정 — 생성물 최신성 검사 |
| `supabase/schema.sql` | 수정 — 테이블·RLS 추가 |
| `.gitignore` | 수정 — `*.local.html` |

앱 소스(`src/`)는 읽기만 하고 수정하지 않는다.

## 12. 남은 값 (구현 전 확정 필요)

- **행사 코드** — `popup01`은 자리표시자다. 페이지 상수·RLS `with check`·스크립트 인자
  **세 곳이 같아야 한다.**
- **행사명** — 인트로 화면과 발송 문구에 들어간다.
- **행사 종료일** — 30일 파기 기준일.
