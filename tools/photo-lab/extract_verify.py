"""모델 없이 도는 순수 지표 검증. python tools/photo-lab/extract_verify.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
from PIL import Image
from extract import pure_metrics, to_quality, dhash_hex


def img(arr):
    return Image.fromarray(arr.astype('uint8'))


# 분석 해상도(512)로 만들어 리사이즈 보간이 지표를 흐리지 않게 한다
flat = img(np.full((512, 512, 3), 128))
m = pure_metrics(flat)
assert m['blurVariance'] < 1, m                      # 단색 = 라플라시안 0
assert abs(m['meanLuminance'] - 0.5) < 0.02, m
assert m['colorStats']['saturation'] < 0.01, m
assert m['colorStats']['contrast'] < 0.01, m
assert m['colorStats']['darkness'] == 0, m

checker = (np.indices((512, 512)).sum(0) // 16) % 2 * 255   # 16px 격자
ck = img(np.stack([checker] * 3, -1))
m2 = pure_metrics(ck)
assert m2['blurVariance'] > 1000, m2                 # 체커보드 = 극단 선명
assert m2['colorStats']['contrast'] > 0.9, m2
assert 0.45 < m2['colorStats']['darkness'] < 0.55, m2

warm = img(np.dstack([np.full((512, 512), 220), np.full((512, 512), 120), np.full((512, 512), 40)]))
assert pure_metrics(warm)['colorStats']['warmth'] > 0.7
assert pure_metrics(warm)['colorStats']['saturation'] > 0.7

assert len(dhash_hex(flat)) == 16
assert dhash_hex(flat) == dhash_hex(flat)
assert dhash_hex(flat) != dhash_hex(ck)

q = to_quality(30, 0.5); assert q['passed'] is False and q['blurScore'] == 0.06, q
q = to_quality(600, 0.5); assert q['passed'] is True and q['blurScore'] == 1.0 and q['exposureScore'] == 1.0, q
q = to_quality(600, 0.95); assert q['passed'] is False, q
print('extract_verify ok')
