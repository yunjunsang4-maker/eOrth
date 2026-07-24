import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  Dimensions, ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useRecords } from '../store/recordStore';
import { copyTripOriginals, bakeCoverCrop, type PhotoRef } from '../utils/importPhotoStore';
import { groupUrisByDay, newSectionId } from '../utils/albumSections';
import type { RootStackScreenProps } from '../navigation/types';
import CutPhotoAdjustModal, { AdjustedCoverImage, type CutTransform } from '../components/CutPhotoAdjustModal';
import { getMaxRecordPhotos } from '../constants/limits';
import { useSettings } from '../store/settingsStore';
import { classifyImportTarget } from '../utils/importRouting';
import { COUNTRIES } from '../constants/countries';

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

// 미리보기 카드 크기 — 위치 조정과 실제 크롭이 같은 비율을 쓰도록 공유
const CARD_W = width - 40; // 시트 좌우 패딩 20×2
const CARD_H = 180;
const CARD_ASPECT = CARD_W / CARD_H;

export default function ImportPhotoSelectScreen({ navigation, route }: RootStackScreenProps<'ImportPhotoSelect'>) {
  const { t } = useTranslation();
  const { trips } = route.params as { trips: ImportTrip[] };
  const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
  const insets = useSafeAreaInsets();
  const { isPremium, homeCountryCode } = useSettings();
  const maxPhotosPerTrip = getMaxRecordPhotos(isPremium); // 기록당 사진 상한 공유 (프리미엄 100장)

  const [index, setIndex] = useState(0);
  // 여행별 선택된 사진 uri 집합
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [dayFilter, setDayFilter] = useState<string | null>(null); // null = 전체
  // 여행별 썸네일(대표 사진) uri. 미지정/선택 해제 시 첫 번째 선택 사진으로 대체
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [previewVisible, setPreviewVisible] = useState(false); // 기록 카드 미리보기
  // 여행별 썸네일 위치 조정값 — 어떤 사진에 대한 값인지 uri로 묶어 커버가 바뀌면 무시
  const [coverAdjusts, setCoverAdjusts] = useState<Record<string, { uri: string; t: CutTransform }>>({});
  const [adjustVisible, setAdjustVisible] = useState(false);

  const trip = trips[index];
  if (!trip) return null; // 방어: 빈 trips
  const sel = selected[trip.id] ?? [];
  const isLast = index === trips.length - 1;
  const cover = covers[trip.id] && sel.includes(covers[trip.id]) ? covers[trip.id] : sel[0];
  const adjustEntry = coverAdjusts[trip.id];
  const activeAdjust = adjustEntry && adjustEntry.uri === cover ? adjustEntry.t : null;

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
    if (cur.length >= maxPhotosPerTrip) {
      Alert.alert(t('imports.noticeTitle'), t('imports.maxPhotosAlert', { max: maxPhotosPerTrip }));
      return;
    }
    setSelected((prev) => ({ ...prev, [trip.id]: [...(prev[trip.id] ?? []), uri] }));
  };

  // 다음/완료 → 바로 진행하지 않고 기록 카드 미리보기에서 썸네일을 확정하게 한다
  const next = () => {
    if (sel.length === 0) return;
    setPreviewVisible(true);
  };

  const confirmPreview = () => {
    setPreviewVisible(false);
    if (!isLast) {
      setDayFilter(null); // 다음 여행으로 넘어가면 일별 필터 초기화
      setIndex((i) => i + 1);
      return;
    }
    save();
  };

  const prev = () => {
    if (index === 0) return;
    setDayFilter(null); // 여행이 바뀌므로 일별 필터 초기화 (선택 내역은 여행별로 유지됨)
    setIndex((i) => i - 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      // 완료 화면 요약용 — 실제로 만들어진 여행 수/사진 수/국가 누적
      let tripCount = 0;
      let photoCount = 0;
      const countries: { flag: string; name: string }[] = [];
      const trFn = t; // 아래 루프의 t(여행)가 번역 함수 t를 가리므로 별칭 사용
      const homeCountryName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;
      const stayCountryName = activeStayGroup?.stay?.status !== 'ended' ? (activeStayGroup?.countryName ?? null) : null;
      for (const t of trips) {
        const uris = selected[t.id] ?? [];
        if (uris.length === 0) continue; // 선택 0장 → 카드 생성 안 함
        const coverUri = covers[t.id] && uris.includes(covers[t.id]) ? covers[t.id] : uris[0];
        const picked = t.photos.filter((p) => uris.includes(p.uri));
        // 썸네일(대표 사진)을 맨 앞에 복사 → medias[0]이 여행 기록 카드의 썸네일이 된다
        const items: PhotoRef[] = [
          ...picked.filter((p) => p.uri === coverUri),
          ...picked.filter((p) => p.uri !== coverUri),
        ];
        const { uris: copied, firstItemCopied, srcIndexes } = await copyTripOriginals(t.id, items);
        if (copied.length === 0) continue;
        // 위치 조정값이 있으면 보이는 영역만 실제 크롭해 카드 썸네일 전용본으로 저장.
        // 커버(0번) 복사가 실패했으면 copied[0]은 '다른 사진'이므로 크롭을 굽지 않는다.
        const adj = coverAdjusts[t.id];
        let repUri: string | undefined;
        if (adj && adj.uri === coverUri && firstItemCopied) {
          repUri = (await bakeCoverCrop(copied[0], adj.t, CARD_ASPECT, t.id)) ?? undefined;
        }
        // 날짜별 자동 섹션 — 촬영일이 2일 이상이면 'n일차' 섹션으로 자동 정리 (미상은 '기타')
        const pairs = copied.map((uri, k) => ({ uri, time: (items[srcIndexes[k]] as TripPhoto | undefined)?.creationTime }));
        const groups = groupUrisByDay(pairs);
        let mediasOrdered = copied;
        let autoSections: { id: string; title: string; count: number }[] | undefined;
        if (groups.filter((g) => g.key !== null).length >= 2) {
          mediasOrdered = groups.flatMap((g) => g.uris);
          let dayN = 0;
          autoSections = groups.map((g) => ({
            id: newSectionId(),
            title: g.key ? trFn('comp.sectionDayN', { n: ++dayN }) : trFn('comp.sectionEtc'),
            count: g.uris.length,
          }));
        }
        const recId = addImportedAlbum({
          country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
          date: t.date, startDate: t.startDate, endDate: t.endDate,
          title: t.title, medias: mediasOrdered,
          // 날짜 정렬로 medias[0]이 커버가 아닐 수 있으므로 카드 썸네일용 대표를 명시
          representativePhoto: repUri ?? (firstItemCopied ? copied[0] : undefined),
          albumSections: autoSections,
        }).id;
        // 진행 중 체류국 사진이면 체류 카드로 흡수(백데이팅), 제3국이면 별도 여행 카드
        const target = classifyImportTarget(t.countryName, homeCountryName, stayCountryName);
        if (target === 'stay') {
          absorbIntoStay(recId, t.startDate);
          photoCount += copied.length;
        } else if (target === 'trip') {
          // 제목에 국기를 넣지 않는다 — 프로필 카드가 `${countryFlag} ${title}`로 렌더링해 중복됨
          addTripGroup({ title: t.title, records: [recId], coverRecordId: recId });
          tripCount += 1;
          photoCount += copied.length;
          countries.push({ flag: t.countryFlag, name: t.countryName });
        }
        // 'skip'(거주국)은 clusterForeignTrips가 이미 제외 — 방어적으로 무시
      }
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'ImportComplete', params: { tripCount, photoCount, countries } },
        ],
      });
    } catch {
      setSaving(false);
      Alert.alert(t('imports.saveFailTitle'), t('imports.saveFailMsg'));
    }
  };

  if (saving) {
    return (
      <LinearGradient colors={['#0A0118', '#100620']} style={st.center}>
        <ActivityIndicator color="#7B61FF" size="large" />
        <Text style={st.savingText}>{t('imports.savingAlbum')}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 24 }]}>
        <Text style={st.step}>{index + 1} / {trips.length}</Text>
        <Text style={st.title}>{trip.countryFlag} {trip.title}</Text>
        <Text style={st.sub}>{t('imports.selectPhotosMax', { max: maxPhotosPerTrip })}</Text>
        <Text style={st.counter}>{sel.length} / {maxPhotosPerTrip}</Text>
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
              <Text style={[st.dayTxt, dayFilter === null && st.dayTxtOn]}>{t('imports.all')}</Text>
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
        <View style={st.bottomRow}>
          {index > 0 && (
            <TouchableOpacity style={st.prevBtn} onPress={prev} activeOpacity={0.85}>
              <Text style={st.prevTxt}>{t('imports.prev')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[st.nextBtn, sel.length === 0 && st.nextBtnDisabled]}
            onPress={next}
            disabled={sel.length === 0}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.nextGrad}>
              <Text style={st.nextTxt}>
                {sel.length === 0 ? t('imports.selectAtLeastOne') : isLast ? t('imports.done') : t('imports.next')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* 기록 카드 미리보기 + 썸네일 선택 */}
      <Modal visible={previewVisible} transparent animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={st.pvOverlay} accessibilityViewIsModal>
          <View style={st.pvSheet}>
            <Text style={st.pvTitle}>{t('imports.previewTitle')}</Text>
            <Text style={st.pvSub}>{t('imports.previewSub')}</Text>

            {/* 카드 예시 — 탭하면 노출 영역 조정 */}
            <TouchableOpacity style={st.pvCard} activeOpacity={0.9} onPress={() => cover && setAdjustVisible(true)}>
              {cover && (
                <AdjustedCoverImage uri={cover} transform={activeAdjust} frameW={CARD_W} frameH={CARD_H} />
              )}
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={st.pvCardShade} />
              <View style={st.pvCardInfo}>
                <Text style={st.pvCardTitle}>{trip.countryFlag} {trip.title}</Text>
                <Text style={st.pvCardDate}>
                  {trip.startDate} ~ {trip.endDate.substring(5)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 썸네일 선택 — 선택된 썸네일을 한 번 더 누르면 노출 영역 조정 */}
            <Text style={st.pvPickLabel}>{t('imports.pickThumb')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pvStrip}>
              {sel.map((uri) => {
                const on = uri === cover;
                return (
                  <TouchableOpacity
                    key={uri}
                    onPress={() => {
                      if (on) {
                        setAdjustVisible(true);
                      } else {
                        setCovers((prev) => ({ ...prev, [trip.id]: uri }));
                        setCoverAdjusts((prev) => {
                          const next = { ...prev };
                          delete next[trip.id];
                          return next;
                        });
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri }} style={[st.pvThumb, on && st.pvThumbOn]} />
                    {on && (
                      <View style={st.pvThumbAdjustBadge}>
                        <Text style={st.pvThumbAdjustTxt}>{t('imports.adjust')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={st.pvBtnRow}>
              <TouchableOpacity style={st.pvBackBtn} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                <Text style={st.pvBackTxt}>{t('imports.reselect')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.pvOkBtn} onPress={confirmPreview} activeOpacity={0.85}>
                <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.pvOkGrad}>
                  <Text style={st.pvOkTxt}>{isLast ? t('imports.createNow') : t('imports.confirmNext')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* 썸네일 노출 영역 조정 (드래그/핀치) */}
          <CutPhotoAdjustModal
            visible={adjustVisible}
            uri={cover ?? null}
            aspect={CARD_ASPECT}
            initial={activeAdjust}
            onConfirm={(t) => {
              if (cover) setCoverAdjusts((prev) => ({ ...prev, [trip.id]: { uri: cover, t } }));
              setAdjustVisible(false);
            }}
            onCancel={() => setAdjustVisible(false)}
            onChangePhoto={() => setAdjustVisible(false)}
          />
        </View>
      </Modal>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText: { color: '#FFFFFF', fontSize: 14 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
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
  bottomRow: { flexDirection: 'row', gap: 10 },
  prevBtn: {
    paddingHorizontal: 24, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  prevTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nextBtn: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.5 },
  nextGrad: { paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  /* 기록 카드 미리보기 모달 */
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pvSheet: {
    backgroundColor: '#16121F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  pvTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  pvSub: { color: '#A1A1B0', fontSize: 13, marginBottom: 16 },
  pvCard: {
    width: '100%', height: 180, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#2A2735', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  pvCardShade: { ...StyleSheet.absoluteFillObject },
  pvCardInfo: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  pvCardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  pvCardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  pvPickLabel: { color: '#BF85FC', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  pvStrip: { gap: 8 },
  pvThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#2A2735' },
  pvThumbOn: { borderWidth: 2.5, borderColor: '#7B61FF' },
  pvThumbAdjustBadge: {
    position: 'absolute', bottom: 4, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  pvThumbAdjustTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  pvBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  pvBackBtn: {
    paddingHorizontal: 20, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  pvBackTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  pvOkBtn: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  pvOkGrad: { paddingVertical: 16, alignItems: 'center' },
  pvOkTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
