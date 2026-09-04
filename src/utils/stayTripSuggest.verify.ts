// 체류 중 주변국 여행 제안 판정 검증
//
// 시나리오: 독일 체류(거주국 한국) 중 주말에 프라하를 다녀와 월요일 정오에 앱을 연 상황.
// 여기서 기대하는 값들은 설계 문서(§1)에서 온 것이므로, 실패하면 구현을 고친다.
import {
  suggestStayTrips, suggestionKey, suggestionToScannedTrip, shortYmd,
  MIN_SUGGEST_PHOTOS, RECENT_WINDOW_MS, ENDED_WITH_LOCATION_MS, ENDED_WITHOUT_LOCATION_MS,
} from './stayTripSuggest';
import type { ScannedPhoto } from './pastTripScan';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const H = 3600_000;
const D = 24 * H;
// 2026-09-07(월) 정오 로컬 — 주말(9/5~9/6) 프라하 여행 뒤 월요일에 앱을 연 상황
const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime();

// 사진 생성 헬퍼 — countryName은 pastTripScan.COUNTRY_FLAGS의 한글 원본과 같아야 한다
function photos(code: string, name: string, flag: string, times: number[], idPrefix = code): ScannedPhoto[] {
  return times.map((t, i) => ({ id: `${idPrefix}-${i}`, uri: `ph://${idPrefix}-${i}`, creationTime: t, countryCode: code, countryName: name, countryFlag: flag }));
}
// 9/5 10:00 ~ 9/6 18:00 사이 6장 (프라하)
const CZ_TIMES = [0, 2, 6, 24, 28, 32].map((h) => new Date(2026, 8, 5, 10).getTime() + h * H);
const cz = photos('CZ', '체코', '🇨🇿', CZ_TIMES);
// 체류국(독일) 일상 사진 — 제외 대상
const de = photos('DE', '독일', '🇩🇪', [NOW - 10 * D, NOW - 3 * D, NOW - 2 * H]);
// 거주국(한국) — 귀국이라 제외 대상
const kr = photos('KR', '대한민국', '🇰🇷', [NOW - 13 * D, NOW - 12 * D + H, NOW - 12 * D + 2 * H, NOW - 12 * D + 3 * H, NOW - 12 * D + 4 * H]);

const base = {
  stayCountryCode: 'DE',
  homeCountryCode: 'KR',
  now: NOW,
  currentCountryCode: 'DE' as string | null,
  importedAssetIds: new Set<string>(),
  existingTrips: [] as { countryName?: string; startDate?: string; endDate?: string }[],
  dismissedKeys: [] as string[],
};

// 정상 경로 — 체류국(DE)에 돌아온 뒤, 끝난 프라하 여행 1건이 제안된다
{
  const out = suggestStayTrips({ ...base, photos: [...de, ...cz] });
  eq(out.length, 1, '정상: 체류국 밖 묶음 1건');
  eq(out[0].countryName, '체코', '정상: 국가명 한글 원본');
  eq(out[0].countryCode, 'CZ', '정상: ISO2 코드 복원(클러스터 출력엔 없는 값)');
  eq([out[0].startDate, out[0].endDate], ['2026.09.05', '2026.09.06'], '정상: 기간 = 첫·마지막 사진 날짜');
  eq(out[0].photoCount, 6, '정상: 사진 수');
  // 키는 국가'코드' 기반이어야 한다 — 한글 표기가 바뀌면 저장된 거절 키가 고아가 된다
  eq(out[0].key, 'CZ:2026.09.05:2026.09.06', '정상: 키 = 국가코드:시작:끝');
  eq(out[0].detectedAt, NOW, '정상: 감지 시각 = now');
  eq(out[0].lastPhotoAt, CZ_TIMES[CZ_TIMES.length - 1], '정상: 마지막 사진 시각 보존');
}

