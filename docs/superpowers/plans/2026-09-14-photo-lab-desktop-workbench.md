# 사진 AI 데스크탑 워크벤치(photo-lab) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진 폴더 하나를 넣으면 앱의 사진 AI JS 층이 그대로 돌아가고 결과를 HTML 한 페이지로 보는 독립 도구를 만든다.

**Architecture:** 파이썬(`extract.py`)이 사진에서 앱 `PhotoMeta` shape의 신호를 뽑아 `signals.json`으로 쓴다. tsx(`report.ts`)가 앱의 `src/services/photoAI/*` 순수 함수를 import해 그룹화→품질 필터→컨셉 판정→후보→순위를 돌리고 HTML을 만든다. 앱 파일이 import하는 expo·react-native 모듈은 Node `Module._resolveFilename` 패치로 빈 stub에 연결한다(앱 코드 무수정).

**Tech Stack:** Python 3.13(PIL·numpy 설치됨, open_clip_torch·opencv-python-headless·pillow-heif 추가), Node 24 + tsx(설치됨), PowerShell.

## Global Constraints

- 앱 코드(`src/**`, `modules/**`)는 수정하지 않는다. 골든셋 저장만 `src/services/photoAI/goldens/`에 파일을 추가한다.
- 저장소 `.gitignore`는 사용자 WIP가 있으므로 건드리지 않는다. 산출물 무시는 `tools/photo-lab/.gitignore`로.
- 커밋은 이 작업이 만든 파일만 파일 단위로 `git add`. `git add -A` 금지.
- 신호 shape은 `src/services/photoAI/types.ts`의 `PhotoMeta`와 정확히 같다.
- 품질 판정 임계는 앱과 동일: blurVariance ≥ 60, 평균 밝기 0.12~0.92, blurScore = min(1, var/500), exposureScore = max(0, 1 − |lum − 0.5|·2).
- 실행 명령: `node --import tsx --import file:///<abs>/tools/photo-lab/register.mjs tools/photo-lab/report.ts <outDir>`.
- 모든 사용자 노출 문구는 한글.
- PyTorch 추론 모드 전환은 `model.train(False)`로 쓴다(저장소 보안 훅이 `eval(` 문자열을 막는다).

---

### Task 1: Node stub 로더와 폴더 뼈대

**Files:**
- Create: `tools/photo-lab/register.mjs`, `tools/photo-lab/stub-native.cjs`, `tools/photo-lab/.gitignore`, `tools/photo-lab/smoke.ts`

**Interfaces:**
- Produces: `register.mjs` — `node --import tsx --import file:///…/register.mjs <script.ts>` 로 실행하면 `expo*`, `react-native*`, `@react-native*` 지정자가 전부 `stub-native.cjs`로 해결된다.

- [ ] **Step 1: stub 작성**

`tools/photo-lab/stub-native.cjs`:
```js
// 앱 파일이 import하는 expo·react-native 모듈의 자리 채움. 어떤 속성을 읽어도 noop.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
module.exports = noop;
module.exports.requireNativeModule = () => { throw new Error('photo-lab stub: 네이티브 없음'); };
```

`tools/photo-lab/register.mjs`:
```js
// tsx는 .ts를 CJS require 경로로 읽으므로 ESM 훅이 아니라 _resolveFilename을 가로챈다.
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
const STUB = fileURLToPath(new URL('./stub-native.cjs', import.meta.url));
const isNative = (s) => s.startsWith('expo') || s.startsWith('react-native') || s.startsWith('@react-native');
const orig = Module._resolveFilename;
Module._resolveFilename = function (spec, ...rest) {
  return isNative(spec) ? STUB : orig.call(this, spec, ...rest);
};
```

`tools/photo-lab/.gitignore`:
```
out/
```

- [ ] **Step 2: 스모크 스크립트**

`tools/photo-lab/smoke.ts`:
```ts
import { groupPhotosBySpot } from '../../src/services/photoAI/photoGrouping';
import { filterByQuality } from '../../src/services/photoAI/qualityAssessment';
import type { PhotoMeta } from '../../src/services/photoAI/types';
const p = (id: string, t: number): PhotoMeta => ({ id, uri: id, thumbnailUri: null, creationTime: t, width: 1, height: 1, location: null });
const ps = [p('a', 0), p('b', 60_000), p('c', 3 * 3600_000)];
const groups = groupPhotosBySpot(ps);
if (groups.length !== 2) throw new Error(`그룹 수 기대 2, 실제 ${groups.length}`);
if (filterByQuality(ps).length !== 3) throw new Error('품질 필터 실패');
console.log('smoke ok');
```

