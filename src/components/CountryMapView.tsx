import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import COUNTRY_GEO from '../data/countryGeo';

import { useRef, useEffect } from 'react';

interface Props {
  countryCode: string;
  onMessage?: (e: any) => void;
  recordedRegions?: Array<{ name: string; nameEn: string; photo?: string; mode?: 'color' | 'photo' }>;
  displayMode?: 'color' | 'photo';
  defaultColor?: string;
}

export default function CountryMapView({
  countryCode,
  onMessage,
  recordedRegions = [],
  displayMode = 'color',
  defaultColor = '#BF85FC',
}: Props) {
  const height = useMemo(() => Dimensions.get('window').height * 0.75, []);
  const html = useMemo(() => buildHTML(countryCode), [countryCode]);
  const webViewRef = useRef<WebView>(null);

  const payload = useMemo(() => JSON.stringify({
    type: 'setRecordedRegions',
    regions: recordedRegions,
    displayMode,
    defaultColor,
  }), [recordedRegions, displayMode, defaultColor]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(payload);
    }
  }, [payload]);

  const handleLoad = () => {
    if (webViewRef.current && recordedRegions.length > 0) {
      setTimeout(() => {
        webViewRef.current?.postMessage(payload);
      }, 500);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
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
        onMessage={onMessage}
        onLoad={handleLoad}
      />
    </View>
  );
}

