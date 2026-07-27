import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import ShowcaseCard from './ShowcaseCard';
import { HANDLE_FONTS, handleFontStyle } from '../../constants/handleFonts';
import { useSkinAccent } from '../../constants/skinTheme';
import { useSettings } from '../../store/settingsStore';

// 아이디 폰트 혜택 쇼케이스 — 내 실제 아이디를 16종 서체로 그 자리에서 갈아끼운다.
// 여기서 고른 값은 미리보기 전용이라 설정(handleFont)에 저장하지 않는다.

interface FontShowcaseCardProps {
  delay?: number;
}

export default function FontShowcaseCard({ delay }: FontShowcaseCardProps) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const { handle, handleFont } = useSettings();

  // 시작값은 내가 지금 쓰는 폰트 — "내 것"에서 출발해 둘러보게 한다
  const [fontId, setFontId] = useState<string>(handleFont ?? 'default');

  return (
    <ShowcaseCard
      title={t('premium.benefitFontTitle')}
      desc={t('premium.benefitFontDesc')}
      hint={t('premium.showcaseHintFont')}
      delay={delay}
    >
      {/* 큰 미리보기 — 내 아이디 */}
      <View style={st.stage}>
        <Text style={[st.handle, handleFontStyle(fontId)]} numberOfLines={1} adjustsFontSizeToFit>
          @{handle}
        </Text>
      </View>

      {/* 서체 칩 — 각 칩이 자기 서체로 'Aa'를 보여준다 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.chipRow}
        style={st.chipScroll}
      >
        {HANDLE_FONTS.map((f) => {
          const on = f.id === fontId;
          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.8}
              onPress={() => setFontId(f.id)}
              style={[
                st.chip,
                { borderColor: on ? skinAccent.accent : 'rgba(255,255,255,0.12)' },
                on && { backgroundColor: skinAccent.tint(0.18) },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(f.labelKey)}
            >
              <Text style={[st.chipTxt, handleFontStyle(f.id), on && { color: '#FFFFFF' }]}>Aa</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ShowcaseCard>
  );
}

const st = StyleSheet.create({
  stage: {
    width: '100%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { fontSize: 30, color: '#FFFFFF', fontWeight: '600' },

  // ScrollView가 카드 안쪽 여백을 넘어 좌우로 흐르도록 음수 마진을 준다
  chipScroll: { marginTop: 14, marginHorizontal: -18, alignSelf: 'stretch' },
  chipRow: { paddingHorizontal: 18, gap: 8 },
  chip: {
    width: 46,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipTxt: { fontSize: 15, color: '#A1A1B0' },
});
