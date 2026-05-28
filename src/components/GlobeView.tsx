import React, { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

export type GlobeDisplayMode = 'flag' | 'color';

export interface VisitedCountry {
  nameEn: string;       // GeoJSON 영문 이름
  color?: string;       // 사용자 지정 색상 (hex)
}

interface GlobeViewProps {
  size?: number;
  fullscreen?: boolean;
  onMessage?: (e: any) => void;
  visitedCountries?: VisitedCountry[];
  displayMode?: GlobeDisplayMode;
  defaultColor?: string;
}

const globeHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0A0A0F;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    font-family: 'Noto Sans KR', sans-serif;
    cursor: grab;
  }
  body:active { cursor: grabbing; }
  #canvas-container { position: fixed; inset: 0; }
  canvas { display: block; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
<div id="canvas-container"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"><\/script>

<script>
var cfg = {
  oceanColor: "#0a1a55",
  landColor: "#6f6d6d",
  neonColor: "#a78bfa",
  borderColor: "#7B5CF0",
  autoRotate: true,
  gridOpacity: 0
};

// --- Three.js setup ---
var container = document.getElementById('canvas-container');
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0A0A0F, 1);
container.appendChild(renderer.domElement);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 4.2;
camera.position.y = -0.35;

// Stars
var starGeo = new THREE.BufferGeometry();
var starPositions = [];
for (var i = 0; i < 3000; i++) {
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
var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.4 });
scene.add(new THREE.Points(starGeo, starMat));

// Globe group
var globe = new THREE.Group();
scene.add(globe);

// Visited countries data (injected from React Native)
var visitedMap = {};
var globeDisplayMode = 'flag'; // 'flag' | 'color'
var globeDefaultColor = '#BF85FC';

