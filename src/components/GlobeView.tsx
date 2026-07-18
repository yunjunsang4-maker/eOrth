import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAnimationsActive } from '../hooks/useAnimationsActive';
import { THREE_SRC } from '../data/vendorThree';
import { D3_SRC } from '../data/vendorD3';
import { WORLD_GEO_TEXT } from '../data/vendorWorldGeo';
import { CITY_LABELS } from '../data/cityLabels';

// 오프라인 번들: WebView HTML에 라이브러리/지형 데이터를 인라인 주입
// (script 태그 조기 종료 방지를 위해 </script 만 이스케이프)
const escScript = (s: string) => s.replace(/<\/script/gi, '<\\/script');
const THREE_INLINE = escScript(THREE_SRC);
const D3_INLINE = escScript(D3_SRC);
const WORLD_GEO_INLINE = escScript(WORLD_GEO_TEXT);
// 딥줌 도시 라벨 데이터 — 3D 지구본에만 주입(네온 폼 제외)
const CITY_LABELS_INLINE = escScript(JSON.stringify(CITY_LABELS));

export type GlobeDisplayMode = 'flag' | 'color' | 'photo';
export type GlobeVariant = 'aurora' | 'classic';

// 네온(aurora) 지구본 본체 스킨 — SVG 시안 구조 그대로: 베이스색 + 상→하 그라데이션 오버레이(불투명도)
export interface NeonSkinTheme { base: string; gradFrom: string; gradTo: string; gradAlpha: number }

// 형태별 색상 테마 (WebView cfg로 주입).
// aurora = 첨부 디자인의 보라 발광 행성 팔레트, classic = 현재(기존) 지구본
export const GLOBE_THEMES: Record<GlobeVariant, {
  oceanBase: string; deepRGB: string; zoneRGB: string;
  landColor: string; neonColor: string; borderColor: string;
}> = {
  aurora: { oceanBase: '#1D0930', deepRGB: '40,12,70', zoneRGB: '150,70,230', landColor: '#5B1C96', neonColor: '#C982FF', borderColor: '#FFFFFF' },
  classic: { oceanBase: '#04102e', deepRGB: '5,15,55', zoneRGB: '50,110,220', landColor: '#6f6d6d', neonColor: '#a78bfa', borderColor: '#FFFFFF' },
};

export interface VisitedCountry {
  nameEn: string;       // GeoJSON 영문 이름
  color?: string;       // 사용자 지정 색상 (hex)
  photo?: string;       // 대표 사진 URI (hex)
  mode?: GlobeDisplayMode; // 개별 표시 모드
}

interface GlobeViewProps {
  size?: number;
  fullscreen?: boolean;
  onMessage?: (e: any) => void;
  visitedCountries?: VisitedCountry[];
  displayMode?: GlobeDisplayMode;
  defaultColor?: string;
  variant?: GlobeVariant; // 지구본 형태(색상 테마). 기본 aurora
  themeOverride?: NeonSkinTheme; // 네온(aurora) 본체 스킨 — 지정 시 셰이더 기본 팔레트 대신 사용 (constants/globeSkins.ts)
  sponsoredItems?: { nameEn: string; label: string; price?: string; image?: string }[]; // 광고 미니 카드 마커 항목
}

const globeHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  body {
    background: #0A0A0F;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    font-family: 'Noto Sans KR', sans-serif;
    cursor: grab;
  }
  body:active { cursor: grabbing; }
  /* 배경 — 색활성화(neon) 지구본과 동일한 DOM 배경으로 통일. 단 우주가스(nebula)는 넣지 않는다. */
  #bg { position: fixed; inset: 0; overflow: hidden; background: #0A0B0F; z-index: 1; }
  #stars { position: absolute; inset: 0; pointer-events: none; }
  #stars i { position: absolute; border-radius: 50%; background: #ffffff; display: block; }
  @keyframes ng-twinkle { 0%,100% { opacity: var(--o); } 50% { opacity: calc(var(--o)*0.35); } }
  #canvas-container { position: fixed; inset: 0; z-index: 2; }
  canvas { display: block; }
  /* 광고(스폰서) 마커 레이어 — 영토 위 지점에서 선이 올라가 작은 카드가 달린 형태.
     .ad-pin 은 0크기 앵커(=영토 지점), 자식들은 그 지점 기준으로 배치. 카드만 터치 수신 */
  #ad-layer { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
  .ad-pin { position: absolute; width: 0; height: 0; display: none; }
  .ad-pin .ad-dot {
    position: absolute; left: 0; top: 0; width: 8px; height: 8px; transform: translate(-50%,-50%);
    border-radius: 50%; background: #FFC45A; box-shadow: 0 0 8px 2px rgba(255,196,90,0.7);
    animation: adpulse 1.7s ease-in-out infinite;
  }
  .ad-pin .ad-line {
    position: absolute; left: 0; bottom: 0; width: 1.5px; height: 36px; transform: translateX(-50%);
    background: linear-gradient(to top, rgba(255,196,90,0.95), rgba(255,196,90,0.15));
  }
  .ad-pin .ad-minicard {
    position: absolute; left: 0; bottom: 36px; transform: translateX(-50%);
    pointer-events: auto; cursor: pointer; white-space: nowrap;
    background: rgba(18,16,26,0.94); border: 1px solid rgba(255,196,90,0.55);
    border-radius: 7px; padding: 4px 7px; box-shadow: 0 3px 10px rgba(0,0,0,0.5);
  }
  .ad-pin .ad-minicard .mc-row { display: flex; align-items: center; gap: 6px; }
  .ad-pin .ad-minicard .mc-thumb { width: 26px; height: 26px; border-radius: 5px; object-fit: cover; background: #1A1A26; flex: none; display: block; }
  .ad-pin .ad-minicard .mc-text { display: flex; flex-direction: column; }
  .ad-pin .ad-minicard .mc-head { display: flex; align-items: center; gap: 4px; }
  .ad-pin .ad-minicard .mc-ad {
    font-size: 7px; font-weight: 800; letter-spacing: 0.3px;
    color: #0A0A0F; background: #FFC45A; border-radius: 2px; padding: 0px 3px;
  }
  .ad-pin .ad-minicard .mc-title { font-size: 9.5px; font-weight: 700; color: #fff; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
  .ad-pin .ad-minicard .mc-price { font-size: 9.5px; font-weight: 800; color: #FFC45A; margin-top: 1px; }
  @keyframes adpulse { 0%,100% { transform: translate(-50%,-50%) scale(0.9); opacity: 0.85; } 50% { transform: translate(-50%,-50%) scale(1.2); opacity: 1; } }
  /* 딥줌 지역명 라벨(나라·도시) 캔버스 — 광고핀(z5) 아래, 지구본(z2) 위 */
  #label-layer { position: fixed; inset: 0; pointer-events: none; z-index: 4; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
<div id="bg"><div id="stars"></div></div>
<div id="canvas-container"></div>
<canvas id="label-layer"></canvas>
<div id="ad-layer"></div>

<script>${THREE_INLINE}<\/script>
<script>${D3_INLINE}<\/script>
<script>var WORLD_GEO=${WORLD_GEO_INLINE};<\/script>
<script>var CITY_LABELS=${CITY_LABELS_INLINE};<\/script>

<script>
// 색상은 RN에서 variant(aurora/classic)에 따라 setTheme 메시지로 주입된다.
// 기본값 = aurora(보라 발광 행성) — 첫 페인트가 디폴트 형태와 일치하도록.
var cfg = {
  oceanBase: "#1D0930",   // 구체 바다/본체 베이스
  deepRGB: "40,12,70",    // 딥 존(어두운 그라데이션) rgb
  zoneRGB: "150,70,230",  // 발광 존(밝은 그라데이션) rgb
  landColor: "#5B1C96",   // 비방문 대륙 색
  neonColor: "#C982FF",   // 대기광
  borderColor: "#FFFFFF", // 국경선(구분선) — 흰색
  autoRotate: true,
  gridOpacity: 0
};

// --- Three.js setup ---
var container = document.getElementById('canvas-container');
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // 투명 → 뒤 CSS #bg 별밭이 비침 (색활성화 지구본 배경과 통일)
container.appendChild(renderer.domElement);

// 별밭(DOM, 결정적) — neon 배경과 동일 파라미터. 우주가스(nebula)는 제외.
// 아래 3D Points 별밭은 이걸로 대체하므로 비활성화한다. (신뢰 불가 입력 없음 — createElement로 구성)
(function(){
  var el = document.getElementById('stars'); if (!el) return;
  var seed = 1337; function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }
  for (var i=0;i<320;i++){
    var o=(0.45+rnd()*0.4), x=(rnd()*100).toFixed(2), y=(rnd()*100).toFixed(2);
    var d=(0.8+rnd()*1.8).toFixed(2), t=(2.5+rnd()*4).toFixed(2);
    var s = document.createElement('i');
    s.style.left = x+'%'; s.style.top = y+'%'; s.style.width = d+'px'; s.style.height = d+'px';
    s.style.setProperty('--o', o.toFixed(2)); s.style.opacity = o.toFixed(2);
    s.style.animation = 'ng-twinkle '+t+'s ease-in-out infinite';
    el.appendChild(s);
  }
})();

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 4.2;
camera.position.y = 0; // 전체화면: 화면 세로 정중앙 배치(neon과 일치)
camera.zoom = 1.436 * (window.innerWidth / window.innerHeight); // neon과 동일 기본 크기(디스크=폭의 85%)
camera.updateProjectionMatrix();
var BASE_ZOOM = camera.zoom; // 2단계 딥줌 배율의 기준값(리사이즈 시 재계산)

// Stars
var starGeo = new THREE.BufferGeometry();
var starPositions = [];
for (var i = 0; i < 600; i++) {
  var theta = Math.random() * Math.PI * 2;
  var phi = Math.acos(2 * Math.random() - 1);
  var r = 50 + Math.random() * 100;
  starPositions.push(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.6 });
// 3D 별밭 비활성화 — DOM #bg 별밭(위)으로 대체해 색활성화 지구본 배경과 통일.
// scene.add(new THREE.Points(starGeo, starMat));

// 별똥별 (3D) — 지구본 뒤(깊이 Z<0)에서 좌상단→우상단으로 살짝 떨어지며 지나감.
// 그라데이션 꼬리 플레인. 깊이 테스트로 지구본 구체 뒤로 자연스럽게 가려진다. animate 루프에서 갱신.
var SHOOT = (function(){
  var cv = document.createElement('canvas'); cv.width = 128; cv.height = 8;
  var cx = cv.getContext('2d');
  var grd = cx.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(202,130,255,0.55)');
  grd.addColorStop(1.0, 'rgba(255,255,255,1)');
  cx.fillStyle = grd; cx.fillRect(0, 0, 128, 8);
  var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;

  var Z = -22; // 지구본(원점) 뒤 깊이
  var geo = new THREE.PlaneGeometry(1, 1);
  var pool = [];
  for (var i = 0; i < 3; i++) {
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    var m = new THREE.Mesh(geo, mat); m.visible = false; m.position.z = Z; scene.add(m);
    pool.push({ mesh: m, active: false, t: 0, dur: 1, sx: 0, sy: 0, ex: 0, ey: 0 });
  }
  function bounds() {
    var dist = camera.position.z - Z;
    var halfH = Math.tan((45 * Math.PI / 180) / 2) * dist / camera.zoom;
    return { halfW: halfH * (window.innerWidth / window.innerHeight), halfH: halfH };
  }
  function fire(s) {
    var b = bounds();
    var len = b.halfW * (0.16 + Math.random() * 0.12);
    var startY = b.halfH * (0.18 + Math.random() * 0.55); // 살짝 아래로 (3D는 +Y가 위 → 값 감소가 하강)
    var drop = b.halfH * (0.06 + Math.random() * 0.10);
    s.sx = -b.halfW - len; s.sy = startY; s.ex = b.halfW + len; s.ey = startY - drop;
    s.dur = 720 + Math.random() * 520; s.t = 0; s.active = true;
    s.mesh.visible = true; s.mesh.scale.set(len, len * 0.05, 1);
    s.mesh.rotation.z = Math.atan2(s.ey - s.sy, s.ex - s.sx);
  }
  var nextAt = performance.now() + 1500 + Math.random() * 2200;
  function update(now, dtMs) {
    if (now >= nextAt) {
      var n = 2 + (Math.random() < 0.5 ? 1 : 0);
      var idle = pool.filter(function(s){ return !s.active; });
      for (var k = 0; k < Math.min(n, idle.length); k++) {
        (function(s, delay){ setTimeout(function(){ if (!window.__globePaused) fire(s); }, delay); })(idle[k], k * (150 + Math.random() * 300));
      }
      nextAt = now + 4200 + Math.random() * 5200;
    }
    for (var i = 0; i < pool.length; i++) {
      var s = pool[i]; if (!s.active) continue;
      s.t += dtMs / s.dur;
      if (s.t >= 1) { s.active = false; s.mesh.visible = false; s.mesh.material.opacity = 0; continue; }
      s.mesh.position.set(s.sx + (s.ex - s.sx) * s.t, s.sy + (s.ey - s.sy) * s.t, Z);
      var o = s.t < 0.12 ? (s.t / 0.12) : (s.t > 0.82 ? (1 - (s.t - 0.82) / 0.18) : 1);
      s.mesh.material.opacity = Math.max(0, o);
    }
  }
  return { update: update };
})();

// Globe group
var globe = new THREE.Group();
scene.add(globe);

// Visited countries data (injected from React Native)
var visitedMap = {};
var globeDisplayMode = 'flag'; // 'flag' | 'color'
var globeDefaultColor = '#BF85FC';

// GeoJSON name → ISO 2-letter code
var EN_TO_ISO = {
  "Belize":"bz","Benin":"bj","Burkina Faso":"bf","Burundi":"bi","Central African Republic":"cf","Djibouti":"dj","East Timor":"tl","Equatorial Guinea":"gq","Eritrea":"er","Fiji":"fj","Gabon":"ga","Gambia":"gm","Lesotho":"ls","Liberia":"lr","Malawi":"mw","Mauritania":"mr","Rwanda":"rw","Sierra Leone":"sl","Solomon Islands":"sb","Suriname":"sr","The Bahamas":"bs","Trinidad and Tobago":"tt","Vanuatu":"vu","Ivory Coast":"ci","Guinea Bissau":"gw",
  "Afghanistan":"af","Albania":"al","Algeria":"dz","Angola":"ao",
  "Argentina":"ar","Armenia":"am","Australia":"au","Austria":"at",
  "Azerbaijan":"az","Bangladesh":"bd","Belarus":"by","Belgium":"be",
  "Bhutan":"bt","Bolivia":"bo","Bosnia and Herzegovina":"ba",
  "Botswana":"bw","Brazil":"br","Brunei":"bn","Bulgaria":"bg",
  "Cambodia":"kh","Cameroon":"cm","Canada":"ca","Chad":"td",
  "Chile":"cl","China":"cn","Colombia":"co","Congo":"cg",
  "Costa Rica":"cr","Croatia":"hr","Cuba":"cu",
  "Czech Republic":"cz","Czechia":"cz",
  "Democratic Republic of the Congo":"cd",
  "Denmark":"dk","Dominican Republic":"do",
  "Ecuador":"ec","Egypt":"eg","El Salvador":"sv",
  "Estonia":"ee","Ethiopia":"et","Finland":"fi","France":"fr",
  "Georgia":"ge","Germany":"de","Ghana":"gh","Greece":"gr",
  "Guatemala":"gt","Guinea":"gn","Guyana":"gy","Haiti":"ht",
  "Honduras":"hn","Hungary":"hu","Iceland":"is","India":"in",
  "Indonesia":"id","Iran":"ir","Iraq":"iq","Ireland":"ie",
  "Israel":"il","Italy":"it","Jamaica":"jm","Japan":"jp",
  "Jordan":"jo","Kazakhstan":"kz","Kenya":"ke",
  "Kuwait":"kw","Kyrgyzstan":"kg","Laos":"la",
  "Latvia":"lv","Lebanon":"lb","Libya":"ly",
  "Lithuania":"lt","Luxembourg":"lu",
  "Madagascar":"mg","Malaysia":"my","Mali":"ml",
  "Mexico":"mx","Moldova":"md","Mongolia":"mn","Montenegro":"me",
  "Morocco":"ma","Mozambique":"mz","Myanmar":"mm",
  "Namibia":"na","Nepal":"np","Netherlands":"nl",
  "New Zealand":"nz","Nicaragua":"ni","Niger":"ne",
  "Nigeria":"ng","North Korea":"kp","Norway":"no",
  "Oman":"om","Pakistan":"pk","Panama":"pa",
  "Papua New Guinea":"pg","Paraguay":"py","Peru":"pe",
  "Philippines":"ph","Poland":"pl","Portugal":"pt",
  "Qatar":"qa","Romania":"ro","Russia":"ru",
  "Saudi Arabia":"sa","Senegal":"sn","Serbia":"rs",
  "Slovakia":"sk","Slovenia":"si","Somalia":"so",
  "South Africa":"za","South Korea":"kr","South Sudan":"ss",
  "Spain":"es","Sri Lanka":"lk","Sudan":"sd",
  "Sweden":"se","Switzerland":"ch","Syria":"sy",
  "Hong Kong":"hk","Macau":"mo",
  "Taiwan":"tw","Tajikistan":"tj","Tanzania":"tz",
  "Thailand":"th","Togo":"tg","Tunisia":"tn",
  "Turkey":"tr","Turkmenistan":"tm",
  "Uganda":"ug","Ukraine":"ua",
  "United Arab Emirates":"ae",
  "United Kingdom":"gb","United States of America":"us",
  "Uruguay":"uy","Uzbekistan":"uz",
  "Venezuela":"ve","Vietnam":"vn",
  "Yemen":"ye","Zambia":"zm","Zimbabwe":"zw",
  "Greenland":"gl","Western Sahara":"eh",
  "Palestine":"ps","Cyprus":"cy","Kosovo":"xk",
  "North Macedonia":"mk","Eswatini":"sz",
};

// 국기 이미지 캐시
var flagImageCache = {};
function loadFlagImage(isoCode) {
  if (flagImageCache[isoCode]) return Promise.resolve(flagImageCache[isoCode]);
  return new Promise(function(resolve) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { flagImageCache[isoCode] = img; resolve(img); };
    img.onerror = function() { resolve(null); };
    img.src = 'https://flagcdn.com/w640/' + isoCode + '.png';
  });
}

// 사진 이미지 캐시
var photoImageCache = {};
function loadPhotoImage(url) {
  if (!url) return Promise.resolve(null);
  if (photoImageCache[url]) return Promise.resolve(photoImageCache[url]);
  return new Promise(function(resolve) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { photoImageCache[url] = img; resolve(img); };
    img.onerror = function() { resolve(null); };
    img.src = url;
  });
}

