# 사진 AI 기록 형식 추천 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진첩(앨범) 저장 시 온디바이스 AI가 사진을 분석해, 그 사진들로 만들면 좋을 피드·블로그·스트립 기록을 "사진 묶음+컨셉+프리필" 카드로 TripDetail에 추천한다.

**Architecture:** 기존 `modules/photo-vision`(iOS Vision / Android ML Kit)을 확장해 장면 라벨·색감·dHash·얼굴 수·텍스트 유무를 추가로 뽑고, `src/services/photoAI/`에 순수 함수 계층(라벨 매핑 → 컨셉 판정 → 형식별 후보 생성 → 개인화 재순위)을 쌓는다. 앨범 저장 직후 fire-and-forget으로 엔진을 돌려 결과를 AsyncStorage에 저장하고, TripDetailScreen이 카드를 렌더해 작성 화면 3종에 프리필 파라미터로 넘긴다. 유도 퍼널(귀국 알림 라우팅 + FAB 배지)은 독립 동작.

**Tech Stack:** React Native (Expo SDK54), TypeScript, expo-modules-core(Swift/Kotlin), AsyncStorage, i18next. 테스트는 jest가 아니라 저장소 자체 verify 러너(`npm test` → `scripts/run-verify.mjs` → tsx).

**설계 문서:** `docs/superpowers/specs/2026-08-31-photo-ai-format-recommendation-design.md`

## Global Constraints

