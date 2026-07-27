import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// 헤더 벨의 미읽음 배지 — 점 하나 대신 개수를 보여주는 알약.
// 아이콘 우상단에 겹쳐 놓는 오버레이라 부모는 position:relative 컨테이너면 된다.
//
// 디자인 규칙
//  · 배경(#0A0A0F)과 같은 색 링을 둘러 아이콘 획과 겹쳐도 배지가 또렷하게 떠 보인다
//  · 1~9는 원, 10 이상은 가로로 늘어난 알약, 100 이상은 99+
//  · count가 0이면 아무것도 렌더하지 않는다(호출부에서 분기할 필요 없음)
const BADGE_RED = '#FF3B30'; // 디자인 토큰 '빨강'

interface NotificationBadgeProps {
  count: number;
  /** 배지 링 색 — 아이콘이 놓인 배경색과 같게(기본: 앱 배경) */
  ringColor?: string;
}

export default function NotificationBadge({ count, ringColor = '#0A0A0F' }: NotificationBadgeProps) {
  if (!count || count < 1) return null;
  const label = count > 99 ? '99+' : String(count);
  const wide = label.length > 1;

  return (
    <View
      pointerEvents="none"
      style={[
        st.badge,
        { borderColor: ringColor },
        wide && st.badgeWide,
      ]}
    >
      <Text style={st.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2, // 배경색 링 — 아이콘 위에서 배지가 분리돼 보이게
    backgroundColor: BADGE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWide: { paddingHorizontal: 4 },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    includeFontPadding: false,
  },
});
