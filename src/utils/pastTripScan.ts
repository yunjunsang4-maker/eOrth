export interface ScannedPhoto {
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
  weather: string;
  companions: string[];
}

export const COUNTRY_FLAGS: Record<string, { name: string; flag: string }> = {
  KR: { name: '한국', flag: '🇰🇷' },
  JP: { name: '일본', flag: '🇯🇵' },
  US: { name: '미국', flag: '🇺🇸' },
  FR: { name: '프랑스', flag: '🇫🇷' },
  IT: { name: '이탈리아', flag: '🇮🇹' },
  GB: { name: '영국', flag: '🇬🇧' },
  CN: { name: '중국', flag: '🇨🇳' },
  ES: { name: '스페인', flag: '🇪🇸' },
  TH: { name: '태국', flag: '🇹🇭' },
  VN: { name: '베트남', flag: '🇻🇳' },
  PH: { name: '필리핀', flag: '🇵🇭' },
  TW: { name: '대만', flag: '🇹🇼' },
  HK: { name: '홍콩', flag: '🇭🇰' },
  SG: { name: '싱가포르', flag: '🇸🇬' },
  GU: { name: '괌', flag: '🇬🇺' },
  AU: { name: '호주', flag: '🇦🇺' },
  CA: { name: '캐나다', flag: '🇨🇦' },
  DE: { name: '독일', flag: '🇩🇪' },
  CH: { name: '스위스', flag: '🇨🇭' },
};

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
    photos: string[];
    dates: number[];
  }

  const clusters: Cluster[] = [];
  for (const p of foreign) {
    const last = clusters[clusters.length - 1];
    const sameCountry = !!last && last.code === p.countryCode;
    const withinTime = !!last && p.creationTime - last.dates[last.dates.length - 1] <= SEVEN_DAYS_MS;
    if (last && sameCountry && withinTime) {
      last.photos.push(p.uri);
      last.dates.push(p.creationTime);
    } else {
      clusters.push({
        code: p.countryCode as string,
        countryName: p.countryName,
        countryFlag: p.countryFlag,
        country: `${p.countryFlag} ${p.countryName}`,
        photos: [p.uri],
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
      medias: [c.photos[0]],
      weather: '맑음',
      companions: ['가족'],
    };
  });

  trips.sort(
    (a, b) => new Date(b.date.replace(/\./g, '-')).getTime() - new Date(a.date.replace(/\./g, '-')).getTime()
  );
  return trips;
}