- [ ] **Step 3: 실행**

Run(PowerShell): `node --import tsx --import "file:///$PWD/tools/photo-lab/register.mjs" tools/photo-lab/smoke.ts`
Expected: `smoke ok`

- [ ] **Step 4: 커밋**
```
git add tools/photo-lab/register.mjs tools/photo-lab/stub-native.cjs tools/photo-lab/.gitignore tools/photo-lab/smoke.ts
git commit -m "feat(photo-lab): 앱 사진 AI 모듈을 Node에서 불러오는 stub 로더"
```

---

### Task 2: extract.py — 순수 지표(모델 없이)

**Files:**
- Create: `tools/photo-lab/extract.py`, `tools/photo-lab/extract_verify.py`

**Interfaces:**
- Produces(파이썬 함수): `pure_metrics(img: PIL.Image) -> dict` 가 `{blurVariance, meanLuminance, colorStats:{saturation,warmth,contrast,darkness}, dhash}` 반환. `read_exif(path, img) -> (creationTime_ms:int, location:dict|None)`. `to_quality(blurVariance, meanLuminance) -> dict(blurScore, exposureScore, passed)`. `dhash_hex(img) -> str(16)`.
- CLI: `python extract.py <photoDir> <outDir> [--force] [--no-model]`. `--no-model`이면 의미 신호 없이 순수 지표만(설치 전 스모크용).
- 출력 `outDir/signals.json`: `{ "version":1, "sourceDir":str, "photos": PhotoMeta[], "skipped":[{file,reason}], "cache": {relPath: {mtime, photo}} }`. 리포트는 `photos`만 읽는다. 썸네일은 `outDir/thumbs/<idx>.jpg`(긴 변 320), `PhotoMeta.thumbnailUri`에 상대경로 `thumbs/<idx>.jpg`.
- `PhotoMeta.id` = 상대 파일 경로, `uri` = `file:///` 절대 경로.

- [ ] **Step 1: 검증 파일 먼저**

`tools/photo-lab/extract_verify.py`:
```python
"""모델 없이 도는 순수 지표 검증. python tools/photo-lab/extract_verify.py"""
import numpy as np
from PIL import Image
from extract import pure_metrics, to_quality, dhash_hex

def img(arr): return Image.fromarray(arr.astype('uint8'), 'RGB')

flat = img(np.full((64, 64, 3), 128))
m = pure_metrics(flat)
assert m['blurVariance'] < 1, m                      # 단색 = 라플라시안 0
assert abs(m['meanLuminance'] - 0.5) < 0.02, m
assert m['colorStats']['saturation'] < 0.01, m
assert m['colorStats']['contrast'] < 0.01, m
assert m['colorStats']['darkness'] == 0, m

checker = np.indices((64, 64)).sum(0) % 2 * 255
ck = img(np.stack([checker] * 3, -1))
m2 = pure_metrics(ck)
assert m2['blurVariance'] > 1000, m2                 # 체커보드 = 극단 선명
assert m2['colorStats']['contrast'] > 0.9, m2
assert 0.45 < m2['colorStats']['darkness'] < 0.55, m2

warm = img(np.dstack([np.full((64, 64), 220), np.full((64, 64), 120), np.full((64, 64), 40)]))
assert pure_metrics(warm)['colorStats']['warmth'] > 0.7
assert pure_metrics(warm)['colorStats']['saturation'] > 0.7

assert len(dhash_hex(flat)) == 16
assert dhash_hex(flat) == dhash_hex(flat)
assert dhash_hex(flat) != dhash_hex(ck)

q = to_quality(30, 0.5); assert q['passed'] is False and q['blurScore'] == 0.06
q = to_quality(600, 0.5); assert q['passed'] is True and q['blurScore'] == 1.0 and q['exposureScore'] == 1.0
q = to_quality(600, 0.95); assert q['passed'] is False
print('extract_verify ok')
```

- [ ] **Step 2: 실패 확인**

Run: `python tools/photo-lab/extract_verify.py`  Expected: `ModuleNotFoundError: No module named 'extract'`

- [ ] **Step 3: 구현**

