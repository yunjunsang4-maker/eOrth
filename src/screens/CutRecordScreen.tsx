import React, { useState, useRef, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Dimensions, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import CutPhotoCanvas from '../components/CutPhotoCanvas';
import CutPhotoAdjustModal, { CutTransform } from '../components/CutPhotoAdjustModal';
import { CUT_FRAMES, CUT_LAYOUTS, cutSlotCount, getCutFrame } from '../constants/cutFrames';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// 디자인 토큰
const C = {
  bg: '#0A0A0F', card: '#1A1A26', divider: '#1A1A26',
  purple: '#BF85FC', white: '#FFFFFF', dim: '#A1A1B0',
};

// 기본 프레임 색 팔레트 — 사용자가 이 색들 중에서 선택
const BASIC_COLORS = [
  '#D4E6F1', '#F5EBE0', '#2C3E50', '#CD7F7D', '#D0D7CE',
  '#F9F6F0', '#A3B19B', '#E6DFD3', '#F3DCD4', '#E1D5E7',
];

export default function CutRecordScreen({ navigation, route }: RootStackScreenProps<'CutRecord'>) {
  const selectedCountry = route.params?.selectedCountry ?? null;

  const [tab, setTab] = useState<'기본' | '테마'>('기본');
  const firstBasic = CUT_FRAMES.find((f) => f.category === '기본')!;
  const [frameId, setFrameId] = useState<string>(firstBasic.id);
  const [photos, setPhotos] = useState<(string | null)[]>(
    Array(cutSlotCount(firstBasic.layout)).fill(null)
  );
  const [transforms, setTransforms] = useState<(CutTransform | null)[]>(
    Array(cutSlotCount(firstBasic.layout)).fill(null)
  );
  const [adjustSlot, setAdjustSlot] = useState<number | null>(null);
  const canvasRef = useRef<View>(null);

  const frame = getCutFrame(frameId)!;
  const slotN = cutSlotCount(frame.layout);
  const frames = useMemo(() => CUT_FRAMES.filter((f) => f.category === tab), [tab]);

  // 기본 프레임 색 — 팔레트에서 선택 (기본 프레임일 때만 적용, 프레임 여백에만)
  const isBasic = frame.category === '기본';
  const [frameColor, setFrameColor] = useState<string>(BASIC_COLORS[0]);

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
    const nextN = cutSlotCount(next.layout);
    setFrameId(id);
    if (nextN === slotN) {
      // 같은 칸 수: 사진은 유지, 위치 조정만 초기화(프레임마다 슬롯 비율이 달라 재정렬)
      setTransforms(Array(nextN).fill(null));
    } else {
      setPhotos(Array(nextN).fill(null));
      setTransforms(Array(nextN).fill(null));
    }
  };

  // 슬롯 사진 선택 → 성공 시 조정 모달 자동 오픈
  const pickInto = async (i: number) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showPermissionDeniedAlert('갤러리');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!r.canceled && r.assets[0]) {
        setPhotos((p) => { const n = [...p]; n[i] = r.assets[0].uri; return n; });
        setTransforms((p) => { const n = [...p]; n[i] = null; return n; });
        setAdjustSlot(i);
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '사진을 불러오는 중 오류가 발생했어요.');
    }
  };

  // 빈 칸 → 사진 선택, 채워진 칸 → 위치 조정
  const handleSlotPress = (i: number) => {
    if (photos[i]) setAdjustSlot(i);
    else pickInto(i);
  };

  // 슬롯의 실제 가로/세로 비율 (조정 모달 프레임용)
  const slotAspect = (i: number) => {
    const s = CUT_LAYOUTS[frame.layout].slots[i];
    return (s.w / s.h) * CUT_LAYOUTS[frame.layout].aspect;
  };

  // 취소 — 사진 배치 중이면 확인
  const handleCancel = () => {
    if (photos.some(Boolean)) {
      Alert.alert('나가시겠어요?', '편집 중인 스트립이 저장되지 않아요.', [
        { text: '계속 편집', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // 네컷 완성 → 미리보기 캡처 후 여행정보 입력 화면으로 이동
  const goNext = async () => {
    if (photos.filter(Boolean).length < slotN) {
      Alert.alert('알림', '모든 칸에 사진을 넣어주세요.');
      return;
    }
    let previewUri = '';
    try {
      // 캡처 전 사진 디코드/로드 보장 (빈·깨진 미리보기 방지)
      await Promise.all(
        (photos.filter(Boolean) as string[]).map((u) => Image.prefetch(u).catch(() => false))
      );
      // 레이아웃 안정화를 위해 두 프레임 양보
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
      previewUri = await captureRef(canvasRef, { format: 'jpg', quality: 0.9 });
    } catch (e) {
      Alert.alert('오류', '미리보기 생성에 실패했어요.');
      return;
    }
    navigation.navigate('CutTravelInfo', {
      cutPhoto: { layout: frame.layout, frameId, frameColor: isBasic ? frameColor : undefined, photos: photos as string[], previewUri },
      selectedCountry: selectedCountry ?? undefined,
    });
  };

  return (
    <SafeAreaView style={st.root}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={handleCancel} hitSlop={8}>
          <Text style={st.cancel}>취소</Text>
        </TouchableOpacity>
        <Text style={st.title}>스트립</Text>
        <TouchableOpacity onPress={goNext} hitSlop={8}>
          <Text style={st.save}>다음</Text>
        </TouchableOpacity>
      </View>

      {/* 캔버스 (중앙) */}
      <View style={st.canvasArea}>
        <CutPhotoCanvas
          ref={canvasRef}
          frameId={frameId}
          photos={photos}
          transforms={transforms}
          width={canvasW}
          onSlotPress={handleSlotPress}
          bgOverride={isBasic ? frameColor : undefined}
        />
        <Text style={st.hint}>{`빈 칸을 눌러 사진 넣기 · 사진을 눌러 위치 조정  (${photos.filter(Boolean).length}/${slotN})`}</Text>
      </View>

      {/* 하단: 기본/테마 탭 + 프레임 카탈로그 */}
      <View style={st.bottomBar}>
        <View style={st.tabs}>
          {(['기본', '테마'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.tab, tab === t && st.tabOn]}>
              <Text style={[st.tabTxt, tab === t && st.tabTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 기본 프레임 색 — 팔레트에서 선택 (한 줄 배치, 넘치면 가로 슬라이드) */}
        {isBasic && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={st.paletteScroll}
            contentContainerStyle={st.palette}
          >
            {BASIC_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setFrameColor(c)}
                style={[st.swatch, { backgroundColor: c }, frameColor === c && st.swatchOn]}
                activeOpacity={0.8}
              />
            ))}
          </ScrollView>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.catScroll}
          contentContainerStyle={st.cat}
        >
          {frames.map((f) => {
            const tw = Math.min(74, 84 * CUT_LAYOUTS[f.layout].aspect); // 썸네일 높이 ~84 이내로
            return (
              <TouchableOpacity
                key={f.id}
                onPress={() => pickFrame(f.id)}
                style={[st.catItem, frameId === f.id && st.catItemOn]}
                activeOpacity={0.8}
              >
                <CutPhotoCanvas
                  frameId={f.id}
                  photos={Array(cutSlotCount(f.layout)).fill(null)}
                  width={tw}
                  capture
                />
                <Text style={st.catLabel} numberOfLines={1}>{f.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 사진 위치 조정 모달 */}
      <CutPhotoAdjustModal
        visible={adjustSlot !== null}
        uri={adjustSlot !== null ? photos[adjustSlot] ?? null : null}
        aspect={adjustSlot !== null ? slotAspect(adjustSlot) : 1}
        initial={adjustSlot !== null ? transforms[adjustSlot] : null}
        onConfirm={(t) => {
          setTransforms((p) => { const n = [...p]; if (adjustSlot !== null) n[adjustSlot] = t; return n; });
          setAdjustSlot(null);
        }}
        onCancel={() => setAdjustSlot(null)}
        onChangePhoto={() => {
          const i = adjustSlot;
          setAdjustSlot(null);
          if (i !== null) pickInto(i);
        }}
        onRemove={() => {
          const i = adjustSlot;
          setAdjustSlot(null);
          if (i !== null) {
            setPhotos((p) => { const n = [...p]; n[i] = null; return n; });
            setTransforms((p) => { const n = [...p]; n[i] = null; return n; });
          }
        }}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  cancel: { fontSize: 16, color: C.dim },
  title: { fontSize: 17, fontWeight: 'bold', color: C.white },
  save: { fontSize: 16, fontWeight: '700', color: C.purple },

  canvasArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 16 },
  hint: { fontSize: 12, color: C.dim },

  bottomBar: { paddingTop: 6, paddingBottom: 8 },
  catScroll: { flexGrow: 0 },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12, justifyContent: 'center' },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  tabOn: { backgroundColor: 'rgba(191,133,252,0.18)', borderColor: C.purple },
  tabTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  tabTxtOn: { color: C.purple },

  cat: { paddingHorizontal: 16, paddingBottom: 4, gap: 12, alignItems: 'flex-end' },
  catItem: {
    width: 88, alignItems: 'center', gap: 6, padding: 6, borderRadius: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  catItemOn: { borderColor: C.purple, backgroundColor: 'rgba(191,133,252,0.10)' },
  catLabel: { fontSize: 10, color: C.dim, textAlign: 'center' },

  paletteScroll: { flexGrow: 0, marginBottom: 14 },
  palette: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 20,
  },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  swatchOn: { borderWidth: 3, borderColor: C.purple },
});
