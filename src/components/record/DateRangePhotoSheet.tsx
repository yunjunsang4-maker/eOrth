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
import { GalleryIcon, PinIcon, OutlineCalendarIcon } from '../icons';
import { SettingsHeader, SettingsPillButton, SettingsEmptyState } from '../settings/SettingsUI';
import { AutoPillRing } from './CalendarBottomSheet';
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
import { fetchPhotosInRange, type RangePhoto } from '../../utils/rangePhotoFetch';

// 재질·색은 최신 화면(사진첩 2026-11-03 시안·설정 계열 SettingsUI)과 같은 값 — 흰/흰50% 위주, 보라는 선택 표시에만
const COLORS = {
  bg: '#0A0A0F',
  divider: '#1A1A26',
  white: '#FFFFFF',
  text50: 'rgba(255,255,255,0.5)',
};
// 칩 채움 — SettingsUI CARD_FILL(#0A0A0F + 흰 3%를 미리 합성한 불투명색)과 같은 값. 그쪽은 export가 아니라 값만 맞춘다
const CARD_FILL = '#111116';

// 기간 전체를 한 번에 읽는 로직(1,000장 단위·상한 8,000·촬영시각 오름차순·목록 단계 변환 없음)은
// utils/rangePhotoFetch로 옮겼다 — 사진첩 만들기(AlbumCreateScreen)와 같이 쓴다.
const COL = 3;
const GRID_GAP = 3; // 사진첩 가로 줄(AlbumTimeline ROW_GAP)과 같은 간격

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
   *  assetIds: [uris 순서대로의 id..., cloudAssetIds...] — 재열기 시 '담김' 제외와 삭제 시 해제에 쓴다
   *  creationTimes: assetIds와 같은 순서의 촬영시각(목록 단계 creationTime, 없으면 undefined) — 선택적.
   *    사진첩(TripRecordScreen)이 getAssetInfoAsync 실패 시 폴백으로 쓴다(안드로이드는 ACCESS_MEDIA_LOCATION이
   *    없으면 getAssetInfo가 예외를 던진다). 기록 작성(NewRecordScreen)은 무시한다. */
  onConfirm: (uris: string[], cloudAssetIds: string[], assetIds: string[], creationTimes?: (number | undefined)[]) => void;
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
  // 사진첩처럼 좌우 여백 없이 3등분(floor — 3칸+간격이 폭을 넘어 줄바꿈되지 않게)
  const CELL = Math.floor((stageW - (COL - 1) * GRID_GAP) / COL);

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
  // 목록 단계는 변환 없음 — 장당 getAssetInfoAsync(15ms+, 오프로드면 더)는 확정 시 선택분만 돈다(utils/rangePhotoFetch).
  const fetchAll = useCallback(async (): Promise<RangePhoto[]> => (range ? fetchPhotosInRange(range) : []), [range]);

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
      const usableTimes: (number | undefined)[] = [];
      const cloudAssetIds: string[] = [];
      const cloudTimes: (number | undefined)[] = [];
      for (const p of chosen) {
        if (Platform.OS === 'ios' && p.uri.startsWith('ph://')) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(p.id, { shouldDownloadFromNetwork: false });
            if (info.localUri) { usable.push(info.localUri); usableIds.push(p.id); usableTimes.push(p.creationTime); }
            else { cloudAssetIds.push(p.id); cloudTimes.push(p.creationTime); }
          } catch {
            cloudAssetIds.push(p.id);
            cloudTimes.push(p.creationTime);
          }
        } else {
          usable.push(p.uri);
          usableIds.push(p.id);
          usableTimes.push(p.creationTime);
        }
      }
      // 담기는 순서는 '기기에 있는 것 먼저, 받아 온 것 나중'이 된다(다운로드가 비동기라 순서 보장 불가).
      // assetIds는 [usable 순서대로의 id..., cloud id...] — 호출부가 uri↔id를 짝짓는 데 쓴다. 시각도 같은 순서
      onConfirm(usable, cloudAssetIds, [...usableIds, ...cloudAssetIds], [...usableTimes, ...cloudTimes]);
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

  // 하단 영역 아래 여백 — 안드로이드는 모달이 내비바 아래까지 확장돼 인셋을 직접 더한다
  const bottomPad = Platform.OS === 'ios' ? 24 : insets.bottom + 16;
  // 선택 알약·'전체 사진첩' 줄은 고정 높이 — 격자 마지막 줄이 하단 영역·페이드에 가리지 않게 그만큼 띄운다
  const gridPadBottom = FADE_H + BOTTOM_TOP + PILL_H + LINK_H + bottomPad;

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
        {/* 헤더 — 설정 계열 공용(SettingsHeader: 유리 뒤로 chevron · 가운데 제목 · 오른쪽 슬롯, 아래 0.8 흰15% 선).
            오른쪽은 보이는 사진이 있을 때만 작은 알약으로 전체 선택/해제 */}
        <View style={st.headerWrap}>
          <SettingsHeader
            title={t('album.selectPhotos')}
            onBack={onClose}
            backA11yLabel={t('album.closeA11y')}
            right={visiblePhotos.length > 0 ? (
              <SettingsPillButton
                compact
                label={visibleAllSelected ? t('album.deselectAll') : dayFilter ? t('album.selectAllDay') : t('album.selectAll')}
                onPress={toggleSelectVisible}
              />
            ) : undefined}
          />
        </View>

        {/* 기간 + 담은 장수 — 사진첩 화면 정보 줄(TripRecordScreen albumInfo)과 같은 틀: 높이 52, 달력 + 기간, 오른쪽 장수.
            위 선은 SettingsHeader의 아래 선이 맡는다(같은 0.8 흰15% — 둘 다 그리면 겹선) */}
        <View style={st.info}>
          <OutlineCalendarIcon size={12} color="rgba(255,255,255,0.6)" />
          <Text style={st.infoTxt} numberOfLines={1}>{t('newRecord.rangePickerSub', { range: rangeLabel })}</Text>
          {/* 담은 게 있으면 숫자만 흰 100%로 — 최신 화면은 흰/흰50% 위주라 보라를 쓰지 않는다 */}
          <Text style={[st.countTxt, selected.length > 0 && st.countTxtOn]} numberOfLines={1}>{selected.length}/{max}</Text>
        </View>

        {/* 국가(GPS) 필터 — 여행 전후 일상 사진을 걸러낸다. GPS 없는 사진은 항상 표시 */}
        {countryToken && (
          <View style={st.gpsRow}>
            <TouchableOpacity
              style={[st.chip, st.gpsChip, gpsOnly && { backgroundColor: skinAccent.tint(0.2) }]}
              onPress={() => setGpsOnly((v) => !v)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: gpsOnly }}
            >
              <AutoPillRing />
              {/* 핀 Svg가 터치를 삼키지 않게 View(pointerEvents none)로 감싼다(RNSVG 새 아키텍처 함정) */}
              <View pointerEvents="none">
                <PinIcon size={12} color={gpsOnly ? '#FFFFFF' : 'rgba(255,255,255,0.5)'} />
              </View>
              <Text style={[st.chipTxt, gpsOnly && st.chipTxtOn, st.gpsChipTxt]} numberOfLines={1}>
                {t('album.gpsOnly', { country: countryName })}
              </Text>
            </TouchableOpacity>
            {geoProgress && (
              <Text style={st.hintTxt} numberOfLines={1}>{t('album.gpsChecking', { done: geoProgress.done, total: geoProgress.total })}</Text>
            )}
          </View>
        )}

        {isLimited && <Text style={[st.hintTxt, st.limitedTxt]}>{t('album.limitedTxt')}</Text>}

        {/* 일별 보기 필터 — 알약 재질(설정 카드와 같은 #111116 채움 + 공용 유리 링). 선택 = 흰 굵은 글자 + 스킨 틴트 채움 */}
        {days.length > 0 && (
          <View style={st.dayBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dayRow}>
              {[null, ...days].map((d) => {
                const on = dayFilter === d;
                return (
                  <TouchableOpacity
                    key={d ?? 'all'}
                    style={[st.chip, on && { backgroundColor: skinAccent.tint(0.2) }]}
                    onPress={() => setDayFilter(d)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <AutoPillRing />
                    <Text style={[st.chipTxt, on && st.chipTxtOn]} numberOfLines={1}>{d ? dayChipLabel(d) : t('album.all')}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 격자 — 사진첩 화면처럼 좌우 여백 없이 3등분, 간격 3·모서리 0 */}
        {loading ? (
          <View style={st.emptyWrap}><ActivityIndicator color={skinAccent.accent} size="large" /></View>
        ) : photos.length === 0 ? (
          <View style={st.emptyWrap}>
            <SettingsEmptyState
              icon={<GalleryIcon size={40} color="rgba(255,255,255,0.3)" />}
              title={t('album.emptyTitle')}
              desc={t('album.emptySub')}
            />
          </View>
        ) : (
          <FlatList
            data={visiblePhotos}
            keyExtractor={(p, i) => p.uri + i}
            numColumns={COL}
            contentContainerStyle={[st.gridContent, { paddingBottom: gridPadBottom }]}
            columnWrapperStyle={{ gap: GRID_GAP }}
            ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
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
                  accessibilityState={{ selected: on }}
                >
                  {/* AssetImage(expo-image)는 ph://를 PHImageManager에 셀 크기로 요청해 바로 그린다.
                      iCloud 오프로드 여부는 목록에서 알 수 없고(알려면 장당 파일 조회) 확정 시 판별한다. */}
                  <AssetImage uri={item.uri} assetId={item.id} style={st.cell} />
                  {/* 선택 표시 — 사진첩 선택 모드(AlbumTimeline selOverlay·selCheck)와 같은 모양. 안 고른 칸은 덮개 없이 빈 원만 */}
                  <View pointerEvents="none" style={[st.selOverlay, on && st.selOverlayOn]}>
                    <View style={[st.selCheck, on && st.selCheckOn]}>
                      {on && <Text style={st.selCheckTxt}>✓</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* 하단: 담기 알약 + 전체 사진첩으로 가는 보조 글자 버튼. 구분선 대신 위쪽 페이드로 격자와 나눈다 */}
        {/* 페이드는 하단 영역 안의 맨 위 칸으로 둔다 — 부모 밖(top 음수)에 그리면 안드로이드에서 잘릴 수 있다.
            페이드 칸은 터치를 아래 격자로 넘긴다(box-none + 그라데이션 pointerEvents none) */}
        <View style={st.bottom} pointerEvents="box-none">
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(10,10,15,0)', COLORS.bg]}
            style={st.bottomFade}
          />
          <View style={[st.bottomBody, { paddingBottom: bottomPad }]}>
            <SettingsPillButton
              label={selected.length === 0
                ? t('album.selectAtLeastOne')
                : t('newRecord.rangePickerConfirm', { count: selected.length })}
              onPress={() => { void confirm(); }}
              disabled={selected.length === 0 || confirming}
            />
            <TouchableOpacity
              onPress={onOpenSystemPicker}
              style={st.linkBtn}
              hitSlop={{ top: 4, bottom: 8, left: 16, right: 16 }}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={st.linkTxt} numberOfLines={1}>{t('newRecord.rangePickerSystem')}</Text>
            </TouchableOpacity>
          </View>
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

// 하단 영역 고정 치수 — 격자 paddingBottom(gridPadBottom) 계산에 같이 쓴다
const FADE_H = 24;     // 하단 영역 위 페이드
const BOTTOM_TOP = 8;  // 하단 영역 위 여백(페이드 아래)
const PILL_H = 60;     // SettingsPillButton 기본 높이
const LINK_H = 44;     // '전체 사진첩에서 고르기' 줄(13 글자 + 위아래 여백, 터치 44)

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  // pageSheet 위 손잡이 자리와 붙지 않게 살짝 띄운다(예전 헤더 paddingTop 16과 비슷한 높이)
  headerWrap: { paddingTop: 12 },
  // 사진첩 화면 albumInfo와 같은 값 — 위 선은 헤더 선이 맡는다
  info: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoTxt: { flex: 1, fontSize: 13, color: COLORS.text50 },
  countTxt: { fontSize: 13, color: COLORS.text50 },
  countTxtOn: { color: COLORS.white, fontWeight: '600' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  // 알약 칩 — 채움 #111116(설정 카드 CARD_FILL) + AutoPillRing(실측 숫자 크기 — 안드로이드 RNSVG % 크기 갱신 함정).
  // AutoPillRing이 부모 실측에 기대므로 칩에 borderWidth·overflow hidden을 주지 않는다(링이 1px 밀리거나 잘림)
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CARD_FILL,
  },
  gpsChip: { flexShrink: 1 },
  chipTxt: { fontSize: 13, color: COLORS.text50 },
  chipTxtOn: { color: COLORS.white, fontWeight: '700' },
  gpsChipTxt: { flexShrink: 1 },
  // 진행·제한 안내 — 보조 글자는 12 흰50%
  hintTxt: { flexShrink: 1, fontSize: 12, color: COLORS.text50 },
  limitedTxt: { paddingHorizontal: 16, paddingTop: 10 },
  // 아래 여백: 격자가 스크롤돼 칩 바로 밑에 사진이 붙는 것을 막는다
  dayBar: { paddingTop: 12, paddingBottom: 12 },
  dayRow: { paddingHorizontal: 16, gap: 8 },
  // 셀 폭이 Stage 폭(≤480)에서 나오므로 격자도 같은 폭으로 가둬야 넓은 화면에서 왼쪽으로 쏠리지 않는다
  gridContent: {
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  // 로딩 칸 색 — 사진첩 격자의 #D9D9D9는 검은 피커에서 번쩍여 과하다. 구분선 토큰으로 어둡게
  cell: { width: '100%', height: '100%', backgroundColor: COLORS.divider },
  // AlbumTimeline 선택 모드 값 복사(selOverlay·selCheck) — 안 고른 칸은 덮개 없음
  selOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end' },
  selOverlayOn: { backgroundColor: 'rgba(107,33,168,0.35)' },
  selCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCheckOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  selCheckTxt: { fontSize: 13, fontWeight: '800', color: COLORS.white, lineHeight: 15 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // 투명 → 배경 페이드 — 구분선 대신 격자가 자연스럽게 사라지게
  bottomFade: { height: FADE_H },
  bottomBody: { paddingHorizontal: 16, paddingTop: BOTTOM_TOP, backgroundColor: COLORS.bg },
  linkBtn: { height: LINK_H, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  linkTxt: { fontSize: 13, color: COLORS.text50 },
});
