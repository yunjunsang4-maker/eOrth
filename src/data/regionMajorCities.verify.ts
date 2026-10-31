// src/data/regionMajorCities.verify.ts
// 지역 주요 도시 표(regionMajorCities)의 정합성 + 도시가 정말 그 광역 안에 있는지 좌표로 검사한다.
// 괄호 속 도시가 엉뚱한 도에 붙으면(예: 자킨토스를 펠로폰네소스에) 사용자는 틀린 지역을 고르게 된다 —
// 예외도 로그도 없이 조용히 틀린다. 그래서 모든 도시에 좌표를 두고 지오 폴리곤 point-in-polygon으로 확인한다.
//
// 좌표 출처: ① cityLabels.ts(CITY_LABELS — 앱이 이미 쓰는 좌표, 한글·영문 둘 다 같을 때만 매칭)가 우선,
//           (en만으로 매칭하면 포르투갈 Lagos가 나이지리아 Lagos 좌표를 집는다 — 라벨에 나라 정보가 없다)
//           ② 없으면 아래 COORDS(도심 근사 ±0.1°, 이 검증 전용 — 번들에 안 들어간다).
// 지오는 visvalingam 25% 단순화라 해안·섬·경계 도시가 폴리곤 바로 밖에 떨어질 수 있다.
// 그래서 "자기 지역 안" 또는 "어느 지역 안에도 없고, 같은 나라에서 가장 가까운 지역이 자기 지역이며 NEAR_DEG 이내"를
// 통과로 본다(근접 통과는 목록으로 따로 출력한다). 다른 지역 폴리곤 안에 들어가면 무조건 실패다.
// 지오 쪽이 거친 곳은 실제 소속이 맞아도 실패한다 — 예: NE의 세종 폴리곤(12점)이 공주 시내를 덮어
// 충청남도에서 공주를 뺐다. 지도와 괄호가 서로 다른 말을 하면 사용자는 지도를 믿으므로, 그런 도시는 넣지 않는다.
import { REGION_MAJOR_CITIES, regionMajorCities, regionCitiesMatch } from './regionMajorCities';
import { CITY_LABELS } from './cityLabels';
import { getCountryGeo, GEO_COUNTRY_CODES } from './countryGeo';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const NEAR_DEG = 0.3; // ≈ 33km — 단순화로 사라진 작은 섬(피피섬 0.25°)까지. 이웃 도 오배정은 '가장 가까운 지역' 조건이 막는다

