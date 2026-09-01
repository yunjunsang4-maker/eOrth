# 사진 AI 추천 — 입력 경로를 사진첩에서 tripPhotoPool로 전환

- 날짜: 2026-09-01
- 상태: 사용자 승인 완료 (구현 계획 작성 전)
- 선행 설계: `2026-08-31-photo-ai-format-recommendation-design.md` (v1 — 이 문서는 그 §2·§8을 개정한다)
- 목표: AI 형식 추천의 입력을 "사진첩(앨범) 저장분"에서 "여행 카드별로 백그라운드 보관된 사진 참조(tripPhotoPool)"로 옮긴다. 사진첩을 만들지 않은 여행에도 추천이 뜨게 하고, 분석 결과를 캐시해 재분석 비용을 없앤다.

## 1. 왜 바꾸나

v1은 `runFormatReco`를 `AlbumCreateScreen`의 두 지점(신규 생성 `:527`, 이어 담기 `:481`)에서만 호출한다. 그런데 2026-09-01 변경으로 **과거 여행 불러오기가 사진첩을 만들지 않는다**(썸네일 1장만 복사하고 카드를 즉시 생성). 결과:

> 불러오기로 만든 여행 카드는 사진이 수백 장 연결돼 있어도 AI 추천이 영영 뜨지 않는다.

`TripDetailScreen.tsx:783`이 추천 섹션을 `albumRecordForReco`가 있을 때만 렌더하기 때문이다. 이 변경은 기능 강화라기보다 그 구멍을 막는 작업이다.

동시에 v1에는 **신호 캐시가 없다**. `assessPhotoQuality`가 호출될 때마다 사진마다 썸네일을 새로 만들고(`qualityAssessment.ts:127`) 네이티브 분석을 다시 돌린다. 입력 경로를 옮기는 김에 캐시를 넣어 재분석을 0초로 만든다.

## 2. 확정 결정 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| 입력 소스 | **pool 단일화**. 앨범을 만들 때도 pool에 기록한다 | 저장 키·무효화 규칙이 한 벌이 된다 |
| 앨범 폴백 | pool이 없거나 읽히지 않으면 앨범 `medias`를 `PoolPhoto[]`로 즉석 어댑트 | 마이그레이션 없이 기존 앨범도 동작. pool 유실이 추천 유실로 이어지지 않는다 |
| pool 보관 상한 | **사실상 제거.** 저장을 AsyncStorage 단일 키 JSON → 여행별 파일로 전환 | 아래 §3 |
| 분석 트리거 | **여행 상세 첫 진입 시 lazy** | 불러오기는 여행 카드를 한 번에 여러 개 만든다. 저장 직후 일괄 분석하면 열지도 않을 카드까지 수천 장을 분석한다 |
| 여행당 분석 상한 | **조정 가능한 상수 `RECO_ANALYZE_MAX`, 기본 250** | 실기기 측정 전이라 값을 확정하지 않는다. 측정 후 상수 하나만 조정 |
| 분석 대상 선별 | `samplePoolPhotos` 균등 간격(무작위 아님) | 처음·끝을 포함해 여행 전 구간을 고르게 훑는다. 이미 검증된 함수 |
| 프리필 복사 시점 | **카드 탭 직후 일괄 복사 + 진행 표시** | 작성 화면 3종의 기존 계약(로컬 `file://` 배열)을 건드리지 않는다 |
| 코드 구조 | 소스 해석기·신호 캐시를 별도 모듈로 분리 | 순수 구역이 늘어 `*.verify.ts`로 덮이는 범위가 커진다 |
| 범위 제외 | 추천 알고리즘·가중치·컨셉 체계 변경, CLIP 도입, 로그 소비 | 별도 로드맵(메모리 `eorth-photo-ai-upgrade-roadmap`) |

## 3. pool 저장 방식 전환

### 왜 지금 상한을 못 없애나

