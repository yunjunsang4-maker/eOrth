/**
 * 부스 뽑기 탑승권 스텁의 인스타 QR을 다시 만들어 docs/draw.html 에 박는다.
 *
 *     node scripts/draw-qr.mjs                     현재 박힌 QR을 검증만 한다
 *     node scripts/draw-qr.mjs --write             다시 생성해 draw.html 을 고친다
 *     node scripts/draw-qr.mjs --write --url '...' 다른 주소로 바꾼다
 *
 * QR path는 3,800자가 넘어 손으로 고칠 수 있는 문자열이 아니다. 주소가 바뀌면 반드시
 * 이 스크립트로 다시 만들 것.
 *
 * ⚠️ `qrcode`는 package.json의 직접 의존이 아니라 react-native-qrcode-svg를 통해 딸려온다.
 *    없다고 나오면 `npm i -D qrcode` 로 넣고 돌린 뒤, 생성물(draw.html)만 커밋하면 된다 —
 *    이 스크립트는 빌드가 아니라 사람이 가끔 돌리는 도구다.
 *
 * ⚠️ 여백(quiet zone) 4모듈을 SVG viewBox 안에 포함시킨다. CSS padding으로 빼면
 *    어두운 티켓 배경이 여백이 되어, 흰 판을 깐 의미(명암 반전 방지)가 사라진다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QR = require('qrcode');

const FILE = 'docs/draw.html';
const QUIET = 4;
/** 기본 주소. --url 로 덮을 수 있다 */
const DEFAULT_URL = 'https://www.instagram.com/eorth_app?utm_source=qr';

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const urlAt = argv.indexOf('--url');
const url = urlAt >= 0 ? argv[urlAt + 1] : DEFAULT_URL;

/** 가로로 이어지는 어두운 모듈을 한 덩어리로 묶는다 — 모듈마다 rect를 찍으면 파일이 3배가 된다 */
function toPath(size, data) {
  let p = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x]) {
        let w = 1;
        while (x + w < size && data[y * size + x + w]) w++;
        p += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
        x += w;
      } else x++;
    }
  }
  return p;
}

/** path를 격자로 되돌린다. 생성 로직이 유일한 위험 지점이라 항상 역변환으로 확인한다 */
function toGrid(path, total) {
  const g = new Uint8Array(total * total);
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = +m[1];
    const y = +m[2];
    const w = +m[3];
    for (let i = 0; i < w; i++) g[y * total + x + i] = 1;
  }
  return g;
}

function diffCount(grid, size, data, total) {
  let diff = 0;
  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      const inQR = x >= QUIET && x < QUIET + size && y >= QUIET && y < QUIET + size;
      const want = inQR && data[(y - QUIET) * size + (x - QUIET)] ? 1 : 0;
      if (grid[y * total + x] !== want) diff++;
    }
  }
  return diff;
}

const qr = QR.create(url, { errorCorrectionLevel: 'M' });
const size = qr.modules.size;
const total = size + QUIET * 2;
const path = toPath(size, qr.modules.data);

console.log(`주소   ${url}`);
console.log(`모듈   ${size}×${size} (V${qr.version}, ECC M) · 여백 포함 ${total}`);
console.log(`판 190px 기준 어두운 영역 ${((190 * size) / total).toFixed(1)}px`);

if (diffCount(toGrid(path, total), size, qr.modules.data, total) !== 0) {
  console.error('✗ 생성한 path가 인코더 출력과 다릅니다 — 넣지 않았습니다.');
  process.exit(1);
}
console.log('✓ path 역변환이 인코더 출력과 일치');

const html = readFileSync(FILE, 'utf8');
const RE = /(<path fill="#0A0A0F" d=")([^"]+)("\/>)/;
const m = html.match(RE);
if (!m) {
  console.error(`✗ ${FILE} 에서 QR path를 찾지 못했습니다.`);
  process.exit(1);
}

if (!write) {
  const same = m[2] === path;
  console.log(same ? `✓ ${FILE} 에 박힌 QR이 이 주소와 일치합니다.` : `✗ ${FILE} 의 QR이 이 주소와 다릅니다 — --write 로 갱신하세요.`);
  process.exit(same ? 0 : 1);
}

if (m[2] === path) {
  console.log('할 일 없음 — 이미 같은 QR입니다.');
  process.exit(0);
}

writeFileSync(FILE, html.replace(RE, `$1${path}$3`), 'utf8');
console.log(`✓ ${FILE} 갱신했습니다.`);
console.log('⚠️ viewBox 와 .qr 크기는 자동으로 안 바뀝니다. 모듈 수가 달라졌으면');
console.log(`   draw.html 의 viewBox="0 0 ${total} ${total}" 를 직접 맞추세요.`);
console.log('⚠️ 게시본 수정이므로 docs/draw-sw.js 의 CACHE 버전도 올릴 것.');