// `${CODE}:${en}` → [lat, lon]. CITY_LABELS에 같은 en이 있으면 그쪽 좌표를 쓰므로 여기엔 없다.
const COORDS: Record<string, [number, number]> = {
  'KR-41:Suwon': [37.26, 127.03], 'KR-41:Gapyeong': [37.83, 127.51],
  'KR-42:Gangneung': [37.75, 128.90], 'KR-42:Sokcho': [38.21, 128.59],
  'KR-43:Cheongju': [36.64, 127.49], 'KR-43:Danyang': [36.98, 128.37],
  'KR-44:Cheonan': [36.81, 127.15], 'KR-44:Buyeo': [36.28, 126.91],
  'KR-45:Jeonju': [35.82, 127.15], 'KR-45:Gunsan': [35.97, 126.74],
  'KR-46:Yeosu': [34.76, 127.66], 'KR-46:Suncheon': [34.95, 127.49],
  'KR-47:Gyeongju': [35.84, 129.21], 'KR-47:Andong': [36.57, 128.73],
  'KR-48:Tongyeong': [34.85, 128.43], 'KR-48:Geoje': [34.88, 128.62],
  'JP-01:Hakodate': [41.77, 140.73],
  'JP-02:Hirosaki': [40.60, 140.46], 'JP-03:Morioka': [39.70, 141.15], 'JP-04:Sendai': [38.27, 140.87],
  'JP-07:Aizuwakamatsu': [37.49, 139.93], 'JP-08:Mito': [36.37, 140.47], 'JP-09:Nikko': [36.75, 139.60],
  'JP-10:Kusatsu': [36.62, 138.60], 'JP-11:Kawagoe': [35.93, 139.49], 'JP-12:Narita': [35.78, 140.32],
  'JP-14:Yokohama': [35.44, 139.64], 'JP-14:Kamakura': [35.32, 139.55],
  'JP-17:Kanazawa': [36.56, 136.66], 'JP-19:Kawaguchiko': [35.50, 138.76],
  'JP-20:Karuizawa': [36.35, 138.60], 'JP-20:Matsumoto': [36.24, 137.97],
  'JP-21:Takayama': [36.15, 137.25], 'JP-21:Shirakawa-go': [36.26, 136.91],
  'JP-22:Atami': [35.10, 139.07], 'JP-22:Hamamatsu': [34.71, 137.73],
  'JP-23:Nagoya': [35.18, 136.91], 'JP-24:Ise': [34.49, 136.71], 'JP-25:Otsu': [35.00, 135.87],
  'JP-28:Kobe': [34.69, 135.20], 'JP-28:Himeji': [34.82, 134.69],
  'JP-30:Shirahama': [33.68, 135.35], 'JP-30:Koyasan': [34.21, 135.59],
  'JP-31:Yonago': [35.43, 133.33], 'JP-32:Matsue': [35.47, 133.05], 'JP-32:Izumo': [35.37, 132.75],
  'JP-33:Kurashiki': [34.59, 133.77], 'JP-34:Miyajima': [34.30, 132.32], 'JP-35:Shimonoseki': [33.96, 130.94],
  'JP-37:Takamatsu': [34.34, 134.05], 'JP-38:Matsuyama': [33.84, 132.77], 'JP-42:Sasebo': [33.18, 129.72],
  'JP-43:Aso': [32.95, 131.10], 'JP-44:Beppu': [33.28, 131.49], 'JP-44:Yufuin': [33.27, 131.37],
  'JP-46:Yakushima': [30.36, 130.53], 'JP-47:Naha': [26.21, 127.68],
  'CN-AH:Huangshan': [29.71, 118.34], 'CN-AH:Hefei': [31.82, 117.23],
  'CN-FJ:Xiamen': [24.48, 118.09], 'CN-FJ:Fuzhou': [26.07, 119.30],
  'CN-GD:Shenzhen': [22.54, 114.06],
  'CN-GS:Dunhuang': [40.14, 94.66], 'CN-GS:Lanzhou': [36.06, 103.83],
  'CN-GX:Guilin': [25.27, 110.29], 'CN-GX:Nanning': [22.82, 108.37],
  'CN-GZ:Guiyang': [26.65, 106.63],
  'CN-HA:Zhengzhou': [34.75, 113.63], 'CN-HA:Luoyang': [34.62, 112.45],
  'CN-HB:Wuhan': [30.59, 114.31],
  'CN-HE:Shijiazhuang': [38.04, 114.51], 'CN-HE:Chengde': [40.95, 117.96],
  'CN-HI:Sanya': [18.25, 109.51], 'CN-HI:Haikou': [20.04, 110.32],
  'CN-HL:Harbin': [45.80, 126.53],
  'CN-HN:Zhangjiajie': [29.12, 110.48], 'CN-HN:Changsha': [28.23, 112.94],
  'CN-JL:Changchun': [43.82, 125.32], 'CN-JL:Yanji': [42.90, 129.51],
  'CN-JS:Nanjing': [32.06, 118.80], 'CN-JS:Suzhou': [31.30, 120.59],
  'CN-JX:Nanchang': [28.68, 115.86], 'CN-JX:Jingdezhen': [29.27, 117.18],
  'CN-LN:Shenyang': [41.81, 123.43], 'CN-LN:Dalian': [38.91, 121.61],
  'CN-NM:Hohhot': [40.84, 111.75], 'CN-NX:Yinchuan': [38.49, 106.23], 'CN-QH:Xining': [36.62, 101.78],
  'CN-SC:Jiuzhaigou': [33.26, 103.92],
  'CN-SD:Qingdao': [36.07, 120.38], 'CN-SD:Jinan': [36.65, 117.12],
  'CN-SX:Taiyuan': [37.87, 112.55], 'CN-SX:Pingyao': [37.19, 112.18],
  'CN-XJ:Urumqi': [43.83, 87.62], 'CN-XJ:Kashgar': [39.47, 75.99],
  'CN-XZ:Lhasa': [29.65, 91.12],
  'CN-YN:Kunming': [25.04, 102.71], 'CN-YN:Lijiang': [26.87, 100.23],
  'CN-ZJ:Hangzhou': [30.27, 120.16],
  'US-AK:Anchorage': [61.22, -149.90], 'US-AR:Little Rock': [34.75, -92.29],
  'US-AZ:Phoenix': [33.45, -112.07], 'US-AZ:Sedona': [34.87, -111.76],
  'US-CO:Denver': [39.74, -104.99], 'US-CT:Hartford': [41.76, -72.68],
  'US-FL:Orlando': [28.54, -81.38], 'US-GA:Atlanta': [33.75, -84.39], 'US-HI:Honolulu': [21.31, -157.86],
  'US-IA:Des Moines': [41.59, -93.62], 'US-ID:Boise': [43.62, -116.20], 'US-IN:Indianapolis': [39.77, -86.16],
  'US-KS:Wichita': [37.69, -97.34], 'US-KY:Louisville': [38.25, -85.76], 'US-LA:New Orleans': [29.95, -90.07],
  'US-MD:Baltimore': [39.29, -76.61], 'US-ME:Portland': [43.66, -70.26], 'US-MI:Detroit': [42.33, -83.05],
  'US-MN:Minneapolis': [44.98, -93.27],
  // 세인트루이스 강변 도심(-90.19)은 미시시피강 = 주 경계라 단순화 폴리곤상 일리노이로 넘어간다 → 시 안쪽 좌표
  'US-MO:St. Louis': [38.63, -90.25], 'US-MO:Kansas City': [39.10, -94.58],
  'US-NC:Charlotte': [35.23, -80.84], 'US-NE:Omaha': [41.26, -95.94],
  'US-NJ:Newark': [40.74, -74.17], 'US-NJ:Atlantic City': [39.36, -74.42],
  'US-NM:Santa Fe': [35.69, -105.94], 'US-NM:Albuquerque': [35.08, -106.65],
  'US-OH:Cleveland': [41.50, -81.69], 'US-OH:Columbus': [39.96, -83.00],
  'US-OK:Tulsa': [36.15, -95.99], 'US-OR:Portland': [45.52, -122.68],
  'US-PA:Philadelphia': [39.95, -75.17], 'US-PA:Pittsburgh': [40.44, -79.99],
  'US-RI:Providence': [41.82, -71.41], 'US-RI:Newport': [41.49, -71.31],
  'US-SC:Charleston': [32.78, -79.93], 'US-SD:Rapid City': [44.08, -103.23],
  'US-TN:Nashville': [36.16, -86.78], 'US-TN:Memphis': [35.15, -90.05],
  'US-TX:Houston': [29.76, -95.37], 'US-TX:Dallas': [32.78, -96.80],
  'US-UT:Salt Lake City': [40.76, -111.89],
  'US-VA:Richmond': [37.54, -77.44], 'US-VA:Virginia Beach': [36.85, -75.98],
  'US-VT:Burlington': [44.48, -73.21], 'US-WI:Milwaukee': [43.04, -87.91], 'US-WY:Yellowstone': [44.60, -110.50],
  'CA-AB:Calgary': [51.05, -114.07], 'CA-AB:Banff': [51.18, -115.57],
  'CA-BC:Victoria': [48.43, -123.37], 'CA-MB:Winnipeg': [49.90, -97.14], 'CA-NB:Fredericton': [45.96, -66.64],
  "CA-NL:St. John's": [47.56, -52.71], 'CA-NS:Halifax': [44.65, -63.57], 'CA-NT:Yellowknife': [62.45, -114.37],
  'CA-NU:Iqaluit': [63.75, -68.52], 'CA-ON:Niagara Falls': [43.09, -79.08], 'CA-PE:Charlottetown': [46.24, -63.13],
  'CA-QC:Quebec City': [46.81, -71.21],
  'CA-SK:Regina': [50.45, -104.62], 'CA-SK:Saskatoon': [52.13, -106.67], 'CA-YT:Whitehorse': [60.72, -135.06],
  'BR-AC:Rio Branco': [-9.97, -67.81], 'BR-AL:Maceio': [-9.67, -35.74], 'BR-AM:Manaus': [-3.12, -60.02],
  'BR-AP:Macapa': [0.03, -51.07], 'BR-BA:Salvador': [-12.97, -38.50], 'BR-CE:Fortaleza': [-3.73, -38.53],
  'BR-DF:Brasilia': [-15.79, -47.88], 'BR-ES:Vitoria': [-20.32, -40.34], 'BR-GO:Goiania': [-16.69, -49.26],
  'BR-MA:Sao Luis': [-2.53, -44.30],
  'BR-MG:Belo Horizonte': [-19.92, -43.94], 'BR-MG:Ouro Preto': [-20.39, -43.50],
  'BR-MS:Campo Grande': [-20.47, -54.62], 'BR-MT:Cuiaba': [-15.60, -56.10], 'BR-PA:Belem': [-1.46, -48.49],
  'BR-PB:Joao Pessoa': [-7.12, -34.86], 'BR-PE:Recife': [-8.05, -34.88], 'BR-PI:Teresina': [-5.09, -42.80],
  'BR-PR:Curitiba': [-25.43, -49.27], 'BR-PR:Foz do Iguacu': [-25.55, -54.59],
  'BR-RN:Natal': [-5.79, -35.21], 'BR-RO:Porto Velho': [-8.76, -63.90], 'BR-RR:Boa Vista': [2.82, -60.67],
  'BR-RS:Porto Alegre': [-30.03, -51.23], 'BR-SC:Florianopolis': [-27.60, -48.55], 'BR-SE:Aracaju': [-10.91, -37.07],
  'BR-TO:Palmas': [-10.18, -48.33],
  'CO-AMA:Leticia': [-4.21, -69.94], 'CO-ANT:Medellin': [6.24, -75.58], 'CO-ATL:Barranquilla': [10.96, -74.80],
  'CO-BOL:Cartagena': [10.39, -75.51], 'CO-BOY:Villa de Leyva': [5.63, -73.52], 'CO-BOY:Tunja': [5.54, -73.36],
  'CO-CAL:Manizales': [5.07, -75.52], 'CO-CAQ:Florencia': [1.61, -75.61], 'CO-CAS:Yopal': [5.34, -72.40],
  'CO-CAU:Popayan': [2.44, -76.61], 'CO-CES:Valledupar': [10.46, -73.25], 'CO-CHO:Quibdo': [5.69, -76.66],
  'CO-COR:Monteria': [8.75, -75.88], 'CO-CUN:Zipaquira': [5.02, -74.00], 'CO-GUA:Inirida': [3.87, -67.92],
  'CO-HUI:Neiva': [2.93, -75.28], 'CO-LAG:Riohacha': [11.54, -72.91], 'CO-MAG:Santa Marta': [11.24, -74.20],
  'CO-MET:Villavicencio': [4.14, -73.63], 'CO-NAR:Pasto': [1.21, -77.28], 'CO-NSA:Cucuta': [7.89, -72.50],
  'CO-PUT:Mocoa': [1.15, -76.65], 'CO-QUI:Salento': [4.64, -75.57], 'CO-RIS:Pereira': [4.81, -75.69],
  'CO-SAN:Bucaramanga': [7.12, -73.12], 'CO-SUC:Sincelejo': [9.30, -75.40], 'CO-TOL:Ibague': [4.44, -75.23],
  'CO-VAC:Cali': [3.45, -76.53], 'CO-VAU:Mitu': [1.25, -70.23],
  'DE-BB:Potsdam': [52.39, 13.06], 'DE-BW:Stuttgart': [48.78, 9.18], 'DE-BW:Heidelberg': [49.40, 8.69],
  'DE-BY:Nuremberg': [49.45, 11.08], 'DE-MV:Rostock': [54.09, 12.14], 'DE-NI:Hanover': [52.37, 9.73],
  'DE-NW:Cologne': [50.94, 6.96], 'DE-NW:Dusseldorf': [51.23, 6.78], 'DE-RP:Mainz': [50.00, 8.27],
  'DE-SH:Kiel': [54.32, 10.14], 'DE-SH:Lubeck': [53.87, 10.69], 'DE-SL:Saarbrucken': [49.23, 7.00],
  'DE-SN:Dresden': [51.05, 13.74], 'DE-SN:Leipzig': [51.34, 12.37], 'DE-ST:Magdeburg': [52.13, 11.63],
  'DE-TH:Erfurt': [50.98, 11.03], 'DE-TH:Weimar': [50.98, 11.33],
  'AT-1:Eisenstadt': [47.85, 16.52], 'AT-2:Klagenfurt': [46.62, 14.31], 'AT-3:St. Polten': [48.20, 15.62],
  'AT-4:Linz': [48.31, 14.29], 'AT-4:Hallstatt': [47.56, 13.65], 'AT-6:Graz': [47.07, 15.44],
  'AT-7:Innsbruck': [47.27, 11.39], 'AT-8:Bregenz': [47.50, 9.75],
  'ES-AN:Granada': [37.18, -3.60], 'ES-AR:Zaragoza': [41.65, -0.89],
  'ES-AS:Oviedo': [43.36, -5.85], 'ES-AS:Gijon': [43.54, -5.66], 'ES-CB:Santander': [43.46, -3.80],
  'ES-CL:Salamanca': [40.97, -5.66], 'ES-CL:Segovia': [40.95, -4.12], 'ES-CM:Toledo': [39.86, -4.02],
  'ES-CN:Tenerife': [28.29, -16.63], 'ES-CN:Las Palmas': [28.12, -15.43],
  'ES-EX:Merida': [38.92, -6.34], 'ES-EX:Caceres': [39.47, -6.37],
  'ES-GA:Santiago de Compostela': [42.88, -8.54], 'ES-LO:Logrono': [42.47, -2.45], 'ES-NA:Pamplona': [42.81, -1.64],
  'ES-PM:Mallorca': [39.57, 2.65], 'ES-PM:Ibiza': [38.91, 1.43],
  'ES-PV:Bilbao': [43.26, -2.93], 'ES-PV:San Sebastian': [43.32, -1.98],
  'FR-ARA:Lyon': [45.76, 4.84], 'FR-ARA:Annecy': [45.90, 6.13], 'FR-BFC:Dijon': [47.32, 5.04],
  'FR-BRE:Rennes': [48.11, -1.68], 'FR-BRE:Saint-Malo': [48.65, -2.01], 'FR-COR:Ajaccio': [41.92, 8.74],
  'FR-CVL:Tours': [47.39, 0.69], 'FR-CVL:Orleans': [47.90, 1.91],
  'FR-GES:Strasbourg': [48.57, 7.75], 'FR-GES:Colmar': [48.08, 7.36],
  'FR-GUA:Pointe-a-Pitre': [16.24, -61.53], 'FR-GUF:Cayenne': [4.92, -52.31], 'FR-HDF:Lille': [50.63, 3.06],
  'FR-IDF:Versailles': [48.80, 2.13], 'FR-LRE:Saint-Denis': [-20.88, 55.45], 'FR-MAY:Mamoudzou': [-12.78, 45.23],
  'FR-MTQ:Fort-de-France': [14.60, -61.07],
  'FR-NAQ:Bordeaux': [44.84, -0.58], 'FR-NAQ:Biarritz': [43.48, -1.56],
  'FR-NOR:Rouen': [49.44, 1.10], 'FR-NOR:Mont-Saint-Michel': [48.636, -1.511],
  'FR-OCC:Toulouse': [43.60, 1.44], 'FR-OCC:Montpellier': [43.61, 3.88],
  'FR-PAC:Marseille': [43.30, 5.37], 'FR-PDL:Nantes': [47.22, -1.55],
  'GB-ENG:Manchester': [53.48, -2.24], 'GB-NIR:Belfast': [54.60, -5.93],
  'GB-SCT:Glasgow': [55.86, -4.25], 'GB-WLS:Cardiff': [51.48, -3.18],
  'GR-A:Kavala': [40.94, 24.41], 'GR-B:Thessaloniki': [40.64, 22.94], 'GR-C:Kastoria': [40.52, 21.27],
  'GR-D:Ioannina': [39.66, 20.85], 'GR-E:Meteora': [39.72, 21.63], 'GR-E:Volos': [39.36, 22.94],
  'GR-F:Corfu': [39.62, 19.92], 'GR-F:Zakynthos': [37.78, 20.90],
  'GR-G:Patras': [38.25, 21.73], 'GR-G:Olympia': [37.64, 21.63], 'GR-H:Delphi': [38.48, 22.50],
  'GR-J:Nafplio': [37.57, 22.81], 'GR-J:Mycenae': [37.73, 22.76], 'GR-K:Lesbos': [39.10, 26.33],
  'GR-L:Mykonos': [37.45, 25.33], 'GR-M:Heraklion': [35.34, 25.13], 'GR-M:Chania': [35.51, 24.02],
  'IT-21:Turin': [45.07, 7.69], 'IT-25:Como': [45.81, 9.09],
  'IT-32:Trento': [46.07, 11.12], 'IT-32:Bolzano': [46.50, 11.35], 'IT-34:Verona': [45.44, 10.99],
  'IT-36:Trieste': [45.65, 13.78], 'IT-42:Genoa': [44.41, 8.93], 'IT-42:Cinque Terre': [44.13, 9.71],
  'IT-45:Bologna': [44.49, 11.34], 'IT-52:Pisa': [43.72, 10.40],
  'IT-55:Perugia': [43.11, 12.39], 'IT-55:Assisi': [43.07, 12.62], 'IT-57:Ancona': [43.62, 13.52],
  'IT-65:Pescara': [42.46, 14.21], 'IT-67:Campobasso': [41.56, 14.67],
  'IT-72:Naples': [40.85, 14.27], 'IT-72:Amalfi': [40.63, 14.60], 'IT-75:Bari': [41.12, 16.87],
  'IT-77:Matera': [40.67, 16.60], 'IT-78:Reggio Calabria': [38.11, 15.65],
  'IT-82:Palermo': [38.12, 13.36], 'IT-82:Taormina': [37.85, 15.29], 'IT-88:Cagliari': [39.22, 9.12],
  'MA-01:Chefchaouen': [35.17, -5.27], 'MA-02:Kenitra': [34.26, -6.58], 'MA-04:Oujda': [34.68, -1.91],
  'MA-06:Merzouga': [31.10, -4.01], 'MA-09:Settat': [33.00, -7.62], 'MA-10:El Jadida': [33.25, -8.50],
  'MA-12:Beni Mellal': [32.34, -6.35], 'MA-13:Agadir': [30.42, -9.60], 'MA-13:Ouarzazate': [30.92, -6.89],
  'MA-16:Dakhla': [23.70, -15.94],
  'MX-BCN:Tijuana': [32.51, -117.04], 'MX-BCS:Los Cabos': [22.89, -109.92], 'MX-BCS:La Paz': [24.14, -110.31],
  'MX-CHP:San Cristobal': [16.74, -92.64], 'MX-COA:Saltillo': [25.42, -101.00], 'MX-GRO:Acapulco': [16.85, -99.88],
  'MX-GUA:San Miguel de Allende': [20.91, -100.74], 'MX-HID:Pachuca': [20.10, -98.76],
  'MX-JAL:Guadalajara': [20.67, -103.35], 'MX-JAL:Puerto Vallarta': [20.62, -105.23],
  'MX-MEX:Teotihuacan': [19.69, -98.84], 'MX-MEX:Toluca': [19.29, -99.66],
  'MX-MIC:Morelia': [19.70, -101.19], 'MX-MOR:Cuernavaca': [18.92, -99.23], 'MX-NLE:Monterrey': [25.69, -100.32],
  'MX-ROO:Tulum': [20.21, -87.47], 'MX-SIN:Mazatlan': [23.25, -106.41], 'MX-SON:Hermosillo': [29.07, -110.96],
  'MX-TAB:Villahermosa': [17.99, -92.93], 'MX-TAM:Tampico': [22.25, -97.86],
  'MX-YUC:Merida': [20.97, -89.62], 'MX-YUC:Chichen Itza': [20.68, -88.57],
  'MY-01:Johor Bahru': [1.49, 103.74], 'MY-02:Langkawi': [6.35, 99.80], 'MY-03:Kota Bharu': [6.13, 102.24],
  'MY-06:Cameron Highlands': [4.47, 101.38], 'MY-06:Kuantan': [3.82, 103.33], 'MY-07:George Town': [5.41, 100.33],
  'MY-08:Ipoh': [4.60, 101.08], 'MY-10:Shah Alam': [3.07, 101.52], 'MY-13:Kuching': [1.55, 110.35],
  'NL-FL:Almere': [52.37, 5.21], 'NL-FR:Leeuwarden': [53.20, 5.80], 'NL-GE:Arnhem': [51.98, 5.91],
  'NL-LI:Maastricht': [50.85, 5.69], 'NL-NB:Eindhoven': [51.44, 5.47], 'NL-NH:Zaanse Schans': [52.47, 4.82],
  'NL-ZE:Middelburg': [51.50, 3.61], 'NL-ZH:Rotterdam': [51.92, 4.48], 'NL-ZH:The Hague': [52.08, 4.30],
  'PT-08:Lagos': [37.10, -8.67], 'PT-08:Albufeira': [37.09, -8.25],
  'PT-10:Nazare': [39.60, -9.07], 'PT-10:Obidos': [39.36, -9.16], 'PT-11:Sintra': [38.80, -9.39],
  'PT-14:Fatima': [39.63, -8.67], 'PT-20:Ponta Delgada': [37.74, -25.67], 'PT-30:Funchal': [32.65, -16.91],
  'SA-02:Jeddah': [21.49, 39.19], 'SA-02:Taif': [21.27, 40.42], 'SA-03:AlUla': [26.62, 37.92],
  'SA-04:Dammam': [26.43, 50.10], 'SA-05:Buraydah': [26.33, 43.97], 'SA-08:Arar': [30.98, 41.04],
  'SA-12:Sakaka': [29.97, 40.21], 'SA-14:Abha': [18.22, 42.50],
  'TH-20:Pattaya': [12.93, 100.88], 'TH-21:Ko Samet': [12.57, 101.45], 'TH-23:Ko Chang': [12.05, 102.33],
  'TH-58:Pai': [19.36, 98.44], 'TH-76:Cha-am': [12.80, 99.97], 'TH-77:Hua Hin': [12.57, 99.96],
  'TH-81:Ao Nang': [8.03, 98.82], 'TH-81:Phi Phi Islands': [7.74, 98.77], 'TH-82:Khao Lak': [8.64, 98.25],
  'TH-84:Ko Samui': [9.51, 100.01], 'TH-90:Hat Yai': [7.01, 100.47],
  'TN-11:Carthage': [36.85, 10.33], 'TN-11:Sidi Bou Said': [36.87, 10.35], 'TN-21:Hammamet': [36.40, 10.61],
  'TN-53:El Jem': [35.30, 10.71], 'TN-73:Douz': [33.46, 9.02], 'TN-81:Matmata': [33.54, 9.97],
  'TN-82:Djerba': [33.80, 10.88],
  'TR-07:Alanya': [36.54, 32.00], 'TR-07:Kas': [36.20, 29.64], 'TR-09:Kusadasi': [37.86, 27.26],
  'TR-17:Troy': [39.96, 26.24], 'TR-20:Pamukkale': [37.92, 29.12], 'TR-31:Antakya': [36.20, 36.16],
  'TR-35:Ephesus': [37.94, 27.34], 'TR-41:Izmit': [40.77, 29.92],
  'TR-48:Bodrum': [37.04, 27.43], 'TR-48:Fethiye': [36.62, 29.12],
  'VN-02:Sa Pa': [22.34, 103.84], 'VN-13:Ha Long Bay': [20.91, 107.18], 'VN-24:Phong Nha': [17.59, 106.28],
  'VN-27:Hoi An': [15.88, 108.33], 'VN-31:Quy Nhon': [13.78, 109.22], 'VN-34:Nha Trang': [12.24, 109.19],
  'VN-35:Da Lat': [11.94, 108.44], 'VN-40:Mui Ne': [10.93, 108.28], 'VN-44:Chau Doc': [10.70, 105.12],
  'VN-46:My Tho': [10.36, 106.36], 'VN-47:Phu Quoc': [10.23, 103.96],
  'ZA-EC:Port Elizabeth': [-33.96, 25.60], 'ZA-FS:Bloemfontein': [-29.12, 26.21], 'ZA-GT:Pretoria': [-25.75, 28.19],
  'ZA-LP:Polokwane': [-23.90, 29.45], 'ZA-MP:Nelspruit': [-25.47, 30.97], 'ZA-NC:Kimberley': [-28.74, 24.76],
  'ZA-NL:Durban': [-29.86, 31.02], 'ZA-NW:Sun City': [-25.34, 27.09], 'ZA-WC:Stellenbosch': [-33.93, 18.86],
  'EG-ASN:Abu Simbel': [22.34, 31.63], 'EG-BA:Hurghada': [27.26, 33.81], 'EG-BA:Marsa Alam': [25.07, 34.89],
  'EG-DK:Mansoura': [31.04, 31.38], 'EG-GH:Tanta': [30.79, 31.00],
  'EG-JS:Sharm El Sheikh': [27.92, 34.33], 'EG-JS:Dahab': [28.50, 34.51],
  'EG-MT:Siwa': [29.20, 25.52], 'EG-MT:El Alamein': [30.83, 28.95], 'EG-SIN:El Arish': [31.13, 33.80],
  'AE-AZ:Al Ain': [24.21, 55.74],
};

