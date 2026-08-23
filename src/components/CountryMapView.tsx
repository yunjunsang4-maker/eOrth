import React, { useMemo , useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { getCountryGeo } from '../data/countryGeo';
import { resolveRegionCode } from '../utils/regionKeyMigration';
import { D3_SRC } from '../data/vendorD3';
import { imageToDataUri } from '../utils/imageCompress';



// 오프라인 번들용 d3 소스 (script 태그 조기 종료 방지 위해 </script 만 이스케이프)
const D3_INLINE = D3_SRC.replace(/<\/script/gi, '<\\/script');

// WebView(SVG)가 못 읽는 URI인지 판별 — file:// 도 포함이다.
// inline HTML(source={{html}})로 뜬 WKWebView는 비-file origin이라 file:// 서브리소스
// 로드를 차단한다(지구본이 같은 이유로 imageToDataUri를 쓴다 — imageCompress.ts 주석 참고).
// http/data 만 그대로 그릴 수 있다.
const needsMaterialize = (u?: string) => !!u && !/^(https?:|data:)/.test(u);

// HTML 본문에 그대로 박히는 문구 이스케이프 (번역문에 <, & 가 들어와도 마크업이 깨지지 않게)
const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Props {
  countryCode: string;
  onMessage?: (e: any) => void;
  // mode·color 필드는 퍼즐 도입(색 활성화 폐지)으로 제거 — 방문 지역은 사진 패턴 또는 기본 바탕뿐
  recordedRegions?: { name: string; nameEn: string; photo?: string }[];
  defaultColor?: string;
  countryName?: string;
  height?: number;
  /** true 면 부모의 남은 공간을 flex 로 채움 (height 무시) */
  fill?: boolean;
  /** 지역명 칩의 하단 오프셋(px) — 지도가 탭 바 뒤까지 채워질 때 칩을 위로 올리는 용도 */
  chipBottom?: number;
  /** 검색어 — 입력 시 해당 지역/도시가 속한 주로 확대·강조 */
  searchQuery?: string;
  /** 인기명소 강조 — 명소 도시가 속한 주들을 스킨 색 테두리로 강조.
      (구 GADM 데이터는 도시 폴리곤 자체를 그렸지만 NE에는 도시 피처가 없어 상위 주 강조로 동작) */
  showPopular?: boolean;
  /** 대륙 표시 모드. 'puzzle'이면 puzzleImage 한 장을 지역 경계로 쪼개 보여준다.
      'color'는 구버전 저장값 허용치 — 'photo'와 동일하게 동작한다. */
  displayMode?: 'color' | 'photo' | 'puzzle';
  /** 퍼즐 원본 그림 (data URI 또는 file://). puzzle 모드에서만 쓴다 */
  puzzleImage?: string;
  /** 전 지역 방문 여부 — RN(regionProgress)이 계산한다. WebView는 전이 감지·연출만 담당 */
  puzzleComplete?: boolean;
  /** 지구본 스킨 강조색(hex) — 경계선·외곽선·방문 테두리 색을 이 색의 밝기 배율로 파생한다.
      기본값은 aurora 보라(기존 하드코딩 값과 동일하게 나온다) */
  accentColor?: string;
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
  puzzleImage,
  puzzleComplete = false,
  accentColor = '#BF85FC',
}: Props) {
  const { t, i18n } = useTranslation();
  const height = useMemo(() => heightProp ?? Dimensions.get('window').height * 0.75, [heightProp]);
  // WebView 안에는 i18next가 없다 — 문구를 RN에서 번역해 넣고, 언어가 바뀌면 HTML을 다시 만든다
  const labels = useMemo<MapLabels>(() => ({
    loading: t('countryMap.loading'),
    noSearchResult: t('countryMap.noSearchResult'),
    minTwoChars: t('countryMap.minTwoChars'),
    searchError: t('countryMap.searchError'),
    libLoadFail: t('countryMap.libLoadFail'),
    noData: t('countryMap.noData'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, i18n.language]);
  // 스킨 강조색 hex → RGB (WebView가 선 색을 밝기 배율로 파생할 때 쓴다)
  const accentRgb = useMemo<[number, number, number]>(() => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(accentColor || '');
    const n = m ? parseInt(m[1], 16) : 0xbf85fc;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }, [accentColor]);
  // accentRgb가 바뀌면 HTML을 다시 만든다(WebView 리로드) — 스킨 변경은 드물어 허용
  const html = useMemo(() => buildHTML(countryCode, countryName, chipBottom, D3_INLINE, labels, accentRgb), [countryCode, countryName, chipBottom, labels, accentRgb]);
  const webViewRef = useRef<WebView>(null);

  // 사진 URI(file://·ph:// 등)를 data URI 로 변환한 캐시 (원본 URI → data URI).
  // 예전엔 ph:// 만 file:// 로 바꿔 넣었는데, inline HTML WebView는 file:// 자체를 못
  // 읽어 실기기에서 새로 고른 사진(Documents 영속본)이 지도에 전혀 반영되지 않았다.
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});
  // 국가가 바뀌면 캐시를 비운다 — 컴포넌트가 리마운트 없이 나라만 갈아타므로, 안 비우면
  // 이전 나라들의 data URI(장당 수백 KB)가 세션 내내 누적된다. WebView는 어차피 새 HTML로 리로드된다.
  useEffect(() => { setPhotoCache({}); }, [countryCode]);
  useEffect(() => {
    const targets = Array.from(
      new Set(
        [...recordedRegions.map(r => r.photo), puzzleImage]
          .filter((u): u is string => needsMaterialize(u) && !photoCache[u as string])
      )
    );
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const uri of targets) {
        // 퍼즐 그림은 지도 전면을 덮으니 1024px, 지역 패턴 채움은 조각 크기라 640px이면 충분
        const d = await imageToDataUri(uri, uri === puzzleImage ? 1024 : 640, 0.7);
        if (cancelled) return;
        if (d) updates[uri] = d; // 변환 불가(예: iCloud 오프로드) — 건너뜀 → 색 폴백
      }
      if (!cancelled && Object.keys(updates).length) {
        setPhotoCache(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [recordedRegions, puzzleImage]);

  // 사진 URI를 data URI 변환본으로 치환한 지역 목록
  // 변환이 필요한데(file://·ph:// 등) 아직(또는 끝내) 변환 못한 사진은 깨진 이미지 대신 색상으로 폴백(photo 제거)
  const resolvedRegions = useMemo(
    () => recordedRegions.map(r => {
      if (!r.photo) return r;
      if (photoCache[r.photo]) return { ...r, photo: photoCache[r.photo] };
      if (needsMaterialize(r.photo)) return { ...r, photo: undefined };
      return r;
    }),
    [recordedRegions, photoCache]
  );

  // 퍼즐 그림도 같은 규칙: file://·ph:// 등은 data URI 변환본으로, 변환 전/실패면 undefined(사진 모드 폴백)
  const resolvedPuzzleImage = useMemo(() => {
    if (!puzzleImage) return undefined;
    if (photoCache[puzzleImage]) return photoCache[puzzleImage];
    if (needsMaterialize(puzzleImage)) return undefined;
    return puzzleImage;
  }, [puzzleImage, photoCache]);

  const payload = useMemo(() => JSON.stringify({
    type: 'setRecordedRegions',
    regions: resolvedRegions,
    displayMode,
    defaultColor,
    puzzleImage: resolvedPuzzleImage,
    puzzleComplete,
  }), [resolvedRegions, displayMode, defaultColor, resolvedPuzzleImage, puzzleComplete]);

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

/**
 * 지도 검색용 "도시/명소명 → 상위 주" 표. 키는 영문 정규화형(normEn)과 한글 표기 둘 다.
 *
 * 값은 GADM 시절 주 표기라 Natural Earth의 NAME_1과 그대로는 맞지 않는다
 * ('NewYork'↔'New York', 'Bayern'↔'Bavaria', 'Kanagawa'↔'Kanagawa Prefecture').
 * 그래서 이 값을 WebView에 그대로 넣으면 안 된다 — buildCityProvMap이 별칭 표
 * (resolveRegionCode)로 코드를 얻은 뒤 그 코드의 실제 NAME_1으로 바꿔 주입한다.
 * (homeRegions.CITY_TO_PROV가 같은 문제를 같은 방식으로 이미 푼다. 여기는 지도용 사본으로
 *  한글 키와 명소가 더 들어 있어 별도로 둔다.)
 */
const CITY_TO_PROV_SRC: Record<string, Record<string, string>> = {
  // 한국의 인기지역 기준 = 특별시(서울) + 광역시 6개 + 제주도. 세종(특별자치시)은 제외 — 사용자 확정.
  KOR:{seoul:'Seoul',busan:'Busan',daegu:'Daegu',incheon:'Incheon',gwangju:'Gwangju',daejeon:'Daejeon',ulsan:'Ulsan',jeju:'Jeju','서울':'Seoul','부산':'Busan','대구':'Daegu','인천':'Incheon','광주':'Gwangju','대전':'Daejeon','울산':'Ulsan','제주':'Jeju','제주도':'Jeju'},
  JPN:{tokyocity:'Tokyo',osakacity:'Osaka',kyotocity:'Kyoto',fukuokacity:'Fukuoka',sapporo:'Hokkaido',naha:'Okinawa',yokohama:'Kanagawa',kobe:'Hyōgo',nagoya:'Aichi',hiroshimacity:'Hiroshima',sendai:'Miyagi',tokyo:'Tokyo',osaka:'Osaka',kyoto:'Kyoto',fukuoka:'Fukuoka',hiroshima:'Hiroshima','도쿄':'Tokyo','오사카':'Osaka','교토':'Kyoto','후쿠오카':'Fukuoka','삿포로':'Hokkaido','나하':'Okinawa','요코하마':'Kanagawa','고베':'Hyōgo','나고야':'Aichi','히로시마':'Hiroshima','센다이':'Miyagi'},
  CHN:{guangzhou:'Guangdong',shenzhen:'Guangdong',chengdu:'Sichuan',hangzhou:'Zhejiang',xian:'Shaanxi',wuhan:'Hubei',qingdao:'Shandong',nanjing:'Jiangsu','광저우':'Guangdong','선전':'Guangdong','청두':'Sichuan','항저우':'Zhejiang','시안':'Shaanxi','우한':'Hubei','칭다오':'Shandong','난징':'Jiangsu'},
  USA:{losangeles:'California',la:'California',sanfrancisco:'California',lasvegas:'Nevada',miami:'Florida',chicago:'Illinois',seattle:'Washington',honolulu:'Hawaii',newyork:'NewYork',newyorkcity:'NewYork',boston:'Massachusetts',washingtondc:'Maryland',dc:'Maryland',houston:'Texas',denver:'Colorado',philadelphia:'Pennsylvania',atlanta:'Georgia','로스앤젤레스':'California','엘에이':'California','샌프란시스코':'California','라스베이거스':'Nevada','마이애미':'Florida','시카고':'Illinois','시애틀':'Washington','호놀룰루':'Hawaii','뉴욕':'NewYork','뉴욕시':'NewYork','보스턴':'Massachusetts','워싱턴디씨':'Maryland','디씨':'Maryland','휴스턴':'Texas','덴버':'Colorado','필라델피아':'Pennsylvania','애틀랜타':'Georgia','애틀란타':'Georgia'},
  DEU:{munich:'Bayern',munchen:'Bayern',frankfurt:'Hessen',stuttgart:'Baden-Württemberg',cologne:'Nordrhein-Westfalen',koln:'Nordrhein-Westfalen',nordlingen:'Bayern',dresden:'Sachsen',dusseldorf:'Nordrhein-Westfalen',hannover:'Niedersachsen','뮌헨':'Bayern','프랑크푸르트':'Hessen','슈투트가르트':'Baden-Württemberg','쾰른':'Nordrhein-Westfalen','뇌르틀링겐':'Bayern','드레스덴':'Sachsen','뒤셀도르프':'Nordrhein-Westfalen','하노버':'Niedersachsen'},
  ESP:{granada:'Andalucía',malaga:'Andalucía',sevilla:'Andalucía',seville:'Andalucía',barcelona:'Cataluña',madrid:'ComunidaddeMadrid',valencia:'ComunidadValenciana',bilbao:'PaísVasco','그라나다':'Andalucía','말라가':'Andalucía','세비야':'Andalucía','바르셀로나':'Cataluña','마드리드':'ComunidaddeMadrid','발렌시아':'ComunidadValenciana','빌바오':'PaísVasco'},
  GBR:{london:'England',birmingham:'England',manchester:'England',liverpool:'England',leeds:'England',edinburgh:'Scotland',glasgow:'Scotland',cardiff:'Wales',belfast:'NorthernIreland',oxford:'England',bristol:'England','런던':'England','버밍엄':'England','맨체스터':'England','리버풀':'England','리즈':'England','에든버러':'Scotland','글래스고':'Scotland','카디프':'Wales','벨파스트':'NorthernIreland','옥스퍼드':'England','브리스톨':'England'},
  FRA:{paris:'Île-de-France',nice:"Provence-Alpes-Côted'Azur",lyon:'Auvergne-Rhône-Alpes',marseille:"Provence-Alpes-Côted'Azur",bordeaux:'Nouvelle-Aquitaine',strasbourg:'GrandEst',toulouse:'Occitanie',lille:'Hauts-de-France',nantes:'PaysdelaLoire',montpellier:'Occitanie',cannes:"Provence-Alpes-Côted'Azur",'파리':'Île-de-France','니스':"Provence-Alpes-Côted'Azur",'리옹':'Auvergne-Rhône-Alpes','마르세유':"Provence-Alpes-Côted'Azur",'보르도':'Nouvelle-Aquitaine','스트라스부르':'GrandEst','툴루즈':'Occitanie','릴':'Hauts-de-France','낭트':'PaysdelaLoire','몽펠리에':'Occitanie','칸':"Provence-Alpes-Côted'Azur"},
  ITA:{rome:'Lazio',roma:'Lazio',milan:'Lombardia',milano:'Lombardia',florence:'Toscana',firenze:'Toscana',venice:'Veneto',venezia:'Veneto',naples:'Campania',napoli:'Campania',verona:'Veneto',pisa:'Toscana',turin:'Piemonte',torino:'Piemonte',bologna:'Emilia-Romagna',genoa:'Liguria',genova:'Liguria',palermo:'Sicily',bari:'Apulia','로마':'Lazio','밀라노':'Lombardia','피렌체':'Toscana','베네치아':'Veneto','나폴리':'Campania','베로나':'Veneto','피사':'Toscana','토리노':'Piemonte','볼로냐':'Emilia-Romagna','제노바':'Liguria','팔레르모':'Sicily','바리':'Apulia'},
  TUR:{cappadocia:'Nevsehir',pamukkale:'Denizli',fethiye:'Mugla','카파도키아':'Nevsehir','파묵칼레':'Denizli','페티예':'Mugla'},
  // 자킨토스만 구 광역명('Peloponnese, Western Greece and the Ionian') 대신 섬 이름을 쓴다 —
  // 그 구 광역은 별칭 표에서 펠로폰네소스로 가는데 자킨토스는 이오니아 제도 소속이라,
  // 구 광역명을 그대로 두면 검색 결과가 엉뚱한 지역으로 확대된다(별칭 표의 GRC|zakynthos 참고).
  GRC:{athens:'Attica',santorini:'Aegean',thira:'Aegean',mykonos:'Aegean',meteora:'ThessalyandCentralGreece',kalambaka:'ThessalyandCentralGreece',zakynthos:'Zakynthos','아테네':'Attica','산토리니':'Aegean','미코노스':'Aegean','메테오라':'ThessalyandCentralGreece','자킨토스':'Zakynthos'},
  AUT:{salzburgcity:'Salzburg',hallstatt:'Oberösterreich',innsbruck:'Tirol',vienna:'Wien','빈':'Wien','비엔나':'Wien','잘츠부르크':'Salzburg','할슈타트':'Oberösterreich','인스브루크':'Tirol'},
  PRT:{lisboncity:'Lisboa',lisbon:'Lisboa',portocity:'Porto',sintra:'Lisboa',lagos:'Faro',cabodaroca:'Lisboa',colares:'Lisboa','리스본':'Lisboa','포르투':'Porto','신트라':'Lisboa','라구스':'Faro','호카곶':'Lisboa'},
  NLD:{amsterdam:'Noord-Holland',rotterdam:'Zuid-Holland',zaanseschans:'Noord-Holland',zaanstad:'Noord-Holland',thehague:'Zuid-Holland',denhaag:'Zuid-Holland',sgravenhage:'Zuid-Holland','암스테르담':'Noord-Holland','로테르담':'Zuid-Holland','잔세스칸스':'Noord-Holland','헤이그':'Zuid-Holland'},
  THA:{pattaya:'ChonBuri',banglamung:'ChonBuri',bangkok:'BangkokMetropolis','방콕':'BangkokMetropolis','치앙마이':'ChiangMai','푸켓':'Phuket','파타야':'ChonBuri'},
  MYS:{kotakinabalu:'Sabah',johorbahru:'Johor',johorbaharu:'Johor',langkawi:'Kedah',penang:'PulauPinang',malacca:'Melaka','코타키나발루':'Sabah','조호르바루':'Johor','랑카위':'Kedah','페낭':'PulauPinang','말라카':'Melaka','쿠알라룸푸르':'KualaLumpur'},
  VNM:{nhatrang:'KhánhHòa',hoian:'QuảngNam',halong:'QuảngNinh',halongbay:'QuảngNinh',phuquoc:'KiênGiang','나트랑':'KhánhHòa','호이안':'QuảngNam','하롱베이':'QuảngNinh','푸꾸옥':'KiênGiang'},
  SAU:{riyadh:'ArRiyad',jeddah:'Makkah',jiddah:'Makkah',mecca:'Makkah',makkahalmukarramah:'Makkah',medina:'AlMadinah',alula:'AlMadinah','리야드':'ArRiyad','제다':'Makkah','메카':'Makkah','메디나':'AlMadinah','알울라':'AlMadinah'},
  MAR:{marrakech:'Marrakech-Tensift-AlHaouz',marrakesh:'Marrakech-Tensift-AlHaouz',casablanca:'GrandCasablanca',fes:'Fès-Boulemane',fez:'Fès-Boulemane',chefchaouen:'Tanger-Tétouan','마라케시':'Marrakech-Tensift-AlHaouz','카사블랑카':'GrandCasablanca','페스':'Fès-Boulemane','셰프샤우엔':'Tanger-Tétouan'},
  EGY:{giza:'AlJizah',luxor:'AlUqsur',aswancity:'Aswan',hurghada:'AlBahralAhmar',alghurdaqah:'AlBahralAhmar',cairo:'AlQahirah',alexandria:'AlIskandariyah','기자':'AlJizah','룩소르':'AlUqsur','아스완':'Aswan','후르가다':'AlBahralAhmar','카이로':'AlQahirah','알렉산드리아':'AlIskandariyah'},
  TUN:{carthage:'Tunis',sidibousaid:'Tunis',eljem:'Mahdia',tozeurcity:'Tozeur','카르타고':'Tunis','시디부사이드':'Tunis','엘젬':'Mahdia','엘 젬':'Mahdia','토주르':'Tozeur','튀니스':'Tunis'},
  ZAF:{capetown:'WesternCape',johannesburg:'Gauteng',pretoria:'Gauteng',tshwane:'Gauteng',cityofcapetown:'WesternCape',cityofjohannesburg:'Gauteng',cityoftshwane:'Gauteng','케이프타운':'WesternCape','요하네스버그':'Gauteng','프리토리아':'Gauteng'},
  MEX:{cancun:'QuintanaRoo',benitojuarez:'QuintanaRoo',playadelcarmen:'QuintanaRoo',solidaridad:'QuintanaRoo',tulum:'QuintanaRoo',guadalajara:'Jalisco',oaxacacity:'Oaxaca',oaxacadejuarez:'Oaxaca',guanajuatocity:'Guanajuato',mexicocity:'DistritoFederal',cdmx:'DistritoFederal','칸쿤':'QuintanaRoo','플라야델카르멘':'QuintanaRoo','플라야 델 카르멘':'QuintanaRoo','툴룸':'QuintanaRoo','과달라하라':'Jalisco','오아하카':'Oaxaca','과나후아토':'Guanajuato','멕시코시티':'DistritoFederal'},
  CAN:{vancouver:'BritishColumbia',greatervancouver:'BritishColumbia',toronto:'Ontario',montreal:'Québec',niagarafalls:'Ontario',niagara:'Ontario',quebeccity:'Québec','밴쿠버':'BritishColumbia','토론토':'Ontario','몬트리올':'Québec','나이아가라폭포':'Ontario','나이아가라 폭포':'Ontario','나이아가라':'Ontario','퀘벡':'Québec','퀘백':'Québec'},
  BRA:{riodejaneirocity:'RiodeJaneiro',saopaulocity:'SãoPaulo',salvador:'Bahia',manaus:'Amazonas',fozdoiguacu:'Paraná',iguazufalls:'Paraná',iguacufalls:'Paraná','리우데자네이루':'RiodeJaneiro','상파울루':'SãoPaulo','살바도르':'Bahia','마나우스':'Amazonas','포스두이구아수':'Paraná','포스 두 이구아수':'Paraná','이과수폭포':'Paraná','이과수 폭포':'Paraná','이과수':'Paraná'},
  COL:{medellin:'Antioquia',cartagena:'Bolívar',cartagenadeindias:'Bolívar',cali:'ValledelCauca',santiagodecali:'ValledelCauca',salento:'Quindío',bogota:'BogotáD.C.',bogotadc:'BogotáD.C.','보고타':'BogotáD.C.','메데인':'Antioquia','카르타헤나':'Bolívar','칼리':'ValledelCauca','살렌토':'Quindío'}
};

/**
 * 국가 하나의 도시 표를 "이 지오 데이터에 실제로 존재하는 NAME_1" 값으로 변환한다.
 * 못 잇는 항목은 넣지 않는다 — 넣어 두면 resolveProvince가 truthy를 돌려줘 Nominatim
 * 지오코딩 폴백까지 건너뛰고, 확대도 강조도 없이 칩만 뜨는 가짜 성공이 된다.
 */
function buildCityProvMap(iso3: string, geo: any): Record<string, string> {
  const src = CITY_TO_PROV_SRC[iso3];
  if (!src) return {};
  const nameByCode: Record<string, string> = {};
  for (const f of geo?.features ?? []) {
    const p = f?.properties ?? {};
    if (p.CODE && p.NAME_1 && !nameByCode[p.CODE]) nameByCode[p.CODE] = p.NAME_1;
  }
  const out: Record<string, string> = {};
  for (const [key, oldName] of Object.entries(src)) {
    const code = resolveRegionCode(iso3, oldName);
    const name = code ? nameByCode[code] : undefined;
    if (name) out[key] = name;
  }
  return out;
}

/**
 * 인기명소 도시들이 속한 주(CODE) 목록 — '인기명소' 칩이 켜지면 이 주들을 강조한다.
 * 구 GADM 데이터는 도시 경계 폴리곤 자체를 그렸지만, NE admin-1에는 도시 피처가 없어
 * 도시가 속한 상위 주를 강조하는 것으로 동작한다(도시→주 해석은 별칭 표 경유, 코드 기준).
 */
function buildPopularCodes(iso3: string, geo: any): string[] {
  const src = CITY_TO_PROV_SRC[iso3];
  if (!src) return [];
  const valid = new Set((geo?.features ?? []).map((f: any) => f?.properties?.CODE));
  const out = new Set<string>();
  for (const oldName of Object.values(src)) {
    const c = resolveRegionCode(iso3, oldName);
    if (c && valid.has(c)) out.add(c);
  }
  return [...out];
}

/** WebView 안에서 쓰는 문구 — RN에서 t()로 뽑아 JSON으로 주입한다(WebView에는 i18next가 없다) */
export interface MapLabels {
  loading: string;
  noSearchResult: string;
  minTwoChars: string;
  searchError: string;
  libLoadFail: string;
  noData: string;
}

function buildHTML(code: string, countryName: string = '', chipBottom: number = 7, d3Src: string = '', L: MapLabels, accentRgb: [number, number, number] = [191, 133, 252]) {
  const geo = getCountryGeo(code);
  if (!geo) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0A0B0F;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#FF3B30;font-size:14px}</style></head><body>${escapeText(L.noData)}</body></html>`;
  }

  const geoJSON = JSON.stringify(geo);
  // 도시 표는 이 국가 것만, 그것도 지오의 실제 NAME_1으로 변환해 넣는다 (buildCityProvMap 참고)
  const cityProvJSON = JSON.stringify({ [code]: buildCityProvMap(code, geo) });

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
/* touch-action:none — iOS WebView가 첫 제스처를 스크롤/줌으로 판정하며 한 번 씹는 것을 막아
   첫 확대(핀치)부터 d3.zoom이 바로 받게 한다. user-select/callout도 첫 터치 지연 방지. */
html,body{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
svg{touch-action:none;display:block}
body{background:#0A0B0F;width:100vw;height:100vh;overflow:hidden}
#loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#A1A1B0;font-size:14px;gap:12px;pointer-events:none}
.spinner{width:28px;height:28px;border:3px solid #2E2E3B;border-top-color:rgb(${accentRgb.join(',')});border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#region-chip{position:fixed;left:7px;bottom:${chipBottom}px;min-width:100px;height:26px;padding:0 12px;border-radius:13px;background:rgba(10,11,15,0.5);display:none;align-items:center;justify-content:center;color:#E8E8F0;font-size:12px;font-weight:600;font-family:-apple-system,'Noto Sans KR',sans-serif;z-index:10;pointer-events:none}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>${escapeText(L.loading)}</div>
<div id="region-chip"></div>
${d3Src ? '<script>' + d3Src + '</script>' : ''}
<script>
// iOS WKWebView는 첫 핀치를 시스템 줌 제스처(gesturestart)로 판정하며 한 번 씹는다.
// touch-action:none은 이 iOS 전용 이벤트를 못 막으므로 직접 preventDefault해 첫 확대부터
// d3.zoom이 받게 한다.
['gesturestart','gesturechange','gestureend'].forEach(function(t){
  document.addEventListener(t, function(e){ e.preventDefault(); }, {passive:false});
});
// 진단 스위치 — 켜면 부팅·수신 시 칩에 스크립트 버전과 수신 데이터 요약이 잠깐 표시된다.
// (사진 미적용 이슈는 원인 확정: inline HTML WebView가 file:// 을 못 읽는 것 → RN에서
//  data URI 변환으로 해결. 진단은 꺼 두고 재발 시에만 켠다.)
var MAP_SCRIPT_VER = 'v7';
var MAP_DEBUG = false;
var dbgTimer = null;
function dbgChip(text){
  if(!MAP_DEBUG) return;
  setRegionChip(text);
  if(dbgTimer) clearTimeout(dbgTimer);
  dbgTimer = setTimeout(function(){ setRegionChip(''); }, 4000);
}
// 국가 ISO3. 피처 속성 CODE(지역 코드)와 헷갈리지 않게 이름을 분리해 둔다 —
// d.properties.CODE를 CODE로 한 글자 잘못 쓰면 어떤 도구도 못 잡는다.
var COUNTRY_CODE='${code}';
var COUNTRY_NAME=${JSON.stringify(countryName)};
var L=${JSON.stringify(L)}; // RN에서 번역해 넣은 문구(ko/en)
var recordedRegions = [];
var displayMode = 'color';
var puzzleImage = null;          // 퍼즐 원본 그림 (data URI/file://)
var puzzleComplete = false;      // RN(regionProgress)이 계산해 내려주는 완성 여부
var puzzlePrevComplete = null;   // null=첫 수신(기준선만 설정, 연출 없음 — 남발 방지)
var prevMatchedCodes = [];       // 직전 매칭 CODE 목록 — '마지막 조각' 글로우 대상 계산용
var puzzleGroups = [];           // 그림을 깔 그룹(본토/인셋)의 {key, gen(경로 생성기), feats, b(bbox)} — render()가 채운다
// 지역별 사진 패턴 세대 관리 — 사진이 바뀌면 rev를 올려 패턴 id(=fill 값)가 바뀌게 한다
// (WebKit은 pattern 내부 변경을 리페인트하지 않는다 — updateMap 주석 참고)
var patRevs = {};      // nameEn → { photo, rev }
var patIdByCode = {};  // nameEn → 현재 패턴 id (updateMap마다 재계산, getFill이 참조)
var defaultColor = '#BF85FC';
var BOTTOM_INSET = ${chipBottom}; // 하단 탭 바 가림 높이 — 투영을 보이는 영역 기준으로 중앙 정렬
function setRegionChip(name){var c=document.getElementById('region-chip');if(!c)return;if(name){c.textContent=name;c.style.display='flex';}else{c.style.display='none';}}

var svgElement = null;
var mainFeatures = null;
var insetFeatures = null;
var projectionPath = null;
var gElement = null;
var pathElements = null;          // 메인 채움+경계 selection
var insetPathElements = {};       // 인셋 채움+경계 selection
var insetBoxes = [];

// ── 검색(지역/도시 → 주 확대·강조) ──
var searchedRegion = null;   // 강조할 주의 NAME_1 (영문)
var zoomBehavior = null;     // d3.zoom 인스턴스 (render 에서 할당)
var maxZoom = 15;

// 도시/명소명 → 속한 주(NAME_1) 매핑. 키는 영문(normEn)·한글 모두 허용.
// 값은 RN 쪽 buildCityProvMap이 이 국가 지오의 실제 NAME_1으로 변환해 주입한다.
// 여기에 주 이름을 직접 적지 마라 — GADM 시절 표기와 어긋나면 resolveProvince가 truthy를
// 돌려주는 바람에 지오코딩 폴백도 안 타고, 확대도 강조도 없이 칩만 뜨는 가짜 성공이 된다.
var CITY_TO_PROV = ${cityProvJSON};
// 인기명소가 속한 주(CODE) 목록 — 칩이 켜지면 이 주들을 스킨 색 테두리로 강조
var POPULAR_CODES = ${JSON.stringify(buildPopularCodes(code, geo))};
var showPopular = false; // 앱 기본값(popularActive=false)과 일치 — 초기 깜빡임 방지

// ── 지구본 스킨 강조색 파생 선 색 ──
// 밝기 배율은 구 하드코딩 보라값(#3E3155·#4A3B66·#7856B0·#4E3D6B)이 aurora 강조색
// (#BF85FC)의 몇 배 밝기였는지에서 역산 — aurora에서는 기존과 거의 같은 색이 나오고,
// cyan/mint 스킨에서는 같은 관계를 유지한 파랑/초록 계열이 나온다.
var ACCENT_RGB = ${JSON.stringify(accentRgb)};
function accentShade(f){
  return 'rgb('+Math.round(ACCENT_RGB[0]*f)+','+Math.round(ACCENT_RGB[1]*f)+','+Math.round(ACCENT_RGB[2]*f)+')';
}
var LINE_BASE = accentShade(0.34);    // 내부 경계 기본 (aurora≈#3E3155)
var LINE_OUTLINE = accentShade(0.40); // 나라 외곽선 (aurora≈#4A3B66)
var LINE_ACTIVE = accentShade(0.64);  // 방문 지역 테두리 (aurora≈#7856B0)
var TAP_FLASH = accentShade(0.42);    // 지역 탭 피드백 채움 (aurora≈#4E3D6B)

// 영문 정규화: 소문자 + 발음기호 제거 + 공백/하이픈/어퍼스트로피 제거
function normEn(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[\\s\\-'’.]/g,'');
}

// 검색어 → 속한 주(NAME_1) 해석
function resolveProvince(query){
  var q=(query||'').trim();
  if(!q) return null;
  var qn=normEn(q);
  var alias=CITY_TO_PROV[COUNTRY_CODE]||{};
  if(alias[q]) return alias[q];
  if(alias[qn]) return alias[qn];
  var all=(mainFeatures||[]).concat(insetFeatures||[]);
  // 정확 일치 > 접두 일치 > 부분 일치 순으로 랭킹 — 짧은 검색어가 엉뚱한 지역의 부분 문자열에
  // 먼저 걸리는 오매칭 방지 (예: 목록 앞쪽 지역명 중간에 우연히 포함되는 경우)
  var match=null, best=0;
  for(var i=0;i<all.length;i++){
    var p=all[i].properties||{};
    var nl=p.NL_NAME_1||'', en=p.NAME_1||'', ne=normEn(en);
    var score=0;
    if((nl && nl===q) || (ne && ne===qn)) score=3;
    else if((nl && nl.indexOf(q)===0) || (qn.length>=2 && ne.indexOf(qn)===0)) score=2;
    else if((nl && nl.indexOf(q)>=0) || (qn.length>=2 && ne.indexOf(qn)>=0)) score=1;
    if(score>best){best=score;match=en;if(score===3)break;}
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
  // isFinite 필수 — 투영이 깨지면 bounds가 NaN이 되는데 NaN<=0 은 false라 dx<=0 만으로는
  // 그대로 통과한다. 그러면 translate(NaN,NaN) scale(NaN)이 zoom 그룹에 박혀 지도가 사라진다.
  if(!isFinite(dx)||!isFinite(dy)||!W||!H||dx<=0||dy<=0){return;}
  var scale=Math.max(1.2, Math.min(maxZoom, 0.55/Math.max(dx/W, dy/H)));
  var tx=W/2-scale*cx, ty=H/2-scale*cy;
  svgElement.transition().duration(650).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
}

// 좌표가 속한 주(province) 찾기 — 도시 피처면 상위 주로 환원
function pipRing(pt,ring){var ins=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>pt[1])!=(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
function featHas(f,pt){var g=f.geometry;if(!g)return false;var polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;for(var i=0;i<polys.length;i++){if(pipRing(pt,polys[i][0])){var hole=false;for(var k=1;k<polys[i].length;k++){if(pipRing(pt,polys[i][k])){hole=true;break;}}if(!hole)return true;}}return false;}
function provinceAt(pt){
  var all=(mainFeatures||[]).concat(insetFeatures||[]);
  for(var i=0;i<all.length;i++){ if(featHas(all[i],pt)) return all[i].properties.NAME_1||''; } // 도시 피처가 없으므로 바로 주 반환
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
// 로컬 매칭 실패 시 OSM(Nominatim) 지오코딩 폴백 — 표에 없는 도시도 검색되게
var ISO2={JPN:'jp',CHN:'cn',USA:'us',DEU:'de',ESP:'es',GBR:'gb',FRA:'fr',ITA:'it',
  TUR:'tr',GRC:'gr',AUT:'at',PRT:'pt',NLD:'nl',THA:'th',MYS:'my',VNM:'vn',SAU:'sa',
  ARE:'ae',MAR:'ma',EGY:'eg',TUN:'tn',ZAF:'za',MEX:'mx',CAN:'ca',BRA:'br',COL:'co'};
var geoCache={};
function geocodeFallback(query){
  if(geoCache.hasOwnProperty(query)){ if(geoCache[query]) applyProvince(geoCache[query]); else setRegionChip(L.noSearchResult); return; }
  var cc=ISO2[COUNTRY_CODE]||'';
  var url='https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q='+encodeURIComponent(query)+(cc?'&countrycodes='+cc:'');
  // 8초 타임아웃 — 느린 네트워크에서 무한정 무응답으로 보이지 않게 중단 후 오류 안내
  var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  var timer=ctrl?setTimeout(function(){try{ctrl.abort();}catch(e){}},8000):null;
  fetch(url, ctrl?{signal:ctrl.signal}:{}).then(function(r){return r.json();}).then(function(arr){
    if(timer)clearTimeout(timer);
    var prov=null;
    if(arr&&arr.length){var lon=parseFloat(arr[0].lon),lat=parseFloat(arr[0].lat); if(!isNaN(lon)&&!isNaN(lat)) prov=provinceAt([lon,lat]);}
    geoCache[query]=prov;
    if(prov) applyProvince(prov);
    else setRegionChip(L.noSearchResult);
  }).catch(function(){ if(timer)clearTimeout(timer); setRegionChip(L.searchError); });
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
  if(prov){ applyProvince(prov); return; }       // 로컬(도시 표·주 이름) 즉시 매칭 (한 글자도 시도)
  if(q.length<2){ setRegionChip(L.minTwoChars); return; } // 한 글자 + 미매칭 → 안내
  geocodeFallback(q);                            // 실패 시 온라인 지오코딩으로 시 단위 검색
}

function loadD3(cb){
  var u=['https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js','https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js'];
  var i=0;
  function next(){
    if(i>=u.length){var le=document.getElementById('loading');le.textContent='';var sp=document.createElement('span');sp.style.color='#FF3B30';sp.textContent=L.libLoadFail;le.appendChild(sp);return;}
    var s=document.createElement('script');s.src=u[i];
    s.onload=function(){if(typeof d3!=='undefined')cb();else{i++;next();}};
    s.onerror=function(){i++;next();};
    document.head.appendChild(s);
  }
  next();
}
function boot(){
  var geo=${geoJSON};
  // ⚠️ 레이아웃 전에 그리지 말 것 — 안드로이드 WebView는 스크립트를 레이아웃보다 먼저 실행해서
  // 이 시점의 innerWidth/innerHeight가 0이다(2026-08-17 실측: W=0 H=0). 그대로 render하면
  // fitExtent가 뒤집힌 범위([[24,24],[-24,-24]])를 받아 투영 스케일이 음수(-436)가 되고,
  // 모든 path의 d가 빈 값이 돼 지도가 통째로 안 보인다. d3.geoPath는 이때 오류를 내지 않고
  // 조용히 빈 경로를 만들기 때문에 콘솔만 봐서는 원인이 안 드러난다.
  // iOS WKWebView는 레이아웃 후 실행이라 이 증상이 없었다 — 안드로이드 전용 증상의 원인.
  var started=false;
  function start(){
    if(started) return;
    started=true;
    window.removeEventListener('resize',onResize);
    document.getElementById('loading').style.display='none';
    render(geo);
  }
  function onResize(){ if(window.innerWidth>0&&window.innerHeight>0) start(); }
  window.addEventListener('resize',onResize);
  var tries=0;
  (function waitForSize(){
    if(started) return;
    if(window.innerWidth>0&&window.innerHeight>0){ start(); return; }
    // 약 3초(60fps 기준)까지 기다린 뒤에는 그냥 그린다 — 영원히 빈 화면으로 두는 것보다 낫다
    if(++tries>180){ start(); return; }
    requestAnimationFrame(waitForSize);
  })();
}
// 오프라인 번들 d3가 이미 로드돼 있으면 바로 시작, 아니면 CDN 폴백
if(typeof d3!=='undefined'){ boot(); } else { loadD3(boot); }

// ── 채움색 ──
// 기록 매칭은 CODE(예: 'US-NY') 기준, 검색 강조 비교는 NAME_1(표시명) 기준 — 서로 다른 값이라
// 변수를 분리한다(code=매칭, n=검색 비교).
function getFill(d){
  var code=d.properties.CODE||'';
  var n=d.properties.NAME_1||'';
  var active=activeRecordFor(code);
  // 퍼즐 모드: 채움은 전부 투명 — 실루엣 배경(미방문 #191920)과 방문 조각 그림은
  // path 아래의 pz-layer가 그린다(ensurePuzzleLayers 주석 참고 — 월경지 때문에 path
  // 채움으로 처리하면 안 된다). 'transparent'는 히트 판정엔 잡히므로 탭은 그대로 동작.
  // 검색 강조는 채움을 덮지 않는다 — emphStroke의 시안 테두리가 담당.
  if(displayMode==='puzzle'&&puzzleImage){
    return 'transparent';
  }
  // 사진 모드: 방문 지역은 사진 패턴만 깐다. 사진이 없거나(변환 전·실패 포함) 패턴이
  // 아직 없으면 단색 활성화 없이 기본 바탕 그대로 — 색 활성화는 퍼즐 도입으로 폐지됐고,
  // 방문 표시는 emphStroke의 보라 경계선이 담당한다.
  if(active&&active.photo){
    // 패턴 id는 세대 접미사가 붙어 updateMap이 계산한 표에서 찾는다(문자열 조립 금지 —
    // 사진 교체 시 id가 바뀌는 것이 WebKit 리페인트를 강제하는 핵심이다)
    var pid=patIdByCode[active.nameEn||code];
    if(pid) return 'url(#'+pid+')';
  }
  if(n===searchedRegion) return '#22323d'; // 검색 강조(다크 시안)
  return '#191920'; // 미방문·사진 없는 방문 지역 공통 바탕
}
// 이 지역에 기록이 있으면 그 기록 반환. (도시 피처는 상위 주로 흡수돼 데이터에 없다)
function activeRecordFor(code){
  for(var i=0;i<recordedRegions.length;i++){
    if(recordedRegions[i].nameEn===code) return recordedRegions[i];
  }
  return null;
}
function regionFill(d){
  return getFill(d);
}
// ── 경계선 색·두께 (스케일 스트로크: 어긋난 인접 경계를 같은 색으로 합쳐 틈/이중선 제거) ──
// 매칭(activeRecordFor)은 CODE, 검색 강조(searchedRegion)는 NAME_1 기준.
function emphStroke(d){
  var n=d.properties.NAME_1||'';
  var code=d.properties.CODE||'';
  if(n===searchedRegion) return '#00D8F3'; // 검색 강조는 기능색(시안) 고정 — 스킨과 무관하게 눈에 띄어야 한다
  var a=activeRecordFor(code);
  if(a) return LINE_ACTIVE;
  if(showPopular && POPULAR_CODES.indexOf(code)>=0) return defaultColor; // 인기명소 주 강조(스킨 활성화색)
  return LINE_BASE;
}
// 경계선 표시 여부(불투명도) — 완성 퍼즐(그림이 실제로 깔린 상태)에서만 숨긴다. 사진 미선택
// (사용자 사진 전용이라 가능한 상태)이면 지도가 사진 모드 규칙으로 그려지므로 경계선이 있어야 한다.
// 단, 검색·인기명소 강조는 스트로크가 유일한 표시 수단이라 완성 상태에서도 보여야 한다 —
// 전체 opacity 0으로 깔면 완성한 나라에서 검색해도 확대만 되고 강조 테두리가 안 보였다.
function strokeOpFor(d){
  if(!(displayMode==='puzzle'&&puzzleImage&&puzzleComplete)) return 1;
  var n=d.properties.NAME_1||'';
  var code=d.properties.CODE||'';
  if(n===searchedRegion) return 1;
  if(showPopular && POPULAR_CODES.indexOf(code)>=0) return 1;
  return 0;
}
// 두께는 '지오 단위'라 줌에 따라 커지며, 어긋난 인접 경계를 같은 색으로 덮어 합친다.
// 이중선/틈이 남으면 아래 값을 키우고, 고배율에서 너무 두꺼우면 줄이면 된다.
function emphWidth(d){
  var n=d.properties.NAME_1||'';
  var code=d.properties.CODE||'';
  if(n===searchedRegion) return 0.6;
  var a=activeRecordFor(code);
  if(a) return 0.45;
  if(showPopular && POPULAR_CODES.indexOf(code)>=0) return 0.5; // 인기명소 주 강조
  return 0.35;
}
// 현재 확대 배율(k). zoom 그룹 transform이 stroke도 k배 확대하므로, 화면상 선 두께를
// 일정하게(확대할수록 지역 대비 얇게) 유지하려면 stroke-width를 base/k 로 준다.
// (vector-effect:non-scaling-stroke 와 함께 쓰면 stroke-width 값이 화면 px 기준이 된다)
function curK(){ try{ return svgElement ? d3.zoomTransform(svgElement.node()).k : 1; }catch(e){ return 1; } }
// 배율 k에서의 경계선 두께 — k^0.25로 아주 완만하게만 얇아지고(직접 /k는 고배율에서 실처럼 사라짐)
// 원래 두께의 75%를 하한으로 둬 확대해도 구분선이 또렷하게 보이게 한다.
function scaledStroke(d,k){ var base=emphWidth(d); if(!base) return 0; return Math.max(base/Math.pow(k,0.25), base*0.75); }
function curStrokeWidth(d){ return scaledStroke(d, curK()); }
// ── 구역 탭 ──
function onRegionClick(ev,d){
  if(displayMode==='puzzle'&&puzzleImage){
    // 퍼즐 모드: 단색 채움 플래시는 애써 깐 그림 조각을 350ms 동안 통째로 덮는다 —
    // 대신 테두리가 스킨색으로 잠깐 밝아졌다 꺼지는 스트로크 펄스로 피드백한다.
    var selp=d3.select(this);
    selp.raise()
      .attr('stroke',accentShade(1)).attr('stroke-opacity',1).attr('stroke-width',1.4)
      .transition().duration(450)
      .attr('stroke-opacity',strokeOpFor(d))
      .on('end',function(){ selp.attr('stroke',emphStroke(d)).attr('stroke-width',curStrokeWidth(d)); });
  } else {
    d3.select(this).attr('fill',TAP_FLASH);
    var self=this;
    setTimeout(function(){d3.select(self).attr('fill',getFill(d));},350);
  }
  var name=d.properties.NL_NAME_1||d.properties.NAME_1||'';
  var nameEn=d.properties.CODE||''; // MainScreen이 regionNameEn으로 저장하는 값
  setRegionChip(name);
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'regionTapped',region:name,regionEn:nameEn,countryCode:COUNTRY_CODE}));
  }
}
// ── 나라 외곽선 추출 — 두 지역이 공유하지 않는 변(1회 등장)만 모은다 ──
// 인접 지역은 정점을 정확히 공유한다(NE→mapshaper 위상 보존 — 빌드 데이터로 검증:
// 내부 경계는 전부 정확히 2회 등장, 어긋난 내부 변 0%). 그래서 변 등장 횟수만 세면
// 내부/외곽이 정확히 갈린다: 2회 = 내부 경계, 1회 = 바다·국경 쪽 외곽.
function outlineGeom(features){
  var cnt={}, segs=[];
  features.forEach(function(f){
    var polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    polys.forEach(function(poly){ poly.forEach(function(ring){
      for(var i=0;i<ring.length-1;i++){
        var a=ring[i], b=ring[i+1];
        var ka=a[0]+','+a[1], kb=b[0]+','+b[1];
        var k=ka<kb?ka+'|'+kb:kb+'|'+ka;
        cnt[k]=(cnt[k]||0)+1;
        segs.push([a,b,k]);
      }
    });});
  });
  var lines=[];
  for(var i=0;i<segs.length;i++){ if(cnt[segs[i][2]]===1) lines.push([segs[i][0],segs[i][1]]); }
  return {type:'MultiLineString',coordinates:lines};
}
// 외곽선 패스 — 지역 채움·내부 경계선 위에 상수 두께(화면 px)로 그려 나라 실루엣을 세운다.
// 내부 경계(0.35px)보다 확실히 두껍게, 색은 내부선(#3E3155)과 같은 계열의 한 단계 밝은 톤 —
// 이질감 없이 윤곽만 서게 한다. 탭 히트는 지역 path가 담당하므로 포인터는 통과시킨다.
function drawOutline(parent, features, pathGen){
  parent.append('path').attr('class','country-outline')
    .attr('d', pathGen(outlineGeom(features)))
    .attr('fill','none').attr('stroke',LINE_OUTLINE).attr('stroke-width',1.6)
    .style('vector-effect','non-scaling-stroke')
    .attr('stroke-linejoin','round').attr('stroke-linecap','round')
    .style('pointer-events','none');
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
    .attr('class','fill-'+cls+' region-stroke').attr('d',pathGen)
    .attr('fill',regionFill)
    .attr('stroke',emphStroke).attr('stroke-width',curStrokeWidth)
    // 확대해도 선이 두꺼워지지 않게 — transform scale과 무관하게 stroke를 화면 px 기준으로 렌더
    .style('vector-effect','non-scaling-stroke')
    .attr('stroke-linejoin','round').attr('stroke-linecap','round')
    .attr('shape-rendering','geometricPrecision')
    .style('cursor','pointer').style('pointer-events','auto').on('click',onRegionClick);
  return {fill:fillSel};
}
function render(geo){
  var W=window.innerWidth,H=window.innerHeight,PAD=24;
  var svg=d3.select('body').append('svg').attr('width',W).attr('height',H);
  svgElement = svg;
  // NE 미국 admin-1 데이터는 50주+D.C.뿐이다. 괌은 별도 국가(GUM) 피처라 여기 없고,
  // 호놀룰루는 옛 GADM의 도시 피처였을 뿐 admin-1에는 없다 — 둘 다 인셋 대상에서 제외.
  var insets=['Alaska','Hawaii'];
  mainFeatures=geo.features;
  insetFeatures=[];
  if(COUNTRY_CODE==='USA'){
    mainFeatures=geo.features.filter(function(f){return insets.indexOf(f.properties.NAME_1)<0;});
    insetFeatures=geo.features.filter(function(f){return f.properties.NAME_1==='Alaska'||f.properties.NAME_1==='Hawaii';});
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
  // 퍼즐 레이어 대상 그룹 등록 — 그림·클립을 updateMap의 ensurePuzzleLayers가 여기서 만든다
  puzzleGroups=[{key:'m', gen:path, feats:mainFeatures, b:path.bounds(mainGeo)}];
  // 메인 지도 — 채움 + 스케일 경계 스트로크(어긋난 인접 경계를 하나로 합침)
  var mainGrp=drawGroup(g, mainFeatures, path, 'm');
  pathElements=mainGrp.fill;
  drawOutline(g, mainFeatures, path); // 나라 외곽선 — 지역 채움 위, 강조 피처 아래
  reorderEmph(); // 초기 렌더에도 강조 피처 z-순서 적용

  if(COUNTRY_CODE==='USA'&&insetFeatures.length>0){
    // 인셋도 '보이는 영역(VH)' 기준으로 배치 — 본토 중앙 정렬에 맞춰 탭 바 위로
    var VH=H-(BOTTOM_INSET||0);
    // 알래스카는 가로로 긴 모양(투영 가로:세로 ≈ 1.3:1)이라 박스도 가로형으로 —
    // 세로형 박스(구 0.22W×0.28VH)는 위아래가 절반 넘게 비어 실제 그림이 작아 보였다.
    insetBoxes=[
      {name:'Alaska',x:PAD,y:VH*0.74,w:W*0.28,h:VH*0.16},
      {name:'Hawaii',x:PAD+W*0.30,y:VH*0.74,w:W*0.15,h:VH*0.16}
    ];
    insetBoxes.forEach(function(box){
      var feat=insetFeatures.filter(function(f){
        return f.properties.NAME_1===box.name;
      });
      if(feat.length===0)return;
      var fc={type:'FeatureCollection',features:feat};
      // 알래스카는 알류샨 열도 끝이 날짜변경선(180°)을 넘어 동경까지 걸친다(실측 -179.1..+179.8).
      // 회전 없는 투영으로 fitExtent하면 경도 폭이 지구 한 바퀴로 계산돼 축척이 무너지고
      // 박스 안에 점처럼 작게 그려진다 — 투영을 알래스카 중심(154°W)으로 회전해 경도를
      // 연속 구간(-26°..+26° 부근)으로 만든 뒤 맞춘다. 하와이는 안 넘으니 회전 불필요.
      var ip=d3.geoMercator();
      if(box.name==='Alaska') ip.rotate([154,0]);
      ip.fitExtent([[box.x+4,box.y+4],[box.x+box.w-4,box.y+box.h-4]],fc);
      var ipath=d3.geoPath().projection(ip);
      // inset-bg 클래스: 퍼즐 모드에선 fill을 투명으로 바꿔 아래 pz-layer 그림이 비치게 한다
      g.append('rect').attr('class','inset-bg').attr('x',box.x).attr('y',box.y).attr('width',box.w).attr('height',box.h)
        .attr('rx',6).attr('fill','#191920').attr('stroke',LINE_BASE).attr('stroke-width',0.8);
      g.append('text').attr('x',box.x+box.w/2).attr('y',box.y+14).attr('text-anchor','middle')
        .attr('fill','#A1A1B0').attr('font-size','10px').text(feat[0].properties.NL_NAME_1);
      var grp=drawGroup(g, feat, ipath, box.name);
      insetPathElements[box.name]=grp.fill;
      drawOutline(g, feat, ipath); // 인셋(알래스카·하와이)도 같은 규칙 — 피처 하나면 전체 경계가 외곽선
      puzzleGroups.push({key:box.name, gen:ipath, feats:feat, b:[[box.x,box.y],[box.x+box.w,box.y+box.h]]});
    });
  }
  // 확대 상한 — 지역 경계 데이터 해상도(지역당 정점 수)에 맞춰 자동 설정.
  // 저해상도 국가(예: 일본)를 고배율로 확대하면 각진 폴리곤이 스파이크로 깨지므로,
  // 정점이 성긴 국가일수록 상한을 낮춰 깨짐이 드러나기 전까지만 확대되게 한다.
  (function(){
    var tv=0;
    mainFeatures.forEach(function(f){ (function cnt(c){ if(typeof c[0][0]==='number') tv+=c.length; else c.forEach(cnt); })(f.geometry.coordinates); });
    var density=tv/Math.max(mainFeatures.length,1); // 지역당 평균 정점 수
    // 자기교차를 제거(buffer(0))해 저배율 깨짐은 해소됐다. 남은 건 순수 저해상도 각짐이므로
    // 정점이 성긴 국가만 상한을 소폭 낮춘다(하한 10 ~ 상한 18).
    maxZoom=Math.max(10, Math.min(18, Math.round(density/12)));
  })();
  zoomBehavior=d3.zoom().scaleExtent([1,maxZoom])
    .on('zoom',function(ev){
      // 제스처 중에는 transform만 — 프레임마다 전 지역 path에 stroke-width를 다시 쓰면
      // attr 변경이 path를 무효화해 패턴 채움(퍼즐 이미지)까지 통째로 리페인트된다(핀치 렉).
      // 두께는 non-scaling-stroke가 제스처 동안 화면 px 기준으로 유지해 준다.
      g.attr('transform',ev.transform);
    })
    .on('end',function(ev){
      // 배율별 미세 보정(base/k^0.25, 하한 75%)은 제스처가 끝난 뒤 한 번만
      var k=ev.transform.k;
      g.selectAll('path.region-stroke').attr('stroke-width',function(d){return scaledStroke(d,k);});
    });
  svg.call(zoomBehavior);
  // warm-up — zoom 내부 상태를 미리 초기화해 첫 실제 제스처가 씹히지 않게 한다
  svg.call(zoomBehavior.transform, d3.zoomIdentity);

  setRegionChip('');
  dbgChip('지도 ' + MAP_SCRIPT_VER); // 임시 진단 — 이 표시가 없으면 옛 스크립트가 돌고 있는 것
  updateMap();
  // RN 에 준비 완료 알림 → 현재 기록/검색 상태를 받아옴
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));}
}

// ── 퍼즐 레이어 — 그림은 지역별 패턴 채움이 아니라 <image> 1장 + mask로 그린다 ──
// 처음엔 지역마다 패턴 채움을 썼는데, 줌·팬 리페인트마다 WebKit이 패턴 인스턴스 수십 개를
// 다시 그려 프레임이 무너졌다(실기기 렉). 이미지가 g(줌 변환 그룹) 안의 일반 노드면
// 프레임당 작업이 '마스크 1회 + 래스터 스케일'로 줄어든다.
// 좌표는 그룹 bbox 기준 cover-fit(slice)이라 조각 정렬은 자동이다.
//
// 레이어 구성(아래→위): ① 실루엣 배경 — 전 지역을 미방문색(#191920)으로 칠한 path들
// (흑백 힌트는 폐지 — 미방문은 퍼즐 이전과 똑같이 빈 상태) ② 방문 마스크를 쓴 그림.
// 지역 path 자체는 퍼즐 모드에서 전부 transparent다 — 미방문을 path의 불투명 채움으로
// 처리하면 월경지 역방향(미방문 경기 안의 방문 서울)에서 큰 지역의 채움이 그림을 덮는다.
//
// 방문 마스크는 clipPath가 아니라 mask다. clipPath는 합집합만 되고 빼기가 안 돼,
// 방문한 큰 지역(경기) 폴리곤에 구멍이 없으면 그 안의 미방문 월경지(서울)까지 그림이
// 비쳤다. mask는 그리기 순서가 살아 있어 큰 지역 흰색(보임) 위에 작은 미방문 지역을
// 검정(가림)으로 덧그리면 구멍이 뚫린다 — 전 지역 path를 면적 큰 순(drawGroup과 동일
// 규칙)으로 넣어두고, 방문 여부는 매 갱신마다 fill 흰/검만 바꾼다.
//
// 이미지 재생성은 그림이 바뀔 때만(디코드가 무겁다). 퍼즐 모드를 떠나도 레이어는 지우지
// 않고 숨긴다 — 사진↔퍼즐 토글 왕복(표시 설정 라이브 미리보기)에 재디코드가 없게.
var puzzleBuiltFor = null;
// 빈 조각 그레인 타일 — 미세한 밝은 점 노이즈를 #191920 위에 깐 64px 캔버스 타일.
// 앱의 그레인 모티프(GrainOverlay)와 같은 결로, 완전 평면이던 미방문 조각에
// '아직 못 채운 빈 자리'의 물성만 준다(흑백 사진 힌트와는 무관 — 재질감뿐이다).
// null=미시도, ''=시도했으나 실패(단색 폴백). 패턴은 userSpaceOnUse라 페인트가 싸다.
var grainTileUri = null;
function makeGrainTile(){
  try{
    var c=document.createElement('canvas'); c.width=64; c.height=64;
    var x=c.getContext('2d');
    if(!x) return '';
    x.fillStyle='#191920'; x.fillRect(0,0,64,64);
    for(var i=0;i<90;i++){
      x.fillStyle='rgba(255,255,255,'+(0.02+Math.random()*0.03).toFixed(3)+')';
      x.fillRect(Math.floor(Math.random()*64),Math.floor(Math.random()*64),1,1);
    }
    return c.toDataURL('image/png');
  }catch(e){ return ''; }
}
function ensurePuzzleLayers(){
  if(!gElement) return;
  var on = displayMode === 'puzzle' && !!puzzleImage;
  gElement.selectAll('rect.inset-bg').attr('fill', on ? 'transparent' : '#191920');
  var layer = gElement.select('g.pz-layer');
  if(!on){ if(!layer.empty()) layer.style('display','none'); return; }
  if(layer.empty()) layer = gElement.insert('g',':first-child').attr('class','pz-layer');
  layer.style('display',null);

  if(puzzleBuiltFor !== puzzleImage){
    puzzleBuiltFor = puzzleImage;
    layer.selectAll('*').remove();
    if(grainTileUri===null) grainTileUri=makeGrainTile();
    if(grainTileUri){
      layer.append('defs').append('pattern').attr('id','pz-grain')
        .attr('patternUnits','userSpaceOnUse').attr('width',64).attr('height',64)
        .append('image').attr('href',grainTileUri).attr('xlink:href',grainTileUri)
        .attr('width',64).attr('height',64);
    }
    var emptyFill = grainTileUri ? 'url(#pz-grain)' : '#191920';
    puzzleGroups.forEach(function(grp){
      var bx=grp.b[0][0], by=grp.b[0][1], bw=grp.b[1][0]-bx, bh=grp.b[1][1]-by;
      if(bw<=0||bh<=0) return;
      // ① 실루엣 배경 — 미방문 지역이 '빈' 상태로 보이는 층. 그레인 타일 패턴(실패 시 단색).
      grp.feats.forEach(function(f){
        layer.append('path').attr('d', grp.gen(f)).attr('fill',emptyFill);
      });
      // ② 방문 마스크
      var mask=layer.append('mask').attr('id','pzm-sharp-'+grp.key)
        .attr('class','pz-sharp-mask')
        .attr('maskUnits','userSpaceOnUse')
        .attr('x',bx).attr('y',by).attr('width',bw).attr('height',bh);
      grp.feats.slice().sort(function(a,b){return featArea(b)-featArea(a);}).forEach(function(f){
        mask.append('path').attr('d', grp.gen(f)).datum(f).attr('fill','#000000');
      });
      layer.append('image')
        .attr('href',puzzleImage).attr('xlink:href',puzzleImage)
        .attr('x',bx).attr('y',by).attr('width',bw).attr('height',bh)
        .attr('preserveAspectRatio','xMidYMid slice')
        .attr('mask','url(#pzm-sharp-'+grp.key+')');
    });
  }

  // 방문 조각 마스크 갱신 — 기록·소급 태깅 변경을 반영. path는 이미 있으므로
  // fill(흰=보임/검=가림)만 바꾼다 — attr 한 바퀴라 가볍다.
  layer.selectAll('mask.pz-sharp-mask path').attr('fill', function(f){
    return activeRecordFor((f&&f.properties&&f.properties.CODE)||'') ? '#FFFFFF' : '#000000';
  });
}
function updateMap() {
  if (!svgElement) return;

  // 지역별 사진 패턴(pat-*) — 사진이 바뀌면 '패턴 id 자체'를 바꾼다(세대 접미사).
  // WebKit(iOS)은 <pattern> 내부 변경(자식 교체·image href 교체)이 소비자 path를
  // 리페인트하지 않는 오랜 결함이 있어, 같은 id로 내용만 갈아끼우면 사진 변경이 지도에
  // 반영되지 않았다. fill 속성값이 바뀌면(url(#...-r1)) 어떤 엔진이든 페인트 서버를
  // 재해석하므로 확실하다. 사진이 안 바뀐 지역은 id가 그대로라 리페인트 비용도 없다.
  var defs = svgElement.select('defs.region-defs');
  if (defs.empty()) defs = svgElement.append('defs').attr('class','region-defs');
  ensurePuzzleLayers();

  patIdByCode = {};
  var wantPat = {}; // patId → 사진 URI
  recordedRegions.forEach(function(r) {
    if (!r.photo) return;
    var st = patRevs[r.nameEn];
    if (!st) { st = patRevs[r.nameEn] = { photo: r.photo, rev: 0 }; }
    else if (st.photo !== r.photo) { st.photo = r.photo; st.rev++; }
    var id = 'pat-' + r.nameEn.replace(/[^a-zA-Z0-9]/g, '') + '-r' + st.rev;
    patIdByCode[r.nameEn] = id;
    wantPat[id] = r.photo;
  });
  // 사진이 사라졌거나 세대가 지난 패턴 제거
  defs.selectAll('pattern').each(function() {
    var id = this.getAttribute('id');
    if (!wantPat[id]) d3.select(this).remove();
  });
  // 없는 패턴만 생성 — 한번 만든 id의 내용은 불변이라 내부 갱신이 필요 없다
  Object.keys(wantPat).forEach(function(id) {
    if (!defs.select('pattern#' + id).empty()) return;
    var pat = defs.append('pattern')
      .attr('id', id)
      .attr('patternContentUnits', 'objectBoundingBox')
      .attr('width', 1)
      .attr('height', 1);
    pat.append('image')
      .attr('href', wantPat[id])
      .attr('xlink:href', wantPat[id])
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('width', 1)
      .attr('height', 1);
  });

  // 채움색 + 경계선(색/두께) + 탭 가능 여부 갱신
  // stroke-width는 현재 확대 배율을 반영(curStrokeWidth) — 확대 상태에서 재렌더 시 선이 다시 두꺼워지지 않게
  if (pathElements) pathElements.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', curStrokeWidth).attr('stroke-opacity', strokeOpFor).style('pointer-events', 'auto');

  Object.keys(insetPathElements).forEach(function(key) {
    var sel = insetPathElements[key];
    if (sel) sel.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', curStrokeWidth).attr('stroke-opacity', strokeOpFor).style('pointer-events', 'auto');
  });

  reorderEmph();
}

// 강조 스트로크(활성 기록·검색)가 있는 피처를 맨 위로 올린다.
// 그리기 순서가 면적 큰 순이라, 강조된 큰 주(이스탄불 등)의 외곽선을 나중에 그려진
// 더 작은 이웃 주의 어두운 경계선이 덮어 '선이 끊겨' 보이는 문제 방지.
// 올리는 순서 = 최종 z-순서: 인기명소 < 활성 < 검색 강조.
function reorderEmph(){
  if(!pathElements) return;
  if(showPopular){
    pathElements.filter(function(d){ return POPULAR_CODES.indexOf(d.properties.CODE||'')>=0; }).raise();
  }
  pathElements.filter(function(d){ return !!activeRecordFor(d.properties.CODE||''); }).raise();
  if(searchedRegion){
    pathElements.filter(function(d){ return (d.properties.NAME_1||'')===searchedRegion; }).raise();
  }
}

// 조각 채움 연출 — 새로 방문된 지역의 마스크를 검정→흰으로 0.4초 페이드해 그림이
// '조각을 끼우듯' 떠오르게 한다. updateMap(ensurePuzzleLayers)이 이미 흰색으로 세팅한
// 뒤에 불리므로, 검정으로 되돌린 다음 트랜지션한다(최종 상태는 세팅과 일치).
// completing이면 햅틱은 완성 연출(Success)이 담당하므로 piecePlaced 메시지는 생략한다.
function playPiecePlaced(newCodes, completing){
  if(!gElement) return;
  gElement.selectAll('g.pz-layer mask.pz-sharp-mask path')
    .filter(function(f){ return !!(f && f.properties && newCodes.indexOf(f.properties.CODE||'')>=0); })
    .attr('fill','#000000')
    .transition().duration(400).attr('fill','#FFFFFF');
  if(!completing && window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'piecePlaced'}));
  }
}
// 완성 연출: 마지막 조각(새로 매칭된 지역) 흰 글로우 펄스 → 전 경계선 1초 페이드아웃.
// updateMap이 stroke-opacity를 이미 0으로 세팅한 뒤 불리므로, 펄스는 1로 올렸다가
// 트랜지션으로 0에 수렴시킨다(최종 상태는 updateMap의 세팅과 일치).
function playPuzzleCompletion(newCodes){
  if(!pathElements) return;
  var all=[pathElements];
  Object.keys(insetPathElements).forEach(function(k){ if(insetPathElements[k]) all.push(insetPathElements[k]); });
  all.forEach(function(sel){
    var pulse=sel.filter(function(d){ return newCodes.indexOf(d.properties.CODE||'')>=0; });
    pulse.raise()
      .attr('stroke','#FFFFFF').attr('stroke-opacity',1).attr('stroke-width',2)
      .transition().delay(250).duration(1000).attr('stroke-opacity',0);
    sel.filter(function(d){ return newCodes.indexOf(d.properties.CODE||'')<0; })
      .attr('stroke-opacity',1)
      .transition().delay(250).duration(1000).attr('stroke-opacity',0);
  });
  // 경계선이 다 사라진 직후 그림 위로 광택 스윕 1회 — '한 장의 그림이 완성됐다'의 방점
  setTimeout(playShineSweep, 1300);
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'puzzleCompleted'}));
  }
}

