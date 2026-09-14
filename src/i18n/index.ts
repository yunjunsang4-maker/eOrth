// i18next 초기화. App 진입 시 1회 import되어 i18n 인스턴스를 세팅한다.
// 실제 언어는 settingsStore.language(영속) 기준으로 LanguageBridge가 동기화한다.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import ko from './locales/ko';
import en from './locales/en';

export type AppLanguage = 'ko' | 'en';

const resources = {
  ko: { translation: ko },
  en: { translation: en },
} as const;

// 기기 언어 기반 기본 언어 — 한국어 기기만 ko, 그 외는 전부 en (사용자 확정 2026-07-30).
// settingsStore의 첫 실행 기본값도 이 값을 쓴다. 저장된 언어가 있으면 hydrate가 덮으므로
// 사용자가 직접 고른 언어는 기기 언어와 무관하게 유지된다.
export const DEVICE_DEFAULT_LANGUAGE: AppLanguage =
  getLocales()[0]?.languageCode === 'ko' ? 'ko' : 'en';

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
    fallbackLng: 'ko',
    interpolation: { escapeValue: false }, // RN은 XSS 이스케이프 불필요
    returnNull: false,
    compatibilityJSON: 'v4',
  });
}

export default i18n;