function buildHTML(code: string) {
  const geo = COUNTRY_GEO[code];
  if (!geo) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0A0A0F;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#FF3B30;font-size:14px}</style></head><body>지도 데이터가 없습니다</body></html>`;
  }

  const geoJSON = JSON.stringify(geo);

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0A0A0F;width:100vw;height:100vh;overflow:hidden}
#loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#A1A1B0;font-size:14px;gap:12px}
.spinner{width:28px;height:28px;border:3px solid #2E2E3B;border-top-color:#BF85FC;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>지도를 불러오는 중...</div>
<script>
var CODE='${code}';
var recordedRegions = [];
var displayMode = 'color';
var defaultColor = '#BF85FC';

var svgElement = null;
var mainFeatures = null;
var insetFeatures = null;
var projectionPath = null;
var gElement = null;
var pathElements = null;
var insetPathElements = {};
var highlight = [];
var insetBoxes = [];

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
loadD3(function(){
  var geo=${geoJSON};
  document.getElementById('loading').style.display='none';
  render(geo);
});
function render(geo){
  var W=window.innerWidth,H=window.innerHeight,PAD=24;
  var svg=d3.select('body').append('svg').attr('width',W).attr('height',H);
  svgElement = svg;
  var insets=['Alaska','Hawaii','Guam','Honolulu'];
  mainFeatures=geo.features;
  insetFeatures=[];
  if(CODE==='USA'){
    mainFeatures=geo.features.filter(function(f){return insets.indexOf(f.properties.NAME_1)<0;});
    insetFeatures=geo.features.filter(function(f){return f.properties.NAME_1==='Alaska'||f.properties.NAME_1==='Hawaii'||f.properties.NAME_1==='Guam';});
  }
  var mainGeo={type:'FeatureCollection',features:mainFeatures};
  var proj=d3.geoMercator().fitExtent([[PAD,PAD],[W-PAD,H-PAD]],mainGeo);
  var path=d3.geoPath().projection(proj);
  projectionPath = path;
  var g=svg.append('g');
  gElement = g;
  var HL={
    JPN:['Tokyo','Osaka','Kyoto','Fukuoka','Hokkaido','Okinawa'],
    CHN:['Beijing','Shanghai','Chongqing','Tianjin','Chengdu','Guangzhou','Shenzhen'],
    USA:['NewYork','LosAngeles','SanFrancisco','LasVegas','Miami','Chicago','Seattle','Honolulu','Alaska','Hawaii','Guam'],
    DEU:['Berlin','Hamburg','Munich','Frankfurt','Stuttgart','Cologne','Nordlingen'],
    ESP:['Madrid','Barcelona','Sevilla','Granada','M\\xe1laga','Valencia','Bilbao','ComunidaddeMadrid','IslasBaleares'],
    GBR:[],
    FRA:['Paris','Nice','Lyon','Marseille','Bordeaux','Strasbourg','Toulouse'],
    ITA:['Rome','Milan','Florence','Venice','Naples','Verona','Pisa']
  };
  highlight=HL[CODE]||[];
  
  function getFill(d) {
    var nameEn = d.properties.NAME_1 || '';
    var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
    if (active) {
      var mode = active.mode || displayMode;
      if (mode === 'photo' && active.photo) {
        var patId = 'pat-' + nameEn.replace(/[^a-zA-Z0-9]/g, '');
        return 'url(#' + patId + ')';
      }
      return defaultColor;
    }
    var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
    return isHighlighted ? '#3A2E5C' : '#2E2E3B';
  }

  function bindPaths(sel){
    sel.attr('fill',getFill)
    .attr('stroke',function(d){
      var nameEn = d.properties.NAME_1 || '';
      var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
      if (active) return '#FFFFFF';
      var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
      return isHighlighted ? '#BF85FC' : '#7B5CF0';
    })
    .attr('stroke-width',function(d){
      var nameEn = d.properties.NAME_1 || '';
      var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
      if (active) return 1.5;
      var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
      return isHighlighted ? 1.2 : 0.3;
    })
    .attr('stroke-linejoin','round').attr('stroke-linecap','round')
    .attr('vector-effect','non-scaling-stroke').style('cursor','pointer')
    .on('click',function(ev,d){
      d3.select(this).attr('fill','#BF85FC');
      var self=this;
      setTimeout(function(){d3.select(self).attr('fill',getFill(d));},350);
      var name=d.properties.NL_NAME_1||d.properties.NAME_1||'';
      var nameEn=d.properties.NAME_1||'';
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:'regionTapped',region:name,regionEn:nameEn,countryCode:CODE
        }));
      }
    });
  }
  pathElements = g.selectAll('path.region-path')
    .data(mainFeatures)
    .enter()
    .append('path')
    .attr('class', 'region-path')
    .attr('d',path);
  bindPaths(pathElements);

  if(highlight.length>0){
    g.selectAll('.hl').data(mainFeatures.filter(function(f){return highlight.indexOf(f.properties.NAME_1)>=0;}))
      .enter().append('path').attr('class','hl').attr('d',path)
      .attr('fill','none').attr('stroke','#BF85FC').attr('stroke-width',1.2)
      .attr('stroke-linejoin','round').attr('stroke-linecap','round')
      .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
  }
  if(CODE==='USA'&&insetFeatures.length>0){
    insetBoxes=[
      {name:'Alaska',x:PAD,y:H*0.62,w:W*0.22,h:H*0.28},
      {name:'Hawaii',x:PAD+W*0.24,y:H*0.72,w:W*0.15,h:H*0.18},
      {name:'Guam',x:PAD+W*0.41,y:H*0.75,w:W*0.08,h:H*0.15}
    ];
    insetBoxes.forEach(function(box){
      var feat=insetFeatures.filter(function(f){return f.properties.NAME_1===box.name;});
      if(feat.length===0)return;
      var fc={type:'FeatureCollection',features:feat};
      var ip=d3.geoMercator().fitExtent([[box.x+4,box.y+4],[box.x+box.w-4,box.y+box.h-4]],fc);
      var ipath=d3.geoPath().projection(ip);
      g.append('rect').attr('x',box.x).attr('y',box.y).attr('width',box.w).attr('height',box.h)
        .attr('rx',6).attr('fill','#15151F').attr('stroke','#2E2E3B').attr('stroke-width',0.8);
      g.append('text').attr('x',box.x+box.w/2).attr('y',box.y+14).attr('text-anchor','middle')
        .attr('fill','#A1A1B0').attr('font-size','10px').text(feat[0].properties.NL_NAME_1);
      
      var insetPaths = g.selectAll('.inset-'+box.name)
        .data(feat)
        .enter()
        .append('path')
        .attr('class','inset-'+box.name)
        .attr('d',ipath);
      bindPaths(insetPaths);
      insetPathElements[box.name] = insetPaths;
      
      g.selectAll('.ihl-'+box.name).data(feat.filter(function(f){return highlight.indexOf(f.properties.NAME_1)>=0;}))
        .enter().append('path').attr('class','ihl-'+box.name).attr('d',ipath)
        .attr('fill','none').attr('stroke','#BF85FC').attr('stroke-width',1.2)
        .attr('stroke-linejoin','round').attr('stroke-linecap','round')
        .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
    });
  }
  var maxZ=(CODE==='USA')?30:15;
  var zoom=d3.zoom().scaleExtent([1,maxZ])
    .on('zoom',function(ev){g.attr('transform',ev.transform);});
  svg.call(zoom);
  
  updateMap();
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
        .attr('preserveAspectRatio', 'xMidYMid slice')
        .attr('width', 1)
        .attr('height', 1);
    }
  });

  function getFill(d) {
    var nameEn = d.properties.NAME_1 || '';
    var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
    if (active) {
      var mode = active.mode || displayMode;
      if (mode === 'photo' && active.photo) {
        var patId = 'pat-' + nameEn.replace(/[^a-zA-Z0-9]/g, '');
        return 'url(#' + patId + ')';
      }
      return defaultColor;
    }
    var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
    return isHighlighted ? '#3A2E5C' : '#2E2E3B';
  }

  function getStroke(d) {
    var nameEn = d.properties.NAME_1 || '';
    var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
    if (active) return '#FFFFFF';
    var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
    return isHighlighted ? '#BF85FC' : '#7B5CF0';
  }

  function getStrokeWidth(d) {
    var nameEn = d.properties.NAME_1 || '';
    var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
    if (active) return 1.5;
    var isHighlighted = highlight.indexOf(nameEn) >= 0 && !active;
    return isHighlighted ? 1.2 : 0.3;
  }

  if (pathElements) {
    pathElements
      .attr('fill', getFill)
      .attr('stroke', getStroke)
      .attr('stroke-width', getStrokeWidth);
  }

  Object.keys(insetPathElements).forEach(function(key) {
    var sel = insetPathElements[key];
    if (sel) {
      sel
        .attr('fill', getFill)
        .attr('stroke', getStroke)
        .attr('stroke-width', getStrokeWidth);
    }
  });

  gElement.selectAll('.hl')
    .style('display', function(d) {
      var nameEn = d.properties.NAME_1 || '';
      var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
      return active ? 'none' : 'block';
    });

  if (CODE === 'USA') {
    insetBoxes.forEach(function(box) {
      gElement.selectAll('.ihl-' + box.name)
        .style('display', function(d) {
          var nameEn = d.properties.NAME_1 || '';
          var active = recordedRegions.find(function(r) { return r.nameEn === nameEn; });
          return active ? 'none' : 'block';
        });
    });
  }
}

window.addEventListener('message', function(e) {
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (msg.type === 'setRecordedRegions') {
      recordedRegions = msg.regions || [];
      displayMode = msg.displayMode || 'color';
      defaultColor = msg.defaultColor || '#BF85FC';
      updateMap();
    }
  } catch(e) {}
});
document.addEventListener('message', function(e) {
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (msg.type === 'setRecordedRegions') {
      recordedRegions = msg.regions || [];
      displayMode = msg.displayMode || 'color';
      defaultColor = msg.defaultColor || '#BF85FC';
      updateMap();
    }
  } catch(e) {}
});
<\/script>
</body></html>`;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
