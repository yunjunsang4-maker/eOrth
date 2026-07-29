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
    fallbackLng: 'ko',
    interpolation: { escapeValue: false }, // RN은 XSS 이스케이프 불필요
    returnNull: false,
    compatibilityJSON: 'v4',
  });
}

export default i18n;
