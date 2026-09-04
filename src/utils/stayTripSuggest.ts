/**
 * 체류 중 주변국 여행 제안 — 순수 판정 (설계 §1)
 *
 * 왜 사진 기반인가: 체류 일시정지·재개는 프로필 탭 진입에만 걸려 있고 pausedAt도 없다.
 * 주말 여행자는 여행 중 앱을 안 열 확률이 높아 GPS 이벤트에 기대면 복귀를 영영 모른다.
 * 사진은 여행의 증거 그 자체라, 최근 14일 사진에서 체류국 밖 묶음을 찾는 편이 견고하다.
 *
 * 이 모듈은 verify가 tsx로 돌린다 — react-native·expo import 금지.
 */
import { clusterForeignTrips, type ScannedPhoto, type ScannedTrip, type TripTextMaker, KO_TRIP_TEXT } from './pastTripScan';
import { overlapsImportedTrip } from './scanSampling';

const H = 3600_000;

/** 제안에 필요한 최소 장수 — 과거여행 불러오기(10장)보다 낮다. 당일치기 주말여행 대응. */
export const MIN_SUGGEST_PHOTOS = 5;
/** 매 검사에서 다시 훑는 창. 중복 제거가 있어 같은 제안이 두 번 뜨지 않는다. */
export const RECENT_WINDOW_MS = 14 * 24 * H;
/** 종료 판정 — 현재 위치가 체류국일 때: 마지막 사진이 이만큼 지났으면 끝난 여행 */
export const ENDED_WITH_LOCATION_MS = 12 * H;
/** 종료 판정 — 위치를 못 얻었을 때: 보수적으로 24시간 */
export const ENDED_WITHOUT_LOCATION_MS = 24 * H;

export interface SuggestionPhoto {
  id?: string;
  uri: string;
  localUri?: string;
  creationTime?: number;
}

export interface TripSuggestion {
  /**
   * `${countryCode}:${startDate}:${endDate}` — 거절·알림·중복 판정의 식별자. 재스캔에도 같은 값.
   *
   * ⚠️ 국가'명'이 아니라 국가'코드'인 이유: 이 키는 거절 목록에 영속된다. COUNTRIES의 한글
   *    표기가 나중에 바뀌면(실제로 '한국'→'대한민국' 전례가 있다) 저장된 거절 키가 통째로
   *    고아가 되어 **사용자가 거절한 제안이 되살아난다.** ISO 코드는 바뀌지 않는다.
   */
  key: string;
  country: string;      // "🇨🇿 체코"
  /** ISO2 대문자 — 파일 경로·키에 쓰는 ASCII 식별자 */
  countryCode: string;
  countryName: string;  // 한글 원본 — 지구본·통계 비교 키라 번역하지 않는다
  countryFlag: string;
  startDate: string;    // 'YYYY.MM.DD'
  endDate: string;
  photoCount: number;
  photos: SuggestionPhoto[];
  lastPhotoAt: number;  // ms — 종료 판정 근거(디버그·재검증용으로 남긴다)
  detectedAt: number;   // ms — 7일 소멸 기준
  snoozeUntil?: number; // ms — '나중에'로 숨긴 경우
}

export function suggestionKey(countryCode: string, startDate: string, endDate: string): string {
  return `${countryCode}:${startDate}:${endDate}`;
}

export interface SuggestInput {
  photos: ScannedPhoto[];
  stayCountryCode: string;
  homeCountryCode: string;
  now: number;
  /** 위치를 못 얻으면 null — 그때는 24시간 규칙으로 대체 */
  currentCountryCode: string | null;
  /** 기록 mediaAssetIds + 사진 풀 assetIds 합집합 */
  importedAssetIds: Set<string>;
  /** 모든 viewType의 기록. startDate/endDate가 없는 글은 호출부가 date로 채워 넘긴다 */
  existingTrips: { countryName?: string; startDate?: string; endDate?: string }[];
  dismissedKeys: string[];
  text?: TripTextMaker;
}

/**
 * 최근 사진 → 끝난 주변국 여행 제안 목록 (최근 종료 순).
 *
 * 제외 순서: 국가 미상 → 체류국 → 이미 카드에 들어간 자산 → (클러스터링, 거주국은 여기서 제외)
 *           → 최소 장수 → 종료 판정 → 기간 겹침 기록 → 거절 키.
 */