// 방문 국가 이미지 일괄 로드 (국기 또는 사진)
async function loadAllImages() {
  var promises = [];
  Object.keys(visitedMap).forEach(function(nameEn) {
    var visited = visitedMap[nameEn];
    if (globeDisplayMode === 'flag') {
      var iso = EN_TO_ISO[nameEn];
      if (iso) promises.push(loadFlagImage(iso));
    } else if (globeDisplayMode === 'photo') {
      if (visited.photo) {
        promises.push(loadPhotoImage(visited.photo));
      }
    }
  });
  await Promise.all(promises);
}

// Create texture from world GeoJSON
async function buildTexture() {
  // 사진 모드는 작은 나라(폴리곤이 몇 텍셀뿐)도 선명하도록 텍스처를 2배(8192x4096)로 키운다.
  // 다른 모드(국기·색)는 메모리 절약 위해 4096x2048 유지. (2:1 등장방형 비율 유지 필수)
  var isPhotoMode = globeDisplayMode === 'photo';
  var W = isPhotoMode ? 8192 : 4096, H = isPhotoMode ? 4096 : 2048;
  // 딥줌(50m) 텍스처 여부 — 이때는 스트로크/글로우를 굽지 않는다(확대 시 뿌연 후광 방지, 벡터 선이 대신)
  var hiTex = (typeof worldLOD !== 'undefined' && worldLOD === '50m');
  var offscreen = document.createElement('canvas');
  offscreen.width = W; offscreen.height = H;
  var ctx = offscreen.getContext('2d');
  // 사진 활성화 모드에서 확대 그리기 화질 개선 (기본 low 스무딩 → high)
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}

  ctx.fillStyle = cfg.oceanBase;
  ctx.fillRect(0, 0, W, H);

  // 바다 발광 블롭 — 경도 이음새(±W)가 매끄럽도록 좌우로 감아서 그린다(중앙 블롭은 사실상 1번만 유효).
  // 안 감으면 텍스처 왼/오른쪽 끝 밝기가 달라 태평양(180°)에 세로 봉합선이 보인다.
  function oceanRadial(x, y, radius, stops) {
    [x - W, x, x + W].forEach(function(cx) {
      var rg = ctx.createRadialGradient(cx, y, 0, cx, y, radius);
      stops.forEach(function(s) { rg.addColorStop(s[0], s[1]); });
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    });
  }

  [[W*0.15, H*0.35], [W*0.45, H*0.25], [W*0.7, H*0.55],
   [W*0.25, H*0.7],  [W*0.85, H*0.35], [W*0.55, H*0.65]].forEach(function(z) {
    oceanRadial(z[0], z[1], W * 0.22, [[0, 'rgba(' + cfg.deepRGB + ',0.6)'], [1, 'rgba(' + cfg.deepRGB + ',0)']]);
  });

  [[W*0.32, H*0.52, 0.20], [W*0.62, H*0.38, 0.17],
   [W*0.82, H*0.6, 0.18], [W*0.12, H*0.62, 0.16], [W*0.92, H*0.42, 0.15]].forEach(function(z) {
    oceanRadial(z[0], z[1], W * z[2], [[0, 'rgba(' + cfg.zoneRGB + ',0.50)'], [0.5, 'rgba(' + cfg.zoneRGB + ',0.22)'], [1, 'rgba(0,0,0,0)']]);
  });

  [[W*0.4, H*0.08], [W*0.75, H*0.92], [W*0.15, H*0.9]].forEach(function(z) {
    oceanRadial(z[0], z[1], W * 0.13, [[0, 'rgba(123,92,240,0.22)'], [1, 'rgba(0,0,0,0)']]);
  });

  // 톤 오버레이 — 세로 그라데이션(좌우 동일)이라 이음새 없음 (대각선이면 좌/우 끝 색이 달라 봉합선 발생)
  var tone = ctx.createLinearGradient(0, 0, 0, H);
  tone.addColorStop(0, 'rgba(30,70,200,0.12)');
  tone.addColorStop(0.5, 'rgba(40,30,140,0.06)');
  tone.addColorStop(1, 'rgba(30,70,200,0.12)');
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, W, H);

  var horizon = ctx.createLinearGradient(0, 0, 0, H);
  horizon.addColorStop(0, 'rgba(' + cfg.deepRGB + ',0.35)');
  horizon.addColorStop(0.3, 'rgba(0,0,0,0)');
  horizon.addColorStop(0.7, 'rgba(0,0,0,0)');
  horizon.addColorStop(1, 'rgba(' + cfg.deepRGB + ',0.35)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, W, H);

  var proj = d3.geoEquirectangular().scale(H / Math.PI).translate([W / 2, H / 2]);
  var path = d3.geoPath().projection(proj).context(ctx);

  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;

  // 비방문 국가 먼저 그리기
  worldData.features.forEach(function(f) {
    var nameEn = f.properties.name || '';
    var visited = visitedMap[nameEn];
    if (!visited) {
      ctx.fillStyle = cfg.landColor;
      ctx.beginPath();
      path(f);
      ctx.fill();
    }
  });
  ctx.shadowBlur = 0;

  // 비방문 국가 테두리
  ctx.strokeStyle = cfg.landColor;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  worldData.features.forEach(function(f) {
    var nameEn = f.properties.name || '';
    if (!visitedMap[nameEn]) {
      ctx.beginPath();
      path(f);
      ctx.stroke();
    }
  });

  // 방문 국가 활성화
  var pathForBounds = d3.geoPath().projection(proj);
  worldData.features.forEach(function(f) {
    var nameEn = f.properties.name || '';
    var visited = visitedMap[nameEn];
    if (!visited) return;

    var mode = visited.mode || globeDisplayMode;
    var baseColor = visited.color || globeDefaultColor;
    var iso = EN_TO_ISO[nameEn];
    var flagImg = iso ? flagImageCache[iso] : null;
    var photoImg = visited.photo ? photoImageCache[visited.photo] : null;

    if (mode === 'flag' && flagImg) {
      // 국기 모드: 각 폴리곤(영토)마다 개별적으로 국기 그리기
      var geom = f.geometry;
      var polygons = [];
      if (geom.type === 'Polygon') {
        polygons.push(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(function(poly) { polygons.push(poly); });
      }

      polygons.forEach(function(coords) {
        // 개별 폴리곤을 GeoJSON feature로 만들기
        var subFeature = {
          type: 'Feature',
          properties: f.properties,
          geometry: { type: 'Polygon', coordinates: coords }
        };
        var subBounds = pathForBounds.bounds(subFeature);
        var bx = subBounds[0][0], by = subBounds[0][1];
        var bw = subBounds[1][0] - bx, bh = subBounds[1][1] - by;
        if (bw <= 0 || bh <= 0) return;

        ctx.save();
        ctx.beginPath();
        path(subFeature);
        ctx.clip();

        // 국기를 cover 방식으로 채우기
        var imgRatio = flagImg.width / flagImg.height;
        var boxRatio = bw / bh;
        var dw, dh, dx, dy;
        if (imgRatio > boxRatio) {
          dh = bh; dw = bh * imgRatio;
          dx = bx - (dw - bw) / 2; dy = by;
        } else {
          dw = bw; dh = bw / imgRatio;
          dx = bx; dy = by - (dh - bh) / 2;
        }
        ctx.drawImage(flagImg, dx, dy, dw, dh);

        ctx.restore();
      });

      // 전체 테두리 — 딥줌(50m) 텍스처엔 굽지 않음(확대 시 뿌연 후광의 원인, 벡터 선이 대신)
      if (!hiTex) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 3;
        ctx.beginPath();
        path(f);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else if (mode === 'photo' && photoImg) {
      // 대표 사진 모드: 각 폴리곤(영토)마다 개별적으로 사진 그리기
      var geom = f.geometry;
      var polygons = [];
      if (geom.type === 'Polygon') {
        polygons.push(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(function(poly) { polygons.push(poly); });
      }

      polygons.forEach(function(coords) {
        var subFeature = {
          type: 'Feature',
          properties: f.properties,
          geometry: { type: 'Polygon', coordinates: coords }
        };
        var subBounds = pathForBounds.bounds(subFeature);
        var bx = subBounds[0][0], by = subBounds[0][1];
        var bw = subBounds[1][0] - bx, bh = subBounds[1][1] - by;
        if (bw <= 0 || bh <= 0) return;

        ctx.save();
        ctx.beginPath();
        path(subFeature);
        ctx.clip();

        // 사진을 cover 방식으로 채우기
        var imgRatio = photoImg.width / photoImg.height;
        var boxRatio = bw / bh;
        var dw, dh, dx, dy;
        if (imgRatio > boxRatio) {
          dh = bh; dw = bh * imgRatio;
          dx = bx - (dw - bw) / 2; dy = by;
        } else {
          dw = bw; dh = bw / imgRatio;
          dx = bx; dy = by - (dh - bh) / 2;
        }
        ctx.drawImage(photoImg, dx, dy, dw, dh);

        ctx.restore();
      });

      // 전체 테두리 — 딥줌(50m) 텍스처엔 굽지 않음(뿌연 후광 방지, 벡터 선이 대신)
      if (!hiTex) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 3;
        ctx.beginPath();
        path(f);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else {
      // 색상 모드 (또는 국기 로드 실패 시 폴백) — 딥줌 텍스처엔 글로우/스트로크 생략(후광 방지)
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = hiTex ? 0 : 4;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      path(f);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!hiTex) {
        ctx.globalCompositeOperation = 'lighter';
        var centroid = d3.geoCentroid(f);
        var projC = proj(centroid);
        if (projC) {
          var grd = ctx.createRadialGradient(projC[0], projC[1], 0, projC[0], projC[1], 120);
          grd.addColorStop(0, 'rgba(255,255,255,0.06)');
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grd;
          ctx.beginPath();
          path(f);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';

        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        path(f);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  });

  // Clouds
  function seededRand(seed) {
    var s = seed;
    return function() { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  }
  function drawCloud(cx, cy, scale, opacity, seed) {
    var rand = seededRand(seed);
    var blobCount = 10 + Math.floor(rand() * 8);
    for (var i = 0; i < blobCount; i++) {
      var angle = rand() * Math.PI * 2;
      var dist = rand() * 45 * scale;
      var bx = cx + Math.cos(angle) * dist;
      var by = cy + Math.sin(angle) * dist * 0.45;
      var cr = (16 + rand() * 28) * scale;
      var a = opacity * (0.4 + rand() * 0.6);
      var grad = ctx.createRadialGradient(bx, by, 0, bx, by, cr);
      grad.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      grad.addColorStop(0.5, 'rgba(255,255,255,' + (a * 0.5) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.ellipse(bx, by, cr, cr * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
  drawCloud(310,270,1.6,0.10,1); drawCloud(440,430,1.3,0.09,2);
  drawCloud(200,390,1.1,0.08,3); drawCloud(560,320,1.2,0.09,4);
  drawCloud(360,570,1.4,0.10,5); drawCloud(490,640,1.0,0.08,6);
  drawCloud(250,530,0.9,0.07,7); drawCloud(1810,290,1.4,0.09,8);
  drawCloud(1920,460,1.2,0.10,9); drawCloud(1760,510,1.1,0.08,10);
  drawCloud(1870,620,1.0,0.07,11); drawCloud(870,250,1.3,0.09,12);
  drawCloud(950,410,1.1,0.08,13); drawCloud(810,500,1.0,0.08,14);
  drawCloud(900,600,1.2,0.07,15); drawCloud(1270,590,1.2,0.09,16);
  drawCloud(1390,670,1.1,0.08,17); drawCloud(1190,690,0.9,0.07,18);
  drawCloud(1310,740,1.0,0.08,19); drawCloud(580,95,1.5,0.08,20);
  drawCloud(880,75,1.3,0.07,21); drawCloud(1180,85,1.4,0.08,22);
  drawCloud(1450,70,1.2,0.07,23); drawCloud(400,750,1.2,0.08,24);
  drawCloud(600,820,1.1,0.07,25); drawCloud(300,870,1.0,0.07,26);

  var canvasTex = new THREE.CanvasTexture(offscreen);
  canvasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
  canvasTex.magFilter = THREE.LinearFilter;
  canvasTex.generateMipmaps = true;
  // 경도(가로) 이음새 제거 — 기본 ClampToEdge면 UV 봉합선(180°=태평양)에 세로선이 생김. neon과 동일하게 RepeatWrapping.
  canvasTex.wrapS = THREE.RepeatWrapping;
  canvasTex.wrapT = THREE.ClampToEdgeWrapping;
  return canvasTex;
}

// Atmosphere glow
function buildAtmosphere(neonHex) {
  var color = new THREE.Color(neonHex);
  var geo = new THREE.SphereGeometry(1.08, 64, 64);
  var mat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: color } },
    vertexShader: 'varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; void main(){ float intensity = pow(0.55 - dot(vNormal, vec3(0,0,1)), 3.5); gl_FragColor = vec4(glowColor * intensity, intensity * 0.7); }',
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

// Inner glow
function buildInnerGlow() {
  var geo = new THREE.SphereGeometry(0.999, 64, 64);
  var mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vNormal; void main(){ float d = dot(vNormal, vec3(0,0,1)); float rim = 1.0 - clamp(d,0.0,1.0); float darkness = pow(rim,1.5)*0.55; gl_FragColor = vec4(0,0,0,darkness); }',
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  return new THREE.Mesh(geo, mat);
}

function geoToVec3(lon, lat, r) {
  var phi = THREE.MathUtils.degToRad(90 - lat);
  var theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function buildBorders(world, hexColor) {
  var group = new THREE.Group();
  var R = 1.0015;
  var matCore = new THREE.LineBasicMaterial({
    color: new THREE.Color(hexColor), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  var matGlow = new THREE.LineBasicMaterial({
    color: new THREE.Color(hexColor), transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  function addRing(coords) {
    if (coords.length < 2) return;
    var pts = coords.map(function(c) { return geoToVec3(c[0], c[1], R); });
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var geoG = new THREE.BufferGeometry().setFromPoints(
      coords.map(function(c) { return geoToVec3(c[0], c[1], R * 1.001); })
    );
    group.add(new THREE.Line(geo, matCore));
    group.add(new THREE.Line(geoG, matGlow));
  }
  world.features.forEach(function(f) {
    var geom = f.geometry;
    if (!geom) return;
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(addRing);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function(poly) { poly.forEach(addRing); });
    }
  });
  // 크로스페이드용 — 재질은 그룹당 2개뿐이라 매 프레임 opacity 갱신이 저렴
  group.userData.mats = [matCore, matGlow];
  group.userData.baseOp = [0.95, 0.3];
  return group;
}

var KO_NAMES = {
  "Belize":"벨리즈","Benin":"베냉","Burkina Faso":"부르키나파소","Burundi":"부룬디","Central African Republic":"중앙아프리카공화국","Djibouti":"지부티","East Timor":"동티모르","Equatorial Guinea":"적도기니","Eritrea":"에리트레아","Fiji":"피지","Gabon":"가봉","Gambia":"감비아","Lesotho":"레소토","Liberia":"라이베리아","Malawi":"말라위","Mauritania":"모리타니","Rwanda":"르완다","Sierra Leone":"시에라리온","Solomon Islands":"솔로몬제도","Suriname":"수리남","The Bahamas":"바하마","Trinidad and Tobago":"트리니다드 토바고","Vanuatu":"바누아투","Ivory Coast":"코트디부아르","Guinea Bissau":"기니비사우",
  "Afghanistan":"아프가니스탄","Albania":"알바니아","Algeria":"알제리",
  "Angola":"앙골라","Argentina":"아르헨티나","Armenia":"아르메니아",
  "Australia":"호주","Austria":"오스트리아","Azerbaijan":"아제르바이잔",
  "Bangladesh":"방글라데시","Belarus":"벨라루스","Belgium":"벨기에",
  "Bhutan":"부탄","Bolivia":"볼리비아","Bosnia and Herzegovina":"보스니아 헤르체고비나",
  "Botswana":"보츠와나","Brazil":"브라질","Brunei":"브루나이",
  "Bulgaria":"불가리아","Cambodia":"캄보디아","Cameroon":"카메룬","Canada":"캐나다",
  "Chad":"차드","Chile":"칠레","China":"중국","Colombia":"콜롬비아",
  "Congo":"콩고 공화국","Costa Rica":"코스타리카","Croatia":"크로아티아","Cuba":"쿠바",
  "Czech Republic":"체코","Czechia":"체코",
  "Democratic Republic of the Congo":"콩고민주공화국",
  "Denmark":"덴마크","Dominican Republic":"도미니카공화국",
  "Ecuador":"에콰도르","Egypt":"이집트","El Salvador":"엘살바도르",
  "Estonia":"에스토니아","Ethiopia":"에티오피아","Finland":"핀란드","France":"프랑스",
  "Georgia":"조지아","Germany":"독일","Ghana":"가나","Greece":"그리스",
  "Guatemala":"과테말라","Guinea":"기니","Guyana":"가이아나","Haiti":"아이티",
  "Honduras":"온두라스","Hungary":"헝가리","Iceland":"아이슬란드","India":"인도",
  "Indonesia":"인도네시아","Iran":"이란","Iraq":"이라크","Ireland":"아일랜드",
  "Israel":"이스라엘","Italy":"이탈리아","Jamaica":"자메이카","Japan":"일본",
  "Jordan":"요르단","Kazakhstan":"카자흐스탄","Kenya":"케냐",
  "Kuwait":"쿠웨이트","Kyrgyzstan":"키르기스스탄","Laos":"라오스",
  "Latvia":"라트비아","Lebanon":"레바논","Libya":"리비아",
  "Lithuania":"리투아니아","Luxembourg":"룩셈부르크",
  "Madagascar":"마다가스카르","Malaysia":"말레이시아","Mali":"말리",
  "Mexico":"멕시코","Moldova":"몰도바","Mongolia":"몽골","Montenegro":"몬테네그로",
  "Morocco":"모로코","Mozambique":"모잠비크","Myanmar":"미얀마",
  "Namibia":"나미비아","Nepal":"네팔","Netherlands":"네덜란드",
  "New Zealand":"뉴질랜드","Nicaragua":"니카라과","Niger":"니제르",
  "Nigeria":"나이지리아","North Korea":"북한","Norway":"노르웨이",
  "Oman":"오만","Pakistan":"파키스탄","Panama":"파나마",
  "Papua New Guinea":"파푸아뉴기니","Paraguay":"파라과이","Peru":"페루",
  "Philippines":"필리핀","Poland":"폴란드","Portugal":"포르투갈",
  "Qatar":"카타르","Romania":"루마니아","Russia":"러시아",
  "Saudi Arabia":"사우디아라비아","Senegal":"세네갈","Serbia":"세르비아",
  "Slovakia":"슬로바키아","Slovenia":"슬로베니아","Somalia":"소말리아",
  "South Africa":"남아프리카공화국","South Korea":"대한민국","South Sudan":"남수단",
  "Spain":"스페인","Sri Lanka":"스리랑카","Sudan":"수단",
  "Sweden":"스웨덴","Switzerland":"스위스","Syria":"시리아",
  "Hong Kong":"홍콩","Macau":"마카오",
  "Taiwan":"대만","Tajikistan":"타지키스탄","Tanzania":"탄자니아",
  "Thailand":"태국","Togo":"토고","Tunisia":"튀니지",
  "Turkey":"튀르키예","Turkmenistan":"투르크메니스탄",
  "Uganda":"우간다","Ukraine":"우크라이나",
  "United Arab Emirates":"아랍에미리트",
  "United Kingdom":"영국","United States of America":"미국",
  "Uruguay":"우루과이","Uzbekistan":"우즈베키스탄",
  "Venezuela":"베네수엘라","Vietnam":"베트남",
  "Yemen":"예멘","Zambia":"잠비아","Zimbabwe":"짐바브웨",
  "Greenland":"그린란드","Western Sahara":"서사하라",
  "Palestine":"팔레스타인","Cyprus":"키프로스","Kosovo":"코소보",
  "North Macedonia":"북마케도니아","Eswatini":"에스와티니",
};

var globeMesh, atmosphere, borderGroup;
var worldData = null;

async function init() {
  // 오프라인 번들된 지형 데이터 우선, 없으면 원격 폴백
  worldData = (typeof WORLD_GEO !== 'undefined' && WORLD_GEO) ? WORLD_GEO : await d3.json('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson');
  // 번들 GeoJSON 국가명 정규화 — 매핑 테이블(정식 명칭) 기준으로 통일 (미국·영국 등 활성화/탭 매칭 복구)
  var GEO_NAME_FIX = {"USA":"United States of America","England":"United Kingdom","Republic of Serbia":"Serbia","United Republic of Tanzania":"Tanzania","Macedonia":"North Macedonia","Swaziland":"Eswatini","Republic of the Congo":"Congo","West Bank":"Palestine"};
  worldData.features.forEach(function(f){ var fx = GEO_NAME_FIX[f.properties && f.properties.name]; if (fx) f.properties.name = fx; });
  world110Data = worldData; // 딥줌 LOD 복귀용 원본 보관
  buildLabelIndex();        // 지역명 라벨 인덱스(centroid·면적) — 110m 기준 1회
  var texture = await buildTexture();

  var geo = new THREE.SphereGeometry(1, 128, 128);
  // 반사광(specular) 제거 — 사진 위에 유리 같은 광택 띠가 얹혀 "빛나 보이던" 문제 해결.
  // 확산 조명(구체 입체 음영)은 유지하되 광택만 없애 사진이 원본처럼 보이게 한다.
  var mat = new THREE.MeshPhongMaterial({
    map: texture,
    specular: new THREE.Color(0x000000),
    shininess: 0,
  });
  globeMesh = new THREE.Mesh(geo, mat);
  globe.add(globeMesh);

  atmosphere = buildAtmosphere(cfg.neonColor);
  globe.add(atmosphere);
  globe.add(buildInnerGlow());

  borderGroup = buildBorders(worldData, cfg.borderColor);
  globe.add(borderGroup);

  // 보류된 광고 마커 생성 (setSponsored가 worldData 로드 전에 도착한 경우)
  if (pendingSponsored) buildAdMarkers(pendingSponsored);

  // Lights — 정면 텍셀이 원본 밝기(≈1.0)에 가깝도록 낮춤. 기존(주변광 0.8 + 방향광 합 ~0.7)은
  // 정면을 원본의 약 1.5배로 밝혀 사진이 "빛나 보이던" 원인이었다. 확산 음영(구체 입체감)은 유지.
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  [[5,3,5],[-5,3,5],[5,-3,5],[-5,-3,5],[0,0,-6],[0,5,0]].forEach(function(p) {
    var l = new THREE.DirectionalLight(0xffffff, 0.1);
    l.position.set(p[0], p[1], p[2]);
    scene.add(l);
  });

  animate();

  // 초기화 완료를 RN에 알림 → RN이 그때 테마/방문국/광고 페이로드를 전송한다.
  // (고정 setTimeout 대신 실제 준비 시점에 맞춰 전송 — 저사양 기기 누락·고사양 불필요 지연 방지)
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'globeReady' }));
  }
}


// Zoom — 2단계 딥줌: 1단계 dolly(targetZ 5.0→1.3), 한계 도달 후 2단계 camera.zoom 배율(1→3.2).
// 카메라를 구·글로우 셸(1.08) 안으로 이동시키지 않아 클리핑 없이 깊은 확대가 된다.
var targetZ = 4.2, currentZ = 4.2;
var MIN_Z = 1.3, MAX_Z = 5.0;
var targetZoomX = 1, currentZoomX = 1, MAX_ZOOM_X = 10.0;
// 유효 확대 배율(시작=1) — 라벨 LOD·국경 해상도·회전 감도의 공용 지표
function zoomFactor() { return (4.2 / currentZ) * currentZoomX; }
// 회전 감도 — 확대할수록 반비례로 줄여 구글맵처럼 정밀 이동
function rotSens() { return 0.005 / Math.max(1, zoomFactor() * 0.55); }

// Drag
var isDragging = false;
var prevMouse = { x: 0, y: 0 };
var velocity = { x: 0, y: 0 };
var rotX = 0, rotY = 0;

// Tap detection
var raycaster = new THREE.Raycaster();
var tapStartPos = { x: 0, y: 0 };
function detectCountry(clientX, clientY) {
  // init(텍스처 빌드) 완료 전 탭 방어 — globeMesh가 undefined면 intersectObject에서
  // TypeError가 나 touchend 핸들러가 죽는다 (neon 버전과 동일 가드)
  if (!globeMesh || !worldData) return null;
  var mouse = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  var hits = raycaster.intersectObject(globeMesh);
  if (!hits.length) return null;

  var pt = hits[0].point.clone();
  var inv = new THREE.Matrix4().copy(globe.matrixWorld).invert();
  pt.applyMatrix4(inv);

  var lat = 90 - THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, pt.y))));
  var lon = THREE.MathUtils.radToDeg(Math.atan2(pt.z, -pt.x)) - 180;

  return worldData.features.find(function(f) { return d3.geoContains(f, [lon, lat]); }) || null;
}

function onTap(clientX, clientY) {
  var feature = detectCountry(clientX, clientY);
  if (!feature) return;

  var nameEn = feature.properties.name;
  var nameKo = KO_NAMES[nameEn] || nameEn;

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'countryTapped',
      country: nameKo,
      countryEn: nameEn,
    }));
  }
}


// Touch / Mouse events
var lastPinchDist = null;

window.addEventListener('mousedown', function(e) {
  isDragging = true;
  tapStartPos = { x: e.clientX, y: e.clientY };
  prevMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', function(e) {
  var dist = Math.hypot(e.clientX - tapStartPos.x, e.clientY - tapStartPos.y);
  if (dist < 5) onTap(e.clientX, e.clientY);
  isDragging = false;
});
window.addEventListener('mousemove', function(e) {
  if (!isDragging) return;
  var dx = e.clientX - prevMouse.x;
  var dy = e.clientY - prevMouse.y;
  var s = rotSens();
  velocity.x = dx * s;
  velocity.y = dy * s;
  rotY += dx * s;
  rotX += dy * s;
  rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
  prevMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2) { lastPinchDist = null; return; }
  isDragging = true;
  tapStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
window.addEventListener('touchend', function(e) {
  var t = e.changedTouches[0];
  var dist = Math.hypot(t.clientX - tapStartPos.x, t.clientY - tapStartPos.y);
  if (dist < 8) onTap(t.clientX, t.clientY);
  isDragging = false;
  lastPinchDist = null;
});
// 핀치/휠 공용 — 확대(delta>0)는 dolly 한계 후 2단계 배율로 이어받고, 축소는 배율부터 되돌린다
function applyZoomDelta(delta) {
  if (delta > 0 && targetZ <= MIN_Z + 1e-4) {
    targetZoomX = Math.min(MAX_ZOOM_X, targetZoomX * (1 + delta * 0.6));
  } else if (delta < 0 && targetZoomX > 1 + 1e-4) {
    targetZoomX = Math.max(1, targetZoomX * (1 + delta * 0.6));
  } else {
    targetZ -= delta * 1.0;
    targetZ = Math.max(MIN_Z, Math.min(MAX_Z, targetZ));
  }
}

window.addEventListener('touchmove', function(e) {
  if (e.touches.length === 2) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (lastPinchDist !== null) {
      applyZoomDelta((dist - lastPinchDist) * 0.01);
    }
    lastPinchDist = dist;
    return;
  }
  if (!isDragging) return;
  var tdx = e.touches[0].clientX - prevMouse.x;
  var tdy = e.touches[0].clientY - prevMouse.y;
  var s = rotSens();
  rotY += tdx * s;
  rotX += tdy * s;
  rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

window.addEventListener('wheel', function(e) {
  e.preventDefault();
  applyZoomDelta(-e.deltaY * 0.003);
}, { passive: false });

// ── 광고(스폰서) 마커 ──
// 캔버스 위 DOM 마커를 매 프레임 3D→2D 투영으로 영토에 붙인다(회전 추적). 뒷면이면 숨김.
// 마커 탭은 국가 탭(raycaster)과 분리: 마커에서 이벤트 전파를 막아 드래그/국가탭이 안 일어난다.
var adLayer = document.getElementById('ad-layer');
var adMarkers = [];           // { nameEn, lon, lat, el }
var pendingSponsored = null;  // worldData 로드 전에 도착한 목록
var _adVec = new THREE.Vector3();
var AD_FACING_MIN = 0.78;     // 카드 노출 임계값(0~1). 클수록 화면 중앙에 더 가까워야 뜸

function clearAdMarkers() {
  adMarkers.forEach(function(m) { if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el); });
  adMarkers = [];
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}
function buildAdMarkers(list) {
  clearAdMarkers();
  if (!worldData || !list || !adLayer) return;
  list.forEach(function(item) {
    // item: { nameEn, label, price }
    var nameEn = item && item.nameEn;
    if (!nameEn) return;
    var f = worldData.features.find(function(ft) { return ft.properties.name === nameEn; });
    if (!f) return;
    var c = d3.geoCentroid(f); // [lon, lat]
    var priceHtml = item.price ? '<div class="mc-price">' + escapeHtml(item.price) + '</div>' : '';
    var thumbHtml = item.image ? '<img class="mc-thumb" src="' + escapeHtml(item.image) + '" />' : '';
    var el = document.createElement('div');
    el.className = 'ad-pin';
    el.innerHTML =
      '<div class="ad-line"></div>' +
      '<div class="ad-dot"></div>' +
      '<div class="ad-minicard">' +
        '<div class="mc-row">' +
          thumbHtml +
          '<div class="mc-text">' +
            '<div class="mc-head"><span class="mc-ad">AD</span><span class="mc-title">' + escapeHtml(item.label || '여행 패키지') + '</span></div>' +
            priceHtml +
          '</div>' +
        '</div>' +
      '</div>';
    var fire = function(ev) {
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'sponsoredTapped', countryEn: nameEn }));
      }
    };
    // 전파 차단: 미니 카드 위 제스처가 지구본 드래그/국가 탭으로 이어지지 않도록 (카드에서 버블링됨)
    el.addEventListener('touchstart', function(ev) { ev.stopPropagation(); }, { passive: true });
    el.addEventListener('mousedown', function(ev) { ev.stopPropagation(); });
    el.addEventListener('click', fire);
    el.addEventListener('touchend', fire);
    adLayer.appendChild(el);
    adMarkers.push({ nameEn: nameEn, lon: c[0], lat: c[1], el: el });
  });
}
function updateAdMarkers() {
  if (!adMarkers.length) return;
  for (var i = 0; i < adMarkers.length; i++) {
    var m = adMarkers[i];
    var latR = m.lat * Math.PI / 180, lonR = m.lon * Math.PI / 180;
    var rh = Math.cos(latR);
    var A = lonR + Math.PI;
    _adVec.set(-rh * Math.cos(A), Math.sin(latR), rh * Math.sin(A)); // 단위구 로컬좌표(detectCountry 역매핑)
    _adVec.multiplyScalar(1.02);
    globe.localToWorld(_adVec); // 현재 회전 반영(렌더 후 호출)
    // 정면 정도: 표면 법선(≈월드좌표 방향)과 시선(점→카메라)의 코사인.
    // 1=화면 정중앙을 마주봄, 0=가장자리(림). 일정 이상 정면일 때만 카드 노출(너무 일찍 뜨는 것 방지).
    var toCamX = camera.position.x - _adVec.x;
    var toCamY = camera.position.y - _adVec.y;
    var toCamZ = camera.position.z - _adVec.z;
    var dotRaw = _adVec.x * toCamX + _adVec.y * toCamY + _adVec.z * toCamZ;
    var lenW = Math.sqrt(_adVec.x * _adVec.x + _adVec.y * _adVec.y + _adVec.z * _adVec.z);
    var lenC = Math.sqrt(toCamX * toCamX + toCamY * toCamY + toCamZ * toCamZ);
    var facing = (lenW > 0 && lenC > 0) ? dotRaw / (lenW * lenC) : -1;
    var ndc = _adVec.clone().project(camera);
    if (facing > AD_FACING_MIN && ndc.z < 1) {
      m.el.style.display = 'block';
      m.el.style.left = ((ndc.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      m.el.style.top = ((-ndc.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    } else {
      m.el.style.display = 'none';
    }
  }
}

// ── 딥줌 LOD: 확대 시 국경·채움을 50m 데이터로 교체 ──
// 50m TopoJSON(~740KB)은 처음 필요할 때 RN에 요청해 받는다(need50m → world50m).
var world110Data = null, world50Data = null, world50Requested = false, lodBusy = false;
var worldLOD = '110m';
var LOD_HI_AT = 2.2; // zoomFactor 임계 — 이상이면 50m
// 50m(Natural Earth 축약명) → 우리 표준명. 기본 GEO_NAME_FIX + 50m 전용 축약 별칭.
var NAME_FIX_50M = {
  "USA":"United States of America","England":"United Kingdom","Republic of Serbia":"Serbia",
  "United Republic of Tanzania":"Tanzania","Macedonia":"North Macedonia","Swaziland":"Eswatini",
  "eSwatini":"Eswatini","Republic of the Congo":"Congo","West Bank":"Palestine",
  "Macao":"Macau","Czechia":"Czech Republic","Bosnia and Herz.":"Bosnia and Herzegovina",
  "Central African Rep.":"Central African Republic","Côte d'Ivoire":"Ivory Coast",
  "Dem. Rep. Congo":"Democratic Republic of the Congo","Dominican Rep.":"Dominican Republic",
  "Eq. Guinea":"Equatorial Guinea","Falkland Is.":"Falkland Islands",
  "Fr. S. Antarctic Lands":"French Southern and Antarctic Lands","Guinea-Bissau":"Guinea Bissau",
  "N. Cyprus":"Northern Cyprus","S. Sudan":"South Sudan","Solomon Is.":"Solomon Islands",
  "Timor-Leste":"East Timor","W. Sahara":"Western Sahara","Bahamas":"The Bahamas",
};
// TopoJSON 미니 디코더 — feature 추출만(topojson-client 해당분). quantized(transform) 지원.
function topoDecode(topo, objName) {
  var tf = topo.transform;
  var arcs = topo.arcs.map(function(arc) {
    if (!tf) return arc.map(function(p) { return [p[0], p[1]]; });
    var x = 0, y = 0;
    return arc.map(function(p) {
      x += p[0]; y += p[1];
      return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
    });
  });
  function ringFromArcs(arcIdxs) {
    var ring = [];
    arcIdxs.forEach(function(ai) {
      var pts = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse();
      if (ring.length) pts = pts.slice(1); // 이음점 중복 제거
      ring = ring.concat(pts);
    });
    return ring;
  }
  var feats = [];
  (topo.objects[objName].geometries || []).forEach(function(g) {
    var name = (g.properties && g.properties.name) || '';
    name = NAME_FIX_50M[name] || name;
    var geom = null;
    if (g.type === 'Polygon') {
      geom = { type: 'Polygon', coordinates: g.arcs.map(ringFromArcs) };
    } else if (g.type === 'MultiPolygon') {
      geom = { type: 'MultiPolygon', coordinates: g.arcs.map(function(poly) { return poly.map(ringFromArcs); }) };
    }
    if (geom) feats.push({ type: 'Feature', properties: { name: name }, geometry: geom });
  });
  return { type: 'FeatureCollection', features: feats };
}
function applyLOD(target) {
  if (lodBusy || !globeMesh) return;
  lodBusy = true;
  worldData = target === '50m' ? world50Data : world110Data;
  worldLOD = target;
  // 채움 텍스처만 재생성 — 국경선은 110m/50m 두 그룹을 상시 두고 줌에 따라 크로스페이드(updateBorderFade)
  loadAllImages().then(function() { return buildTexture(); }).then(function(tex) {
    var old = globeMesh.material.map;
    globeMesh.material.map = tex;
    globeMesh.material.needsUpdate = true;
    if (old && old.dispose) old.dispose();
    lodBusy = false;
  }).catch(function() { lodBusy = false; });
}

// ── 구글맵식 매끄러운 전환: 국경 110m↔50m 크로스페이드 + 주/도(admin-1) 지역구분선 페이드인 ──
var borderGroup50 = null;                  // 50m 국경 그룹(데이터 도착 후 lazy 생성)
var admin1Lines = null, admin1Group = null, admin1Requested = false; // 주/도 경계선
function smoothstep01(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// 줌 안정(제스처 종료+보간 수렴) 판정 — 텍스처 재생성·그룹 생성 같은 무거운 작업은
// 핀치 도중이 아니라 안정된 뒤에만 실행해 확대/축소 중 렉을 없앤다(구글맵과 동일한 타이밍)
function zoomSettled() {
  return lastPinchDist === null
    && Math.abs(targetZoomX - currentZoomX) < 0.03
    && Math.abs(targetZ - currentZ) < 0.03;
}
// 50m 국경 병합 빌더 — buildBorders(링당 Line 2개, 수천 객체)와 달리 LineSegments 2개(단일 지오메트리)로
// 생성·드로우콜 비용을 크게 줄인다(크로스페이드 인터페이스 userData.mats/baseOp는 동일)
function buildBordersMerged(world, hexColor) {
  var posCore = [], posGlow = [];
  function addRing(coords) {
    if (coords.length < 2) return;
    var prev = null, prevG = null;
    for (var i = 0; i < coords.length; i++) {
      var v = geoToVec3(coords[i][0], coords[i][1], 1.0015);
      var g = geoToVec3(coords[i][0], coords[i][1], 1.0015 * 1.001);
      if (prev) {
        posCore.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
        posGlow.push(prevG.x, prevG.y, prevG.z, g.x, g.y, g.z);
      }
      prev = v; prevG = g;
    }
  }
  world.features.forEach(function(f) {
    var geom = f.geometry;
    if (!geom) return;
    if (geom.type === 'Polygon') geom.coordinates.forEach(addRing);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(function(poly) { poly.forEach(addRing); });
  });
  var matCore = new THREE.LineBasicMaterial({ color: new THREE.Color(hexColor), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  var matGlow = new THREE.LineBasicMaterial({ color: new THREE.Color(hexColor), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  var geoC = new THREE.BufferGeometry(); geoC.setAttribute('position', new THREE.Float32BufferAttribute(posCore, 3));
  var geoG = new THREE.BufferGeometry(); geoG.setAttribute('position', new THREE.Float32BufferAttribute(posGlow, 3));
  var grp = new THREE.Group();
  grp.add(new THREE.LineSegments(geoC, matCore));
  grp.add(new THREE.LineSegments(geoG, matGlow));
  grp.userData.mats = [matCore, matGlow];
  grp.userData.baseOp = [0.95, 0.3];
  return grp;
}
function setGroupOp(g, k) {
  var mats = g.userData.mats, base = g.userData.baseOp;
  if (!mats) return;
  for (var i = 0; i < mats.length; i++) mats[i].opacity = base[i] * k;
  g.visible = k > 0.01;
}
function buildAdmin1Group(lines, radius) {
  // 전체 라인을 LineSegments 1개(단일 지오메트리·드로우콜)로 병합 — 수만 폴리라인도 가볍게
  var R = radius || 1.001; // 기본: 국경선(1.0015)보다 살짝 아래
  var pos = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i]; var prev = null;
    for (var j = 0; j < ln.length; j++) {
      var v = geoToVec3(ln[j][0], ln[j][1], R);
      if (prev) pos.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
      prev = v;
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  var mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#FFFFFF'), transparent: true, opacity: 0, depthWrite: false });
  var grp = new THREE.Group();
  grp.add(new THREE.LineSegments(geo, mat));
  grp.userData.mat = mat;
  grp.visible = false;
  return grp;
}
var borders10Lines = null, borders10Group = null, borders10Requested = false; // 10m 최정밀 구분선(해안+국경)
function updateBorderFade() {
  if (!globeMesh) return;
  var zf = zoomFactor();
  // 3단계 유동 전환: 110m → 50m(1.9~2.6) → 10m(4.5~5.8) — 확대할수록 매끄럽게 선명해진다
  var t = world50Data ? smoothstep01(1.9, 2.6, zf) : 0;
  var t10 = borders10Lines ? smoothstep01(4.5, 5.8, zf) : 0;
  if (t > 0 && !borderGroup50 && world50Data && zoomSettled()) {
    // 그룹 생성(무거움)은 줌 안정 후 1회 — 핀치 중 렉 방지
    borderGroup50 = buildBordersMerged(world50Data, cfg.borderColor);
    globe.add(borderGroup50);
  }
  // 10m 데이터는 4배 이상 확대에 접근하면 미리 요청(lazy)
  if (zf > 3.8 && !borders10Lines && !borders10Requested && window.ReactNativeWebView) {
    borders10Requested = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'needBorders10m' }));
  }
  if (t10 > 0 && !borders10Group && borders10Lines && zoomSettled()) {
    borders10Group = buildAdmin1Group(borders10Lines, 1.0018); // 50m 국경(1.0015) 위
    globe.add(borders10Group);
  }
  if (borderGroup) setGroupOp(borderGroup, borderGroup50 ? 1 - t : 1);
  if (borderGroup50) setGroupOp(borderGroup50, borders10Group ? t * (1 - t10) : t);
  if (borders10Group) {
    borders10Group.userData.mat.opacity = 0.95 * t10;
    borders10Group.visible = t10 > 0.01;
  }
  // 주/도 지역구분선 — 3.0~4.2 구간에서 서서히 등장 (데이터는 처음 필요 시 RN에 lazy 요청)
  var a = smoothstep01(3.0, 4.2, zf);
  if (a > 0 && !admin1Lines && !admin1Requested && window.ReactNativeWebView) {
    admin1Requested = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'needAdmin1' }));
  }
  if (a > 0 && admin1Lines && !admin1Group && zoomSettled()) {
    admin1Group = buildAdmin1Group(admin1Lines);
    globe.add(admin1Group);
  }
  if (admin1Group) {
    admin1Group.userData.mat.opacity = 0.42 * a;
    admin1Group.visible = a > 0.01;
  }
}
function maybeSwapLOD() {
  if (!globeMesh) return;
  if (!zoomSettled()) return; // 텍스처 재생성(무거움)은 핀치 종료 후에만 — 확대/축소 중 렉 방지
  var want = zoomFactor() >= LOD_HI_AT ? '50m' : '110m';
  if (want === worldLOD) return;
  if (want === '50m') {
    if (!world50Data) {
      if (!world50Requested && window.ReactNativeWebView) {
        world50Requested = true;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'need50m' }));
      }
      return; // 데이터 도착(world50m 메시지) 후 다음 프레임에 교체
    }
    applyLOD('50m');
  } else {
    applyLOD('110m');
  }
}

