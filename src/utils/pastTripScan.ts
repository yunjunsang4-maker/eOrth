import { COUNTRIES } from '../constants/countries';

export interface ScannedPhoto {
  id?: string;
  uri: string;
  // 스캔 중 회수한 원본 file:// 경로(있을 때만). 저장 단계가 getAssetInfoAsync를
  // 다시 부르지 않고 바로 복사할 수 있게 실어 나른다(세션 내 유효).
  localUri?: string;
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
  photos: { id?: string; uri: string; localUri?: string; creationTime?: number }[];
  weather: string;
  companions: string[];
  // 앱 내 재실행 시 채워진다 — 같은 국가·기간의 기록이 이미 있으면 true.
  // (자산 id로 1차 제외한 뒤에도 남는 경우의 2차 방어선. 기본 선택에서 빠지고 배지가 붙는다)
  alreadyImported?: boolean;
}

/**
 * 여행 카드의 기본 제목·본문을 만드는 함수 묶음.
 *
 * 왜 주입받는가: 제목은 저장되는 값이라(addImportedAlbum({ title })) 가져오는 시점의
 * 언어로 만들어야 한다. 그런데 이 모듈은 pastTripScan.verify.ts가 RN 없이 돌리는
 * 순수 모듈이라 i18n을 직접 import할 수 없다 — 그래서 호출부(화면)가 t()를 싸서 넘긴다.
 *
 * countryName은 항상 한글 원본이 들어온다(지구본·통계의 이름 비교 키라 번역 금지).
 * 표시용 국가명 변환은 호출부가 countryLabel()로 처리한다.
 */
export interface TripTextMaker {
  title: (countryName: string) => string;
  content: (countryName: string, photoCount: number) => string;
}

/** 기본값(한국어) — 주입이 없을 때. 기존 동작·검증 테스트를 그대로 유지한다. */
export const KO_TRIP_TEXT: TripTextMaker = {
  title: (c) => `${c} 여행`,
  content: (c, n) => `${c}에서의 소중한 기록입니다. 총 ${n}장의 사진이 타임라인에 저장됩니다.`,
};

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

/**
 * 스캔 세션 토큰 — 여행 id에 섞어 "가져오기 세션 간" 유일성을 보장한다.
 *
 * 왜 필요한가: id가 `scanned-JP-0`처럼 결정적이면 일본을 두 번 가져올 때 두 세션이
 * 같은 id를 갖고, 저장 단계가 그 id로 사진 폴더(trips/{id}/)를 만들기 때문에
 * 두 번째 가져오기가 첫 번째 앨범의 사진 파일을 조용히 덮어썼다.
 * (합치기 여행의 `merged-${Date.now()}-…`와 같은 규약)
 */
export function newScanSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/**
 * 해외(거주국가 밖) + GPS 있는 사진만 시간/국가 기준 클러스터링 → 여행 카드
 *
 * sessionId: 이번 스캔 세션의 토큰(기본값은 호출 시각 기반으로 새로 만든다).
 * 여행 id에 들어가 세션 간 충돌을 막는다 — newScanSessionId 주석 참고.
 * '이미 가져옴' 판정은 id가 아니라 국가·기간 비교(scanSampling.overlapsImportedTrip)와
 * 자산 id 제외(collectImportedAssetIds)로 하므로, id가 매번 달라도 영향이 없다.
 */
export function clusterForeignTrips(
  photos: ScannedPhoto[],
  homeCountryCode: string,
  text: TripTextMaker = KO_TRIP_TEXT,
  sessionId: string = newScanSessionId()
): ScannedTrip[] {
  const foreign = photos
    .filter((p) => !!p.countryCode && p.countryCode !== homeCountryCode)
    .sort((a, b) => a.creationTime - b.creationTime);

  interface Cluster {
    code: string;
    countryName: string;
    countryFlag: string;
    country: string;
    photos: { id?: string; uri: string; localUri?: string; creationTime?: number }[];
    dates: number[];
  }

  const clusters: Cluster[] = [];
  for (const p of foreign) {
    const last = clusters[clusters.length - 1];
    const sameCountry = !!last && last.code === p.countryCode;
    const withinTime = !!last && p.creationTime - last.dates[last.dates.length - 1] <= SEVEN_DAYS_MS;
    if (last && sameCountry && withinTime) {
      last.photos.push({ id: p.id, uri: p.uri, localUri: p.localUri, creationTime: p.creationTime });
      last.dates.push(p.creationTime);
    } else {
      clusters.push({
        code: p.countryCode as string,
        countryName: p.countryName,
        countryFlag: p.countryFlag,
        country: `${p.countryFlag} ${p.countryName}`,
        photos: [{ id: p.id, uri: p.uri, localUri: p.localUri, creationTime: p.creationTime }],
        dates: [p.creationTime],
      });
    }
  }

  const trips: ScannedTrip[] = clusters.map((c, i) => {
    c.dates.sort((a, b) => a - b);
    const startDate = formatDate(c.dates[0]);
    const endDate = formatDate(c.dates[c.dates.length - 1]);
    return {
      id: `scanned-${sessionId}-${c.code}-${i}`,
      country: c.country,
      countryName: c.countryName,
      countryFlag: c.countryFlag,
      date: endDate,
      startDate,
      endDate,
      rating: 5,
      title: text.title(c.countryName),
      photoCount: c.photos.length,
      content: text.content(c.countryName, c.photos.length),
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
export function mergeScannedTrips(
  trips: ScannedTrip[],
  text: TripTextMaker = KO_TRIP_TEXT
): ScannedTrip {
  const base = trips[0];
  const photos = trips
    .flatMap((t) => t.photos)
    .sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0));
  // 로컬 자정 기준 파싱 — new Date('YYYY-MM-DD')는 UTC 해석이라 formatDate(로컬)와의
  // 왕복 변환에서 미주 등 UTC 음수 시간대는 합친 여행 날짜가 하루 앞당겨졌다.
  const parse = (s: string) => {
    const [y, m, d] = s.split(/[.\-/]/).map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d).getTime();
  };
  const startDate = formatDate(Math.min(...trips.map((t) => parse(t.startDate))));
  const endDate = formatDate(Math.max(...trips.map((t) => parse(t.endDate))));
  return {
    ...base,
    id: `merged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: endDate,
    startDate,
    endDate,
    title: text.title(base.countryName),
    photoCount: photos.length,
    content: text.content(base.countryName, photos.length),
    medias: [photos[0].uri],
    photos,
    // ...base는 첫 여행만 상속하므로 따로 접어 준다. 하나라도 이미 가져온 여행이면
    // 합친 결과도 이미 가져온 것으로 봐야 한다 — 안 그러면 합치기가 중복 확인을 우회한다.
    alreadyImported: trips.some((t) => t.alreadyImported) || undefined,
  };
}