- 모든 여행의 pool이 단일 키 하나(`eorth-trip-photo-pool`, `tripPhotoPool.ts:43`)에 통째 JSON으로 들어간다.
- `saveTripPool`은 저장할 때마다 전체 맵을 읽고 합치고 전체를 다시 쓴다(`:235-246`).
- 안드로이드 AsyncStorage는 SQLite 기반이고 기본 상한이 6MB인데, 이 저장소에는 `AsyncStorage_db_size_in_MB` 오버라이드가 없다.
- `writeTripPools`는 실패를 조용히 삼킨다(`:222`). 한도를 넘으면 아무 신호 없이 보관이 멈춘다.

사진 1장 ≈ 125바이트. 30여행 × 3,000장 ≈ 11MB로 6MB를 넘고, 그 전에 이미 저장할 때마다 수 MB JSON을 parse/stringify하며 JS 스레드가 수 초 멈춘다.

### 전환 내용

- 저장 위치: `${documentDirectory}photoAI/pools/<tripGroupId>.json` (여행 하나당 파일 하나)
- 인덱스: `${documentDirectory}photoAI/pools/index.json` — `tripGroupId → {savedAt, photoCount}`만 담는다
- `MAX_POOL_PHOTOS`·`MAX_POOLS` 제거
- 순수 함수 6개(`samplePoolPhotos`, `pickCoverCandidates`, `prunePools`, `capPools`, `mergePool`, `parsePools`)와 `tripPhotoPool.verify.ts`의 56케이스는 **변경하지 않는다**. 바뀌는 것은 영속화 구역뿐이다.
- 1회 마이그레이션: 옛 단일 키를 읽어 파일로 분산한 뒤 키를 삭제한다. 실패해도 앨범 폴백이 있으므로 치명적이지 않다.

### 함정 — `poolAssetIds`

`poolAssetIds(pools)`(`:117`)는 재스캔에서 제외할 자산 id 집합을 만든다. 지금은 메모리 맵 하나를 훑으면 되지만, 파일로 흩어지고 여행 수 상한까지 없어지면 **모든 파일을 열어야 한다**. 스캔 시작이 느려진다.

→ 제외 id 집합은 **스캔 시작의 `syncTripPools` 청소 시점에 한 번만 재구성**한다. 이 두 동작은 기존에도 "짝"으로 관리되던 지점이므로(청소를 안 하면 삭제된 카드의 사진이 영영 제외된다) 같은 규칙 안에 들어간다.

## 4. 모듈 구조

```
recoSource.ts    resolveRecoPhotos(tripGroupId, albumRecord?) → PoolPhoto[]
                   pool 파일 우선 → 없으면 앨범 medias 어댑트 → RECO_ANALYZE_MAX 균등 솎기
signalCache.ts   assetId(없으면 uri) → { v, quality, semantic, signal }
recoEngine.ts    runFormatReco({ tripGroupId, photos, pastRecords })   ← 소스를 모른다
recoStorage.ts   키를 albumRecordId → tripGroupId, 스키마 버전 1 → 2
RecoSection.tsx  tripGroupId를 주고 상태를 받는다                       ← 얇아진다
```

| 파일 | 변경 |
|---|---|
| `src/utils/tripPhotoPool.ts` | 영속화 구역만 파일 방식으로. 상한 제거. 인덱스 추가 |
| `src/services/photoAI/recoSource.ts` | **신규** |
| `src/services/photoAI/signalCache.ts` | **신규** |
| `src/services/photoAI/recoEngine.ts` | 입력 타입 교체. 썸네일 확보를 `materializeForAnalysis`로 분리 |
| `src/services/photoAI/recoStorage.ts` | 키·스키마 버전 |
| `src/components/trip/RecoSection.tsx` | props 교체, 소스 판단 제거, 고착 판정 교체(§6) |
| `src/screens/TripDetailScreen.tsx` | 섹션 게이트를 `albumRecordForReco` → `currentGroup` |
| `src/screens/AlbumCreateScreen.tsx` | `runFormatReco` 직접 호출 2곳 제거, 앨범 저장 시 pool 기록 |

추천 상태(`recoStorage`)는 `FORMAT_RECO_ENABLED=false`로 한 번도 배포된 적이 없다. 스키마 버전만 올리면 기존 항목은 자동 폐기되고 별도 마이그레이션이 필요 없다.

## 5. 데이터 흐름

