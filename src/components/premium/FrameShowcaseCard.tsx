import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import ShowcaseCard from './ShowcaseCard';
import MiniStrip from './MiniStrip';
import { useSkinAccent } from '../../constants/skinTheme';

// 스트립 프레임 커스텀 혜택 쇼케이스 — 스와치를 탭하면 프레임색이 바로 바뀐다.
// 문구 스탬프도 함께 얹어 "자유 색상 + 문구" 두 가지를 한 장으로 보여준다.
// 미리보기 전용이라 실제 네컷 편집값에는 저장하지 않는다.

// CutRecordScreen의 BASIC_COLORS 중 대비가 뚜렷한 6색만 추린 미리보기 팔레트.
// (편집기 팔레트 원본은 CutRecordScreen에 있고, 여기 값은 소개용 발췌다)
const PREVIEW_FRAME_COLORS = ['#F5EBE0', '#D4E6F1', '#2C3E50', '#CD7F7D', '#A3B19B', '#E1D5E7'];
const STRIP_W = 96;

interface FrameShowcaseCardProps {
  delay?: number;
}

export default function FrameShowcaseCard({ delay }: FrameShowcaseCardProps) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [color, setColor] = useState(PREVIEW_FRAME_COLORS[0]);

  return (
    <ShowcaseCard
      title={t('premium.benefitFrameTitle')}
      desc={t('premium.benefitFrameDesc')}
      hint={t('premium.showcaseHintFrame')}
      delay={delay}
    >
      <MiniStrip width={STRIP_W} frameColor={color} showLogo={false} stamp={t('premium.showcaseStamp')} />

      <View style={st.swatchRow}>
        {PREVIEW_FRAME_COLORS.map((c) => {
          const on = c === color;
          return (
            <TouchableOpacity
              key={c}
              activeOpacity={0.8}
              onPress={() => setColor(c)}
              style={[
                st.swatch,
                { backgroundColor: c },
                on && { borderColor: skinAccent.accent, borderWidth: 2 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c}
            />
          );
        })}
      </View>
    </ShowcaseCard>
  );
}

const st = StyleSheet.create({
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    justifyContent: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
