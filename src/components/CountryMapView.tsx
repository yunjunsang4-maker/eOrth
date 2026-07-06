import React, { useMemo , useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import COUNTRY_GEO from '../data/countryGeo';
import { D3_SRC } from '../data/vendorD3';



// 오프라인 번들용 d3 소스 (script 태그 조기 종료 방지 위해 </script 만 이스케이프)
const D3_INLINE = D3_SRC.replace(/<\/script/gi, '<\\/script');

// WebView(SVG)가 못 읽는 URI(ph://, assets-library://, content://)인지 판별
const needsMaterialize = (u?: string) => !!u && !/^(file:|https?:|data:)/.test(u);

interface Props {
  countryCode: string;
  onMessage?: (e: any) => void;
  recordedRegions?: { name: string; nameEn: string; photo?: string; mode?: 'color' | 'photo' }[];
  displayMode?: 'color' | 'photo';
  defaultColor?: string;
  countryName?: string;
  height?: number;
  /** true 면 부모의 남은 공간을 flex 로 채움 (height 무시) */
  fill?: boolean;
  /** 지역명 칩의 하단 오프셋(px) — 지도가 탭 바 뒤까지 채워질 때 칩을 위로 올리는 용도 */
  chipBottom?: number;
  /** 검색어 — 입력 시 해당 지역/도시가 속한 주로 확대·강조 */
  searchQuery?: string;
  /** 인기명소(기본 강조 지역) 표시 여부 */
  showPopular?: boolean;
}

export default function CountryMapView({
  countryCode,
  onMessage,
  recordedRegions = [],
  displayMode = 'color',
  defaultColor = '#BF85FC',
  countryName = '',
  height: heightProp,
  fill = false,
  chipBottom = 7,
  searchQuery = '',
  showPopular = false,
}: Props) {
  const height = useMemo(() => heightProp ?? Dimensions.get('window').height * 0.75, [heightProp]);
  const html = useMemo(() => buildHTML(countryCode, countryName, chipBottom, D3_INLINE), [countryCode, countryName, chipBottom]);
  const webViewRef = useRef<WebView>(null);

  // ph:// 등 WebView가 못 읽는 사진을 file:// 로 변환한 캐시 (원본 URI → file:// URI)
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});
  useEffect(() => {
    const targets = Array.from(
      new Set(
        recordedRegions
          .map(r => r.photo)
          .filter((u): u is string => needsMaterialize(u) && !photoCache[u as string])
      )
    );
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
       
      const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
      const updates: Record<string, string> = {};
      for (const uri of targets) {
        try {
          // 변형 없이 한 번 처리하면 ph:// 를 읽어 file:// 로 캐시에 기록한다(iCloud 오프로드 사진은 실패→건너뜀)
          const out = await ImageManipulator.manipulateAsync(uri, [], {});
          if (out?.uri) updates[uri] = out.uri;
        } catch {
          // 변환 불가(예: iCloud 미다운로드) — 건너뜀
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setPhotoCache(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [recordedRegions]);

  // 사진 URI를 변환본으로 치환한 지역 목록
  // ph:// 등 변환이 필요한데 아직(또는 끝내) 변환 못한 사진은 깨진 이미지 대신 색상으로 폴백(photo 제거)
  const resolvedRegions = useMemo(
    () => recordedRegions.map(r => {
      if (!r.photo) return r;
      if (photoCache[r.photo]) return { ...r, photo: photoCache[r.photo] };
      if (needsMaterialize(r.photo)) return { ...r, photo: undefined };
      return r;
    }),
    [recordedRegions, photoCache]
  );

  const payload = useMemo(() => JSON.stringify({
    type: 'setRecordedRegions',
    regions: resolvedRegions,
    displayMode,
    defaultColor,
  }), [resolvedRegions, displayMode, defaultColor]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(payload);
    }
  }, [payload]);

  // 검색어 → WebView 로 전달 (디바운스). 빈 문자열은 즉시 보내 강조/확대 해제
  useEffect(() => {
    const send = () => webViewRef.current?.postMessage(JSON.stringify({ type: 'searchRegion', query: searchQuery }));
    if (!searchQuery) { send(); return; }
    const t = setTimeout(send, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 인기명소 표시 여부 → WebView 전달
  useEffect(() => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'setPopular', value: showPopular }));
  }, [showPopular]);

  // 현재 RN 상태를 WebView 로 모두 전송 (기록/검색/인기명소)
  const sendState = () => {
    const wv = webViewRef.current;
    if (!wv) return;
    wv.postMessage(payload);
    wv.postMessage(JSON.stringify({ type: 'searchRegion', query: searchQuery }));
    wv.postMessage(JSON.stringify({ type: 'setPopular', value: showPopular }));
  };

  // WebView 가 render 완료 후 보내는 'ready' 를 받으면 현재 상태를 동기화 (500ms 타이머보다 견고)
  const handleMessage = (e: any) => {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (d?.type === 'ready') { sendState(); return; }
    } catch {}
    onMessage?.(e);
  };

  // 'ready' 신호를 못 받는 환경 대비 백업
  const handleLoad = () => {
    setTimeout(sendState, 500);
  };

  return (
    <View style={[styles.container, fill ? { flex: 1 } : { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        allowsInlineMediaPlayback
        mixedContentMode="always"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleMessage}
        onLoad={handleLoad}
      />
    </View>
  );
}

function buildHTML(code: string, countryName: string = '', chipBottom: number = 7, d3Src: string = '') {
  const geo = COUNTRY_GEO[code];
  if (!geo) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0A0B0F;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#FF3B30;font-size:14px}</style></head><body>지도 데이터가 없습니다</body></html>`;
  }

  const geoJSON = JSON.stringify(geo);

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0A0B0F;width:100vw;height:100vh;overflow:hidden}
#loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#A1A1B0;font-size:14px;gap:12px}
.spinner{width:28px;height:28px;border:3px solid #2E2E3B;border-top-color:#BF85FC;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#region-chip{position:fixed;left:7px;bottom:${chipBottom}px;min-width:100px;height:26px;padding:0 12px;border-radius:13px;background:rgba(10,11,15,0.5);display:none;align-items:center;justify-content:center;color:#E8E8F0;font-size:12px;font-weight:600;font-family:-apple-system,'Noto Sans KR',sans-serif;z-index:10;pointer-events:none}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>지도를 불러오는 중...</div>
<div id="region-chip"></div>
${d3Src ? '<script>' + d3Src + '</script>' : ''}
<script>
var CODE='${code}';
var COUNTRY_NAME=${JSON.stringify(countryName)};
var recordedRegions = [];
var displayMode = 'color';
var defaultColor = '#BF85FC';
var showPopular = false; // 인기명소(HL) 강조 표시 여부 — 앱 기본값(popularActive=false)과 일치, 초기 깜빡임/누락 방지
var BOTTOM_INSET = ${chipBottom}; // 하단 탭 바 가림 높이 — 투영을 보이는 영역 기준으로 중앙 정렬
function setRegionChip(name){var c=document.getElementById('region-chip');if(!c)return;if(name){c.textContent=name;c.style.display='flex';}else{c.style.display='none';}}

var svgElement = null;
var mainFeatures = null;
var insetFeatures = null;
var projectionPath = null;
var gElement = null;
var pathElements = null;          // 메인 채움+경계 selection
var insetPathElements = {};       // 인셋 채움+경계 selection
var highlight = [];
var insetBoxes = [];

// ── 검색(지역/도시 → 주 확대·강조) ──
var searchedRegion = null;   // 강조할 주의 NAME_1 (영문)
var zoomBehavior = null;     // d3.zoom 인스턴스 (render 에서 할당)
var maxZoom = 15;

// 도시/지역명 → 속한 주(NAME_1) 매핑. 키는 영문(normEn)·한글 모두 허용.
var CITY_TO_PROV = {
  JPN:{tokyocity:'Tokyo',osakacity:'Osaka',kyotocity:'Kyoto',fukuokacity:'Fukuoka',sapporo:'Hokkaido',naha:'Okinawa',yokohama:'Kanagawa',kobe:'Hyōgo',nagoya:'Aichi',hiroshimacity:'Hiroshima',sendai:'Miyagi',tokyo:'Tokyo',osaka:'Osaka',kyoto:'Kyoto',fukuoka:'Fukuoka',hiroshima:'Hiroshima','도쿄':'Tokyo','오사카':'Osaka','교토':'Kyoto','후쿠오카':'Fukuoka','삿포로':'Hokkaido','나하':'Okinawa','요코하마':'Kanagawa','고베':'Hyōgo','나고야':'Aichi','히로시마':'Hiroshima','센다이':'Miyagi'},
  CHN:{guangzhou:'Guangdong',shenzhen:'Guangdong',chengdu:'Sichuan',hangzhou:'Zhejiang',xian:'Shaanxi',wuhan:'Hubei',qingdao:'Shandong',nanjing:'Jiangsu','광저우':'Guangdong','선전':'Guangdong','청두':'Sichuan','항저우':'Zhejiang','시안':'Shaanxi','우한':'Hubei','칭다오':'Shandong','난징':'Jiangsu'},
  USA:{losangeles:'California',la:'California',sanfrancisco:'California',lasvegas:'Nevada',miami:'Florida',chicago:'Illinois',seattle:'Washington',honolulu:'Hawaii',newyork:'NewYork',newyorkcity:'NewYork',boston:'Massachusetts',washingtondc:'Maryland',dc:'Maryland',houston:'Texas',denver:'Colorado',philadelphia:'Pennsylvania',atlanta:'Georgia','로스앤젤레스':'California','엘에이':'California','샌프란시스코':'California','라스베이거스':'Nevada','마이애미':'Florida','시카고':'Illinois','시애틀':'Washington','호놀룰루':'Hawaii','뉴욕':'NewYork','뉴욕시':'NewYork','보스턴':'Massachusetts','워싱턴디씨':'Maryland','디씨':'Maryland','휴스턴':'Texas','덴버':'Colorado','필라델피아':'Pennsylvania','애틀랜타':'Georgia','애틀란타':'Georgia'},
  DEU:{munich:'Bayern',munchen:'Bayern',frankfurt:'Hessen',stuttgart:'Baden-Württemberg',cologne:'Nordrhein-Westfalen',koln:'Nordrhein-Westfalen',nordlingen:'Bayern',dresden:'Sachsen',dusseldorf:'Nordrhein-Westfalen',hannover:'Niedersachsen','뮌헨':'Bayern','프랑크푸르트':'Hessen','슈투트가르트':'Baden-Württemberg','쾰른':'Nordrhein-Westfalen','뇌르틀링겐':'Bayern','드레스덴':'Sachsen','뒤셀도르프':'Nordrhein-Westfalen','하노버':'Niedersachsen'},
  ESP:{granada:'Andalucía',malaga:'Andalucía',sevilla:'Andalucía',seville:'Andalucía',barcelona:'Cataluña',madrid:'ComunidaddeMadrid',valencia:'ComunidadValenciana',bilbao:'PaísVasco','그라나다':'Andalucía','말라가':'Andalucía','세비야':'Andalucía','바르셀로나':'Cataluña','마드리드':'ComunidaddeMadrid','발렌시아':'ComunidadValenciana','빌바오':'PaísVasco'},
  GBR:{london:'England',birmingham:'England',manchester:'England',liverpool:'England',leeds:'England',edinburgh:'Scotland',glasgow:'Scotland',cardiff:'Wales',belfast:'NorthernIreland',oxford:'England',bristol:'England','런던':'England','버밍엄':'England','맨체스터':'England','리버풀':'England','리즈':'England','에든버러':'Scotland','글래스고':'Scotland','카디프':'Wales','벨파스트':'NorthernIreland','옥스퍼드':'England','브리스톨':'England'},
  FRA:{paris:'Île-de-France',nice:"Provence-Alpes-Côted'Azur",lyon:'Auvergne-Rhône-Alpes',marseille:"Provence-Alpes-Côted'Azur",bordeaux:'Nouvelle-Aquitaine',strasbourg:'GrandEst',toulouse:'Occitanie',lille:'Hauts-de-France',nantes:'PaysdelaLoire',montpellier:'Occitanie',cannes:"Provence-Alpes-Côted'Azur",'파리':'Île-de-France','니스':"Provence-Alpes-Côted'Azur",'리옹':'Auvergne-Rhône-Alpes','마르세유':"Provence-Alpes-Côted'Azur",'보르도':'Nouvelle-Aquitaine','스트라스부르':'GrandEst','툴루즈':'Occitanie','릴':'Hauts-de-France','낭트':'PaysdelaLoire','몽펠리에':'Occitanie','칸':"Provence-Alpes-Côted'Azur"},
  ITA:{rome:'Lazio',roma:'Lazio',milan:'Lombardia',milano:'Lombardia',florence:'Toscana',firenze:'Toscana',venice:'Veneto',venezia:'Veneto',naples:'Campania',napoli:'Campania',verona:'Veneto',pisa:'Toscana',turin:'Piemonte',torino:'Piemonte',bologna:'Emilia-Romagna',genoa:'Liguria',genova:'Liguria',palermo:'Sicily',bari:'Apulia','로마':'Lazio','밀라노':'Lombardia','피렌체':'Toscana','베네치아':'Veneto','나폴리':'Campania','베로나':'Veneto','피사':'Toscana','토리노':'Piemonte','볼로냐':'Emilia-Romagna','제노바':'Liguria','팔레르모':'Sicily','바리':'Apulia'}
};

// 영문 정규화: 소문자 + 발음기호 제거 + 공백/하이픈/어퍼스트로피 제거
function normEn(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[\\s\\-'’.]/g,'');
}

// 검색어 → 속한 주(NAME_1) 해석
function resolveProvince(query){
  var q=(query||'').trim();
  if(!q) return null;
  var qn=normEn(q);
  var alias=CITY_TO_PROV[CODE]||{};
  if(alias[q]) return alias[q];
  if(alias[qn]) return alias[qn];
  var all=(mainFeatures||[]).concat(insetFeatures||[]);
  var match=null;
  for(var i=0;i<all.length;i++){
    var p=all[i].properties||{};
    var nl=p.NL_NAME_1||'', en=p.NAME_1||'';
    if(nl && nl.indexOf(q)>=0){match=en;break;}
    if(en && qn.length>=2 && normEn(en).indexOf(qn)>=0){match=en;break;}
  }
  if(!match) return null;
  // 매칭된 게 도시 피처면 그 도시가 속한 주로 치환
  if(alias[normEn(match)]) return alias[normEn(match)];
  return match;
}

// 해당 주로 부드럽게 확대 (inset 전용 주는 확대 생략, 강조만)
function zoomToProvince(prov){
  if(!projectionPath || !zoomBehavior || !svgElement) return;
  var feat=null;
  for(var i=0;i<(mainFeatures||[]).length;i++){
    if(mainFeatures[i].properties.NAME_1===prov){feat=mainFeatures[i];break;}
  }
  if(!feat) return;
  var b=projectionPath.bounds(feat);
  var dx=b[1][0]-b[0][0], dy=b[1][1]-b[0][1];
  var cx=(b[0][0]+b[1][0])/2, cy=(b[0][1]+b[1][1])/2;
  var W=window.innerWidth, H=window.innerHeight;
  if(dx<=0||dy<=0){return;}
  var scale=Math.max(1.2, Math.min(maxZoom, 0.55/Math.max(dx/W, dy/H)));
  var tx=W/2-scale*cx, ty=H/2-scale*cy;
  svgElement.transition().duration(650).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
}

// 좌표가 속한 주(province) 찾기 — 도시 피처면 상위 주로 환원
function pipRing(pt,ring){var ins=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>pt[1])!=(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
function featHas(f,pt){var g=f.geometry;if(!g)return false;var polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;for(var i=0;i<polys.length;i++){if(pipRing(pt,polys[i][0])){var hole=false;for(var k=1;k<polys[i].length;k++){if(pipRing(pt,polys[i][k])){hole=true;break;}}if(!hole)return true;}}return false;}
function provinceAt(pt){
  var all=(mainFeatures||[]).concat(insetFeatures||[]);
  for(var i=0;i<all.length;i++){var n=all[i].properties.NAME_1||''; if(!isCity(n)&&featHas(all[i],pt))return n;}     // 주 우선
  for(var i=0;i<all.length;i++){var n=all[i].properties.NAME_1||''; if(featHas(all[i],pt))return prefOf(n);}         // 도시면 상위 주로
  return null;
}
// 찾은 주로 확대·강조 (공통)
function applyProvince(prov){
  if(!prov) return;
  searchedRegion=prov;
  var nl=prov;
  for(var i=0;i<(mainFeatures||[]).length;i++){if(mainFeatures[i].properties.NAME_1===prov){nl=mainFeatures[i].properties.NL_NAME_1||prov;break;}}
  setRegionChip(nl);
  zoomToProvince(prov);
  updateMap();
}
// 로컬 매칭 실패 시 OSM(Nominatim) 지오코딩 폴백 — 인기명소가 아닌 시도 검색되게
var ISO2={JPN:'jp',CHN:'cn',USA:'us',DEU:'de',ESP:'es',GBR:'gb',FRA:'fr',ITA:'it'};
var geoCache={};
function geocodeFallback(query){
  if(geoCache.hasOwnProperty(query)){ if(geoCache[query]) applyProvince(geoCache[query]); else setRegionChip('검색 결과 없음'); return; }
  var cc=ISO2[CODE]||'';
  var url='https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q='+encodeURIComponent(query)+(cc?'&countrycodes='+cc:'');
  fetch(url).then(function(r){return r.json();}).then(function(arr){
    var prov=null;
    if(arr&&arr.length){var lon=parseFloat(arr[0].lon),lat=parseFloat(arr[0].lat); if(!isNaN(lon)&&!isNaN(lat)) prov=provinceAt([lon,lat]);}
    geoCache[query]=prov;
    if(prov) applyProvince(prov);
    else setRegionChip('검색 결과 없음');
  }).catch(function(){ setRegionChip('검색 오류 · 네트워크를 확인하세요'); });
}
// 검색 실행
function doSearch(query){
  var q=(query||'').trim();
  if(q.length===0){
    searchedRegion=null;
    if(zoomBehavior&&svgElement){svgElement.transition().duration(450).call(zoomBehavior.transform, d3.zoomIdentity);}
    setRegionChip('');
    updateMap();
    return;
  }
  var prov=resolveProvince(q);
  if(prov){ applyProvince(prov); return; }       // 로컬(인기명소·주 이름) 즉시 매칭 (한 글자도 시도)
  if(q.length<2){ setRegionChip('두 글자 이상 입력하세요'); return; } // 한 글자 + 미매칭 → 안내
  geocodeFallback(q);                            // 실패 시 온라인 지오코딩으로 시 단위 검색
}

function loadD3(cb){
  var u=['https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js','https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js'];
  var i=0;
  function next(){
    if(i>=u.length){document.getElementById('loading').innerHTML='<span style="color:#FF3B30">라이브러리 로드 실패</span>';return;}
    var s=document.createElement('script');s.src=u[i];
    s.onload=function(){if(typeof d3!=='undefined')cb();else{i++;next();}};
    s.onerror=function(){i++;next();};
    document.head.appendChild(s);
  }
  next();
}
function boot(){
  var geo=${geoJSON};
  document.getElementById('loading').style.display='none';
  render(geo);
}
// 오프라인 번들 d3가 이미 로드돼 있으면 바로 시작, 아니면 CDN 폴백
if(typeof d3!=='undefined'){ boot(); } else { loadD3(boot); }

// ── 채움색 ──
function getFill(d){
  var nameEn=d.properties.NAME_1||'';
  var active=activeRecordFor(nameEn);
  if(active){
    var mode=active.mode||displayMode;
    if(mode==='photo'&&active.photo){
      return 'url(#pat-'+(active.nameEn||nameEn).replace(/[^a-zA-Z0-9]/g,'')+')';
    }
    return active.color||defaultColor||'#403257'; // 지역별 색상 우선, 없으면 국가 기본색
  }
  if(nameEn===searchedRegion) return '#22323d'; // 검색 강조(다크 시안)
  return '#191920'; // 미방문
}
// 주 안에 별도 폴리곤(선)으로 들어있는 '도시' 피처인지 판별 (CITY_TO_PROV 에 도시→다른 주 매핑이 있으면 도시)
function isCity(nameEn){
  var m=CITY_TO_PROV[CODE];
  if(!m) return false;
  var p=m[normEn(nameEn)];
  return !!p && p!==nameEn;
}
// 도시면 상위 현(주) 이름, 아니면 자기 자신
function prefOf(nameEn){
  var m=CITY_TO_PROV[CODE];
  if(m){ var p=m[normEn(nameEn)]; if(p && p!==nameEn) return p; }
  return nameEn;
}
// 이 지역(또는 그 상위 현)에 기록이 있으면 해당 기록 반환.
// 인기명소 도시에 기록하면 그 도시가 속한 '현 전체'가 활성화되도록 상위 현 기준으로 매칭한다.
function activeRecordFor(nameEn){
  var pref=prefOf(nameEn);
  for(var i=0;i<recordedRegions.length;i++){
    if(prefOf(recordedRegions[i].nameEn)===pref) return recordedRegions[i];
  }
  return null;
}
// 숨긴 도시(인기명소 OFF)는 탭을 안 받게 해서 아래 주가 선택되도록
function regionPointer(d){
  var n=d.properties.NAME_1||'';
  return (isCity(n) && !showPopular) ? 'none' : 'auto';
}
// 숨긴 도시는 채움도 투명 처리(아래 주 색이 그대로 비치도록)
function regionFill(d){
  var n=d.properties.NAME_1||'';
  if(isCity(n) && !showPopular) return 'none';
  return getFill(d);
}
// ── 경계선 색·두께 (스케일 스트로크: 어긋난 인접 경계를 같은 색으로 합쳐 틈/이중선 제거) ──
function emphStroke(d){
  var n=d.properties.NAME_1||'';
  var city=isCity(n);
  if(city && !showPopular) return 'none';   // 인기명소 OFF: 도시 선 숨김(주에 녹아듦)
  if(n===searchedRegion) return '#00D8F3';
  var a=activeRecordFor(n);
  if(a) return '#7856B0';
  if(city) return '#BF85FC';                // 인기명소 ON: 도시 강조(보라 네온)
  if(showPopular && highlight.indexOf(n)>=0) return '#BF85FC'; // 인기명소 현(예: 오키나와 전체)도 동일 강조
  return '#3E3155';
}
// 두께는 '지오 단위'라 줌에 따라 커지며, 어긋난 인접 경계를 같은 색으로 덮어 합친다.
// 이중선/틈이 남으면 아래 값을 키우고, 고배율에서 너무 두꺼우면 줄이면 된다.
function emphWidth(d){
  var n=d.properties.NAME_1||'';
  var city=isCity(n);
  if(city && !showPopular) return 0;        // 인기명소 OFF: 도시 선 숨김
  if(n===searchedRegion) return 0.6;
  var a=activeRecordFor(n);
  if(a) return 0.45;
  if(city) return 0.5;                       // 인기명소 ON: 도시 강조
  if(showPopular && highlight.indexOf(n)>=0) return 0.5;
  return 0.35;
}
// ── 구역 탭 ──
function onRegionClick(ev,d){
  d3.select(this).attr('fill','#4E3D6B');
  var self=this;
  setTimeout(function(){d3.select(self).attr('fill',getFill(d));},350);
  var name=d.properties.NL_NAME_1||d.properties.NAME_1||'';
  var nameEn=d.properties.NAME_1||'';
  setRegionChip(name);
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'regionTapped',region:name,regionEn:nameEn,countryCode:CODE}));
  }
}
// 피처 면적(절대값 합) — 그리기 순서 정렬용
function featArea(f){
  var polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  var s=0;
  for(var i=0;i<polys.length;i++){var r=polys[i][0];var a=0;for(var k=0;k<r.length-1;k++)a+=r[k][0]*r[k+1][1]-r[k+1][0]*r[k][1];s+=Math.abs(a/2);}
  return s;
}
// 한 그룹(메인/인셋) 렌더: 채움 + 스케일 경계 스트로크(어긋난 경계 합침). {fill} 반환
// 면적 큰 지역부터 그려, 작은 지역(브레멘 같은 enclave·도시)이 위에 와서 가려지지 않게 한다.
function drawGroup(parent, features, pathGen, cls){
  var feats=features.slice().sort(function(a,b){return featArea(b)-featArea(a);});
  var fillSel=parent.selectAll('path.fill-'+cls).data(feats).enter().append('path')
    .attr('class','fill-'+cls).attr('d',pathGen)
    .attr('fill',regionFill)
    .attr('stroke',emphStroke).attr('stroke-width',emphWidth)
    .attr('stroke-linejoin','round').attr('stroke-linecap','round')
    .attr('shape-rendering','geometricPrecision')
    .style('cursor','pointer').style('pointer-events',regionPointer).on('click',onRegionClick);
  return {fill:fillSel};
}
function render(geo){
  var W=window.innerWidth,H=window.innerHeight,PAD=24;
  var svg=d3.select('body').append('svg').attr('width',W).attr('height',H);
  svgElement = svg;
  var insets=['Alaska','Hawaii','Guam','Honolulu'];
  mainFeatures=geo.features;
  insetFeatures=[];
  if(CODE==='USA'){
    mainFeatures=geo.features.filter(function(f){return insets.indexOf(f.properties.NAME_1)<0;});
    // Honolulu는 별도 NAME_1 피처 — 본토에서 빼고 인셋에도 안 넣으면 지도에서 완전히 사라진다.
    // 하와이 인셋 박스에 함께 그린다(아래 box 필터 참조).
    insetFeatures=geo.features.filter(function(f){return f.properties.NAME_1==='Alaska'||f.properties.NAME_1==='Hawaii'||f.properties.NAME_1==='Honolulu'||f.properties.NAME_1==='Guam';});
  }
  var mainGeo={type:'FeatureCollection',features:mainFeatures};
  // 하단 탭 바가 가리는 만큼 빼서, 지도가 '보이는 영역' 중앙에 오도록 한다
  var fitBottom=H-PAD-(BOTTOM_INSET||0);
  if(fitBottom<=PAD+40) fitBottom=H-PAD; // 비정상값 방어
  var proj=d3.geoMercator().fitExtent([[PAD,PAD],[W-PAD,fitBottom]],mainGeo);
  var path=d3.geoPath().projection(proj);
  projectionPath = path;
  var g=svg.append('g');
  gElement = g;
  var HL={
    JPN:['TokyoCity','OsakaCity','KyotoCity','FukuokaCity','Sapporo','Yokohama','Nagoya','Kobe','HiroshimaCity','Sendai','Okinawa'],
    CHN:['Beijing','Shanghai','Chongqing','Tianjin','Chengdu','Guangzhou','Shenzhen','Hangzhou','Xian','Wuhan','Qingdao','Nanjing'],
    USA:['NewYorkCity','LosAngeles','SanFrancisco','LasVegas','Miami','Chicago','Seattle','Honolulu','Boston','WashingtonDC','Houston','Denver','Philadelphia','Atlanta','Alaska','Hawaii','Guam'],
    DEU:['Berlin','Hamburg','Munich','Frankfurt','Stuttgart','Cologne','Nordlingen','Dresden','Dusseldorf','Hannover'],
    ESP:['Madrid','Barcelona','Sevilla','Granada','M\\xe1laga','Valencia','Bilbao','ComunidaddeMadrid','IslasBaleares'],
    GBR:['London','Birmingham','Manchester','Liverpool','Leeds','Edinburgh','Glasgow','Cardiff','Belfast','Oxford','Bristol'],
    FRA:['Paris','Nice','Lyon','Marseille','Bordeaux','Strasbourg','Toulouse','Lille','Nantes','Montpellier','Cannes'],
    ITA:['Rome','Milan','Florence','Venice','Naples','Verona','Pisa','Turin','Bologna','Genoa','Palermo','Bari']
  };
  highlight=HL[CODE]||[];

  // 메인 지도 — 채움 + 스케일 경계 스트로크(어긋난 인접 경계를 하나로 합침)
  var mainGrp=drawGroup(g, mainFeatures, path, 'm');
  pathElements=mainGrp.fill;

  if(CODE==='USA'&&insetFeatures.length>0){
    // 인셋도 '보이는 영역(VH)' 기준으로 배치 — 본토 중앙 정렬에 맞춰 탭 바 위로
    var VH=H-(BOTTOM_INSET||0);
    insetBoxes=[
      {name:'Alaska',x:PAD,y:VH*0.62,w:W*0.22,h:VH*0.28},
      {name:'Hawaii',x:PAD+W*0.24,y:VH*0.72,w:W*0.15,h:VH*0.18},
      {name:'Guam',x:PAD+W*0.41,y:VH*0.75,w:W*0.08,h:VH*0.15}
    ];
    insetBoxes.forEach(function(box){
      var feat=insetFeatures.filter(function(f){
        return f.properties.NAME_1===box.name || (box.name==='Hawaii' && f.properties.NAME_1==='Honolulu');
      });
      if(feat.length===0)return;
      var fc={type:'FeatureCollection',features:feat};
      var ip=d3.geoMercator().fitExtent([[box.x+4,box.y+4],[box.x+box.w-4,box.y+box.h-4]],fc);
      var ipath=d3.geoPath().projection(ip);
      g.append('rect').attr('x',box.x).attr('y',box.y).attr('width',box.w).attr('height',box.h)
        .attr('rx',6).attr('fill','#191920').attr('stroke','#3E3155').attr('stroke-width',0.8);
      g.append('text').attr('x',box.x+box.w/2).attr('y',box.y+14).attr('text-anchor','middle')
        .attr('fill','#A1A1B0').attr('font-size','10px').text(feat[0].properties.NL_NAME_1);
      var grp=drawGroup(g, feat, ipath, box.name);
      insetPathElements[box.name]=grp.fill;
    });
  }
  maxZoom=(CODE==='USA')?30:15;
  zoomBehavior=d3.zoom().scaleExtent([1,maxZoom])
    .on('zoom',function(ev){g.attr('transform',ev.transform);});
  svg.call(zoomBehavior);

  setRegionChip('');
  updateMap();
  // RN 에 준비 완료 알림 → 현재 기록/검색/인기명소 상태를 받아옴
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));}
}

