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

// 저장된 설정이 복원되기 전 초기 표시용으로 기기 언어를 추정(영어면 en, 그 외 ko).
const deviceLang: AppLanguage = getLocales()[0]?.languageCode === 'en' ? 'en' : 'ko';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: deviceLang,
    fallbackLng: 'ko',
    interpolation: { escapeValue: false }, // RN은 XSS 이스케이프 불필요
    returnNull: false,
    compatibilityJSON: 'v4',
  });
}

export default i18n;