// ── 지오 색인: CODE → { iso3, rings(외곽 링 + 구멍) 목록 } ──
type Ring = number[][];
type Poly = Ring[]; // [outer, ...holes]
const polysByCode: Record<string, { iso3: string; polys: Poly[] }> = {};
const codesByIso: Record<string, string[]> = {};
for (const iso3 of GEO_COUNTRY_CODES) {
  for (const f of getCountryGeo(iso3)?.features ?? []) {
    const code: string = f?.properties?.CODE;
    const g = f?.geometry;
    if (!code || !g) continue;
    const polys: Poly[] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (!polysByCode[code]) {
      polysByCode[code] = { iso3, polys: [] };
      (codesByIso[iso3] ||= []).push(code);
    }
    polysByCode[code].polys.push(...polys);
  }
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inCode(code: string, lat: number, lon: number): boolean {
  return (polysByCode[code]?.polys ?? []).some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)));
}
// 점↔선분 최단거리(경도는 cos(위도)로 보정한 근사 도 단위)
function distToCode(code: string, lat: number, lon: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const p of polysByCode[code]?.polys ?? []) for (const ring of p) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j][0] * k, ay = ring[j][1], bx = ring[i][0] * k, by = ring[i][1], px = lon * k, py = lat;
      const dx = bx - ax, dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
  }
  return best;
}

