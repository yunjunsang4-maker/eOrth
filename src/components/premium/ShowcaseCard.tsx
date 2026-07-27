import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GlassSurface } from '../GlassSurface';
import { useEntranceAnimation } from '../LiquidEffects';
import { useSkinAccent } from '../../constants/skinTheme';

// 프리미엄 혜택 쇼케이스 카드의 공통 껍데기.
// 제목·설명·힌트와 유리 재질·테두리·등장 애니메이션만 담당하고,
// 미리보기 알맹이는 children으로 각 혜택 카드가 채운다.
// (혜택마다 미리보기 형태·상태가 완전히 달라 알맹이는 공통화하지 않는다)

interface ShowcaseCardProps {
  title: string;
  desc: string;
  /** 카드 하단 인터랙션 안내 — "탭해서 …" */
  hint: string;
  /** 순차 등장 지연(ms) */
  delay?: number;
  children: React.ReactNode;
}

export default function ShowcaseCard({ title, desc, hint, delay = 0, children }: ShowcaseCardProps) {
  const skinAccent = useSkinAccent();
  const entrance = useEntranceAnimation(delay);
  const [r, g, b] = skinAccent.rgb;
  // GlassSurface의 iOS 26 네이티브 경로는 8자리 hex tintColor를 받는다 — 스킨색을 30% 알파로
  const tintHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}4D`;

  return (
    <Animated.View style={[st.wrap, { borderColor: skinAccent.tint(0.2) }, entrance]}>
      {/* 배경 재질 — 콘텐츠는 형제로 올린다 (GlassSurface 사용 규칙) */}
      <GlassSurface
        style={StyleSheet.absoluteFill}
        borderRadius={20}
        tintColor={tintHex}
        fallbackTint={skinAccent.tint(0.14)}
        edgeHighlight
      />

      <View style={st.body}>
        <Text style={st.title}>{title}</Text>
        <Text style={st.desc}>{desc}</Text>

        <View style={st.preview}>{children}</View>

        <Text style={[st.hint, { color: skinAccent.accent }]}>{hint}</Text>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  desc: { fontSize: 12, color: '#A1A1B0', lineHeight: 17 },
  preview: { marginTop: 16, alignItems: 'center' },
  hint: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 14 },
});
