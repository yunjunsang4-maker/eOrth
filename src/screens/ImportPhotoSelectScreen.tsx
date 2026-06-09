import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  Dimensions, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecords } from '../store/recordStore';
import { copyTripOriginals, type PhotoRef } from '../utils/importPhotoStore';

export const MAX_PHOTOS_PER_TRIP = 30; // 프리미엄 seam: 나중에 이 한도만 상향

export type TripPhoto = PhotoRef & { creationTime?: number };

export interface ImportTrip {
  id: string;
  country: string; countryName: string; countryFlag: string;
  title: string; date: string; startDate: string; endDate: string;
  photos: TripPhoto[];
}

// 일별 필터용 날짜 키/라벨 (creationTime 없는 사진은 '전체'에서만 노출)
const dayKey = (ts?: number): string | null => {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (key: string): string => {
  const [, m, d] = key.split('.');
  return `${Number(m)}월 ${Number(d)}일`;
};

const { width } = Dimensions.get('window');
const COL = 3;
const CELL = Math.floor((width - 16 * 2 - 8 * (COL - 1)) / COL);

export default function ImportPhotoSelectScreen({ navigation, route }: any) {
  const { trips } = route.params as { trips: ImportTrip[] };
  const { addImportedAlbum, addTripGroup } = useRecords();

  const [index, setIndex] = useState(0);
  // 여행별 선택된 사진 uri 집합
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [dayFilter, setDayFilter] = useState<string | null>(null); // null = 전체

  const trip = trips[index];
  if (!trip) return null; // 방어: 빈 trips
  const sel = selected[trip.id] ?? [];
  const isLast = index === trips.length - 1;

  // 이 여행에서 사진이 있는 날짜 목록(시간순). 선택(sel)은 uri 기준이라 필터와 무관하게 유지된다.
  const days = Array.from(
    new Set(trip.photos.map((p) => dayKey(p.creationTime)).filter((k): k is string => k !== null))
  ).sort();
  const visiblePhotos = dayFilter
    ? trip.photos.filter((p) => dayKey(p.creationTime) === dayFilter)
    : trip.photos;

  const toggle = (uri: string) => {
    const cur = selected[trip.id] ?? [];
    if (cur.includes(uri)) {
      setSelected((prev) => ({ ...prev, [trip.id]: (prev[trip.id] ?? []).filter((u) => u !== uri) }));
      return;
    }
    if (cur.length >= MAX_PHOTOS_PER_TRIP) {
      Alert.alert('알림', `여행당 최대 ${MAX_PHOTOS_PER_TRIP}장까지 선택할 수 있어요.`);
      return;
    }
    setSelected((prev) => ({ ...prev, [trip.id]: [...(prev[trip.id] ?? []), uri] }));
  };

  const next = () => {
    if (!isLast) {
      setDayFilter(null); // 다음 여행으로 넘어가면 일별 필터 초기화
      setIndex((i) => i + 1);
      return;
    }
    save();
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const t of trips) {
        const uris = selected[t.id] ?? [];
        if (uris.length === 0) continue; // 선택 0장 → 카드 생성 안 함
        const items: PhotoRef[] = t.photos.filter((p) => uris.includes(p.uri));
        const copied = await copyTripOriginals(t.id, items);
        if (copied.length === 0) continue;
        const recId = addImportedAlbum({
          country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
          date: t.date, startDate: t.startDate, endDate: t.endDate,
          title: t.title, medias: copied,
        });
        addTripGroup({ title: `${t.countryFlag} ${t.title}`, records: [recId], coverRecordId: recId });
      }
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setSaving(false);
      Alert.alert('저장 실패', '사진을 가져오는 중 문제가 발생했어요.');
    }
  };

  if (saving) {
    return (
      <LinearGradient colors={['#0A0118', '#100620']} style={st.center}>
        <ActivityIndicator color="#7B61FF" size="large" />
        <Text style={st.savingText}>여행 사진첩을 만들고 있어요…</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
      <View style={st.header}>
        <Text style={st.step}>{index + 1} / {trips.length}</Text>
        <Text style={st.title}>{trip.countryFlag} {trip.title}</Text>
        <Text style={st.sub}>가져올 사진을 선택하세요 (최대 {MAX_PHOTOS_PER_TRIP}장)</Text>
        <Text style={st.counter}>{sel.length} / {MAX_PHOTOS_PER_TRIP}</Text>
      </View>

      {/* 일별 보기 필터 */}
      {days.length > 0 && (
        <View style={st.dayBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dayRow}>
            <TouchableOpacity
              style={[st.dayChip, dayFilter === null && st.dayChipOn]}
              onPress={() => setDayFilter(null)}
              activeOpacity={0.8}
            >
              <Text style={[st.dayTxt, dayFilter === null && st.dayTxtOn]}>전체</Text>
            </TouchableOpacity>
            {days.map((d) => {
              const on = dayFilter === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[st.dayChip, on && st.dayChipOn]}
                  onPress={() => setDayFilter(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[st.dayTxt, on && st.dayTxtOn]}>{dayLabel(d)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={visiblePhotos}
        keyExtractor={(p, i) => p.uri + i}
        numColumns={COL}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        columnWrapperStyle={{ gap: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const on = sel.includes(item.uri);
          return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => toggle(item.uri)} style={{ width: CELL, height: CELL }}>
              <Image source={{ uri: item.uri }} style={st.cell} />
              <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkTxt}>✓</Text>}</View>
            </TouchableOpacity>
          );
        }}
      />

      <View style={st.bottom}>
        <TouchableOpacity
          style={[st.nextBtn, sel.length === 0 && st.nextBtnDisabled]}
          onPress={next}
          disabled={sel.length === 0}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.nextGrad}>
            <Text style={st.nextTxt}>
              {sel.length === 0 ? '사진을 1장 이상 선택하세요' : isLast ? '완료' : '다음'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText: { color: '#FFFFFF', fontSize: 14 },
  header: { paddingTop: 70, paddingHorizontal: 16, paddingBottom: 8 },
  step: { color: '#7B61FF', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: '#A1A1B0', fontSize: 13 },
  counter: { color: '#BF85FC', fontSize: 13, fontWeight: '700', marginTop: 6 },
  dayBar: { marginTop: 10 },
  dayRow: { paddingHorizontal: 16, gap: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dayChipOn: { borderColor: '#7B61FF', backgroundColor: 'rgba(123, 97, 255, 0.18)' },
  dayTxt: { color: '#A1A1B0', fontSize: 13, fontWeight: '500' },
  dayTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  cell: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#2A2735' },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  checkOn: { backgroundColor: '#7B61FF', borderColor: '#7B61FF' },
  checkTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 40, backgroundColor: 'rgba(10,1,24,0.95)' },
  nextBtn: { borderRadius: 999, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.5 },
  nextGrad: { paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