- 모든 코드 주석·문구·커밋 메시지 설명은 한글 (CLAUDE.md).
- 각 태스크 완료 시 `npx tsc --noEmit` 통과 필수 (CLAUDE.md 검증 규칙).
- verify 파일은 RN을 import하지 않는 순수 모듈만 대상. 단독 실행: `node node_modules/tsx/dist/cli.mjs <파일>` (경로 공백 때문에 tsx.cmd 직접 실행 금지). 작성 규약은 `eorth-verify-authoring` 스킬을 따를 것. 파일 1행은 자기 경로 주석, `eq()` 패턴, 실패 시 `process.exit(1)`.
- **⚠️ 작업트리에 사용자 WIP가 있다** (`src/constants/featureFlags.ts`, `src/screens/SocialScreen.tsx`, `src/utils/feedWindow*.ts`). 커밋은 반드시 파일 단위 스테이징. **`featureFlags.ts`는 어떤 커밋에도 포함하지 말 것** — 새 플래그를 추가하되 커밋하지 않고, 최종 보고에 "featureFlags.ts는 사용자 WIP와 얽혀 미커밋" 명시.
- 네이티브 코드는 EAS 빌드 전까지 실행 불가. Expo Go/구 빌드에서 새 필드는 `undefined` → JS는 전부 옵셔널 처리(중립값 폴백).
- 사진·신호는 절대 기기 밖으로 전송하지 않는다. 서버 코드·schema 수정 없음.
- 색상은 디자인 토큰(배경 #0A0A0F, 카드 #2E2E3B, 보라 네온 #BF85FC, 텍스트 흐림 #A1A1B0) 준수. 댓글 아이콘 규칙은 이 기능과 무관.
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **설계 대비 의도된 축소 4건** (최종 보고에 명시할 것): ① 동일 인물 클러스터링(faceIds)은 iOS/Android 모두 공개 API에 얼굴 임베딩이 없어 v1에서는 `faceCount`(투샷 판정)로 대체 — 스트립 "동행 투샷 변형 후보"도 faceCount 기반 fun 가중으로 갈음. ② 개인화의 "과거 게시물 무드 분포"는 과거 사진 재분석 비용 때문에 v1은 형식 사용 빈도만 반영(타입에 `conceptHist?` 자리만 예약). ③ EXIF 심화(초점거리·조리개)와 POI 카테고리는 v1 미포함 — 연사 판정은 dHash 중복 제거가, 야간 판정은 colorStats.darkness가 대체하며, iOS EXIF는 장당 원본 I/O 15.5ms라 100장 앨범에 비용 대비 효과가 낮다. ④ 이미지 지문은 iOS featurePrint 대신 양 플랫폼 동일 dHash 알고리즘 채택(파리티 우선, 설계의 "지각 해시 폴백"을 양쪽 공통으로 승격). 분석 실행 시점도 배터리 게이트 없이 즉시 실행 — 사용자가 방금 앨범을 만든 능동 사용 시점이라 백그라운드 제약(Wi-Fi·충전) 게이트가 과함(저전력 모드 지연은 2차 검토).

---

### Task 1: 추천 공용 타입 + 지문 유틸 + 저장소 + 플래그

**Files:**
- Create: `src/services/photoAI/recoTypes.ts`
- Create: `src/services/photoAI/recoTypes.verify.ts`
- Create: `src/services/photoAI/recoStorage.ts`
- Modify: `src/services/photoAI/types.ts` (PhotoSignal 추가)
- Modify: `src/constants/featureFlags.ts` (플래그 추가 — **커밋 제외**)

**Interfaces:**
- Consumes: `PhotoMeta`(types.ts), AsyncStorage envelope 패턴(photoAIStorage.ts)
- Produces: `RecoConcept`, `RecoViewType`, `RecoCandidate`, `RecoBlogSeed`, `RecoCard`, `RecoState`, `RecoLogEvent`, `mediasFingerprint(medias: string[]): string`, `getRecoState(albumRecordId)`, `saveRecoState(state)`, `dismissRecoCard(albumRecordId, cardId)`, `appendRecoLog(event)`, `PhotoSignal`, `FORMAT_RECO_ENABLED`

- [ ] **Step 1: `src/services/photoAI/recoTypes.ts` 작성**

```ts
/**
 * 기록 형식 추천 — 공용 타입 + 순수 유틸
 *
 * 추천 카드의 생명주기:
 *  앨범 저장 → recoEngine이 RecoState(status:'pending') 저장 → 분석 완료 시 'ready'+cards
 *  → TripDetail 렌더 시 mediasFingerprint로 앨범 변경 감지(불일치 = 재분석)
 */

export type RecoViewType = 'feed' | 'blog' | 'cut';

/** 컨셉(무드) 5종 — 설계 문서 §4 */
export type RecoConcept = 'emotional' | 'hip' | 'fun' | 'food' | 'info';

export type ConceptScores = Record<RecoConcept, number>;

export const RECO_CONCEPTS: RecoConcept[] = ['emotional', 'hip', 'fun', 'food', 'info'];

/** 블로그 프리필 씨앗 — 화면에서 createHeadingBlock/createImagesBlock으로 변환 */
export type RecoBlogSeed =
  | { kind: 'heading'; dayIndex: number }
  | { kind: 'images'; uris: string[]; layout: 'single' | 'grid2' | 'grid3' };

export interface RecoCandidate {
  id: string;                 // `${viewType}_${concept}_${순번}` — 결정론적
  viewType: RecoViewType;
  concept: RecoConcept;
  photoUris: string[];        // 앨범 medias 부분집합, 프리필 순서
  blogSeeds?: RecoBlogSeed[]; // viewType==='blog' 전용
  score: number;              // 0~1+, 재순위 입력
  reasonKey: string;          // i18n 키: `reco.reason.${viewType}_${concept}`
  reasonParams?: Record<string, string | number>;
}

export interface RecoCard extends RecoCandidate {
  createdAt: number;
}

export interface RecoState {
  albumRecordId: string;
  mediasFingerprint: string;
  status: 'pending' | 'ready' | 'unavailable';
  cards: RecoCard[];
  dismissedIds: string[];
  updatedAt: number;
}

export interface RecoLogEvent {
  event: 'impression' | 'accept' | 'dismiss' | 'edit_after_accept';
  cardId: string;
  viewType: RecoViewType;
  concept: RecoConcept;
  photoCountSuggested: number;
  photoCountUsed?: number;
  ts: number;
}

/**
 * medias 배열의 지문 (djb2). 앨범 사진 추가/삭제/순서변경 감지용.
 * 순서까지 포함해야 "이어 담기"도 무효화된다.
 */
export function mediasFingerprint(medias: string[]): string {
  let h = 5381;
  const joined = medias.join('|');
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return `${medias.length}:${(h >>> 0).toString(36)}`;
}

/** dHash 16진수 문자열 두 개의 해밍 거리. 파싱 불가 시 최대값 64 */
export function dhashHamming(a?: string, b?: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const xa = parseInt(a[i], 16);
    const xb = parseInt(b[i], 16);
    if (Number.isNaN(xa) || Number.isNaN(xb)) return 64;
    let x = xa ^ xb;
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}
```

- [ ] **Step 2: `src/services/photoAI/types.ts`에 PhotoSignal 추가**

`PhotoSemantic` 인터페이스 아래에 추가하고, `PhotoMeta`에 `signal?: PhotoSignal;` 필드를 `semantic?` 다음 줄에 추가:

```ts
// ─── 확장 신호 (형식 추천용, 네이티브 확장 필드 — 구 빌드에선 전부 undefined) ───
export interface PhotoSignal {
  sceneLabels?: { label: string; confidence: number }[]; // 플랫폼 원시 라벨 상위 10개
  faceCount?: number;      // 얼굴 수 (0=없음)
  hasText?: boolean;       // 메뉴판/표지판 등 문자 존재
  colorStats?: {
    saturation: number;    // 0~1 평균 채도
    warmth: number;        // 0~1 (0.5=중립, 클수록 따뜻)
    contrast: number;      // 0~1 명암 대비
    darkness: number;      // 0~1 어두운 픽셀 비율
  };
  dhash?: string;          // 64bit 지각 해시 16진수 16자 (근접 중복 판정)
}
```

- [ ] **Step 3: `recoTypes.verify.ts` 작성 후 실행**

```ts
// src/services/photoAI/recoTypes.verify.ts
import { mediasFingerprint, dhashHamming } from './recoTypes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── mediasFingerprint ──
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['a', 'b']), true, '같은 입력 = 같은 지문');
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['b', 'a']), false, '순서 변경 감지');
eq(mediasFingerprint(['a']) === mediasFingerprint(['a', 'b']), false, '추가 감지');
eq(mediasFingerprint([]).startsWith('0:'), true, '빈 배열도 안전');

// ── dhashHamming ──
eq(dhashHamming('0000000000000000', '0000000000000000'), 0, '동일 해시 거리 0');
eq(dhashHamming('0000000000000000', 'ffffffffffffffff'), 64, '반전 해시 거리 64');
eq(dhashHamming('0000000000000000', '0000000000000001'), 1, '1비트 차이');
eq(dhashHamming(undefined, '0000000000000000'), 64, 'undefined는 최대 거리');
eq(dhashHamming('짧음', '0000000000000000'), 64, '형식 불량은 최대 거리');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoTypes.verify.ts`
Expected: ✅ 모든 검증 통과

- [ ] **Step 4: `src/services/photoAI/recoStorage.ts` 작성**

photoAIStorage.ts와 같은 envelope 패턴. 카드 상태는 앨범 record id별 키, 로그는 단일 키에 최대 500건:

```ts
/**
 * 형식 추천 — 로컬 저장소 (AsyncStorage)
 * 사진·신호·추천은 전부 로컬에만 저장한다(서버 전송 없음).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecoLogEvent, RecoState } from './recoTypes';

export const RECO_SCHEMA_VERSION = 1;
const stateKey = (albumRecordId: string) => `@photoAI/reco/${albumRecordId}`;
const LOG_KEY = '@photoAI/recoLog';
const LOG_MAX = 500;

interface Envelope<T> { version: number; updatedAt: number; payload: T }

async function readEnvelope<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== RECO_SCHEMA_VERSION) return null;
    return env.payload;
  } catch { return null; }
}
async function writeEnvelope<T>(key: string, payload: T): Promise<void> {
  const env: Envelope<T> = { version: RECO_SCHEMA_VERSION, updatedAt: Date.now(), payload };
  await AsyncStorage.setItem(key, JSON.stringify(env));
}

export function getRecoState(albumRecordId: string): Promise<RecoState | null> {
  return readEnvelope<RecoState>(stateKey(albumRecordId));
}
export function saveRecoState(state: RecoState): Promise<void> {
  return writeEnvelope(stateKey(state.albumRecordId), state);
}

/** 카드 닫기 — dismissedIds에 추가 (재노출 방지) */
export async function dismissRecoCard(albumRecordId: string, cardId: string): Promise<void> {
  const state = await getRecoState(albumRecordId);
  if (!state || state.dismissedIds.includes(cardId)) return;
  await saveRecoState({ ...state, dismissedIds: [...state.dismissedIds, cardId] });
}

/** 사용 로그 — v1은 수집만, 소비하지 않음 (설계 §8) */
export async function appendRecoLog(event: RecoLogEvent): Promise<void> {
  const log = (await readEnvelope<RecoLogEvent[]>(LOG_KEY)) ?? [];
  log.push(event);
  await writeEnvelope(LOG_KEY, log.slice(-LOG_MAX));
}
export function getRecoLog(): Promise<RecoLogEvent[] | null> {
  return readEnvelope<RecoLogEvent[]>(LOG_KEY);
}
```

- [ ] **Step 5: `src/constants/featureFlags.ts`에 플래그 추가 (커밋 금지)**

파일 끝에 기존 규약(근거 JSDoc)대로 추가:

```ts
/**
 * 사진 AI 기록 형식 추천 (2026-08-31)
 * - 앨범 저장 시 온디바이스 분석 → TripDetail 추천 카드.
 * - 네이티브 photo-vision 확장이 없는 빌드에선 어차피 섹션 미노출이므로 JS 킬스위치 용도.
 * - 끄면: 분석 트리거·추천 섹션·FAB 배지가 전부 비활성화된다.
 */
export const FORMAT_RECO_ENABLED = true;
```

- [ ] **Step 6: 타입 체크 후 커밋**

Run: `npx tsc --noEmit` → 오류 0.
Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoTypes.verify.ts` → 통과.

```bash
git add src/services/photoAI/recoTypes.ts src/services/photoAI/recoTypes.verify.ts src/services/photoAI/recoStorage.ts src/services/photoAI/types.ts
git commit -m "feat(photoAI): 형식 추천 공용 타입·지문 유틸·로컬 저장소

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
(featureFlags.ts는 의도적으로 제외)

---

### Task 2: 네이티브 JS 바인딩 확장 + 신호 매핑

**Files:**
- Modify: `modules/photo-vision/index.ts`
- Modify: `src/services/photoAI/qualityAssessment.ts:141-161` (매핑 지점)

**Interfaces:**
- Consumes: `PhotoSignal`(Task 1), 기존 `NativePhotoAnalysis`
- Produces: `NativePhotoAnalysis`의 확장 옵셔널 필드(`sceneLabels?`, `faceCount?`, `hasText?`, `colorStats?`, `dhash?`) — Task 3·4 네이티브가 채우고, `assessPhotoQuality`가 `PhotoMeta.signal`로 옮긴다

- [ ] **Step 1: `modules/photo-vision/index.ts`의 `NativePhotoAnalysis`에 옵셔널 필드 추가**

`error?: string | null;` 윗줄에 삽입:

```ts
  // ─ 확장 신호 (형식 추천, 2026-08-31) — 구 네이티브 빌드에선 undefined ─
  sceneLabels?: { label: string; confidence: number }[]; // 플랫폼 원시 라벨 상위 10
  faceCount?: number;
  hasText?: boolean;
  colorStats?: { saturation: number; warmth: number; contrast: number; darkness: number };
  dhash?: string;          // 16진수 16자
```

- [ ] **Step 2: `qualityAssessment.ts` 매핑 확장**

`target.semantic = {...}` 블록(현재 152~160행) 바로 다음에 추가:

```ts
        // 확장 신호 → PhotoMeta.signal (구 네이티브면 필드가 없어 undefined 그대로)
        target.signal = {
          sceneLabels: raw.sceneLabels,
          faceCount: raw.faceCount,
          hasText: raw.hasText,
          colorStats: raw.colorStats,
          dhash: raw.dhash,
        };
```

import 줄의 타입은 이미 `NativePhotoAnalysis`를 쓰므로 변경 불필요.

- [ ] **Step 3: 타입 체크 후 커밋**

Run: `npx tsc --noEmit` → 오류 0.

```bash
git add modules/photo-vision/index.ts src/services/photoAI/qualityAssessment.ts
git commit -m "feat(photo-vision): 확장 신호 JS 바인딩 + PhotoMeta.signal 매핑

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: iOS 네이티브 확장 (Swift)

**Files:**
- Modify: `modules/photo-vision/ios/PhotoVisionAnalyzer.swift`

**Interfaces:**
- Produces: `analyze(uri:)` 반환 dict에 `sceneLabels`(`[[String:Any]]`), `faceCount`(Int), `hasText`(Bool), `colorStats`(`[String:Double]`), `dhash`(String) 키 추가 — Task 2 바인딩과 키·타입 일치 필수

주의: 이 태스크는 컴파일 검증을 로컬에서 못 한다(로컬 prebuild 금지 — 메모리 `eorth-local-build-pitfalls`). 코드 리뷰 수준으로 작성하고, EAS dev 빌드에서 실기기 검증(Task 12 체크리스트).

- [ ] **Step 1: `PhotoAnalysis` struct에 필드 + toDict 추가**

```swift
    // ─ 확장 신호 (형식 추천, 2026-08-31) ─
    var sceneLabels: [[String: Any]] = []
    var faceCount: Int = 0
    var hasText: Bool = false
    var colorStats: [String: Double] = [:]
    var dhash: String = ""
```

`toDict()` 딕셔너리에 추가:

```swift
            "sceneLabels": sceneLabels,
            "faceCount": faceCount,
            "hasText": hasText,
            "colorStats": colorStats,
            "dhash": dhash,
```

- [ ] **Step 2: `analyze(uri:)` 본문 확장**

그레이스케일 버퍼 계산 블록(`if let gray = ...`) 안에서 dhash도 계산하도록 수정:

```swift
        if let gray = grayscaleBuffer(from: cgImage, edge: grayEdge) {
            result.meanLuminance = meanLuminance(gray.pixels)
            result.blurVariance = laplacianVariance(gray.pixels, width: gray.width, height: gray.height)
            result.dhash = differenceHash(from: cgImage)
        } else {
            result.error = "GRAYSCALE_FAILED"
        }
```

`// 4) 의미 분석` 블록을 다음으로 교체 (분류 결과를 라벨 목록으로도 재사용):

```swift
        // 4) 의미 분석 + 확장 신호 — 문서가 아닐 때만 (영수증/지도엔 불필요)
        result.colorStats = colorStatistics(from: cgImage)
        if !result.isUtility {
            result.faceCount = countFaces(in: cgImage)
            result.hasFace = result.faceCount > 0
            result.hasText = detectTextPresence(in: cgImage)
            let cls = classifyWithLabels(image: cgImage)
            result.isFood = cls.food
            result.isLandscape = cls.landscape
            result.isLandmark = cls.landmark
            result.sceneLabels = cls.topLabels
        }
```

- [ ] **Step 3: 신규 private 함수 추가**

기존 `detectFace`를 `countFaces`로 대체(기존 함수는 삭제)하고 아래를 추가:

```swift
    /// 얼굴 수 (iOS 13+)
    private static func countFaces(in image: CGImage) -> Int {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            return request.results?.count ?? 0
        } catch { return 0 }
    }

    /// 문자 존재 여부 — 텍스트 사각형 3개 이상이면 true (메뉴판/표지판)
    private static func detectTextPresence(in image: CGImage) -> Bool {
        let request = VNDetectTextRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            return (request.results?.count ?? 0) >= 3
        } catch { return false }
    }

    /// 분류를 1회 수행해 카테고리 불리언 + 상위 10 라벨을 함께 반환
    private static func classifyWithLabels(image: CGImage)
        -> (food: Bool, landscape: Bool, landmark: Bool, topLabels: [[String: Any]]) {
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            guard let observations = request.results else { return (false, false, false, []) }

            // 상위 10 라벨 (신뢰도 0.3 이상만 — JS labelTaxonomy가 추가 필터)
            let top = observations
                .filter { $0.confidence > 0.3 }
                .sorted { $0.confidence > $1.confidence }
                .prefix(10)
                .map { ["label": $0.identifier.lowercased(), "confidence": Double($0.confidence)] as [String: Any] }

            let strong = observations
                .filter { $0.confidence > 0.6 }
                .map { $0.identifier.lowercased() }
            let hit = { (keys: [String]) -> Bool in
                strong.contains { id in keys.contains { id.contains($0) } }
            }
            return (hit(foodKeywords), hit(landscapeKeywords), hit(landmarkKeywords), Array(top))
        } catch {
            return (false, false, false, [])
        }
    }

    /// 색감 통계 — 64px RGBA 버퍼에서 채도/색온도/대비/어두움 계산
    private static func colorStatistics(from image: CGImage) -> [String: Double] {
        let edge = 64
        let ratio = min(1.0, Double(edge) / Double(max(image.width, image.height)))
        let w = max(1, Int(Double(image.width) * ratio))
        let h = max(1, Int(Double(image.height) * ratio))

        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(
            data: &pixels, width: w, height: h,
            bitsPerComponent: 8, bytesPerRow: w * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return [:] }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

        let n = w * h
        var satSum = 0.0, warmSum = 0.0, lumSum = 0.0, lumSqSum = 0.0
        var darkCount = 0
        for i in 0..<n {
            let r = Double(pixels[i * 4]) / 255.0
            let g = Double(pixels[i * 4 + 1]) / 255.0
            let b = Double(pixels[i * 4 + 2]) / 255.0
            let maxC = max(r, g, b), minC = min(r, g, b)
            satSum += maxC == 0 ? 0 : (maxC - minC) / maxC   // HSV 채도
            warmSum += (r - b + 1.0) / 2.0                    // 0~1, 0.5 중립
            let lum = 0.299 * r + 0.587 * g + 0.114 * b
            lumSum += lum
            lumSqSum += lum * lum
            if lum < 0.235 { darkCount += 1 }                 // 60/255
        }
        let dn = Double(n)
        let lumMean = lumSum / dn
        let variance = max(0, lumSqSum / dn - lumMean * lumMean)
        return [
            "saturation": satSum / dn,
            "warmth": warmSum / dn,
            "contrast": min(1.0, variance.squareRoot() * 4.0), // stddev 0.25↑ = 대비 최고
            "darkness": Double(darkCount) / dn,
        ]
    }

    /// dHash — 9x8 그레이스케일에서 가로 인접 픽셀 비교, 64bit 16진수 16자
    private static func differenceHash(from image: CGImage) -> String {
        let w = 9, h = 8
        var px = [UInt8](repeating: 0, count: w * h)
        guard let ctx = CGContext(
            data: &px, width: w, height: h,
            bitsPerComponent: 8, bytesPerRow: w,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return "" }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

        var bits: UInt64 = 0
        for y in 0..<h {
            for x in 0..<(w - 1) {
                bits <<= 1
                if px[y * w + x] > px[y * w + x + 1] { bits |= 1 }
            }
        }
        return String(format: "%016llx", bits)
    }
```

- [ ] **Step 4: 커밋**

```bash
git add modules/photo-vision/ios/PhotoVisionAnalyzer.swift
git commit -m "feat(photo-vision/ios): 장면 라벨·색감·dHash·얼굴수·텍스트 신호 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Android 네이티브 확장 (Kotlin)

**Files:**
- Modify: `modules/photo-vision/android/src/main/java/expo/modules/photovision/PhotoVisionAnalyzer.kt`

**Interfaces:**
- Produces: iOS(Task 3)와 동일 키·타입의 Map 항목: `sceneLabels`(List<Map>), `faceCount`(Int), `hasText`(Boolean), `colorStats`(Map<String,Double>), `dhash`(String)

- [ ] **Step 1: 결과 맵 기본값 추가**

`result` 초기 hashMapOf에 추가:

```kotlin
            // ─ 확장 신호 (형식 추천, 2026-08-31) ─
            "sceneLabels" to emptyList<Map<String, Any>>(),
            "faceCount" to 0,
            "hasText" to false,
            "colorStats" to emptyMap<String, Double>(),
            "dhash" to "",
```

- [ ] **Step 2: `analyze()` 본문 확장**

`try` 블록을 다음 구조로 수정 (텍스트 인식 1회로 isUtility·hasText 동시 판정, 분류 1회로 카테고리·라벨 동시 획득):

```kotlin
        try {
            val gray = toGray(bitmap, GRAY_EDGE)
            result["meanLuminance"] = meanLuminance(gray.lum)
            result["blurVariance"] = laplacianVariance(gray.lum, gray.width, gray.height)
            result["dhash"] = differenceHash(bitmap)
            result["colorStats"] = colorStatistics(bitmap)

            val image = InputImage.fromBitmap(bitmap, 0)
            val textLen = recognizedTextLength(image)
            val isUtility = textLen >= UTILITY_TEXT_LEN
            result["isUtility"] = isUtility

            if (!isUtility) {
                result["hasText"] = textLen >= 20   // 메뉴판/표지판 수준
                val faces = detectFaces(image)
                result["faceCount"] = faces.first
                result["hasFace"] = faces.first > 0
                result["isSmiling"] = faces.second
                val cls = classifyImageWithLabels(image)
                result["isFood"] = cls.food
                result["isLandscape"] = cls.landscape
                result["isLandmark"] = cls.landmark
                result["sceneLabels"] = cls.topLabels
            }
        } catch (e: Exception) {
```

- [ ] **Step 3: 함수 교체·추가**

`detectUtility`를 `recognizedTextLength`로, `detectFace`를 `detectFaces`로, `classifyImage`를 `classifyImageWithLabels`로 대체(기존 3개 삭제):

```kotlin
    // ─── 인식된 텍스트 길이(공백 제외) — isUtility·hasText 공용 ───
    private fun recognizedTextLength(image: InputImage): Int {
        return try {
            val visionText = Tasks.await(textRecognizer.process(image))
            visionText.text.replace(Regex("\\s"), "").length
        } catch (e: Exception) { 0 }
    }

    // ─── 얼굴 수 + 웃음 → (faceCount, isSmiling) ───
    private fun detectFaces(image: InputImage): Pair<Int, Boolean> {
        return try {
            val faces = Tasks.await(faceDetector.process(image))
            val smiling = faces.any { (it.smilingProbability ?: 0f) >= SMILE_PROB }
            Pair(faces.size, smiling)
        } catch (e: Exception) { Pair(0, false) }
    }

    // ─── 분류 1회 → 카테고리 + 상위 10 라벨 ───
    private data class ClassLabels(
        val food: Boolean, val landscape: Boolean, val landmark: Boolean,
        val topLabels: List<Map<String, Any>>
    )

    private fun classifyImageWithLabels(image: InputImage): ClassLabels {
        return try {
            val all = Tasks.await(imageLabeler.process(image))
            val topLabels = all
                .filter { it.confidence >= 0.3f }
                .sortedByDescending { it.confidence }
                .take(10)
                .map { mapOf<String, Any>("label" to it.text.lowercase(), "confidence" to it.confidence.toDouble()) }

            val strong = all.filter { it.confidence >= LABEL_CONFIDENCE }.map { it.text.lowercase() }
            fun hit(keys: List<String>) = strong.any { label -> keys.any { label.contains(it) } }
            ClassLabels(hit(FOOD_KEYWORDS), hit(LANDSCAPE_KEYWORDS), hit(LANDMARK_KEYWORDS), topLabels)
        } catch (e: Exception) {
            ClassLabels(false, false, false, emptyList())
        }
    }

    // ─── 색감 통계 — 64px 축소본에서 채도/색온도/대비/어두움 ───
    private fun colorStatistics(bitmap: Bitmap): Map<String, Double> {
        val edge = 64
        val ratio = min(1.0, edge.toDouble() / max(bitmap.width, bitmap.height))
        val w = max(1, (bitmap.width * ratio).toInt())
        val h = max(1, (bitmap.height * ratio).toInt())
        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        val argb = IntArray(w * h)
        scaled.getPixels(argb, 0, w, 0, 0, w, h)
        if (scaled != bitmap) scaled.recycle()

        var satSum = 0.0; var warmSum = 0.0; var lumSum = 0.0; var lumSqSum = 0.0
        var darkCount = 0
        for (c in argb) {
            val r = ((c shr 16) and 0xFF) / 255.0
            val g = ((c shr 8) and 0xFF) / 255.0
            val b = (c and 0xFF) / 255.0
            val maxC = maxOf(r, g, b); val minC = minOf(r, g, b)
            satSum += if (maxC == 0.0) 0.0 else (maxC - minC) / maxC
            warmSum += (r - b + 1.0) / 2.0
            val lum = 0.299 * r + 0.587 * g + 0.114 * b
            lumSum += lum
            lumSqSum += lum * lum
            if (lum < 0.235) darkCount++
        }
        val n = argb.size.toDouble()
        val lumMean = lumSum / n
        val variance = max(0.0, lumSqSum / n - lumMean * lumMean)
        return mapOf(
            "saturation" to satSum / n,
            "warmth" to warmSum / n,
            "contrast" to min(1.0, Math.sqrt(variance) * 4.0),
            "darkness" to darkCount / n,
        )
    }

    // ─── dHash — 9x8 그레이스케일 가로 인접 비교, 64bit 16진수 16자 (iOS와 동일 알고리즘) ───
    private fun differenceHash(bitmap: Bitmap): String {
        val w = 9; val h = 8
        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        val argb = IntArray(w * h)
        scaled.getPixels(argb, 0, w, 0, 0, w, h)
        if (scaled != bitmap) scaled.recycle()

        val lum = IntArray(w * h)
        for (i in argb.indices) {
            val c = argb[i]
            lum[i] = (((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        }
        var bits = 0L
        for (y in 0 until h) {
            for (x in 0 until w - 1) {
                bits = bits shl 1
                if (lum[y * w + x] > lum[y * w + x + 1]) bits = bits or 1L
            }
        }
        return String.format("%016x", bits)
    }
```

- [ ] **Step 4: 커밋**

```bash
git add "modules/photo-vision/android/src/main/java/expo/modules/photovision/PhotoVisionAnalyzer.kt"
git commit -m "feat(photo-vision/android): 장면 라벨·색감·dHash·얼굴수·텍스트 신호 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 라벨 매핑 테이블 (labelTaxonomy)

**Files:**
- Create: `src/services/photoAI/labelTaxonomy.ts`
- Create: `src/services/photoAI/labelTaxonomy.verify.ts`

**Interfaces:**
- Consumes: `RecoConcept`, `ConceptScores`(Task 1), `PhotoSignal['sceneLabels']`
- Produces: `conceptAffinityFromLabels(labels: {label: string; confidence: number}[] | undefined): ConceptScores` — iOS(1,300 라벨)·Android(400 라벨) 원시 라벨을 공통 컨셉 점수로 변환. **플랫폼 간 차이는 이 파일에서만 발생** (설계 §3)

- [ ] **Step 1: `labelTaxonomy.verify.ts` 먼저 작성 (실패 확인)**

```ts
// src/services/photoAI/labelTaxonomy.verify.ts
import { conceptAffinityFromLabels } from './labelTaxonomy';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}
function gt(actual: number, threshold: number, msg: string) {
  if (actual > threshold) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}\n   expected > ${threshold}\n   got      ${actual}`); }
}

// ── 석양/해변 → emotional 우세 ──
const sunset = conceptAffinityFromLabels([
  { label: 'sunset', confidence: 0.9 },
  { label: 'beach', confidence: 0.7 },
]);
gt(sunset.emotional, sunset.hip, '석양+해변은 emotional > hip');
gt(sunset.emotional, 0, 'emotional 양수');

// ── 야경/네온 → hip 우세 ──
const night = conceptAffinityFromLabels([
  { label: 'nightlife', confidence: 0.8 },
  { label: 'neon', confidence: 0.6 },
  { label: 'city', confidence: 0.5 },
]);
gt(night.hip, night.emotional, '야경은 hip > emotional');

// ── 음식 → food ──
const food = conceptAffinityFromLabels([{ label: 'dessert', confidence: 0.9 }]);
gt(food.food, 0.3, '디저트는 food 강신호');

// ── 방어 ──
eq(conceptAffinityFromLabels(undefined), { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, 'undefined 안전');
eq(conceptAffinityFromLabels([]), { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, '빈 배열 안전');
eq(conceptAffinityFromLabels([{ label: 'zzz-unknown', confidence: 0.9 }]),
  { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, '미등록 라벨은 0');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/labelTaxonomy.verify.ts`
Expected: FAIL — "Cannot find module './labelTaxonomy'"

- [ ] **Step 2: `labelTaxonomy.ts` 구현**

```ts
/**
 * 라벨 매핑 테이블 — 플랫폼 원시 장면 라벨 → 공통 컨셉 점수
 *
 * iOS VNClassifyImageRequest(약 1,300 라벨)와 Android ML Kit(약 400 라벨)의
 * 라벨 체계가 다르다. 양쪽 라벨을 여기서만 해석해 파리티 차이를 이 파일 하나에 격리한다.
 * 매칭은 소문자 contains — 'sunset', 'sunsets', 'sunset_sky' 모두 잡는다.
 */
import type { ConceptScores, RecoConcept } from './recoTypes';

/** 키워드 → (컨셉, 가중치). 신뢰도와 곱해 누적된다. */
const KEYWORD_AFFINITY: [string, RecoConcept, number][] = [
  // ── emotional: 자연·노을·잔잔함 ──
  ['sunset', 'emotional', 0.6], ['sunrise', 'emotional', 0.6],
  ['beach', 'emotional', 0.4], ['sea', 'emotional', 0.35], ['ocean', 'emotional', 0.35],
  ['sky', 'emotional', 0.3], ['cloud', 'emotional', 0.3],
  ['mountain', 'emotional', 0.35], ['lake', 'emotional', 0.35], ['river', 'emotional', 0.3],
  ['forest', 'emotional', 0.35], ['flower', 'emotional', 0.35], ['nature', 'emotional', 0.3],
  ['snow', 'emotional', 0.3], ['field', 'emotional', 0.25], ['waterfall', 'emotional', 0.4],
  ['fog', 'emotional', 0.4], ['mist', 'emotional', 0.4],
  // ── hip: 야경·도시·네온·거리 ──
  ['night', 'hip', 0.5], ['neon', 'hip', 0.6], ['nightlife', 'hip', 0.6],
  ['city', 'hip', 0.3], ['street', 'hip', 0.3], ['skyline', 'hip', 0.4],
  ['concert', 'hip', 0.5], ['bar', 'hip', 0.35], ['club', 'hip', 0.35],
  ['skyscraper', 'hip', 0.35], ['graffiti', 'hip', 0.5], ['alley', 'hip', 0.4],
  // ── fun: 사람·이벤트·놀이 ──
  ['selfie', 'fun', 0.5], ['smile', 'fun', 0.5], ['people', 'fun', 0.3],
  ['crowd', 'fun', 0.3], ['party', 'fun', 0.5], ['festival', 'fun', 0.45],
  ['amusement', 'fun', 0.5], ['ride', 'fun', 0.3], ['dog', 'fun', 0.35], ['cat', 'fun', 0.35],
  // ── food ──
  ['food', 'food', 0.6], ['meal', 'food', 0.5], ['dish', 'food', 0.5],
  ['dessert', 'food', 0.55], ['cake', 'food', 0.5], ['coffee', 'food', 0.45],
  ['drink', 'food', 0.4], ['restaurant', 'food', 0.5], ['cafe', 'food', 0.45],
  ['fruit', 'food', 0.4], ['bread', 'food', 0.45], ['noodle', 'food', 0.5],
  ['sushi', 'food', 0.55], ['pizza', 'food', 0.5],
  // ── info: 랜드마크·구조물·전시 ──
  ['landmark', 'info', 0.55], ['monument', 'info', 0.5], ['castle', 'info', 0.5],
  ['temple', 'info', 0.5], ['church', 'info', 0.45], ['cathedral', 'info', 0.45],
  ['museum', 'info', 0.5], ['bridge', 'info', 0.4], ['tower', 'info', 0.4],
  ['statue', 'info', 0.45], ['palace', 'info', 0.5], ['architecture', 'info', 0.4],
  ['building', 'info', 0.25], ['sign', 'info', 0.3], ['map', 'info', 0.3],
];

export const ZERO_CONCEPT_SCORES: ConceptScores = {
  emotional: 0, hip: 0, fun: 0, food: 0, info: 0,
};

/**
 * 원시 라벨 배열 → 컨셉 점수. 신뢰도 가중 누적, 컨셉당 상한 1.0.
 * 라벨이 없으면(구 네이티브·미지원) 전부 0 — 호출부는 다른 신호로만 판정한다.
 */
export function conceptAffinityFromLabels(
  labels: { label: string; confidence: number }[] | undefined
): ConceptScores {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  if (!labels || labels.length === 0) return out;

  for (const { label, confidence } of labels) {
    if (!label || confidence <= 0) continue;
    const lower = label.toLowerCase();
    for (const [keyword, concept, weight] of KEYWORD_AFFINITY) {
      if (lower.includes(keyword)) {
        out[concept] = Math.min(1, out[concept] + weight * confidence);
      }
    }
  }
  return out;
}
```

- [ ] **Step 3: 실행·타입 체크·커밋**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/labelTaxonomy.verify.ts` → ✅
Run: `npx tsc --noEmit` → 오류 0.

```bash
git add src/services/photoAI/labelTaxonomy.ts src/services/photoAI/labelTaxonomy.verify.ts
git commit -m "feat(photoAI): 플랫폼 라벨 → 공통 컨셉 매핑 테이블

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 컨셉 판정기 (ConceptClassifier)

**Files:**
- Create: `src/services/photoAI/conceptClassifier.ts`
- Create: `src/services/photoAI/conceptClassifier.verify.ts`

**Interfaces:**
- Consumes: `PhotoMeta`(quality·semantic·signal 포함), `conceptAffinityFromLabels`(Task 5), `ConceptScores`
- Produces: `type ConceptClassifier = (photo: PhotoMeta) => ConceptScores` 와 기본 구현 `ruleConceptClassifier`, 보조 `topConcept(scores): { concept: RecoConcept; score: number }` — 2차에 CLIP 판정기로 교체 가능한 경계 (설계 §4)

- [ ] **Step 1: `conceptClassifier.verify.ts` 먼저 작성 (실패 확인)**

```ts
// src/services/photoAI/conceptClassifier.verify.ts
import { ruleConceptClassifier, topConcept } from './conceptClassifier';
import type { PhotoMeta } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const base = (over: Partial<PhotoMeta>): PhotoMeta => ({
  id: 'p1', uri: 'file:///p1.jpg', thumbnailUri: null,
  creationTime: 1756600000000, width: 100, height: 100, location: null, ...over,
});

// 석양 + 고미학 + 저채도·따뜻 → emotional
const emo = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  signal: {
    sceneLabels: [{ label: 'sunset', confidence: 0.9 }],
    colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 },
  },
}));
eq(topConcept(emo).concept, 'emotional', '석양·고미학·따뜻한 톤 = emotional');

// 야경 + 고대비 + 어두움 → hip
const hip = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'night', confidence: 0.8 }, { label: 'city', confidence: 0.6 }],
    colorStats: { saturation: 0.6, warmth: 0.4, contrast: 0.7, darkness: 0.55 },
  },
}));
eq(topConcept(hip).concept, 'hip', '야경·고대비·어두움 = hip');

