// 국가 수도(영문) — 마이 티켓 상단 '최근 여행지'에서 국기 대신 수도명 표시용.
// 키는 ISO2 소문자(constants/countries.ts term의 첫 토큰과 동일).
import { COUNTRIES } from './countries';

export const CAPITALS: Record<string, string> = {
  kr: 'Seoul', jp: 'Tokyo', cn: 'Beijing', tw: 'Taipei', hk: 'Hong Kong', mo: 'Macau',
  th: 'Bangkok', vn: 'Hanoi', ph: 'Manila', id: 'Jakarta', my: 'Kuala Lumpur', sg: 'Singapore',
  kh: 'Phnom Penh', la: 'Vientiane', mm: 'Naypyidaw', bn: 'Bandar Seri Begawan', tl: 'Dili',
  in: 'New Delhi', lk: 'Colombo', np: 'Kathmandu', bt: 'Thimphu', pk: 'Islamabad', bd: 'Dhaka',
  mv: 'Male', mn: 'Ulaanbaatar', kz: 'Astana', uz: 'Tashkent', tm: 'Ashgabat', tj: 'Dushanbe',
  kg: 'Bishkek', af: 'Kabul', ir: 'Tehran', iq: 'Baghdad', sa: 'Riyadh', ae: 'Abu Dhabi',
  kw: 'Kuwait City', bh: 'Manama', qa: 'Doha', om: 'Muscat', ye: 'Sanaa', jo: 'Amman',
  il: 'Jerusalem', ps: 'Ramallah', lb: 'Beirut', sy: 'Damascus', tr: 'Ankara', cy: 'Nicosia',
  am: 'Yerevan', az: 'Baku', ge: 'Tbilisi',
  gb: 'London', fr: 'Paris', de: 'Berlin', it: 'Rome', es: 'Madrid', pt: 'Lisbon',
  nl: 'Amsterdam', be: 'Brussels', ch: 'Bern', at: 'Vienna', se: 'Stockholm', no: 'Oslo',
  dk: 'Copenhagen', fi: 'Helsinki', is: 'Reykjavik', ie: 'Dublin', pl: 'Warsaw', cz: 'Prague',
  sk: 'Bratislava', hu: 'Budapest', ro: 'Bucharest', bg: 'Sofia', gr: 'Athens', hr: 'Zagreb',
  si: 'Ljubljana', rs: 'Belgrade', ba: 'Sarajevo', me: 'Podgorica', mk: 'Skopje', al: 'Tirana',
  xk: 'Pristina', ru: 'Moscow', ua: 'Kyiv', by: 'Minsk', md: 'Chisinau', ee: 'Tallinn',
  lv: 'Riga', lt: 'Vilnius', lu: 'Luxembourg', mc: 'Monaco', ad: 'Andorra la Vella',
  li: 'Vaduz', sm: 'San Marino', va: 'Vatican City', mt: 'Valletta',
  us: 'Washington', ca: 'Ottawa', mx: 'Mexico City', gt: 'Guatemala City', bz: 'Belmopan',
  hn: 'Tegucigalpa', sv: 'San Salvador', ni: 'Managua', cr: 'San Jose', pa: 'Panama City',
  cu: 'Havana', jm: 'Kingston', ht: 'Port-au-Prince', do: 'Santo Domingo', tt: 'Port of Spain',
  bs: 'Nassau', bb: 'Bridgetown', gd: "St. George's", lc: 'Castries', vc: 'Kingstown',
  ag: "St. John's", kn: 'Basseterre', dm: 'Roseau',
  br: 'Brasilia', ar: 'Buenos Aires', cl: 'Santiago', co: 'Bogota', pe: 'Lima', ec: 'Quito',
  bo: 'La Paz', py: 'Asuncion', uy: 'Montevideo', ve: 'Caracas', gy: 'Georgetown', sr: 'Paramaribo',
  eg: 'Cairo', ma: 'Rabat', tn: 'Tunis', dz: 'Algiers', ly: 'Tripoli', sd: 'Khartoum',
  ss: 'Juba', et: 'Addis Ababa', er: 'Asmara', dj: 'Djibouti', so: 'Mogadishu', ke: 'Nairobi',
  tz: 'Dodoma', ug: 'Kampala', rw: 'Kigali', bi: 'Gitega', za: 'Pretoria', ng: 'Abuja',
  gh: 'Accra', sn: 'Dakar', ci: 'Yamoussoukro', cm: 'Yaounde', ao: 'Luanda', mz: 'Maputo',
  zw: 'Harare', zm: 'Lusaka', mw: 'Lilongwe', mg: 'Antananarivo', mu: 'Port Louis', sc: 'Victoria',
  km: 'Moroni', cf: 'Bangui', cg: 'Brazzaville', cd: 'Kinshasa', ga: 'Libreville', gq: 'Malabo',
  st: 'Sao Tome', cv: 'Praia', gw: 'Bissau', gn: 'Conakry', sl: 'Freetown', lr: 'Monrovia',
  tg: 'Lome', bj: 'Porto-Novo', bf: 'Ouagadougou', ml: 'Bamako', ne: 'Niamey', td: "N'Djamena",
  mr: 'Nouakchott', gm: 'Banjul', na: 'Windhoek', bw: 'Gaborone', ls: 'Maseru', sz: 'Mbabane',
  au: 'Canberra', nz: 'Wellington', pg: 'Port Moresby', fj: 'Suva', sb: 'Honiara', vu: 'Port Vila',
  ws: 'Apia', to: "Nuku'alofa", fm: 'Palikir', pw: 'Ngerulmud', mh: 'Majuro', ki: 'Tarawa',
  tv: 'Funafuti', nr: 'Yaren',
};

// 한글 국가명 → ISO2 캐시 (COUNTRIES term 첫 토큰)
const KO_TO_ISO: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COUNTRIES) {
    const iso = c.term.split(' ')[0];
    if (iso) m[c.name] = iso;
  }
  return m;
})();

/** 한글 국가명의 수도(영문). 없으면 null. */
export function getCapitalByKo(koName: string): string | null {
  const iso = KO_TO_ISO[koName];
  return (iso && CAPITALS[iso]) || null;
}
