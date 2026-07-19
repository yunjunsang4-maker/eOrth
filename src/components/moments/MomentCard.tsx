// 순간 카드 — 여행 기억 목록·작성 화면 서랍 공용. 탭하면 onPress(확대 보기 등).
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { TravelMoment } from '../../store/momentStore';

export function formatMomentTime(createdAt: number): string {
  const d = new Date(createdAt);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function MomentCard({
  moment, onPress, onLongPress, compact,
}: {
  moment: TravelMoment;
  onPress?: () => void;
  onLongPress?: () => void;
  compact?: boolean; // 서랍(가로 스크롤)용 축소 카드
}) {
  const place = moment.regionName || moment.countryName;
  return (
    <TouchableOpacity
      style={[st.card, compact && st.cardCompact]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={st.topRow}>
        {moment.mood ? <Text style={st.mood}>{moment.mood}</Text> : null}
        {moment.photoUri ? <Image source={{ uri: moment.photoUri }} style={st.thumb} /> : null}
      </View>
      {/* 무드만 있는 순간은 빈 텍스트 줄을 그리지 않는다 */}
      {moment.text ? (
        <Text style={st.text} numberOfLines={compact ? 3 : undefined}>{moment.text}</Text>
      ) : null}
      <Text style={st.meta}>
        {place ? `📍 ${place} · ` : ''}{formatMomentTime(moment.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
    borderRadius: 14, padding: 12, marginBottom: 10,
  },
  cardCompact: { width: 150, marginBottom: 0, marginRight: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  mood: { fontSize: 20 },
  thumb: { width: 28, height: 28, borderRadius: 6, marginLeft: 'auto' },
  text: { color: '#E8E8F0', fontSize: 13, lineHeight: 19 },
  meta: { color: '#A1A1B0', fontSize: 10, marginTop: 6 },
});
