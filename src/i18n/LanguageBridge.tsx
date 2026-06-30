// settingsStore.language(영속) → i18next 언어를 동기화하는 브리지.
// SettingsProvider 안에서 렌더되어, 사용자가 언어를 바꾸면 앱 전체 문구가 즉시 전환된다.
import { useEffect } from 'react';
import i18n from './index';
import { useSettings } from '../store/settingsStore';

export default function LanguageBridge() {
  const { language } = useSettings();
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);
  return null;
}