`tools/photo-lab/extract.py` 골자:
```python
"""사진 폴더 → 앱 PhotoMeta shape의 signals.json + 썸네일.
python tools/photo-lab/extract.py <photoDir> <outDir> [--force] [--no-model]
"""
import argparse, json, os, sys, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
try:
    from pillow_heif import register_heif_opener; register_heif_opener()
except ImportError:
    pass

EXTS = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'}
THUMB = 320
ANALYZE = 512  # 앱 썸네일 한 변과 동일

def to_quality(blur_variance, mean_luminance):
    passed = blur_variance >= 60 and 0.12 <= mean_luminance <= 0.92
    return {
        'blurScore': round(max(0.0, min(1.0, blur_variance / 500)), 4),
        'exposureScore': round(max(0.0, 1 - abs(mean_luminance - 0.5) * 2), 4),
        'passed': passed,
    }

def _laplacian_var(gray):
    g = gray.astype(np.float32)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())

def dhash_hex(img):
    g = np.asarray(img.convert('L').resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    v = 0
    for b in bits: v = (v << 1) | int(b)
    return f'{v:016x}'

def _fit(img):
    w, h = img.size
    scale = ANALYZE / max(w, h)
    return img.convert('RGB').resize((max(1, round(w * scale)), max(1, round(h * scale))))

def pure_metrics(img):
    small = _fit(img)
    rgb = np.asarray(small, dtype=np.float32) / 255
    gray = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hsv = np.asarray(small.convert('HSV'), dtype=np.float32) / 255
    r, b = rgb[..., 0].mean(), rgb[..., 2].mean()
    return {
        'blurVariance': _laplacian_var(gray * 255),
        'meanLuminance': float(gray.mean()),
        'colorStats': {
            'saturation': round(float(hsv[..., 1].mean()), 4),
            'warmth': round(float(np.clip(0.5 + (r - b), 0, 1)), 4),
            'contrast': round(float(min(1.0, gray.std() * 2)), 4),
            'darkness': round(float((gray < 0.2).mean()), 4),
        },
        'dhash': dhash_hex(img),
    }
```
(EXIF·썸네일·스캔·캐시·CLI는 Step 5에서 이어서 작성.)

- [ ] **Step 4: 검증 통과**

Run: `python tools/photo-lab/extract_verify.py`  Expected: `extract_verify ok` (수치가 안 맞으면 warmth·contrast 스케일 상수를 조정하되 검증의 의미 범위는 유지)

- [ ] **Step 5: EXIF·썸네일·스캔·캐시·CLI**

```python
def read_exif(path, img):
    ctime = None; loc = None
    try:
        ex = img.getexif()
        dt = ex.get_ifd(0x8769).get(36867) or ex.get(306)  # DateTimeOriginal, DateTime
        if dt:
            ctime = int(time.mktime(time.strptime(dt, '%Y:%m:%d %H:%M:%S')) * 1000)
        gps = ex.get_ifd(0x8825)
        if gps and 2 in gps and 4 in gps:
            def dms(v, ref):
                d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
                return -d if ref in ('S', 'W') else d
            loc = {'latitude': dms(gps[2], gps.get(1, 'N')), 'longitude': dms(gps[4], gps.get(3, 'E'))}
    except Exception:
        pass
    if ctime is None:
        ctime = int(os.path.getmtime(path) * 1000)
    return ctime, loc

def scan(photo_dir):
    return sorted(p for p in Path(photo_dir).rglob('*') if p.suffix.lower() in EXTS)

def make_thumb(img, out_path):
    t = img.copy(); t.thumbnail((THUMB, THUMB)); t.convert('RGB').save(out_path, 'JPEG', quality=80)

def load_model():
    return None  # Task 3

def semantic_signals(model, img, photo):
    pass  # Task 3

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('photo_dir'); ap.add_argument('out_dir')
    ap.add_argument('--force', action='store_true'); ap.add_argument('--no-model', action='store_true')
    a = ap.parse_args()
    out = Path(a.out_dir); (out / 'thumbs').mkdir(parents=True, exist_ok=True)
    sig_path = out / 'signals.json'
    cache = {} if a.force or not sig_path.exists() else json.loads(sig_path.read_text('utf-8')).get('cache', {})
    model = None if a.no_model else load_model()
    photos, skipped, new_cache = [], [], {}
    files = scan(a.photo_dir)
    for i, f in enumerate(files):
        rel = str(f.relative_to(a.photo_dir)).replace('\\', '/'); mtime = f.stat().st_mtime
        hit = cache.get(rel)
        if hit and hit['mtime'] == mtime and (a.no_model or hit['photo'].get('signal', {}).get('sceneLabels') is not None):
            new_cache[rel] = hit; photos.append(hit['photo']); continue
        try:
            img = Image.open(f); img.load(); img = ImageOps.exif_transpose(img)
        except Exception as e:
            skipped.append({'file': rel, 'reason': str(e)[:120]}); continue
        ctime, loc = read_exif(f, img)
        thumb = f'thumbs/{i}.jpg'; make_thumb(img, out / thumb)
        m = pure_metrics(img)
        photo = {
            'id': rel, 'uri': f.resolve().as_uri(), 'thumbnailUri': thumb,
            'creationTime': ctime, 'width': img.width, 'height': img.height, 'location': loc,
            'quality': to_quality(m['blurVariance'], m['meanLuminance']),
            'semantic': {}, 'signal': {'colorStats': m['colorStats'], 'dhash': m['dhash']},
        }
        if model: semantic_signals(model, img, photo)
        photos.append(photo); new_cache[rel] = {'mtime': mtime, 'photo': photo}
        print(f'\r{i + 1}/{len(files)} {rel[:50]}', end='', file=sys.stderr)
    print(file=sys.stderr)
    sig_path.write_text(json.dumps({'version': 1, 'sourceDir': str(Path(a.photo_dir).resolve()), 'photos': photos, 'skipped': skipped, 'cache': new_cache}, ensure_ascii=False, indent=1), 'utf-8')
    print(f'사진 {len(photos)}장, 건너뜀 {len(skipped)}장 → {sig_path}')

if __name__ == '__main__': main()
```

