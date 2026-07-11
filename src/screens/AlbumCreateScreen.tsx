import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  Dimensions, ActivityIndicator, Alert, ScrollView, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecords } from '../store/recordStore';
import { copyTripOriginals, bakeCoverCrop, type PhotoRef } from '../utils/importPhotoStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';
import CutPhotoAdjustModal, { AdjustedCoverImage, type CutTransform } from '../components/CutPhotoAdjustModal';
import { CalendarBottomSheet } from './NewRecordScreen';
import { COUNTRIES, type Country, CONTINENT_ORDER } from '../constants/countries';
import { SearchIcon } from '../components/icons';

// 사진첩 한 권당 최대 장수 (import 흐름과 동일한 프리미엄 seam)
export const MAX_ALBUM_PHOTOS = 30;
const PAGE_SIZE = 200; // 갤러리 페이지네이션 단위

type AlbumPhoto = PhotoRef & { creationTime?: number };

// 일별 필터용 날짜 키/라벨 (ImportPhotoSelectScreen과 동일 규칙)
const dayKey = (ts?: number): string | null => {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (key: string): string => {
  const [, m, d] = key.split('.');
  return `${Number(m)}월 ${Number(d)}일`;
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

const { width } = Dimensions.get('window');
const COL = 3;
const CELL = Math.floor((width - 16 * 2 - 8 * (COL - 1)) / COL);

// 미리보기 카드 크기 — 위치 조정과 실제 크롭이 같은 비율을 쓰도록 공유
const CARD_W = width - 40; // 시트 좌우 패딩 20×2
const CARD_H = 180;
const CARD_ASPECT = CARD_W / CARD_H;

export default function AlbumCreateScreen({ navigation, route }: RootStackScreenProps<'AlbumCreate'>) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 선택 상태·카운터 등 강조를 스킨색으로
  const insets = useSafeAreaInsets();
  const { addImportedAlbum, addTripGroup, tripGroups, updateTripGroup } = useRecords();

  // 기간 (기본: 최근 7일)
  const today = new Date();
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState<Date>(weekAgo);
  const [endDate, setEndDate] = useState<Date>(today);
  const [calendarVisible, setCalendarVisible] = useState(false);

  // 국가 선택 (필수) — 카드 표시용 국기로만 쓰고 countryName은 비워
  // 소셜·지구본·대륙·통계에 잡히지 않는다는 사진첩 규칙을 유지한다.
  // 지구본/대륙에서 진입하면 선택한 국가가 미리 채워진다 (name: "일본" 또는 "일본 - 도쿄")
  const preselected = route?.params?.selectedCountry as { name?: string } | undefined;
  const tripGroupId = route?.params?.tripGroupId as string | undefined;
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(
    preselected?.name ? (COUNTRIES.find(c => c.name === preselected.name!.split(' - ')[0]) ?? null) : null
  );
  const [countrySearch, setCountrySearch] = useState('');

  // 단계: setup(기간 설정) → select(사진 선택)
  const [phase, setPhase] = useState<'setup' | 'select'>('setup');
  const [loading, setLoading] = useState(false);     // 첫 페이지 로딩
  const [loadingMore, setLoadingMore] = useState(false);
  const [isLimited, setIsLimited] = useState(false); // 사진 권한이 'limited'인지
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const hasNextRef = useRef(false);

  // 선택
  const [selected, setSelected] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  // 미리보기(제목 + 썸네일)
  const [previewVisible, setPreviewVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 썸네일 위치 조정 — 어떤 사진에 대한 조정값인지 uri로 묶어 커버가 바뀌면 무시되게 한다
  const [coverAdjust, setCoverAdjust] = useState<{ uri: string; t: CutTransform } | null>(null);
  const [adjustVisible, setAdjustVisible] = useState(false);

  const cover = coverUri && selected.includes(coverUri) ? coverUri : selected[0];
  const activeAdjust = coverAdjust && coverAdjust.uri === cover ? coverAdjust.t : null;

  // ── 갤러리에서 기간 내 사진 페이지 로드 ──
  const fetchPage = async (after?: string) => {
    const startMs = new Date(startDate); startMs.setHours(0, 0, 0, 0);
    const endMs = new Date(endDate); endMs.setHours(23, 59, 59, 999);
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: 'photo',
      sortBy: 'creationTime',
      createdAfter: startMs.getTime(),
      createdBefore: endMs.getTime(),
    });
    cursorRef.current = page.endCursor;
    hasNextRef.current = page.hasNextPage;
    // iOS: ph:// 그대로 <Image>에 넣으면 새 아키텍처에서 검은 타일로 뜸(NewRecordScreen과 동일 이슈)
    // → 표시 가능한 localUri(file://)로 변환. iCloud 오프로드(localUri 없음)는 원본 유지.
    return Promise.all(
      page.assets.map(async (a) => {
        let uri = a.uri;
        if (Platform.OS === 'ios' && uri.startsWith('ph://')) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(a, { shouldDownloadFromNetwork: false });
            if (info.localUri) uri = info.localUri;
          } catch {}
        }
        return { id: a.id, uri, creationTime: a.creationTime || undefined };
      })
    );
  };

  const startLoad = async () => {
    if (!selectedCountry) {
      Alert.alert(t('album.countrySelectTitle'), t('album.selectCountryMsg'));
      return;
    }
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false);
      if (status !== 'granted' && (status as string) !== 'limited') {
        showPermissionDeniedAlert(t('permission.gallery'));
        return;
      }
      setIsLimited((status as string) === 'limited');
      const first = await fetchPage(undefined);
      setPhotos(first);
      setSelected([]);
      setDayFilter(null);
      setPhase('select');
    } catch {
      Alert.alert(t('album.noticeTitle'), t('album.loadPhotoProblem'));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasNextRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(cursorRef.current);
      setPhotos((prev) => [...prev, ...next]);
    } catch {
      // 추가 페이지 실패는 조용히 무시 (이미 불러온 사진으로 진행 가능)
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (uri: string) => {
    if (selected.includes(uri)) {
      setSelected((prev) => prev.filter((u) => u !== uri));
      return;
    }
    if (selected.length >= MAX_ALBUM_PHOTOS) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: MAX_ALBUM_PHOTOS }));
      return;
    }
    setSelected((prev) => [...prev, uri]);
  };

  // ─── 국가 필터 — 피드(NewRecordScreen)와 동일: term 검색 + 한글 정렬 + 대륙 그룹 ───
  const groupedCountries = (() => {
    const filtered = COUNTRIES.filter(c => c.term.toLowerCase().includes(countrySearch.toLowerCase()));
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return CONTINENT_ORDER.map(continent => ({
      continent,
      countries: sorted.filter(c => c.continent === continent),
    })).filter(g => g.countries.length > 0);
  })();

  const defaultTitle = selectedCountry ? `${selectedCountry.name} 사진첩` : `${fmtDate(startDate)} 사진첩`;

  // 사진이 있는 날짜 목록(시간순). 선택은 uri 기준이라 필터와 무관하게 유지된다.
  const days = Array.from(
    new Set(photos.map((p) => dayKey(p.creationTime)).filter((k): k is string => k !== null))
  ).sort();
  const visiblePhotos = dayFilter
    ? photos.filter((p) => dayKey(p.creationTime) === dayFilter)
    : photos;

  // ── 저장: 사진첩 기록(album, private) + 프로필 여행기록카드만 생성 ──
  // 국가 필드를 비워 소셜·지구본·대륙·통계 국가 카운트에 잡히지 않게 한다.
  const save = async () => {
    setPreviewVisible(false);
    setSaving(true);
    try {
      const albumId = `album-${Date.now()}`;
      const picked = photos.filter((p) => selected.includes(p.uri));
      // 썸네일(대표 사진)을 맨 앞에 복사 → medias[0]이 여행 기록 카드의 썸네일이 된다
      const items: PhotoRef[] = [
        ...picked.filter((p) => p.uri === cover),
        ...picked.filter((p) => p.uri !== cover),
      ];
      const { uris: copied, firstItemCopied } = await copyTripOriginals(albumId, items);
      if (copied.length === 0) throw new Error('copy failed');
      // 위치 조정값이 있으면 보이는 영역만 실제 크롭해 카드 썸네일 전용본으로 저장.
      // 커버(0번) 복사가 실패했으면 copied[0]은 다른 사진이므로 크롭을 굽지 않는다.
      let repUri: string | undefined;
      if (activeAdjust && firstItemCopied) {
        repUri = (await bakeCoverCrop(copied[0], activeAdjust, CARD_ASPECT, albumId)) ?? undefined;
      }
      const albumTitle = title.trim() || defaultTitle;
      const recId = addImportedAlbum({
        // countryName/country는 비워둔다 — 채우면 지구본·대륙 활성화와 통계,
        // 다른 국가 카드의 기록 매칭에 잡힌다. 국기는 카드 표시 전용.
        country: '', countryName: '', countryFlag: selectedCountry?.flag || '',
        date: fmtDate(startDate),
        startDate: fmtDate(startDate),
        endDate: fmtDate(endDate),
        title: albumTitle,
        medias: copied,
        representativePhoto: repUri,
      });
      if (tripGroupId) {
        // 여행 상세에서 진입 — 그 여행 카드에 사진첩을 연결(카드당 앨범 1개 정책)
        const g = tripGroups.find((x) => x.id === tripGroupId);
        if (g && !g.records.includes(recId)) updateTripGroup(tripGroupId, { records: [...g.records, recId] });
        else if (!g) addTripGroup({ title: albumTitle, records: [recId], coverRecordId: recId });
      } else {
        addTripGroup({ title: albumTitle, records: [recId], coverRecordId: recId });
      }
      navigation.goBack();
    } catch {
      setSaving(false);
      Alert.alert(t('album.saveFailTitle'), t('album.saveFailMsg'));
    }
  };

  if (saving) {
    return (
      <LinearGradient colors={['#0A0118', '#100620']} style={st.center}>
        <ActivityIndicator color="#7B61FF" size="large" />
        <Text style={st.savingText}>{t('album.saving')}</Text>
      </LinearGradient>
    );
  }

  // ── 1단계: 기간 설정 ──
  if (phase === 'setup') {
    return (
      <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
        <View style={[st.header, { paddingTop: insets.top + 24 }]}>
          <TouchableOpacity style={[st.closeBtn, { top: insets.top + 18 }]} onPress={() => navigation.goBack()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('album.closeA11y')}>
            <Text style={st.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={st.title}>📷 {t('comp2.albumCreateTitle')}</Text>
          <Text style={st.sub}>{t('album.sub', { max: MAX_ALBUM_PHOTOS })}</Text>
        </View>

        <ScrollView style={st.setupBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={st.fieldLabel}>{t('album.country')}</Text>

          {/* 선택된 국가 칩 */}
          {selectedCountry && (
            <View style={st.selectedChipsWrap}>
              <View style={st.countryChip}>
                <Text style={st.countryChipText}>{selectedCountry.flag} {selectedCountry.name}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedCountry(null)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={st.countryChipRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 검색창 — 항상 표시 */}
          <View style={st.searchCard}>
            <View style={st.searchRow}>
              <SearchIcon size={16} color="#A1A1B0" />
              <TextInput
                style={st.searchInput}
                placeholder={t('album.countrySearchPlaceholder')}
                placeholderTextColor="#5A5A6E"
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setCountrySearch('')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={st.clearBtnTxt}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 검색 결과 — 1글자 이상 */}
          {countrySearch.length >= 1 && (
            <View style={st.countryResultBox}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {groupedCountries.length === 0 ? (
                  <Text style={st.noResultText}>{t('album.noResult')}</Text>
                ) : (
                  groupedCountries.map(({ continent, countries }) => (
                    <View key={continent}>
                      <Text style={[st.continentHeader, { color: skinAccent.accent }]}>{continent}</Text>
                      {countries.map(c => {
                        const isSelected = selectedCountry?.name === c.name;
                        return (
                          <TouchableOpacity
                            key={c.name}
                            style={[st.countryItem, isSelected && [st.countryItemSelected, { backgroundColor: skinAccent.tint(0.12) }]]}
                            onPress={() => {
                              setSelectedCountry(isSelected ? null : c);
                              setCountrySearch('');
                            }}
                          >
                            <Text style={st.countryIcon}>{c.flag}</Text>
                            <Text style={[st.countryName, isSelected && [st.countryNameSelected, { color: skinAccent.accent }]]}>{c.name}</Text>
                            {isSelected && <Text style={[st.countryCheckMark, { color: skinAccent.accent }]}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          <Text style={[st.fieldLabel, { marginTop: 20 }]}>{t('album.period')}</Text>
          <TouchableOpacity style={st.dateBtn} onPress={() => setCalendarVisible(true)} activeOpacity={0.85}>
            <Text style={st.dateTxt}>{fmtDate(startDate)}</Text>
            <Text style={[st.dateArrow, { color: skinAccent.accent }]}>→</Text>
            <Text style={st.dateTxt}>{fmtDate(endDate)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={st.loadBtn} onPress={startLoad} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.loadGrad}>
              {loading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={st.loadTxt}>{t('album.loadPhotos')}</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={[st.noteBox, { backgroundColor: skinAccent.tint(0.08), borderColor: skinAccent.tint(0.2) }]}>
            <Text style={[st.noteTxt, { color: skinAccent.accent }]}>
              🔒 사진첩은 소셜과 지구본·대륙에 나타나지 않아요.{'\n'}오직 내 프로필의 여행기록카드로만 보관돼요.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <CalendarBottomSheet
          visible={calendarVisible}
          initialStart={startDate}
          initialEnd={endDate}
          startLabel={t('album.startLabel')}
          endLabel={t('album.endLabel')}
          onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
          onClose={() => setCalendarVisible(false)}
        />
      </LinearGradient>
    );
  }

  // ── 2단계: 사진 선택 ──
  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 24 }]}>
        <TouchableOpacity style={[st.backBtn, { top: insets.top + 18 }]} onPress={() => setPhase('setup')} activeOpacity={0.8}>
          <Text style={st.closeTxt}>←</Text>
        </TouchableOpacity>
        <Text style={[st.title, st.titleIndented]}>{t('album.selectPhotos')}</Text>
        <Text style={st.sub}>{fmtDate(startDate)} ~ {fmtDate(endDate)} · 사진첩에 담을 사진을 골라주세요</Text>
        <Text style={[st.counter, { color: skinAccent.accent }]}>{selected.length} / {MAX_ALBUM_PHOTOS}</Text>
        {isLimited && (
          <Text style={[st.limitedTxt, { color: skinAccent.accent }]}>{t('album.limitedTxt')}</Text>
        )}
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
              <Text style={[st.dayTxt, dayFilter === null && st.dayTxtOn]}>{t('album.all')}</Text>
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

      {photos.length === 0 ? (
        <View style={st.emptyWrap}>
          <Text style={st.emptyEmoji}>🖼️</Text>
          <Text style={st.emptyTitle}>{t('album.emptyTitle')}</Text>
          <Text style={st.emptySub}>{t('album.emptySub')}</Text>
        </View>
      ) : (
        <FlatList
          data={visiblePhotos}
          keyExtractor={(p, i) => p.uri + i}
          numColumns={COL}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          columnWrapperStyle={{ gap: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#7B61FF" style={{ marginTop: 16 }} /> : null}
          renderItem={({ item }) => {
            const on = selected.includes(item.uri);
            return (
              <TouchableOpacity activeOpacity={0.8} onPress={() => toggle(item.uri)} style={{ width: CELL, height: CELL }}>
                <Image source={{ uri: item.uri }} style={st.cell} />
                <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkTxt}>✓</Text>}</View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View style={st.bottom}>
        <TouchableOpacity
          style={[st.nextBtn, selected.length === 0 && st.nextBtnDisabled]}
          onPress={() => setPreviewVisible(true)}
          disabled={selected.length === 0}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.nextGrad}>
            <Text style={st.nextTxt}>
              {selected.length === 0 ? t('album.selectAtLeastOne') : t('album.createWithN', { count: selected.length })}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 기록 카드 미리보기 + 제목 입력 + 썸네일 선택 */}
      <Modal visible={previewVisible} transparent animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <KeyboardAvoidingView
          style={st.pvOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          accessibilityViewIsModal
        >
          <View style={st.pvSheet}>
            <Text style={st.pvTitle}>{t('album.previewTitle')}</Text>
            <Text style={st.pvSub}>{t('album.previewSub')}</Text>

            {/* 카드 예시 — 탭하면 노출 영역 조정 */}
            <TouchableOpacity style={st.pvCard} activeOpacity={0.9} onPress={() => cover && setAdjustVisible(true)}>
              {cover && (
                <AdjustedCoverImage uri={cover} transform={activeAdjust} frameW={CARD_W} frameH={CARD_H} />
              )}
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={st.pvCardShade} />
              <View style={st.pvCardInfo}>
                <Text style={st.pvCardTitle}>{selectedCountry ? `${selectedCountry.flag} ` : ''}{title.trim() || defaultTitle}</Text>
                <Text style={st.pvCardDate}>
                  {fmtDate(startDate)} ~ {fmtDate(endDate).substring(5)} · {selected.length}장
                </Text>
              </View>
            </TouchableOpacity>

            {/* 제목 입력 */}
            <Text style={[st.pvPickLabel, { color: skinAccent.accent }]}>{t('album.albumName')}</Text>
            <TextInput
              style={st.pvInput}
              value={title}
              onChangeText={setTitle}
              placeholder={defaultTitle}
              placeholderTextColor="#5A5A6E"
              maxLength={30}
            />

            {/* 썸네일 선택 — 선택된 썸네일을 한 번 더 누르면 노출 영역 조정 */}
            <Text style={[st.pvPickLabel, { color: skinAccent.accent }]}>{t('album.pickThumb')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pvStrip}>
              {selected.map((uri) => {
                const on = uri === cover;
                return (
                  <TouchableOpacity
                    key={uri}
                    onPress={() => {
                      if (on) setAdjustVisible(true);
                      else { setCoverUri(uri); setCoverAdjust(null); }
                    }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri }} style={[st.pvThumb, on && st.pvThumbOn]} />
                    {on && (
                      <View style={st.pvThumbAdjustBadge}>
                        <Text style={st.pvThumbAdjustTxt}>{t('album.adjust')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={st.pvBtnRow}>
              <TouchableOpacity style={st.pvBackBtn} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                <Text style={st.pvBackTxt}>{t('album.reselect')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.pvOkBtn} onPress={save} activeOpacity={0.85}>
                <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.pvOkGrad}>
                  <Text style={st.pvOkTxt}>{t('album.createNow')}</Text>
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
              if (cover) setCoverAdjust({ uri: cover, t });
              setAdjustVisible(false);
            }}
            onCancel={() => setAdjustVisible(false)}
            onChangePhoto={() => setAdjustVisible(false)}
          />
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText: { color: '#FFFFFF', fontSize: 14 },

  header: { paddingHorizontal: 16, paddingBottom: 8 },
  closeBtn: { position: 'absolute', right: 16, padding: 8, zIndex: 2 },
  backBtn: { position: 'absolute', left: 16, padding: 8, zIndex: 2 },
  closeTxt: { color: '#A1A1B0', fontSize: 20, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  titleIndented: { marginLeft: 36 }, // 왼쪽 ← 버튼과 겹치지 않게 제목만 들여쓰기

  sub: { color: '#A1A1B0', fontSize: 13, lineHeight: 19 },
  counter: { color: '#BF85FC', fontSize: 13, fontWeight: '700', marginTop: 6 },
  limitedTxt: { color: '#BF85FC', fontSize: 12, marginTop: 6 },

  /* 1단계: 기간 설정 */
  setupBody: { paddingHorizontal: 16, marginTop: 28 },
  fieldLabel: { color: '#A1A1B0', fontSize: 13, fontWeight: '600', marginBottom: 8 },

  /* 국가 검색 (피드와 동일한 방식) */
  selectedChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  countryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(123, 97, 255, 0.18)', borderWidth: 1, borderColor: '#7B61FF',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  countryChipText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  countryChipRemove: { color: '#A1A1B0', fontSize: 13, fontWeight: '600' },
  searchCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 16, padding: 0 },
  clearBtnTxt: { fontSize: 14, color: '#A1A1B0', fontWeight: '600' },
  countryResultBox: {
    backgroundColor: '#16121F', borderRadius: 14, marginTop: 8,
    maxHeight: 280, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  continentHeader: { fontSize: 11, fontWeight: '700', color: '#BF85FC', letterSpacing: 0.8, paddingTop: 12, paddingBottom: 4 },
  countryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  countryItemSelected: { backgroundColor: 'rgba(191,133,252,0.08)' },
  countryIcon: { fontSize: 22, marginRight: 14 },
  countryName: { fontSize: 15, color: '#FFFFFF' },
  countryNameSelected: { color: '#BF85FC', fontWeight: '600' },
  countryCheckMark: { marginLeft: 'auto', fontSize: 16, fontWeight: '700', color: '#BF85FC' },
  noResultText: { color: '#A1A1B0', fontSize: 14, textAlign: 'center', marginVertical: 24 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.4)', backgroundColor: 'rgba(123, 97, 255, 0.08)',
  },
  dateTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  dateArrow: { color: '#BF85FC', fontSize: 16 },
  loadBtn: { borderRadius: 999, overflow: 'hidden', marginTop: 24 },
  loadGrad: { paddingVertical: 18, alignItems: 'center' },
  loadTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  noteBox: {
    marginTop: 20, backgroundColor: 'rgba(191, 133, 252, 0.08)',
    borderWidth: 1, borderColor: 'rgba(191, 133, 252, 0.2)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  noteTxt: { color: '#BF85FC', fontSize: 12, lineHeight: 18, textAlign: 'center' },

  /* 2단계: 사진 선택 */
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: '#A1A1B0', fontSize: 13 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 40, backgroundColor: 'rgba(10,1,24,0.95)' },
  nextBtn: { borderRadius: 999, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.5 },
  nextGrad: { paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  /* 미리보기 모달 */
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
  pvInput: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: '#FFFFFF', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
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
