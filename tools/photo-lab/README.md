# photo-lab — 사진 AI 데스크탑 워크벤치

앱의 사진 형식 추천 AI(`src/services/photoAI/`)를 **앱 밖에서 실사진으로** 돌려 눈으로 평가·튜닝하는 도구.
튜닝 대상 파일이 곧 앱 파일이다 — 이 도구는 앱 코드를 복제하지 않고 import만 한다.
만족한 결과가 나오면 그 파일을 그대로 커밋하면 앱에 들어간다.

## 설치 (최초 1회)

```powershell
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r tools/photo-lab/requirements.txt
```

첫 실행 때 CLIP 가중치(약 350MB)를 자동으로 내려받는다. GPU 없이 CPU로 사진 100장에 1~2분.

## 실행

```powershell
.\tools\photo-lab\run.ps1 "D:\사진\오사카"                 # 추출 + 리포트 + 브라우저 열기
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -ReportOnly     # JS 층만 재실행(초 단위) — 튜닝 루프
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -Golden osaka   # 골든셋 저장
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -Force          # 신호 캐시 무시 전체 재계산
.\tools\photo-lab\run.ps1 "D:\사진\오사카" -NoModel        # 의존성 없이 순수 지표만
```

폴더 하나 = 여행 하나. 하위 폴더까지 훑는다(jpg·png·heic·webp). 결과는 `tools/photo-lab/out/<폴더명>/report.html`.

## 리포트 읽는 법

- **머리**: 사진·통과·탈락 수, **라벨 해석률**(고유 라벨 중 `labelTaxonomy.ts`가 해석한 비율), 버려진 라벨 목록.
  버려진 라벨을 클릭하면 그 라벨을 가진 사진만 남는다 — "이 라벨은 어느 컨셉에 넣어야 하나"를 볼 때.
- **사진별 분류**: 컨셉 5종 막대(최고 컨셉 보라), 라벨 칩(보라 테두리=해석됨, 흐림=버려짐), 판정 배지, 품질.
  빨간 테두리 = 품질 탈락(추천에서 제외됨).
- **스팟 그룹·베스트컷**: 시간·GPS로 묶인 그룹과 각 그룹 상위 3장.
- **추천 카드**: 앱에서 사용자가 보는 최종 결과. 1·2등 마진이 0.05 미만이면 빨강 — 가중치를 조금만 만져도 뒤집힌다.

## 튜닝 루프

1. `run.ps1 <폴더>` 로 리포트를 연다.
2. 버려진 라벨·틀린 최고 컨셉·이상한 카드를 찾는다.
3. 앱 파일을 고친다: `src/services/photoAI/labelTaxonomy.ts`(키워드 표), `conceptClassifier.ts`(규칙 배점),
   `formatCandidates.ts`(후보 생성), `personalRanker.ts`(순위).
4. `run.ps1 <폴더> -ReportOnly` 로 다시 본다. 신호는 캐시라 몇 초면 끝난다.
5. 결과가 맞다고 확정되면 `-Golden <이름>` 으로 저장한다. 저장된 `expected`는 현재 1등이므로,
   사람이 생각하는 정답이 다르면 파일을 열어 `expected`를 고친다.
6. `npm test` 로 기존 골든 회귀를 확인한다(`formatReco.verify.ts`). 골든 전체 재검사는
   `node --import tsx --import file:///<절대경로>/tools/photo-lab/register.mjs tools/photo-lab/report.ts --golden-check`.
7. 앱 파일과 골든을 커밋한다.

## 한계 (읽고 시작할 것)

- **데스크탑 CLIP은 iOS Vision·ML Kit의 대체물이다.** 라벨 어휘가 다르다(`vocab.txt` 263개 vs Vision 약 1,300개).
  여기서 해석률 100%를 만들어도 앱에서 같은 라벨이 나온다는 보장은 없다. 앱 이식 시 실기기에서 taxonomy를 재확인할 것.
- 웃음 판정은 OpenCV Haar라 부정확하다. 음식·풍경·랜드마크·문서·텍스트는 CLIP 제로샷 0.5 임계.
- 블러·밝기·색감·dhash·품질 임계는 앱 정의와 같게 맞췄다(`extract_verify.py`가 고정).
- 촬영 시각·GPS는 EXIF에서 읽는다. 카톡 등으로 받은 사진은 EXIF가 없어 파일 수정 시각으로 대체되고 GPS는 없다.
- `out/`은 git이 무시한다. 골든셋만 `src/services/photoAI/goldens/`에 남는다.

## 파일

| 파일 | 역할 |
|---|---|
| `extract.py` | 사진 폴더 → `signals.json`(앱 `PhotoMeta[]` shape) + 썸네일. 캐시로 바뀐 사진만 재계산 |
| `extract_verify.py` | 순수 지표 검증(모델 없이 돎). `python tools/photo-lab/extract_verify.py` |
| `vocab.txt` | CLIP 제로샷 라벨 어휘 |
| `report.ts` | `signals.json` → 앱 JS 층 → `report.html`. `--golden`, `--golden-check` |
| `register.mjs` + `stub-native.cjs` | 앱 파일이 import하는 expo·react-native를 빈 stub으로 연결(앱 코드 무수정) |
| `run.ps1` | 위 둘을 한 번에 |