// 체류국·거주국 제외 — 독일 일상 사진과 한국 방문 사진은 제안이 되지 않는다
eq(suggestStayTrips({ ...base, photos: de }).length, 0, '체류국 사진만 = 제안 없음');
eq(suggestStayTrips({ ...base, photos: kr }).length, 0, '거주국(귀국) 사진만 = 제안 없음');
// 대소문자 흔들림 — geo.isoCountryCode가 소문자로 오는 기기가 있다
// (현재 위치도 같은 나라로 맞춘다 — 아니면 '위치 ≠ 체류국' 규칙에 걸려 이유가 다른 채 통과한다)
eq(suggestStayTrips({ ...base, photos: cz, stayCountryCode: 'cz', currentCountryCode: 'CZ' }).length, 0, '체류국 코드 소문자 = 여전히 제외');
// 거주국도 같은 방어가 있어야 한다. clusterForeignTrips는 완전 일치 비교라, 정규화를 빼먹으면
// 'kr' !== 'KR'이 되어 귀국 사진 묶음이 '✈️ kr 여행'으로 제안된다(QA 1라운드 발견 1의 재현).
eq(suggestStayTrips({ ...base, photos: kr, homeCountryCode: 'kr' }).length, 0, '거주국 코드 소문자 = 여전히 제외');
eq(suggestStayTrips({ ...base, photos: kr.map((p) => ({ ...p, countryCode: 'kr' })) }).length, 0, '사진 코드 소문자(거주국) = 여전히 제외');
// 여행국 쪽 소문자는 반대로 '정규화된 사본이 끝까지 흐르는가'를 본다
{
  const lower = cz.map((p) => ({ ...p, countryCode: 'cz' }));
  const out = suggestStayTrips({ ...base, photos: lower });
  eq(out.length, 1, '사진 코드 소문자(여행국) = 제안 유지');
  eq(out[0].countryCode, 'CZ', '사진 코드 소문자 → 복원된 코드는 대문자');
  eq(out[0].key, 'CZ:2026.09.05:2026.09.06', '사진 코드 소문자 → 키도 대문자');
  // 원본 배열을 제자리에서 고치면 호출부가 같은 배열을 다시 쓸 때 값이 조용히 달라진다
  eq(lower[0].countryCode, 'cz', '정규화는 사본에만 — 입력 배열은 그대로');
}

// countryCode null(GPS 없음·구간 미확정) 사진은 클러스터 재료가 아니다
eq(suggestStayTrips({ ...base, photos: cz.map((p) => ({ ...p, countryCode: null })) }).length, 0, '국가 미상 사진 = 제안 없음');

// 최소 장수 — 4장은 안 되고 5장부터
eq(suggestStayTrips({ ...base, photos: cz.slice(0, 4) }).length, 0, '4장 = 최소 미달');
eq(suggestStayTrips({ ...base, photos: cz.slice(0, 5) }).length, 1, '5장 = 제안');
eq(MIN_SUGGEST_PHOTOS, 5, '최소 장수 상수 = 5');

// 종료 판정(위치 있음) — 마지막 사진이 12시간 안이면 아직 여행 중일 수 있다
{
  const fresh = photos('CZ', '체코', '🇨🇿', [NOW - 20 * H, NOW - 15 * H, NOW - 11 * H, NOW - 10 * H, NOW - 9 * H]);
  eq(suggestStayTrips({ ...base, photos: fresh }).length, 0, '마지막 사진 9h 전 + 체류국 위치 = 아직 미종료');
  const done = photos('CZ', '체코', '🇨🇿', [NOW - 20 * H, NOW - 18 * H, NOW - 16 * H, NOW - 14 * H, NOW - 13 * H]);
  eq(suggestStayTrips({ ...base, photos: done }).length, 1, '마지막 사진 13h 전 + 체류국 위치 = 종료');
}
// 종료 판정(위치 없음) — 24시간으로 보수적으로
{
  const p = photos('CZ', '체코', '🇨🇿', [NOW - 30 * H, NOW - 28 * H, NOW - 26 * H, NOW - 25 * H, NOW - 20 * H]);
  eq(suggestStayTrips({ ...base, photos: p, currentCountryCode: null }).length, 0, '위치 없음 + 마지막 20h 전 = 미종료');
  const q = photos('CZ', '체코', '🇨🇿', [NOW - 40 * H, NOW - 38 * H, NOW - 30 * H, NOW - 27 * H, NOW - 25 * H]);
  eq(suggestStayTrips({ ...base, photos: q, currentCountryCode: null }).length, 1, '위치 없음 + 마지막 25h 전 = 종료');
}
// 현재 위치가 제3국이면(아직 여행 중) 아무것도 제안하지 않는다
eq(suggestStayTrips({ ...base, photos: cz, currentCountryCode: 'CZ' }).length, 0, '현재 위치 = 여행국 → 제안 없음');
// 현재 위치가 거주국(잠깐 귀국)이어도 제안하지 않는다 — 체류국에 돌아왔을 때만
eq(suggestStayTrips({ ...base, photos: cz, currentCountryCode: 'KR' }).length, 0, '현재 위치 = 거주국 → 제안 없음');

