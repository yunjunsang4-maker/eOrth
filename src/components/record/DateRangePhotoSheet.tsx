/**
 * DateRangePhotoSheet — 기록 작성에서 '여행 기간에 찍은 사진'만 격자로 보여주는 시트.
 *
 * 왜 만들었나: 기록 작성의 사진 추가가 시스템 선택기라 사용자가 수천 장에서 직접 찾아야 했다.
 * 사진첩 만들기(AlbumCreateScreen)에는 이미 같은 격자가 있어 그 로직을 여기로 옮겨 왔다
 * (AlbumCreateScreen은 이번에 손대지 않는다 — 그쪽을 이 컴포넌트로 태우는 것은 후속 작업).
 *
 * 재질·색은 MediaPickerModal(같은 폴더의 사진 선택 모달)과 같은 토큰을 쓴다.
 *
 * ⚠️ 이 시트를 닫고 시스템 선택기를 띄우는 경로는 호출부(NewRecordScreen)가 맡는다.
 *    RN Modal이 닫히는 애니메이션 도중에 네이티브 피커를 present하면 보이지 않는 모달
 *    껍데기가 남아 앱 전체 터치를 삼킨다 — 여기서 직접 띄우지 말 것.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Modal,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../../constants/skinTheme';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';
import { GalleryIcon, PinIcon } from '../icons';
import PhotoViewerModal from '../PhotoViewerModal';
import AssetImage from '../AssetImage';
import { showPermissionDeniedAlert } from '../../utils/permissionAlert';
import { getCountryFeature, pointInCountry } from '../../utils/photoCountryFilter';
import { fetchLocationsInBatches } from '../../utils/photoLocationBatch';
import { isPhotoLocationAvailable, getLocations } from '../../../modules/photo-location';
import { KO_TO_EN } from '../../screens/MainScreen';
import {
  dayRangeMs,
  dayKey,
  toggleWithin,
  selectAllWithin,
  deselectAllWithin,
  pickablePhotos,
} from '../../utils/dateRangePhotoPick';

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  textDim: '#A1A1B0',
  white: '#FFFFFF',
  purpleNeon: '#BF85FC',
};

// 기간 전체를 한 번에 읽는다 — 페이지를 스크롤에 맞춰 늘리면 날짜 칩도 따라 늘어나 "칩이 하나씩 뜬다"로 보였다.
// getAssetsAsync는 메타만 돌려주므로 1,000장 단위로 몇 번 돌아도 1초 안쪽. 상한은 폭주 방어(한 달 여행 5천 장 여유).
const PAGE_SIZE = 1000;
const MAX_PHOTOS = 8000;
const COL = 3;

type RangePhoto = {
  id: string;
  /** 갤러리가 준 uri 그대로(iOS는 ph://). 격자는 AssetImage(expo-image)가 ph://를 셀 크기로 바로 그리므로
   *  목록 단계에서 경로를 변환하지 않는다 — 변환(getAssetInfoAsync, 장당 15ms+)은 확정 시 선택분만. */
  uri: string;
  creationTime?: number;
};

export interface DateRangePhotoSheetProps {
  visible: boolean;
  startDate: Date;
  endDate: Date;
  /** 한글 국가명. 있으면 "이 나라에서 찍은 사진만" 칩이 뜬다(기본 OFF) */
  countryName?: string | null;
  /** 이번에 더 담을 수 있는 장수 */
  max: number;
  /** 이미 기록에 담긴 원본 uri — 격자에서 '담김'으로 표시하고 고를 수 없게 한다 */
  excludeUris?: string[];
  /** 이미 기록에 담긴 사진의 assetId — 수정 모드는 저장본 경로라 uri가 안 겹친다(그쪽 유일한 단서) */
  excludeAssetIds?: string[];
  /**
   * 담기. iCloud 오프로드 사진은 localUri가 없어 uri를 못 주므로 assetId로 따로 넘긴다 —
   * 호출부가 downloadCloudAssets로 받아 같은 importOriginals 한 경로로 흘린다.
   */
  /** uris: 기기에 있는 원본 경로 / cloudAssetIds: iCloud 오프로드(호출부가 다운로드) /
   *  assetIds: [uris 순서대로의 id..., cloudAssetIds...] — 재열기 시 '담김' 제외와 삭제 시 해제에 쓴다 */
  onConfirm: (uris: string[], cloudAssetIds: string[], assetIds: string[]) => void;
  /** "전체 사진첩에서 고르기" — 호출부가 시트를 닫은 뒤 시스템 선택기를 띄운다 */
  onOpenSystemPicker: () => void;
  onClose: () => void;
  /** iOS 전용 — 시트가 실제로 닫힌 뒤 발화(RN Modal onDismiss). 시스템 선택기 전환에 쓴다 */
  onDismiss?: () => void;
}

