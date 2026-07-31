import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Dimensions, ActivityIndicator, Alert, ScrollView, Modal, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import ImportCtaButton from '../components/ImportCtaButton';
import AssetImage from '../components/AssetImage';

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

// 사진 셀 — 선택 시 살짝 줌아웃되며 마젠타 프레임이 드러나고, 순번 배지가 스프링으로 팝인.
function PhotoCell({ uri, assetId, order, onPress }: { uri: string; assetId?: string; order: number; onPress: () => void }) {
  const on = order > 0;
  const scale = useRef(new Animated.Value(on ? 1 : 0)).current; // 0=미선택(꽉참), 1=선택(줌아웃)
  useEffect(() => {
    Animated.spring(scale, { toValue: on ? 1 : 0, friction: 7, tension: 140, useNativeDriver: true }).start();
  }, [on, scale]);
  const imgScale = scale.interpolate({ inputRange: [0, 1], outputRange: [1, 0.955] });
  const badgeScale = scale.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={st.cellWrap}>
      {/* ph:// 자가 복구를 위해 AssetImage 사용 — 스케일은 바깥 Animated.View가 담당 */}
      <Animated.View style={{ transform: [{ scale: imgScale }] }}>
        <AssetImage uri={uri} assetId={assetId} style={st.cell} />
      </Animated.View>
      {on ? (
        <Animated.View style={[st.badgeOn, { transform: [{ scale: badgeScale }] }]}>
          <LinearGradient
            colors={['#FF14E4', '#00D8F3']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={st.badgeNum}>{order}</Text>
        </Animated.View>
      ) : (
        <View style={st.badgeOff} />
      )}
    </TouchableOpacity>
  );
}