// 단순화로 섬 폴리곤 자체가 사라져 '가장 가까운 지역' 조건을 못 맞추는 곳 — 사유와 실제 소속을 적어 둔다.
// 다른 지역 폴리곤 '안'에 들어가는 경우는 여기 넣어도 여전히 실패한다(그건 지도와 괄호가 충돌하는 것).
const ISLAND_EXCEPTIONS: Record<string, string> = {
  'TH-81:Phi Phi Islands': '피피섬은 끄라비주 무앙끄라비군 소속. 지오에 섬 폴리곤이 없어 해상 거리로는 팡응아 해안이 더 가깝다',
};

const labelByPair = new Map(CITY_LABELS.map(c => [`${c.n}|${c.en}`, c]));

// 1. 모든 키가 실제 지오 CODE
eq(Object.keys(REGION_MAJOR_CITIES).filter(c => !polysByCode[c]), [], '모든 키가 실제 지오 CODE');

// 2. 형식: ko/en 개수 같음·1~2개·빈 문자열 없음·en은 ASCII(cityLabels 규칙 — 캔버스·폰트 두부 방지와 같은 관행)
{
  const bad: string[] = [];
  for (const code of Object.keys(REGION_MAJOR_CITIES)) {
    const c = regionMajorCities(code)!;
    if (!c.ko.length || c.ko.length > 2 || c.ko.length !== c.en.length) bad.push(`${code} 개수`);
    if ([...c.ko, ...c.en].some(s => !s || s.trim() !== s)) bad.push(`${code} 빈/공백`);
    if (c.en.some(s => /[^\x20-\x7E]/.test(s))) bad.push(`${code} en 비ASCII`);
    if (c.ko.some(s => /[A-Za-z]/.test(s))) bad.push(`${code} ko에 로마자`);
  }
  eq(bad, [], '도시 1~2개·ko/en 개수 일치·빈 문자열 없음·en ASCII');
}