// 웃는 얼굴 → fun
const fun = ruleConceptClassifier(base({
  semantic: { hasFace: true, isSmiling: true },
  signal: { faceCount: 2 },
}));
eq(topConcept(fun).concept, 'fun', '웃는 얼굴 = fun');

// 음식 + 텍스트(메뉴판) → food
const food = ruleConceptClassifier(base({
  semantic: { isFood: true },
  signal: { hasText: true },
}));
eq(topConcept(food).concept, 'food', '음식+메뉴판 = food');

// 랜드마크 + 텍스트 → info
const info = ruleConceptClassifier(base({
  semantic: { isLandmark: true },
  signal: { hasText: true },
}));
eq(topConcept(info).concept, 'info', '랜드마크+표지판 = info');

// 신호 전무(구 네이티브) → 전부 0이어도 크래시 없음
const empty = ruleConceptClassifier(base({}));
eq(Object.values(empty).every((v) => v === 0), true, '신호 없음 = 전부 0, 안전');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/conceptClassifier.verify.ts`
Expected: FAIL — "Cannot find module './conceptClassifier'"

- [ ] **Step 2: `conceptClassifier.ts` 구현**

```ts
/**
 * 컨셉(무드) 판정기 — 사진 1장의 신호를 컨셉 5종 점수로 변환
 *
 * ConceptClassifier는 교체 가능한 경계다: v1은 규칙 기반(ruleConceptClassifier),
 * 2차에 온디바이스 임베딩(CLIP류) 판정기로 이 타입만 맞춰 갈아끼운다. (설계 §4)
 */