// ── 지역명 라벨(나라·도시) — 구글맵식 줌 단계 등장, 캔버스 1장 렌더 ──
var labelCanvas = document.getElementById('label-layer');
var labelCtx = labelCanvas ? labelCanvas.getContext('2d') : null;
function sizeLabelCanvas() {
  if (!labelCanvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  labelCanvas.width = Math.round(window.innerWidth * dpr);
  labelCanvas.height = Math.round(window.innerHeight * dpr);
  labelCanvas.style.width = window.innerWidth + 'px';
  labelCanvas.style.height = window.innerHeight + 'px';
  if (labelCtx) labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeLabelCanvas();
var countryLabels = []; // { name, ko, lon, lat, area } 면적 내림차순
function buildLabelIndex() {
  countryLabels = [];
  if (!world110Data) return;
  world110Data.features.forEach(function(f) {
    var name = f.properties.name || '';
    if (!name) return;
    var c = d3.geoCentroid(f);
    var b = d3.geoBounds(f); // [[minLon,minLat],[maxLon,maxLat]]
    var dLon = Math.abs(b[1][0] - b[0][0]); if (dLon > 180) dLon = 360 - dLon; // 날짜변경선 걸친 나라(러시아 등)
    var dLat = Math.abs(b[1][1] - b[0][1]);
    var area = dLon * dLat * Math.max(0.15, Math.cos(c[1] * Math.PI / 180));
    countryLabels.push({ name: name, ko: KO_NAMES[name] || name, lon: c[0], lat: c[1], area: area });
  });
  countryLabels.sort(function(a, b) { return b.area - a.area; });
}
var _lblVec = new THREE.Vector3();
// 표면점 투영 — 성공 시 {x,y,facing} (facing: 1=정중앙, 0=림)
function projectLL(lon, lat) {
  var latR = lat * Math.PI / 180, lonR = lon * Math.PI / 180;
  var rh = Math.cos(latR), A = lonR + Math.PI;
  _lblVec.set(-rh * Math.cos(A), Math.sin(latR), rh * Math.sin(A));
  _lblVec.multiplyScalar(1.01);
  globe.localToWorld(_lblVec);
  var tx = camera.position.x - _lblVec.x, ty = camera.position.y - _lblVec.y, tz = camera.position.z - _lblVec.z;
  var dot = _lblVec.x * tx + _lblVec.y * ty + _lblVec.z * tz;
  var lw = Math.sqrt(_lblVec.x * _lblVec.x + _lblVec.y * _lblVec.y + _lblVec.z * _lblVec.z);
  var lc = Math.sqrt(tx * tx + ty * ty + tz * tz);
  var facing = (lw > 0 && lc > 0) ? dot / (lw * lc) : -1;
  var ndc = _lblVec.clone().project(camera);
  if (ndc.z >= 1) return null;
  return { x: (ndc.x * 0.5 + 0.5) * window.innerWidth, y: (-ndc.y * 0.5 + 0.5) * window.innerHeight, facing: facing };
}
var _lblLast = { rx: NaN, ry: NaN, zf: NaN };
function updateLabels() {
  if (!labelCtx) return;
  var zf = zoomFactor();
  // 회전·줌이 안 변했으면 다시 그리지 않는다(발열 방지)
  if (Math.abs(_lblLast.rx - rotX) < 1e-4 && Math.abs(_lblLast.ry - rotY) < 1e-4 && Math.abs(_lblLast.zf - zf) < 1e-3) return;
  _lblLast.rx = rotX; _lblLast.ry = rotY; _lblLast.zf = zf;
  labelCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (zf < 1.25 || !countryLabels.length) return;
  var grid = {}; var CELL = 76;
  function occupy(x, y) {
    var k = Math.floor(x / CELL) + '_' + Math.floor(y / CELL);
    if (grid[k]) return false;
    grid[k] = 1; return true;
  }
  // 나라 라벨 — 큰 나라부터, 줌 깊어질수록 개수 확대
  var n = Math.min(countryLabels.length, Math.max(0, Math.floor((zf - 1.15) * 22)));
  var fs = Math.min(15, 10 + zf * 0.45);
  labelCtx.textAlign = 'center'; labelCtx.textBaseline = 'middle';
  labelCtx.lineJoin = 'round';
  for (var i = 0; i < n; i++) {
    var L = countryLabels[i];
    var p = projectLL(L.lon, L.lat);
    if (!p || p.facing < 0.3) continue;
    if (!occupy(p.x, p.y)) continue;
    var a = Math.min(1, (p.facing - 0.3) / 0.25);
    labelCtx.font = '600 ' + fs + 'px sans-serif';
    labelCtx.strokeStyle = 'rgba(45,16,84,' + (0.8 * a) + ')';
    labelCtx.lineWidth = 3;
    labelCtx.strokeText(L.ko, p.x, p.y);
    labelCtx.fillStyle = 'rgba(255,255,255,' + (0.92 * a) + ')';
    labelCtx.fillText(L.ko, p.x, p.y);
  }
  // 도시 라벨 — 최대 줌 부근: tier1(수도급) → tier2(대도시) 순 등장
  if (zf >= 3.2 && typeof CITY_LABELS !== 'undefined') {
    var cfs = Math.min(13, 9 + zf * 0.35);
    for (var j = 0; j < CITY_LABELS.length; j++) {
      var C = CITY_LABELS[j];
      if (C.t === 2 && zf < 5) continue;
      var q = projectLL(C.lon, C.lat);
      if (!q || q.facing < 0.42) continue;
      if (!occupy(q.x, q.y)) continue;
      var ca = Math.min(1, (q.facing - 0.42) / 0.22);
      labelCtx.fillStyle = 'rgba(255,0,183,' + (0.95 * ca) + ')'; // 핀 #FF00B7 (classic은 스킨 미적용 — aurora 기본색)
      // 핀은 정확히 투영 지점에 — 작은 섬(화면 몇 px)에서도 섬 위에 찍힌다. 텍스트는 그 아래
      labelCtx.beginPath(); labelCtx.arc(q.x, q.y, 2.2, 0, Math.PI * 2); labelCtx.fill();
      labelCtx.font = '500 ' + cfs + 'px sans-serif';
      labelCtx.strokeStyle = 'rgba(45,16,84,' + (0.75 * ca) + ')';
      labelCtx.lineWidth = 2.5;
      labelCtx.strokeText(C.n, q.x, q.y + cfs * 1.15);
      labelCtx.fillStyle = 'rgba(240,240,248,' + (0.95 * ca) + ')';
      labelCtx.fillText(C.n, q.x, q.y + cfs * 1.15);
    }
  }
}

// Animation loop
var _shootLastT = performance.now();
function animate() {
  requestAnimationFrame(animate);
  if (window.__globePaused) { _shootLastT = performance.now(); return; } // 화면 밖일 때 스킵 → 발열 감소
  var _now = performance.now();
  var _dt = Math.min(50, _now - _shootLastT); _shootLastT = _now;
  SHOOT.update(_now, _dt); // 별똥별 갱신

  if (!isDragging && cfg.autoRotate) {
    velocity.x *= 0.95;
    velocity.y *= 0.95;
    rotY += 0.001 / Math.max(1, zoomFactor() * 0.55); // 확대 중엔 자동회전도 느리게
  } else if (!isDragging) {
    velocity.x *= 0.95;
    velocity.y *= 0.95;
    rotY += velocity.y;
    rotX += velocity.x;
  }

  currentZ += (targetZ - currentZ) * 0.1;
  camera.position.z = currentZ;
  // 2단계 딥줌 배율 반영 (dolly와 독립)
  currentZoomX += (targetZoomX - currentZoomX) * 0.1;
  var _dz = BASE_ZOOM * currentZoomX;
  if (Math.abs(camera.zoom - _dz) > 1e-4) { camera.zoom = _dz; camera.updateProjectionMatrix(); }

  globe.rotation.y = rotY;
  globe.rotation.x = rotX;

  renderer.render(scene, camera);
  updateAdMarkers();   // 렌더 후(월드행렬 최신) 마커 위치 갱신
  updateLabels();      // 지역명 라벨(나라·도시) — 줌 단계별 등장
  maybeSwapLOD();      // 확대 임계 넘으면 채움 텍스처를 50m로 교체
  updateBorderFade();  // 국경 110m↔50m 크로스페이드 + 주/도 지역구분선 페이드
}

window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  BASE_ZOOM = 1.436 * (window.innerWidth / window.innerHeight); // neon과 동일 크기(디스크=폭의 85%)
  camera.zoom = BASE_ZOOM * currentZoomX;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  sizeLabelCanvas();
});