```
TripDetail 진입 (currentGroup 있음)
  → getRecoState(tripGroupId)
  → resolveRecoPhotos(tripGroupId, albumRecord)
       pool 파일 있으면 그것 / 없으면 앨범 medias 어댑트
       → pickForAnalysis(photos, RECO_ANALYZE_MAX)      균등 간격
  → sourceFingerprint 일치 && status 'ready' → 즉시 렌더 (분석 안 함)
  → 불일치 → runFormatReco (fire-and-forget, await 금지)
       사진마다: signalCache 조회
                 → 적중이면 그대로 사용
                 → 미적중이면 materializeForAnalysis → analyzePhotos → 캐시 기록
       → groupPhotosBySpot → ruleConceptClassifier
       → stripCandidates / feedCandidates / blogCandidates
       → rankCandidates → saveRecoState('ready')
  → 5초 폴링으로 카드 교체 (기존 로직 유지)

카드 탭 (accept)
  → 그 카드가 쓰는 사진만 복사 (피드 최대 20장, 스트립 2~9장, 블로그 스팟당 1~3장)
       자산 id 우선 재조회 → 리사이즈 먼저 → 실패 시 원본 복사 (importPhotoStore 경로)
  → 진행 오버레이 (Modal 금지 — 절대위치 View)
  → navigate(작성 화면, recoPrefill: 로컬 file:// 배열)   ← 작성 화면 3종 무변경
  → 일부 실패 시 성공분만 넘기고 안내
```

### `materializeForAnalysis`

pool의 사진은 갤러리 참조(`ph://`·`content://`)라 네이티브에 바로 넘길 수 없다. 네이티브 `analyzePhotos`는 `file://` 썸네일만 받는다.

확보 순서는 이미 확립된 절차를 따른다(`copyTripCover`와 동일):

1. `localUri` → 2. 자산 id로 재조회 → 3. 원본 uri

각 경로마다 **리사이즈를 먼저** 시도한다(장변 512 JPEG). 리사이즈가 `content://`·HEIC를 통과시키고 결과가 앱 캐시라 항상 읽힌다. iOS의 `localUri`는 PhotoKit 캐시 경로라 만료되는데, **있다고 해서 자산 재조회를 건너뛰면 멀쩡한 사진도 전부 실패한다**(2026-09-01 실제 발생).

## 6. 에러·엣지 케이스

### 고착 판정을 바꿔야 한다 (필수)

`RecoSection.tsx:44`의 `STALE_PENDING_MS = 3분`은 "정상 분석은 수십 초 내 끝난다"는 전제로 잡힌 값이다. 분석 상한이 250장이 되면 정상 분석이 3분을 넘길 수 있고, 그러면 **살아 있는 분석을 죽은 것으로 오판해 재시작 → 다시 3분 초과 → 무한 재분석 루프**가 된다.

→ pending 상태에 **진행 하트비트**(처리한 장수 + `updatedAt` 갱신)를 둔다. 고착 판정을 "시작 후 경과 시간"이 아니라 **"마지막 진행 이후 무변화 시간"**으로 바꾼다. 분석이 오래 걸려도 진행 중이면 죽이지 않고, 앱이 하드 킬돼 진행이 멈추면 기존과 같은 시간 안에 복구된다.

### 나머지

