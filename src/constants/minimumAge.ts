/**
 * 거주국별 가입 최소 연령 — 단일 출처.
 *
 * 왜 나라별인가: 지금까지 "만 14세"가 앱 전체에 하드코딩돼 있었다(한국 정보통신망법 기준).
 * 영어 UI 에도 `I am 14 years of age or older` 가 그대로 나가고 있었는데, GDPR 제8조는
 * 디지털 서비스 단독 동의 연령을 13~16세 사이에서 각 회원국이 정하도록 열어 두었고
 * 미국 COPPA 는 13세다. 한 숫자로는 어느 쪽에도 맞출 수 없다.
 *
 * ⚠️ 생년월일(birthday)은 App Store 5.1.1(v) 대응으로 의도적으로 폐지한 필드다.
 * 나이를 계산하려고 생년월일을 다시 받으면 심사 거절 사유가 되살아난다. 게이트는 지금처럼
 * 자기신고 체크박스로 두고, **표시하는 나이와 판정 기준만** 거주국에 따라 바꾼다.
 *
 * 표에 없는 나라는 13세로 떨어진다. 그래서 EEA 30개국(EU 27 + 아이슬란드·노르웨이·
 * 리히텐슈타인)은 하나도 빠짐없이 채워 둔다 — EEA 국가가 표에서 빠지면 13세로 떨어져
 * 곧바로 GDPR 위반이 된다. minimumAge.verify.ts 가 이 누락을 막는다.
 *
 * 값 옆 근거는 반드시 남긴다. 근거 없는 숫자는 다음 사람이 고칠 수도, 유지할 수도 없다.
 */
export const MINIMUM_SIGNUP_AGE_BY_COUNTRY: Readonly<Record<string, number>> = {
  // ── 비 EEA ──
  KR: 14, // 정보통신망법 제31조 — 만 14세 미만은 법정대리인 동의 필요
  US: 13, // COPPA (Children's Online Privacy Protection Act)
  GB: 13, // UK GDPR + Data Protection Act 2018 s.9
  JP: 13, // 개인정보보호법에 디지털 동의 연령 규정 없음 → GDPR 하한과 같은 13 으로 둔다

  // ── EEA: GDPR 제8조를 16세 미만으로 낮추지 않은 나라 (기본값 16) ──
  DE: 16, // GDPR 제8조 기본값 — 독일은 하향 입법을 하지 않았다
  IE: 16, // Data Protection Act 2018 (IE) s.31 — digital age of consent 16
  NL: 16, // UAVG art.5 — GDPR 기본값 유지
  PL: 16, // Ustawa o ochronie danych osobowych (2018) art.8 — 16
  BG: 16, // GDPR 제8조 기본값
  HR: 16, // GDPR 제8조 기본값
  CY: 16, // GDPR 제8조 기본값
  EE: 16, // GDPR 제8조 기본값
  HU: 16, // GDPR 제8조 기본값
  LV: 16, // GDPR 제8조 기본값
  LT: 16, // GDPR 제8조 기본값
  LU: 16, // GDPR 제8조 기본값
  MT: 16, // GDPR 제8조 기본값
  RO: 16, // GDPR 제8조 기본값
  SK: 16, // GDPR 제8조 기본값
  SI: 16, // GDPR 제8조 기본값
  IS: 16, // GDPR 제8조 기본값 (EEA·비EU)
  NO: 16, // GDPR 제8조 기본값 (EEA·비EU) — 노르웨이는 13세 하향안이 입법되지 않았다
  LI: 16, // GDPR 제8조 기본값 (EEA·비EU)

  // ── EEA: 15세로 낮춘 나라 ──
  FR: 15, // Loi Informatique et Libertés art.45 (2018 개정)
  GR: 15, // Law 4624/2019 art.21
  CZ: 15, // Zákon č. 110/2019 Sb. §7

  // ── EEA: 14세로 낮춘 나라 ──
  ES: 14, // LOPDGDD 3/2018 art.7
  IT: 14, // D.lgs. 101/2018 art.2-quinquies
  AT: 14, // DSG §4(4)

  // ── EEA: 13세(GDPR 하한)로 낮춘 나라 ──
  DK: 13, // Databeskyttelsesloven §6(3)
  SE: 13, // Dataskyddslagen (2018:218) kap.2 §4
  BE: 13, // Loi du 30 juillet 2018 art.7
  PT: 13, // Lei 58/2019 art.16
  FI: 13, // Tietosuojalaki 1050/2018 §5
};

/** 표에 없는 나라의 기본값. GDPR 이 허용하는 하한이자 COPPA 기준과 같은 13세. */
export const MINIMUM_SIGNUP_AGE_FALLBACK = 13;

/**
 * 거주국(ISO2) 기준 가입 최소 연령. 표에 없으면 13.
 *
 * 대소문자·앞뒤 공백을 가리지 않는다 — 저장값이 항상 대문자라는 보장이 없다
 * (currencies.ts 의 defaultCurrencyForCountry 가 같은 이유로 같은 정규화를 한다).
 * ISO3('KOR')은 일부러 못 찾는다: 표의 키가 ISO2 라 억지로 맞추면 오히려 조용히 틀린다.
 */
export function minimumSignupAge(iso2?: string | null): number {
  const code = (iso2 || '').trim().toUpperCase();
  return MINIMUM_SIGNUP_AGE_BY_COUNTRY[code] ?? MINIMUM_SIGNUP_AGE_FALLBACK;
}