- [ ] **Step 6: --no-model 스모크**

합성 사진 5장을 만들어 실행:
```
python -c "from PIL import Image; import numpy as np, os; os.makedirs('tools/photo-lab/out/_smoke_src', exist_ok=True); [Image.fromarray(np.random.randint(0,255,(300,400,3),dtype='uint8')).save(f'tools/photo-lab/out/_smoke_src/{i}.jpg') for i in range(5)]"
python tools/photo-lab/extract.py tools/photo-lab/out/_smoke_src tools/photo-lab/out/_smoke --no-model
```
Expected: `사진 5장, 건너뜀 0장 → …signals.json`, `thumbs/0.jpg`~`4.jpg` 존재. 두 번째 실행은 캐시로 즉시 끝남.

- [ ] **Step 7: 커밋**
```
git add tools/photo-lab/extract.py tools/photo-lab/extract_verify.py
git commit -m "feat(photo-lab): 사진 폴더에서 앱 PhotoMeta 순수 지표 추출"
```

---

### Task 3: extract.py — CLIP 제로샷·얼굴·어휘

**Files:**
- Create: `tools/photo-lab/vocab.txt`, `tools/photo-lab/requirements.txt`
- Modify: `tools/photo-lab/extract.py` (`load_model`, `semantic_signals`)

**Interfaces:**
- `load_model() -> dict|None`: open_clip ViT-B-32(pretrained `laion2b_s34b_b79k`) + 어휘 텍스트 임베딩 + cv2 캐스케이드. import 실패 시 안내 문구 출력 후 `sys.exit(2)`.
- `semantic_signals(model, img, photo)`: `photo['semantic']`에 `hasFace,isSmiling,isFood,isLandscape,isLandmark,isDocument`, `photo['signal']`에 `sceneLabels(상위 10),faceCount,hasText`, `photo['quality']['aestheticsScore']` 채움.

- [ ] **Step 1: 설치**

`tools/photo-lab/requirements.txt`:
```
torch
open_clip_torch
opencv-python-headless
pillow-heif
```
Run: `pip install torch --index-url https://download.pytorch.org/whl/cpu` 그리고 `pip install open_clip_torch opencv-python-headless pillow-heif`
Expected: 오류 없이 설치. `python -c "import open_clip, cv2, pillow_heif; print('ok')"` → `ok`

- [ ] **Step 2: 어휘**

`tools/photo-lab/vocab.txt`: 한 줄 하나, 250~300개. iOS Vision 스타일 소문자 단어. 구성 — 자연(sunset, beach, mountain, lake, forest, waterfall, snow, fog, cliff, cave, desert, field, garden, flower, cherry blossom, autumn leaves…), 도시(city, street, skyline, skyscraper, night, neon, alley, market, harbor, bridge, tram, train station, airport…), 랜드마크(landmark, castle, temple, shrine, church, cathedral, mosque, palace, monument, statue, tower, museum, ruins, fountain, plaza…), 음식(food, meal, dish, dessert, cake, coffee, tea, drink, beer, wine, cocktail, restaurant, cafe, bakery, sushi, ramen, noodle, pizza, pasta, seafood, barbecue, street food, fruit, ice cream…), 사람(selfie, people, crowd, portrait, couple, family, friends, child, party, festival, concert, wedding…), 활동(hiking, swimming, surfing, skiing, cycling, shopping, camping, amusement park, ride, zoo, aquarium…), 실내(hotel room, bedroom, lobby, bathroom, shop, mall, subway…), 사물/문서(sign, map, menu, receipt, document, screenshot, ticket, passport, text, poster, book…), 동물(dog, cat, bird, deer, horse, fish…), 교통(car, bus, train, airplane, boat, bicycle, scooter…), 기타(rain, umbrella, window, reflection, silhouette, fireworks, lantern, illumination…).