// 3. 괄호가 이름을 되풀이하지 않는다 — 지역 한글명에 도시 한글명이 그대로 들어 있으면 의미 없는 괄호
{
  const names: Record<string, string> = {};
  for (const iso3 of GEO_COUNTRY_CODES) for (const f of getCountryGeo(iso3)?.features ?? []) names[f.properties.CODE] = f.properties.NL_NAME_1 || '';
  const dup = Object.keys(REGION_MAJOR_CITIES).filter(code => regionMajorCities(code)!.ko.some(k => names[code]?.includes(k)));
  eq(dup, [], '괄호 도시가 지역 이름을 되풀이하지 않음');
}

// 4. 좌표 소속 검사
const near: string[] = [];
const fromLabels: string[] = [];
{
  const missing: string[] = [], wrong: string[] = [], far: string[] = [], dupCoords: string[] = [];
  for (const code of Object.keys(REGION_MAJOR_CITIES)) {
    const { ko, en } = regionMajorCities(code)!;
    const iso3 = polysByCode[code]?.iso3;
    if (!iso3) continue;
    for (const [i, name] of en.entries()) {
      const label = labelByPair.get(`${ko[i]}|${name}`);
      if (label && COORDS[`${code}:${name}`]) dupCoords.push(`${code}:${name}`);
      const pt = label ? [label.lat, label.lon] as [number, number] : COORDS[`${code}:${name}`];
      if (!pt) { missing.push(`${code}:${name}`); continue; }
      if (label) fromLabels.push(`${code}:${name}`);
      const [lat, lon] = pt;
      if (inCode(code, lat, lon)) continue;
      const other = (codesByIso[iso3] || []).find(c => c !== code && inCode(c, lat, lon));
      if (other) { wrong.push(`${code}:${name} → ${other} 안`); continue; }
      const d = distToCode(code, lat, lon);
      const closer = (codesByIso[iso3] || []).find(c => c !== code && distToCode(c, lat, lon) < d);
      if (ISLAND_EXCEPTIONS[`${code}:${name}`] && d <= NEAR_DEG) { near.push(`${code}:${name} (경계 밖 ${d.toFixed(3)}°, 예외: ${ISLAND_EXCEPTIONS[`${code}:${name}`]})`); continue; }
      if (d <= NEAR_DEG && !closer) near.push(`${code}:${name} (경계 밖 ${d.toFixed(3)}°)`);
      else far.push(`${code}:${name} (경계 밖 ${d.toFixed(3)}°${closer ? `, ${closer}가 더 가까움` : ''})`);
    }
  }
  eq(missing, [], '모든 도시에 좌표가 있음(CITY_LABELS 또는 COORDS)');
  eq(wrong, [], '어떤 도시도 같은 나라의 다른 지역 폴리곤 안에 있지 않음');
  eq(far, [], `어느 지역 안에도 없으면 가장 가까운 지역이 자기 지역이고 ${NEAR_DEG}° 이내`);
  // COORDS에 남은 고아 좌표 — 표에서 도시를 빼고 좌표만 남기면 다음 사람이 헷갈린다
  const used = new Set(Object.keys(REGION_MAJOR_CITIES).flatMap(code => regionMajorCities(code)!.en.map(n => `${code}:${n}`)));
  eq(Object.keys(COORDS).filter(k => !used.has(k)), [], 'COORDS에 쓰이지 않는 좌표 없음');
  // CITY_LABELS와 같은 도시면 COORDS 중복을 두지 않는다(좌표 출처 하나)
  eq(dupCoords, [], 'CITY_LABELS 도시는 COORDS에 중복 없음');
}