// 완성 광택 스윕 — 대각(그라데이션 자체를 기울임) 광 띠가 나라 그림을 한 번 훑고 사라진다.
// 방문 마스크(완성 시 전 지역 흰색)를 g 래퍼에 걸어 그림 영역 밖으로는 새지 않는다.
// 띠는 마스크 없는 rect가 아니라 mask 걸린 g 안에서 x만 움직인다 — rect 자체에 transform을
// 주면 userSpaceOnUse 마스크와 좌표가 어긋난다.
function playShineSweep(){
  if(!gElement || !(displayMode==='puzzle'&&puzzleImage)) return;
  var layer=gElement.select('g.pz-layer');
  if(layer.empty()) return;
  if(layer.select('#pz-shine-grad').empty()){
    var lg=layer.append('defs').attr('class','pz-shine-defs')
      .append('linearGradient').attr('id','pz-shine-grad')
      .attr('x1','0').attr('y1','0').attr('x2','1').attr('y2','0')
      .attr('gradientTransform','rotate(18)');
    lg.append('stop').attr('offset','0').attr('stop-color','#FFFFFF').attr('stop-opacity','0');
    lg.append('stop').attr('offset','0.5').attr('stop-color','#FFFFFF').attr('stop-opacity','0.22');
    lg.append('stop').attr('offset','1').attr('stop-color','#FFFFFF').attr('stop-opacity','0');
  }
  puzzleGroups.forEach(function(grp){
    var bx=grp.b[0][0], by=grp.b[0][1], bw=grp.b[1][0]-bx, bh=grp.b[1][1]-by;
    if(bw<=0||bh<=0) return;
    var band=bw*0.6;
    var wrap=layer.append('g').attr('mask','url(#pzm-sharp-'+grp.key+')').style('pointer-events','none');
    wrap.append('rect')
      .attr('x',bx-band).attr('y',by).attr('width',band).attr('height',bh)
      .attr('fill','url(#pz-shine-grad)')
      .transition().duration(900).ease(d3.easeCubicInOut)
      .attr('x',bx+bw)
      .on('end',function(){ wrap.remove(); });
  });
}

