/**
 * 스트립(컷) 프레임 하단 밴드에 넣는 브랜드 로고의 밝은/어두운 배경용 두 벌을 만든다.
 *
 *   assets/logo.png  →  assets/logo-white.png   (어두운 배경용 — 흰 잉크)
 *                    →  assets/logo-black.png   (밝은 배경용 — 검은 잉크)
 *
 * 왜 tintColor를 쓰지 않는가:
 *   원본은 단색이 아니다. 'e'와 'rth'는 순수 흰색이지만 가운데 글로브는 0~255 그라데이션이라,
 *   tintColor로 칠하면 그라데이션이 통짜로 뭉개져 글로브가 덩어리처럼 보인다.
 *
 * 왜 RGB 반전이 아니라 '휘도 → 알파'인가:
 *   원본은 어두운 배경 전용이라 글로브 안쪽이 '검게 칠해진 불투명 픽셀'이다. 배경이 순수 검정일
 *   때만 우연히 배경과 같아 보일 뿐, 프레임 색을 바꾸면 검은 덩어리가 그대로 드러난다.
 *   그래서 색은 버리고 휘도만 잉크 농도(알파)로 옮긴다:
 *
 *     alpha = 원본알파 × (휘도/255),  RGB = 잉크색(흰색 또는 검은색)
 *
 *   → 흰 글자·글로브 격자선은 불투명한 잉크로 남고, 글로브 안쪽(어두운 부분)은 투명해져
 *     스트립 배경색이 그대로 비친다. 두 벌은 알파 마스크가 같고 잉크 색만 다르다.
 *   원본의 안티에일리어싱은 대부분 알파 채널에 들어 있어 곱해도 외곽이 뭉개지지 않는다.
 *
 * 실행: node scripts/build-cut-logo-variants.js
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS = path.join(__dirname, '..', 'assets');
const SRC = path.join(ASSETS, 'logo.png');

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width, height, data } = png;

/** 잉크색 하나로 칠하고 알파는 원본 휘도로 깎는다 */
function makeVariant(r, g, b) {
  const out = new PNG({ width, height });
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = Math.round(data[i + 3] * (luma / 255));
  }
  return PNG.sync.write(out);
}

fs.writeFileSync(path.join(ASSETS, 'logo-white.png'), makeVariant(255, 255, 255));
fs.writeFileSync(path.join(ASSETS, 'logo-black.png'), makeVariant(0, 0, 0));

console.log(`생성 완료 (${width}x${height}) — assets/logo-white.png, assets/logo-black.png`);
