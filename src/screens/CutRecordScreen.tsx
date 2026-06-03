import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import CutPhotoCanvas from '../components/CutPhotoCanvas';
import { CUT_FRAMES, CUT_LAYOUTS, cutSlotCount, getCutFrame } from '../constants/cutFrames';
import { useRecords } from '../store/recordStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// 디자인 토큰
const C = {
  bg: '#0A0A0F', card: '#1A1A26', divider: '#1A1A26',
  purple: '#BF85FC', white: '#FFFFFF', dim: '#A1A1B0',
};

type CountryParam = { flag?: string; name?: string } | null;

export default function CutRecordScreen({ navigation, route }: { navigation: any; route: any }) {
  const { addRecord } = useRecords();
  const selectedCountry: CountryParam = route?.params?.selectedCountry ?? null;

  const [tab, setTab] = useState<'기본' | '테마'>('기본');
  const firstBasic = CUT_FRAMES.find((f) => f.category === '기본')!;
  const [frameId, setFrameId] = useState<string>(firstBasic.id);
  const [photos, setPhotos] = useState<(string | null)[]>(
    Array(cutSlotCount(firstBasic.layout)).fill(null)
  );
  const canvasRef = useRef<View>(null);

  const frame = getCutFrame(frameId)!;
  const slotN = cutSlotCount(frame.layout);
  const frames = useMemo(() => CUT_FRAMES.filter((f) => f.category === tab), [tab]);

  // 캔버스 크기 — 가로/세로 모두 화면에 맞게 fit (필름 같은 세로 스트립 대응)
  const canvasW = useMemo(() => {
    const maxW = SCREEN_W * 0.78;
    const maxH = SCREEN_H * 0.5;
    const aspect = CUT_LAYOUTS[frame.layout].aspect;
    let w = maxW;
    if (w / aspect > maxH) w = maxH * aspect;
    return w;
  }, [frame.layout]);

  const pickFrame = (id: string) => {
    const next = getCutFrame(id)!;
    setFrameId(id);
    setPhotos(Array(cutSlotCount(next.layout)).fill(null));
  };

  const fillSlot = async (i: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!r.canceled && r.assets[0]) {
      setPhotos((p) => {
        const n = [...p];
        n[i] = r.assets[0].uri;
        return n;
      });
    }
  };

  const save = async () => {
    if (photos.filter(Boolean).length < slotN) {
      Alert.alert('알림', '모든 칸에 사진을 넣어주세요.');
      return;
    }
    let previewUri = '';
    try {
      // 캡처 직전 레이아웃 안정화를 위해 한 프레임 양보
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      previewUri = await captureRef(canvasRef, { format: 'jpg', quality: 0.9 });
    } catch (e) {
      Alert.alert('오류', '미리보기 생성에 실패했어요.');
      return;
    }
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    addRecord({
      user: { name: '나', emoji: '✈️', handle: 'yunjunsung' },
      country: selectedCountry ? `${selectedCountry.flag ?? ''} ${selectedCountry.name ?? ''}`.trim() : '',
      countryName: selectedCountry?.name || '',
      countryFlag: selectedCountry?.flag || '',
      countries: selectedCountry?.flag && selectedCountry?.name
        ? [{ flag: selectedCountry.flag, name: selectedCountry.name }] : [],
      date: dateStr,
      content: '',
      visibility: 'friends',
      viewType: 'cut',
      medias: [previewUri],   // 기존 피드/상세 렌더러가 합성 이미지를 그대로 표시
      cutPhoto: { layout: frame.layout, frameId, photos: photos as string[], previewUri },
    });
    navigation.goBack();
  };

  return (
    <View style={st.root}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={st.cancel}>취소</Text>
        </TouchableOpacity>
        <Text style={st.title}>네컷</Text>
        <TouchableOpacity onPress={save} hitSlop={8}>
          <Text style={st.save}>저장</Text>
        </TouchableOpacity>
      </View>

      {/* 캔버스 */}
      <View style={st.canvasWrap}>
        <CutPhotoCanvas
          ref={canvasRef}
          frameId={frameId}
          photos={photos}
          width={canvasW}
          onSlotPress={fillSlot}
        />
        <Text style={st.hint}>{`빈 칸을 눌러 사진을 넣어주세요  (${photos.filter(Boolean).length}/${slotN})`}</Text>
      </View>

      {/* 탭 */}
      <View style={st.tabs}>
        {(['기본', '테마'] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.tab, tab === t && st.tabOn]}>
            <Text style={[st.tabTxt, tab === t && st.tabTxtOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 프레임 카탈로그 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.cat}
      >
        {frames.map((f) => (
          <TouchableOpacity
            key={f.id}
            onPress={() => pickFrame(f.id)}
            style={[st.catItem, frameId === f.id && st.catItemOn]}
            activeOpacity={0.8}
          >
            <CutPhotoCanvas
              frameId={f.id}
              photos={Array(cutSlotCount(f.layout)).fill(null)}
              width={72}
              capture
            />
            <Text style={st.catLabel} numberOfLines={1}>{f.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  cancel: { fontSize: 14, color: C.dim },
  title: { fontSize: 16, fontWeight: 'bold', color: C.white },
  save: { fontSize: 14, fontWeight: '700', color: C.purple },

  canvasWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  hint: { fontSize: 12, color: C.dim },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  tabOn: { backgroundColor: 'rgba(191,133,252,0.18)', borderColor: C.purple },
  tabTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  tabTxtOn: { color: C.purple },

  cat: { paddingHorizontal: 16, paddingBottom: 28, gap: 12, alignItems: 'flex-start' },
  catItem: {
    width: 88, alignItems: 'center', gap: 6, padding: 6, borderRadius: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  catItemOn: { borderColor: C.purple, backgroundColor: 'rgba(191,133,252,0.10)' },
  catLabel: { fontSize: 10, color: C.dim, textAlign: 'center' },
});