// 자산 id 제외 — 이미 카드에 들어간 사진은 재료에서 빠진다(그 결과 최소 장수 미달)
eq(suggestStayTrips({ ...base, photos: cz, importedAssetIds: new Set(['CZ-0', 'CZ-1']) }).length, 0, '자산 id 2장 제외 → 4장 = 미달');

// 기간 겹침 제외 — 사용자가 피드 글로 직접 남긴 프라하 여행(앨범형 아님)도 걸러야 한다
eq(
  suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '체코', startDate: '2026.09.06', endDate: '2026.09.06' }] }).length,
  0,
  '같은 나라 + 하루 겹침 기록 있음 = 제외',
);
eq(
  suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '오스트리아', startDate: '2026.09.05', endDate: '2026.09.06' }] }).length,
  1,
  '다른 나라 기록은 무관',
);
// 기록에 startDate가 없으면(date만 있는 옛 피드 글) 호출부가 date로 채워 넘긴다 — 여기선 빈 값이면 겹침 아님
eq(suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '체코' }] }).length, 1, '기간 없는 기록 = 겹침 판정 불가 → 제안 유지');

// 거절 키 제외
eq(suggestStayTrips({ ...base, photos: cz, dismissedKeys: ['CZ:2026.09.05:2026.09.06'] }).length, 0, '거절한 키 = 제외');
eq(suggestionKey('CZ', '2026.09.05', '2026.09.06'), 'CZ:2026.09.05:2026.09.06', '키 조립');

// 여러 나라 — 빈(오스트리아)+프라하 연속이면 나라별 2건, 최근 종료가 앞
{
  const at = photos('AT', '오스트리아', '🇦🇹', [0, 1, 2, 3, 4].map((h) => new Date(2026, 8, 3, 9).getTime() + h * H));
  const out = suggestStayTrips({ ...base, photos: [...at, ...cz, ...de] });
  eq(out.map((s) => s.countryName), ['체코', '오스트리아'], '2개국 = 2건, 최근 종료 순');
}

// 변환 — 배너가 카드 생성 훅에 넘길 ScannedTrip. id는 세션마다 달라야 한다(표지 폴더 충돌 방지)
{
  const [s] = suggestStayTrips({ ...base, photos: cz });
  const trip = suggestionToScannedTrip(s, { title: (c) => `${c} 여행`, content: (c, n) => `${c} ${n}장` }, 'sess1');
  // id는 importPhotoStore.tripDir이 file:// 경로 세그먼트로 그대로 쓴다 — 반드시 ASCII여야 한다
  eq(trip.id, 'suggest-sess1-CZ-2026.09.05', '변환: id = 세션 토큰 + 국가코드 (한글 금지)');
  eq(/^[A-Za-z0-9._-]+$/.test(trip.id), true, '변환: id가 ASCII 경로 안전 문자만');
  eq([trip.country, trip.countryName, trip.countryFlag], ['🇨🇿 체코', '체코', '🇨🇿'], '변환: 국가 3필드');
  eq([trip.startDate, trip.endDate, trip.date], ['2026.09.05', '2026.09.06', '2026.09.06'], '변환: 날짜 3필드');
  eq(trip.title, '체코 여행', '변환: 제목은 주입된 text로');
  eq(trip.photoCount, 6, '변환: 장수');
  eq(trip.photos.length, 6, '변환: 사진 목록');
  eq(trip.medias, [trip.photos[0].uri], '변환: medias = 첫 사진');
}

// 날짜 표시 — 배너 한 줄용 'M.D'
eq(shortYmd('2026.09.05'), '9.5', '표시: 앞자리 0 제거');
eq(shortYmd('2026.12.25'), '12.25', '표시: 두 자리 유지');
eq(shortYmd(''), '', '표시: 빈 문자열');
eq(shortYmd('이상한값'), '이상한값', '표시: 형식 아니면 원문');

eq(RECENT_WINDOW_MS, 14 * D, '창 = 14일');
eq(ENDED_WITH_LOCATION_MS, 12 * H, '종료(위치 있음) = 12h');
eq(ENDED_WITHOUT_LOCATION_MS, 24 * H, '종료(위치 없음) = 24h');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