export default function ImportPhotoSelectScreen({ navigation, route }: RootStackScreenProps<'ImportPhotoSelect'>) {
  const { t } = useTranslation();
  const { trips } = route.params as { trips: ImportTrip[] };
  const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
  const insets = useSafeAreaInsets();
  const { isPremium, homeCountryCode, setLastImportAt } = useSettings();
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
      Haptics.selectionAsync().catch(() => {});
      setSelected((prev) => ({ ...prev, [trip.id]: (prev[trip.id] ?? []).filter((u) => u !== uri) }));
      return;
    }
    if (cur.length >= maxPhotosPerTrip) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert(t('imports.noticeTitle'), t('imports.maxPhotosAlert', { max: maxPhotosPerTrip }));
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => ({ ...prev, [trip.id]: [...(prev[trip.id] ?? []), uri] }));
  };

  // 전체(또는 이 날짜) 선택/해제 — 현재 보이는 사진 대상, 상한 내에서 기존 순서 보존하며 추가.
  // 더 담을 게 없으면(모두 선택됐거나 상한에 걸려 방이 없음) '전체 해제' 모드로 전환.
  const visibleUris = visiblePhotos.map((p) => p.uri);
  const canAddMore = visibleUris.some((u) => !sel.includes(u)) && sel.length < maxPhotosPerTrip;
  const showDeselect = !canAddMore && sel.length > 0;
  const toggleSelectAll = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const cur = prev[trip.id] ?? [];
      if (showDeselect) {
        return { ...prev, [trip.id]: cur.filter((u) => !visibleUris.includes(u)) };
      }
      const toAdd = visibleUris.filter((u) => !cur.includes(u));
      const room = Math.max(0, maxPhotosPerTrip - cur.length);
      if (toAdd.length > room) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      return { ...prev, [trip.id]: [...cur, ...toAdd.slice(0, room)] };
    });
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
        // 저장 순서 = 사용자가 고른 순서(셀에 1,2,3…으로 보여 준 순번).
        // photos 배열을 filter하면 촬영순으로 되돌아가 화면의 순번과 결과가 어긋났다.
        const byUri = new Map(t.photos.map((p) => [p.uri, p]));
        const picked = uris
          .map((u) => byUri.get(u))
          .filter((p): p is TripPhoto => !!p);
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
        // 복사본 uri → 원본 갤러리 자산 id / 촬영시각.
        // assetId는 "이 사진은 이미 가져왔다"는 근거가 되어, 앱 내에서 다시 스캔할 때
        // 같은 여행이 중복 카드로 또 만들어지는 것을 막는다(사진첩 생성 화면과 동일 규약).
        const mediaAssetIds: Record<string, string> = {};
        const mediaTimes: Record<string, number> = {};
        copied.forEach((uri, k) => {
          const src = items[srcIndexes[k]] as TripPhoto | undefined;
          if (src?.id) mediaAssetIds[uri] = src.id;
          if (src?.creationTime) mediaTimes[uri] = src.creationTime;
        });
        const recId = addImportedAlbum({
          country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
          date: t.date, startDate: t.startDate, endDate: t.endDate,
          title: t.title, medias: mediasOrdered,
          // 날짜 정렬로 medias[0]이 커버가 아닐 수 있으므로 카드 썸네일용 대표를 명시
          representativePhoto: repUri ?? (firstItemCopied ? copied[0] : undefined),
          albumSections: autoSections,
          mediaAssetIds,
          mediaTimes,
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
      // 다음 재스캔의 기본 기간 기준점 — 실제로 사진이 들어온 경우에만 갱신한다.
      // (0장이면 기준을 옮기면 안 된다. 사용자가 이번에 안 담은 사진들을 다음 스캔에서
      //  기간 밖으로 밀어내 영영 못 찾게 되기 때문)
      if (photoCount > 0) setLastImportAt(Date.now());
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'ImportComplete', params: { tripCount, photoCount, countries, from: route.params?.from } },
        ],
      });
    } catch {
      setSaving(false);
      Alert.alert(t('imports.saveFailTitle'), t('imports.saveFailMsg'));
    }
  };

  if (saving) {
    return (
      <View style={st.center}>
        <StarFieldBackground opacity={0.5} />
        <IntroAmbient />
        <ActivityIndicator color="#EC34F7" size="large" />
        <Text style={st.savingText}>{t('imports.savingAlbum')}</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      <View style={[st.header, { paddingTop: insets.top + 24 }]}>
        <Text style={st.step}>STEP {index + 1} / {trips.length}</Text>
        <Text style={st.title}>{trip.countryFlag} {trip.title}</Text>
        <Text style={st.sub}>{t('imports.selectPhotosMax', { max: maxPhotosPerTrip })}</Text>
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

      {/* 선택 카운터 + 전체(이 날짜) 선택 토글 */}
      <View style={st.selectBar}>
        <Text style={st.counter}>{sel.length} <Text style={st.counterMax}>/ {maxPhotosPerTrip}</Text></Text>
        {visibleUris.length > 0 && (
          <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.8} style={st.selAllBtn}>
            <Text style={st.selAllTxt}>
              {showDeselect
                ? t('album.deselectAll')
                : dayFilter ? t('album.selectAllDay') : t('album.selectAll')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={visiblePhotos}
        keyExtractor={(p, i) => p.uri + i}
        numColumns={COL}
        contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
        columnWrapperStyle={{ gap: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <PhotoCell uri={item.uri} assetId={item.id} order={sel.indexOf(item.uri) + 1} onPress={() => toggle(item.uri)} />
        )}
      />

      <View style={[st.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={st.bottomRow}>
          {index > 0 && (
            <TouchableOpacity style={st.prevBtn} onPress={prev} activeOpacity={0.85}>
              <Text style={st.prevTxt}>{t('imports.prev')}</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <ImportCtaButton
              gid="photoNextCta"
              disabled={sel.length === 0}
              onPress={next}
              label={sel.length === 0 ? t('imports.selectAtLeastOne') : isLast ? t('imports.done') : t('imports.next')}
            />
          </View>
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
                    <AssetImage uri={uri} assetId={trip.photos.find((p) => p.uri === uri)?.id} style={[st.pvThumb, on && st.pvThumbOn] as any} />
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
              <View style={{ flex: 1 }}>
                <ImportCtaButton
                  gid="pvOkCta"
                  onPress={confirmPreview}
                  label={isLast ? t('imports.createNow') : t('imports.confirmNext')}
                />
              </View>
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
          />
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#0A0B0F' },
  savingText: { color: '#FFFFFF', fontSize: 14 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  step: { color: '#EC34F7', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  dayBar: { marginTop: 10 },
  dayRow: { paddingHorizontal: 16, gap: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dayChipOn: { borderColor: '#EC34F7', backgroundColor: 'rgba(236, 52, 247, 0.18)' },
  dayTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  dayTxtOn: { color: '#FFFFFF', fontWeight: '700' },

  /* 선택 카운터 + 전체 선택 */
  selectBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 12, marginBottom: 2,
  },
  counter: { color: '#EC34F7', fontSize: 15, fontWeight: '800' },
  counterMax: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  selAllBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(236, 52, 247, 0.4)', backgroundColor: 'rgba(236, 52, 247, 0.08)',
  },
  selAllTxt: { color: '#EC34F7', fontSize: 12, fontWeight: '700' },

  /* 사진 셀 */
  // 선택 시 이미지가 줌아웃되며 이 얇은 흰색 프레임이 드러난다(선택 신호는 순번 배지가 담당)
  cellWrap: {
    width: CELL, height: CELL, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  cell: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#2A2735' },
  badgeOff: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(0,0,0,0.25)',
  },
  badgeOn: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  badgeNum: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(10,11,15,0.95)' },
  bottomRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  prevBtn: {
    paddingHorizontal: 24, height: 64, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  prevTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  /* 기록 카드 미리보기 모달 */
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pvSheet: {
    backgroundColor: '#141019', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  pvTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  pvSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 },
  pvCard: {
    width: '100%', height: 180, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#2A2735', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  pvCardShade: { ...StyleSheet.absoluteFillObject },
  pvCardInfo: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  pvCardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  pvCardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  pvPickLabel: { color: '#EC34F7', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  pvStrip: { gap: 8 },
  pvThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#2A2735' },
  pvThumbOn: { borderWidth: 2.5, borderColor: '#EC34F7' },
  pvThumbAdjustBadge: {
    position: 'absolute', bottom: 4, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  pvThumbAdjustTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  pvBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20, alignItems: 'center' },
  pvBackBtn: {
    paddingHorizontal: 20, height: 64, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  pvBackTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
