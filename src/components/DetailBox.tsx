import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { PillRing } from './record/CalendarBottomSheet';
import { Colors } from '../constants';

// 시안 카드: 흰 3% 패널 + 그라데이션 1px 스트로크(rx 28). 높이는 onLayout로 측정.
// 테두리는 앱 공용 대각 흰색 링(PillRing, 스킨 무관) — 옛 #CECFCD 대각 카드 링에서 2026-09-30 통일.
export default function DetailBox({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={styles.wrap}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View
        style={styles.card}
        onLayout={(e) =>
          setSize({
            w: Math.round(e.nativeEvent.layout.width),
            h: Math.round(e.nativeEvent.layout.height),
          })
        }
      >
        {children}
        {/* PillRing이 스스로 pointerEvents none View로 감싸 터치를 막지 않는다. 카드 overflow hidden은 그대로 —
            링은 0.5px 안쪽(rx 27.5)에 그려져 모서리 클립 안에 들어간다(예전 링과 같은 위치) */}
        <PillRing width={size.w} height={size.h} radius={28} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
});