- [ ] **Step 3: 구현**

`extract.py`의 `load_model`·`semantic_signals`를 교체:
```python
def load_model():
    try:
        import torch, open_clip, cv2
    except ImportError as e:
        print(f'모델 의존성이 없습니다({e}). pip install -r tools/photo-lab/requirements.txt  (또는 --no-model)', file=sys.stderr); sys.exit(2)
    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
    model, _, preprocess = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')
    model.train(False); tok = open_clip.get_tokenizer('ViT-B-32')
    vocab = [l.strip() for l in (Path(__file__).parent / 'vocab.txt').read_text('utf-8').splitlines() if l.strip() and not l.startswith('#')]
    with torch.no_grad():
        def emb(texts):
            t = model.encode_text(tok(texts)); return t / t.norm(dim=-1, keepdim=True)
        vocab_emb = emb([f'a photo of {w}' for w in vocab])
        pairs = {
            'isFood': ('a photo of food or a meal', 'a photo with no food'),
            'isLandscape': ('a photo of natural scenery or landscape', 'a photo that is not scenery'),
            'isLandmark': ('a photo of a famous building, monument or landmark', 'a photo without any building'),
            'isDocument': ('a screenshot, receipt, document or scanned paper', 'a normal photograph'),
            'hasText': ('a photo with visible text, sign or menu', 'a photo with no text'),
            'aesthetics': ('a beautiful, well composed professional photo', 'a bad, boring snapshot'),
        }
        pair_emb = {k: emb(list(v)) for k, v in pairs.items()}
    cas = Path(cv2.data.haarcascades)
    return {
        'torch': torch, 'model': model, 'pre': preprocess, 'vocab': vocab, 'vocab_emb': vocab_emb, 'pair_emb': pair_emb,
        'face': cv2.CascadeClassifier(str(cas / 'haarcascade_frontalface_default.xml')),
        'smile': cv2.CascadeClassifier(str(cas / 'haarcascade_smile.xml')), 'cv2': cv2,
    }

def semantic_signals(M, img, photo):
    torch, cv2 = M['torch'], M['cv2']
    rgb = _fit(img)
    with torch.no_grad():
        x = M['pre'](rgb).unsqueeze(0); f = M['model'].encode_image(x); f = f / f.norm(dim=-1, keepdim=True)
        sims = (100 * f @ M['vocab_emb'].T).softmax(-1)[0]
        top = sims.topk(10)
        labels = [{'label': M['vocab'][int(i)], 'confidence': round(float(p), 4)} for p, i in zip(top.values, top.indices)]
        flags = {k: float((100 * f @ e.T).softmax(-1)[0][0]) for k, e in M['pair_emb'].items()}
    gray = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)
    faces = M['face'].detectMultiScale(gray, 1.1, 5, minSize=(24, 24))
    smiling = False
    for (x0, y0, w, h) in faces:
        roi = gray[y0 + h // 2:y0 + h, x0:x0 + w]
        if len(M['smile'].detectMultiScale(roi, 1.7, 20)) > 0: smiling = True; break
    photo['semantic'] = {
        'hasFace': len(faces) > 0, 'isSmiling': smiling,
        'isFood': flags['isFood'] > 0.5, 'isLandscape': flags['isLandscape'] > 0.5,
        'isLandmark': flags['isLandmark'] > 0.5, 'isDocument': flags['isDocument'] > 0.5,
    }
    photo['signal'].update({'sceneLabels': labels, 'faceCount': int(len(faces)), 'hasText': flags['hasText'] > 0.5})
    photo['quality']['aestheticsScore'] = round(flags['aesthetics'], 4)
```

- [ ] **Step 4: 실행 확인**

Run: `python tools/photo-lab/extract.py tools/photo-lab/out/_smoke_src tools/photo-lab/out/_smoke --force`
Expected: 첫 실행에 모델 다운로드 후 5장 처리, `signals.json`의 각 photo에 `sceneLabels` 10개·`faceCount`·`aestheticsScore` 존재. 저장소 `assets/` 안의 실제 사진 몇 장을 넣은 폴더로도 한 번 돌려 라벨이 그럴듯한지 눈으로 확인.

- [ ] **Step 5: 커밋**
```
git add tools/photo-lab/extract.py tools/photo-lab/vocab.txt tools/photo-lab/requirements.txt
git commit -m "feat(photo-lab): CLIP 제로샷 라벨·얼굴·불리언 판정 추출"
```

