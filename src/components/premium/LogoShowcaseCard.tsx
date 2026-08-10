import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { useTranslation } from 'react-i18next';
import ShowcaseCard from './ShowcaseCard';
import MiniStrip from './MiniStrip';
import { useSkinAccent } from '../../constants/skinTheme';

// 스트립 로고 제거 혜택 쇼케이스 — 스트립을 탭하면 하단 로고가 사라졌다 나타난다.
// 미리보기 전용이라 설정(stripLogoRemoval)에는 저장하지 않는다.

const PREVIEW_FRAME = '#F5EBE0'; // 크림 — 로고 대비가 가장 잘 보이는 기본 프레임색
const STRIP_W = 96;

interface LogoShowcaseCardProps {
  delay?: number;
}

export default function LogoShowcaseCard({ delay }: LogoShowcaseCardProps) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [showLogo, setShowLogo] = useState(true);

  return (
    <ShowcaseCard
      title={t('premium.benefitLogoTitle')}
      desc={t('premium.benefitLogoDesc')}
      hint={t('premium.showcaseHintLogo')}
      delay={delay}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowLogo((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ selected: !showLogo }}
        accessibilityLabel={t(showLogo ? 'premium.showcaseLogoOn' : 'premium.showcaseLogoOff')}
        style={st.tap}
      >
        <MiniStrip width={STRIP_W} frameColor={PREVIEW_FRAME} showLogo={showLogo} />

        {/* 현재 상태 배지 — 탭 결과를 글로도 확인시킨다 */}
        <View
          style={[
            st.badge,
            {
              borderColor: showLogo ? 'rgba(255,255,255,0.14)' : skinAccent.accent,
              backgroundColor: showLogo ? 'rgba(255,255,255,0.05)' : skinAccent.tint(0.18),
            },
          ]}
        >
          <Text style={[st.badgeTxt, !showLogo && { color: skinAccent.accent }]}>
            {t(showLogo ? 'premium.showcaseLogoOn' : 'premium.showcaseLogoOff')}
          </Text>
        </View>
      </TouchableOpacity>
    </ShowcaseCard>
  );
}

const st = StyleSheet.create({
  tap: { alignItems: 'center' },
  badge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: '#A1A1B0' },
});
