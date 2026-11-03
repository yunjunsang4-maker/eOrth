// 베타 번역 언어 안내 — 설정 언어 시트(LanguageSheet)와 온보딩 기본 정보(BasicInfoScreen)가 같이 쓴다.
// ko·en 밖 언어는 부분 번역·미검수라(빠진 키는 영어로 메워진다), 고를 때 어색한 번역을 신고해 달라고 알린다.
import { Alert } from 'react-native';
import i18n from 'i18next';
import type { AppLanguage } from './index';

export const isBetaLanguage = (lang: AppLanguage) => lang !== 'ko' && lang !== 'en';

/**
 * 고른 언어가 베타면 안내 Alert를 띄운다. 문구는 **고른 언어로** — LanguageBridge의 changeLanguage를
 * 기다리지 않도록 그 언어 고정 t를 쓴다('es-419'는 리소스 계층상 기반 es가 메운다).
 * delayMs: 시트(Modal·시스템 시트)가 닫히는 중에 Alert를 띄우면 iOS가 표시를 버릴 수 있어 닫힌 뒤로 미룬다.
 */
export function showBetaTranslationNotice(lang: AppLanguage, delayMs = 0) {
  if (!isBetaLanguage(lang)) return;
  const t = i18n.getFixedT(lang);
  setTimeout(() => {
    Alert.alert(t('settings.betaTranslationTitle'), t('settings.betaTranslationMsg'), [{ text: t('common.confirm') }]);
  }, delayMs);
}