---

### Task 4: report.ts — 앱 JS 층 실행 + HTML

**Files:**
- Create: `tools/photo-lab/report.ts`
- Delete: `tools/photo-lab/smoke.ts` (report.ts의 `--golden-check`가 대신함)

**Interfaces:**
- Consumes: `signals.json`(Task 2 shape), 앱의 `groupPhotosBySpot`, `filterByQuality`, `attachBestCuts`, `scorePhoto`, `ruleConceptClassifier`, `conceptAffinityFromLabels`, `stripCandidates`, `feedCandidates`, `blogCandidates`, `rankCandidates`, `RECO_CONCEPTS`.
- CLI: `report.ts <outDir>` → `<outDir>/report.html`. `report.ts <outDir> --golden <name>` → `src/services/photoAI/goldens/golden-<name>.json` 저장. `report.ts --golden-check` → 골든 전부를 입력으로 파이프라인을 돌려 각 `expected`와 최종 1등이 일치하면 `golden-check ok`, 아니면 exit 1.
- HTML 데이터: 페이지 안 `<script type="application/json" id="data">`에 사진·그룹·후보·카드 전부 넣고 인라인 JS가 렌더한다(파일 하나).

- [ ] **Step 1: 파이프라인 함수 + golden-check 먼저**

```ts
/**
 * photo-lab 리포트 — signals.json을 앱 JS 층에 그대로 통과시켜 HTML 한 장으로 만든다.
 * node --import tsx --import file:///<abs>/tools/photo-lab/register.mjs tools/photo-lab/report.ts <outDir> [--golden <name>] | --golden-check
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { groupPhotosBySpot } from '../../src/services/photoAI/photoGrouping';
import { filterByQuality } from '../../src/services/photoAI/qualityAssessment';
import { attachBestCuts, scorePhoto } from '../../src/services/photoAI/bestCutSelector';
import { ruleConceptClassifier } from '../../src/services/photoAI/conceptClassifier';
import { conceptAffinityFromLabels } from '../../src/services/photoAI/labelTaxonomy';
import { stripCandidates, feedCandidates, blogCandidates } from '../../src/services/photoAI/formatCandidates';
import { rankCandidates } from '../../src/services/photoAI/personalRanker';
import { RECO_CONCEPTS } from '../../src/services/photoAI/recoTypes';
import type { ConceptScores, RecoCandidate } from '../../src/services/photoAI/recoTypes';
import type { PhotoMeta, SpotGroup } from '../../src/services/photoAI/types';

const ROOT = join(__dirname, '..', '..');
const GOLDEN_DIR = join(ROOT, 'src', 'services', 'photoAI', 'goldens');
const SLOT_COUNTS = [2, 3, 4, 6, 9]; // reco-lab.ts와 동일

export interface LabResult {
  photos: PhotoMeta[]; usable: PhotoMeta[]; groups: SpotGroup[];
  concepts: Record<string, ConceptScores>; interpreted: Record<string, boolean>;
  candidates: RecoCandidate[]; cards: RecoCandidate[]; bestScore: Record<string, number>;
}

function isLabelInterpreted(label: string): boolean {
  const s = conceptAffinityFromLabels([{ label, confidence: 1 }]);
  return RECO_CONCEPTS.some((c) => s[c] > 0);
}

export function runPipeline(photos: PhotoMeta[], groupsHint?: SpotGroup[]): LabResult {
  const usable = filterByQuality(photos);
  const groups = attachBestCuts(groupsHint ?? groupPhotosBySpot(usable), usable);
  const conceptMap = new Map(photos.map((p) => [p.id, ruleConceptClassifier(p)]));
  const candidates = [
    ...stripCandidates(photos, groups, conceptMap, SLOT_COUNTS),
    ...feedCandidates(photos, conceptMap),
    ...blogCandidates(photos, groups, conceptMap),
  ].sort((a, b) => b.score - a.score);
  const cards = rankCandidates(candidates, { viewTypeCounts: {} });
  const interpreted: Record<string, boolean> = {};
  for (const p of photos) for (const l of p.signal?.sceneLabels ?? []) interpreted[l.label] ??= isLabelInterpreted(l.label);
  const bestScore = Object.fromEntries(photos.map((p) => [p.id, scorePhoto(p)]));
  return { photos, usable, groups, concepts: Object.fromEntries(conceptMap), interpreted, candidates, cards, bestScore };
}

function goldenCheck(): void {
  let bad = 0;
  for (const f of readdirSync(GOLDEN_DIR).filter((x) => x.endsWith('.json'))) {
    const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), 'utf8'));
    const r = runPipeline(g.photos, g.groupsHint);
    const top = r.cards[0];
    const ok = top?.viewType === g.expected.topViewType && top?.concept === g.expected.topConcept;
    console.log(`${ok ? '✅' : '❌'} ${g.name}: ${top?.viewType}×${top?.concept}`);
    if (!ok) bad++;
  }
  if (bad) process.exit(1);
  console.log('golden-check ok');
}
```