// 지구본 형태(테마) 적용 — cfg 색을 갈아끼우고 텍스처/대기광/국경선만 재생성
// (WebView 통째 리로드 없이 부드럽게 전환. 회전 상태·카메라 유지)
function applyTheme(t) {
  if (!t) return;
  if (t.oceanBase) cfg.oceanBase = t.oceanBase;
  if (t.deepRGB) cfg.deepRGB = t.deepRGB;
  if (t.zoneRGB) cfg.zoneRGB = t.zoneRGB;
  if (t.landColor) cfg.landColor = t.landColor;
  if (t.neonColor) cfg.neonColor = t.neonColor;
  if (t.borderColor) cfg.borderColor = t.borderColor;
  if (!worldData || !globeMesh) return; // init 전이면 cfg만 갱신 → init이 새 cfg로 생성
  loadAllImages().then(function() {
    return buildTexture();
  }).then(function(tex) {
    var old = globeMesh.material.map; // 4096x2048 CanvasTexture — dispose 없으면 GPU 메모리 누적(네온 쪽과 동일 처리)
    globeMesh.material.map = tex;
    globeMesh.material.needsUpdate = true;
    if (old && old.dispose) old.dispose();
  });
  if (atmosphere) {
    globe.remove(atmosphere);
    if (atmosphere.geometry) atmosphere.geometry.dispose();
    if (atmosphere.material) atmosphere.material.dispose();
  }
  atmosphere = buildAtmosphere(cfg.neonColor);
  globe.add(atmosphere);
  if (borderGroup) {
    globe.remove(borderGroup);
    borderGroup.traverse(function(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  // 110m 기준으로 재구축(딥줌 중 worldData가 50m일 수 있음) — 50m 그룹도 있으면 새 색으로 재생성
  borderGroup = buildBorders(world110Data || worldData, cfg.borderColor);
  globe.add(borderGroup);
  if (borderGroup50) {
    globe.remove(borderGroup50);
    borderGroup50.traverse(function(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    borderGroup50 = world50Data ? buildBordersMerged(world50Data, cfg.borderColor) : null;
    if (borderGroup50) globe.add(borderGroup50);
  }
}

// 방문 국가 업데이트 수신
function handleVisitedMessage(msg) {
  if (msg.type === 'setTheme') {
    applyTheme(msg.theme);
  } else if (msg.type === 'setVisitedCountries' && msg.countries) {
    visitedMap = {};
    msg.countries.forEach(function(c) {
      visitedMap[c.nameEn] = { color: c.color || null, mode: c.mode || null, photo: c.photo || null };
    });
    if (msg.displayMode) globeDisplayMode = msg.displayMode;
    if (msg.defaultColor) globeDefaultColor = msg.defaultColor;
    if (worldData && globeMesh) {
      loadAllImages().then(function() {
        return buildTexture();
      }).then(function(tex) {
        var old = globeMesh.material.map;
        globeMesh.material.map = tex;
        globeMesh.material.needsUpdate = true;
        if (old && old.dispose) old.dispose();
      });
    }
  } else if (msg.type === 'setSponsored') {
    // 광고 항목 [{nameEn,label,price}]. worldData 로드 전이면 보류 후 init에서 생성.
    pendingSponsored = msg.items || [];
    if (worldData) buildAdMarkers(pendingSponsored);
  } else if (msg.type === 'world50m' && msg.topo) {
    // 딥줌 LOD 데이터 도착 — 디코드 후 다음 maybeSwapLOD에서 교체
    try {
      world50Data = topoDecode(JSON.parse(msg.topo), 'countries');
    } catch (err) {
      world50Requested = false; // 실패 시 재요청 가능
    }
  } else if (msg.type === 'admin1Lines' && msg.lines) {
    // 주/도 지역구분선 데이터 도착 — 다음 updateBorderFade에서 그룹 생성
    try {
      admin1Lines = JSON.parse(msg.lines);
    } catch (err) {
      admin1Requested = false;
    }
  } else if (msg.type === 'borders10m' && msg.lines) {
    // 10m 최정밀 구분선 데이터 도착 — 다음 updateBorderFade에서 그룹 생성
    try {
      borders10Lines = JSON.parse(msg.lines);
    } catch (err) {
      borders10Requested = false;
    }
  }
}
window.addEventListener('message', function(e) {
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    handleVisitedMessage(msg);
  } catch(e) {}
});
document.addEventListener('message', function(e) {
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    handleVisitedMessage(msg);
  } catch(e) {}
});

init();
<\/script>
</body>
</html>`;

// ── Neon Globe (aurora 폼 전용) ──
// 첨부 "Neon Globe (standalone)" 디자인을 이식: 정사영(Orthographic) 납작 원반 +
// 커스텀 셰이더 바디(보라 그라데이션) + 라벤더 대륙 + 흰 해안선 + 방향성 네온 프레넬 림,
// 캔버스 뒤 CSS 별·무드글로우·블룸 후광. eOrth의 THREE/D3/WORLD_GEO·CanvasTexture·탭·광고마커는 그대로 재사용.
// classic(사진) 폼은 위의 globeHTML을 그대로 쓰므로 영향 없음.
const neonGlobeHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  body { background:#0A0B0F; width:100vw; height:100vh; overflow:hidden; font-family:'Noto Sans KR',sans-serif; cursor:grab; }
  body:active { cursor:grabbing; }
  #bg { position:fixed; inset:0; overflow:hidden; background:#0A0B0F; z-index:1; }
  #canvas-container { position:fixed; inset:0; z-index:2; }
  canvas { display:block; }
  @keyframes ng-twinkle { 0%,100%{opacity:var(--o);} 50%{opacity:calc(var(--o)*0.35);} }
  @keyframes ng-glowdrift { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(2%,-2%) scale(1.06);} }
  #stars { position:absolute; inset:0; pointer-events:none; }
  #stars i { position:absolute; border-radius:50%; background:#ffffff; display:block; }
  /* 별똥별(shooting star) — 지구본 뒤 #bg 레이어. 좌상단→우상단으로 살짝 떨어지며 지나감 */
  #shooting { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  #shooting .sh { position:absolute; height:2px; border-radius:2px; opacity:0;
    background:linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(202,130,255,0.55) 62%, #ffffff 100%);
    filter:drop-shadow(0 0 4px rgba(255,255,255,0.55)); will-change:transform,opacity; }
  @keyframes ng-shoot {
    0%   { opacity:0; transform:translate(0,0) rotate(var(--a)); }
    9%   { opacity:1; }
    82%  { opacity:1; }
    100% { opacity:0; transform:translate(var(--dx), var(--dy)) rotate(var(--a)); }
  }
  /* 광고(스폰서) 마커 — classic과 동일 */
  #ad-layer { position:fixed; inset:0; pointer-events:none; z-index:5; }
  .ad-pin { position:absolute; width:0; height:0; display:none; }
  .ad-pin .ad-dot { position:absolute; left:0; top:0; width:8px; height:8px; transform:translate(-50%,-50%); border-radius:50%; background:#FFC45A; box-shadow:0 0 8px 2px rgba(255,196,90,0.7); animation:adpulse 1.7s ease-in-out infinite; }
  .ad-pin .ad-line { position:absolute; left:0; bottom:0; width:1.5px; height:36px; transform:translateX(-50%); background:linear-gradient(to top, rgba(255,196,90,0.95), rgba(255,196,90,0.15)); }
  .ad-pin .ad-minicard { position:absolute; left:0; bottom:36px; transform:translateX(-50%); pointer-events:auto; cursor:pointer; white-space:nowrap; background:rgba(18,16,26,0.94); border:1px solid rgba(255,196,90,0.55); border-radius:7px; padding:4px 7px; box-shadow:0 3px 10px rgba(0,0,0,0.5); }
  .ad-pin .ad-minicard .mc-row { display:flex; align-items:center; gap:6px; }
  .ad-pin .ad-minicard .mc-thumb { width:26px; height:26px; border-radius:5px; object-fit:cover; background:#1A1A26; flex:none; display:block; }
  .ad-pin .ad-minicard .mc-text { display:flex; flex-direction:column; }
  .ad-pin .ad-minicard .mc-head { display:flex; align-items:center; gap:4px; }
  .ad-pin .ad-minicard .mc-ad { font-size:7px; font-weight:800; letter-spacing:0.3px; color:#0A0A0F; background:#FFC45A; border-radius:2px; padding:0px 3px; }
  .ad-pin .ad-minicard .mc-title { font-size:9.5px; font-weight:700; color:#fff; max-width:110px; overflow:hidden; text-overflow:ellipsis; }
  .ad-pin .ad-minicard .mc-price { font-size:9.5px; font-weight:800; color:#FFC45A; margin-top:1px; }
  @keyframes adpulse { 0%,100%{transform:translate(-50%,-50%) scale(0.9); opacity:0.85;} 50%{transform:translate(-50%,-50%) scale(1.2); opacity:1;} }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
<div id="bg">
  <div class="neb" data-k="b" data-c="#0000FF" data-a="0.13" data-s="65" style="position:absolute; left:9%; top:3%; width:54%; height:80%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(0,0,255,0.13), rgba(0,0,255,0) 65%); filter:blur(95px); animation:ng-glowdrift 18s ease-in-out infinite;"></div>
  <div class="neb" data-k="p" data-c="#CA82FF" data-a="0.20" data-s="70" style="position:absolute; left:12%; top:27%; width:32%; height:44%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(202,130,255,0.20), rgba(202,130,255,0) 70%); filter:blur(52px); animation:ng-glowdrift 22s ease-in-out infinite;"></div>
  <div class="neb" data-k="p" data-c="#CA82FF" data-a="0.16" data-s="70" style="position:absolute; right:10%; bottom:9%; width:34%; height:46%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(202,130,255,0.16), rgba(202,130,255,0) 70%); filter:blur(52px); animation:ng-glowdrift 26s ease-in-out infinite;"></div>
  <!-- 우주가스(nebula) 데코 — 흐릿한 가스 블롭(가장자리에 산포). data-k p=본체색(base)/b=보조색(gradTo) 계열,
       data-c=기본(aurora) 색 — setTheme의 스킨 팔레트가 오면 applyNebula가 재채색, 없으면(aurora) 이 값 유지 -->
  <div class="neb" data-k="p" data-c="#CA82FF" data-a="0.14" data-s="70" style="position:absolute; left:-8%; top:15%; width:44%; height:32%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(202,130,255,0.14), rgba(202,130,255,0) 70%); filter:blur(55px); animation:ng-glowdrift 24s ease-in-out infinite;"></div>
  <div class="neb" data-k="p" data-c="#CA82FF" data-a="0.13" data-s="70" style="position:absolute; left:-6%; bottom:1%; width:38%; height:28%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(202,130,255,0.13), rgba(202,130,255,0) 70%); filter:blur(52px); animation:ng-glowdrift 30s ease-in-out infinite;"></div>
  <div class="neb" data-k="p" data-c="#CA82FF" data-a="0.15" data-s="70" style="position:absolute; right:-8%; top:54%; width:38%; height:32%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(202,130,255,0.15), rgba(202,130,255,0) 70%); filter:blur(54px); animation:ng-glowdrift 28s ease-in-out infinite;"></div>
  <div class="neb" data-k="b" data-c="#3040FF" data-a="0.07" data-s="68" style="position:absolute; left:14%; top:22%; width:80%; height:54%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(48,64,255,0.07), rgba(48,64,255,0) 68%); filter:blur(100px); animation:ng-glowdrift 20s ease-in-out infinite;"></div>
  <div style="position:absolute; left:15%; top:29%; width:18%; height:11%; border-radius:50%; background:radial-gradient(circle at 50% 50%, rgba(255,255,255,0.07), rgba(255,255,255,0) 70%); filter:blur(34px); animation:ng-glowdrift 26s ease-in-out infinite;"></div>
  <div id="stars"></div>
  <div id="shooting"></div>
</div>
<div id="canvas-container"></div>
<canvas id="label-layer" style="position:fixed;inset:0;pointer-events:none;z-index:4;"></canvas>
<div id="ad-layer"></div>

<script>${THREE_INLINE}<\/script>
<script>${D3_INLINE}<\/script>
<script>var WORLD_GEO=${WORLD_GEO_INLINE};<\/script>
<script>var CITY_LABELS=${CITY_LABELS_INLINE};<\/script>

<script>
var NEON_LAND = 'rgba(255,255,255,0.20)';  // 비방문(기본) 대륙 — 흰색 20%(유리: 본체색이 비침)
var globeDefaultColor = '#BF85FC';     // 방문국 기본 활성화 색 (RN에서 덮어씀)
var visitedMap = {};                   // nameEn -> { color }

// GeoJSON 영문명 → 한글명 (탭 시 RN이 한글명으로 기록을 찾으므로 필요)
var KO_NAMES = {
  "Belize":"벨리즈","Benin":"베냉","Burkina Faso":"부르키나파소","Burundi":"부룬디","Central African Republic":"중앙아프리카공화국","Djibouti":"지부티","East Timor":"동티모르","Equatorial Guinea":"적도기니","Eritrea":"에리트레아","Fiji":"피지","Gabon":"가봉","Gambia":"감비아","Lesotho":"레소토","Liberia":"라이베리아","Malawi":"말라위","Mauritania":"모리타니","Rwanda":"르완다","Sierra Leone":"시에라리온","Solomon Islands":"솔로몬제도","Suriname":"수리남","The Bahamas":"바하마","Trinidad and Tobago":"트리니다드 토바고","Vanuatu":"바누아투","Ivory Coast":"코트디부아르","Guinea Bissau":"기니비사우",
  "Afghanistan":"아프가니스탄","Albania":"알바니아","Algeria":"알제리",
  "Angola":"앙골라","Argentina":"아르헨티나","Armenia":"아르메니아",
  "Australia":"호주","Austria":"오스트리아","Azerbaijan":"아제르바이잔",
  "Bangladesh":"방글라데시","Belarus":"벨라루스","Belgium":"벨기에",
  "Bhutan":"부탄","Bolivia":"볼리비아","Bosnia and Herzegovina":"보스니아 헤르체고비나",
  "Botswana":"보츠와나","Brazil":"브라질","Brunei":"브루나이",
  "Bulgaria":"불가리아","Cambodia":"캄보디아","Cameroon":"카메룬","Canada":"캐나다",
  "Chad":"차드","Chile":"칠레","China":"중국","Colombia":"콜롬비아",
  "Congo":"콩고 공화국","Costa Rica":"코스타리카","Croatia":"크로아티아","Cuba":"쿠바",
  "Czech Republic":"체코","Czechia":"체코",
  "Democratic Republic of the Congo":"콩고민주공화국",
  "Denmark":"덴마크","Dominican Republic":"도미니카공화국",
  "Ecuador":"에콰도르","Egypt":"이집트","El Salvador":"엘살바도르",
  "Estonia":"에스토니아","Ethiopia":"에티오피아","Finland":"핀란드","France":"프랑스",
  "Georgia":"조지아","Germany":"독일","Ghana":"가나","Greece":"그리스",
  "Guatemala":"과테말라","Guinea":"기니","Guyana":"가이아나","Haiti":"아이티",
  "Honduras":"온두라스","Hungary":"헝가리","Iceland":"아이슬란드","India":"인도",
  "Indonesia":"인도네시아","Iran":"이란","Iraq":"이라크","Ireland":"아일랜드",
  "Israel":"이스라엘","Italy":"이탈리아","Jamaica":"자메이카","Japan":"일본",
  "Jordan":"요르단","Kazakhstan":"카자흐스탄","Kenya":"케냐",
  "Kuwait":"쿠웨이트","Kyrgyzstan":"키르기스스탄","Laos":"라오스",
  "Latvia":"라트비아","Lebanon":"레바논","Libya":"리비아",
  "Lithuania":"리투아니아","Luxembourg":"룩셈부르크",
  "Madagascar":"마다가스카르","Malaysia":"말레이시아","Mali":"말리",
  "Mexico":"멕시코","Moldova":"몰도바","Mongolia":"몽골","Montenegro":"몬테네그로",
  "Morocco":"모로코","Mozambique":"모잠비크","Myanmar":"미얀마",
  "Namibia":"나미비아","Nepal":"네팔","Netherlands":"네덜란드",
  "New Zealand":"뉴질랜드","Nicaragua":"니카라과","Niger":"니제르",
  "Nigeria":"나이지리아","North Korea":"북한","Norway":"노르웨이",
  "Oman":"오만","Pakistan":"파키스탄","Panama":"파나마",
  "Papua New Guinea":"파푸아뉴기니","Paraguay":"파라과이","Peru":"페루",
  "Philippines":"필리핀","Poland":"폴란드","Portugal":"포르투갈",
  "Qatar":"카타르","Romania":"루마니아","Russia":"러시아",
  "Saudi Arabia":"사우디아라비아","Senegal":"세네갈","Serbia":"세르비아",
  "Slovakia":"슬로바키아","Slovenia":"슬로베니아","Somalia":"소말리아",
  "South Africa":"남아프리카공화국","South Korea":"대한민국","South Sudan":"남수단",
  "Spain":"스페인","Sri Lanka":"스리랑카","Sudan":"수단",
  "Sweden":"스웨덴","Switzerland":"스위스","Syria":"시리아",
  "Hong Kong":"홍콩","Macau":"마카오",
  "Taiwan":"대만","Tajikistan":"타지키스탄","Tanzania":"탄자니아",
  "Thailand":"태국","Togo":"토고","Tunisia":"튀니지",
  "Turkey":"튀르키예","Turkmenistan":"투르크메니스탄",
  "Uganda":"우간다","Ukraine":"우크라이나",
  "United Arab Emirates":"아랍에미리트",
  "United Kingdom":"영국","United States of America":"미국",
  "Uruguay":"우루과이","Uzbekistan":"우즈베키스탄",
  "Venezuela":"베네수엘라","Vietnam":"베트남",
  "Yemen":"예멘","Zambia":"잠비아","Zimbabwe":"짐바브웨",
  "Greenland":"그린란드","Western Sahara":"서사하라",
  "Palestine":"팔레스타인","Cyprus":"키프로스","Kosovo":"코소보",
  "North Macedonia":"북마케도니아","Eswatini":"에스와티니",
};

// --- Three.js (정사영 카메라) ---
var container = document.getElementById('canvas-container');
var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, premultipliedAlpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);     // 투명 → 뒤 CSS 별/글로우가 비침
container.appendChild(renderer.domElement);

var scene = new THREE.Scene();
var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); // 납작한 원반 룩
camera.position.set(0, 0, 3);
camera.lookAt(0, 0, 0);

var globe = new THREE.Group();           // 회전은 그룹에 적용(탭 역매핑이 globe.matrixWorld 기준)
scene.add(globe);

var worldData = null, globeMesh = null, material = null;

// 별밭(결정적): standalone과 동일 파라미터
(function(){
  var el = document.getElementById('stars'); if (!el) return;
  var seed = 1337; function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }
  var html = '';
  for (var i=0;i<320;i++){
    var o=(0.45+rnd()*0.4).toFixed(2), x=(rnd()*100).toFixed(2), y=(rnd()*100).toFixed(2);
    var d=(0.8+rnd()*1.8).toFixed(2), t=(2.5+rnd()*4).toFixed(2);
    html += '<i style="left:'+x+'%;top:'+y+'%;width:'+d+'px;height:'+d+'px;--o:'+o+';opacity:'+o+';animation:ng-twinkle '+t+'s ease-in-out infinite;"></i>';
  }
  el.innerHTML = html;
})();

// 별똥별: 일정 간격으로 2~3개가 좌상단→우상단으로 살짝 떨어지며 지나감 (지구본 뒤 #shooting).
// __globePaused(화면 밖/백그라운드)면 스폰 생략 → 발열/전력 절약.
(function(){
  var host = document.getElementById('shooting'); if (!host) return;
  function fire(){
    var len = 90 + Math.random()*95;                 // 꼬리 길이
    var startY = window.innerHeight * (0.13 + Math.random()*0.24); // 상단 랜덤(살짝 아래로)
    var startX = -len - 20 - Math.random()*window.innerWidth*0.15; // 화면 왼쪽 바깥
    var angDeg = 8 + Math.random()*13;               // 진행 각도(우하향, 살짝 떨어짐)
    var dist = window.innerWidth + len + 60;         // 오른쪽 끝까지
    var dx = dist;
    var dy = dist * Math.tan(angDeg * Math.PI/180);
    var dur = 720 + Math.random()*520;
    var el = document.createElement('div');
    el.className = 'sh';
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    el.style.width = len + 'px';
    el.style.setProperty('--a', angDeg + 'deg');
    el.style.setProperty('--dx', dx + 'px');
    el.style.setProperty('--dy', dy + 'px');
    el.style.animation = 'ng-shoot ' + dur + 'ms linear forwards';
    host.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, dur + 120);
  }
  function burst(){
    if (window.__globePaused) { setTimeout(burst, 1500); return; } // 안 보이면 대기
    var n = 2 + Math.floor(Math.random()*2);         // 2~3개
    for (var k=0;k<n;k++) setTimeout(fire, k * (150 + Math.random()*300)); // 살짝 시차
    setTimeout(burst, 4200 + Math.random()*5200);    // 다음 간격 4~9초
  }
  setTimeout(burst, 1500 + Math.random()*2200);
})();

// 적도원통(equirectangular) 텍스처: 바다는 투명(셰이더가 절차적으로 칠함),
// 대륙은 라벤더/방문국 활성화 색, 흰 해안선/국경선. (탭 판정과 동일한 WORLD_GEO 사용)
function buildNeonTexture(){
  // 딥줌(50m LOD) 상태에선 해상도도 올려 확대 시 채움·국경이 선명하게
  var W = (typeof worldLOD !== 'undefined' && worldLOD === '50m') ? 6144 : 4096, H = W / 2;
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  var ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  var proj=d3.geoEquirectangular().scale(H/Math.PI).translate([W/2,H/2]);
  var path=d3.geoPath().projection(proj).context(ctx);

  // 대륙 채우기 (비방문=라벤더, 방문=활성화 색)
  worldData.features.forEach(function(f){
    var v=visitedMap[f.properties.name||''];
    ctx.fillStyle = v ? (v.color || globeDefaultColor) : NEON_LAND;
    ctx.beginPath(); path(f); ctx.fill();
  });
  // 모노톤 노이즈(0.5px, #00000040 25%) — 지정 활성화 색(#E1CDFB/#EB19D2)으로 칠한 국가에만 입힘.
  // MainScreen의 NOISE_ACTIVE_COLORS와 값 일치 필요 (팔레트 채도 -15% 반영).
  (function(){
    var NOISE_COLORS = ['#E1CDFB','#EB19D2'];
    var isNoise = function(col){ col=(col||'').toUpperCase(); return NOISE_COLORS.indexOf(col)!==-1; };
    var hasAny = worldData.features.some(function(f){ var v=visitedMap[f.properties.name||'']; return v && isNoise(v.color||globeDefaultColor); });
    if(!hasAny) return;
    var nc=document.createElement('canvas'); nc.width=96; nc.height=96;
    var nx=nc.getContext('2d'); var img=nx.createImageData(96,96);
    for(var i=0;i<img.data.length;i+=4){
      if(Math.random()<0.25){ img.data[i]=0; img.data[i+1]=0; img.data[i+2]=0; img.data[i+3]=64; } else { img.data[i+3]=0; }
    }
    nx.putImageData(img,0,0);
    var pat=ctx.createPattern(nc,'repeat');
    worldData.features.forEach(function(f){
      var v=visitedMap[f.properties.name||'']; if(!v || !isNoise(v.color||globeDefaultColor)) return;
      ctx.save(); ctx.beginPath(); path(f); ctx.clip();
      ctx.fillStyle=pat; ctx.beginPath(); path(f); ctx.fill(); ctx.restore();
    });
  })();
  // 딥줌(50m) 텍스처엔 발광·스트로크를 굽지 않는다 — 확대 시 텍셀이 늘어나 뿌연 후광처럼 보이던 원인.
  // 그 시점엔 벡터 구분선(updateVectorLines)이 완전히 대신하므로 시각 손실 없음.
  var hiTex = (typeof worldLOD !== 'undefined' && worldLOD === '50m');
  if(!hiTex){
    // 방문국 내부 발광(가산)
    ctx.globalCompositeOperation='lighter';
    worldData.features.forEach(function(f){
      var v=visitedMap[f.properties.name||'']; if(!v) return;
      var ctr=d3.geoCentroid(f), pc=proj(ctr); if(!pc) return;
      var g=ctx.createRadialGradient(pc[0],pc[1],0,pc[0],pc[1],150);
      g.addColorStop(0,'rgba(255,255,255,0.10)'); g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); path(f); ctx.fill();
    });
    ctx.globalCompositeOperation='source-over';
    // 흰 해안선/국경선 (전체)
    ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round';
    worldData.features.forEach(function(f){ ctx.beginPath(); path(f); ctx.stroke(); });
    // 방문국은 더 또렷한 테두리
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=3;
    worldData.features.forEach(function(f){ if(visitedMap[f.properties.name||'']){ ctx.beginPath(); path(f); ctx.stroke(); } });
  }

  var tex=new THREE.CanvasTexture(c);
  tex.anisotropy=renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.minFilter=THREE.LinearMipmapLinearFilter; tex.magFilter=THREE.LinearFilter; tex.generateMipmaps=true;
  tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping;
  return tex;
}

// 셰이더: 절차적 보라 바디 + 텍스처 대륙(vUv) + 방향성 네온 프레넬 림
var NEON_VS =
  'varying vec3 vN; varying vec2 vUv;' +
  'void main(){ vN = normalize(normalMatrix * normal); vUv = uv;' +
  ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
var NEON_FS =
  'precision highp float;' +
  'varying vec3 vN; varying vec2 vUv;' +
  'uniform sampler2D uLand; uniform float uLandOpacity; uniform float uGlow;' +
  // 본체 색 유니폼 — 스킨(setTheme의 neon)으로 교체 가능. 기본값 = 보라 발광 행성
  'uniform vec3 uBase; uniform vec3 uG1A; uniform vec3 uG1B; uniform float uG1W; uniform float uG2W;' +
  'void main(){' +
  ' vec3 N = normalize(vN);' +                                  // 뷰공간 법선 → 화면고정 조명/림
  ' vec3 cyan  = vec3(0.0,0.847,0.953);' +
  ' vec3 L = normalize(vec3(-0.55,-0.5,0.78));' +               // 좌하단 광원
  ' float diff = clamp(dot(N,L),0.0,1.0);' +
  // 배경(본체) 사양: 베이스 + 수직(상→하) 선형그라데이션 3겹 (기본: #FF14E4 / #1D0930→#7519AE @70% / @20%)
  ' float ty = clamp(0.5 - 0.5 * N.y, 0.0, 1.0);' +             // 0=상단, 1=하단
  ' vec3 bg = uBase;' +
  ' bg = mix(bg, mix(uG1A, uG1B, ty), uG1W);' +                  // 컬러 그라데이션 오버레이
  ' bg = mix(bg, vec3(ty), 0.40 * mix(1.0,0.2,ty));' +           // #000000→흰색(α20%) @40% (전 스킨 공통 음영)
  ' bg = mix(bg, mix(vec3(0.0), vec3(0.463,0.102,0.678), ty), uG2W);' + // #000000→#761AAD (기본 스킨만 20%)
  ' vec3 col = bg * mix(0.96,1.0,diff);' +                       // 아주 옅은 입체 음영
  ' float spec = pow(max(dot(N, normalize(vec3(-0.45,-0.5,0.82))),0.0),7.0);' +
  ' col += vec3(1.0)*spec*0.08;' +
  ' vec4 t = texture2D(uLand, vUv);' +                          // 대륙은 지오메트리 uv → 표면과 함께 회전
  ' float landA = t.a;' +                                        // 0.20=유리(기본)육지, 1.0=방문국
  ' float landMask = step(0.004, t.a);' +                        // 육지 픽셀 여부(불투명도와 별개의 커버리지)
  ' vec3 landCol = t.rgb * mix(0.85, 1.0, diff);' +              // 빛에 따른 미세 음영(불투명도엔 영향 없음)
  ' col = mix(col, landCol, landA * uLandOpacity);' +            // 기본육지=흰20% → 보라 본체(지구색)가 비쳐 유리처럼
  ' col += cyan * landMask * 0.02 * uGlow;' +                    // 아주 옅은 가장자리 톤
  ' float gloss = pow(max(dot(N, normalize(vec3(-0.45,-0.5,0.82))),0.0),16.0);' + // 유리 광택(또렷한 반사 스폿)
  ' col += vec3(1.0) * gloss * landMask * 0.25;' +              // 육지에 글로시 하이라이트
  ' float facing = max(N.z,0.0);' +
  ' float alpha = smoothstep(0.0, 0.02, facing);' +             // 실루엣 페더(부드러운 가장자리)
  ' gl_FragColor = vec4(col, alpha);' +
  '}';

// 본체 스킨 — 기본(보라 발광 행성) 값. setTheme의 theme.neon으로 교체된다 (constants/globeSkins.ts).
var NEON_DEFAULT_SKIN = { base:'#FF14E4', gradFrom:'#1D0930', gradTo:'#7519AE', gradAlpha:0.70 };
var pendingNeonSkin = null; // init 전에 setTheme이 도착할 수 있어 보관
function hex3(h){ var n=parseInt(String(h).replace('#',''),16); return new THREE.Vector3(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); }
// 우주가스(#bg .neb) 재채색 — 스킨 팔레트가 있으면 p계열=본체색(base)/b계열=보조색(gradTo),
// 없으면(aurora 기본) 각 블롭의 data-c 기본색으로 복원 (설정 미리보기에서 스킨을 되돌릴 수 있음)
function applyNebula(s){
  var els = document.querySelectorAll('#bg .neb');
  for(var i=0;i<els.length;i++){
    var el = els[i];
    var c = s ? (el.getAttribute('data-k')==='b' ? s.gradTo : s.base) : null;
    c = c || el.getAttribute('data-c');
    var n = parseInt(String(c).replace('#',''),16);
    var rgb = ((n>>16)&255)+','+((n>>8)&255)+','+(n&255);
    el.style.background = 'radial-gradient(circle at 50% 50%, rgba('+rgb+','+el.getAttribute('data-a')+'), rgba('+rgb+',0) '+el.getAttribute('data-s')+'%)';
  }
}
// 지역명 라벨 외곽선(halo) — 스킨 본체색을 어둡게(×0.25) 파생. 기본(aurora)=어두운 보라
var LABEL_HALO = 'rgba(45,16,84,';
// 도시 핀 색 — 스킨별 지정값(사용자 확정): aurora #FF00B7 / cyan #19FF8C / mint #00EEFF
var PIN_RGBA = 'rgba(255,0,183,';
var PIN_BY_BASE = { '#00D7F3':'25,255,140', '#86FFBC':'0,238,255' }; // 스킨 base색 → 핀 rgb
function applyNeonSkin(s){
  pendingNeonSkin = s || null;
  applyNebula(s || null); // 가스는 DOM만 있으면 즉시 반영 (material 준비 전에도)
  // 라벨 halo를 스킨색 기반으로 갱신 (스킨 없으면 기본 보라 복원)
  if(s && s.base){
    var bn = parseInt(String(s.base).replace('#',''),16);
    LABEL_HALO = 'rgba('+Math.round(((bn>>16)&255)*0.25)+','+Math.round(((bn>>8)&255)*0.25)+','+Math.round((bn&255)*0.25)+',';
  } else {
    LABEL_HALO = 'rgba(45,16,84,';
  }
  // 핀 색 — 스킨 base색으로 판별(미지정 스킨은 aurora 핀 폴백)
  var pb = s && s.base ? PIN_BY_BASE[String(s.base).toUpperCase()] : null;
  PIN_RGBA = 'rgba(' + (pb || '255,0,183') + ',';
  if(typeof _lblLast!=='undefined' && _lblLast) _lblLast.zf = NaN; // 다음 프레임에 라벨 즉시 재도색
  if(!material) return;
  var d = NEON_DEFAULT_SKIN, t = s || d;
  material.uniforms.uBase.value = hex3(t.base || d.base);
  material.uniforms.uG1A.value = hex3(t.gradFrom || d.gradFrom);
  material.uniforms.uG1B.value = hex3(t.gradTo || d.gradTo);
  material.uniforms.uG1W.value = (t.gradAlpha != null ? t.gradAlpha : d.gradAlpha);
  material.uniforms.uG2W.value = s ? 0.0 : 0.20; // 커스텀 스킨은 2겹(시안 SVG 구조), 기본은 3겹
}

async function init(){
  worldData = (typeof WORLD_GEO !== 'undefined' && WORLD_GEO)
    ? WORLD_GEO
    : await d3.json('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson');
  // 번들 GeoJSON 국가명 정규화 — classic과 동일 (매핑 테이블 정식 명칭 기준)
  var GEO_NAME_FIX = {"USA":"United States of America","England":"United Kingdom","Republic of Serbia":"Serbia","United Republic of Tanzania":"Tanzania","Macedonia":"North Macedonia","Swaziland":"Eswatini","Republic of the Congo":"Congo","West Bank":"Palestine"};
  worldData.features.forEach(function(f){ var fx = GEO_NAME_FIX[f.properties && f.properties.name]; if (fx) f.properties.name = fx; });
  world110Data = worldData; // 딥줌 LOD 복귀용 원본 보관
  buildLabelIndex();        // 지역명 라벨 인덱스(centroid·면적) — 110m 기준 1회

  var tex = buildNeonTexture();
  material = new THREE.ShaderMaterial({
    uniforms: {
      uLand:{value:tex}, uLandOpacity:{value:1.0}, uGlow:{value:1.0},
      uBase:{value:hex3(NEON_DEFAULT_SKIN.base)},
      uG1A:{value:hex3(NEON_DEFAULT_SKIN.gradFrom)},
      uG1B:{value:hex3(NEON_DEFAULT_SKIN.gradTo)},
      uG1W:{value:NEON_DEFAULT_SKIN.gradAlpha},
      uG2W:{value:0.20},
    },
    vertexShader: NEON_VS, fragmentShader: NEON_FS, transparent: true,
  });
  globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1,128,128), material);
  globe.add(globeMesh);
  if (pendingNeonSkin) applyNeonSkin(pendingNeonSkin);

  resize();
  if (pendingSponsored) buildAdMarkers(pendingSponsored);
  lastT = performance.now();
  animate();

  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type:'globeReady' }));
}

// 회전/줌 상태 — 딥줌: 정사영이라 camera.zoom 배율만 키우면 클리핑 없이 깊이 확대된다
var targetZoom=1, currentZoom=1, MINZ=0.7, MAXZ=20.0;
var isDragging=false, prevMouse={x:0,y:0}, velocity={x:0,y:0};
var rotX=0, rotY=0, lastT=0;
// 회전 감도 — 확대할수록 반비례(구글맵식 정밀 이동)
function rotSens(){ return 0.005 / Math.max(1, currentZoom*0.55); }
// 상하 회전 클램프 — 기본 ±0.6, 확대할수록 완화(고위도 나라를 중앙에 볼 수 있게)
function rotXClamp(){ return Math.min(1.35, 0.6 + Math.max(0, currentZoom-1)*0.35); }

// 탭 → 국가 검출 (classic과 동일: 구체 레이캐스트 → 경위도 → geoContains)
var raycaster=new THREE.Raycaster(), tapStartPos={x:0,y:0}, lastPinchDist=null;
function detectCountry(clientX, clientY){
  if(!globeMesh || !worldData) return null;
  var mouse=new THREE.Vector2((clientX/window.innerWidth)*2-1, -(clientY/window.innerHeight)*2+1);
  raycaster.setFromCamera(mouse, camera);
  var hits=raycaster.intersectObject(globeMesh);
  if(!hits.length) return null;
  var pt=hits[0].point.clone();
  var inv=new THREE.Matrix4().copy(globe.matrixWorld).invert();
  pt.applyMatrix4(inv);
  var lat=90 - THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, pt.y))));
  var lon=THREE.MathUtils.radToDeg(Math.atan2(pt.z, -pt.x)) - 180;
  return worldData.features.find(function(f){ return d3.geoContains(f,[lon,lat]); }) || null;
}
function onTap(x,y){
  var f=detectCountry(x,y); if(!f) return;
  var nameEn=f.properties.name, nameKo=KO_NAMES[nameEn] || nameEn;
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type:'countryTapped', country:nameKo, countryEn:nameEn }));
}

window.addEventListener('mousedown', function(e){ isDragging=true; tapStartPos={x:e.clientX,y:e.clientY}; prevMouse={x:e.clientX,y:e.clientY}; });
window.addEventListener('mouseup', function(e){ if(Math.hypot(e.clientX-tapStartPos.x,e.clientY-tapStartPos.y)<5) onTap(e.clientX,e.clientY); isDragging=false; });
window.addEventListener('mousemove', function(e){ if(!isDragging) return; var dx=e.clientX-prevMouse.x, dy=e.clientY-prevMouse.y; var s=rotSens(); velocity.x=dy*s; velocity.y=dx*s; rotY+=dx*s; rotX+=dy*s; var cx=rotXClamp(); rotX=Math.max(-cx,Math.min(cx,rotX)); prevMouse={x:e.clientX,y:e.clientY}; });

window.addEventListener('touchstart', function(e){ if(e.touches.length===2){ lastPinchDist=null; return; } isDragging=true; tapStartPos={x:e.touches[0].clientX,y:e.touches[0].clientY}; prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY}; }, { passive:true });
window.addEventListener('touchend', function(e){ var t=e.changedTouches[0]; if(Math.hypot(t.clientX-tapStartPos.x,t.clientY-tapStartPos.y)<8) onTap(t.clientX,t.clientY); isDragging=false; lastPinchDist=null; });
window.addEventListener('touchmove', function(e){
  if(e.touches.length===2){
    var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
    var dist=Math.sqrt(dx*dx+dy*dy);
    if(lastPinchDist!==null && lastPinchDist>0){ targetZoom*=dist/lastPinchDist; targetZoom=Math.max(MINZ,Math.min(MAXZ,targetZoom)); }
    lastPinchDist=dist; return;
  }
  if(!isDragging) return;
  var tdx=e.touches[0].clientX-prevMouse.x, tdy=e.touches[0].clientY-prevMouse.y;
  var s=rotSens();
  velocity.x=tdy*s; velocity.y=tdx*s;
  rotY+=tdx*s; rotX+=tdy*s; var cx=rotXClamp(); rotX=Math.max(-cx,Math.min(cx,rotX));
  prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY};
}, { passive:true });

window.addEventListener('wheel', function(e){ e.preventDefault(); targetZoom*=Math.exp(-e.deltaY*0.0015); targetZoom=Math.max(MINZ,Math.min(MAXZ,targetZoom)); }, { passive:false });

function resize(){
  var w=window.innerWidth, h=window.innerHeight;
  renderer.setSize(w,h);
  var aspect=w/h, R=1.0;
  // 기본 크기: 디스크 지름 = 화면 폭의 ~85%(좌우 여백, 사진과 동일). 화면 세로 정중앙. 확대는 줌으로만.
  var halfV = R / (0.85 * aspect);            // 폭 기준 → 세로로 긴 화면에서도 폭을 안 넘침
  camera.top=halfV; camera.bottom=-halfV; camera.left=-halfV*aspect; camera.right=halfV*aspect;
  camera.updateProjectionMatrix();
  sizeLabelCanvas();
}
window.addEventListener('resize', resize);

// ── 광고(스폰서) 마커 (classic과 동일, facing만 정사영용으로 조정) ──
var adLayer=document.getElementById('ad-layer');
var adMarkers=[], pendingSponsored=null, _adVec=new THREE.Vector3();
var AD_FACING_MIN=0.2;
function clearAdMarkers(){ adMarkers.forEach(function(m){ if(m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el); }); adMarkers=[]; }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(ch){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch]; }); }
function buildAdMarkers(list){
  clearAdMarkers();
  if(!worldData || !list || !adLayer) return;
  list.forEach(function(item){
    var nameEn=item && item.nameEn; if(!nameEn) return;
    var f=worldData.features.find(function(ft){ return ft.properties.name===nameEn; }); if(!f) return;
    var c=d3.geoCentroid(f);
    var priceHtml=item.price ? '<div class="mc-price">'+escapeHtml(item.price)+'</div>' : '';
    var thumbHtml=item.image ? '<img class="mc-thumb" src="'+escapeHtml(item.image)+'" />' : '';
    var el=document.createElement('div'); el.className='ad-pin';
    el.innerHTML='<div class="ad-line"></div><div class="ad-dot"></div>'+
      '<div class="ad-minicard"><div class="mc-row">'+thumbHtml+
      '<div class="mc-text"><div class="mc-head"><span class="mc-ad">AD</span><span class="mc-title">'+escapeHtml(item.label||'여행 패키지')+'</span></div>'+priceHtml+
      '</div></div></div>';
    var fire=function(ev){ ev.stopPropagation(); if(ev.cancelable) ev.preventDefault(); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type:'sponsoredTapped', countryEn:nameEn })); };
    el.addEventListener('touchstart', function(ev){ ev.stopPropagation(); }, { passive:true });
    el.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    el.addEventListener('click', fire); el.addEventListener('touchend', fire);
    adLayer.appendChild(el);
    adMarkers.push({ nameEn:nameEn, lon:c[0], lat:c[1], el:el });
  });
}
function updateAdMarkers(){
  if(!adMarkers.length) return;
  for(var i=0;i<adMarkers.length;i++){
    var m=adMarkers[i];
    var latR=m.lat*Math.PI/180, lonR=m.lon*Math.PI/180, rh=Math.cos(latR), A=lonR+Math.PI;
    _adVec.set(-rh*Math.cos(A), Math.sin(latR), rh*Math.sin(A));   // 단위구 로컬좌표(detectCountry 역매핑)
    _adVec.multiplyScalar(1.02);
    globe.localToWorld(_adVec);                                    // 현재 회전 반영(렌더 후)
    var lenW=Math.sqrt(_adVec.x*_adVec.x+_adVec.y*_adVec.y+_adVec.z*_adVec.z);
    var facing=(lenW>0) ? _adVec.z/lenW : -1;                      // 정사영: 정면 = +z
    var ndc=_adVec.clone().project(camera);
    if(facing>AD_FACING_MIN && ndc.z<1){
      m.el.style.display='block';
      m.el.style.left=((ndc.x*0.5+0.5)*window.innerWidth)+'px';
      m.el.style.top=((-ndc.y*0.5+0.5)*window.innerHeight)+'px';
    } else { m.el.style.display='none'; }
  }
}

// ── 딥줌 LOD: 확대 시 채움·국경 텍스처를 50m 데이터로 재생성 (classic과 동일 흐름) ──
var world110Data=null, world50Data=null, world50Requested=false, lodBusy=false, worldLOD='110m';
var LOD_HI_AT=2.2;
var NAME_FIX_50M = {
  "USA":"United States of America","England":"United Kingdom","Republic of Serbia":"Serbia",
  "United Republic of Tanzania":"Tanzania","Macedonia":"North Macedonia","Swaziland":"Eswatini",
  "eSwatini":"Eswatini","Republic of the Congo":"Congo","West Bank":"Palestine",
  "Macao":"Macau","Czechia":"Czech Republic","Bosnia and Herz.":"Bosnia and Herzegovina",
  "Central African Rep.":"Central African Republic","Côte d'Ivoire":"Ivory Coast",
  "Dem. Rep. Congo":"Democratic Republic of the Congo","Dominican Rep.":"Dominican Republic",
  "Eq. Guinea":"Equatorial Guinea","Falkland Is.":"Falkland Islands",
  "Fr. S. Antarctic Lands":"French Southern and Antarctic Lands","Guinea-Bissau":"Guinea Bissau",
  "N. Cyprus":"Northern Cyprus","S. Sudan":"South Sudan","Solomon Is.":"Solomon Islands",
  "Timor-Leste":"East Timor","W. Sahara":"Western Sahara","Bahamas":"The Bahamas",
};
function topoDecode(topo, objName){
  var tf=topo.transform;
  var arcs=topo.arcs.map(function(arc){
    if(!tf) return arc.map(function(p){ return [p[0],p[1]]; });
    var x=0,y=0;
    return arc.map(function(p){ x+=p[0]; y+=p[1]; return [x*tf.scale[0]+tf.translate[0], y*tf.scale[1]+tf.translate[1]]; });
  });
  function ringFromArcs(arcIdxs){
    var ring=[];
    arcIdxs.forEach(function(ai){
      var pts=ai>=0 ? arcs[ai] : arcs[~ai].slice().reverse();
      if(ring.length) pts=pts.slice(1);
      ring=ring.concat(pts);
    });
    return ring;
  }
  var feats=[];
  (topo.objects[objName].geometries||[]).forEach(function(g){
    var name=(g.properties && g.properties.name)||'';
    name=NAME_FIX_50M[name]||name;
    var geom=null;
    if(g.type==='Polygon'){ geom={ type:'Polygon', coordinates:g.arcs.map(ringFromArcs) }; }
    else if(g.type==='MultiPolygon'){ geom={ type:'MultiPolygon', coordinates:g.arcs.map(function(poly){ return poly.map(ringFromArcs); }) }; }
    if(geom) feats.push({ type:'Feature', properties:{ name:name }, geometry:geom });
  });
  return { type:'FeatureCollection', features:feats };
}
function applyLOD(target){
  if(lodBusy || !material) return;
  lodBusy=true;
  worldData = target==='50m' ? world50Data : world110Data;
  worldLOD = target;
  try {
    var tex=buildNeonTexture(), old=material.uniforms.uLand.value;
    material.uniforms.uLand.value=tex;
    if(old && old.dispose) old.dispose();
  } catch(err){}
  lodBusy=false;
}
function zoomSettled(){ return lastPinchDist===null && Math.abs(targetZoom-currentZoom)<0.03; }
function smoothstep01(a,b,x){ var t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
function geoToVec3N(lon, lat, r){
  var phi=THREE.MathUtils.degToRad(90-lat), theta=THREE.MathUtils.degToRad(lon+180);
  return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta));
}
// ── 벡터 구분선 오버레이 — 텍스처에 구운 선은 딥줌에서 흐려지므로(텍셀 확대),
// 확대할수록 구 표면 위 LineSegments(벡터, 항상 선명)가 페이드인해 대신한다 ──
function buildWorldLinesMerged(world, R){
  var pos=[];
  function addRing(coords){
    if(coords.length<2) return;
    var prev=null;
    for(var i=0;i<coords.length;i++){
      var v=geoToVec3N(coords[i][0], coords[i][1], R);
      if(prev) pos.push(prev.x,prev.y,prev.z, v.x,v.y,v.z);
      prev=v;
    }
  }
  world.features.forEach(function(f){
    var g=f.geometry; if(!g) return;
    if(g.type==='Polygon') g.coordinates.forEach(addRing);
    else if(g.type==='MultiPolygon') g.coordinates.forEach(function(poly){ poly.forEach(addRing); });
  });
  var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  var mat=new THREE.LineBasicMaterial({ color:new THREE.Color('#FFFFFF'), transparent:true, opacity:0, depthWrite:false });
  var grp=new THREE.Group(); grp.add(new THREE.LineSegments(geo, mat));
  grp.userData.mat=mat; grp.visible=false;
  return grp;
}
function buildPolylinesMerged(lines, R){
  var pos=[];
  for(var i=0;i<lines.length;i++){
    var ln=lines[i], prev=null;
    for(var j=0;j<ln.length;j++){
      var v=geoToVec3N(ln[j][0], ln[j][1], R);
      if(prev) pos.push(prev.x,prev.y,prev.z, v.x,v.y,v.z);
      prev=v;
    }
  }
  var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  var mat=new THREE.LineBasicMaterial({ color:new THREE.Color('#FFFFFF'), transparent:true, opacity:0, depthWrite:false });
  var grp=new THREE.Group(); grp.add(new THREE.LineSegments(geo, mat));
  grp.userData.mat=mat; grp.visible=false;
  return grp;
}
var vecBorders110=null, vecBorders50=null;
var admin1Lines=null, admin1Group=null, admin1Requested=false;
var borders10Lines=null, borders10Group=null, borders10Requested=false; // 10m 최정밀(해안+국경)
function updateVectorLines(){
  if(!globeMesh) return;
  var z=currentZoom;
  // 벡터 국경 — 1.35배부터 등장, 3단계 유동 전환: 110m → 50m(1.9~2.6) → 10m(4.5~5.8)
  var vb=smoothstep01(1.35, 2.0, z)*0.9;
  var t=world50Data ? smoothstep01(1.9, 2.6, z) : 0;
  var t10=borders10Lines ? smoothstep01(4.5, 5.8, z) : 0;
  if(vb>0 && !vecBorders110 && world110Data && zoomSettled()){
    vecBorders110=buildWorldLinesMerged(world110Data, 1.002); globe.add(vecBorders110);
  }
  if(t>0 && !vecBorders50 && world50Data && zoomSettled()){
    vecBorders50=buildWorldLinesMerged(world50Data, 1.002); globe.add(vecBorders50);
  }
  if(z>3.8 && !borders10Lines && !borders10Requested && window.ReactNativeWebView){
    borders10Requested=true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'needBorders10m' }));
  }
  if(t10>0 && !borders10Group && borders10Lines && zoomSettled()){
    borders10Group=buildPolylinesMerged(borders10Lines, 1.0025); globe.add(borders10Group);
  }
  if(vecBorders110){ var o1=vb*(vecBorders50 ? (1-t) : 1); vecBorders110.userData.mat.opacity=o1; vecBorders110.visible=o1>0.01; }
  if(vecBorders50){ var o2=vb*t*(borders10Group ? (1-t10) : 1); vecBorders50.userData.mat.opacity=o2; vecBorders50.visible=o2>0.01; }
  if(borders10Group){ var o3=0.92*t10; borders10Group.userData.mat.opacity=o3; borders10Group.visible=o3>0.01; }
  // 주/도 지역구분선 — 3.0~4.2 페이드인 (데이터는 처음 필요 시 RN에 lazy 요청)
  var a=smoothstep01(3.0, 4.2, z)*0.45;
  if(a>0 && !admin1Lines && !admin1Requested && window.ReactNativeWebView){
    admin1Requested=true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'needAdmin1' }));
  }
  if(a>0 && admin1Lines && !admin1Group && zoomSettled()){
    admin1Group=buildPolylinesMerged(admin1Lines, 1.001); globe.add(admin1Group);
  }
  if(admin1Group){ admin1Group.userData.mat.opacity=a; admin1Group.visible=a>0.01; }
}
function maybeSwapLOD(){
  if(!material) return;
  if(!zoomSettled()) return; // 텍스처 재생성(무거움)은 핀치 종료 후에만 — 확대/축소 중 렉 방지
  var want = currentZoom>=LOD_HI_AT ? '50m' : '110m';
  if(want===worldLOD) return;
  if(want==='50m'){
    if(!world50Data){
      if(!world50Requested && window.ReactNativeWebView){
        world50Requested=true;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'need50m' }));
      }
      return;
    }
    applyLOD('50m');
  } else {
    applyLOD('110m');
  }
}

// ── 지역명 라벨(나라·도시) — classic과 동일 엔진, 정사영 facing(z/len)만 다름 ──
var labelCanvas=document.getElementById('label-layer');
var labelCtx=labelCanvas ? labelCanvas.getContext('2d') : null;
function sizeLabelCanvas(){
  if(!labelCanvas) return;
  var dpr=Math.min(window.devicePixelRatio||1,2);
  labelCanvas.width=Math.round(window.innerWidth*dpr);
  labelCanvas.height=Math.round(window.innerHeight*dpr);
  labelCanvas.style.width=window.innerWidth+'px';
  labelCanvas.style.height=window.innerHeight+'px';
  if(labelCtx) labelCtx.setTransform(dpr,0,0,dpr,0,0);
}
sizeLabelCanvas();
var countryLabels=[];
function buildLabelIndex(){
  countryLabels=[];
  if(!world110Data) return;
  world110Data.features.forEach(function(f){
    var name=f.properties.name||''; if(!name) return;
    var c=d3.geoCentroid(f);
    var b=d3.geoBounds(f);
    var dLon=Math.abs(b[1][0]-b[0][0]); if(dLon>180) dLon=360-dLon;
    var dLat=Math.abs(b[1][1]-b[0][1]);
    var area=dLon*dLat*Math.max(0.15, Math.cos(c[1]*Math.PI/180));
    countryLabels.push({ name:name, ko:KO_NAMES[name]||name, lon:c[0], lat:c[1], area:area });
  });
  countryLabels.sort(function(a,b){ return b.area-a.area; });
}
var _lblVec=new THREE.Vector3();
function projectLL(lon, lat){
  var latR=lat*Math.PI/180, lonR=lon*Math.PI/180, rh=Math.cos(latR), A=lonR+Math.PI;
  _lblVec.set(-rh*Math.cos(A), Math.sin(latR), rh*Math.sin(A));
  _lblVec.multiplyScalar(1.01);
  globe.localToWorld(_lblVec);
  var lenW=Math.sqrt(_lblVec.x*_lblVec.x+_lblVec.y*_lblVec.y+_lblVec.z*_lblVec.z);
  var facing=(lenW>0) ? _lblVec.z/lenW : -1; // 정사영: 정면 = +z
  var ndc=_lblVec.clone().project(camera);
  if(ndc.z>=1) return null;
  return { x:(ndc.x*0.5+0.5)*window.innerWidth, y:(-ndc.y*0.5+0.5)*window.innerHeight, facing:facing };
}
var _lblLast={ rx:NaN, ry:NaN, zf:NaN };
function updateLabels(){
  if(!labelCtx) return;
  var zf=currentZoom;
  if(Math.abs(_lblLast.rx-rotX)<1e-4 && Math.abs(_lblLast.ry-rotY)<1e-4 && Math.abs(_lblLast.zf-zf)<1e-3) return;
  _lblLast.rx=rotX; _lblLast.ry=rotY; _lblLast.zf=zf;
  labelCtx.clearRect(0,0,window.innerWidth,window.innerHeight);
  if(zf<1.25 || !countryLabels.length) return;
  var grid={}; var CELL=76;
  function occupy(x,y){
    var k=Math.floor(x/CELL)+'_'+Math.floor(y/CELL);
    if(grid[k]) return false;
    grid[k]=1; return true;
  }
  var n=Math.min(countryLabels.length, Math.max(0, Math.floor((zf-1.15)*22)));
  var fs=Math.min(15, 10+zf*0.45);
  labelCtx.textAlign='center'; labelCtx.textBaseline='middle'; labelCtx.lineJoin='round';
  for(var i=0;i<n;i++){
    var L=countryLabels[i];
    var p=projectLL(L.lon, L.lat);
    if(!p || p.facing<0.3) continue;
    if(!occupy(p.x,p.y)) continue;
    var a=Math.min(1,(p.facing-0.3)/0.25);
    labelCtx.font='600 '+fs+'px sans-serif';
    labelCtx.strokeStyle=LABEL_HALO+(0.8*a)+')';
    labelCtx.lineWidth=3;
    labelCtx.strokeText(L.ko, p.x, p.y);
    labelCtx.fillStyle='rgba(255,255,255,'+(0.92*a)+')';
    labelCtx.fillText(L.ko, p.x, p.y);
  }
  if(zf>=3.2 && typeof CITY_LABELS!=='undefined'){
    var cfs=Math.min(13, 9+zf*0.35);
    for(var j=0;j<CITY_LABELS.length;j++){
      var C=CITY_LABELS[j];
      if(C.t===2 && zf<5) continue;
      var q=projectLL(C.lon, C.lat);
      if(!q || q.facing<0.42) continue;
      if(!occupy(q.x,q.y)) continue;
      var ca=Math.min(1,(q.facing-0.42)/0.22);
      labelCtx.fillStyle=PIN_RGBA+(0.95*ca)+')'; // 스킨별 핀 색(aurora/cyan/mint)
      // 핀은 정확히 투영 지점에 — 작은 섬(화면 몇 px)에서도 섬 위에 찍힌다. 텍스트는 그 아래
      labelCtx.beginPath(); labelCtx.arc(q.x, q.y, 2.2, 0, Math.PI*2); labelCtx.fill();
      labelCtx.font='500 '+cfs+'px sans-serif';
      labelCtx.strokeStyle=LABEL_HALO+(0.75*ca)+')';
      labelCtx.lineWidth=2.5;
      labelCtx.strokeText(C.n, q.x, q.y+cfs*1.15);
      labelCtx.fillStyle='rgba(240,240,248,'+(0.95*ca)+')';
      labelCtx.fillText(C.n, q.x, q.y+cfs*1.15);
    }
  }
}

function animate(){
  requestAnimationFrame(animate);
  if(window.__globePaused) return; // RN이 화면 밖(다른 탭/백그라운드)일 때 렌더 작업 스킵 → 발열 감소
  var now=performance.now(), dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
  if(!isDragging){ velocity.x*=0.95; velocity.y*=0.95; rotX+=velocity.x; rotY+=velocity.y; rotY-=dt*(Math.PI*2/45)/Math.max(1,currentZoom*0.55); } // 우→좌 자동회전 ~45s (확대 시 감속)
  var _cx=rotXClamp(); rotX=Math.max(-_cx,Math.min(_cx,rotX));
  currentZoom+=(targetZoom-currentZoom)*0.1;
  if(Math.abs(camera.zoom-currentZoom)>1e-4){ camera.zoom=currentZoom; camera.updateProjectionMatrix(); }
  globe.rotation.y=rotY; globe.rotation.x=rotX;
  renderer.render(scene, camera);
  updateAdMarkers();
  updateLabels();      // 지역명 라벨(나라·도시)
  maybeSwapLOD();      // 확대 임계 넘으면 50m 재텍스처
  updateVectorLines(); // 벡터 국경(딥줌 선명)·주/도 지역구분선 페이드
}

// RN → WebView 메시지 (setTheme은 theme.neon(스킨 팔레트)만 반영 — 나머지 네온 룩은 고정)
function handleMsg(msg){
  if(msg.type==='setVisitedCountries' && msg.countries){
    visitedMap={};
    msg.countries.forEach(function(c){ visitedMap[c.nameEn]={ color:c.color||null }; });
    if(msg.defaultColor) globeDefaultColor=msg.defaultColor;
    if(worldData && material){
      var tex=buildNeonTexture(), old=material.uniforms.uLand.value;
      material.uniforms.uLand.value=tex;
      if(old && old.dispose) old.dispose();
    }
  } else if(msg.type==='setTheme'){
    applyNeonSkin(msg.theme && msg.theme.neon ? msg.theme.neon : null);
  } else if(msg.type==='setSponsored'){
    pendingSponsored=msg.items||[];
    if(worldData) buildAdMarkers(pendingSponsored);
  } else if(msg.type==='world50m' && msg.topo){
    // 딥줌 LOD 데이터 도착 — 디코드 후 다음 maybeSwapLOD에서 교체
    try { world50Data = topoDecode(JSON.parse(msg.topo), 'countries'); }
    catch(err){ world50Requested=false; }
  } else if(msg.type==='admin1Lines' && msg.lines){
    // 주/도 지역구분선 데이터 도착 — 다음 updateVectorLines에서 그룹 생성
    try { admin1Lines = JSON.parse(msg.lines); }
    catch(err){ admin1Requested=false; }
  } else if(msg.type==='borders10m' && msg.lines){
    // 10m 최정밀 구분선 데이터 도착 — 다음 updateVectorLines에서 그룹 생성
    try { borders10Lines = JSON.parse(msg.lines); }
    catch(err){ borders10Requested=false; }
  }
}
window.addEventListener('message', function(e){ try{ handleMsg(typeof e.data==='string'?JSON.parse(e.data):e.data); }catch(_){} });
document.addEventListener('message', function(e){ try{ handleMsg(typeof e.data==='string'?JSON.parse(e.data):e.data); }catch(_){} });

init();
<\/script>
</body>
</html>`;

export default function GlobeView({
  size = 300, fullscreen = false, onMessage,
  visitedCountries = [], displayMode = 'flag', defaultColor = '#BF85FC',
  variant = 'aurora', themeOverride, sponsoredItems = [],
}: GlobeViewProps) {
  const webViewRef = useRef<WebView>(null);

  // 화면 밖(다른 탭)·백그라운드에선 WebGL 렌더 루프를 멈춰 발열을 줄인다 (보이는 화면은 동일)
  const animationsActive = useAnimationsActive();
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.__globePaused = ${animationsActive ? 'false' : 'true'}; true;`);
  }, [animationsActive]);

  const payload = useMemo(() => JSON.stringify({
    type: 'setVisitedCountries',
    countries: visitedCountries,
    displayMode,
    defaultColor,
  }), [visitedCountries, displayMode, defaultColor]);

  const sponsoredPayload = useMemo(() => JSON.stringify({
    type: 'setSponsored',
    items: sponsoredItems,
  }), [sponsoredItems]);

  const themePayload = useMemo(() => JSON.stringify({
    type: 'setTheme',
    // classic은 팔레트 필드(oceanBase 등)를, 네온(aurora)은 neon 필드만 읽는다
    theme: { ...(GLOBE_THEMES[variant] || GLOBE_THEMES.aurora), neon: themeOverride || null },
  }), [variant, themeOverride]);

  useEffect(() => {
    // 빈 목록도 반드시 전송 — 마지막 방문국 기록을 삭제(1→0)했을 때 보내지 않으면
    // WebView의 visitedMap이 이전 상태로 박제돼 지구본 활성 표시가 지워지지 않는다.
    // (WebView 쪽 핸들러는 빈 배열을 정상 처리: visitedMap={} 후 재텍스처링)
    if (webViewRef.current) {
      webViewRef.current.postMessage(payload);
    }
  }, [payload]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(sponsoredPayload);
    }
  }, [sponsoredPayload]);

  useEffect(() => {
    webViewRef.current?.postMessage(themePayload);
  }, [themePayload]);

  // WebView 준비 완료 여부 — globeReady 신호 수신 시 true.
  const readyRef = useRef(false);

  // 폼(variant) 전환 시 WebView는 key 변경으로 리마운트되므로, 새 글로브의 globeReady를 다시 기다린다.
  useEffect(() => { readyRef.current = false; }, [variant]);

  // 현재 페이로드 일괄 전송 (초기화 직후 1회 + 폴백)
  const sendAll = useCallback(() => {
    const wv = webViewRef.current;
    if (!wv) return;
    wv.postMessage(themePayload);
    wv.postMessage(payload); // 빈 목록도 전송 (위 effect와 동일 이유)
    wv.postMessage(sponsoredPayload);
  }, [themePayload, payload, sponsoredPayload]);

  // WebView → RN 메시지: globeReady면 그 시점에 페이로드 전송, 나머지는 부모로 전달
  const handleMessage = useCallback((e: any) => {
    let data: any = null;
    try { data = JSON.parse(e.nativeEvent.data); } catch {}
    if (data?.type === 'globeReady') {
      readyRef.current = true;
      sendAll();
      return; // 내부 신호는 부모로 올리지 않음
    }
    if (data?.type === 'need50m') {
      // 딥줌 LOD 데이터 요청 — 740KB 문자열이라 처음 필요할 때만 lazy require해 전송
      const { WORLD_50M_TOPO } = require('../data/vendorWorld50m');
      webViewRef.current?.postMessage(JSON.stringify({ type: 'world50m', topo: WORLD_50M_TOPO }));
      return; // 내부 신호
    }
    if (data?.type === 'needAdmin1') {
      // 주/도 지역구분선 요청 — 1.7MB 문자열, 딥줌 진입 시에만 lazy 전송
      const { ADMIN1_LINES_JSON } = require('../data/vendorAdmin1');
      webViewRef.current?.postMessage(JSON.stringify({ type: 'admin1Lines', lines: ADMIN1_LINES_JSON }));
      return; // 내부 신호
    }
    if (data?.type === 'needBorders10m') {
      // 10m 최정밀 구분선(해안+국경) 요청 — 3.4MB 문자열, 최심 줌 접근 시에만 lazy 전송
      const { BORDERS_10M_JSON } = require('../data/vendorBorders10m');
      webViewRef.current?.postMessage(JSON.stringify({ type: 'borders10m', lines: BORDERS_10M_JSON }));
      return; // 내부 신호
    }
    onMessage?.(e);
  }, [sendAll, onMessage]);

  const handleLoad = () => {
    // globeReady 신호 유실 대비 폴백: 준비 신호가 끝내 안 오면 한 번만 전송
    setTimeout(() => {
      if (!readyRef.current) sendAll();
    }, 2500);
  };

  return (
    <View style={fullscreen ? styles.containerFull : [styles.container, { width: size, height: size }]}>
      <WebView
        key={variant}
        ref={webViewRef}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        source={{ html: variant === 'aurora' ? neonGlobeHTML : globeHTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        allowsInlineMediaPlayback={true}
        mixedContentMode="always"
        onMessage={handleMessage}
        onLoad={handleLoad}
        // OS가 백그라운드에서 WebView 프로세스를 회수하면(메모리 압박) 탭 복귀 시 빈 화면으로 남는다
        // → 즉시 리로드. 로드 완료 후 globeReady → sendAll()로 방문국/테마가 자동 재주입된다.
        onContentProcessDidTerminate={() => { readyRef.current = false; webViewRef.current?.reload(); }}
        onRenderProcessGone={() => { readyRef.current = false; webViewRef.current?.reload(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  containerFull: {
    flex: 1,
    overflow: 'hidden',
  },
});
