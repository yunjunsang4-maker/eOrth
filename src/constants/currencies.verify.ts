// 통화 목록·거주국 기본 통화 순수 로직 검증 (jest 미사용).
// 실행: npx tsx src/constants/currencies.verify.ts
//
// 이 파일이 지키는 것은 defaultCurrencyForCountry 의 **우회 경로**다. countryCurrency.ts 의
// ISO2 표가 비공개라 'ISO2 → COUNTRIES 의 국가명 → 통화' 두 단계를 거치는데, 가운데 단계가
// 끊기면(표엔 있는 ISO2 인데 COUNTRIES 에 없는 등) 조용히 'USD' 로 떨어져 아무도 모른다.
import { OTHER_CURRENCIES, defaultCurrencyForCountry } from './currencies';
import { currencyForCountryName } from './countryCurrency';
import { COUNTRIES } from './countries';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// ─── 1) 거주국 → 통화 ───
{
  assert(defaultCurrencyForCountry('KR') === 'KRW', 'KR → KRW');
  assert(defaultCurrencyForCountry('US') === 'USD', 'US → USD');
  assert(defaultCurrencyForCountry('JP') === 'JPY', 'JP → JPY');
  // 유로존은 개별 통화가 아니라 EUR 로 접힌다
  assert(defaultCurrencyForCountry('FR') === 'EUR', 'FR → EUR (유로존)');
  assert(defaultCurrencyForCountry('DE') === 'EUR', 'DE → EUR (유로존)');
  // 소문자 ISO2 도 받아야 한다 — 저장값이 항상 대문자라는 보장이 없다
  assert(defaultCurrencyForCountry('kr') === 'KRW', '소문자 iso2 도 정상');
}

// ─── 2) 폴백은 USD ───
// 원화로 떨어지면 비한국 사용자에게 기본 통화가 원화로 보인다(이 작업의 출발점).
{
  assert(defaultCurrencyForCountry(undefined) === 'USD', 'undefined → USD');
  assert(defaultCurrencyForCountry(null) === 'USD', 'null → USD');
  assert(defaultCurrencyForCountry('') === 'USD', '빈 문자열 → USD');
  assert(defaultCurrencyForCountry('ZZ') === 'USD', '없는 ISO2 → USD');
  assert(defaultCurrencyForCountry('  ') === 'USD', '공백 → USD');
  assert(defaultCurrencyForCountry('KOR') === 'USD', 'ISO3 는 못 찾는다 → USD');
}

// ─── 3) 우회 경로가 끊기지 않았는가 ───
// COUNTRIES 의 모든 ISO2 를 넣어, 국가명 조회가 되는 나라는 반드시 표와 같은 값을 내야 한다.
// 이 단계가 깨지면 전부 USD 가 되는데 동작은 멀쩡해 보여 눈으로는 절대 못 잡는다.
{
  let mismatched: string[] = [];
  for (const c of COUNTRIES) {
    const iso2 = c.term.split(' ')[0].toUpperCase();
    const viaName = currencyForCountryName(c.name);
    if (!viaName) continue; // 표에 없는 나라는 USD 폴백이 정상
    if (defaultCurrencyForCountry(iso2) !== viaName) mismatched.push(`${iso2}(${c.name})`);
  }
  assert(mismatched.length === 0, `ISO2 왕복이 국가명 조회와 일치 — 불일치: ${mismatched.join(', ') || '없음'}`);

  // 표에 값이 있는 나라가 한 줌만 남으면 위 단언은 통과해도 의미가 없다.
  const covered = COUNTRIES.filter(c => currencyForCountryName(c.name)).length;
  assert(covered >= 80, `통화가 매핑된 국가 ${covered}개 (80개 미만이면 표가 깨진 것)`);
}

// ─── 4) 피커 목록이 유령 항목을 들고 있지 않은가 ───
// currencies.ts 주석의 약속: 목록의 코드는 전부 국가 기반 자동 추천이 고를 수 있어야 한다.
{
  const reachable = new Set(
    COUNTRIES.map(c => currencyForCountryName(c.name)).filter(Boolean) as string[],
  );
  const ghosts = OTHER_CURRENCIES.filter(code => !reachable.has(code));
  assert(ghosts.length === 0, `자동 추천이 닿지 않는 유령 통화 없음 — ${ghosts.join(', ') || '없음'}`);

  assert(new Set(OTHER_CURRENCIES).size === OTHER_CURRENCIES.length, '목록에 중복 코드 없음');
  assert(
    OTHER_CURRENCIES.every(c => /^[A-Z]{3}$/.test(c)),
    '모든 코드가 ISO 4217 형식(대문자 3글자)',
  );
  // 원화는 '기타 통화'가 아니라 퀵칩에 있다 — 목록에 들어가면 중복 노출된다.
  assert(!OTHER_CURRENCIES.includes('KRW'), "목록에 KRW 없음 (퀵칩과 중복 방지)");
}

if (failures) { console.error(`\n${failures} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
