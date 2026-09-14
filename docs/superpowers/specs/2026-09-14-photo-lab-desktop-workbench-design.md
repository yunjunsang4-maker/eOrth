# 사진 AI 데스크탑 워크벤치(photo-lab) 설계

작성 2026-09-14. 사진 형식 추천 AI(`src/services/photoAI/`)를 앱 밖에서 실사진으로 돌려
눈으로 평가·튜닝하고, 만족한 결과만 앱에 반영하기 위한 독립 프로그램.

## 목적

- 폴더 하나(=여행 하나)의 실사진을 넣으면 앱과 같은 JS 층(택소노미 → 컨셉 판정 → 형식 후보 → 순위)이
  돌아가고, 결과를 브라우저 HTML 한 페이지로 본다.
- 튜닝 대상은 앱 파일 그대로다(`labelTaxonomy.ts`, `conceptClassifier.ts`, `formatCandidates.ts`,
  `personalRanker.ts`). 워크벤치는 이 파일들을 import만 하고 복제하지 않는다.
- "맞다"고 판단한 여행은 골든셋(`src/services/photoAI/goldens/`)으로 저장해 회귀 근거를 쌓는다.

## 제약과 결정

- 데스크탑(윈도우, GPU 없음)에서는 iOS Vision·ML Kit이 없다. 의미 신호는 **데스크탑 대체 모델**로 얻는다
  (사용자 결정 2026-09-14). 따라서 장면 라벨 어휘는 iOS Vision 어휘의 근사치이며, 앱 이식 시
  택소노미 재확인이 필요하다. 리포트 상단에 이 사실을 명시한다.
- 앱 코드는 수정하지 않는다. 앱 파일 튜닝은 사용자가 워크벤치를 보며 직접 한다.
- 파이썬(3.13, PIL·numpy 설치됨)이 신호 추출, tsx(설치됨)가 JS 층 실행을 맡는다.

## 구성

```
tools/photo-lab/
  extract.py     사진 폴더 → out/<여행>/signals.json + thumbs/  (파이썬)
  vocab.txt      CLIP 제로샷 라벨 어휘(여행 장면 위주 약 300개, 한 줄 하나)
  report.ts      signals.json → 앱 JS 층 실행 → out/<여행>/report.html  (tsx)
  run.ps1        extract.py → report.ts 순서 실행 후 report.html 열기
  README.md      설치·실행·튜닝 루프 안내
  out/           산출물(.gitignore)
```

### extract.py

입력: 사진 폴더 경로. 출력: `signals.json`(앱 `PhotoMeta[]`와 같은 shape) + 320px 썸네일.

| 신호 | 방법 | 앱 대응 |
|---|---|---|
| `sceneLabels` 상위 10 | open_clip ViT-B/32(CPU) 제로샷, `vocab.txt` 전체와 코사인 유사도 → softmax | iOS Vision 라벨 근사 |
| `semantic.hasFace`, `signal.faceCount` | OpenCV Haar frontalface | Vision 얼굴 검출 |
| `semantic.isSmiling` | OpenCV Haar smile(얼굴 영역 내) | ML Kit smilingProbability |
| `isFood`, `isLandscape`, `isLandmark`, `isDocument` | CLIP 제로샷 문장 4쌍(예: "a photo of food" vs "not food") 임계 0.5 | 네이티브 불리언 |
| `hasText` | CLIP 제로샷("a sign or menu with text") 임계 0.5 | Vision 텍스트 검출 근사 |
| `quality.blurScore` | 라플라시안 분산 / 500, 0~1 클램프 | `qualityAssessment.ts:77`과 동일 |
| `quality.exposureScore` | `1 - |평균밝기 - 0.5| * 2` | `qualityAssessment.ts:79`와 동일 |
| `quality.aestheticsScore` | CLIP 제로샷("a beautiful photo" vs "a bad photo") | iOS 18 미학 점수 근사 |
| `quality.passed` | 앱 기본 임계(blurVariance ≥ 60, 밝기 범위)와 동일 | `qualityAssessment.ts` DEFAULTS |
| `colorStats` 4종 | HSV 평균 채도, 색온도(R−B 정규화), 대비(표준편차), 어두운 픽셀 비율 | 네이티브 정의와 같은 스케일 0~1 |
| `dhash` | 9×8 그레이 차분 해시 16진수 16자 | 네이티브 dhash |
| `creationTime`, `location` | EXIF DateTimeOriginal·GPS, 없으면 파일 수정시각·null | MediaLibrary |
| `width`, `height` | PIL | MediaLibrary |

