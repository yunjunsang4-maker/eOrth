// 한글 국가명/대륙명 → ja·zh-Hant·es·fr 표기(countryNamesI18n 표). 표가 없는 언어·국가는 undefined.
// countryLabel.ts와 분리한 이유: countryLabel은 screens/MainScreen을 import하므로
// MainScreen·GlobeView가 countryLabel을 부르면 순환이 된다. 이 파일은 순수 의존성만 둔다.
import { COUNTRY_NAMES_I18N, CONTINENT_NAMES_I18N, type CountryNameI18n } from '../constants/countryNamesI18n';
import { countryNameToIso2 } from './adCampaignSelect';
import { isJapaneseLang, isTraditionalChineseLang, spanishVariant, isFrenchLang } from './langKind';

// 현재 언어 → 표의 칸 이름. 표가 없는 언어(en·간체 zh 등)는 null.
// es-419·es-ES는 같은 칸(es)을 쓴다 — 국가명은 두 변형이 갈리지 않게 공통 표기로 골랐다.
function i18nColumn(lang: string): keyof CountryNameI18n | null {
  if (isJapaneseLang(lang)) return 'ja';
  if (isTraditionalChineseLang(lang)) return 'zhHant';
  if (spanishVariant(lang)) return 'es';
  if (isFrenchLang(lang)) return 'fr';
  return null;
}

export function localCountryName(ko: string, lang: string): string | undefined {
  const col = i18nColumn(lang);
  if (!col) return undefined;
  // COUNTRIES에 없는 이름(옛 데이터·오타)은 iso가 null → 호출부의 영문 경로가 처리한다.
  const iso = countryNameToIso2(ko);
  return iso ? COUNTRY_NAMES_I18N[iso]?.[col] : undefined;
}

export function localContinentName(ko: string, lang: string): string | undefined {
  const col = i18nColumn(lang);
  return col ? CONTINENT_NAMES_I18N[ko]?.[col] : undefined;
}
