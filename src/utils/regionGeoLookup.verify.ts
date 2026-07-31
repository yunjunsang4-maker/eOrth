// 지역 지오 조회 검증 — 실제 지오 데이터로 확인한다(모킹 없음).
import { regionNameByCode, totalRegionCount, visitedRegionCount } from './regionGeoLookup';
import { GEO_COUNTRY_CODES, getCountryGeo } from '../data/countryGeo';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

// -- regionNameByCode --
{
  assert(regionNameByCode('JPN', 'JP-13', 'ko') === '도쿄도', 'JP-13 → 도쿄도 (한글)');
  assert(regionNameByCode('JPN', 'JP-13', 'en') === 'Tokyo', 'JP-13 → Tokyo (영문)');
  assert(regionNameByCode('KOR', 'KR-11', 'ko') === '서울특별시', 'KR-11 → 서울특별시');
  // 없는 코드·국가는 null — 호출부가 스스로 폴백해야 한다
  assert(regionNameByCode('JPN', 'JP-99', 'ko') === null, '지오에 없는 코드 → null');
  assert(regionNameByCode('XXX', 'JP-13', 'ko') === null, '수록되지 않은 국가 → null');
  assert(regionNameByCode('', 'JP-13', 'ko') === null, '빈 국가코드 → null');
  assert(regionNameByCode('JPN', '', 'ko') === null, '빈 지역코드 → null');
}

// -- totalRegionCount --
{
  assert(totalRegionCount('JPN') === 47, '일본 47개 (도도부현)');
  assert(totalRegionCount('KOR') === 17, '한국 17개 (시·도)');
  assert(totalRegionCount('XXX') === 0, '수록되지 않은 국가는 0 (진행도 숨김 신호)');
  assert(totalRegionCount('') === 0, '빈 코드는 0');
}

// -- visitedRegionCount --
{
  assert(visitedRegionCount('JPN', ['JP-13', 'JP-27']) === 2, '유효 코드 2개');
  assert(visitedRegionCount('JPN', ['JP-13', 'JP-13']) === 2 - 1, '중복은 한 번만');
  assert(visitedRegionCount('JPN', ['JP-13', 'JP-99']) === 1, '지오에 없는 코드는 세지 않는다');
  assert(visitedRegionCount('JPN', []) === 0, '빈 목록은 0');
  assert(visitedRegionCount('JPN', ['', null as any]) === 0, '빈 값·null 무시');
  // 분자가 분모를 넘지 않아야 한다 — "47곳 중 48곳"이 나오면 안 된다
  const all = getCountryGeo('JPN').features.map((f: any) => f.properties.CODE);
  assert(visitedRegionCount('JPN', [...all, 'JP-99', 'BOGUS']) === totalRegionCount('JPN'),
    '전체 코드 + 잡음을 넣어도 분모를 넘지 않는다');
}

// 수록된 27개국 모두 지역이 1개 이상이고, 첫 지역의 한글명이 조회된다
{
  let bad = 0;
  for (const iso3 of GEO_COUNTRY_CODES) {
    const total = totalRegionCount(iso3);
    if (total < 1) { console.error(`    ${iso3}: 지역 0개`); bad++; continue; }
    const first = getCountryGeo(iso3).features[0].properties.CODE;
    if (!regionNameByCode(iso3, first, 'ko')) { console.error(`    ${iso3}: ${first} 한글명 없음`); bad++; }
  }
  assert(bad === 0, `수록 ${GEO_COUNTRY_CODES.length}개국 모두 지역·한글명 보유`);
}

console.log(failures === 0 ? '\n모든 검증 통과' : `\n실패 ${failures}건`);
if (failures > 0) process.exitCode = 1;