function updateMap() {
  if (!svgElement) return;
  
  svgElement.selectAll('defs').remove();
  var defs = svgElement.append('defs');
  
  recordedRegions.forEach(function(r) {
    if (r.photo) {
      var patId = 'pat-' + r.nameEn.replace(/[^a-zA-Z0-9]/g, '');
      var pat = defs.append('pattern')
        .attr('id', patId)
        .attr('patternContentUnits', 'objectBoundingBox')
        .attr('width', 1)
        .attr('height', 1);
      pat.append('image')
        .attr('href', r.photo)
        .attr('xlink:href', r.photo)
        .attr('preserveAspectRatio', 'xMidYMid slice')
        .attr('width', 1)
        .attr('height', 1);
    }
  });

  // 채움색 + 경계선(색/두께) + 탭 가능 여부 갱신
  if (pathElements) pathElements.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', emphWidth).style('pointer-events', regionPointer);

  Object.keys(insetPathElements).forEach(function(key) {
    var sel = insetPathElements[key];
    if (sel) sel.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', emphWidth).style('pointer-events', regionPointer);
  });
}

function handleNativeMessage(e){
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (msg.type === 'setRecordedRegions') {
      recordedRegions = msg.regions || [];
      displayMode = msg.displayMode || 'color';
      defaultColor = msg.defaultColor || '#BF85FC';
      updateMap();
    } else if (msg.type === 'searchRegion') {
      doSearch(msg.query || '');
    } else if (msg.type === 'setPopular') {
      showPopular = !!msg.value;
      updateMap();
    }
  } catch(e) {}
}
window.addEventListener('message', handleNativeMessage);
document.addEventListener('message', handleNativeMessage);
<\/script>
</body></html>`;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
