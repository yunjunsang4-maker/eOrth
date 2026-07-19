// 기록 작성 화면 상단 서랍 — 순수 참고용(스펙 ④). 삽입·복사 없음.
// 매칭되는 순간이 있을 때만 배너 표시 → 펼치면 가로 카드 → 탭하면 확대 모달.
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Image, StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TravelMoment } from '../../store/momentStore';
import MomentCard, { formatMomentTime } from './MomentCard';

export default function MomentDrawer({ moments }: { moments: TravelMoment[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [enlarged, setEnlarged] = useState<TravelMoment | null>(null);

  useEffect(() => {
    if (moments.length === 0) setOpen(false);
  }, [moments.length]);

  if (moments.length === 0) return null;
  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View style={st.wrap}>
      <TouchableOpacity style={st.banner} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={st.bannerText}>{t('moments.drawerBanner', { count: moments.length })}</Text>
        <Text style={st.bannerArrow}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.row} contentContainerStyle={{ paddingRight: 16 }}>
          {sorted.map((m) => (
            <MomentCard key={m.id} moment={m} compact onPress={() => setEnlarged(m)} />
          ))}
        </ScrollView>
      )}
      {/* 확대 보기 — 보면서 직접 쓰는 용도라 어떤 액션 버튼도 없다 */}
      <Modal
        visible={enlarged != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEnlarged(null)}
        accessibilityViewIsModal
      >
        <TouchableOpacity style={st.dim} activeOpacity={1} onPress={() => setEnlarged(null)}>
          {enlarged && (
            <View style={st.big} onStartShouldSetResponder={() => true}>
              {enlarged.mood ? <Text style={st.bigMood}>{enlarged.mood}</Text> : null}
              {enlarged.photoUri ? (
                <Image source={{ uri: enlarged.photoUri }} style={st.bigPhoto} />
              ) : null}
              {enlarged.text ? <Text style={st.bigText}>{enlarged.text}</Text> : null}
              <Text style={st.bigMeta}>
                {(enlarged.regionName || enlarged.countryName)
                  ? `📍 ${enlarged.regionName || enlarged.countryName} · `
                  : ''}
                {formatMomentTime(enlarged.createdAt)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8 },
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(191,133,252,0.12)', borderWidth: 1, borderColor: '#6B21A8',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  bannerText: { color: '#BF85FC', fontSize: 12, fontWeight: '600' },
  bannerArrow: { color: '#BF85FC', fontSize: 12 },
  row: { marginTop: 8 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 32 },
  big: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
    borderRadius: 16, padding: 20,
  },
  bigMood: { fontSize: 32, marginBottom: 8 },
  bigPhoto: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10 },
  bigText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  bigMeta: { color: '#A1A1B0', fontSize: 11, marginTop: 10 },
});