import { conceptAffinityFromLabels, ZERO_CONCEPT_SCORES } from './labelTaxonomy';
import type { ConceptScores, RecoConcept } from './recoTypes';
import { RECO_CONCEPTS } from './recoTypes';
import type { PhotoMeta } from './types';

export type ConceptClassifier = (photo: PhotoMeta) => ConceptScores;

export const ruleConceptClassifier: ConceptClassifier = (photo) => {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  const s = photo.semantic;
  const g = photo.signal;
  const cs = g?.colorStats;

  // 1) 장면 라벨 기여 (가장 큰 재료)
  const label = conceptAffinityFromLabels(g?.sceneLabels);
  for (const c of RECO_CONCEPTS) out[c] += label[c];

  // 2) emotional: 미학 + 저채도·따뜻한 톤, 풍경
  const aesthetics = photo.quality?.aestheticsScore;
  if (aesthetics !== undefined && aesthetics > 0.6) out.emotional += 0.2;
  if (cs && cs.saturation < 0.35 && cs.warmth > 0.55) out.emotional += 0.15;
  if (s?.isLandscape) out.emotional += 0.15;

  // 3) hip: 어두움 + 고대비
  if (cs && cs.darkness > 0.4) out.hip += 0.2;
  if (cs && cs.contrast > 0.5) out.hip += 0.15;

  // 4) fun: 얼굴·웃음 (미학 점수 무관 — 설계 §4)
  if (s?.isSmiling) out.fun += 0.4;
  else if (s?.hasFace) out.fun += 0.2;
  if ((g?.faceCount ?? 0) >= 2) out.fun += 0.15;

  // 5) food: 음식 + 메뉴판 텍스트
  if (s?.isFood) out.food += 0.5;
  if (s?.isFood && g?.hasText) out.food += 0.1;

  // 6) info: 랜드마크 + 텍스트(표지판/안내판)
  if (s?.isLandmark) out.info += 0.3;
  if (g?.hasText) out.info += 0.2;

  // 상한 1.0
  for (const c of RECO_CONCEPTS) out[c] = Math.min(1, out[c]);
  return out;
};

/** 최고 점수 컨셉. 동률이면 RECO_CONCEPTS 순서 우선 */
export function topConcept(scores: ConceptScores): { concept: RecoConcept; score: number } {
  let best: RecoConcept = RECO_CONCEPTS[0];
  for (const c of RECO_CONCEPTS) {
    if (scores[c] > scores[best]) best = c;
  }
  return { concept: best, score: scores[best] };
}
```

- [ ] **Step 3: 실행·타입 체크·커밋**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/conceptClassifier.verify.ts` → ✅
Run: `npx tsc --noEmit` → 오류 0.

```bash
git add src/services/photoAI/conceptClassifier.ts src/services/photoAI/conceptClassifier.verify.ts
git commit -m "feat(photoAI): 규칙 기반 컨셉 판정기 (교체 가능 인터페이스)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 형식별 후보 생성기 3종

**Files:**
- Create: `src/services/photoAI/formatCandidates.ts`
- Create: `src/services/photoAI/formatCandidates.verify.ts`

**Interfaces:**
- Consumes: `PhotoMeta`, `SpotGroup`, `scorePhoto`(bestCutSelector), `ConceptScores`, `topConcept`, `dhashHamming`, `RecoCandidate`, `RecoBlogSeed`
- Produces:
  - `stripCandidates(photos: PhotoMeta[], groups: SpotGroup[], concepts: Map<string, ConceptScores>, slotCounts: number[]): RecoCandidate[]`
  - `feedCandidates(photos: PhotoMeta[], concepts: Map<string, ConceptScores>): RecoCandidate[]`
  - `blogCandidates(photos: PhotoMeta[], groups: SpotGroup[], concepts: Map<string, ConceptScores>): RecoCandidate[]`
  - `dedupeByDhash(photos: PhotoMeta[], maxDistance?: number): PhotoMeta[]` (점수 높은 쪽 유지)

  `concepts`의 키는 `PhotoMeta.id`. `photoUris`는 `PhotoMeta.uri`에서 취한다.

- [ ] **Step 1: `formatCandidates.verify.ts` 먼저 작성 (실패 확인)**

핵심 시나리오만 발췌 — 구현자는 이 파일을 그대로 쓰되 헬퍼는 공유:

```ts
// src/services/photoAI/formatCandidates.verify.ts
import { stripCandidates, feedCandidates, blogCandidates, dedupeByDhash } from './formatCandidates';
import type { ConceptScores } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const HOUR = 3600_000;
const T0 = 1756600000000;
function photo(id: string, t: number, over: Partial<PhotoMeta> = {}): PhotoMeta {
  return {
    id, uri: `file:///${id}.jpg`, thumbnailUri: null, creationTime: t,
    width: 100, height: 100, location: null,
    quality: { aestheticsScore: 0.7, blurScore: 0.8, exposureScore: 0.8, passed: true },
    ...over,
  };
}
function scores(over: Partial<ConceptScores> = {}): ConceptScores {
  return { emotional: 0, hip: 0, fun: 0, food: 0, info: 0, ...over };
}

// ── dedupeByDhash: 연사컷 제거 ──
const dup1 = photo('d1', T0, { signal: { dhash: '0f0f0f0f0f0f0f0f' } });
const dup2 = photo('d2', T0 + 1000, {
  signal: { dhash: '0f0f0f0f0f0f0f0e' }, // 해밍 1 = 근접 중복
  quality: { aestheticsScore: 0.3, blurScore: 0.5, exposureScore: 0.5, passed: true },
});
const distinct = photo('d3', T0 + 2000, { signal: { dhash: 'f0f0f0f0f0f0f0f0' } });
const deduped = dedupeByDhash([dup1, dup2, distinct]);
eq(deduped.map((p) => p.id), ['d1', 'd3'], '근접 중복은 점수 높은 1장만');

// ── stripCandidates: 그룹 4장 → 슬롯 4 후보 ──
const g4: PhotoMeta[] = ['a', 'b', 'c', 'd'].map((id, i) => photo(id, T0 + i * 60_000));
const groups4: SpotGroup[] = [{
  id: 'spot1', photoIds: ['a', 'b', 'c', 'd'], startTime: T0, endTime: T0 + 180_000, center: null,
}];
const cmap4 = new Map(g4.map((p) => [p.id, scores({ fun: 0.8 })]));
const strips = stripCandidates(g4, groups4, cmap4, [2, 3, 4, 6, 9]);
eq(strips.length >= 1, true, '4장 그룹에서 스트립 후보 생성');
eq(strips[0].photoUris.length, 4, '슬롯 수 4 채택 (사진 수 이하 최대)');
eq(strips[0].viewType, 'cut', 'viewType=cut');
eq(strips[0].concept, 'fun', '그룹 우세 컨셉 채택');
eq(strips[0].reasonKey, 'reco.reason.cut_fun', 'reasonKey 규칙');

// ── stripCandidates: 1장 그룹은 후보 없음 ──
eq(stripCandidates([photo('x', T0)], [{ id: 's', photoIds: ['x'], startTime: T0, endTime: T0, center: null }], new Map([['x', scores()]]), [2, 3, 4]), [], '1장은 스트립 불가');

// ── feedCandidates: 컨셉 임계 통과분만, 20장 상한 ──
const many: PhotoMeta[] = Array.from({ length: 25 }, (_, i) => photo(`f${i}`, T0 + i * HOUR));
const cmapMany = new Map(many.map((p) => [p.id, scores({ emotional: 0.7 })]));
const feeds = feedCandidates(many, cmapMany);
const emoFeed = feeds.find((c) => c.concept === 'emotional');
eq(emoFeed !== undefined, true, 'emotional 피드 후보 생성');
eq(emoFeed!.photoUris.length, 20, '피드 20장 상한');
eq(emoFeed!.viewType, 'feed', 'viewType=feed');

// ── feedCandidates: 임계 미달 컨셉은 후보 없음 ──
const weak = new Map(many.map((p) => [p.id, scores({ hip: 0.2 })]));
eq(feedCandidates(many, weak), [], '임계(0.45) 미달은 후보 없음');

// ── blogCandidates: 스팟 2개 이상 → 타임라인 씨앗 ──
const day1 = ['b1', 'b2', 'b3'].map((id, i) => photo(id, T0 + i * 60_000));
const day2 = ['b4', 'b5'].map((id, i) => photo(id, T0 + 26 * HOUR + i * 60_000));
const blogGroups: SpotGroup[] = [
  { id: 's1', photoIds: ['b1', 'b2', 'b3'], startTime: T0, endTime: T0 + 120_000, center: null },
  { id: 's2', photoIds: ['b4', 'b5'], startTime: T0 + 26 * HOUR, endTime: T0 + 26 * HOUR + 60_000, center: null },
];
const blogPhotos = [...day1, ...day2];
const blogMap = new Map(blogPhotos.map((p) => [p.id, scores({ info: 0.6 })]));
const blogs = blogCandidates(blogPhotos, blogGroups, blogMap);
eq(blogs.length, 1, '블로그 후보 1개');
eq(blogs[0].viewType, 'blog', 'viewType=blog');
const seeds = blogs[0].blogSeeds!;
eq(seeds[0], { kind: 'heading', dayIndex: 1 }, '첫 씨앗 = DAY 1 헤딩');
eq(seeds.some((sd) => sd.kind === 'heading' && sd.dayIndex === 2), true, '둘째 날 헤딩 존재');
const imageSeeds = seeds.filter((sd) => sd.kind === 'images');
eq(imageSeeds.length, 2, '스팟당 images 씨앗 1개');
eq((imageSeeds[0] as { uris: string[] }).uris.length, 3, '스팟 대표 최대 3장');

// ── blogCandidates: 스팟 1개면 후보 없음 ──
eq(blogCandidates(day1, [blogGroups[0]], blogMap), [], '스팟 1개는 블로그 후보 없음');

// ── 문서 사진 제외 ──
const doc = photo('doc', T0, { semantic: { isDocument: true } });
const docFeeds = feedCandidates([doc, ...many], new Map([[doc.id, scores({ emotional: 0.9 })], ...cmapMany]));
eq(docFeeds.every((c) => !c.photoUris.includes('file:///doc.jpg')), true, '문서/영수증은 모든 후보에서 제외');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/formatCandidates.verify.ts`
Expected: FAIL — "Cannot find module './formatCandidates'"

- [ ] **Step 2: `formatCandidates.ts` 구현**

```ts
/**
 * 형식별 후보 생성기 — 순수 함수 (설계 §5)
 *
 * 각 생성기는 (사진, 스팟 그룹, 컨셉 점수)를 받아 RecoCandidate를 낸다.
 * 공통 제외: isDocument(영수증/스크린샷), quality.passed === false.
 * 후보 id는 결정론적(입력이 같으면 같음) — dismissedIds가 재분석 후에도 유효하도록.
 */
import { scorePhoto } from './bestCutSelector';
import { topConcept } from './conceptClassifier';
import type { ConceptScores, RecoBlogSeed, RecoCandidate } from './recoTypes';
import { dhashHamming } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

const FEED_CONCEPT_THRESHOLD = 0.45; // 이 점수 이상 사진만 피드 후보에 포함
const FEED_MAX = 20;                 // MAX_RECORD_PHOTOS와 동일 (피드 상한)
const FEED_MIN = 3;                  // 3장 미만이면 후보로 안 만듦
const BLOG_SPOT_TOP = 3;             // 스팟당 대표 사진 수
const DHash_DUP_MAX = 6;             // 해밍 거리 이하 = 근접 중복

/** 후보에 넣을 수 있는 사진만 (문서·불량 제외) */
function usable(photos: PhotoMeta[]): PhotoMeta[] {
  return photos.filter((p) => !p.semantic?.isDocument && p.quality?.passed !== false);
}

/** dHash 근접 중복 제거 — scorePhoto 높은 쪽 유지, 순서 보존 */
export function dedupeByDhash(photos: PhotoMeta[], maxDistance: number = DHash_DUP_MAX): PhotoMeta[] {
  const kept: PhotoMeta[] = [];
  for (const p of photos) {
    const dupIdx = kept.findIndex(
      (k) => dhashHamming(k.signal?.dhash, p.signal?.dhash) <= maxDistance
    );
    if (dupIdx === -1) { kept.push(p); continue; }
    if (scorePhoto(p) > scorePhoto(kept[dupIdx])) kept[dupIdx] = p;
  }
  return kept;
}

/** 그룹의 우세 컨셉 (사진 평균) */
function groupConcept(photoIds: string[], concepts: Map<string, ConceptScores>) {
  const sum: ConceptScores = { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 };
  let n = 0;
  for (const id of photoIds) {
    const c = concepts.get(id);
    if (!c) continue;
    n++;
    for (const k of Object.keys(sum) as (keyof ConceptScores)[]) sum[k] += c[k];
  }
  if (n > 0) for (const k of Object.keys(sum) as (keyof ConceptScores)[]) sum[k] /= n;
  return topConcept(sum);
}

/**
 * 스트립 후보 — 스팟 그룹별 베스트컷을 슬롯 수(2~9)에 맞춰 조합.
 * slotCounts는 호출부가 CUT_FRAMES 기본 카테고리에서 뽑아 넘긴다(순수성 유지).
 */