// GeoJSON name → ISO 2-letter code
var EN_TO_ISO = {
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

// 방문 국가 국기 이미지 일괄 로드
async function loadAllFlags() {
  var promises = [];
  Object.keys(visitedMap).forEach(function(nameEn) {
    var iso = EN_TO_ISO[nameEn];
    if (iso) promises.push(loadFlagImage(iso));
  });
  await Promise.all(promises);
}

// Create texture from world GeoJSON
async function buildTexture() {
  var W = 4096, H = 2048;
  var offscreen = document.createElement('canvas');
  offscreen.width = W; offscreen.height = H;
  var ctx = offscreen.getContext('2d');

  ctx.fillStyle = '#04102e';
  ctx.fillRect(0, 0, W, H);

  var deepZones = [
    [W*0.15, H*0.35], [W*0.45, H*0.25], [W*0.7, H*0.55],
    [W*0.25, H*0.7],  [W*0.85, H*0.35], [W*0.55, H*0.65],
  ];
  deepZones.forEach(function(z) {
    var x = z[0], y = z[1];
    var rg = ctx.createRadialGradient(x, y, 0, x, y, W * 0.22);
    rg.addColorStop(0, 'rgba(5,15,55,0.6)');
    rg.addColorStop(1, 'rgba(5,15,55,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });

  var blueZones = [
    [W*0.32, H*0.52, 0.20], [W*0.62, H*0.38, 0.17],
    [W*0.82, H*0.6, 0.18], [W*0.12, H*0.62, 0.16], [W*0.92, H*0.42, 0.15],
  ];
  blueZones.forEach(function(z) {
    var x = z[0], y = z[1], sz = z[2];
    var rg = ctx.createRadialGradient(x, y, 0, x, y, W * sz);
    rg.addColorStop(0, 'rgba(50,110,220,0.50)');
    rg.addColorStop(0.5,'rgba(20,50,150,0.25)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });

  [[W*0.4, H*0.08], [W*0.75, H*0.92], [W*0.15, H*0.9]].forEach(function(z) {
    var x = z[0], y = z[1];
    var rg = ctx.createRadialGradient(x, y, 0, x, y, W*0.13);
    rg.addColorStop(0, 'rgba(123,92,240,0.22)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });

  var tone = ctx.createLinearGradient(0, 0, W, H);
  tone.addColorStop(0, 'rgba(30,70,200,0.12)');
  tone.addColorStop(0.5, 'rgba(40,30,140,0.06)');
  tone.addColorStop(1, 'rgba(30,70,200,0.12)');
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, W, H);

  var horizon = ctx.createLinearGradient(0, 0, 0, H);
  horizon.addColorStop(0, 'rgba(5,15,55,0.35)');
  horizon.addColorStop(0.3, 'rgba(0,0,0,0)');
  horizon.addColorStop(0.7, 'rgba(0,0,0,0)');
  horizon.addColorStop(1, 'rgba(5,15,55,0.35)');
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

      // 전체 테두리
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255,255,255,0.3)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      path(f);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // 색상 모드 (또는 국기 로드 실패 시 폴백)
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 4;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      path(f);
      ctx.fill();
      ctx.shadowBlur = 0;

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
  return group;
}

var KO_NAMES = {
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
  worldData = await d3.json('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson');
  var texture = await buildTexture();

  var geo = new THREE.SphereGeometry(1, 128, 128);
  var mat = new THREE.MeshPhongMaterial({
    map: texture,
    specular: new THREE.Color(0x111122),
    shininess: 5,
  });
  globeMesh = new THREE.Mesh(geo, mat);
  globe.add(globeMesh);

  atmosphere = buildAtmosphere(cfg.neonColor);
  globe.add(atmosphere);
  globe.add(buildInnerGlow());

  borderGroup = buildBorders(worldData, cfg.borderColor);
  globe.add(borderGroup);

  // Lights
  scene.add(new THREE.AmbientLight(0xaaaaaa, 1.2));
  [[5,3,5],[-5,3,5],[5,-3,5],[-5,-3,5],[0,0,-6],[0,5,0]].forEach(function(p) {
    var l = new THREE.DirectionalLight(0xffffff, 0.25);
    l.position.set(p[0], p[1], p[2]);
    scene.add(l);
  });

  animate();
}


// Zoom
var targetZ = 4.2, currentZ = 4.2;
var MIN_Z = 1.3, MAX_Z = 5.0;

// Drag
var isDragging = false;
var prevMouse = { x: 0, y: 0 };
var velocity = { x: 0, y: 0 };
var rotX = 0, rotY = 0;

// Tap detection
var raycaster = new THREE.Raycaster();
var tapStartPos = { x: 0, y: 0 };
function detectCountry(clientX, clientY) {
  var mouse = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  var hits = raycaster.intersectObject(globeMesh);
  if (!hits.length || !worldData) return null;

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
  velocity.x = dx * 0.005;
  velocity.y = dy * 0.005;
  rotY += dx * 0.005;
  rotX += dy * 0.005;
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
window.addEventListener('touchmove', function(e) {
  if (e.touches.length === 2) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (lastPinchDist !== null) {
      targetZ -= (dist - lastPinchDist) * 0.01;
      targetZ = Math.max(MIN_Z, Math.min(MAX_Z, targetZ));
    }
    lastPinchDist = dist;
    return;
  }
  if (!isDragging) return;
  var tdx = e.touches[0].clientX - prevMouse.x;
  var tdy = e.touches[0].clientY - prevMouse.y;
  rotY += tdx * 0.005;
  rotX += tdy * 0.005;
  rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

window.addEventListener('wheel', function(e) {
  e.preventDefault();
  targetZ += e.deltaY * 0.003;
  targetZ = Math.max(MIN_Z, Math.min(MAX_Z, targetZ));
}, { passive: false });

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  if (!isDragging && cfg.autoRotate) {
    velocity.x *= 0.95;
    velocity.y *= 0.95;
    rotY += 0.001;
  } else if (!isDragging) {
    velocity.x *= 0.95;
    velocity.y *= 0.95;
    rotY += velocity.y;
    rotX += velocity.x;
  }

  currentZ += (targetZ - currentZ) * 0.1;
  camera.position.z = currentZ;

  globe.rotation.y = rotY;
  globe.rotation.x = rotX;

  renderer.render(scene, camera);
}

window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 방문 국가 업데이트 수신
function handleVisitedMessage(msg) {
  if (msg.type === 'setVisitedCountries' && msg.countries) {
    visitedMap = {};
    msg.countries.forEach(function(c) {
      visitedMap[c.nameEn] = { color: c.color || null, mode: c.mode || null };
    });
    if (msg.displayMode) globeDisplayMode = msg.displayMode;
    if (msg.defaultColor) globeDefaultColor = msg.defaultColor;
    if (worldData && globeMesh) {
      loadAllFlags().then(function() {
        return buildTexture();
      }).then(function(tex) {
        globeMesh.material.map = tex;
        globeMesh.material.needsUpdate = true;
      });
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

export default function GlobeView({
  size = 300, fullscreen = false, onMessage,
  visitedCountries = [], displayMode = 'flag', defaultColor = '#BF85FC',
}: GlobeViewProps) {
  const globeHeight = useMemo(() => Dimensions.get('window').height * 0.75, []);
  const webViewRef = useRef<WebView>(null);

  const payload = useMemo(() => JSON.stringify({
    type: 'setVisitedCountries',
    countries: visitedCountries,
    displayMode,
    defaultColor,
  }), [visitedCountries, displayMode, defaultColor]);

  useEffect(() => {
    if (webViewRef.current && visitedCountries.length > 0) {
      webViewRef.current.postMessage(payload);
    }
  }, [payload]);

  const handleLoad = () => {
    if (webViewRef.current && visitedCountries.length > 0) {
      setTimeout(() => {
        webViewRef.current?.postMessage(payload);
      }, 2000);
    }
  };

  return (
    <View style={fullscreen ? [styles.containerFull, { height: globeHeight }] : [styles.container, { width: size, height: size }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        source={{ html: globeHTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        allowsInlineMediaPlayback={true}
        mixedContentMode="always"
        onMessage={onMessage}
        onLoad={handleLoad}
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
    overflow: 'hidden',
  },
});
