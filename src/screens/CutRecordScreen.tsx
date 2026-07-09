import React, { useState, useRef, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Dimensions, Image, ActivityIndicator,
  Modal, Pressable, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { compressImage } from '../utils/imageCompress';
import { captureRef } from 'react-native-view-shot';
import CutPhotoCanvas, { cutHasBottomBand, type CutStamp } from '../components/CutPhotoCanvas';
import { HANDLE_FONTS, handleFontStyle } from '../constants/handleFonts';
import CutPhotoAdjustModal, { CutTransform } from '../components/CutPhotoAdjustModal';
import { CUT_FRAMES, CUT_LAYOUTS, cutSlotCount, getCutFrame } from '../constants/cutFrames';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { useSettings } from '../store/settingsStore';
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

// ── 커스텀 프레임 색 (프리미엄: 스트립 프레임 커스텀) ──
// 색조 12단 × 명도 5단 + 무채색 12단 그리드에서 자유 선택
const hslHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};
const CUSTOM_HUES = [0, 30, 60, 90, 120, 160, 190, 210, 240, 270, 300, 330];
const CUSTOM_ROWS: string[][] = [
  Array.from({ length: 12 }, (_, i) => hslHex(0, 0, 1 - i / 11)), // 무채색 (흰→검)
  ...[0.86, 0.72, 0.58, 0.44, 0.3].map((l) => CUSTOM_HUES.map((h) => hslHex(h, 0.55, l))),
];