export function stripCandidates(
  photos: PhotoMeta[],
  groups: SpotGroup[],
  concepts: Map<string, ConceptScores>,
  slotCounts: number[]
): RecoCandidate[] {
  const byId = new Map(usable(photos).map((p) => [p.id, p]));
  const sortedSlots = [...new Set(slotCounts)].sort((a, b) => b - a); // 큰 것부터
  const out: RecoCandidate[] = [];

  for (const g of groups) {
    const members = g.photoIds
      .map((id) => byId.get(id))
      .filter((p): p is PhotoMeta => p !== undefined);
    const deduped = dedupeByDhash(members)
      .map((p) => ({ p, score: scorePhoto(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (deduped.length < 2) continue;

    // 사진 수 이하의 최대 슬롯 수 채택
    const slot = sortedSlots.find((n) => n <= deduped.length);
    if (!slot || slot < 2) continue;

    const picked = deduped.slice(0, slot);
    // 스트립은 시간순으로 배열해야 이야기가 된다
    picked.sort((a, b) => a.p.creationTime - b.p.creationTime);
    const tc = groupConcept(g.photoIds, concepts);
    const avgScore = picked.reduce((s, x) => s + x.score, 0) / picked.length;

    out.push({
      id: `cut_${tc.concept}_${g.id}`,
      viewType: 'cut',
      concept: tc.concept,
      photoUris: picked.map((x) => x.p.uri),
      score: avgScore * 0.7 + tc.score * 0.3,
      reasonKey: `reco.reason.cut_${tc.concept}`,
      reasonParams: { n: slot },
    });
  }
  // 그룹이 여럿이면 점수 상위 2개까지만
  return out.sort((a, b) => b.score - a.score).slice(0, 2);
}

/** 피드 후보 — 컨셉별 하이라이트 ≤20장 */
export function feedCandidates(
  photos: PhotoMeta[],
  concepts: Map<string, ConceptScores>
): RecoCandidate[] {
  const pool = dedupeByDhash(usable(photos));
  const out: RecoCandidate[] = [];

  const conceptKeys = ['emotional', 'hip', 'fun', 'food', 'info'] as const;
  for (const concept of conceptKeys) {
    const scored = pool
      .map((p) => ({ p, c: concepts.get(p.id)?.[concept] ?? 0 }))
      .filter((x) => x.c >= FEED_CONCEPT_THRESHOLD)
      .sort((a, b) => b.c - a.c)
      .slice(0, FEED_MAX);
    if (scored.length < FEED_MIN) continue;

    // 표시 순서는 시간순 (여행 흐름)
    const ordered = [...scored].sort((a, b) => a.p.creationTime - b.p.creationTime);
    const avg = scored.reduce((s, x) => s + x.c, 0) / scored.length;
    out.push({
      id: `feed_${concept}`,
      viewType: 'feed',
      concept,
      photoUris: ordered.map((x) => x.p.uri),
      score: avg,
      reasonKey: `reco.reason.feed_${concept}`,
      reasonParams: { n: ordered.length },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 블로그 후보 — 날짜 헤딩 + 스팟별 이미지 블록 타임라인 (설계 §5) */
export function blogCandidates(
  photos: PhotoMeta[],
  groups: SpotGroup[],
  concepts: Map<string, ConceptScores>
): RecoCandidate[] {
  const byId = new Map(usable(photos).map((p) => [p.id, p]));
  const validGroups = groups
    .map((g) => ({
      g,
      members: g.photoIds.map((id) => byId.get(id)).filter((p): p is PhotoMeta => p !== undefined),
    }))
    .filter((x) => x.members.length > 0)
    .sort((a, b) => a.g.startTime - b.g.startTime);
  if (validGroups.length < 2) return [];

  const dayMs = 24 * 3600_000;
  const firstDayStart = Math.floor(validGroups[0].g.startTime / dayMs);
  const seeds: RecoBlogSeed[] = [];
  const allUris: string[] = [];
  let lastDayIndex = 0;

  for (const { g, members } of validGroups) {
    const dayIndex = Math.floor(g.startTime / dayMs) - firstDayStart + 1;
    if (dayIndex !== lastDayIndex) {
      seeds.push({ kind: 'heading', dayIndex });
      lastDayIndex = dayIndex;
    }
    const top = dedupeByDhash(members)
      .map((p) => ({ p, score: scorePhoto(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, BLOG_SPOT_TOP)
      .sort((a, b) => a.p.creationTime - b.p.creationTime)
      .map((x) => x.p.uri);
    if (top.length === 0) continue;
    seeds.push({
      kind: 'images',
      uris: top,
      layout: top.length === 1 ? 'single' : top.length === 2 ? 'grid2' : 'grid3',
    });
    allUris.push(...top);
  }
  if (allUris.length === 0) return [];

  const tc = groupConcept(allUris.map((u) => {
    // uri → id 역매핑 (usable 기준)
    for (const [id, p] of byId) if (p.uri === u) return id;
    return u;
  }), concepts);

  return [{
    id: `blog_${tc.concept}`,
    viewType: 'blog',
    concept: tc.concept,
    photoUris: allUris,
    blogSeeds: seeds,
    score: 0.5 + tc.score * 0.3 + Math.min(0.2, validGroups.length * 0.03),
    reasonKey: `reco.reason.blog_${tc.concept}`,
    reasonParams: { spots: validGroups.length },
  }];
}
```

- [ ] **Step 3: 실행·타입 체크·커밋**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/formatCandidates.verify.ts` → ✅
Run: `npx tsc --noEmit` → 오류 0.

```bash
git add src/services/photoAI/formatCandidates.ts src/services/photoAI/formatCandidates.verify.ts
git commit -m "feat(photoAI): 피드·블로그·스트립 후보 생성기 + dHash 중복 제거

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 개인화 재순위 (personalRanker)

**Files:**
- Create: `src/services/photoAI/personalRanker.ts`
- Create: `src/services/photoAI/personalRanker.verify.ts`

**Interfaces:**
- Consumes: `RecoCandidate`, `RecoViewType`
- Produces:
  - `buildStylePrior(records: { viewType?: string }[]): UserStylePrior` — `{ viewTypeCounts: Record<string, number>; conceptHist?: ... }` (conceptHist는 v2 예약)
  - `rankCandidates(cands: RecoCandidate[], prior: UserStylePrior, maxCards?: number): RecoCandidate[]` — 상위 3개, **서로 다른 형식 우선**(다양성 보장, 설계 §5)

- [ ] **Step 1: `personalRanker.verify.ts` 먼저 작성 (실패 확인)**

```ts
// src/services/photoAI/personalRanker.verify.ts
import { buildStylePrior, rankCandidates } from './personalRanker';
import type { RecoCandidate } from './recoTypes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const cand = (id: string, viewType: RecoCandidate['viewType'], score: number): RecoCandidate => ({
  id, viewType, concept: 'emotional', photoUris: ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg'],
  score, reasonKey: `reco.reason.${viewType}_emotional`,
});

// ── buildStylePrior ──
eq(buildStylePrior([]), { viewTypeCounts: {} }, '기록 없음 = 빈 prior');
eq(
  buildStylePrior([{ viewType: 'blog' }, { viewType: 'blog' }, { viewType: 'feed' }, { viewType: undefined }]),
  { viewTypeCounts: { blog: 2, feed: 1 } },
  '형식 빈도 집계 (undefined 무시)'
);

// ── 다양성 보장: 상위 3개는 서로 다른 형식 ──
const cands = [
  cand('c1', 'cut', 0.9), cand('c2', 'cut', 0.85), cand('c3', 'cut', 0.8),
  cand('f1', 'feed', 0.6), cand('b1', 'blog', 0.5),
];
const ranked = rankCandidates(cands, { viewTypeCounts: {} });
eq(ranked.map((c) => c.viewType), ['cut', 'feed', 'blog'], '형식 다양성: cut 3개여도 3형식 노출');
eq(ranked[0].id, 'c1', '같은 형식 안에선 점수 최고 채택');

// ── 개인화: 블로그 애용자는 블로그가 앞으로 ──
const close = [cand('f1', 'feed', 0.55), cand('b1', 'blog', 0.5), cand('c1', 'cut', 0.45)];
const blogLover = buildStylePrior(Array.from({ length: 10 }, () => ({ viewType: 'blog' })));
const rankedPersonal = rankCandidates(close, blogLover);
eq(rankedPersonal[0].viewType, 'blog', '블로그 애용자는 블로그 우선');

// ── 기록 없으면 원점수 순서 ──
const rankedNeutral = rankCandidates(close, { viewTypeCounts: {} });
eq(rankedNeutral[0].viewType, 'feed', '무기록 = 원점수 순');

// ── maxCards 상한 ──
eq(rankCandidates(cands, { viewTypeCounts: {} }, 2).length, 2, 'maxCards=2');
eq(rankCandidates([], { viewTypeCounts: {} }), [], '빈 후보 안전');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/personalRanker.verify.ts`
Expected: FAIL — "Cannot find module './personalRanker'"

- [ ] **Step 2: `personalRanker.ts` 구현**

```ts
/**
 * 개인화 재순위 — 기존 게시물의 형식 사용 빈도로 후보 가중 + 형식 다양성 보장 (설계 §5)
 *
 * v1은 형식 빈도만 반영한다. conceptHist(무드 분포)는 과거 사진 재분석 비용 때문에
 * 타입 자리만 예약(2차에서 사용 로그·분석 캐시 기반으로 채움).
 */
import type { RecoCandidate } from './recoTypes';

export interface UserStylePrior {
  viewTypeCounts: Record<string, number>;
  conceptHist?: Partial<Record<string, number>>; // v2 예약
}

const PERSONAL_WEIGHT = 0.3; // 개인화가 원점수를 뒤집을 수 있는 최대 폭

export function buildStylePrior(records: { viewType?: string }[]): UserStylePrior {
  const viewTypeCounts: Record<string, number> = {};
  for (const r of records) {
    if (!r.viewType) continue;
    viewTypeCounts[r.viewType] = (viewTypeCounts[r.viewType] ?? 0) + 1;
  }
  return { viewTypeCounts };
}

/**
 * 재순위 + 다양성 보장.
 * 1) 개인화 점수 = score * (1 + PERSONAL_WEIGHT * 형식 사용 비율)
 * 2) 1라운드: 형식별 최고 후보를 형식당 1개씩 점수순으로 채운다 (다양성 — "게시물이 있어도 여러 버전")
 * 3) 2라운드: 자리가 남으면 나머지 후보를 점수순으로 채운다
 */
export function rankCandidates(
  cands: RecoCandidate[],
  prior: UserStylePrior,
  maxCards: number = 3
): RecoCandidate[] {
  if (cands.length === 0) return [];
  const total = Object.values(prior.viewTypeCounts).reduce((s, n) => s + n, 0);

  const personalScore = (c: RecoCandidate): number => {
    const freq = total > 0 ? (prior.viewTypeCounts[c.viewType] ?? 0) / total : 0;
    return c.score * (1 + PERSONAL_WEIGHT * freq);
  };

  const sorted = [...cands].sort((a, b) => personalScore(b) - personalScore(a));

  const picked: RecoCandidate[] = [];
  const usedTypes = new Set<string>();
  for (const c of sorted) {
    if (picked.length >= maxCards) break;
    if (usedTypes.has(c.viewType)) continue;
    usedTypes.add(c.viewType);
    picked.push(c);
  }
  for (const c of sorted) {
    if (picked.length >= maxCards) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}
```

- [ ] **Step 3: 실행·타입 체크·커밋**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/personalRanker.verify.ts` → ✅
Run: `npx tsc --noEmit` → 오류 0.

```bash
git add src/services/photoAI/personalRanker.ts src/services/photoAI/personalRanker.verify.ts
git commit -m "feat(photoAI): 개인화 재순위 + 형식 다양성 보장

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 골든셋 + 일치율 검증

**Files:**
- Create: `src/services/photoAI/goldens/golden-night-city.json`
- Create: `src/services/photoAI/goldens/golden-food-landmark.json`
- Create: `src/services/photoAI/formatReco.verify.ts`

**Interfaces:**
- Consumes: Task 5~8 전부 (판정기 → 생성기 → 재순위 엔드투엔드)
- Produces: 골든셋 스키마 `{ name, photos: PhotoMeta[], groupsHint: SpotGroup[], expected: { topViewType, topConcept } }` — 사진 원본이 아니라 **신호 JSON**만 저장 (설계 §9). 규칙 가중치를 조정할 때 이 verify가 회귀 기준이 된다.

- [ ] **Step 1: 골든셋 2개 작성**

`golden-night-city.json` — 도쿄 야경 여행 12장 (야경 스팟 6장 연속 + 낮 이동 6장 산발), 기대: 스트립×hip이 최상위. 사진마다 실측을 흉내 낸 신호(sceneLabels: night/city/neon, colorStats darkness 0.5±, aesthetics 0.5~0.8, 일부 dhash 근접쌍 포함)를 채운다. `creationTime`은 임의 고정 epoch(예: 1756600000000 기준 오프셋). `groupsHint`는 photoGrouping 결과를 손으로 적은 것.

`golden-food-landmark.json` — 오사카 이틀 여행 14장 (1일차: 오사카성 랜드마크 스팟 5장 + 도톤보리 음식 스팟 4장, 2일차: 카페 스팟 5장; hasText 다수), 기대: 블로그×info가 최상위.

두 파일 모두 아래 스키마 (구현자가 값을 채워 넣되, 기대 결과가 나오도록 신호를 현실적으로 설정하고 검증 실행으로 확인):

```json
{
  "name": "night-city",
  "expected": { "topViewType": "cut", "topConcept": "hip" },
  "photos": [
    {
      "id": "n01", "uri": "file:///n01.jpg", "thumbnailUri": null,
      "creationTime": 1756600000000, "width": 4000, "height": 3000, "location": null,
      "quality": { "aestheticsScore": 0.7, "blurScore": 0.8, "exposureScore": 0.6, "passed": true },
      "semantic": { "hasFace": false, "isLandscape": false, "isLandmark": true },
      "signal": {
        "sceneLabels": [{ "label": "night", "confidence": 0.85 }, { "label": "city", "confidence": 0.7 }],
        "faceCount": 0, "hasText": false,
        "colorStats": { "saturation": 0.55, "warmth": 0.42, "contrast": 0.66, "darkness": 0.52 },
        "dhash": "3c3c5a5af0f00f0f"
      }
    }
  ],
  "groupsHint": [
    { "id": "spot-night", "photoIds": ["n01"], "startTime": 1756600000000, "endTime": 1756600000000, "center": null }
  ]
}
```

- [ ] **Step 2: `formatReco.verify.ts` 작성**

```ts
// src/services/photoAI/formatReco.verify.ts
// 골든셋 엔드투엔드: 판정기 → 생성기 → 재순위가 기대 최상위 카드를 내는지.
// 규칙 가중치를 바꿀 땐 이 파일이 회귀 기준이다 — 임계를 낮춰서 통과시키지 말 것.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleConceptClassifier } from './conceptClassifier';
import { stripCandidates, feedCandidates, blogCandidates } from './formatCandidates';
import { rankCandidates } from './personalRanker';
import type { ConceptScores } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'goldens');
const SLOT_COUNTS = [2, 3, 4, 6, 9]; // CUT_FRAMES 기본 카테고리 슬롯 수 스냅샷

interface Golden {
  name: string;
  expected: { topViewType: string; topConcept: string };
  photos: PhotoMeta[];
  groupsHint: SpotGroup[];
}

let failed = 0;
function check(cond: boolean, msg: string, detail?: string) {
  if (cond) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}${detail ? `\n   ${detail}` : ''}`); }
}

for (const file of ['golden-night-city.json', 'golden-food-landmark.json']) {
  const g = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Golden;
  const concepts = new Map<string, ConceptScores>(
    g.photos.map((p) => [p.id, ruleConceptClassifier(p)])
  );
  const cands = [
    ...stripCandidates(g.photos, g.groupsHint, concepts, SLOT_COUNTS),
    ...feedCandidates(g.photos, concepts),
    ...blogCandidates(g.photos, g.groupsHint, concepts),
  ];
  const ranked = rankCandidates(cands, { viewTypeCounts: {} });

  check(ranked.length >= 2, `[${g.name}] 카드 2개 이상 생성 (다양한 버전)`, `got ${ranked.length}`);
  check(
    ranked[0]?.viewType === g.expected.topViewType,
    `[${g.name}] 최상위 형식 = ${g.expected.topViewType}`,
    `got ${ranked[0]?.viewType} (${ranked[0]?.id})`
  );
  check(
    ranked[0]?.concept === g.expected.topConcept,
    `[${g.name}] 최상위 컨셉 = ${g.expected.topConcept}`,
    `got ${ranked[0]?.concept}`
  );
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 3: 실행하며 골든셋 신호값 보정**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/formatReco.verify.ts`
처음엔 실패할 수 있다 — **규칙을 고치지 말고 골든셋의 신호값이 현실적인지 먼저 점검**하고, 신호가 현실적인데도 기대와 다르면 그때 규칙 가중치를 조정(조정 시 Task 5~8 verify 재실행 필수).
Expected 최종: ✅ 모든 검증 통과 + `npm test` 전체 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/services/photoAI/goldens src/services/photoAI/formatReco.verify.ts
git commit -m "test(photoAI): 형식 추천 골든셋 2종 + 엔드투엔드 일치율 검증

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 추천 엔진 오케스트레이터 + 앨범 저장 트리거

**Files:**
- Create: `src/services/photoAI/recoEngine.ts`
- Modify: `src/screens/AlbumCreateScreen.tsx` (신규 생성 `:478` 근처, 이어 담기 `:444` 근처 — 두 경로 모두)

**Interfaces:**
- Consumes: Task 1~8 전부, `assessPhotoQuality`, `groupPhotosBySpot`, `CUT_FRAMES`·`cutSlotCount`(constants/cutFrames), `MediaLibrary.getAssetInfoAsync`, `isPhotoVisionAvailable`, `FORMAT_RECO_ENABLED`
- Produces: `runFormatReco(input: FormatRecoInput): Promise<void>` — fire-and-forget 안전(내부 전체 try/catch). AlbumCreateScreen이 두 경로에서 호출.

- [ ] **Step 1: `recoEngine.ts` 구현**

```ts
/**
 * 형식 추천 엔진 — 앨범 저장 직후 백그라운드에서 1회 실행 (설계 §2, §8)
 *
 * fire-and-forget 계약: 어떤 실패도 throw하지 않는다(호출부는 await하지 않음).
 * 실패 시 status:'unavailable' 저장 → UI는 섹션 미노출.
 */
import * as MediaLibrary from 'expo-media-library';
import { isPhotoVisionAvailable } from '../../../modules/photo-vision';
import { FORMAT_RECO_ENABLED } from '../../constants/featureFlags';
import { CUT_FRAMES, cutSlotCount } from '../../constants/cutFrames';
import { ruleConceptClassifier } from './conceptClassifier';
import { blogCandidates, feedCandidates, stripCandidates } from './formatCandidates';
import { buildStylePrior, rankCandidates } from './personalRanker';
import { getRecoState, saveRecoState } from './recoStorage';
import type { ConceptScores, RecoState } from './recoTypes';
import { mediasFingerprint } from './recoTypes';
import { groupPhotosBySpot } from './photoGrouping';
import { assessPhotoQuality } from './qualityAssessment';
import type { PhotoMeta } from './types';

export interface FormatRecoInput {
  albumRecordId: string;
  medias: string[];                          // 앨범 복사본 file:// uri (표시 순서)
  mediaTimes?: Record<string, number>;       // uri → 촬영시각 ms
  mediaAssetIds?: Record<string, string>;    // uri → MediaLibrary assetId (GPS 조회용)
  pastRecords: { viewType?: string }[];      // 개인화 prior 재료 (호출부가 records 전달)
}

const MIN_PHOTOS = 4;      // 이보다 적으면 추천할 게 없다
const GPS_BATCH = 8;

/** 기본 카테고리 프레임의 슬롯 수 목록 (스트립 후보 생성기 입력) */
function basicSlotCounts(): number[] {
  return CUT_FRAMES.filter((f) => f.category === '기본').map((f) => cutSlotCount(f.layout));
}

export async function runFormatReco(input: FormatRecoInput): Promise<void> {
  try {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return;
    if (input.medias.length < MIN_PHOTOS) return;

    const fingerprint = mediasFingerprint(input.medias);
    const prev = await getRecoState(input.albumRecordId);
    if (prev && prev.mediasFingerprint === fingerprint && prev.status === 'ready') return; // 이미 최신

    const pending: RecoState = {
      albumRecordId: input.albumRecordId,
      mediasFingerprint: fingerprint,
      status: 'pending',
      cards: [],
      dismissedIds: prev?.dismissedIds ?? [], // 닫음 기록은 재분석에도 유지 (설계 §8)
      updatedAt: Date.now(),
    };
    await saveRecoState(pending);

    // 1) 앨범 medias → PhotoMeta (id=uri, 시각은 mediaTimes, GPS는 assetId로 best-effort)
    let photos: PhotoMeta[] = input.medias.map((uri) => ({
      id: uri,
      uri,
      thumbnailUri: null,
      creationTime: input.mediaTimes?.[uri] ?? 0,
      width: 0,
      height: 0,
      location: null,
    }));

    if (input.mediaAssetIds) {
      for (let i = 0; i < photos.length; i += GPS_BATCH) {
        const batch = photos.slice(i, i + GPS_BATCH);
        await Promise.all(batch.map(async (p) => {
          const assetId = input.mediaAssetIds?.[p.uri];
          if (!assetId) return;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
            if (info.location) p.location = { latitude: info.location.latitude, longitude: info.location.longitude };
            if (!p.creationTime && info.creationTime) p.creationTime = info.creationTime;
          } catch { /* GPS 없음 — 시간 그룹핑으로 진행 */ }
        }));
      }
    }

    // 2) 썸네일 + 네이티브 분석 (quality/semantic/signal 채움)
    const assessed = await assessPhotoQuality(photos);
    if (!assessed.ok || !assessed.data) throw new Error(assessed.errorMessage ?? 'ASSESS_FAILED');
    photos = assessed.data;

    // 3) 스팟 그룹핑 + 컨셉 판정
    const groups = groupPhotosBySpot(photos);
    const concepts = new Map<string, ConceptScores>(
      photos.map((p) => [p.id, ruleConceptClassifier(p)])
    );

    // 4) 후보 생성 + 개인화 재순위
    const cands = [
      ...stripCandidates(photos, groups, concepts, basicSlotCounts()),
      ...feedCandidates(photos, concepts),
      ...blogCandidates(photos, groups, concepts),
    ];
    const ranked = rankCandidates(cands, buildStylePrior(input.pastRecords));

    await saveRecoState({
      ...pending,
      status: ranked.length > 0 ? 'ready' : 'unavailable',
      cards: ranked.map((c) => ({ ...c, createdAt: Date.now() })),
      updatedAt: Date.now(),
    });
  } catch {
    // fire-and-forget 계약: 조용히 unavailable 기록 시도
    try {
      await saveRecoState({
        albumRecordId: input.albumRecordId,
        mediasFingerprint: mediasFingerprint(input.medias),
        status: 'unavailable',
        cards: [],
        dismissedIds: [],
        updatedAt: Date.now(),
      });
    } catch { /* 저장까지 실패하면 포기 */ }
  }
}
```

- [ ] **Step 2: AlbumCreateScreen 트리거 2곳 삽입**

파일 상단 import에 추가:

```ts
import { runFormatReco } from '../services/photoAI/recoEngine';
```

**신규 생성 경로** — `success();` (약 478행)과 `navigation.replace(...)` 사이에 삽입 (`records`는 이 화면의 `useRecords()`에서 이미 구조분해돼 있는지 확인, 없으면 추가):

```ts
    // AI 형식 추천 — 백그라운드 분석 시작 (await 금지: replace 지연 방지)
    runFormatReco({
      albumRecordId: newRec.id,
      medias: newRec.medias ?? [],
      mediaTimes: newRec.mediaTimes,
      mediaAssetIds: newRec.mediaAssetIds,
      pastRecords: records.map((r) => ({ viewType: r.viewType })),
    }).catch(() => {});
```

**이어 담기 경로** — `success();` (약 444행)와 `navigation.replace(...)` 사이에 삽입. `merged` 객체(병합된 medias/mediaTimes/mediaAssetIds)와 `appendTarget.id`를 사용:

```ts
    runFormatReco({
      albumRecordId: appendTarget.id,
      medias: merged.medias ?? [],
      mediaTimes: merged.mediaTimes,
      mediaAssetIds: merged.mediaAssetIds,
      pastRecords: records.map((r) => ({ viewType: r.viewType })),
    }).catch(() => {});
```

(실제 변수명이 다르면 저장 직전에 조립되는 병합 결과 변수를 사용할 것 — 수정 전 반드시 해당 함수 전체를 읽고 확인. `mediaTimes`/`mediaAssetIds`의 실제 타입이 `Record<string, ...>`가 아니라면 recoEngine 입력에 맞게 변환.)

- [ ] **Step 3: 타입 체크·커밋**

Run: `npx tsc --noEmit` → 오류 0.
Run: `npm test` → 전체 통과 (기존 verify 회귀 확인).

```bash
git add src/services/photoAI/recoEngine.ts src/screens/AlbumCreateScreen.tsx
git commit -m "feat(photoAI): 추천 엔진 오케스트레이터 + 앨범 저장 트리거(신규·이어담기)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: i18n 키 + 추천 UI(RecoSection) + TripDetail 삽입

**Files:**
- Create: `src/components/trip/RecoSection.tsx`
- Modify: `src/i18n/locales/ko.ts` (`reco` 네임스페이스 추가), `src/i18n/locales/en.ts` (동일 키)
- Modify: `src/screens/TripDetailScreen.tsx` (히어로 배너 닫힌 직후, `<View style={s.console}>` 시작 전 — 약 698~700행 사이)

**Interfaces:**
- Consumes: `getRecoState`·`dismissRecoCard`·`appendRecoLog`(Task 1), `runFormatReco`(Task 10), `mediasFingerprint`, `FORMAT_RECO_ENABLED`, `isPhotoVisionAvailable`, `TravelRecord`(recordStore)
- Produces: `<RecoSection albumRecord={TravelRecord} pastRecords={TravelRecord[]} />` — Task 12의 프리필 파라미터(`recoPrefill`)로 navigate. **이 태스크 시점엔 라우트 파라미터가 아직 없으므로 navigate 호출은 Task 12에서 완성** — 여기서는 `onAccept(card)` 콜백까지 만들고 TODO 없이 navigate 코드를 넣되, Task 12의 파라미터 정의와 함께 같은 브랜치에서 tsc가 통과되도록 **Task 11·12는 연속 실행**한다.

- [ ] **Step 1: ko.ts에 `reco` 네임스페이스 추가**

`bestCut` 네임스페이스(약 1184행) 근처에 추가:

```ts
  reco: {
    sectionTitle: 'AI 추천',
    analyzing: 'AI가 사진을 보고 있어요…',
    make_feed: '피드로 남기기',
    make_blog: '블로그로 기록하기',
    make_cut: '스트립으로 만들기',
    reason: {
      cut_emotional: '감성적인 순간 {{n}}컷',
      cut_hip: '힙한 무드 {{n}}컷',
      cut_fun: '웃음 가득한 순간 {{n}}컷',
      cut_food: '미식의 순간 {{n}}컷',
      cut_info: '여행의 장면 {{n}}컷',
      feed_emotional: '감성 하이라이트 {{n}}장',
      feed_hip: '힙한 하이라이트 {{n}}장',
      feed_fun: '유쾌한 순간들 {{n}}장',
      feed_food: '미식 기록 {{n}}장',
      feed_info: '여행 하이라이트 {{n}}장',
      blog_emotional: '감성 여행기 · 스팟 {{spots}}곳 타임라인',
      blog_hip: '힙한 여행기 · 스팟 {{spots}}곳 타임라인',
      blog_fun: '즐거운 여행기 · 스팟 {{spots}}곳 타임라인',
      blog_food: '미식 여행기 · 스팟 {{spots}}곳 타임라인',
      blog_info: '여행 정보 기록 · 스팟 {{spots}}곳 타임라인',
    },
    blogDayHeading: 'DAY {{n}}',
  },
```

en.ts에 동일 구조로 영어 번역 추가 (예: `sectionTitle: 'AI Picks'`, `analyzing: 'AI is looking at your photos…'`, `cut_fun: '{{n}} joyful cuts'` 등 전 키).

- [ ] **Step 2: `RecoSection.tsx` 작성**

```tsx
/**
 * AI 형식 추천 섹션 — TripDetail 히어로 아래 (설계 §6)
 * 미노출 조건: 플래그 OFF / 네이티브 없음 / 게스트 / unavailable / 카드 0.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { isPhotoVisionAvailable } from '../../../modules/photo-vision';
import { FORMAT_RECO_ENABLED } from '../../constants/featureFlags';
import type { RootStackParamList } from '../../navigation/types';
import { runFormatReco } from '../../services/photoAI/recoEngine';
import { appendRecoLog, dismissRecoCard, getRecoState } from '../../services/photoAI/recoStorage';
import type { RecoCard, RecoState } from '../../services/photoAI/recoTypes';
import { mediasFingerprint } from '../../services/photoAI/recoTypes';
import type { TravelRecord } from '../../store/recordStore';

const COLORS = {
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
};

interface Props {
  albumRecord: TravelRecord;
  pastRecords: { viewType?: string }[];
}

export default function RecoSection({ albumRecord, pastRecords }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [state, setState] = useState<RecoState | null>(null);
  const impressionLogged = useRef(false);

  const load = useCallback(async () => {
    const s = await getRecoState(albumRecord.id);
    const medias = albumRecord.medias ?? [];
    // 앨범이 바뀌었으면(지문 불일치) 재분석 트리거 + pending 표시
    if (s && s.mediasFingerprint !== mediasFingerprint(medias)) {
      setState({ ...s, status: 'pending', cards: [] });
      runFormatReco({
        albumRecordId: albumRecord.id,
        medias,
        mediaTimes: albumRecord.mediaTimes,
        mediaAssetIds: albumRecord.mediaAssetIds,
        pastRecords,
      }).then(() => getRecoState(albumRecord.id).then(setState)).catch(() => {});
      return;
    }
    setState(s);
  }, [albumRecord.id, albumRecord.medias, albumRecord.mediaTimes, albumRecord.mediaAssetIds, pastRecords]);

  useEffect(() => { load(); }, [load]);

  // pending이면 5초 간격 폴링 (분석은 수십 초 내 완료)
  useEffect(() => {
    if (state?.status !== 'pending') return;
    const timer = setInterval(() => { getRecoState(albumRecord.id).then((s) => s && setState(s)); }, 5000);
    return () => clearInterval(timer);
  }, [state?.status, albumRecord.id]);

  if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return null;
  if (!state || state.status === 'unavailable') return null;

  const visible = state.cards.filter((c) => !state.dismissedIds.includes(c.id));
  if (state.status === 'ready' && visible.length === 0) return null;

  if (!impressionLogged.current && visible.length > 0) {
    impressionLogged.current = true;
    for (const c of visible) {
      appendRecoLog({
        event: 'impression', cardId: c.id, viewType: c.viewType, concept: c.concept,
        photoCountSuggested: c.photoUris.length, ts: Date.now(),
      }).catch(() => {});
    }
  }

  const onDismiss = (card: RecoCard) => {
    dismissRecoCard(albumRecord.id, card.id).catch(() => {});
    setState((s) => (s ? { ...s, dismissedIds: [...s.dismissedIds, card.id] } : s));
    appendRecoLog({
      event: 'dismiss', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});
  };

  const onAccept = (card: RecoCard) => {
    appendRecoLog({
      event: 'accept', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});
    if (card.viewType === 'feed') {
      navigation.navigate('NewRecord', { recoPrefill: { cardId: card.id, medias: card.photoUris } });
    } else if (card.viewType === 'blog') {
      navigation.navigate('BlogRecord', { recoPrefill: { cardId: card.id, seeds: card.blogSeeds ?? [] } });
    } else {
      navigation.navigate('CutRecord', { recoPrefill: { cardId: card.id, photos: card.photoUris } });
    }
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>✨ {t('reco.sectionTitle')}</Text>
      {state.status === 'pending' ? (
        <Text style={st.analyzing}>{t('reco.analyzing')}</Text>
      ) : (
        visible.map((card) => (
          <View key={card.id} style={st.card}>
            <TouchableOpacity
              style={st.cardBody}
              onPress={() => onAccept(card)}
              accessibilityRole="button"
              accessibilityLabel={`${t(card.reasonKey, card.reasonParams)} — ${t(`reco.make_${card.viewType}`)}`}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.thumbRow}>
                {card.photoUris.slice(0, 5).map((uri) => (
                  <Image key={uri} source={{ uri }} style={st.thumb} />
                ))}
                {card.photoUris.length > 5 && (
                  <View style={[st.thumb, st.more]}>
                    <Text style={st.moreText}>+{card.photoUris.length - 5}</Text>
                  </View>
                )}
              </ScrollView>
              <Text style={st.reason}>{t(card.reasonKey, card.reasonParams)}</Text>
              <Text style={st.cta}>→ {t(`reco.make_${card.viewType}`)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.close}
              onPress={() => onDismiss(card)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={st.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 16 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  analyzing: { color: COLORS.dim, fontSize: 13 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.divider,
  },
  cardBody: {},
  thumbRow: { marginBottom: 8 },
  thumb: { width: 52, height: 52, borderRadius: 8, marginRight: 6, backgroundColor: COLORS.divider },
  more: { alignItems: 'center', justifyContent: 'center' },
  moreText: { color: COLORS.dim, fontSize: 12, fontWeight: '600' },
  reason: { color: '#FFFFFF', fontSize: 13, marginBottom: 2 },
  cta: { color: COLORS.purpleNeon, fontSize: 13, fontWeight: '600' },
  close: { position: 'absolute', top: 8, right: 10 },
  closeText: { color: COLORS.dim, fontSize: 14 },
});
```

`common.close` 키가 ko.ts `common`에 없으면 추가(`close: '닫기'` / en `'Close'`).

- [ ] **Step 3: TripDetailScreen 삽입**

import 추가:

```ts
import RecoSection from '../components/trip/RecoSection';
```

히어로 배너 `</Animated.View>`(약 698행) 직후, `<View style={s.console}>` 전에 삽입:

```tsx
        {/* AI 형식 추천 — 게스트 모드·앨범 없음이면 미노출 */}
        {!isGuest && albumRecordForReco && (
          <RecoSection
            albumRecord={albumRecordForReco}
            pastRecords={records.map((r) => ({ viewType: r.viewType }))}
          />
        )}
```

`matchedRecords` 계산(약 372~380행) 아래에 추가:

```ts
  // 이 여행의 앨범 기록 (추천 발동 전제 — 설계 §1). 여러 개면 최신 것.
  const albumRecordForReco = React.useMemo(
    () => [...matchedRecords].reverse().find((r) => r.viewType === 'album'),
    [matchedRecords]
  );
```

(`records`가 이 컴포넌트의 `useRecords()` 구조분해에 이미 있음 — Explore 확인됨.)

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit` — **이 시점엔 `recoPrefill` 파라미터가 없어 오류가 난다. Task 12를 이어서 완료한 뒤 함께 커밋한다.**

---

### Task 12: 프리필 라우팅 (작성 화면 3종 + 네비게이션 타입)

**Files:**
- Modify: `src/navigation/types.ts` (NewRecord·BlogRecord·CutRecord에 `recoPrefill` 추가)
- Modify: `src/screens/NewRecordScreen.tsx:419` 근처 (medias·photoTexts 초기값)
- Modify: `src/screens/BlogRecordScreen.tsx:457` 근처 (blocks 초기값)
- Modify: `src/screens/CutRecordScreen.tsx:83-90` 근처 (frameId·photos·transforms 초기값)

**Interfaces:**
- Consumes: `RecoBlogSeed`(Task 1), `createHeadingBlock`·`createImagesBlock`·`createTextBlock`(types/blogBlocks), `CUT_FRAMES`·`cutSlotCount`
- Produces: 라우트 파라미터
  - `NewRecord`: `recoPrefill?: { cardId: string; medias: string[] }`
  - `BlogRecord`: `recoPrefill?: { cardId: string; seeds: RecoBlogSeed[] }`
  - `CutRecord`: `recoPrefill?: { cardId: string; photos: string[] }`

- [ ] **Step 1: `navigation/types.ts` 수정**

상단에 import 추가:

```ts
import type { RecoBlogSeed } from '../services/photoAI/recoTypes';
```

세 라우트에 필드 추가 (기존 필드 유지):

```ts
NewRecord: {
  editRecord?: TravelRecord;
  record?: TravelRecord;
  selectedCountry?: SelectedCountryParam;
  tripPrefill?: TripPrefillParam;
  recoPrefill?: { cardId: string; medias: string[] };   // AI 추천 프리필
} | undefined;
// ...
BlogRecord: {
  record?: TravelRecord;
  selectedCountry?: SelectedCountryParam;
  tripPrefill?: TripPrefillParam;
  recoPrefill?: { cardId: string; seeds: RecoBlogSeed[] }; // AI 추천 프리필
} | undefined;
CutRecord: {
  selectedCountry?: SelectedCountryParam;
  tripPrefill?: TripPrefillParam;
  recoPrefill?: { cardId: string; photos: string[] };   // AI 추천 프리필
} | undefined;
```

- [ ] **Step 2: NewRecordScreen — medias·photoTexts 초기값**

`:419` 근처 수정 (파라미터 없으면 기존 동작 그대로 — 최소 침습):

```ts
  const recoPrefill = route.params?.recoPrefill;
  const [medias, setMedias] = useState<string[]>(
    editRecord?.medias ?? recoPrefill?.medias ?? []
  );
```

photoTexts lazy init(약 424~437행)이 `editRecord?.medias` 길이를 기준으로 만들면, 같은 소스에서 파생되도록 수정 — **불변식: photoTexts 길이 === medias 초기 길이** (주석 `:423` 참조). 기존 코드가 `editRecord?.photoTexts ?? ...` 형태라면:

```ts
  const [photoTexts, setPhotoTexts] = useState<string[]>(() => {
    if (editRecord?.photoTexts) return editRecord.photoTexts;
    const initial = editRecord?.medias ?? recoPrefill?.medias ?? [];
    return initial.map(() => '');
  });
```

(수정 전 반드시 현행 lazy init 전체를 읽고 형태를 맞출 것.)

- [ ] **Step 3: BlogRecordScreen — 씨앗 → 블록 변환**

import 추가:

```ts
import { createHeadingBlock, createImagesBlock, createTextBlock } from '../types/blogBlocks';
```

`:457` 초기값 수정:

```ts
  const recoPrefill = route?.params?.recoPrefill;
  const [blocks, setBlocks] = useState<BlogBlock[]>(() => {
    if (editRecord?.blogBlocks?.length) return editRecord.blogBlocks;
    if (recoPrefill?.seeds?.length) {
      const built: BlogBlock[] = recoPrefill.seeds.map((seed) =>
        seed.kind === 'heading'
          ? createHeadingBlock(t('reco.blogDayHeading', { n: seed.dayIndex }), 2)
          : createImagesBlock(seed.uris, seed.layout)
      );
      built.push(createTextBlock()); // 이어 쓸 빈 텍스트 블록
      return built;
    }
    return [createTextBlock()];
  });
```

`t`가 이 시점에 사용 가능한지 확인 — `useTranslation()`이 `blocks` useState보다 위에서 호출되도록 순서 조정(이미 위라면 그대로). `createImagesBlock`의 두 번째 인자 타입이 `ImageLayout`이므로 seed.layout(`'single'|'grid2'|'grid3'`)은 그대로 호환된다.

- [ ] **Step 4: CutRecordScreen — 프레임·사진 초기값**

`:83-90` 수정 (프레임은 사진 수와 슬롯 수가 일치하는 기본 프레임, 없으면 기존 기본값):

```ts
  const recoPrefill = route.params?.recoPrefill;
  const firstBasic = CUT_FRAMES.find((f) => f.category === '기본')!;
  const initialFrame = recoPrefill
    ? CUT_FRAMES.find(
        (f) => f.category === '기본' && cutSlotCount(f.layout) === recoPrefill.photos.length
      ) ?? firstBasic
    : firstBasic;
  const initialSlots = cutSlotCount(initialFrame.layout);
  const [frameId, setFrameId] = useState<string>(initialFrame.id);
  const [photos, setPhotos] = useState<(string | null)[]>(() => {
    const base: (string | null)[] = Array(initialSlots).fill(null);
    recoPrefill?.photos.slice(0, initialSlots).forEach((uri, i) => { base[i] = uri; });
    return base;
  });
  const [transforms, setTransforms] = useState<(CutTransform | null)[]>(
    Array(initialSlots).fill(null)
  );
```

- [ ] **Step 5: 타입 체크 + Task 11·12 함께 커밋**

Run: `npx tsc --noEmit` → 오류 0 (Task 11의 navigate 호출까지 해소).
Run: `npm test` → 전체 통과.

```bash
git add src/components/trip/RecoSection.tsx src/screens/TripDetailScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts src/navigation/types.ts src/screens/NewRecordScreen.tsx src/screens/BlogRecordScreen.tsx src/screens/CutRecordScreen.tsx
git commit -m "feat(reco): TripDetail AI 추천 섹션 + 작성 화면 3종 프리필 라우팅

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: 유도 퍼널 — 귀국 알림 라우팅 + returnAt 기록 + FAB 배지

**Files:**
- Create: `src/utils/fabHighlight.ts`
- Create: `src/utils/fabHighlight.verify.ts`
- Modify: `src/store/persist.ts:43-47` (`DETECTOR_KEYS`에 키 2개 추가 — **유일한 정의처, 컴포넌트에 복붙 금지**)
- Modify: `src/components/ReturnDetector.tsx:76-89` (귀국 판정 시 returnAt 기록 + 알림 문구)
- Modify: `src/navigation/AppNavigator.tsx:234` 근처 (`returnDetect` 딥링크 분기 — **현재 분기가 없어 알림 탭이 무동작**)
- Modify: `src/components/RecordFab.tsx` (사진첩 버튼 배지)
- Modify: `src/screens/AlbumCreateScreen.tsx` (앨범 저장 시 albumCreatedAt 기록)
- Modify: `src/i18n/locales/ko.ts`·`en.ts` (`returnDetect.notifBody` 문구 갱신)

**Interfaces:**
- Consumes: `DETECTOR_KEYS`(persist.ts), AsyncStorage, `FORMAT_RECO_ENABLED`
- Produces: `shouldHighlightAlbum(returnAt: number | null, lastAlbumCreatedAt: number | null, now: number): boolean`, persist 키 `returnAt`·`albumCreatedAt`

- [ ] **Step 1: `fabHighlight.verify.ts` 먼저 작성 (실패 확인)**

```ts
// src/utils/fabHighlight.verify.ts
import { shouldHighlightAlbum, FAB_HIGHLIGHT_WINDOW_MS } from './fabHighlight';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const NOW = 1756600000000;
const DAY = 24 * 3600_000;

eq(shouldHighlightAlbum(null, null, NOW), false, '귀국 기록 없음 = 강조 안 함');
eq(shouldHighlightAlbum(NOW - DAY, null, NOW), true, '귀국 1일 후 + 앨범 없음 = 강조');
eq(shouldHighlightAlbum(NOW - 8 * DAY, null, NOW), false, '귀국 8일 후 = 소멸 (7일 창)');
eq(shouldHighlightAlbum(NOW - DAY, NOW - 3600_000, NOW), false, '귀국 후 앨범 만듦 = 강조 해제');
eq(shouldHighlightAlbum(NOW - DAY, NOW - 2 * DAY, NOW), true, '귀국 전에 만든 앨범은 무관 = 강조 유지');
eq(shouldHighlightAlbum(NOW + DAY, null, NOW), false, '미래 timestamps(시계 이상) 방어');
eq(FAB_HIGHLIGHT_WINDOW_MS, 7 * DAY, '강조 창 = 7일');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `node node_modules/tsx/dist/cli.mjs src/utils/fabHighlight.verify.ts`
Expected: FAIL — "Cannot find module './fabHighlight'"

- [ ] **Step 2: `fabHighlight.ts` 구현**

```ts
/**
 * FAB 사진첩 강조 조건 — 순수 로직 (설계 §7)
 * 조건: 귀국 후 7일 이내 && 귀국 이후 만든 앨범이 없음.
 */
export const FAB_HIGHLIGHT_WINDOW_MS = 7 * 24 * 3600_000;

export function shouldHighlightAlbum(
  returnAt: number | null,
  lastAlbumCreatedAt: number | null,
  now: number
): boolean {
  if (returnAt === null || returnAt > now) return false;
  if (now - returnAt > FAB_HIGHLIGHT_WINDOW_MS) return false;
  if (lastAlbumCreatedAt !== null && lastAlbumCreatedAt >= returnAt) return false;
  return true;
}
```

Run: `node node_modules/tsx/dist/cli.mjs src/utils/fabHighlight.verify.ts` → ✅

- [ ] **Step 3: persist.ts 키 추가**

`DETECTOR_KEYS`에 추가 (43~47행):

```ts
  returnAt: '@eorth/returnDetect/returnAt',           // 마지막 귀국 판정 시각 (FAB 강조 창)
  albumCreatedAt: '@eorth/album/lastCreatedAt',       // 마지막 앨범 생성 시각 (강조 해제)
```

- [ ] **Step 4: ReturnDetector — 귀국 시각 기록**

`ReturnDetector.tsx`의 귀국 판정 블록(`if (abroadLast && !abroad) {`) 안, 알림 발송 코드 앞에 추가:

```ts
        // FAB 사진첩 강조 창 시작점 기록 (fabHighlight.ts가 소비)
        await AsyncStorage.setItem(DETECTOR_KEYS.returnAt, String(Date.now()));
```

`DETECTOR_KEYS` import가 없으면 `import { DETECTOR_KEYS } from '../store/persist';` 추가. 알림 발송 자체(발송 조건·기록 방식)는 **건드리지 않는다** — 기존 '직전 판정 저장' 방식이 중복 발송을 이미 막고 있다.

- [ ] **Step 5: 알림 문구·딥링크**

ko.ts `returnDetect` 네임스페이스(약 2046행)의 `notifBody`를 사진첩 유도 문구로 갱신 (기존 키 유지, 값만):

```ts
    notifBody: '여행 사진이 쌓였어요 — 사진첩으로 남겨보세요',
```

en.ts 동일 키: `'Your trip photos are piling up — save them as an album'`. (`notifTitle`은 현행 유지.)

`AppNavigator.tsx`의 알림 라우팅(`else if (d.type === 'arrival')` 분기, 약 234행) 아래에 추가 — **이 리스너 한 곳에만** (이중 라우팅 금지, 파일 주석 참조):

```ts
        } else if (d.type === 'returnDetect') {
          navigate('AlbumCreate');
```

- [ ] **Step 6: AlbumCreateScreen — 앨범 생성 시각 기록**

Task 10에서 넣은 `runFormatReco(...)` 호출 옆(두 경로 모두)에 추가:

```ts
    AsyncStorage.setItem(DETECTOR_KEYS.albumCreatedAt, String(Date.now())).catch(() => {});
```

필요 import: `AsyncStorage`, `DETECTOR_KEYS` (이미 있으면 생략).

- [ ] **Step 7: RecordFab — 사진첩 버튼 배지**

import 추가:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DETECTOR_KEYS } from '../store/persist';
import { FORMAT_RECO_ENABLED } from '../constants/featureFlags';
import { shouldHighlightAlbum } from '../utils/fabHighlight';
```

컴포넌트 안 상태 + 로드 (fabOpen이 바뀔 때 재평가 — 앨범을 만들고 돌아오면 즉시 반영):

```ts
  const [highlightAlbum, setHighlightAlbum] = useState(false);
  useEffect(() => {
    if (!FORMAT_RECO_ENABLED) return;
    (async () => {
      const [ret, created] = await Promise.all([
        AsyncStorage.getItem(DETECTOR_KEYS.returnAt),
        AsyncStorage.getItem(DETECTOR_KEYS.albumCreatedAt),
      ]);
      setHighlightAlbum(
        shouldHighlightAlbum(ret ? Number(ret) : null, created ? Number(created) : null, Date.now())
      );
    })();
  }, [fabOpen]);
```

FORMATS 렌더 map 안, `fabFormatWrap`의 자식으로 `TouchableOpacity` **형제** 위치에 배지 추가 (버튼은 `overflow:'hidden'`이라 안에 넣으면 잘림 — Explore 확인):

```tsx
              {fmt.type === 'album' && highlightAlbum && (
                <View pointerEvents="none" style={styles.albumBadge} />
              )}
```

스타일 추가:

```ts
  albumBadge: {
    position: 'absolute',
    top: 14,           // 라벨 아래·버튼 우상단에 걸치도록 — 실기기에서 미세조정
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#BF85FC',
    zIndex: 5,
  },
```

펄스는 넣지 않는다(설계의 '미세 펄스'는 Android elevation 색 제약 + Animated 반복 비용 대비 효과가 작아 점 배지로 갈음 — 실기기 확인 후 필요하면 후속).

- [ ] **Step 8: 타입 체크·전체 테스트·커밋**

Run: `npx tsc --noEmit` → 오류 0.
Run: `npm test` → 전체 통과.

```bash
git add src/utils/fabHighlight.ts src/utils/fabHighlight.verify.ts src/store/persist.ts src/components/ReturnDetector.tsx src/navigation/AppNavigator.tsx src/components/RecordFab.tsx src/screens/AlbumCreateScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(funnel): 귀국 알림→사진첩 딥링크 + FAB 사진첩 배지(7일 창)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: 최종 검증 + 파리티·실기기 체크리스트

**Files:**
- Create: `docs/superpowers/specs/2026-08-31-photo-ai-format-reco-device-checklist.md`

- [ ] **Step 1: 전체 게이트 실행**

Run: `npx tsc --noEmit` → 오류 0.
Run: `npm test` → verify 전체 + check-webview-syntax + check-docs-sync 통과.
Run: `git status` → 남은 변경이 사용자 WIP(featureFlags.ts, SocialScreen.tsx, feedWindow*)와 featureFlags.ts의 새 플래그뿐인지 확인.

- [ ] **Step 2: 실기기 검증 체크리스트 문서 작성**

```markdown
# 사진 AI 형식 추천 — 실기기 검증 체크리스트 (EAS dev 빌드 필요)

네이티브 photo-vision 확장은 로컬에서 컴파일 검증이 불가능했다(로컬 prebuild 금지).
EAS dev 빌드 후 iOS/Android 각각 확인할 것. 전부 통과 전에는 OTA·정식 반영 금지.

## 네이티브 신호 (양 플랫폼)
- [ ] iOS 빌드 성공 (PhotoVisionAnalyzer.swift 컴파일)
- [ ] Android 빌드 성공 (PhotoVisionAnalyzer.kt 컴파일)
- [ ] analyzePhotos 반환에 sceneLabels(≤10)·faceCount·hasText·colorStats·dhash가 채워짐
- [ ] dhash: 같은 사진 연사 2장 → 해밍 거리 ≤ 6 확인
- [ ] 100장 앨범 분석 소요 시간 측정 (목표: 2분 이내, 메인 스레드 프리즈 없음)
- [ ] 분석 중 배터리·발열 체감 확인

## 추천 흐름
- [ ] 앨범(사진 ≥4장) 저장 → TripDetail 진입 시 "AI가 사진을 보고 있어요…" → 카드 교체
- [ ] 카드 탭 → 피드/블로그/스트립 화면에 사진 프리필 확인 (블로그는 DAY 헤딩+이미지 블록)
- [ ] 스트립 프리필: 사진 수와 프레임 슬롯 수 일치
- [ ] 카드 X → 재진입 시 재노출 안 됨
- [ ] 앨범 이어 담기 → 카드 갱신(재분석) 확인
- [ ] Expo Go(네이티브 없음) → 섹션 자체 미노출, 크래시 없음
- [ ] 게스트 모드(타인 여행) → 섹션 미노출

## 유도 퍼널
- [ ] 거주국을 JP로 바꿔 귀국 시뮬레이션(메모리 eorth-detector-state-persistence 절차) →
      귀국 알림 1건만 발송(이중 발송 없음), 탭 시 AlbumCreate로 이동
- [ ] FAB 열면 사진첩 버튼에 보라 점 배지, 앨범 만들면 사라짐
- [ ] 위치 권한 거부 상태에서도 앨범 저장→추천 카드 정상 (알림·배지만 무동작)

## 파리티 주의점
- [ ] iOS/Android에서 같은 앨범의 추천 컨셉이 크게 다르지 않은지 육안 비교
      (라벨 체계 차이 — 차이가 크면 labelTaxonomy.ts만 조정)
- [ ] Android isSmiling만 지원(iOS 항상 false) → fun 컨셉이 iOS에서 덜 잡히는지 확인
```

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-08-31-photo-ai-format-reco-device-checklist.md
git commit -m "docs(reco): 실기기 검증 체크리스트 (EAS dev 빌드 대기)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 태스크 의존 순서

```
Task 1 (타입·저장소) ─┬→ Task 2 (JS 바인딩) ─→ Task 3 (iOS) / Task 4 (Android)
                      ├→ Task 5 (라벨 매핑) → Task 6 (판정기) → Task 7 (생성기) → Task 8 (재순위) → Task 9 (골든셋)
                      └→ Task 10 (엔진+트리거, 5~8 필요) → Task 11+12 (UI+프리필, 연속 실행) → Task 13 (퍼널) → Task 14 (최종)
```

Task 3·4는 Task 2 이후 언제든 가능(다른 태스크와 독립). Task 11과 12는 tsc 의존성 때문에 반드시 연속으로 실행하고 함께 커밋한다.
