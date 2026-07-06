// 과거여행 스캔 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/pastTripScan.verify.ts
import { countryInfoFromCode, clusterForeignTrips, mergeScannedTrips, type ScannedPhoto } from './pastTripScan';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const DAY = 24 * 60 * 60 * 1000;
function p(uri: string, code: string | null, t: number): ScannedPhoto {
  const info = code ? countryInfoFromCode(code) : { country: '', countryName: '', countryFlag: '' };
  return { uri, creationTime: t, countryCode: code, countryName: info.countryName, countryFlag: info.countryFlag };
}

// countryInfoFromCode
{
  const jp = countryInfoFromCode('JP');
  assert(jp.countryName === '일본' && jp.countryFlag === '🇯🇵' && jp.country === '🇯🇵 일본', '알려진 코드 매핑');
  const kr = countryInfoFromCode('KR');
  // 표준 표기('대한민국')로 통일 — 구 '한국' 짧은 표기는 지구본/통계의 이름 비교를 빗나가게 했다
  assert(kr.countryName === '대한민국', 'KR은 COUNTRIES 표준 표기(대한민국)');
  const unknown = countryInfoFromCode('ZZ', 'Zedland');
  assert(unknown.countryFlag === '✈️' && unknown.countryName === 'Zedland', '미등록 코드 폴백');
}

// 홈국가/무GPS 제외
{
  const photos = [
    p('a', 'KR', 100),       // 국내 → 제외
    p('b', null, 200),       // 무GPS → 제외
    p('c', 'JP', 300),       // 해외 → 포함
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 1 && trips[0].countryName === '일본', '국내·무GPS 제외, 해외만');
  assert(trips[0].photoCount === 1, '여행 사진 수 1');
}

// 같은 국가 7일 이내 = 한 여행
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'JP', 2 * DAY),
    p('c', 'JP', 5 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 1 && trips[0].photoCount === 3, '같은국가 7일내 1개 여행');
}

// 같은 국가 7일 초과 = 별도 여행
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'JP', 30 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 2, '같은국가 멀리 떨어지면 2개 여행');
}

// 다른 국가 = 별도 여행, 최신순 정렬
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'FR', 10 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 2, '다른국가 2개 여행');
  assert(trips[0].countryName === '프랑스', '최신 여행이 앞(내림차순)');
}

// 홈국가가 JP면 KR이 해외로 포함
{
  const photos = [p('a', 'KR', 0), p('b', 'JP', 10)];
  const trips = clusterForeignTrips(photos, 'JP');
  assert(trips.length === 1 && trips[0].countryName === '대한민국', '홈=JP일 때 KR은 해외');
}

// 날짜 포맷/필드
{
  const photos = [p('a', 'JP', Date.UTC(2025, 2, 1)), p('b', 'JP', Date.UTC(2025, 2, 5))];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(/^\d{4}\.\d{2}\.\d{2}$/.test(trips[0].startDate), 'startDate YYYY.MM.DD');
  assert(trips[0].medias.length === 1 && trips[0].medias[0] === 'a', '대표 미디어=첫 사진');
  assert(trips[0].title === '일본 여행', '제목 국가단위');
}

// 여행 합치기 — 거점 국가(독일)가 다른 나라 방문으로 끊긴 경우
{
  const photos = [
    p('a', 'DE', 0),
    p('b', 'DE', 2 * DAY),
    p('c', 'NL', 10 * DAY),  // 네덜란드 방문으로 독일이 끊김
    p('d', 'DE', 20 * DAY),
    p('e', 'DE', 21 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  const germans = trips.filter((t) => t.countryName === '독일');
  assert(germans.length === 2, '독일이 2개 여행으로 나뉨');

  const merged = mergeScannedTrips(germans);
  assert(merged.countryName === '독일', '합친 여행 국가 유지');
  assert(merged.photoCount === 4, '합친 사진 수 = 2+2');
  assert(merged.photos[0].uri === 'a' && merged.photos[3].uri === 'e', '사진 시간순 정렬');
  assert(merged.medias[0] === 'a', '대표 미디어 = 가장 이른 사진');
  assert(merged.startDate <= germans[0].startDate && merged.endDate >= germans[0].endDate, '기간 = 최소 시작~최대 종료');
  assert(merged.title === '독일 여행', '합친 제목 국가단위');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
