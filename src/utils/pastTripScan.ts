import { COUNTRIES } from '../constants/countries';

export interface ScannedPhoto {
  id?: string;
  uri: string;
  creationTime: number;
  countryCode: string | null;   // ISO 국가코드(reverse geocode). GPS 없거나 실패 시 null
  countryName: string;
  countryFlag: string;
}

export interface ScannedTrip {
  id: string;
  country: string;        // "🇯🇵 일본"
  countryName: string;
  countryFlag: string;
  date: string;           // endDate, 'YYYY.MM.DD'
  startDate: string;
  endDate: string;
  rating: number;
  title: string;
  photoCount: number;
  content: string;
  medias: string[];
  photos: { id?: string; uri: string; creationTime?: number }[];
  weather: string;
  companions: string[];
}

// 국가 코드(ISO) → { 국문명, 국기 }
// 앱 전체 국가 목록(constants/countries.ts)에서 자동 생성한다. 각 term의 첫 토큰이 ISO 코드.
// → 포르투갈 등 누락 국가의 국기/국문명을 일괄 해결(하드코딩 목록 유지보수 불필요).
const _COUNTRY_FLAGS: Record<string, { name: string; flag: string }> = {};
for (const c of COUNTRIES) {
  const code = c.term.split(' ')[0].toUpperCase();
  if (!_COUNTRY_FLAGS[code]) _COUNTRY_FLAGS[code] = { name: c.name, flag: c.flag };
}
// KR은 COUNTRIES 표준 표기('대한민국')를 그대로 쓴다 — 과거 '한국' 짧은 표기는
// 지구본 탭·대표 사진·통계의 이름 비교를 전부 빗나가게 했다(기존 '한국' 기록은
// MainScreen·badgeRules의 별칭 보정이 흡수).
export const COUNTRY_FLAGS: Record<string, { name: string; flag: string }> = _COUNTRY_FLAGS;

export function countryInfoFromCode(
  code: string,
  fallbackCountry?: string
): { country: string; countryName: string; countryFlag: string } {
  const detail = COUNTRY_FLAGS[code] || { name: fallbackCountry || code, flag: '✈️' };
  return { country: `${detail.flag} ${detail.name}`, countryName: detail.name, countryFlag: detail.flag };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/** 해외(거주국가 밖) + GPS 있는 사진만 시간/국가 기준 클러스터링 → 여행 카드 */
export function clusterForeignTrips(photos: ScannedPhoto[], homeCountryCode: string): ScannedTrip[] {
  const foreign = photos
    .filter((p) => !!p.countryCode && p.countryCode !== homeCountryCode)
    .sort((a, b) => a.creationTime - b.creationTime);

  interface Cluster {
    code: string;
    countryName: string;
    countryFlag: string;
    country: string;
    photos: { id?: string; uri: string; creationTime?: number }[];
    dates: number[];
  }

  const clusters: Cluster[] = [];
  for (const p of foreign) {
    const last = clusters[clusters.length - 1];
    const sameCountry = !!last && last.code === p.countryCode;
    const withinTime = !!last && p.creationTime - last.dates[last.dates.length - 1] <= SEVEN_DAYS_MS;
    if (last && sameCountry && withinTime) {
      last.photos.push({ id: p.id, uri: p.uri, creationTime: p.creationTime });
      last.dates.push(p.creationTime);
    } else {
      clusters.push({
        code: p.countryCode as string,
        countryName: p.countryName,
        countryFlag: p.countryFlag,
        country: `${p.countryFlag} ${p.countryName}`,
        photos: [{ id: p.id, uri: p.uri, creationTime: p.creationTime }],
        dates: [p.creationTime],
      });
    }
  }

  const trips: ScannedTrip[] = clusters.map((c, i) => {
    c.dates.sort((a, b) => a - b);
    const startDate = formatDate(c.dates[0]);
    const endDate = formatDate(c.dates[c.dates.length - 1]);
    return {
      id: `scanned-${c.code}-${i}`,
      country: c.country,
      countryName: c.countryName,
      countryFlag: c.countryFlag,
      date: endDate,
      startDate,
      endDate,
      rating: 5,
      title: `${c.countryName} 여행`,
      photoCount: c.photos.length,
      content: `${c.countryName}에서의 소중한 기록입니다. 총 ${c.photos.length}장의 사진이 타임라인에 저장됩니다.`,
      medias: [c.photos[0].uri],
      photos: c.photos,
      weather: '맑음',
      companions: ['가족'],
    };
  });

  trips.sort(
    (a, b) => new Date(b.date.replace(/\./g, '-')).getTime() - new Date(a.date.replace(/\./g, '-')).getTime()
  );
  return trips;
}

/**
 * 같은 국가인데 여러 개로 나뉜 여행 클러스터를 하나로 합친다.
 * (예: 독일 교환학생이 네덜란드·스페인을 다녀와 독일이 독일①/독일②로 끊기는 경우)
 * - 사진은 시간순으로 합치고, 기간은 가장 이른 시작일~가장 늦은 종료일.
 * - 호출 전 같은 countryName인지 검증해야 한다(다른 국가 혼합 금지).
 */
export function mergeScannedTrips(trips: ScannedTrip[]): ScannedTrip {
  const base = trips[0];
  const photos = trips
    .flatMap((t) => t.photos)
    .sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0));
  const parse = (s: string) => new Date(s.replace(/\./g, '-')).getTime();
  const startDate = formatDate(Math.min(...trips.map((t) => parse(t.startDate))));
  const endDate = formatDate(Math.max(...trips.map((t) => parse(t.endDate))));
  return {
    ...base,
    id: `merged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: endDate,
    startDate,
    endDate,
    title: `${base.countryName} 여행`,
    photoCount: photos.length,
    content: `${base.countryName}에서의 소중한 기록입니다. 총 ${photos.length}장의 사진이 타임라인에 저장됩니다.`,
    medias: [photos[0].uri],
    photos,
  };
}