// 5. 요구 예시·대표 케이스 — 표를 고치다 이 값이 바뀌면 사용자 예시가 깨진 것
eq(regionMajorCities('KR-47'), { ko: ['경주', '안동'], en: ['Gyeongju', 'Andong'] }, '요구 예시: 경상북도 (경주·안동)');
eq(regionMajorCities('JP-14')?.en, ['Yokohama', 'Kamakura'], '요구 예시: Kanagawa (Yokohama·Kamakura)');
// 자킨토스는 이오니아 제도(GR-F) — CountryMapView 주석의 사고 재발 방지
eq(regionMajorCities('GR-F')?.ko.includes('자킨토스'), true, '자킨토스 → 이오니아 제도(GR-F)');
eq(regionMajorCities('GR-J')?.ko.includes('자킨토스'), false, '자킨토스는 펠로폰네소스(GR-J)에 없음');
// 도시=광역인 곳은 항목이 없어야 괄호가 안 붙는다
eq(['KR-11', 'JP-13', 'DE-BE', 'AT-9', 'TH-10'].map(c => regionMajorCities(c)), [null, null, null, null, null], '도시=광역(서울·도쿄·베를린·빈·방콕)은 괄호 없음');
// 널 계열 — 각각 따로
eq(regionMajorCities(''), null, "빈 코드 '' → null");
eq(regionMajorCities(undefined), null, 'undefined → null');
eq(regionMajorCities(null), null, 'null → null');
eq(regionMajorCities('XX-99'), null, '모르는 코드 → null');

