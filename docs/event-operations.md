# 행사 이벤트 운영 절차

설계: `docs/superpowers/specs/2026-08-09-event-mate-matching-design.md`

행사명: **eOrth 단대축제 부스** · 행사 코드: `popup01` · 행사 종료일: **2026년 9월 10일**
파기 기준일: **2026년 10월 10일** (종료 + 30일)
게시 URL: `https://yunjunsang4-maker.github.io/eOrth/event.html`

## 1. 행사 전 (한 번만)

1. **서버 반영** — Supabase SQL Editor에서 `supabase/schema.sql`의
   "오프라인 행사 메이트 매칭 이벤트" 섹션을 실행한다. `event_code = 'popup01'`이
   `docs/event.html`의 `EVENT_CODE` 상수와 같은지 먼저 확인할 것(둘 다 이미 `popup01`로
   맞춰져 있다 — `node node_modules/tsx/dist/cli.mjs scripts/event-config.verify.mjs`로
   재확인 가능).
   > **다음 행사 때 행사명을 바꾼다면**: `docs/event.html`의 `<title>`과 인트로 화면 문구,
   > `scripts/event-match.mjs`의 `EVENT_NAME` **세 곳을 함께** 고칠 것. `event-config.verify.mjs`는
   > `<title>`과 `EVENT_NAME`만 자동으로 비교한다(인트로 문구는 검사 대상이 아니다) — 세 곳을
   > 고친 뒤 반드시 `node node_modules/tsx/dist/cli.mjs scripts/event-config.verify.mjs`를 돌려
   > `<title>`≠`EVENT_NAME`으로 어긋나지 않았는지 확인한다.
2. **service_role 키 준비** — Supabase 대시보드 > Project Settings > API에서 복사해
   `.env`에 `SUPABASE_SERVICE_ROLE_KEY=...` 한 줄 추가. **이 키는 절대 커밋하지 않는다**
   (`.env`는 이미 무시된다). 이 키가 없으면 `event-match.mjs`·`event-purge.mjs` 둘 다
   `.env에 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다` 오류로 즉시 종료한다.
3. **게시**

       npm run pages:publish

   docs/에 커밋 안 된 변경이 있으면 게시가 거부된다. 먼저 커밋할 것.
   반영까지 1~2분 걸린다. 게시 전 `npm run pages:check`로 대기 중인 파일을 미리 볼 수 있다.
4. **실기기 확인** — 휴대폰(가능하면 iOS·안드로이드 각 1대)에서
   `https://yunjunsang4-maker.github.io/eOrth/event.html`을 열어 **실제로 한 건 제출**해본다.
   Supabase Table Editor에서 `event_participants` 테이블에 행이 들어왔는지 확인하고,
   확인 후 그 행을 지운다(지우지 않으면 실제 매칭에 테스트 데이터가 섞인다).
5. **QR 인쇄** — 위 URL로 QR을 만들어 부스에 세운다. 파라미터가 없으므로 잘릴 것이 없다.

## 2. 행사 중

- 태블릿으로 받는다면 완료 화면의 "처음으로"를 눌러 다음 사람에게 넘긴다.
- 네트워크가 불안하면 제출 실패 문구가 뜬다. 답변은 남아 있으니 잠시 후 다시 누르면 된다.
- "인스타 계정이 없어요" → 참여 불가다. 결과를 보낼 방법이 없다.

## 3. 행사 후 (2026년 9월 10일 이후)

1. **INSERT 정책부터 내린다** — 매칭을 돌리기 전에 SQL Editor에서:

       drop policy if exists event_participants_insert on public.event_participants;

   정책이 살아 있으면 매칭 직전까지도 누구든 anon 키로 행을 계속 넣을 수 있고,
   그 행이 그대로 매칭 결과에 섞인다. 파기(§4) 전이 아니라 **행사 종료 직후, 매칭 전에** 내린다.
2. **테스트 제출 제외 목록 확인** — 본인·스태프가 넣은 인스타그램 아이디를 적어둔다.
3. **매칭**

       node scripts/event-match.mjs --event popup01 --exclude test_a,test_b

   `--exclude`는 생략 가능하다. 네트워크 없이 형태만 확인하려면:

       node scripts/event-match.mjs --fixture scripts/fixtures/event-sample.json

   실행하면 `event-report.local.html`이 생긴다. 브라우저로 연다.
   (예시 출력: `참가 7명 → 짝 2쌍, 3인조 1개, 미매칭 0명`)
4. **미매칭 확인** — 리포트 상단 경고 블록을 먼저 본다. 미매칭이 있으면 그분들께는
   유형 결과만 따로 보낸다.
5. **발송** — 카드마다 "문구 복사" → "DM 열기"로 인스타에 붙여넣는다.
   보낸 사람은 "발송함"에 체크한다(새로고침해도 유지된다).
6. **재실행 주의** — 같은 데이터로 다시 돌리면 결과는 같다(결정론). 다만 **참가자가 늘어난 뒤**
   다시 돌리면 짝이 바뀔 수 있다. 발송을 시작했으면 다시 돌리지 않는다.

## 4. 2026년 10월 10일 — 파기 (종료 + 30일)

    node scripts/event-purge.mjs --event popup01            # 건수 확인
    node scripts/event-purge.mjs --event popup01 --confirm  # 실제 삭제

`--confirm` 없이 실행하면 건수만 보여주고 아무것도 지우지 않는다
(예시 출력: `행사 popup01: N건` 다음 줄에 `실제로 지우려면 --confirm 을 붙이세요. (되돌릴 수 없습니다)`).
`--confirm`을 붙이면 되돌릴 수 없으니 건수를 먼저 확인한 뒤에만 붙인다.

INSERT 정책은 **이미 §3-1에서 내렸어야 한다** — 여기서는 SQL Editor에서 정책이 실제로
없는지 확인만 한다:

    select policyname from pg_policies where tablename = 'event_participants';

`event_participants_insert`가 아직 남아 있으면(예: §3-1을 건너뛰었다면) 지금이라도 내린다:

    drop policy if exists event_participants_insert on public.event_participants;

로컬의 `event-report.local.html`도 지운다(참가자 아이디가 들어 있다).
