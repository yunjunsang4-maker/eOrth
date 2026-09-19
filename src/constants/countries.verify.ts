// 거주국 우선 정렬(countriesHomeFirst) 순수 로직 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/constants/countries.verify.ts
//
// 이 함수가 지키는 것은 "거주국 하나만 앞으로, 나머지는 원래 순서 그대로"다. COUNTRIES의
// 순서는 한국인의 여행 빈도순으로 손으로 정렬한 값이라, 정렬을 새로 하거나 나머지 순서가
// 흔들리면 모든 국가 선택 목록이 조용히 뒤죽박죽이 된다(화면에선 알아채기 어렵다).
import { COUNTRIES, countriesHomeFirst, countryEnglishName, type Country } from './countries';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const c = (code: string, name: string): Country =>
  ({ term: `${code.toLowerCase()} ${name}`, flag: '', name, continent: '아시아' });
const LIST: Country[] = [c('kr', '대한민국'), c('jp', '일본'), c('us', '미국'), c('fr', '프랑스')];
const codes = (list: Country[]) => list.map((x) => x.term.split(' ')[0].toUpperCase());

// ─── 1) 중간에 있는 거주국이 맨 앞으로, 나머지는 순서 유지 ───
{
  const r = countriesHomeFirst(LIST, 'US');
  assert(r.length === LIST.length, '길이 보존 (US)');
  assert(JSON.stringify(codes(r)) === JSON.stringify(['US', 'KR', 'JP', 'FR']),
    'US가 맨 앞으로 오고 KR·JP·FR 상대 순서 유지');
  assert(JSON.stringify(codes(LIST)) === JSON.stringify(['KR', 'JP', 'US', 'FR']),
    '원본 배열은 변형되지 않는다(제자리 정렬 금지)');
  // 맨 끝 항목도 같은 규칙 — slice 경계 오프바이원 방지
  assert(JSON.stringify(codes(countriesHomeFirst(LIST, 'FR'))) === JSON.stringify(['FR', 'KR', 'JP', 'US']),
    '마지막 항목(FR)도 맨 앞으로');
}

// ─── 2) 표기 흔들림 — 저장값이 항상 대문자·공백 없음이라는 보장이 없다 ───
{
  assert(JSON.stringify(codes(countriesHomeFirst(LIST, 'us'))) === JSON.stringify(['US', 'KR', 'JP', 'FR']),
    '소문자 코드도 동작');
  assert(JSON.stringify(codes(countriesHomeFirst(LIST, ' us '))) === JSON.stringify(['US', 'KR', 'JP', 'FR']),
    '앞뒤 공백도 동작');
}

// ─── 3) 없는 코드·널 계열은 원본 그대로 ───
// 여기서 정렬이 일어나면 "거주국을 못 찾았는데 목록이 바뀐" 상태가 되어 원인 추적이 어렵다.
{
  assert(countriesHomeFirst(LIST, 'ZZ') === LIST, '목록에 없는 코드 → 같은 참조 반환');
  assert(countriesHomeFirst(LIST, '') === LIST, '빈 문자열 → 같은 참조 반환');
  assert(countriesHomeFirst(LIST, '  ') === LIST, '공백만 → 같은 참조 반환');
  assert(countriesHomeFirst(LIST, undefined) === LIST, 'undefined → 같은 참조 반환');
  assert(countriesHomeFirst(LIST, null) === LIST, 'null → 같은 참조 반환');
  assert(countriesHomeFirst(LIST, 'KR') === LIST, '이미 맨 앞이면 새 배열도 안 만든다');
  assert(countriesHomeFirst([], 'KR').length === 0, '빈 목록도 터지지 않는다');
}

// ─── 4) 실제 COUNTRIES 위에서 ───
// 합성 배열만 보면 term 규약(첫 토큰이 ISO2)이 실제 데이터와 어긋나도 통과한다.
{
  const r = countriesHomeFirst(COUNTRIES, 'FR');
  assert(r.length === COUNTRIES.length, 'COUNTRIES 길이 보존');
  assert(r[0]?.name === '프랑스', '실제 COUNTRIES에서 FR → 프랑스가 맨 앞');
  assert(r.filter((x) => x.name === '프랑스').length === 1, '프랑스가 중복되지 않는다');
  assert(countriesHomeFirst(COUNTRIES, 'KR') === COUNTRIES, 'KR은 이미 맨 앞이라 원본 그대로');
}

// ─── 5) 모든 COUNTRIES 국가명이 영문 표기를 갖는다 ───
// countryLabel(영어 모드)의 마지막 폴백이 이 함수다. 여기서 한글이 나오면 영어 UI에 한글 국가명이 샌다.
{
  const leaked = COUNTRIES.filter((c) => { const en = countryEnglishName(c.name); return !en || /[가-힣]/.test(en); }).map((c) => c.name);
  assert(leaked.length === 0, `영문 표기 없는 국가 0개 (실제: ${leaked.join(', ') || '없음'})`);
  assert(countryEnglishName('없는나라') === '없는나라', 'COUNTRIES에 없는 값은 입력 그대로');
}

if (failures) { console.error(`\n${failures} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
