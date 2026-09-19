// i18next 초기화. App 진입 시 1회 import되어 i18n 인스턴스를 세팅한다.
// 실제 언어는 settingsStore.language(영속) 기준으로 LanguageBridge가 동기화한다.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import ko from './locales/ko';
import en from './locales/en';
import ja from './locales/ja';
import zhHant from './locales/zh-Hant';
import { COUNTRIES } from '../constants/countries';

export type AppLanguage = 'ko' | 'en' | 'ja' | 'zh-Hant';

// ja.ts / zh-Hant.ts 는 `DeepPartial<typeof ko>` 라 값이 `string | undefined` 인 선택적 키를 갖는다.
// i18next 의 ResourceKey 는 undefined 를 받지 않아 그대로는 안 들어간다. resources 전체를
// i18next `Resource` 로 캐스팅하면 ko/en 의 키 타입까지 같이 풀려 오타를 못 잡으므로,
// **부분 번역 언어 칸만** 완역본 모양으로 단언한다(빠진 키는 fallbackLng 가 런타임에 메운다).
//
// ⚠️ 'zh-Hant' 키는 이 철자 그대로 써야 한다. i18next 는 '-' 가 든 코드를
//    `Intl.getCanonicalLocales()` 로 정규화하는데(languageUtils.formatLanguageCode),
//    'zh-Hant' 의 정본 표기가 정확히 'zh-Hant' 라 소문자화·변형이 일어나지 않는다
//    (lowerCaseLng/cleanCode 를 켜지 않았다). 노드에서 실측 확인함.
const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja as typeof ko },
  'zh-Hant': { translation: zhHant as typeof ko },
} as const;

// 설정 화면에 노출할 언어 목록. ja·zh-Hant 는 아직 부분 번역이라 정식 빌드에서는 감춘다
// (완역 + 검수가 끝나면 이 __DEV__ 게이트를 지운다).
// 게이트는 "고를 수 있는가"만 막는다 — 이미 저장된 값·백업 복원은 정식에서도 살아난다.
// 언어 선택 UI 는 components/LanguageSheet.tsx(바텀시트)다. 안드로이드 Alert 는 버튼을
// 3개까지만 그려서(RN Alert.js 의 slice(0, 3)) 언어 4개 + 취소를 담을 수 없었다.
export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-Hant': '繁體中文',
}; // 각 언어를 자기 언어로 적는 것이 관례다(번역하지 말 것)

export const SELECTABLE_LANGUAGES: AppLanguage[] = __DEV__
  ? ['ko', 'en', 'ja', 'zh-Hant']
  : ['ko', 'en'];

// 기기 언어 기반 기본 언어 — 한국어 기기만 ko, 그 외는 전부 en (사용자 확정 2026-07-30).
// ⚠️ 일본어·번체 중국어 기기도 아직 en 이다 — 완역 전까지는 기기 언어로 자동 선택하지 않는다.
// settingsStore의 첫 실행 기본값도 이 값을 쓴다. 저장된 언어가 있으면 hydrate가 덮으므로
// 사용자가 직접 고른 언어는 기기 언어와 무관하게 유지된다.
export const DEVICE_DEFAULT_LANGUAGE: AppLanguage =
  getLocales()[0]?.languageCode === 'ko' ? 'ko' : 'en';

// 기기 지역(regionCode, ISO2) 기반 기본 거주국 — 'KR' 하드코딩을 대체한다.
// 언어와 같은 규칙: settingsStore의 첫 실행 기본값이며, **저장본이 있으면 hydrate가 덮는다**.
// 목록에 있는 코드일 때만 채택하는 이유: regionCode에는 ISO2가 아닌 값(EU 등)이 오거나 아예
// 없는 기기가 있고, COUNTRIES에 없는 코드를 거주국으로 넣으면 국가명·국기·통화 조회가 전부
// 빈손이 되면서 화면이 조용히 비어 버린다.
// 폴백이 'KR'인 이유: 거주국은 통화 기본값·귀국 감지·'일상' 링 판정의 기준이라 비워 둘 수
// 없고, 현재 사용자 기반이 한국이라 가장 덜 틀리는 값이다(사용자가 온보딩에서 바로 바꾼다).
export const DEVICE_DEFAULT_HOME_COUNTRY: string = (() => {
  const region = getLocales()[0]?.regionCode?.toUpperCase();
  if (!region) return 'KR';
  // COUNTRIES의 코드는 term의 첫 토큰(대문자화) — constants/countries.ts 규약
  return COUNTRIES.some((c) => c.term.split(' ')[0].toUpperCase() === region) ? region : 'KR';
})();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: DEVICE_DEFAULT_LANGUAGE,
    // ⚠️ 'en'으로 바꾸지 말 것 — 회귀가 난다.
    // ko.ts 에는 badge 섹션이 아예 없다(배지 한국어 원문의 단일 출처는 constants/badges.ts).
    // utils/badgeText.ts 가 이 fallbackLng: 'ko' 를 전제로 `t('badge.n…', { defaultValue: 상수 })`
    // 를 쓰기 때문에, 폴백을 'en'으로 돌리면 한국어 사용자에게 en.ts 의 영어 배지 이름이 뜬다.
    //
    // "새 기능에 영어 키를 빠뜨리면 영어 UI에 한글이 샌다"는 위험은 런타임 폴백이 아니라
    // 빌드 시점 검사로 막는다 → src/i18n/localeParity.verify.ts (npm test 에 포함).
    //
    // ja·zh-Hant 는 부분 번역이라 en → ko 순으로 떨어진다(없는 키는 영어, 영어에도 없으면 한국어).
    // default 가 'ko' 로 남아 있으므로 위 badge 폴백 논리는 그대로 성립한다.
    fallbackLng: { ja: ['en', 'ko'], 'zh-Hant': ['en', 'ko'], default: ['ko'] },
    interpolation: { escapeValue: false }, // RN은 XSS 이스케이프 불필요
    returnNull: false,
    compatibilityJSON: 'v4',
  });
}

export default i18n;
