# 블로그 AI 자동 목차 생성 — 설계 문서

- 날짜: 2026-06-04
- 대상: eOrth (React Native / Expo)
- 상태: 설계 승인됨 (사용자 확인: 본문 직접 삽입 방식)

## 1. 배경 / 문제

블로그 기록 화면(`BlogRecordScreen`)에는 목차를 지정하는 기능이 없다. 그러나
상세 게시물(`PostDetailScreen`)은 `extractHeadings()`로 본문의 `heading` 블록을
추출해 목차(TOC)를 자동 렌더링한다. 즉 **본문에 `heading` 블록이 있으면 목차는
이미 자동으로 만들어진다.** 다만 작성 화면에서 사용자가 소제목을 직접 넣지 않으면
목차가 비어 있다.

목표: 사용자가 블로그를 발행할 때 AI가 본문을 분석해 적절한 위치에 소제목
(`heading` 블록)을 자동으로 제안·삽입하여, 결과적으로 상세보기 목차가 생기도록
한다. 목차가 필요 없는 글(짧거나 단일 주제)이면 아무것도 추가하지 않는다.

## 2. 핵심 결정 (브레인스토밍 합의)

- **AI 엔진: 온디바이스 분석.** 현재 앱은 백엔드/LLM API 키 인프라가 전혀 없고,
  기존 AI(`src/services/photoAI`)도 전부 온디바이스다. 네트워크 LLM은 키 관리·프록시
  서버·비용·지연·오프라인 실패 문제를 새로 떠안아야 하므로 채택하지 않는다.
- **반영 방식: 저장 시 미리보기 확인.** `저장`을 누르면 분석 → 제안 소제목 목록을
  모달로 보여주고, 사용자가 항목을 선택해 추가하거나 목차 없이 저장한다. 본문이
  바뀌는 것에 대해 사용자 동의를 받는다.
- **삽입 방식: 본문에 `heading` 블록 직접 삽입.** 별도 목차 데이터 구조를 만들지
  않는다. 기존 `createHeadingBlock` / `extractHeadings`를 재사용한다. 본문에도
  소제목이 보이고 상세보기 목차가 자동으로 따라온다.

## 3. 동작 흐름

1. 사용자가 블로그 작성 후 `저장` 탭.
2. 기존 `handleSave`의 필수 항목 검증 통과 후, 발행 직전에 `analyzeForToc(blocks)` 호출.
3. 제안 소제목이 2개 이상이면 → `AutoTocModal`을 띄워 제안 목록 표시.
   - 각 항목 체크/해제 가능. 기본값 전체 선택.
   - 버튼: `추가하고 저장` / `목차 없이 저장`.
4. `추가하고 저장`: 선택된 제안을 본문 블록에 `heading` 블록으로 삽입한 새 블록
   배열을 만들어 `addRecord`에 전달 후 발행.
5. `목차 없이 저장`: 원본 블록 그대로 발행.
6. 제안이 2개 미만이거나 분석이 비어 있으면 → 모달 없이 기존대로 즉시 발행
   (목차 불필요 케이스 자동 처리).

이미 사용자가 직접 넣은 `heading` 블록이 일정 수 이상 있으면 분석을 건너뛰고
즉시 발행한다(중복 제안 방지).

## 4. 온디바이스 분석기 — `src/utils/autoToc.ts` (순수 함수)

부수효과 없는 순수 함수로 작성하여 단위 테스트 가능하게 한다.

### 인터페이스

```ts
export interface TocSuggestion {
  /** 이 블록 "앞에" heading을 삽입한다 */
  beforeBlockId: string;
  level: HeadingLevel;   // 기본 2
  text: string;          // 제안 소제목
}

export function analyzeForToc(blocks: BlogBlock[]): TocSuggestion[];
export function applyTocSuggestions(
  blocks: BlogBlock[],
  accepted: TocSuggestion[],
): BlogBlock[];
```

- `analyzeForToc`: 제안 목록 반환(비어 있으면 목차 불필요).
- `applyTocSuggestions`: 선택된 제안을 반영한 **새** 블록 배열 반환(불변).

### 알고리즘

1. **게이트 (목차 불필요 조기 반환)**
   - 본문 텍스트 블록이 3개 미만이면 `[]`.
   - 전체 본문 글자 수가 약 400자 미만이면 `[]`.
   - 기존 `heading` 블록이 2개 이상이면 `[]`(이미 목차 있음).

2. **구획 분할** — 블록을 순회하며 섹션 경계를 찾는다.
   - **강한 신호(여행 글 특화)** — text 블록 첫머리에서 정규식 매칭:
     - 일차 마커: `N일차`, `N일 차`, `둘째 날` / `셋째 날` 등 서수 + `날`, `Day N`.
     - 시간대 마커: `아침`, `오전`, `점심`, `낮`, `오후`, `저녁`, `밤`.
   - **구조 신호**: `image` / `images` / `video` / `separator` 블록은 약한 경계
     후보(직후 text 블록이 새 섹션 시작일 가능성).
   - **약한 신호**: 강한 신호가 거의 없을 때, 누적 글자 수가 일정 분량(예 ~500자)을
     넘는 지점의 다음 단락을 경계로 삼아 과도하지 않게 분할.

