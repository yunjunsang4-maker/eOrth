# photo-lab 데스크탑 앱 + 가르치기(teach) 설계

작성 2026-09-15. 전작 [2026-09-14 워크벤치](2026-09-14-photo-lab-desktop-workbench-design.md)는 터미널에서 돌리는 리포트였다.
사용자 요구: **바탕화면 아이콘으로 켜지는 완전한 프로그램**, 그 안에서 **내가 정답을 가르치면** 다음부터 더 잘 맞추고,
만족하면 앱에 넣는다. 사용자 결정(2026-09-15): 학습 = **사진마다 정답 컨셉 찍기**(자동 키워드 학습), 카드 정답 찍기는 제외.

## 형태

- `tools/photo-lab/app.py` 하나가 프로그램이다. 로컬 HTTP 서버(stdlib)를 띄우고 `pywebview` 네이티브 창에 `ui.html`을 연다.
  pywebview가 없거나 실패하면 기본 브라우저로 연다(같은 화면).
- 바탕화면 바로가기는 `install-shortcut.ps1`이 한 번 만든다: `pythonw.exe app.py`(콘솔 없음) + `assets/icon.png`→`.ico`.
- 화면 하나에 홈(폴더 선택·최근 여행·학습 현황)과 여행 보기(사진 격자·정답 버튼·추천 카드)가 있다.

## 학습(teach) 메커니즘

AI는 규칙 기반이다. 병목은 `labelTaxonomy.ts`의 키워드 표(로드맵 확정). 그러므로 학습 = **라벨→컨셉 키워드 표를 데이터로 채우기**.

1. 사용자가 사진 카드에서 정답 컨셉(감성/힙/유쾌/음식/정보) 하나를 누른다.
   → `tools/photo-lab/data/teach.json`에 `{uri, dhash, concept, labels:[{label,confidence}], trip, at}` 저장(uri 키, 재클릭은 덮어씀, 같은 버튼 재클릭은 취소).
   라벨을 함께 저장하므로 학습 시 여행 폴더가 없어도 된다.
2. `teach.py`가 teach.json → `data/learned.json`(`[[keyword, concept, weight], …]`)을 만든다.
   - 라벨 L마다 컨셉별 신뢰도 합 `S[L][C]`와 등장 사진 수 `n[L]`.
   - `n[L] ≥ 2` 이고 최다 컨셉 비율 `p = S[L][best]/ΣS[L] ≥ 0.6` 이면 채택. `weight = round(0.3 + 0.3·p, 2)` (0.48~0.6, 기존 표의 범위와 같음).
   - 단일 사진에서만 나온 라벨은 채택하지 않는다(과적합 방지).
3. `report.ts --overlay data/learned.json --teach data/teach.json --json`:
   - 컨셉 점수 = 앱 규칙(`ruleConceptClassifier`) + 오버레이. 오버레이는 **앱 표가 그 라벨을 그 컨셉으로 이미 해석하면 건너뛴다**
     (`conceptAffinityFromLabels([{label,1}])[concept] > 0` 로 판정 → '앱에 반영' 뒤 이중 계상 없음, 상태 파일 불필요).
   - `result.json`에 `concepts`(오버레이 포함)·`conceptsBase`(앱 규칙만)·`accuracy {base, learned, n}`(가르친 사진 중 최고 컨셉 일치율)을 낸다.
4. 화면 상단에 "앱 규칙 정확도 → 학습 반영 정확도", 학습된 키워드 표, **[앱에 반영]** 버튼.
   [앱에 반영] = `teach.py --apply`: `labelTaxonomy.ts`의 `KEYWORD_AFFINITY` 배열 끝(`];` 앞)에
   `// ── photo-lab 학습 시작 ──` … `// ── photo-lab 학습 끝 ──` 구간을 만들거나 통째로 교체해 채운다.
   이미 앱 표가 같은 (키워드, 컨셉)을 갖고 있으면 그 항목은 쓰지 않는다. 그 뒤 파이프라인을 다시 돌려 화면을 갱신한다.
   커밋은 사용자가 한다(프로그램은 git을 건드리지 않는다).

한계(의도): 오버레이는 가산만 한다 — 앱 표가 이미 잘못 해석하는 키워드를 "빼는" 학습은 없다(사람이 표에서 직접 지운다).
컨셉 판정기의 다른 규칙(얼굴·색감 배점)은 학습 대상이 아니다.

## API (app.py, 127.0.0.1 임의 포트)

| 경로 | 동작 |
|---|---|
| `GET /` | ui.html |
| `GET /api/state` | 최근 여행 목록(out/*/signals.json), 학습 현황(teach 수·learned 수), 진행 중 작업 |
| `POST /api/pick` | 폴더 선택 대화상자(pywebview 창이 있으면 그것, 없으면 tkinter) → 경로 |
| `POST /api/analyze {dir, force}` | 백그라운드 스레드: `extract.extract(...)` 진행률 콜백 → `run_pipeline(trip)` |
| `GET /api/progress` | `{busy, step, done, total, message}` |
| `GET /api/trip/<name>` | result.json + 그 여행의 teach 답 |
| `GET /out/<name>/thumbs/<i>.jpg` | 썸네일 |
| `POST /api/teach {trip, uri, concept|null}` | teach.json 갱신 → learned 재계산 → 그 여행 파이프라인 재실행 → result 반환 |
| `POST /api/apply` | labelTaxonomy.ts에 쓰기 → 모든 최근 여행 재실행 → 결과 |
| `POST /api/open-report {trip}` | report.html 생성 후 기본 브라우저로 열기(기존 리포트 유지) |

파이프라인 실행 = `node --import tsx --import file:///…/register.mjs report.ts <out> --json --overlay … --teach …` (subprocess, cwd=저장소 루트).

## 파일

```
tools/photo-lab/
  app.py               서버 + 창 + 런처
  ui.html              화면(단일 파일, 바닐라 JS, 앱 디자인 토큰)
  teach.py             teach.json → learned.json, --apply로 labelTaxonomy.ts 쓰기
  teach_verify.py      학습 규칙·apply 문자열 치환 검증(모델 없이)
  extract.py           extract() 함수화 + 모델 1회 로드 캐시 + 진행률 콜백 (CLI 유지)
  report.ts            --json / --overlay / --teach 추가 (HTML 출력 유지)
  install-shortcut.ps1 바탕화면 바로가기 생성
  data/                teach.json·learned.json (커밋 대상 — 사용자 정답 데이터)
  out/                 여행별 산출물 (무시)
```

## 검증

- `teach_verify.py`: 합성 teach 데이터로 채택/미채택 규칙, weight 범위, apply 치환(마커 생성·교체·중복 배제)을 assert. 실제 앱 파일 대신 문자열에 적용.
- `report.ts --golden-check`가 그대로 통과(오버레이 없을 때 결과 불변).
- API 끝에서 끝까지: 서버 띄워 analyze → teach 2건 → learned 생성 → apply를 임시 복사본에 → 정확도 수치 확인.
- 실사진 5장 폴더로 창 실행 스크린샷.