- [ ] **Step 2: golden-check 실행**

Run(PowerShell): `node --import tsx --import "file:///$PWD/tools/photo-lab/register.mjs" tools/photo-lab/report.ts --golden-check`
Expected: 두 골든 모두 ✅, `golden-check ok` (reco-lab의 결과와 같아야 한다. 다르면 `groupsHint`를 안 쓴 것이니 확인).

- [ ] **Step 3: HTML 렌더**

`renderHtml(result: LabResult, meta: { sourceDir: string; skipped: {file: string; reason: string}[] }): string`. 구조:
- `<style>`: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 `#BF85FC`, 흐림 `#A1A1B0`, 구분선 `#1A1A26`, 빨강 `#FF3B30`. 격자 `grid-template-columns: repeat(auto-fill, minmax(260px,1fr))`.
- 머리: 폴더명, 사진 N/통과 M, 라벨 해석률 `해석 k / 고유 n (p%)`, 버려진 라벨 칩 목록(클릭하면 그 라벨을 가진 사진만 격자에 필터), 경고 문구 "데스크탑 CLIP 대체 모델의 결과입니다. 라벨 어휘가 iOS Vision과 달라 앱 이식 시 taxonomy를 다시 확인하세요."
- 정렬 셀렉트: 촬영순 / 컨셉별 최고 점수 / 베스트컷 점수.
- 사진 카드: `<img src=thumbs/i.jpg>`, 컨셉 5종 가로 막대(값 텍스트 포함, 최고 컨셉 보라), 라벨 칩 10개(해석됨=보라 테두리, 버려짐=흐림, 신뢰도 툴팁), 배지(얼굴 n·웃음·음식·풍경·랜드마크·문서·텍스트), 품질(블러·노출·미학 소수 2자리, `passed=false`면 빨강 "탈락").
- 스팟 그룹 섹션: 그룹별 시간 범위(현지 시각), 사진 수, 베스트컷 썸네일 3장(점수 표시).
- 추천 카드 섹션: `cards` 순서대로 큰 카드 — `형식 × 컨셉`, 점수, 선택 사진 썸네일(uri→photo 매핑은 `photos.find(p=>p.uri===u)`). 그 아래 후보 전체 표(#, 형식×컨셉, 점수, 사진 수, id)와 1·2등 마진(0.05 미만이면 빨강 경고).
- 데이터는 `JSON.stringify(result)`를 `<script type="application/json" id="data">`에 넣고(`</script>` 이스케이프: `replace(/</g,'\\u003c')`), 렌더는 인라인 JS.

- [ ] **Step 4: 골든 저장**

```ts
function saveGolden(name: string, r: LabResult, sourceDir: string): void {
  const top = r.cards[0];
  if (!top) throw new Error('추천 카드가 없어 골든을 만들 수 없습니다');
  const golden = {
    name, sourceDir, note: '기대값은 report.html을 보고 사람이 확정한다 — 필요하면 expected를 고칠 것',
    expected: { topViewType: top.viewType, topConcept: top.concept },
    photos: r.photos.map((p) => ({ ...p, thumbnailUri: null })),
    groupsHint: r.groups.map(({ bestCutIds: _b, ...g }) => g),
  };
  const path = join(GOLDEN_DIR, `golden-${name}.json`);
  writeFileSync(path, JSON.stringify(golden, null, 1), 'utf8');
  console.log(`골든 저장: ${path}`);
}
```
주의: 골든의 `uri`는 `file:///` 절대 경로가 남는다. 후보 생성은 uri를 키로만 쓰므로 문제없다.

- [ ] **Step 5: main**

```ts
const args = process.argv.slice(2);
if (args.includes('--golden-check')) { goldenCheck(); }
else {
  const outDir = args[0];
  if (!outDir) { console.error('사용법: report.ts <outDir> [--golden <name>] | --golden-check'); process.exit(1); }
  const sig = JSON.parse(readFileSync(join(outDir, 'signals.json'), 'utf8'));
  const r = runPipeline(sig.photos);
  const html = renderHtml(r, { sourceDir: sig.sourceDir, skipped: sig.skipped ?? [] });
  writeFileSync(join(outDir, 'report.html'), html, 'utf8');
  console.log(`리포트: ${join(outDir, 'report.html')}  (사진 ${r.photos.length}, 카드 ${r.cards.length})`);
  const gi = args.indexOf('--golden');
  if (gi !== -1) saveGolden(args[gi + 1] ?? basename(outDir), r, sig.sourceDir);
}
```

- [ ] **Step 6: 실행**

Run: `node --import tsx --import "file:///$PWD/tools/photo-lab/register.mjs" tools/photo-lab/report.ts tools/photo-lab/out/_smoke`
Expected: `report.html` 생성. 브라우저로 열어 격자·그룹·카드 섹션이 모두 보이는지 확인. `--golden _smoke`로 골든 파일이 생기는지 확인 후 그 파일은 삭제(합성 사진이라 골든이 아니다).

- [ ] **Step 7: 커밋**
```
git rm -q tools/photo-lab/smoke.ts
git add tools/photo-lab/report.ts
git commit -m "feat(photo-lab): 앱 JS 층 실행 + HTML 리포트·골든 저장"
```

---

### Task 5: run.ps1 + README + 끝에서 끝까지

**Files:**
- Create: `tools/photo-lab/run.ps1`, `tools/photo-lab/README.md`

- [ ] **Step 1: run.ps1**

```powershell
<#
.SYNOPSIS  사진 폴더 → 신호 추출 → 앱 JS 층 → report.html 열기
.EXAMPLE   .\tools\photo-lab\run.ps1 "D:\사진\오사카"
.EXAMPLE   .\tools\photo-lab\run.ps1 "D:\사진\오사카" -ReportOnly     # taxonomy 튜닝 루프
.EXAMPLE   .\tools\photo-lab\run.ps1 "D:\사진\오사카" -Golden osaka
#>
param(
  [Parameter(Mandatory = $true)][string]$PhotoDir,
  [switch]$ReportOnly,
  [switch]$Force,
  [switch]$NoModel,
  [string]$Golden,
  [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$lab = $PSScriptRoot
$root = Resolve-Path (Join-Path $lab '..\..')
$name = Split-Path (Resolve-Path $PhotoDir) -Leaf
$out = Join-Path $lab "out\$name"
if (-not $ReportOnly) {
  $py = @((Join-Path $lab 'extract.py'), $PhotoDir, $out); if ($Force) { $py += '--force' }; if ($NoModel) { $py += '--no-model' }
  python @py
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
$reg = ([uri](Join-Path $lab 'register.mjs')).AbsoluteUri
$node = @('--import', 'tsx', '--import', $reg, (Join-Path $lab 'report.ts'), $out)
if ($Golden) { $node += @('--golden', $Golden) }
Push-Location $root; try { node @node } finally { Pop-Location }
if ($LASTEXITCODE) { exit $LASTEXITCODE }
if (-not $NoOpen) { Start-Process (Join-Path $out 'report.html') }
```

- [ ] **Step 2: README**

`tools/photo-lab/README.md`: 목적 3줄, 설치(pip 2줄·최초 모델 다운로드 안내), 실행 3예시, **튜닝 루프**(1. run → 2. 리포트에서 버려진 라벨·틀린 컨셉 확인 → 3. `src/services/photoAI/labelTaxonomy.ts`·`conceptClassifier.ts` 수정 → 4. `-ReportOnly` 재실행 → 5. 만족하면 `-Golden 이름` 저장 → 6. `npm test`로 기존 골든 회귀 확인 → 7. 앱 파일 커밋), 한계(데스크탑 CLIP 어휘≠iOS Vision, 웃음은 Haar라 부정확, GPU 없음 100장 1~2분), 산출물 위치 `out/`은 git 무시.

- [ ] **Step 3: 끝에서 끝까지**

Run(PowerShell, 저장소 루트): `.\tools\photo-lab\run.ps1 tools\photo-lab\out\_smoke_src -Force -NoOpen` 그리고 `.\tools\photo-lab\run.ps1 tools\photo-lab\out\_smoke_src -ReportOnly -NoOpen`
Expected: 둘 다 `리포트: …report.html` 출력, exit 0. `-NoModel`로도 돈다.

- [ ] **Step 4: 기존 게이트**

Run: `npx tsc --noEmit` (tools/는 tsconfig include 대상이므로 타입 오류 0), `npm test` (기존 verify 전부 통과, photo-lab은 편입 안 됨).

- [ ] **Step 5: 커밋**
```
git add tools/photo-lab/run.ps1 tools/photo-lab/README.md
git commit -m "feat(photo-lab): 원커맨드 실행 스크립트와 사용 안내"
```