3. **소제목 텍스트 생성**
   - 강한 신호로 잡힌 섹션: 신호 라벨을 우선 사용(예: `1일차`, `오후`). 라벨 뒤에
     짧은 보조 문구가 있으면 함께(예: `1일차 — 도착`). 정규식 캡처 그룹 활용.
   - 신호 없는 섹션: 섹션 첫 text 블록의 첫 문장/첫 절을 다듬어 사용. 구두점
     (`.`, `!`, `?`, 줄바꿈) 기준으로 자르고 약 20자 초과면 말줄임표.
   - 빈 문자열이 되면 그 제안은 버린다.

4. **결과 검증**
   - 제안이 1개 이하이면 `[]` 반환(소제목 하나로는 목차 의미 없음).
   - 동일 `beforeBlockId` 중복 제거. 첫 블록 바로 앞 제안은 허용(글 맨 위 소제목).

> **한계 명시**: 규칙 기반이므로 LLM 같은 자유 요약/주제 추론은 못 한다. 여행 일기의
> 일차·시간대·장소 패턴에 최적화하며, 신호가 모호하면 보수적으로 "제안 안 함"을 택해
> 잘못된 소제목을 본문에 끼워 넣지 않는 쪽을 우선한다.

## 5. UI — `src/components/AutoTocModal.tsx`

- React Native `Modal` 기반. `BlogRecordScreen`의 기존 모달 스타일과 일관.
- Props:
  ```ts
  interface AutoTocModalProps {
    visible: boolean;
    suggestions: TocSuggestion[];
    onConfirm: (accepted: TocSuggestion[]) => void; // 추가하고 저장
    onSkip: () => void;                              // 목차 없이 저장
    onClose: () => void;                             // 뒤로(취소, 발행 안 함)
  }
  ```
- 내부 상태: 각 제안의 체크 여부(기본 전체 체크).
- 레이아웃: 제목("AI가 목차를 만들었어요") + 제안 소제목 리스트(체크박스 + 텍스트,
  level에 따라 들여쓰기) + 하단 버튼 2개.
- 디자인 토큰: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`,
  텍스트 흐림 `#A1A1B0`, 구분선 `#1A1A26`.

## 6. 화면 연동 — `src/screens/BlogRecordScreen.tsx` (수정)

- 상태 추가: `tocModalVisible`, `tocSuggestions`.
- `handleSave` 분기:
  1. 기존 필수 항목 검증 유지.
  2. `const suggestions = analyzeForToc(blocks);`
  3. `suggestions.length >= 2`이면 `setTocSuggestions(suggestions); setTocModalVisible(true);`
     하고 발행 보류.
  4. 아니면 기존대로 `addRecord(buildRecordData()); navigation.goBack();`.
- 모달 콜백:
  - `onConfirm(accepted)`: `const next = applyTocSuggestions(blocks, accepted);`
    → `setBlocks(next)` 후 `addRecord(buildRecordData())`로 발행. (또는
    `buildRecordData`가 인자로 블록을 받도록 소폭 조정해 최신 블록 반영.)
  - `onSkip`: 원본 블록으로 발행.
  - `onClose`: 모달만 닫고 작성 화면 유지.

> 주의: `setBlocks`는 비동기 반영이므로, 발행에 쓰는 블록 배열은 `applyTocSuggestions`
> 결과를 직접 사용한다(상태 갱신을 기다리지 않음). 구현 시 `buildRecordData`에
> 블록을 주입할 수 있도록 다룬다.

## 7. 변경하지 않는 것

- `src/types/blogBlocks.ts`: `createHeadingBlock`, `extractHeadings`, `HeadingLevel`
  재사용. 변경 없음.
- `src/screens/PostDetailScreen.tsx`: 목차는 heading 블록에서 자동 생성되므로 변경 없음.

## 8. 검증 (CLAUDE.md 규칙)

- `npx tsc --noEmit` 타입 통과.
- `analyzeForToc` / `applyTocSuggestions` 단위 동작 확인: 짧은 글 → `[]`, 일차/시간대
  신호 글 → 제안 생성, 기존 heading 많은 글 → `[]`.
- 호환성: 공통 모달·네비게이션·상태와 충돌 없는지 확인. 임시저장(draft) 흐름은
  영향받지 않음(분석은 발행 시점에만 실행).

## 9. 범위 밖 (YAGNI)

- 네트워크 LLM 연동, 다국어 요약.
- 설정 화면의 기능 on/off 토글(미리보기 모달이 이미 사용자 통제권 제공).
- 목차 항목 텍스트의 인라인 수정 UI(v1은 체크/해제만; 발행 후 본문에서 직접 수정 가능).
