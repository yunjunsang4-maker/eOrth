import { COUNTRIES } from './countries';

/**
 * 국가(ISO2) → 기본 통화 코드. 주요 여행국 위주이며, 없는 국가는 undefined(자동 추천 안 함).
 * 유로존은 모두 EUR.
 */
const EUR = 'EUR';
const ISO2_TO_CURRENCY: Record<string, string> = {
  KR: 'KRW', JP: 'JPY', US: 'USD',
  CN: 'CNY', TW: 'TWD', HK: 'HKD', MO: 'MOP',
  TH: 'THB', VN: 'VND', PH: 'PHP', ID: 'IDR', MY: 'MYR', SG: 'SGD',
  KH: 'KHR', LA: 'LAK', MM: 'MMK', BN: 'BND',
  IN: 'INR', LK: 'LKR', NP: 'NPR', BT: 'BTN', PK: 'PKR', BD: 'BDT', MV: 'MVR',
  MN: 'MNT', KZ: 'KZT', UZ: 'UZS',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  IL: 'ILS', TR: 'TRY', RU: 'RUB', UA: 'UAH',
  GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CZ: 'CZK', HU: 'HUF', PL: 'PLN', RO: 'RON', BG: 'BGN', IS: 'ISK',
  AU: 'AUD', NZ: 'NZD', CA: 'CAD',
  MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU',
  EG: 'EGP', MA: 'MAD', TN: 'TND', ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS',
  // 유로존
  AT: EUR, BE: EUR, HR: EUR, CY: EUR, EE: EUR, FI: EUR, FR: EUR, DE: EUR,
  GR: EUR, IE: EUR, IT: EUR, LV: EUR, LT: EUR, LU: EUR, MT: EUR, NL: EUR,
  PT: EUR, SK: EUR, SI: EUR, ES: EUR, AD: EUR, MC: EUR, SM: EUR, VA: EUR, ME: EUR, XK: EUR,
};

// 국가명(한글) → ISO2 (COUNTRIES.term 의 첫 토큰이 ISO2)
const NAME_TO_ISO2: Record<string, string> = COUNTRIES.reduce<Record<string, string>>((acc, c) => {
  acc[c.name] = c.term.split(' ')[0].toUpperCase();
  return acc;
}, {});

/** 국가명(한글)으로 기본 통화 코드를 반환. 매핑 없으면 undefined. */
export function currencyForCountryName(name?: string): string | undefined {
  if (!name) return undefined;
  const iso2 = NAME_TO_ISO2[name];
  return iso2 ? ISO2_TO_CURRENCY[iso2] : undefined;
}