- HEIC는 pillow-heif로 연다. 못 여는 파일은 건너뛰고 리포트에 목록으로 표시.
- 캐시: `signals.json`에 파일 경로+수정시각 키로 저장. 재실행 시 바뀐 사진만 다시 계산한다.
  JS 층 튜닝 루프는 `report.ts`만 다시 돌리면 되므로 초 단위.
- `--force`로 전체 재계산.

### report.ts

1. `signals.json` 읽기 → `PhotoMeta[]`.
2. `groupPhotosBySpot` → `SpotGroup[]`, `filterByQuality`, `attachBestCuts`.
3. `ruleConceptClassifier` 사진별 점수, `conceptAffinityFromLabels`로 라벨 해석 여부 판정(reco-lab과 같은 역판정).
4. `stripCandidates`·`feedCandidates`·`blogCandidates`(SLOT_COUNTS는 reco-lab과 동일) → `rankCandidates`.
5. HTML 한 파일 생성(인라인 CSS·JS, 썸네일은 상대 경로).
6. `--golden <이름>`: 현재 사진·그룹·기대값(최종 1등 카드)을 골든 JSON으로
   `src/services/photoAI/goldens/golden-<이름>.json`에 저장. 기대값은 사용자가 파일을 열어 고칠 수 있다.

### report.html 구성(한 페이지)

- 머리: 폴더명, 사진 수, 통과/탈락 수, 라벨 해석률(고유 라벨 중 택소노미가 해석한 비율, 버려진 라벨 목록),
  "데스크탑 대체 모델 결과" 경고.
- 사진 격자: 썸네일, 컨셉 5종 막대(emotional·hip·fun·food·info), 최고 컨셉, 라벨 상위 10(해석된 것은 보라 네온,
  버려진 것은 흐림), 얼굴 수·웃음·음식·풍경·랜드마크·문서·텍스트 배지, 품질(블러·노출·미학, 탈락 사유).
- 스팟 그룹: 그룹별 시간 범위·사진 수·베스트컷 썸네일.
- 추천 카드: `rankCandidates` 결과 순서대로 형식×컨셉, 점수, 선택된 사진 썸네일. 후보 전체 표와 1·2등 마진.
- 색은 앱 디자인 토큰(배경 #0A0A0F, 카드 #2E2E3B, 보라 네온 #BF85FC, 텍스트 흐림 #A1A1B0).

### run.ps1

```
.\tools\photo-lab\run.ps1 "D:\사진\오사카"        # 추출+리포트+브라우저 열기
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -ReportOnly   # JS 층만 재실행(튜닝 루프)
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -Golden osaka  # 골든 저장
```

## 설치

```
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install open_clip_torch opencv-python-headless pillow-heif
```

최초 실행 시 CLIP 가중치(약 350MB)를 자동 다운로드한다. CPU에서 사진 100장 약 1~2분.

## 검증

- `tools/photo-lab/extract.verify.py`: 합성 이미지(단색·체커보드)로 blur·exposure·colorStats·dhash가
  기대 범위인지 assert. 모델 없이 돈다.
- `report.ts`는 골든셋 2건을 `signals.json` 대신 입력으로 받아 reco-lab과 같은 최종 카드가 나오는지
  `--golden-check`로 비교(기존 `formatReco.verify.ts`가 회귀 게이트이므로 별도 verify 파일은 만들지 않는다).
- npm test에는 편입하지 않는다(모델 의존).

## 뺀 것

- 여러 폴더 일괄 처리(폴더별로 한 번씩 실행).
- 브라우저 안 가중치 슬라이더(파일 수정 후 `-ReportOnly`가 더 빠르고 앱 파일과 어긋나지 않음).
- CLIP 앱 이식(로드맵상 맨 마지막, 별개 의사결정).
- 폰 신호 덤프(사용자가 데스크탑 모델 단일로 결정).