| 상황 | 처리 |
|---|---|
| iOS `ph://` 만료 | `RecoCard`에 **자산 id를 함께 저장**하고 복사 시 id로 재조회. uri만 저장하면 앱 재시작 후 프리필이 깨진다 |
| iCloud 오프로드 | 분석: 건너뛰고 나머지로 진행(엔진 기존 계약). 복사: 성공분만 넘기고 안내(`album.icloudSkipped` 재사용) |
| 갤러리 권한 없음/철회 | pool은 참조뿐이라 아무것도 못 읽는다 → `unavailable`, 섹션 미노출. **권한 팝업을 띄우지 않는다**(5.1.1 방어 정책 유지) |
| 분석 중 카드 삭제 | `syncTripPools` 청소에 **추천 상태·신호 캐시도 함께** 포함한다 |
| 장기체류 카드 | 여러 여행을 흡수해 `tripGroupId`가 겹친다. 기존 `mergePool` 규칙이 그대로 적용되어 이미 안전 |
| 신호 캐시 무효화 | 네이티브 신호 스키마가 바뀌면 캐시 스키마 버전을 올려 폐기(앱 버전이 아니라 캐시 버전) |
| 파일 I/O 실패 | 보관 실패가 카드 생성을 막지 않는 기존 계약 유지. 단 **"읽기 실패"와 "없음"을 구분**해야 앨범 폴백이 오작동하지 않는다 |
| 사진 4장 미만 | 기존 `MIN_PHOTOS` 규칙 유지 — 추천하지 않고 섹션 미노출 |
| pool도 앨범도 없는 여행 | 추천 대상 사진이 없다. 섹션 미노출. 의도된 동작이며 이번 범위 밖 |

## 7. 검증

### 자동 (이 저장소는 jest·vitest를 쓰지 않는다 — `*.verify.ts` 규약)

- `recoSource.verify.ts` (신규) — 앨범 → `PoolPhoto[]` 어댑트, `pickForAnalysis` 균등성(처음·끝 포함, 중복 없음, 상한 이하면 그대로), 지문 안정성과 변화 감지, pool 없음 → 앨범 폴백 선택 규칙
- `signalCache.verify.ts` (신규) — 키 선택(assetId 우선, 없으면 uri), 버전 불일치 폐기, 부분 병합
- `tripPhotoPool.verify.ts` (기존 56케이스 유지) — 인덱스 순수 로직 추가
- `formatReco.verify.ts` **무변경** — 골든셋이 이번 변경의 회귀 기준이다. 입력 경로만 바꾸는 작업이므로 **점수가 하나도 움직이지 않아야 정상**이다. 특히 blog×info(0.730) vs feed×info(0.700) 마진 0.03을 감시한다
- `npx tsc --noEmit`, `npm test`

### 실기기 (`2026-08-31-photo-ai-format-reco-device-checklist.md`에 추가)

- [ ] **250장 분석 실제 소요 시간 측정** — `RECO_ANALYZE_MAX` 확정 근거
- [ ] 재진입 시 즉시 렌더(신호 캐시 적중) 확인
- [ ] **앨범 없는 불러온 여행에서 추천 노출** — 이번 변경의 핵심 이득
- [ ] iOS 앱 재시작 후 카드 탭 → 복사 성공(`ph://` 만료 방어)
- [ ] iCloud 오프로드가 섞인 여행에서 부분 성공 안내
- [ ] 갤러리 권한 철회 후 섹션 미노출·크래시 없음
- [ ] 장기체류 카드에서 여러 여행 pool이 합쳐진 채 분석
- [ ] 분석 중 화면 이탈 후 재진입 — 하트비트로 살아 있는 분석이 죽지 않는지
- [ ] 앱 하드 킬 후 재진입 — 고착이 복구되는지

## 8. 이 문서가 개정하는 것

선행 설계(`2026-08-31-photo-ai-format-recommendation-design.md`)의 다음 항목이 대체된다.

- §1 "추천 발동 지점 = 사진첩 저장" → **여행 카드 진입**. 사진첩은 입력 소스 중 하나로 격하된다
- §2 데이터 흐름의 "앨범 저장 → (백그라운드) 분석" → **진입 시 lazy 분석 + 신호 캐시**
- §8 "무효화: 앨범 사진 추가/삭제 시 재분석" → **소스 지문 불일치 시 재분석**(앨범·pool 공통)

나머지(신호 계층, 컨셉 5종, 후보 생성기 3종, 개인화 재순위, 골든셋, 유도 퍼널)는 그대로 유효하다.

## 9. 명시적 범위 제외 (YAGNI)

- 추천 알고리즘·가중치·컨셉 체계 변경 — 별도 로드맵
- CLIP 등 임베딩 판정기 도입
- 사용 로그 소비 (카드 id 체계 재설계가 선행돼야 한다)
- 모먼트·스냅 형식 추천
- pool을 서버에 백업하는 것 — 로컬 전용 원칙 유지
