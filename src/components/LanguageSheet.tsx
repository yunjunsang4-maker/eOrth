import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
  useWindowDimensions,
  PlatformColor,
  TouchableHighlight,
} from 'react-native';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../utils/stage';
import { LANGUAGE_LABELS, SELECTABLE_LANGUAGES, type AppLanguage } from '../i18n';
import { select } from '../utils/haptics';
import { SettingsCard, SettingsDivider, SettingsOptionRow, SettingsPillButton, settingsText } from './settings/SettingsUI';
import SystemSheet, { NATIVE_SHEET } from './SystemSheet';

// 언어 선택 시트 — 설정 화면의 '언어 변경' 행이 연다.
//
// ⚠️ 왜 Alert 가 아닌가: 안드로이드 Alert 는 버튼을 3개까지만 그린다
//    (RN Libraries/Alert/Alert.js 가 `buttons.slice(0, 3)`). 언어가 4개가 되면서
//    ko/en/ja/zh-Hant + 취소 = 5개가 되어 Alert 로는 애초에 담기지 않는다.
//    (3개 시절에는 안드로이드에서 취소만 빼는 우회를 썼는데, 그 우회도 여기서 사라진다.)
//
// 재질은 설정 디자인 공용 부품(components/settings/SettingsUI)을 쓴다(2026-10-26 설정 화면 통일) —
// 검은 카드(SettingsCard)·설정 행(SettingsOptionRow, 선택 시 보라 ✓)·취소 알약(SettingsPillButton).
// 하단 스프링 등장·핸들·취소 분리 구조는 예전 카드 시트(UserActionSheet) 그대로다.
export default function LanguageSheet({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: AppLanguage;
  onSelect: (lang: AppLanguage) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const { height: winH } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(500)).current;

  // 옵션 목록 높이 상한 — 언어가 6개가 되면서 작은 기기에서 시트가 화면을 넘길 수 있다.
  // 실측 계산(행 하나 = 위아래 17 + 글자줄): 640dp 기기 + 안드로이드 글꼴 배율 상한 1.2 +
  // 3버튼 내비에서 총 높이가 ≈635dp라 여유가 5dp까지 줄고, **iOS 는 글꼴 배율 상한이 없어서**
  // (ui/Text.tsx 의 FONT_SCALE_CAP 은 안드로이드 전용) 큰 글씨 설정에서는 실제로 넘친다.
  // 넘치면 취소 버튼과 마지막 언어에 손이 닿지 않는다 — 목록만 스크롤시켜 막는다.
  // 상한 밖일 때만 스크롤이 생기므로 평소에는 지금과 똑같이 전부 펼쳐진다.
  //
  // ⚠️ `maxHeight: '55%'` 같은 퍼센트는 여기서 안 먹는다 — 부모(optionsCard)의 높이가 auto 라
  //    Yoga 가 기준으로 삼을 확정 높이가 없다(다른 시트들이 % 를 시트 컨테이너에 주는 이유).
  const CHROME_H = 250; // 핸들 16 + 머리글 ~115 + 카드 아래 여백 10 + 취소 카드 ~61 + 하단 여백·여유 48
  const optionsMaxH = Math.max(180, winH - insets.top - insets.bottom - CHROME_H);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      translateY.setValue(500);
    }
  }, [visible, translateY]);

  const pick = (lang: AppLanguage) => {
    // 햅틱은 반드시 utils/haptics 의 의미 함수를 경유한다 — Haptics.* 직접 호출은
    // 설정의 '햅틱' 스위치를 무력화한다(utils/haptics.ts 주석).
    select();
    onSelect(lang);
    onClose();
  };

  // 저장된 언어가 게이트 밖(정식 빌드의 ja·zh-Hant 등)이어도 자기 언어 행은 보여야 한다 —
  // 없으면 강조도 없고 되돌아올 길도 없다. 현재 언어를 목록에 합쳐 그린다.
  const langs = SELECTABLE_LANGUAGES.includes(current) ? SELECTABLE_LANGUAGES : [...SELECTABLE_LANGUAGES, current];

  // iOS 새 빌드: 시스템 시트 + 안쪽도 iOS 기본 목록(시스템 글꼴·시스템 색·인셋 그룹, 2026-10-31 사용자 결정).
  // 앱 카드·취소 알약은 섞지 않는다 — 닫기는 내려서·바깥 탭(시스템). 옛 빌드·안드로이드는 아래 기존 시트
  if (NATIVE_SHEET) {
    return (
      <SystemSheet visible={visible} onClose={onClose}>
        <View style={styles.iosBody}>
          <Text style={styles.iosTitle}>{t('settings.languageChange')}</Text>
          <Text style={styles.iosDesc}>{t('settings.languageSelectMsg')}</Text>
          <ScrollView style={[styles.iosGroup, { maxHeight: optionsMaxH }]} bounces={false} showsVerticalScrollIndicator={false}>
            {langs.map((lang, i) => (
              <React.Fragment key={lang}>
                {i > 0 && <View style={styles.iosSep} />}
                <TouchableHighlight underlayColor={PlatformColor('systemGray4')} onPress={() => pick(lang)}
                  accessibilityRole="button" accessibilityState={{ selected: lang === current }}>
                  <View style={styles.iosRow}>
                    {/* 표기는 각 언어를 자기 언어로 — 번역하지 않는다(i18n/index.ts 가 단일 출처) */}
                    <Text style={styles.iosLabel} numberOfLines={1}>{LANGUAGE_LABELS[lang]}</Text>
                    {lang === current && <Text style={styles.iosCheck}>✓</Text>}
                  </View>
                </TouchableHighlight>
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      </SystemSheet>
    );
  }

  // 기존 시트 내용 — 설정 카드 재질(검은 채움·공용 링) 안에 머리글(설정 팝업과 같은 제목 18 ExtraBold·설명 흰 50%) →
  // 전폭 구분선 → 선택 행(설정 행과 같은 높이 60·선택 시 보라 ✓) + 취소 알약
  const content = (
    <>
          <SettingsCard style={styles.optionsCard}>
            <View style={styles.titleRow}>
              <Text style={settingsText.sheetTitle}>{t('settings.languageChange')}</Text>
              <Text style={settingsText.sheetDesc}>{t('settings.languageSelectMsg')}</Text>
            </View>
            <SettingsDivider />
            <ScrollView style={{ maxHeight: optionsMaxH }} bounces={false} showsVerticalScrollIndicator={false}>
            {langs.map((lang, i) => (
              <React.Fragment key={lang}>
                {i > 0 && <SettingsDivider />}
                {/* 표기는 각 언어를 자기 언어로 — 번역하지 않는다(i18n/index.ts 가 단일 출처) */}
                <SettingsOptionRow label={LANGUAGE_LABELS[lang]} selected={lang === current} onPress={() => pick(lang)} />
              </React.Fragment>
            ))}
            </ScrollView>
          </SettingsCard>

          {/* 취소 — 설정 팝업 닫기와 같은 알약(높이 60·모서리 30, 옅은 흰 테두리로 시트 위에서도 윤곽 유지) */}
          <SettingsPillButton label={t('common.cancel')} onPress={onClose} baseRim="rgba(255,255,255,0.15)" />
    </>
  );

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {content}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  // iOS 시스템 시트 안쪽 — iOS 기본 목록 치수(제목 17 semibold·행 17·인셋 그룹). PlatformColor는 iOS 다크 시스템 색.
  // fontFamily를 주지 않아 시스템 글꼴로 그려진다. 체크만 앱 틴트(보라 네온) — iOS 앱 틴트 관례
  iosBody: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24 },
  iosTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', color: PlatformColor('label') },
  iosDesc: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 24, color: PlatformColor('secondaryLabel') },
  iosGroup: { flexGrow: 0, borderRadius: 26, overflow: 'hidden', backgroundColor: PlatformColor('secondarySystemGroupedBackground') },
  iosRow: { minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iosLabel: { flexShrink: 1, fontSize: 17, color: PlatformColor('label') },
  iosCheck: { fontSize: 17, fontWeight: '600', marginLeft: 12, color: '#BF85FC' },
  iosSep: { height: StyleSheet.hairlineWidth, marginLeft: 20, backgroundColor: PlatformColor('separator') },
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 overlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  titleRow: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  optionsCard: {
    marginBottom: 10,
  },
});