export default function DateRangePhotoSheet({
  visible,
  startDate,
  endDate,
  countryName,
  max,
  excludeUris,
  excludeAssetIds,
  onConfirm,
  onOpenSystemPicker,
  onClose,
  onDismiss,
}: DateRangePhotoSheetProps) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const insets = useSafeAreaInsets();

  // 셀 폭은 Stage 폭에서 파생한다 — 박제하면 폴드 펼침에서 격자가 어긋난다(MediaPickerModal과 동일)
  const stageW = useStageWidth();
  const CELL = Math.floor((stageW - 32 - (COL - 1) * 8) / COL);

  const [photos, setPhotos] = useState<RangePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLimited, setIsLimited] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const range = useMemo(() => dayRangeMs(startDate, endDate), [startDate, endDate]);
  // 기간이 바뀌면 목록을 새로 불러오고 선택을 비운다 — 경계 ms를 키로 써서
  // 같은 날을 가리키는 다른 Date 객체로 재로드가 도는 것을 막는다.
  const rangeKey = range ? `${range.startMs}-${range.endMs}` : '';

  // ── "이 나라에서 찍은 사진만" 필터 ──
  // 판정은 utils/photoCountryFilter(=countryLocate) 한 곳. GPS 없는 사진은 항상 표시한다.
  const countryToken = useMemo(() => {
    if (!countryName) return null;
    const en = countryName === '대한민국' ? 'South Korea' : KO_TO_EN[countryName];
    return en ? getCountryFeature(en) : null;
  }, [countryName]);
  const [gpsOnly, setGpsOnly] = useState(false);
  const [geoProgress, setGeoProgress] = useState<{ done: number; total: number } | null>(null);
  const [geoTick, setGeoTick] = useState(0); // 판정 캐시는 ref라 결과 반영을 위해 직접 리렌더시킨다
  const locCacheRef = useRef<Map<string, boolean | null>>(new Map()); // assetId → 국가 안(null=GPS 없음)
  const geoScanToken = useRef(0);
  useEffect(() => () => { geoScanToken.current++; }, []); // 언마운트 시 진행 중 스캔 중단
  // 나라가 바뀌면 판정 캐시는 통째로 무효다. 이 시트는 화면에 상주 마운트라(닫아도 언마운트 안 됨)
  // 안 비우면 '일본 안인가' 판정으로 한국 사진을 걸러 내며, 오류도 로그도 없이 조용히 틀린다.
  // ⚠️ 아래 스캔 effect보다 먼저 선언해야 같은 렌더에서 비우기가 먼저 돈다(effect는 선언 순서대로 실행).
  useEffect(() => { locCacheRef.current.clear(); }, [countryToken]);

  // ── 기간 내 사진 페이지 로드 ──
  const fetchAll = useCallback(async (): Promise<RangePhoto[]> => {
    if (!range) return [];
    const out: RangePhoto[] = [];
    let after: string | undefined;
    do {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: 'photo',
      // [key, ascending] — 문자열만 넘기면 내림차순(최신 먼저)이라 여행 시작일부터 보이게 오름차순을 명시
      sortBy: [['creationTime', true]],
      createdAfter: range.startMs,
      createdBefore: range.endMs,
    });
    // 목록 단계는 변환 없음 — 장당 getAssetInfoAsync(15ms+, 오프로드면 더)는 확정 시 선택분만 돈다.
    for (const a of page.assets) out.push({ id: a.id, uri: a.uri, creationTime: a.creationTime || undefined });
    after = page.hasNextPage ? page.endCursor : undefined;
    } while (after && out.length < MAX_PHOTOS);
    return out;
  }, [range]);

  // 시트가 열리거나 기간이 바뀌면 첫 페이지부터 다시
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setPhotos([]);
      setSelected([]);
      setDayFilter(null);
      setGpsOnly(false);
      locCacheRef.current.clear(); // 기간이 바뀌면 사진 목록 자체가 바뀐다 — 옛 판정을 들고 있을 이유가 없다
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync(false);
        if (!alive) return;
        if (status !== 'granted' && (status as string) !== 'limited') {
          showPermissionDeniedAlert(t('permission.gallery'));
          onClose();
          return;
        }
        setIsLimited((status as string) === 'limited');
        const all = await fetchAll();
        if (!alive) return;
        setPhotos(all);
      } catch {
        if (alive) Alert.alert(t('newRecord.noticeTitle'), t('album.loadPhotoProblem'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // fetchAll/onClose는 매 렌더 새 참조라 의존성에 넣으면 재로드가 반복된다 — 키는 visible·기간뿐이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rangeKey]);

  // ── 화면에 보이는 목록 ──
  const pickable = useMemo(
    () => pickablePhotos(photos, excludeUris ?? [], excludeAssetIds ?? []),
    [photos, excludeUris, excludeAssetIds],
  );
  const days = useMemo(
    () => Array.from(new Set(pickable.map((p) => dayKey(p.creationTime)).filter((k): k is string => k !== null))).sort(),
    [pickable]
  );
  const byDay = dayFilter ? pickable.filter((p) => dayKey(p.creationTime) === dayFilter) : pickable;
  // GPS 필터 — '국가 밖으로 판정된' 사진만 제외한다(미판정·GPS 없음은 표시)
  const visiblePhotos = useMemo(
    () => (gpsOnly && countryToken ? byDay.filter((p) => locCacheRef.current.get(p.id) !== false) : byDay),
    // geoTick은 ref 캐시가 갱신됐음을 알리는 신호다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDay, gpsOnly, countryToken, geoTick]
  );

  // ── GPS 위치 판정 ──
  // 네이티브 배치 모듈이 있으면 한 번에(iOS Photos DB 직접 조회), 없으면 장당 getAssetInfoAsync.
  useEffect(() => {
    if (!visible || !gpsOnly || !countryToken) return;
    const targets = photos.map((p) => p.id).filter((id) => id && !locCacheRef.current.has(id)) as string[];
    if (targets.length === 0) return;
    const token = ++geoScanToken.current;
    const cancelled = () => geoScanToken.current !== token;
    (async () => {
      setGeoProgress({ done: 0, total: targets.length });
      if (isPhotoLocationAvailable) {
        const located = await fetchLocationsInBatches(targets, getLocations, {
          shouldCancel: cancelled,
          // 배치 진행률을 사진 장수로 환산해 보여준다(배치 수는 사용자에게 의미가 없다)
          onBatch: (done, total) => {
            if (cancelled()) return;
            setGeoProgress({ done: Math.round((targets.length * done) / total), total: targets.length });
          },
        });
        if (cancelled()) return;
        for (const id of targets) {
          const loc = located.get(id);
          locCacheRef.current.set(id, loc ? pointInCountry(countryToken, loc.latitude, loc.longitude) : null);
        }
      } else {
        for (let i = 0; i < targets.length; i++) {
          if (cancelled()) return;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(targets[i], { shouldDownloadFromNetwork: false });
            const loc = (info as { location?: { latitude: number; longitude: number } }).location;
            locCacheRef.current.set(targets[i], loc ? pointInCountry(countryToken, loc.latitude, loc.longitude) : null);
          } catch {
            locCacheRef.current.set(targets[i], null); // 조회 실패 → 제외하지 않음
          }
          if ((i + 1) % 10 === 0) setGeoProgress({ done: i + 1, total: targets.length });
        }
      }
      if (cancelled()) return;
      setGeoProgress(null);
      setGeoTick((v) => v + 1);
    })();
    return () => { geoScanToken.current++; setGeoProgress(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, gpsOnly, countryToken, photos.length]);

  // ── 선택 ──
  const toggle = (uri: string) => {
    const { next, atLimit } = toggleWithin(selected, uri, max);
    if (atLimit) {
      Alert.alert(t('newRecord.noticeTitle'), t('newRecord.maxPhotosN', { max }));
      return;
    }
    setSelected(next);
  };

  const visibleAllSelected = visiblePhotos.length > 0 && visiblePhotos.every((p) => selected.includes(p.uri));
  const toggleSelectVisible = () => {
    if (visiblePhotos.length === 0) return;
    const uris = visiblePhotos.map((p) => p.uri);
    if (visibleAllSelected) {
      setSelected(deselectAllWithin(selected, uris));
      return;
    }
    const { next, truncated } = selectAllWithin(selected, uris, max);
    setSelected(next);
    if (truncated) Alert.alert(t('newRecord.noticeTitle'), t('newRecord.maxPhotosN', { max }));
  };

  const [confirming, setConfirming] = useState(false);
  const confirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      // 선택분(≤상한)만 여기서 실제 경로를 받는다. iOS ph://는 localUri(file://)가 있어야 압축·복사가 되고,
      // 없으면 iCloud 오프로드 → assetId만 넘겨 호출부가 downloadCloudAssets(다운로드+진행률+취소)로 받는다.
      // ⚠️ 여기서 Alert를 띄우면 안 된다: onConfirm으로 시트(pageSheet)가 곧바로 닫히는데 iOS의
      //    Alert는 최상위 present VC에 붙어 시트와 함께 사라진다. 안내는 호출부(NewRecordScreen)에서.
      const chosen = selected.map((u) => photos.find((p) => p.uri === u)).filter((p): p is RangePhoto => !!p);
      const usable: string[] = [];
      const usableIds: string[] = [];
      const cloudAssetIds: string[] = [];
      for (const p of chosen) {
        if (Platform.OS === 'ios' && p.uri.startsWith('ph://')) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(p.id, { shouldDownloadFromNetwork: false });
            if (info.localUri) { usable.push(info.localUri); usableIds.push(p.id); }
            else cloudAssetIds.push(p.id);
          } catch {
            cloudAssetIds.push(p.id);
          }
        } else {
          usable.push(p.uri);
          usableIds.push(p.id);
        }
      }
      // 담기는 순서는 '기기에 있는 것 먼저, 받아 온 것 나중'이 된다(다운로드가 비동기라 순서 보장 불가).
      // assetIds는 [usable 순서대로의 id..., cloud id...] — 호출부가 uri↔id를 짝짓는 데 쓴다
      onConfirm(usable, cloudAssetIds, [...usableIds, ...cloudAssetIds]);
    } finally {
      setConfirming(false);
    }
  };

  // 포맷이 dayKey와 같아 보여도 dayKey를 쓰면 안 된다 — dayKey는 '촬영시각' 가드(ts<=0이면
  // 시각 없음으로 보고 null)를 달고 있고, 기간 경계는 로컬 자정이라 UTC+9에서 1970-01-01조차
  // 음수 ms다(-32400000). 그대로 넘기면 라벨이 'null ~ …'이 된다.
  const rangeLabel = useMemo(() => {
    const f = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    return range ? `${f(new Date(range.startMs))} ~ ${f(new Date(range.endMs))}` : '';
  }, [range]);

  const dayChipLabel = (key: string) => {
    const [, m, d] = key.split('.');
    return t('time.monthDay', { m: Number(m), d: Number(d) });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      // iOS 전용 — RN 0.81 Modal.js가 onDismiss를 iOS에서만 호출한다.
      // 시스템 선택기를 '시트가 실제로 닫힌 뒤' 띄우기 위한 신호 — 안드로이드는 호출부가 타이머로 폴백한다.
      onDismiss={onDismiss}
    >
      {/* pageSheet는 안드로이드에서 무시돼 전체화면이 되므로 상단 인셋을 직접 보정 */}
      <View style={[st.root, Platform.OS === 'android' && { paddingTop: insets.top }]} accessibilityViewIsModal>
        {/* 헤더 */}
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('album.closeA11y')}>
            <Text style={st.cancelTxt}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          {/* 제목은 좌우 버튼 폭에 밀리지 않게 절대 배치로 화면 가운데 고정 */}
          <View style={st.titleWrap} pointerEvents="none">
            <Text style={st.title}>{t('album.selectPhotos')}</Text>
          </View>
          {visiblePhotos.length > 0 ? (
            <TouchableOpacity onPress={toggleSelectVisible} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[st.selectAllTxt, { color: skinAccent.accent }]} {...andFitText}>
                {visibleAllSelected ? t('album.deselectAll') : dayFilter ? t('album.selectAllDay') : t('album.selectAll')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {/* 기간 + 담은 장수 */}
        <View style={[st.infoBar, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={st.infoTxt} numberOfLines={1}>{t('newRecord.rangePickerSub', { range: rangeLabel })}</Text>
          <Text style={[st.countTxt, { color: skinAccent.accent }]}>{selected.length}/{max}</Text>
        </View>

        {/* 국가(GPS) 필터 — 여행 전후 일상 사진을 걸러낸다. GPS 없는 사진은 항상 표시 */}
        {countryToken && (
          <View style={st.gpsRow}>
            <TouchableOpacity
              style={[st.gpsChip, gpsOnly && { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.15) }]}
              onPress={() => setGpsOnly((v) => !v)}
              activeOpacity={0.75}
            >
              <PinIcon size={12} color={gpsOnly ? skinAccent.accent : COLORS.textDim} />
              <Text style={[st.gpsChipTxt, gpsOnly && { color: skinAccent.accent }]}>
                {t('album.gpsOnly', { country: countryName })}
              </Text>
            </TouchableOpacity>
            {geoProgress && (
              <Text style={st.gpsProgress}>{t('album.gpsChecking', { done: geoProgress.done, total: geoProgress.total })}</Text>
            )}
          </View>
        )}

        {isLimited && <Text style={[st.limitedTxt, { color: skinAccent.accent }]}>{t('album.limitedTxt')}</Text>}

        {/* 일별 보기 필터 */}
        {days.length > 0 && (
          <View style={st.dayBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dayRow}>
              <TouchableOpacity
                style={[st.dayChip, dayFilter === null && { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.18) }]}
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
                    style={[st.dayChip, on && { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.18) }]}
                    onPress={() => setDayFilter(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[st.dayTxt, on && st.dayTxtOn]}>{dayChipLabel(d)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 격자 */}
        {loading ? (
          <View style={st.emptyWrap}><ActivityIndicator color={skinAccent.accent} size="large" /></View>
        ) : photos.length === 0 ? (
          <View style={st.emptyWrap}>
            <GalleryIcon size={40} color="#4A4A59" />
            <Text style={st.emptyTitle}>{t('album.emptyTitle')}</Text>
            <Text style={st.emptySub}>{t('album.emptySub')}</Text>
          </View>
        ) : (
          <FlatList
            data={visiblePhotos}
            keyExtractor={(p, i) => p.uri + i}
            numColumns={COL}
            contentContainerStyle={[st.gridContent, Platform.OS === 'android' && { paddingBottom: 140 + insets.bottom }]}
            columnWrapperStyle={{ gap: 8 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            initialNumToRender={15}
            maxToRenderPerBatch={15}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item, index }) => {
              const on = selected.includes(item.uri);
              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => toggle(item.uri)}
                  onLongPress={() => setPreviewIdx(index)} // 꾹 눌러 크게 보기 — 셀이 작아 비슷한 사진 구분이 어렵다
                  delayLongPress={300}
                  style={{ width: CELL, height: CELL }}
                >
                  {/* AssetImage(expo-image)는 ph://를 PHImageManager에 셀 크기로 요청해 바로 그린다.
                      iCloud 오프로드 여부는 목록에서 알 수 없고(알려면 장당 파일 조회) 확정 시 판별한다. */}
                  <AssetImage uri={item.uri} assetId={item.id} style={st.cell} />
                  <View style={[st.check, on && { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]}>
                    {on && <Text style={st.checkTxt}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* 하단: 담기 + 전체 사진첩으로 가는 보조 링크 */}
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <View style={[st.bottom, { paddingBottom: Platform.OS === 'ios' ? 24 : insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[st.confirmBtn, selected.length === 0 && st.confirmBtnDisabled]}
            onPress={() => { void confirm(); }}
            disabled={selected.length === 0 || confirming}
            activeOpacity={0.85}
          >
            <LinearGradient colors={skinAccent.btnGradient} style={st.confirmGrad}>
              <Text style={st.confirmTxt} {...andFitText}>
                {selected.length === 0
                  ? t('album.selectAtLeastOne')
                  : t('newRecord.rangePickerConfirm', { count: selected.length })}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSystemPicker} style={st.linkBtn} activeOpacity={0.7} accessibilityRole="button">
            <Text style={st.linkTxt}>{t('newRecord.rangePickerSystem')}</Text>
          </TouchableOpacity>
        </View>

        {/* 꾹 눌러 크게 보기 */}
        <PhotoViewerModal
          visible={previewIdx !== null}
          uris={visiblePhotos.map((p) => p.uri)}
          initialIndex={previewIdx ?? 0}
          onClose={() => setPreviewIdx(null)}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelTxt: { fontSize: 15, color: COLORS.textDim },
  // header의 paddingTop/Bottom(16/12)과 같은 값으로 채워 좌우 버튼과 세로 중심이 일치한다
  titleWrap: { position: 'absolute', left: 0, right: 0, top: 16, bottom: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  selectAllTxt: { fontSize: 13, fontWeight: '700', color: COLORS.purpleNeon },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(107,33,168,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  infoTxt: { flex: 1, fontSize: 13, color: COLORS.textDim },
  countTxt: { fontSize: 13, fontWeight: '700', color: COLORS.purpleNeon },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  gpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
  },
  gpsChipTxt: { fontSize: 12, color: COLORS.textDim },
  gpsProgress: { fontSize: 11, color: COLORS.textDim },
  limitedTxt: { fontSize: 12, paddingHorizontal: 16, paddingTop: 8, color: COLORS.purpleNeon },
  // 아래 여백: 격자가 스크롤돼 칩 바로 밑에 사진이 붙는 것을 막는다
  dayBar: { paddingTop: 10, paddingBottom: 12 },
  dayRow: { paddingHorizontal: 16, gap: 8 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
  },
  dayTxt: { fontSize: 12, color: COLORS.textDim },
  dayTxtOn: { color: COLORS.white, fontWeight: '700' },
  // 셀 폭이 Stage 폭(≤480)에서 나오므로 격자도 같은 폭으로 가둬야 넓은 화면에서 왼쪽으로 쏠리지 않는다
  gridContent: {
    padding: 16,
    paddingBottom: 140,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  cell: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: COLORS.card },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkTxt: { fontSize: 12, color: COLORS.white, fontWeight: 'bold' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  emptySub: { fontSize: 13, color: COLORS.textDim, textAlign: 'center' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.bg,
  },
  confirmBtn: { borderRadius: 14, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmGrad: { paddingVertical: 15, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  linkBtn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  linkTxt: { fontSize: 13, color: COLORS.textDim, textDecorationLine: 'underline' },
});