function handleNativeMessage(e){
  try {
    var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (msg.type === 'setRecordedRegions') {
      recordedRegions = msg.regions || [];
      displayMode = msg.displayMode || 'color';
      defaultColor = msg.defaultColor || '#BF85FC';
      puzzleImage = msg.puzzleImage || null;
      puzzleComplete = !!msg.puzzleComplete;
      updateMap();
      // 진단(MAP_DEBUG) — RN이 보낸 데이터가 실제로 도착했는지 기기에서 확인.
      // 해시 = 전 지역 사진 URI를 이어붙인 체크섬: 어떤 지역이든 사진이 바뀌면 이 값이 바뀐다.
      // 사진이 data URI(수 MB)라 해시 루프가 싸지 않다 — 반드시 MAP_DEBUG 안에서만 돈다.
      if (MAP_DEBUG) {
        var pc = 0, h = 0;
        for (var di = 0; di < recordedRegions.length; di++) {
          var ph = recordedRegions[di].photo;
          if (!ph) continue;
          pc++;
          for (var ci = 0; ci < ph.length; ci++) { h = ((h * 31) + ph.charCodeAt(ci)) | 0; }
        }
        var hs = (h >>> 0).toString(36).slice(0, 6);
        dbgChip(MAP_SCRIPT_VER + ' ' + displayMode + ' 사진' + pc + ' 해시:' + hs + ' 퍼즐:' + (puzzleImage ? puzzleImage.slice(-10) : '없음'));
      }
      // 완성 전이 감지 — '미완성→완성'으로 바뀐 그 수신에서만 연출.
      // 첫 수신은 기준선만 설정한다(이미 완성 상태로 진입하면 연출 없이 완성 화면).
      // 그림이 없으면 연출도 없다(퍼즐이 안 그려지는 상태에서 경계선 페이드만 돌면 이상하다).
      // 조각 채움 연출도 같은 기준선 규칙 — 지도를 보는 중에 도착한 변경에만 페이드가 돈다.
      if (displayMode === 'puzzle' && puzzleImage) {
        var cur = recordedRegions.map(function(r){ return r.nameEn; });
        if (puzzlePrevComplete === null) {
          puzzlePrevComplete = puzzleComplete; prevMatchedCodes = cur;
        } else {
          var newCodes = cur.filter(function(c){ return prevMatchedCodes.indexOf(c) < 0; });
          var completing = puzzleComplete && !puzzlePrevComplete;
          if (newCodes.length > 0) playPiecePlaced(newCodes, completing);
          if (completing) playPuzzleCompletion(newCodes);
          puzzlePrevComplete = puzzleComplete; prevMatchedCodes = cur;
        }
      }
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
