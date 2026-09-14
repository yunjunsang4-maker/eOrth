"""사진 폴더 → 앱 PhotoMeta shape의 signals.json + 썸네일.

  python tools/photo-lab/extract.py <photoDir> <outDir> [--force] [--no-model]

앱의 네이티브 층(iOS Vision / ML Kit)이 하던 일을 데스크탑에서 흉내 낸다.
- 순수 지표(블러·밝기·색감·dhash·EXIF): 앱과 같은 정의로 계산한다.
- 의미 신호(장면 라벨·얼굴·음식 등): CLIP 제로샷 + OpenCV Haar. iOS Vision 어휘의 근사치다.
`--no-model`이면 의미 신호 없이 순수 지표만 낸다(설치 전 스모크용).
"""
import argparse
import json
import os

# Anaconda(MKL)와 torch가 libiomp5md.dll을 각각 실어 "OMP: Error #15"로 죽는다. torch import 전에 허용.
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

# 윈도우 콘솔(cp949)에서 한글 출력이 깨지지 않게
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except Exception:
        pass

EXTS = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'}
THUMB = 320      # 리포트 표시용 썸네일 긴 변
ANALYZE = 512    # 분석 해상도 — 앱 썸네일 한 변(qualityAssessment DEFAULTS.thumbnailSize)과 동일


# ─────────────────────────────────────────────
# 순수 지표 — 앱 qualityAssessment.ts / 네이티브 정의와 같은 스케일
# ─────────────────────────────────────────────