export default function CutRecordScreen({ navigation, route }: RootStackScreenProps<'CutRecord'>) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 활성 탭·칩 강조를 스킨색으로
  const selectedCountry = route.params?.selectedCountry ?? null;
  // 스트립 로고 제거(프리미엄) — 프리미엄이고 설정 토글이 켜져 있을 때만 로고 미포함
  const { isPremium, stripLogoRemoval } = useSettings();
  const hideLogo = isPremium && stripLogoRemoval;

  const [tab, setTab] = useState<'기본' | '테마'>('기본');
  const tabLabel = (cat: '기본' | '테마') => (cat === '기본' ? t('cut.tabBasic') : t('cut.tabTheme'));
  const firstBasic = CUT_FRAMES.find((f) => f.category === '기본')!;
  const [frameId, setFrameId] = useState<string>(firstBasic.id);
  const [photos, setPhotos] = useState<(string | null)[]>(
    Array(cutSlotCount(firstBasic.layout)).fill(null)
  );
  const [transforms, setTransforms] = useState<(CutTransform | null)[]>(
    Array(cutSlotCount(firstBasic.layout)).fill(null)
  );
  const [adjustSlot, setAdjustSlot] = useState<number | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false); // 사진 불러오는 중(특히 iCloud 다운로드)
  const canvasRef = useRef<View>(null);

  const frame = getCutFrame(frameId)!;
  const slotN = cutSlotCount(frame.layout);
  const frames = useMemo(() => CUT_FRAMES.filter((f) => f.category === tab), [tab]);

  // 기본 프레임 색 — 팔레트에서 선택 (기본 프레임일 때만 적용, 프레임 여백에만)
  const isBasic = frame.category === '기본';
  const [frameColor, setFrameColor] = useState<string>(BASIC_COLORS[0]);

  // ── 하단 여백 스탬프: 날짜(무료) + 문구·폰트(프리미엄) ──
  const bandLayout = cutHasBottomBand(frame.layout); // 하단 여백 있는 레이아웃에서만 노출
  const [stampDateOn, setStampDateOn] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [captionFont, setCaptionFont] = useState<string | null>(null);
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const stamp: CutStamp | undefined =
    bandLayout && (stampDateOn || captionText)
      ? { date: stampDateOn ? todayStr : undefined, text: captionText || undefined, fontId: captionFont || undefined }
      : undefined;
  const openCaption = () => {
    if (!isPremium) {
      navigation.navigate('Premium'); // 잠금 → 페이월로 유도
      return;
    }
    setCaptionDraft(captionText);
    setCaptionModalVisible(true);
  };
  const confirmCaption = () => {
    setCaptionText(captionDraft.trim());
    setCaptionModalVisible(false);
  };

  // 커스텀 프레임 색(프리미엄) — '+' 스와치로 그리드 모달 열기
  const [customColorVisible, setCustomColorVisible] = useState(false);
  const isCustomColor = !BASIC_COLORS.includes(frameColor);
  const openCustomColor = () => {
    if (!isPremium) {
      navigation.navigate('Premium');
      return;
    }
    setCustomColorVisible(true);
  };

  // 프레임 배경 사진(프리미엄) — 🖼️ 스와치로 갤러리에서 선택, 색 위에 cover로 깔림
  const [frameImage, setFrameImage] = useState<string | null>(null);
  const pickFrameImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showPermissionDeniedAlert(t('permission.gallery'));
        return;
      }
      setPickingPhoto(true);
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
      if (!r.canceled && r.assets[0]) {
        setFrameImage(await compressImage(r.assets[0].uri));
      }
    } catch {
      Alert.alert(t('cut.errorTitle'), t('cut.loadPhotoError'));
    } finally {
      setPickingPhoto(false);
    }
  };
  const openFrameImage = () => {
    if (!isPremium) {
      navigation.navigate('Premium');
      return;
    }
    if (frameImage) {
      // 이미 적용됨 → 변경/제거 선택
      Alert.alert(t('cut.framePhotoTitle'), '', [
        { text: t('cut.framePhotoChange'), onPress: pickFrameImage },
        { text: t('cut.framePhotoRemove'), style: 'destructive', onPress: () => setFrameImage(null) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    pickFrameImage();
  };

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
        showPermissionDeniedAlert(t('permission.gallery'));
        return;
      }
      setPickingPhoto(true); // iCloud 다운로드/처리 동안 멈춤 느낌 방지
      // quality 미지정 = 재압축 생략(로컬 사진 선택이 더 빠름). iCloud 다운로드는 시스템 동작이라 별도.
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
      });
      if (!r.canceled && r.assets[0]) {
        const compressed = await compressImage(r.assets[0].uri);
        setPhotos((p) => { const n = [...p]; n[i] = compressed; return n; });
        setTransforms((p) => { const n = [...p]; n[i] = null; return n; });
        setAdjustSlot(i);
      }
    } catch (e: any) {
      Alert.alert(t('cut.errorTitle'), e?.message ?? t('cut.loadPhotoError'));
    } finally {
      setPickingPhoto(false);
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
      Alert.alert(t('cut.exitTitle'), t('cut.exitMsg'), [
        { text: t('cut.continueEdit'), style: 'cancel' },
        { text: t('cut.exit'), style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // 네컷 완성 → 미리보기 캡처 후 여행정보 입력 화면으로 이동
  const goNext = async () => {
    if (photos.filter(Boolean).length < slotN) {
      Alert.alert(t('cut.noticeTitle'), t('cut.fillAllSlots'));
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
      // 지도 대표용 고해상도 캡처 — 장변 2000px 목표(화면 캡처 기본보다 선명), 비율 유지
      const aspect = CUT_LAYOUTS[frame.layout].aspect; // = width / height
      const REP_TARGET = 2000;
      const capW = aspect >= 1 ? REP_TARGET : Math.round(REP_TARGET * aspect);
      const capH = aspect >= 1 ? Math.round(REP_TARGET / aspect) : REP_TARGET;
      previewUri = await captureRef(canvasRef, { format: 'jpg', quality: 0.95, width: capW, height: capH });
    } catch {
      Alert.alert(t('cut.errorTitle'), t('cut.previewError'));
      return;
    }
    navigation.navigate('CutTravelInfo', {
      // transforms(슬롯별 위치조정)를 함께 저장해야 피드·상세의 라이브 재합성에서 구도가 유지된다
      cutPhoto: { layout: frame.layout, frameId, frameColor: isBasic ? frameColor : undefined, frameImage: (isBasic && frameImage) || undefined, photos: photos as string[], transforms, previewUri, noLogo: hideLogo || undefined, stamp },
      selectedCountry: selectedCountry ?? undefined,
      tripPeriod: route.params?.tripPeriod, // 여행 카드에서 추가 시 기간 자동 적용을 위해 전달
    });
  };

  return (
    <SafeAreaView style={st.root}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={handleCancel} hitSlop={8}>
          <Text style={st.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={st.title}>{t('cut.title')}</Text>
        <TouchableOpacity onPress={goNext} hitSlop={8}>
          <Text style={st.save}>{t('common.next')}</Text>
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
          bgImageOverride={isBasic ? frameImage ?? undefined : undefined}
          showLogo={!hideLogo}
          stamp={stamp}
        />
        <Text style={st.hint}>{t('cut.hint', { filled: photos.filter(Boolean).length, total: slotN })}</Text>
      </View>

      {/* 하단: 기본/테마 탭 + 프레임 카탈로그 */}
      <View style={st.bottomBar}>
        {/* 하단 여백 스탬프 — 날짜(무료)·문구(프리미엄). 여백 있는 레이아웃에서만 */}
        {bandLayout && (
          <View style={st.stampRow}>
            <TouchableOpacity
              style={[st.stampChip, stampDateOn && [st.stampChipOn, { backgroundColor: skinAccent.tint(0.18), borderColor: skinAccent.accent }]]}
              activeOpacity={0.8}
              onPress={() => setStampDateOn((v) => !v)}
            >
              <Text style={[st.stampChipTxt, stampDateOn && st.stampChipTxtOn]}>
                📅 {t('cut.stampDate')}{stampDateOn ? ` · ${todayStr}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.stampChip, !!captionText && [st.stampChipOn, { backgroundColor: skinAccent.tint(0.18), borderColor: skinAccent.accent }]]}
              activeOpacity={0.8}
              onPress={openCaption}
            >
              <Text style={[st.stampChipTxt, !!captionText && st.stampChipTxtOn]} numberOfLines={1}>
                ✏️ {captionText || t('cut.stampCaption')}{!isPremium ? ' 🔒' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={st.tabs}>
          {(['기본', '테마'] as const).map((cat) => (
            <TouchableOpacity key={cat} onPress={() => setTab(cat)} style={[st.tab, tab === cat && [st.tabOn, { backgroundColor: skinAccent.tint(0.18), borderColor: skinAccent.accent }]]}>
              <Text style={[st.tabTxt, tab === cat && st.tabTxtOn]}>{tabLabel(cat)}</Text>
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
            {/* 커스텀 색(프리미엄) — 선택된 커스텀 색이 있으면 그 색으로, 없으면 무지개 그라데이션 */}
            <TouchableOpacity onPress={openCustomColor} activeOpacity={0.8}>
              {isCustomColor ? (
                <View style={[st.swatch, { backgroundColor: frameColor }, st.swatchOn]}>
                  <Text style={st.customPlus}>＋</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#FF5F6D', '#BF85FC', '#00D7F3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[st.swatch, st.customSwatch]}
                >
                  <Text style={st.customPlus}>{isPremium ? '＋' : '🔒'}</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
            {/* 사진 프레임(프리미엄) — 선택된 사진이 있으면 썸네일로, 없으면 아이콘 */}
            <TouchableOpacity onPress={openFrameImage} activeOpacity={0.8}>
              {frameImage ? (
                <View style={[st.swatch, st.customSwatch, st.frameImgSwatch, st.swatchOn]}>
                  <Image source={{ uri: frameImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </View>
              ) : (
                <View style={[st.swatch, st.customSwatch, st.frameImgSwatch]}>
                  <Text style={st.customPlus}>{isPremium ? '🖼️' : '🔒'}</Text>
                </View>
              )}
            </TouchableOpacity>
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
                style={[st.catItem, frameId === f.id && [st.catItemOn, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.accent }]]}
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

      {/* 커스텀 프레임 색 모달 (프리미엄) — 색조×명도 그리드에서 자유 선택 */}
      <Modal
        visible={customColorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomColorVisible(false)}
      >
        <Pressable style={st.ccOverlay} onPress={() => setCustomColorVisible(false)}>
          <Pressable style={[st.ccCard, { borderColor: skinAccent.tint(0.3) }]} onPress={() => {}}>
            <Text style={st.ccTitle}>{t('cut.customColorTitle')}</Text>
            {CUSTOM_ROWS.map((row, ri) => (
              <View key={ri} style={st.ccRow}>
                {row.map((c) => (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.8}
                    onPress={() => { setFrameColor(c); setCustomColorVisible(false); }}
                    style={[st.ccSwatch, { backgroundColor: c }, frameColor === c && st.ccSwatchOn]}
                  />
                ))}
              </View>
            ))}
            <TouchableOpacity style={st.ccClose} activeOpacity={0.7} onPress={() => setCustomColorVisible(false)}>
              <Text style={st.ccCloseText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 문구 스탬프 모달 (프리미엄) — 문구 입력 + 폰트 선택 */}
      <Modal
        visible={captionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptionModalVisible(false)}
      >
        <Pressable style={st.ccOverlay} onPress={() => setCaptionModalVisible(false)}>
          <Pressable style={[st.ccCard, { borderColor: skinAccent.tint(0.3) }]} onPress={() => {}}>
            <Text style={st.ccTitle}>{t('cut.captionModalTitle')}</Text>
            <TextInput
              style={[st.capInput, handleFontStyle(captionFont)]}
              value={captionDraft}
              onChangeText={setCaptionDraft}
              placeholder={t('cut.captionPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={24}
              autoFocus
            />
            {/* 폰트 선택 — 아이디 폰트 16종 재사용, 입력한 문구로 미리보기 */}
            <Text style={st.capFontLabel}>{t('cut.captionFontLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.capFontRow}>
              {HANDLE_FONTS.map((f) => {
                const selected = (captionFont ?? 'default') === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[st.capFontChip, selected && [st.capFontChipOn, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.accent }]]}
                    activeOpacity={0.8}
                    onPress={() => setCaptionFont(f.id === 'default' ? null : f.id)}
                  >
                    <Text style={[st.capFontChipTxt, handleFontStyle(f.id)]} numberOfLines={1}>
                      {captionDraft.trim() || t(f.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={st.capBtnRow}>
              <TouchableOpacity style={[st.capBtn, st.capBtnCancel]} activeOpacity={0.7} onPress={() => setCaptionModalVisible(false)}>
                <Text style={st.ccCloseText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.capBtn, st.capBtnOk]} activeOpacity={0.7} onPress={confirmCaption}>
                <Text style={st.capBtnOkTxt}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 사진 불러오는 중 (특히 iCloud 다운로드) */}
      {pickingPhoto && (
        <View style={st.loadingOverlay}>
          <ActivityIndicator size="large" color={skinAccent.accent} />
          <Text style={st.loadingText}>{t('cut.loading')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: C.white, fontSize: 14, fontWeight: '600' },
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
  customSwatch: { alignItems: 'center', justifyContent: 'center' },
  customPlus: { fontSize: 14, color: C.white, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2, textAlign: 'center' },
  frameImgSwatch: { backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },

  // 커스텀 프레임 색 모달
  ccOverlay: {
    flex: 1, backgroundColor: 'rgba(10,10,15,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  ccCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.card,
    borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(191,133,252,0.3)',
  },
  ccTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 14 },
  ccRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  ccSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ccSwatchOn: { borderWidth: 3, borderColor: C.purple },
  ccClose: {
    marginTop: 10, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  ccCloseText: { fontSize: 14, fontWeight: '600', color: C.dim },

  // 하단 여백 스탬프 (날짜·문구)
  stampRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10, justifyContent: 'center' },
  stampChip: {
    maxWidth: '60%', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  stampChipOn: { backgroundColor: 'rgba(191,133,252,0.18)', borderColor: C.purple },
  stampChipTxt: { fontSize: 12, color: C.dim, fontWeight: '600' },
  stampChipTxtOn: { color: C.purple },

  // 문구 스탬프 모달
  capInput: {
    backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 10, color: C.white, fontSize: 16, marginBottom: 14,
  },
  capFontLabel: { fontSize: 11, color: C.dim, marginBottom: 8 },
  capFontRow: { gap: 8, paddingBottom: 4 },
  capFontChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, maxWidth: 140,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  capFontChipOn: { borderColor: C.purple, backgroundColor: 'rgba(191,133,252,0.15)' },
  capFontChipTxt: { fontSize: 14, color: C.white },
  capBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  capBtn: { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  capBtnCancel: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  capBtnOk: { backgroundColor: C.purple },
  capBtnOkTxt: { fontSize: 14, fontWeight: '700', color: C.bg },
});
