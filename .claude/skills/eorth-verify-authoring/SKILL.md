---
name: eorth-verify-authoring
description: eOrth의 순수 로직 검증 파일(*.verify.ts / *.verify.mjs)을 이 저장소 규약대로 작성·수정·실행한다. 새 유틸·스토어 로직을 만들거나 고칠 때, "테스트 추가", "검증 파일 만들어줘", "npm test 실패 고쳐줘", "verify 파일 수정", "검증 다시" 요청 시 반드시 사용할 것. jest·vitest를 쓰지 않는 저장소이므로 일반 테스트 작성법을 적용하면 안 된다.
---

# eOrth 검증 파일 작성법

이 저장소는 **jest도 vitest도 쓰지 않는다.** 검증은 `tsx`로 직접 실행되는 스크립트이고,
자체 assert로 `✓`/`✗`를 출력한 뒤 종료코드 0/1로 끝난다. 일반적인 테스트 러너 문법
(`describe`/`it`/`expect`)을 쓰면 실행 자체가 되지 않는다.

## 실행 구조

`npm test`는 세 가지를 순서대로 돌린다:

```
node scripts/run-verify.mjs                                  ← 검증 파일 일괄
node scripts/check-webview-syntax.mjs <CountryMapView> <GlobeView>
node scripts/check-docs-sync.mjs                             ← 공개 문서 정합성
```

`run-verify.mjs`는 `src/**/*.verify.ts`와 `scripts/**/*.verify.mjs`를 모아 **파일당 별도
프로세스**로 실행한다. 각 검증 스크립트가 `process.exit`를 부르기 때문에 한 프로세스에
모아 돌릴 수 없어서다. 하나라도 실패하면 종료코드 1이다.

`geo-tmp`, `tmp-frames`, `intro1`, `node_modules`는 스캔에서 제외된다.

## 파일 형식

```ts
// src/utils/무엇.verify.ts
import { 검증할함수 } from './무엇';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 케이스마다 왜 이 케이스가 필요한지 한글 주석을 남긴다
eq(검증할함수('입력'), '기대값', '설명');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

`eq` 헬퍼는 파일마다 다시 정의한다. 공통 모듈로 빼지 않는 것이 현재 관행이다 —
검증 파일이 자기 자신만으로 완결되어야 파일당 1프로세스 구조에서 읽기 쉽다.

## 무엇을 검증 대상으로 삼는가

**대상이 되는 것:** 입력→출력이 결정적인 순수 함수. 날짜 계산, 정규화, 매칭 점수,
경로 조립, 마이그레이션 변환, 정렬·그룹핑 규칙.

**대상이 아닌 것:** React 컴포넌트 렌더, 네이티브 API 호출, 네트워크, 파일시스템.
이들을 검증하려면 테스트 러너와 목이 필요한데 이 저장소에는 없다. 억지로 만들지 말고
"검증 불가 — 실기기/서버 필요"로 보고하라.

로직을 검증 가능하게 만들려면 **순수 함수로 먼저 뽑아라.** 화면에서 계산을 `utils/`로
분리하고 그 함수에만 검증을 붙이는 것이 이 저장소의 패턴이다.

## 케이스 고르는 법

기존 파일들이 공통으로 다루는 축:

1. **정상 경로** — 대표값 몇 개
2. **경계** — 0개, 1개, 최대치, 빈 문자열
3. **널 계열** — `''`, `undefined`, `null` 각각. 셋을 뭉뚱그리지 마라
4. **표기 흔들림** — 앞뒤 공백, 중간 공백, 별칭. 사용자 입력과 가져오기 데이터가 섞이는 필드에서 실제로 났던 문제다
5. **모르는 값** — 미지의 입력이 `null`로 떨어지는지. 기본값으로 떨어지면 뜻 모를 UI가 나온다

각 `eq` 호출의 세 번째 인자(설명)는 **실패했을 때 혼자 읽고 이해할 수 있게** 쓴다.
`'테스트1'`이 아니라 `'별칭: 화창 → 맑음'`처럼.

## 실행과 결과 읽기

```
npm test                                  # 전체
node node_modules/tsx/dist/cli.mjs src/utils/무엇.verify.ts   # 한 파일만
```

**파이프를 걸지 마라.** `npm test | tail -20`은 종료코드가 `tail`의 것(0)으로 바뀌어
실패를 놓친다. 결과가 필요하면 파일로 리다이렉트한 뒤 읽어라.

경로에 공백(`바탕 화면`)이 있어 `npx tsx`가 실패할 수 있다. `run-verify.mjs`가
`node_modules/tsx/dist/cli.mjs`를 node로 직접 부르는 이유이며, 한 파일만 돌릴 때도 같은 방식을 쓴다.

## 기존 실패 1건

`scripts/event-config.verify.mjs`의 "Supabase 프로젝트 일치"는 로컬 `.env`가
`docs/event.html`이 하드코딩한 프로젝트와 다르면 실패한다. **코드 결함이 아니다.**
`.env`는 추적되지 않으므로 CI에서는 이 검사가 자동으로 건너뛰어진다.

새 실패를 판단할 때 이 1건을 기준선에서 빼고 세되, 보고서에는 "기존 실패 1건 그대로"라고
반드시 적어라. 조용히 제외하면 다음 사람이 진짜 실패를 놓친다.

## 테스트 시나리오

**정상:** `src/utils/tripDays.ts`에 함수를 추가했다 → `tripDays.verify.ts`를 만들고
정상/경계/널/흔들림 케이스를 넣는다 → 한 파일만 돌려 통과 확인 → `npm test`로 전체 회귀 확인.

**에러:** `npm test`가 실패했는데 실패 파일이 이번 변경과 무관하다 → 고치지 말고
"기존 실패 / 이번 변경 무관"으로 분류해 보고한다. 무관한 실패를 고치면 남의 WIP를 건드린다.