def to_quality(blur_variance, mean_luminance):
    """앱 toQuality와 동일: blurVariance ≥ 60, 밝기 0.12~0.92 통과."""
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
    """9×8 그레이 차분 해시, 16진수 16자(앱 dhash와 같은 형식)."""
    g = np.asarray(img.convert('L').resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    v = 0
    for b in bits:
        v = (v << 1) | int(b)
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


def read_exif(path, img):
    """(촬영 시각 epoch ms, {latitude, longitude} | None). EXIF 없으면 파일 수정 시각."""
    ctime = None
    loc = None
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
    t = img.copy()
    t.thumbnail((THUMB, THUMB))
    t.convert('RGB').save(out_path, 'JPEG', quality=80)


# ─────────────────────────────────────────────
# 의미 신호 — CLIP 제로샷 + OpenCV Haar (iOS Vision / ML Kit 대체)
# ─────────────────────────────────────────────

# 불리언 판정용 (긍정, 부정) 문장 쌍. softmax 후 긍정 확률 > 0.5 이면 참.
BOOL_PAIRS = {
    'isFood': ('a photo of food or a meal', 'a photo with no food'),
    'isLandscape': ('a photo of natural scenery or landscape', 'a photo that is not scenery'),
    'isLandmark': ('a photo of a famous building, monument or landmark', 'a photo without any building'),
    'isDocument': ('a screenshot, receipt, document or scanned paper', 'a normal photograph'),
    'hasText': ('a photo with visible text, sign or menu', 'a photo with no text'),
    'aesthetics': ('a beautiful, well composed professional photo', 'a bad, boring snapshot'),
}


def load_model():
    try:
        import torch
        import open_clip
        import cv2
    except ImportError as e:
        print(
            f'모델 의존성이 없습니다({e}). pip install -r tools/photo-lab/requirements.txt  (또는 --no-model)',
            file=sys.stderr,
        )
        sys.exit(2)
    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
    print('CLIP 모델 로드 중… (최초 1회 약 350MB 다운로드)', file=sys.stderr)
    model, _, preprocess = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')
    model.train(False)
    tok = open_clip.get_tokenizer('ViT-B-32')
    vocab_path = Path(__file__).parent / 'vocab.txt'
    vocab = [l.strip() for l in vocab_path.read_text('utf-8').splitlines() if l.strip() and not l.startswith('#')]
    with torch.no_grad():
        def emb(texts):
            t = model.encode_text(tok(texts))
            return t / t.norm(dim=-1, keepdim=True)
        vocab_emb = emb([f'a photo of {w}' for w in vocab])
        pair_emb = {k: emb(list(v)) for k, v in BOOL_PAIRS.items()}
    cas = Path(cv2.data.haarcascades)
    return {
        'torch': torch, 'model': model, 'pre': preprocess,
        'vocab': vocab, 'vocab_emb': vocab_emb, 'pair_emb': pair_emb,
        'face': cv2.CascadeClassifier(str(cas / 'haarcascade_frontalface_default.xml')),
        'smile': cv2.CascadeClassifier(str(cas / 'haarcascade_smile.xml')),
        'cv2': cv2,
    }


def semantic_signals(M, img, photo):
    torch, cv2 = M['torch'], M['cv2']
    rgb = _fit(img)
    with torch.no_grad():
        x = M['pre'](rgb).unsqueeze(0)
        f = M['model'].encode_image(x)
        f = f / f.norm(dim=-1, keepdim=True)
        sims = (100 * f @ M['vocab_emb'].T).softmax(-1)[0]
        top = sims.topk(10)
        labels = [
            {'label': M['vocab'][int(i)], 'confidence': round(float(p), 4)}
            for p, i in zip(top.values, top.indices)
        ]
        flags = {k: float((100 * f @ e.T).softmax(-1)[0][0]) for k, e in M['pair_emb'].items()}
    gray = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)
    faces = M['face'].detectMultiScale(gray, 1.1, 5, minSize=(24, 24))
    smiling = False
    for (x0, y0, w, h) in faces:
        roi = gray[y0 + h // 2:y0 + h, x0:x0 + w]
        if len(M['smile'].detectMultiScale(roi, 1.7, 20)) > 0:
            smiling = True
            break
    photo['semantic'] = {
        'hasFace': len(faces) > 0, 'isSmiling': smiling,
        'isFood': flags['isFood'] > 0.5, 'isLandscape': flags['isLandscape'] > 0.5,
        'isLandmark': flags['isLandmark'] > 0.5, 'isDocument': flags['isDocument'] > 0.5,
    }
    photo['signal'].update({'sceneLabels': labels, 'faceCount': int(len(faces)), 'hasText': flags['hasText'] > 0.5})
    photo['quality']['aestheticsScore'] = round(flags['aesthetics'], 4)


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('photo_dir')
    ap.add_argument('out_dir')
    ap.add_argument('--force', action='store_true', help='캐시 무시, 전체 재계산')
    ap.add_argument('--no-model', action='store_true', help='의미 신호 없이 순수 지표만')
    a = ap.parse_args()

    out = Path(a.out_dir)
    (out / 'thumbs').mkdir(parents=True, exist_ok=True)
    sig_path = out / 'signals.json'
    cache = {}
    if not a.force and sig_path.exists():
        cache = json.loads(sig_path.read_text('utf-8')).get('cache', {})

    files = scan(a.photo_dir)
    if not files:
        print(f'사진이 없습니다: {a.photo_dir}', file=sys.stderr)
        sys.exit(1)

    model = None if a.no_model else load_model()
    photos, skipped, new_cache = [], [], {}
    t0 = time.time()
    for i, f in enumerate(files):
        rel = str(f.relative_to(a.photo_dir)).replace('\\', '/')
        mtime = f.stat().st_mtime
        hit = cache.get(rel)
        has_semantic = bool(hit) and hit['photo'].get('signal', {}).get('sceneLabels') is not None
        if hit and hit['mtime'] == mtime and (a.no_model or has_semantic):
            new_cache[rel] = hit
            photos.append(hit['photo'])
            continue
        try:
            img = Image.open(f)
            img.load()
            img = ImageOps.exif_transpose(img)
        except Exception as e:
            skipped.append({'file': rel, 'reason': str(e)[:120]})
            continue
        ctime, loc = read_exif(f, img)
        thumb = f'thumbs/{i}.jpg'
        make_thumb(img, out / thumb)
        m = pure_metrics(img)
        photo = {
            'id': rel, 'uri': f.resolve().as_uri(), 'thumbnailUri': thumb,
            'creationTime': ctime, 'width': img.width, 'height': img.height, 'location': loc,
            'quality': to_quality(m['blurVariance'], m['meanLuminance']),
            'semantic': {},
            'signal': {'colorStats': m['colorStats'], 'dhash': m['dhash']},
        }
        if model:
            semantic_signals(model, img, photo)
        photos.append(photo)
        new_cache[rel] = {'mtime': mtime, 'photo': photo}
        print(f'\r{i + 1}/{len(files)} {rel[:50]:<50}', end='', file=sys.stderr)
    print(file=sys.stderr)

    sig_path.write_text(
        json.dumps(
            {'version': 1, 'sourceDir': str(Path(a.photo_dir).resolve()), 'photos': photos,
             'skipped': skipped, 'cache': new_cache},
            ensure_ascii=False, indent=1,
        ),
        'utf-8',
    )
    print(f'사진 {len(photos)}장, 건너뜀 {len(skipped)}장, {time.time() - t0:.1f}초 → {sig_path}')


if __name__ == '__main__':
    main()