export function suggestStayTrips(input: SuggestInput): TripSuggestion[] {
  const stay = input.stayCountryCode.toUpperCase();
  // 거주국도 반드시 정규화한다. clusterForeignTrips는 `p.countryCode !== homeCountryCode`로
  // **완전 일치** 비교를 하므로(pastTripScan.ts), 사진 코드가 'kr'로 오는 기기에서는
  // 'kr' !== 'KR'이 되어 귀국 사진 묶음이 통째로 '해외 여행'으로 제안된다.
  // (게다가 countryInfoFromCode('kr')는 대문자 키 테이블에서 못 찾아 '✈️ kr 여행'이 된다)
  const home = input.homeCountryCode.toUpperCase();
  const cur = input.currentCountryCode ? input.currentCountryCode.toUpperCase() : null;

  // 위치를 아는데 체류국이 아니면(아직 여행 중이거나 잠깐 귀국) 제안할 때가 아니다.
  if (cur !== null && cur !== stay) return [];
  const endedBefore = input.now - (cur === null ? ENDED_WITHOUT_LOCATION_MS : ENDED_WITH_LOCATION_MS);

  // 클러스터링에 넘기는 사진은 코드를 대문자로 맞춘 **사본**이다. 원본 배열을 제자리에서
  // 고치면 호출부(감지기)가 같은 배열을 다시 쓸 때 조용히 달라진 값을 보게 된다.
  // clusterForeignTrips는 과거여행 경로가 공유하므로 그쪽은 건드리지 않는다.
  const eligible: ScannedPhoto[] = [];
  // 국가명 → ISO2. clusterForeignTrips의 출력(ScannedTrip)에는 국가 코드가 없는데,
  // 키와 여행 id에는 ASCII 코드가 필요해서 여기서 복원한다(아래 두 곳의 주석 참고).
  const codeByName = new Map<string, string>();
  for (const p of input.photos) {
    if (!p.countryCode) continue;
    const code = p.countryCode.toUpperCase();
    if (code === stay) continue;
    if (p.id && input.importedAssetIds.has(p.id)) continue;
    eligible.push(code === p.countryCode ? p : { ...p, countryCode: code });
    if (!codeByName.has(p.countryName)) codeByName.set(p.countryName, code);
  }
  if (eligible.length === 0) return [];

  // 거주국 제외와 (같은 나라 + 7일) 묶음은 기존 클러스터링 그대로. sessionId는 결정적이어도
  // 된다 — 여기서 만든 id는 저장되지 않고, 카드 생성 시 suggestionToScannedTrip이 새로 만든다.
  const trips = clusterForeignTrips(eligible, home, input.text ?? KO_TRIP_TEXT, 'suggest');
  const dismissed = new Set(input.dismissedKeys);

  const out: TripSuggestion[] = [];
  for (const t of trips) {
    if (t.photoCount < MIN_SUGGEST_PHOTOS) continue;
    // 클러스터의 재료가 전부 eligible에서 왔으므로 여기서 코드를 못 찾는 경우는 없다.
    // 그래도 넘기지 않고 버린다 — 코드가 없으면 ASCII 여행 id를 만들 수 없고, 한글 국가명이
    // 파일 경로 세그먼트로 새는 것이 이 방어가 막으려는 바로 그 사고다.
    const countryCode = codeByName.get(t.countryName);
    if (!countryCode) continue;
    const lastPhotoAt = t.photos.reduce((m, p) => Math.max(m, p.creationTime ?? 0), 0);
    if (lastPhotoAt > endedBefore) continue; // 아직 진행 중일 수 있다
    if (overlapsImportedTrip(t, input.existingTrips)) continue;
    const key = suggestionKey(countryCode, t.startDate, t.endDate);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      country: t.country,
      countryCode,
      countryName: t.countryName,
      countryFlag: t.countryFlag,
      startDate: t.startDate,
      endDate: t.endDate,
      photoCount: t.photoCount,
      photos: t.photos,
      lastPhotoAt,
      detectedAt: input.now,
    });
  }
  return out; // clusterForeignTrips가 이미 최근 종료 순으로 정렬해 둔다
}

/**
 * 제안 → 카드 생성 훅이 받는 ScannedTrip.
 *
 * id에 세션 토큰을 섞는다 — 표지 사진 폴더(trips/{id}/)가 id로 만들어지므로 결정적 id는
 * 같은 여행을 두 번 만들 때 앞 폴더를 덮어쓴다(pastTripScan.newScanSessionId 주석과 같은 이유).
 *
 * ⚠️ 국가'명'이 아니라 국가'코드'를 쓴다. 이 id는 importPhotoStore.tripDir이
 *    `trips/{id}/`라는 **file:// 경로 세그먼트**로 그대로 쓰는데 정제(sanitize)가 없다.
 *    한글이 들어가면 makeDirectoryAsync·copyAsync가 실패할 수 있고, 실패해도 copyTripCover는
 *    예외 대신 {uri:null}을 돌려주므로 증상이 "카드는 생겼는데 표지가 목업"뿐이다(릴리스엔 로그도 없다).
 *    기존 id 생산자(scanned-·merged-·reco-)가 전부 ASCII인 것과 같은 규약이다.
 */
export function suggestionToScannedTrip(s: TripSuggestion, text: TripTextMaker, sessionId: string): ScannedTrip {
  return {
    id: `suggest-${sessionId}-${s.countryCode}-${s.startDate}`,
    country: s.country,
    countryName: s.countryName,
    countryFlag: s.countryFlag,
    date: s.endDate,
    startDate: s.startDate,
    endDate: s.endDate,
    rating: 5,
    title: text.title(s.countryName),
    photoCount: s.photoCount,
    content: text.content(s.countryName, s.photoCount),
    medias: s.photos.length ? [s.photos[0].uri] : [],
    photos: s.photos,
    weather: '맑음',
    companions: ['가족'],
  };
}

/** 'YYYY.MM.DD' → 'M.D' (배너 한 줄용). 형식이 아니면 원문 그대로 */
export function shortYmd(ymd: string): string {
  const m = ymd.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[2])}.${Number(m[3])}`;
}
