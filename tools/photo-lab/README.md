# photo-lab — eOrth 사진 AI 랩

앱의 사진 형식 추천 AI(`src/services/photoAI/`)를 **앱 밖에서 실사진으로** 돌려 보고, **정답을 가르쳐** 키우고,
만족하면 앱에 넣는 프로그램. 튜닝 대상 파일이 곧 앱 파일이다 — 이 도구는 앱 코드를 복제하지 않고 import만 한다.

## 설치 (최초 1회)

```powershell
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r tools/photo-lab/requirements.txt
.\tools\photo-lab\install-shortcut.ps1        # 바탕화면에 "eOrth 사진 AI 랩" 바로가기
```

첫 분석 때 CLIP 가중치(약 350MB)를 자동으로 내려받는다. GPU 없이 CPU로 사진 100장에 1~2분.

## 쓰는 법

1. 바탕화면의 **eOrth 사진 AI 랩** 아이콘을 누른다(창이 뜬다. 터미널 없음).
2. **사진 폴더 선택…** → 여행 폴더 하나(하위 폴더 포함, jpg·png·heic·webp) → **분석 시작**.
3. 사진마다 컨셉 17종 점수·라벨·판정이 보인다. 카드 아래 버튼으로 정답을 찍는다(다시 누르면 취소).
   **감성/힙/유쾌/미식/명소/여정/액티비티/인물/야경/동물/카페/문화/자연/숙소/쇼핑/선명한 색/무채색** 17개 + **탈락** 1개가
   한 줄에 4개씩 접혀 보인다(앱 `RECO_CONCEPTS`와 같은 순서).
   이 중 **감성·선명한 색·무채색은 톤 컨셉**이라 키워드 표가 없다 — 색감(채도·대비·미학)으로만 판정되므로
   이 셋으로 정답을 찍어도 라벨→컨셉 키워드가 늘지 않는다(라벨이 붙은 사진이면 그 라벨을 배우긴 한다).
   골든셋에 넣으면 안 되는 사진(흐림·무관·스크린샷)은 **탈락**으로 빼둔다 — 학습에서 제외되고, 자동 품질 판정과 얼마나 맞는지 상단에 일치율로 보인다.
4. 같은 라벨이 나오는 사진 2장 이상에 정답이 쌓이면 **배운 키워드**가 생기고, 상단에
   "정확도 앱 규칙 → 학습 반영"이 오른다. 초록 테두리 라벨 = 학습으로 새로 해석되는 라벨.
5. 만족하면 **앱에 반영** → `src/services/photoAI/labelTaxonomy.ts`의 학습 구간이 채워진다. `git diff`로 보고 커밋한다.
6. **HTML 리포트 열기**는 같은 결과를 정적 페이지(`out/<여행>/report.html`)로 연다.

정답 데이터는 `tools/photo-lab/data/teach.json`(사진 uri·라벨·정답), 학습 결과는 `data/learned.json`. 둘 다 커밋해도 되는 텍스트다(사진은 안 들어감).

## 학습이 하는 일 (규칙 기반 AI라 "학습" = 키워드 표 채우기)

- 라벨 L마다 정답 컨셉별 신뢰도 합과 등장 사진 수를 센다.
- 2장 이상 등장하고 최다 컨셉 비율이 60% 이상이면 `[L, 컨셉, 0.3+0.3·비율]`로 채택(가중치 0.48~0.6, 기존 표와 같은 범위).
- 앱 표가 이미 그 라벨을 그 컨셉으로 해석하면 오버레이를 건너뛴다 → [앱에 반영] 뒤에도 이중 계상이 없다.
- 가산만 한다. 앱 표가 이미 잘못 해석하는 키워드를 빼는 학습은 없다 — 표에서 직접 지운다.
- 컨셉 판정기의 다른 규칙(얼굴·색감 배점)은 학습 대상이 아니다.

## 터미널로도 쓸 수 있다

```powershell
.\tools\photo-lab\run.ps1 "D:\사진\오사카"                 # 추출 + 정적 리포트 + 브라우저
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -ReportOnly     # JS 층만 재실행(초 단위)
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -Golden osaka   # 골든셋 저장
python tools/photo-lab/teach.py learn                     # teach.json → learned.json
python tools/photo-lab/teach.py apply                     # learned.json → labelTaxonomy.ts
python tools/photo-lab/app.py --browser                   # 창 대신 브라우저로
```

골든 전체 재검사: `node --import tsx --import file:///<절대경로>/tools/photo-lab/register.mjs tools/photo-lab/report.ts --golden-check`

## 한계 (읽고 시작할 것)

- **데스크탑 CLIP은 iOS Vision·ML Kit의 대체물이다.** 라벨 어휘가 다르다(`vocab.txt` 263개 vs Vision 약 1,300개).
  여기서 정확도 100%를 만들어도 앱에서 같은 라벨이 나온다는 보장은 없다. 앱 이식 시 실기기에서 taxonomy를 재확인할 것.
- 웃음 판정은 OpenCV Haar라 부정확하다. 음식·풍경·랜드마크·문서·텍스트는 CLIP 제로샷 0.5 임계.
- 블러·밝기·색감·dhash·품질 임계는 앱 정의와 같게 맞췄다(`extract_verify.py`가 고정).
- 촬영 시각·GPS는 EXIF에서 읽는다. 카톡 등으로 받은 사진은 EXIF가 없어 파일 수정 시각으로 대체되고 GPS는 없다.
- 창은 pywebview(Edge WebView2). 안 뜨면 자동으로 기본 브라우저에 같은 화면을 연다.
- ⚠️ **컨셉 체계를 쪼갠 뒤에는 그 전에 찍은 정답을 그대로 [앱에 반영]하면 안 된다.**
  `teach.py`의 중복 제거 단위가 (키워드, 컨셉) **쌍**이라, 7종 시절 카페 사진을 '미식'으로
  찍어둔 정답이 남아 있으면 `coffee → food`가 앱 표에 새로 써지고 2026-09-18의 미식↔카페
  분리가 무너진다(`coffee`가 두 컨셉을 동시에 얻는다). 기계는 어떤 정답이 '옛것'인지 알 수
  없으므로 **사람이 `data/teach.json`을 비우고 다시 찍어야 한다.**
  (2026-09-18 현재 `teach.json`이 없고 `learned.json`이 비어 있어 지금은 무해하다.)

## 파일

| 파일 | 역할 |
|---|---|
| `app.py` | 프로그램 본체: 로컬 서버 + 네이티브 창. `--browser`, `--serve` |
| `ui.html` | 화면(단일 파일) |
| `teach.py` / `teach_verify.py` | 정답 → 학습 키워드, [앱에 반영] 치환. 검증은 모델 없이 돎 |
| `extract.py` / `extract_verify.py` | 사진 폴더 → `signals.json`(앱 `PhotoMeta[]` shape) + 썸네일. 캐시로 바뀐 사진만 재계산 |
| `vocab.txt` | CLIP 제로샷 라벨 어휘 |
| `report.ts` | `signals.json` → 앱 JS 층 → `result.json`(`--json`) 또는 `report.html`. `--overlay`, `--teach`, `--golden`, `--golden-check` |
| `register.mjs` + `stub-native.cjs` | 앱 파일이 import하는 expo·react-native를 빈 stub으로 연결(앱 코드 무수정) |
| `run.ps1` / `install-shortcut.ps1` | 터미널 실행 / 바탕화면 바로가기 |
| `data/` | teach.json·learned.json(커밋 대상). `out/`은 산출물(무시) |
