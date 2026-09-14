// 거주국별 가입 최소 연령 순수 로직 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/constants/minimumAge.verify.ts
//
// 이 파일이 지키는 것은 **EEA 누락**이다. minimumSignupAge 는 표에 없는 나라를 13 으로
// 떨어뜨리는데, EEA 국가가 표에서 빠지면 동작은 멀쩡해 보이면서 GDPR 제8조 위반이 된다
// (16세 나라 가입자를 13세 기준으로 받게 된다). 눈으로는 절대 못 잡는 종류의 결함이라
// EEA 30개국 목록을 이 파일에 **따로** 적어 두고 대조한다 — 같은 파일에서 가져오면
// 표가 줄어들 때 검사도 같이 줄어들어 아무것도 못 막는다.
import {
  MINIMUM_SIGNUP_AGE_BY_COUNTRY,
  MINIMUM_SIGNUP_AGE_FALLBACK,
  minimumSignupAge,
} from './minimumAge';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// ─── 1) 표의 대표값 ───
// 각 구간(16/15/14/13)에서 최소 하나씩. 한 구간이 통째로 밀리는 편집 사고를 잡는다.
{
  assert(minimumSignupAge('KR') === 14, 'KR → 14 (정보통신망법)');
  assert(minimumSignupAge('US') === 13, 'US → 13 (COPPA)');
  assert(minimumSignupAge('GB') === 13, 'GB → 13 (UK GDPR)');
  assert(minimumSignupAge('JP') === 13, 'JP → 13');
  assert(minimumSignupAge('DE') === 16, 'DE → 16 (GDPR 기본값)');
  assert(minimumSignupAge('IE') === 16, 'IE → 16');
  assert(minimumSignupAge('NL') === 16, 'NL → 16');
  assert(minimumSignupAge('PL') === 16, 'PL → 16');
  assert(minimumSignupAge('FR') === 15, 'FR → 15');
  assert(minimumSignupAge('GR') === 15, 'GR → 15');
  assert(minimumSignupAge('CZ') === 15, 'CZ → 15');
  assert(minimumSignupAge('ES') === 14, 'ES → 14');
  assert(minimumSignupAge('IT') === 14, 'IT → 14');
  assert(minimumSignupAge('AT') === 14, 'AT → 14');
  assert(minimumSignupAge('DK') === 13, 'DK → 13');
  assert(minimumSignupAge('SE') === 13, 'SE → 13');
  assert(minimumSignupAge('BE') === 13, 'BE → 13');
  assert(minimumSignupAge('PT') === 13, 'PT → 13');
  assert(minimumSignupAge('FI') === 13, 'FI → 13');
}

// ─── 2) 표기 흔들림 ───
// 거주국 코드는 사용자 선택·위치 감지·서버 동기화 세 곳에서 들어온다. 늘 대문자라는
// 보장이 없어(currencies.ts 가 같은 이유로 같은 정규화를 한다) 소문자·공백을 받아야 한다.
{
  assert(minimumSignupAge('de') === 16, '소문자 de → 16');
  assert(minimumSignupAge('Kr') === 14, '섞인 대소문자 Kr → 14');
  assert(minimumSignupAge(' DE ') === 16, '앞뒤 공백 " DE " → 16');
}

// ─── 3) 널 계열·모르는 값은 폴백 13 ───
// 셋을 뭉뚱그리면 한 갈래만 다른 값으로 새는 것을 놓친다.
{
  assert(minimumSignupAge(undefined) === 13, 'undefined → 13');
  assert(minimumSignupAge(null) === 13, 'null → 13');
  assert(minimumSignupAge('') === 13, '빈 문자열 → 13');
  assert(minimumSignupAge('   ') === 13, '공백만 → 13');
  assert(minimumSignupAge('ZZ') === 13, '없는 ISO2 → 13');
  assert(minimumSignupAge('KOR') === 13, 'ISO3 는 못 찾는다 → 13 (표 키는 ISO2)');
  assert(MINIMUM_SIGNUP_AGE_FALLBACK === 13, '폴백 상수 자체가 13');
}

// ─── 4) EEA 30개국이 전부 표에 있는가 (이 파일의 핵심) ───
// 하나라도 빠지면 13 으로 떨어져 GDPR 제8조 위반이 된다.
// 목록은 EU 27 + 아이슬란드·노르웨이·리히텐슈타인. 여기 적어 두는 이유는 파일 머리말 참고.
{
  const EEA = [
    // EU 27
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    // EEA 비EU 3
    'IS', 'NO', 'LI',
  ];
  assert(EEA.length === 30, `EEA 목록이 30개 (실제 ${EEA.length}개 — 목록 자체가 틀리면 아래 검사가 무의미)`);
  assert(new Set(EEA).size === EEA.length, 'EEA 목록에 중복 없음');

  const missing = EEA.filter((c) => MINIMUM_SIGNUP_AGE_BY_COUNTRY[c] === undefined);
  assert(
    missing.length === 0,
    `EEA 30개국이 전부 표에 있음 — 누락: ${missing.join(', ') || '없음'}`,
  );

  // 폴백으로 떨어지지 않는지도 함수 경로로 한 번 더 본다(표엔 있는데 조회가 깨진 경우).
  const viaFn = EEA.filter((c) => minimumSignupAge(c) !== MINIMUM_SIGNUP_AGE_BY_COUNTRY[c]);
  assert(viaFn.length === 0, `EEA 조회가 표와 일치 — 불일치: ${viaFn.join(', ') || '없음'}`);
}

// ─── 5) 모든 값이 법이 허용하는 범위 안인가 ───
// GDPR 제8조는 13~16 사이에서만 정할 수 있다. 오타로 1·18 같은 값이 들어가면
// 체크박스 문구가 "만 1세 이상입니다"가 되어 그대로 스토어에 나간다.
{
  const outOfRange = Object.entries(MINIMUM_SIGNUP_AGE_BY_COUNTRY)
    .filter(([, age]) => !Number.isInteger(age) || age < 13 || age > 16)
    .map(([code, age]) => `${code}=${age}`);
  assert(outOfRange.length === 0, `모든 값이 13~16 정수 — 벗어남: ${outOfRange.join(', ') || '없음'}`);

  const badKeys = Object.keys(MINIMUM_SIGNUP_AGE_BY_COUNTRY).filter((k) => !/^[A-Z]{2}$/.test(k));
  assert(badKeys.length === 0, `모든 키가 대문자 ISO2 — 벗어남: ${badKeys.join(', ') || '없음'}`);
}

if (failures) { console.error(`\n${failures} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
