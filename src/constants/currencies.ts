import type { TFunction } from 'i18next';
import { COUNTRIES } from './countries';
import { currencyForCountryName } from './countryCurrency';

/**
 * '기타 통화' 목록 — 단일 출처.
 *
 * 예전엔 components/record/CurrencyPickerModal 과 screens/BlogRecordScreen 이
 * 같은 배열을 각자 복제해 두고 있었고, 이미 어긋나 있었다(모달 25개 / 블로그 17개).
 * 블로그 목록은 모달 목록의 부분집합이었으므로 합집합 = 모달의 25개 그대로다.
 *
 * 코드 집합은 constants/countryCurrency.ts(ISO2 → 통화) 의 값 범위 안에서만 고른다.
 * 거기에 없는 코드를 넣으면 국가 기반 자동 추천이 영영 고를 수 없는 유령 항목이 된다.
 */
export const OTHER_CURRENCIES: readonly string[] = [
  'EUR', 'CNY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'THB', 'VND',
  'MYR', 'PHP', 'IDR', 'INR', 'TRY', 'MXN', 'BRL', 'AED', 'NZD', 'SEK',
  'NOK', 'DKK', 'CZK', 'HUF', 'PLN',
];

/**
 * 통화 표시 이름. 이름을 배열에 박아 두면 영어 모드에서도 '유로 (EU)'가 그대로 나온다
 * (실제 결함이었다) — 표시 문구의 단일 출처는 i18n `currency.<코드>` 키다.
 *
 * Intl.DisplayNames 는 쓰지 않는다. Hermes/RN 은 로케일 데이터가 보장되지 않아
 * 기기에 따라 빈 문자열이 돌아온다.
 *
 * defaultValue 로 코드를 돌려주는 이유: 자동 추천(currencyForCountryName)은 이 목록 밖의
 * 코드(TWD·KHR 등)도 고를 수 있어, 키가 없을 때 라벨이 빈칸으로 사라지면 안 된다.
 */
export const currencyName = (code: string, t: TFunction): string =>
  t(`currency.${code}`, { defaultValue: code });

/**
 * 거주국(ISO2) 기준 기본 통화. 표에 없으면 'USD' — 한국 원화보다 중립적이다.
 *
 * countryCurrency.ts 의 ISO2 표는 비공개(export 되지 않음)라 국가명을 거쳐 조회한다.
 * 표를 이쪽에 다시 적으면 곧바로 두 번째 드리프트 원인이 된다.
 */
export function defaultCurrencyForCountry(iso2?: string | null): string {
  const code = (iso2 || '').toUpperCase();
  const name = code
    ? COUNTRIES.find(c => c.term.split(' ')[0].toUpperCase() === code)?.name
    : undefined;
  return currencyForCountryName(name) ?? 'USD';
}
