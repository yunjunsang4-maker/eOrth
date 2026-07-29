// src/utils/regionKeyMigration.verify.ts
import {
  REGION_KEY_SCHEMA, normRegion, resolveRegionCode,
  migrateRegionKeyMap, migrateTaggedRegions, migrateRegionNameEn, migrateSkinColorStore,
} from './regionKeyMigration';
import { REGION_KEY_ALIASES, REGION_CITY_ALIAS_KEYS } from '../data/regionKeyAliases';

/** Task 1 생성기가 출력한 매칭 수. 회귀 감지용 고정값이라 표를 다시 구우면 함께 고친다. */
const EXPECTED_ALIAS_COUNT = 820; // ← Task 1 생성기 출력(regionKeyAliases.ts 헤더 주석): 매칭 820개

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 1. 정규화
eq(normRegion('Oberösterreich'), 'oberosterreich', '정규화: 발음구별기호·소문자');
eq(normRegion("Provence-Alpes-Côte d'Azur"), 'provencealpescotedazur', '정규화: 기호 제거');

// 2. 대표 키 해석
eq(resolveRegionCode('USA', 'NewYork'), 'US-NY', '해석: 미국 뉴욕주');
eq(resolveRegionCode('AUT', 'Oberösterreich'), 'AT-4', '해석: 오스트리아 오버외스터라이히');
eq(resolveRegionCode('AUT', 'Hallstatt'), 'AT-4', '해석: 도시 흡수(할슈타트→오버외스터라이히)');
eq(resolveRegionCode('ZZZ', 'Nowhere'), null, '해석: 미등록 국가는 null');

// 3. 멱등성 — 이미 변환된 코드를 다시 넣어도 그대로
eq(resolveRegionCode('USA', 'US-NY'), 'US-NY', '멱등: 코드 재입력');

// 4. 신 키 유일성 — 한 코드가 두 국가에 걸치면 안 된다.
//    (서로 다른 구 키가 같은 신 키를 가리키는 것은 도시 흡수로 정상이다)
{
  const isoByCode = new Map<string, string>();
  const cross: string[] = [];
  for (const [k, code] of Object.entries(REGION_KEY_ALIASES)) {
    const iso = k.slice(0, k.indexOf('|'));
    const prev = isoByCode.get(code);
    if (prev && prev !== iso) cross.push(`${code}: ${prev} vs ${iso}`);
    else if (!prev) isoByCode.set(code, iso);
  }
  eq(cross, [], '유일성: 한 코드가 두 국가에 걸치지 않음');
}

// 5. 충돌 규칙 — 도시와 상위 주가 같은 신 키로 접히면 주 값이 이긴다
eq(migrateRegionKeyMap({ 'AUT|Oberösterreich': '#AAA', 'AUT|Hallstatt': '#BBB' }),
   { 'AUT|AT-4': '#AAA' }, '충돌: 상위 주 값 우선');
eq(migrateRegionKeyMap({ 'AUT|Hallstatt': '#BBB', 'AUT|Oberösterreich': '#AAA' }),
   { 'AUT|AT-4': '#AAA' }, '충돌: 입력 순서와 무관');
eq(migrateRegionKeyMap({ 'AUT|Hallstatt': '#BBB' }),
   { 'AUT|AT-4': '#BBB' }, '충돌: 주 값이 없으면 도시 값 채택');

// 6. 미매칭 보존
eq(migrateRegionKeyMap({ 'AUT|알수없는지역': '#CCC' }),
   { 'AUT|알수없는지역': '#CCC' }, '보존: 미매칭 키는 그대로');
eq(migrateRegionKeyMap({ 'malformed': '#DDD' }),
   { 'malformed': '#DDD' }, '보존: 형식이 다른 키는 그대로');

// 7. 맵 멱등성
{
  const once = migrateRegionKeyMap({ 'USA|NewYork': '#111' });
  eq(migrateRegionKeyMap(once), once, '멱등: 두 번 변환해도 동일');
}

// 8. taggedRegions — nameEn만 바뀌고 한글명은 불변, 중복 제거
eq(migrateTaggedRegions({
     AUT: [{ name: '오버외스터라이히', nameEn: 'Oberösterreich' },
           { name: '할슈타트', nameEn: 'Hallstatt' }],
   }),
   { AUT: [{ name: '오버외스터라이히', nameEn: 'AT-4' }] },
   '태깅: 한글명 유지 + 중복 제거');

// 9. 기록의 regionNameEn
eq(migrateRegionNameEn('USA', 'NewYork'), 'US-NY', '기록: 코드로 변환');
eq(migrateRegionNameEn('USA', '알수없음'), '알수없음', '기록: 미매칭은 원본 유지');

// 10. 스키마 버전
eq(REGION_KEY_SCHEMA, 1, '스키마 버전 = 1');

// 11. 도시 유래 키 목록이 별칭 표의 부분집합인지
{
  const bad = REGION_CITY_ALIAS_KEYS.filter((k) => !(k in REGION_KEY_ALIASES));
  eq(bad, [], '도시 키 목록이 별칭 표에 모두 존재');
}

// 12. 중첩 순회 — 스킨별 지역 색까지 변환되는지
eq(migrateSkinColorStore({
     aurora: { globeColor: '#000', countryColors: {}, regionColors: { 'USA|NewYork': '#111' } },
   }),
   { aurora: { globeColor: '#000', countryColors: {}, regionColors: { 'USA|US-NY': '#111' } } },
   '중첩: 스킨별 지역 색도 변환');

// 13. 전수 변환율 — Task 1 생성 결과를 고정값으로 박아 회귀를 잡는다.
//     아래 값은 Task 2 Step 5에서 생성기 출력을 보고 채운다.
eq(Object.keys(REGION_KEY_ALIASES).length, EXPECTED_ALIAS_COUNT, '전수: 별칭 수 고정');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