// 6. 검색 — '경주' 입력 → 경상북도
eq(regionCitiesMatch('KR-47', '경주'), true, "검색: '경주' → 경상북도");
eq(regionCitiesMatch('KR-47', '  경주 '), true, '검색: 앞뒤 공백 무시');
eq(regionCitiesMatch('JP-14', 'YOKO'), true, "검색: 'YOKO' → 가나가와(대소문자 무시·부분 일치)");
eq(regionCitiesMatch('JP-14', '요코하마'), true, "검색: '요코하마' → 가나가와");
eq(regionCitiesMatch('KR-46', '경주'), false, "검색: '경주'는 전라남도에 안 걸림");
eq(regionCitiesMatch('KR-47', ''), false, '검색: 빈 검색어는 false(전체 노출은 필터가 따로 처리)');
eq(regionCitiesMatch('KR-47', '   '), false, '검색: 공백만 있으면 false');
eq(regionCitiesMatch('KR-11', '서울'), false, '검색: 도시 항목 없는 지역은 false');
eq(regionCitiesMatch(undefined, '경주'), false, '검색: 코드 undefined → false');

// ── 보고용 출력 ──
console.log(`\n· CITY_LABELS 좌표로 검사: ${fromLabels.length}개 — ${fromLabels.join(', ')}`);
console.log(`· 근접 통과(단순화 경계 밖 ${NEAR_DEG}° 이내, 다른 지역 안 아님): ${near.length}개`);
for (const n of near) console.log(`   - ${n}`);
{
  const lines: string[] = [];
  for (const iso3 of GEO_COUNTRY_CODES) {
    const codes = codesByIso[iso3] || [];
    lines.push(`${iso3} ${codes.filter(c => REGION_MAJOR_CITIES[c]).length}/${codes.length}`);
  }
  console.log(`· 국가별 커버리지: ${lines.join(' · ')}`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
