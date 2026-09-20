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
} from 'react-native';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../utils/stage';
import { LANGUAGE_LABELS, SELECTABLE_LANGUAGES, type AppLanguage } from '../i18n';
import { select } from '../utils/haptics';

// 언어 선택 시트 — 설정 화면의 '언어 변경' 행이 연다.
//
// ⚠️ 왜 Alert 가 아닌가: 안드로이드 Alert 는 버튼을 3개까지만 그린다
//    (RN Libraries/Alert/Alert.js 가 `buttons.slice(0, 3)`). 언어가 4개가 되면서
//    ko/en/ja/zh-Hant + 취소 = 5개가 되어 Alert 로는 애초에 담기지 않는다.
//    (3개 시절에는 안드로이드에서 취소만 빼는 우회를 썼는데, 그 우회도 여기서 사라진다.)
//
// 재질은 UserActionSheet(팔로워 ⋯ 메뉴)의 카드 시트를 그대로 쓴다 — #1E1E2E / radius 20 /
// 하단 스프링 등장 / 취소 카드 분리. 머리글(제목·부제)과 선택 행 강조(#BF85FC)는
// HomeRegionSheet 의 것과 같은 값이다. 새 재질을 만들면 앱에 시트 모양이 한 벌 더 생긴다.
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

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <View style={styles.optionsCard}>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>{t('settings.languageChange')}</Text>
              <Text style={styles.descText}>{t('settings.languageSelectMsg')}</Text>
            </View>
            <View style={styles.divider} />

            {/* 저장된 언어가 게이트 밖(정식 빌드의 ja·zh-Hant 등)이어도 자기 언어 행은 보여야 한다 —
                없으면 강조도 없고 되돌아올 길도 없다. 현재 언어를 목록에 합쳐 그린다. */}
            <ScrollView style={{ maxHeight: optionsMaxH }} bounces={false} showsVerticalScrollIndicator={false}>
            {(SELECTABLE_LANGUAGES.includes(current) ? SELECTABLE_LANGUAGES : [...SELECTABLE_LANGUAGES, current]).map((lang, i) => {
              const selected = lang === current;
              return (
                <React.Fragment key={lang}>
                  {i > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.7}
                    onPress={() => pick(lang)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={LANGUAGE_LABELS[lang]}
                  >
                    {/* 표기는 각 언어를 자기 언어로 — 번역하지 않는다(i18n/index.ts 가 단일 출처) */}
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {LANGUAGE_LABELS[lang]}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.cancelCard} activeOpacity={0.8} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
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
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 overlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  optionsCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  titleRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#A1A1B0',
    textAlign: 'center',
  },
  option: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  optionTextSelected: {
    color: '#BF85FC',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});
