// icons/index.tsx의 react-native-svg JSX를 표준 SVG 문자열로 변환해 JSON으로 출력
// 실행: node scripts/extract-icon-svgs.js  → scripts/icon-svgs.json
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/components/icons/index.tsx'), 'utf8');

// 기본 팔레트 (COLORS 기본값)
const COLORS = {
  purpleTop: '#E0C9FF', purpleMid: '#A78BFA', purpleBot: '#7C3AED',
  goldTop: '#FFE98A', goldBot: '#E5B100',
  redTop: '#FF8080', redBot: '#FF3B30',
  dot: '#FF4D4D',
};

// export const XxxIcon ... => ( <Svg ...> ... </Svg> ); 블록 추출
const re = /export const (\w+):[^=]*=\s*\(\{[^}]*\}\)\s*=>\s*(\{[\s\S]*?return\s*\(|\()\s*<Svg([\s\S]*?)<\/Svg>\s*\)/g;

function jsxToSvg(name, svgAttrs, inner) {
  let body = '<svg' + svgAttrs + '</svg>';
  // 태그명 변환
  body = body
    .replace(/<Svg/g, '<svg').replace(/<\/Svg>/g, '</svg>')
    .replace(/<Defs>/g, '<defs>').replace(/<\/Defs>/g, '</defs>')
    .replace(/<LinearGradient/g, '<linearGradient').replace(/<\/LinearGradient>/g, '</linearGradient>')
    .replace(/<Stop/g, '<stop')
    .replace(/<G(\s|>)/g, '<g$1').replace(/<\/G>/g, '</g>')
    .replace(/<Path/g, '<path')
    .replace(/<Circle/g, '<circle')
    .replace(/<Rect/g, '<rect');
  // 속성명 변환
  body = body
    .replace(/stopColor=/g, 'stop-color=')
    .replace(/stopOpacity=/g, 'stop-opacity=')
    .replace(/fillRule=/g, 'fill-rule=')
    .replace(/clipRule=/g, 'clip-rule=')
    .replace(/strokeWidth=/g, 'stroke-width=')
    .replace(/strokeLinecap=/g, 'stroke-linecap=')
    .replace(/strokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/strokeDasharray=/g, 'stroke-dasharray=')
    .replace(/gradientUnits=/g, 'gradientUnits=');
  // {dot && <circle .../>} 제거 (알림 닷은 기본 비표시)
  body = body.replace(/\{dot\s*&&[\s\S]*?\/>\s*\}/g, '');
  // width/height={size} 제거
  body = body.replace(/\s(width|height)=\{size\}/g, '');
  // {color ?? COLORS.x} / {color ?? "..."} → 기본값
  body = body.replace(/\{color\s*\?\?\s*COLORS\.(\w+)\}/g, (_, k) => `"${COLORS[k] || '#A78BFA'}"`);
  body = body.replace(/\{color\s*\?\?\s*"([^"]+)"\}/g, '"$1"');
  body = body.replace(/\{color\s*\?\s*1\s*:\s*1\}/g, '"1"');
  body = body.replace(/\{color\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\}/g, '"$2"');
  // {COLORS.x} → 값
  body = body.replace(/\{COLORS\.(\w+)\}/g, (_, k) => `"${COLORS[k] || '#A78BFA'}"`);
  // fill={color} (브랜드 아이콘 등 기본 인자 있는 경우) → 남은 {color} 는 흰색 폴백
  body = body.replace(/\{color\}/g, '"#FFFFFF"');
  // 숫자/문자 JSX 표현식 → 문자열 속성: x={10} → x="10", opacity={0.7} → opacity="0.7"
  body = body.replace(/=\{(-?[\d.]+)\}/g, '="$1"');
  // 남은 단순 문자열 표현식 ={"..."} → ="..."
  body = body.replace(/=\{"([^"]*)"\}/g, '="$1"');
  // 그라데이션 id를 아이콘별로 고유화
  body = body.replace(/id="([\w-]+)"/g, `id="${name}-$1"`);
  body = body.replace(/url\(#([\w-]+)\)/g, `url(#${name}-$1)`);
  // xmlns 추가
  body = body.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  // 한 줄로 압축 (path 데이터의 단일 공백은 유지됨)
  body = body.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><').trim();
  return body;
}

const out = {};
let m;
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  if (name === 'COLORS' || name === 'PALETTES') continue;
  try {
    out[name] = jsxToSvg(name, m[3], '');
  } catch (e) {
    out[name] = 'ERROR: ' + e.message;
  }
}

// 변환 누락 검사: 남은 JSX 중괄호 표현식이 있으면 경고 표시
const issues = [];
for (const [k, v] of Object.entries(out)) {
  if (/=\{|\{[a-zA-Z]/.test(v)) issues.push(k);
}

fs.writeFileSync(path.join(__dirname, 'icon-svgs.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('icons:', Object.keys(out).length);
console.log('names:', Object.keys(out).join(', '));
console.log('issues(미해결 JSX 표현식):', issues.join(', ') || '없음');
