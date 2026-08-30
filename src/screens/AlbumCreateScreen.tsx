import { select, success } from '../utils/haptics';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { GlassButton } from '../components/ui';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { getMaxAlbumPhotos } from '../constants/limits';
import { copyTripOriginals, bakeCoverCrop, type PhotoRef } from '../utils/importPhotoStore';
import { groupUrisByDay, newSectionId } from '../utils/albumSections';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';
import CutPhotoAdjustModal, { AdjustedCoverImage, type CutTransform } from '../components/CutPhotoAdjustModal';
// 공용 달력은 components/record에서 직접 가져온다 — 예전엔 NewRecordScreen의 재수출을 거쳐
// 화면 하나가 다른 화면 모듈 전체를 끌고 들어왔다.
import { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';
import { DateRangeField } from '../components/record/DateRangeField';
import { COUNTRIES, type Country, CONTINENT_ORDER } from '../constants/countries';
import { SearchIcon, AlbumIcon, PinIcon, GalleryIcon, LockClosedIcon } from '../components/icons';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { collectRecordedDateKeys, collectRecordedRanges } from '../utils/recordedDates';
import PhotoViewerModal from '../components/PhotoViewerModal';
import { getCountryFeature, pointInCountry } from '../utils/photoCountryFilter';
import { KO_TO_EN } from './MainScreen';
import { countryLabel, continentLabel } from '../utils/countryLabel';
import { useStageWidth, STAGE_MAX_W } from '../utils/stage';

// 사진첩 한 권당 최대 장수는 constants/limits.ts(getMaxAlbumPhotos) — 무료 100 / 프리미엄 200
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

// 'YYYY.MM.DD' / 'YYYY-MM-DD' → 로컬 자정 Date.
// new Date('YYYY-MM-DD')는 UTC 자정으로 읽혀 미주 등에서 하루 밀리므로 직접 파싱한다.
const parseAlbumDate = (s?: string): Date | null => {
  const m = s?.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

// 사진첩 액센트 — 여행기록카드에서 사진첩을 나타내는 주황과 같은 값
// (TripDetailScreen COLORS.albumAccent). 두 화면에서 같은 것을 가리키므로 색도 같게 둔다.
const ALBUM_ACCENT = '#FFA657';

const COL = 3;
const CARD_H = 180;
// CELL/CARD_W는 폭에서 파생되므로 컴포넌트 본문에서 useStageWidth()로 계산한다(아래).
// 모듈 최상위 stageWidthNow()로 박제하면 접힌 채(360dp) 시작해 펼쳤을 때
// (시트·화면은 480dp로 클램프) 3열 그리드가 360dp 폭에 머물러 약 100dp가 빈다.

/** 체크 표시 — '✓' 문자는 폰트마다 두께·크기가 달라 SVG로 그린다 */
function CheckMark({ size = 13, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath d="M20 6L9 17l-5-5" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function AlbumCreateScreen({ navigation, route }: RootStackScreenProps<'AlbumCreate'>) {
  const { t, i18n } = useTranslation();
  const stageW = useStageWidth();
  const CELL = Math.floor((stageW - 16 * 2 - 8 * (COL - 1)) / COL);
  // 미리보기 카드 크기 — 위치 조정과 실제 크롭이 같은 비율을 쓰도록 공유
  const CARD_W = stageW - 40; // 시트 좌우 패딩 20×2
  const CARD_ASPECT = CARD_W / CARD_H;
  const skinAccent = useSkinAccent(); // 선택 상태·카운터 등 강조를 스킨색으로
  const insets = useSafeAreaInsets();
  const { addImportedAlbum, addTripGroup, tripGroups, updateTripGroup, updateRecord, records } = useRecords();
  // 사진첩 사진 상한 — 무료 100장 / 프리미엄 200장 (constants/limits.ts getMaxAlbumPhotos)
  const { isPremium } = useSettings();
  const albumMax = getMaxAlbumPhotos(isPremium);

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

  // 선택 국가에 이미 기록된 날짜 — 기간 캘린더에 점으로 표시해 기존 여행에 맞춰 기간을 잡기 쉽게
  const recordedDates = useMemo(
    () => collectRecordedDateKeys(records, selectedCountry ? [selectedCountry.name] : []),
    [records, selectedCountry]
  );
  // 기존 여행 기간 — 국가 구별 없이 전체를 캡슐 밴드로 표시 (피드 기록과 동일 규칙)
  const recordedRanges = useMemo(() => collectRecordedRanges(records), [records]);

  // ── 같은 여행에 사진첩을 두 번 만드는 것 방지 ──
  // 기간이 하루라도 겹치고 국기가 같은 기존 사진첩을 찾는다. 사진첩은 지구본·통계에서 빠지도록
  // countryName을 비워 두므로(아래 save 주석 참조) 국가 비교는 countryFlag로만 가능하다.
  const overlappingAlbum = useMemo(() => {
    if (!selectedCountry?.flag) return null;
    const s = startDate.getTime();
    const e = endDate.getTime();
    return (
      records.find((r) => {
        if (r.viewType !== 'album' || r.countryFlag !== selectedCountry.flag) return false;
        const rs = parseAlbumDate(r.startDate)?.getTime();
        if (rs == null) return false;
        const re = parseAlbumDate(r.endDate)?.getTime() ?? rs;
        return rs <= e && re >= s; // 하루라도 겹치면 같은 여행으로 본다
      }) ?? null
    );
  }, [records, selectedCountry, startDate, endDate]);

  // 사진첩은 여행 카드당 하나(TripDetailScreen과 동일 정책)라, 겹치는 사진첩이 있으면
  // 선택지 없이 그 사진첩에 이어 담는다. '새로 만들기'는 제공하지 않는다.
  const appendTarget = overlappingAlbum;

  // 이어 담기 모드에서 이미 그 사진첩에 들어간 원본 assetId — 목록에서 빼 중복 추가를 막는다
  const appendedAssetIds = useMemo(() => {
    if (!appendTarget) return null;
    return new Set(Object.values(appendTarget.mediaAssetIds ?? {}));
  }, [appendTarget]);

  // 이번에 고를 수 있는 장수 — 이어 담기면 기존 장수를 뺀 '총량' 기준이어야 상한을 넘지 않는다
  // (TripRecordScreen의 사진 추가와 동일 규칙: albumMax - 기존 장수)
  const existingCount = appendTarget?.medias?.length ?? 0;
  const selectableMax = Math.max(0, albumMax - existingCount);

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

  // 꾹 눌러 크게 미리보기 — 셀이 작아 비슷한 사진 구분이 어려운 문제 보완
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // ── "이 국가에서 찍은 사진만" GPS 필터 ──
  // 세계 GeoJSON 오프라인 판정 — GPS 없는 사진(판정 null)은 항상 표시해 놓치지 않게 한다
  const countryFeature = useMemo(() => {
    if (!selectedCountry) return null;
    const en = selectedCountry.name === '대한민국' ? 'South Korea' : KO_TO_EN[selectedCountry.name];
    return en ? getCountryFeature(en) : null;
  }, [selectedCountry]);
  const [gpsOnly, setGpsOnly] = useState(false);
  const [geoProgress, setGeoProgress] = useState<{ done: number; total: number } | null>(null);
  const locCacheRef = useRef<Map<string, boolean | null>>(new Map()); // assetId → 국가 안 여부(null=GPS 없음)
  const geoScanToken = useRef(0);
  useEffect(() => () => { geoScanToken.current++; }, []); // 언마운트 시 진행 중 스캔 중단

  // 미리보기(제목 + 썸네일)
  const [previewVisible, setPreviewVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 저장 중복 실행 방지 — setSaving(state)은 다음 렌더에야 반영돼 같은 프레임의 이중 탭을 못 막는다
  // (NewRecordScreen의 savingRef 패턴). 사진첩·여행 카드가 두 벌 생기는 것을 막는다.
  const savingRef = useRef(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null); // 사진 복사 진행(n/총)

  // 썸네일 위치 조정 — 어떤 사진에 대한 조정값인지 uri로 묶어 커버가 바뀌면 무시되게 한다
  const [coverAdjust, setCoverAdjust] = useState<{ uri: string; t: CutTransform } | null>(null);
  const [adjustVisible, setAdjustVisible] = useState(false);

  const cover = coverUri && selected.includes(coverUri) ? coverUri : selected[0];
  const activeAdjust = coverAdjust && coverAdjust.uri === cover ? coverAdjust.t : null;

  // 캘린더에서 기존 여행 밴드를 탭하면 그 여행의 국가·기간을 폼에 채운다 (사진첩은 국가 1개)
  const applySourceRecord = (recordId: string, start: Date, end: Date) => {
    const src = records.find(r => r.id === recordId);
    if (!src) return;
    const srcName = src.countries?.[0]?.name ?? src.countryName;
    const matched = COUNTRIES.find(c => c.name === srcName);
    if (matched) setSelectedCountry(matched);
    setStartDate(start);
    setEndDate(end);
    setCalendarVisible(false);
  };

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
    if (selected.length >= selectableMax) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
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

  // 이어 담기 모드: 그 사진첩에 이미 들어간 사진은 목록에서 뺀다
  const notAppended = appendedAssetIds
    ? photos.filter((p) => !(p.id && appendedAssetIds.has(p.id)))
    : photos;
  // 사진이 있는 날짜 목록(시간순). 선택은 uri 기준이라 필터와 무관하게 유지된다.
  const days = Array.from(
    new Set(notAppended.map((p) => dayKey(p.creationTime)).filter((k): k is string => k !== null))
  ).sort();
  const byDay = dayFilter
    ? notAppended.filter((p) => dayKey(p.creationTime) === dayFilter)
    : notAppended;
  // GPS 필터 — 국가 밖으로 '판정된' 사진만 제외 (미판정·GPS 없음은 표시)
  const visiblePhotos = gpsOnly && countryFeature
    ? byDay.filter((p) => (p.id ? locCacheRef.current.get(p.id) !== false : true))
    : byDay;

  // GPS 필터 켜짐/사진 추가 로드 시 — 아직 판정 안 된 사진의 위치를 순차 판정 (오프라인, 취소 가능)
  useEffect(() => {
    if (!gpsOnly || !countryFeature) return;
    const targets = photos.filter((p) => p.id && !locCacheRef.current.has(p.id));
    if (targets.length === 0) return;
    const token = ++geoScanToken.current;
    let cancelled = false;
    (async () => {
      setGeoProgress({ done: 0, total: targets.length });
      for (let i = 0; i < targets.length; i++) {
        if (geoScanToken.current !== token) { cancelled = true; break; }
        const p = targets[i];
        try {
          const info = await MediaLibrary.getAssetInfoAsync(p.id!, { shouldDownloadFromNetwork: false });
          const loc = (info as { location?: { latitude: number; longitude: number } }).location;
          locCacheRef.current.set(p.id!, loc ? pointInCountry(countryFeature, loc.latitude, loc.longitude) : null);
        } catch {
          locCacheRef.current.set(p.id!, null); // 정보 조회 실패 → 제외하지 않음
        }
        if ((i + 1) % 10 === 0) setGeoProgress({ done: i + 1, total: targets.length });
      }
      if (!cancelled && geoScanToken.current === token) setGeoProgress(null);
    })();
    return () => { geoScanToken.current++; setGeoProgress(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsOnly, countryFeature, photos.length]);

  // 표시된 사진(현재 Day 필터 기준) 전체 선택/해제 — 상한 도달 시 담을 수 있는 만큼만 담고 안내
  const visibleAllSelected = visiblePhotos.length > 0 && visiblePhotos.every((p) => selected.includes(p.uri));
  const toggleSelectVisible = () => {
    if (visiblePhotos.length === 0) return;
    if (visibleAllSelected) {
      const vis = new Set(visiblePhotos.map((p) => p.uri));
      setSelected((prev) => prev.filter((u) => !vis.has(u)));
      return;
    }
    const next = [...selected];
    for (const p of visiblePhotos) {
      if (next.length >= selectableMax) break;
      if (!next.includes(p.uri)) next.push(p.uri);
    }
    setSelected(next);
    if (visiblePhotos.some((p) => !next.includes(p.uri))) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
    }
  };

  // ── 저장: 사진첩 기록(album, private) + 프로필 여행기록카드만 생성 ──
  // 국가 필드를 비워 소셜·지구본·대륙·통계 국가 카운트에 잡히지 않게 한다.
  const save = async () => {
    if (savingRef.current) return; // 이중 탭 방지 (성공 시 replace로 화면을 떠나므로 해제하지 않는다)
    savingRef.current = true;
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
      setSaveProgress({ done: 0, total: items.length });
      const { uris: copied, firstItemCopied, srcIndexes } = await copyTripOriginals(albumId, items, (done, total) => setSaveProgress({ done, total }));
      if (copied.length === 0) throw new Error('copy failed');
      // iCloud 오프로드 등으로 복사에 실패한 장수 — 조용히 빠지면 "사진이 왜 없지" 혼란이 생긴다
      const failCount = items.length - copied.length;
      // 복사본 uri → 원본 assetId/촬영시각 — 중복 추가 방지·'일자별로 다시 구성'에 쓴다
      const mediaAssetIds: Record<string, string> = {};
      const mediaTimes: Record<string, number> = {};
      copied.forEach((uri, k) => {
        const src = items[srcIndexes[k]] as AlbumPhoto | undefined;
        if (src?.id) mediaAssetIds[uri] = src.id;
        if (src?.creationTime) mediaTimes[uri] = src.creationTime;
      });
      // 위치 조정값이 있으면 보이는 영역만 실제 크롭해 카드 썸네일 전용본으로 저장.
      // 커버(0번) 복사가 실패했으면 copied[0]은 다른 사진이므로 크롭을 굽지 않는다.
      let repUri: string | undefined;
      if (activeAdjust && firstItemCopied) {
        repUri = (await bakeCoverCrop(copied[0], activeAdjust, CARD_ASPECT, albumId)) ?? undefined;
      }
      const albumTitle = title.trim() || defaultTitle;
      // 날짜별 자동 섹션 — 촬영일이 2일 이상이면 'n일차' 섹션으로 자동 정리 (미상은 '기타')
      const pairs = copied.map((uri, k) => ({ uri, time: (items[srcIndexes[k]] as AlbumPhoto | undefined)?.creationTime }));
      const groups = groupUrisByDay(pairs);
      let mediasOrdered = copied;
      let autoSections: { id: string; title: string; count: number }[] | undefined;
      if (groups.filter((g) => g.key !== null).length >= 2) {
        mediasOrdered = groups.flatMap((g) => g.uris);
        let dayN = 0;
        autoSections = groups.map((g) => ({
          id: newSectionId(),
          title: g.key ? t('comp.sectionDayN', { n: ++dayN }) : t('comp.sectionEtc'),
          count: g.uris.length,
        }));
      }

      // ── 이어 담기: 새 카드를 만들지 않고 기존 사진첩 뒤에 사진만 붙인다 ──
      // 기존 순서와 albumSections는 건드리지 않는다. 섹션은 TripRecordScreen에서 사용자가
      // 이름을 바꾸거나 사진을 옮길 수 있는 값이라, 여기서 다시 짜면 정리해 둔 게 날아간다.
      // 늘어난 장수는 normalizeSections가 마지막 섹션으로 흡수하므로 렌더도 어긋나지 않고,
      // 날짜별로 다시 묶고 싶으면 사진첩 화면의 '일자별로 다시 구성'을 쓰면 된다.
      if (appendTarget) {
        const mergedStart = [appendTarget.startDate, fmtDate(startDate)]
          .map(parseAlbumDate).filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0];
        const mergedEnd = [appendTarget.endDate, fmtDate(endDate)]
          .map(parseAlbumDate).filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0];
        const merged = {
          medias: [...(appendTarget.medias ?? []), ...copied],
          mediaAssetIds: { ...(appendTarget.mediaAssetIds ?? {}), ...mediaAssetIds },
          mediaTimes: { ...(appendTarget.mediaTimes ?? {}), ...mediaTimes },
          // 담은 사진의 촬영일이 기존 기간 밖일 수 있어 기간을 합집합으로 넓힌다
          startDate: mergedStart ? fmtDate(mergedStart) : appendTarget.startDate,
          endDate: mergedEnd ? fmtDate(mergedEnd) : appendTarget.endDate,
        };
        updateRecord(appendTarget.id, merged);
        success(); // 기존 사진첩에 이어 담기 완료 — 신규 생성과 같은 완료 신호를 준다
        if (failCount > 0) {
          Alert.alert(t('album.noticeTitle'), t('album.icloudSkipped', { count: failCount }));
        }
        navigation.replace('TripRecord', { record: { ...appendTarget, ...merged }, viewType: 'album' });
        return;
      }

      const newRec = addImportedAlbum({
        // countryName/country는 비워둔다 — 채우면 지구본·대륙 활성화와 통계,
        // 다른 국가 카드의 기록 매칭에 잡힌다. 국기는 카드 표시 전용.
        country: '', countryName: '', countryFlag: selectedCountry?.flag || '',
        date: fmtDate(startDate),
        startDate: fmtDate(startDate),
        endDate: fmtDate(endDate),
        title: albumTitle,
        medias: mediasOrdered,
        // 날짜 정렬로 medias[0]이 커버가 아닐 수 있으므로 카드 썸네일용 대표를 명시
        representativePhoto: repUri ?? (firstItemCopied ? copied[0] : undefined),
        albumSections: autoSections,
        mediaAssetIds,
        mediaTimes,
      });
      if (tripGroupId) {
        // 여행 상세에서 진입 — 그 여행 카드에 사진첩을 연결(카드당 앨범 1개 정책)
        const g = tripGroups.find((x) => x.id === tripGroupId);
        if (g && !g.records.includes(newRec.id)) updateTripGroup(tripGroupId, { records: [...g.records, newRec.id] });
        else if (!g) addTripGroup({ title: albumTitle, records: [newRec.id], coverRecordId: newRec.id });
      } else {
        addTripGroup({ title: albumTitle, records: [newRec.id], coverRecordId: newRec.id });
      }
      if (failCount > 0) {
        Alert.alert(t('album.noticeTitle'), t('album.icloudSkipped', { count: failCount }));
      }
      success(); // 사진첩 생성 완료
      // 저장 직후 만든 사진첩을 바로 보여준다 — 프로필에서 카드를 다시 찾아 들어가는 수고 제거
      navigation.replace('TripRecord', { record: newRec, viewType: 'album' });
    } catch {
      savingRef.current = false; // 실패했을 때만 재시도 허용
      setSaving(false);
      setSaveProgress(null);
      Alert.alert(t('album.saveFailTitle'), t('album.saveFailMsg'));
    }
  };

  if (saving) {
    return (
      <LinearGradient colors={['#0A0A0F', '#100620']} style={st.center}>
        <ActivityIndicator color={skinAccent.accent} size="large" />
        <Text style={st.savingText}>
          {saveProgress && saveProgress.total > 0
            ? t('album.savingN', { done: saveProgress.done, total: saveProgress.total })
            : t('album.saving')}
        </Text>
      </LinearGradient>
    );
  }

  // ── 1단계: 기간 설정 ──
  if (phase === 'setup') {
    return (
      <LinearGradient colors={['#0A0A0F', '#100620']} style={st.container}>
        <View style={[st.header, { paddingTop: insets.top + 24 }]}>
          <TouchableOpacity style={[st.closeBtn, { top: insets.top + 18 }]} onPress={() => navigation.goBack()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('album.closeA11y')}>
            <Text style={st.closeTxt}>✕</Text>
          </TouchableOpacity>
          <View style={st.titleRow}>
            <AlbumIcon size={22} color={skinAccent.accent} />
            <Text style={st.title}>{t('comp2.albumCreateTitle')}</Text>
          </View>
          <Text style={st.sub}>{t('album.sub', { max: albumMax })}</Text>
        </View>

        <ScrollView style={st.setupBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={st.fieldLabel}>{t('album.country')}</Text>

          {/* 선택된 국가 칩 */}
          {selectedCountry && (
            <View style={st.selectedChipsWrap}>
              <View style={[st.countryChip, { backgroundColor: skinAccent.tint(0.18), borderColor: skinAccent.accent }]}>
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
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
                      <Text style={[st.continentHeader, { color: skinAccent.accent }]}>{continentLabel(continent, i18n.language)}</Text>
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
                            <Text style={[st.countryName, isSelected && [st.countryNameSelected, { color: skinAccent.accent }]]}>{countryLabel(c.name, i18n.language)}</Text>
                            {isSelected && (
                              <View style={st.countryCheckMark}>
                                <CheckMark size={16} color={skinAccent.accent} />
                              </View>
                            )}
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
          <DateRangeField
            startLabel={t('album.startLabel')}
            startValue={fmtDate(startDate)}
            endLabel={t('album.endLabel')}
            endValue={fmtDate(endDate)}
            onPress={() => setCalendarVisible(true)}
          />

          {/* 같은 기간·같은 국가에 사진첩이 이미 있으면 그 사진첩에 이어 담는다(카드당 사진첩 1개) */}
          {overlappingAlbum && (
            <View style={st.dupBox}>
              <View style={st.dupHeadRow}>
                <AlbumIcon size={14} color={ALBUM_ACCENT} />
                <Text style={st.dupHead}>{t('album.dupTitle')}</Text>
              </View>
              <Text style={st.dupName} numberOfLines={1}>
                {overlappingAlbum.countryFlag} {overlappingAlbum.content}
              </Text>
              <Text style={st.dupMeta}>
                {overlappingAlbum.startDate} ~ {overlappingAlbum.endDate}
                {'  ·  '}
                {t('album.dupPhotoCount', { count: overlappingAlbum.medias?.length ?? 0 })}
              </Text>
              <Text style={st.dupHint}>{t('album.dupAppendHint')}</Text>
            </View>
          )}

          {/* 앱 기본 버튼(온보딩 '다음' 유리 필 디자인) — GlassButton */}
          <GlassButton
            label={appendTarget ? t('album.loadPhotosAppend') : t('album.loadPhotos')}
            onPress={startLoad}
            disabled={loading}
            loading={loading}
            style={{ marginTop: 24 }}
          />

          {/* 자물쇠는 문구에 이모지로 박지 않고 아이콘으로 — 아이콘+문구를 묶어 박스 가운데 정렬 */}
          <View style={[st.noteBox, { backgroundColor: skinAccent.tint(0.08), borderColor: skinAccent.tint(0.2) }]}>
            <LockClosedIcon size={14} color={skinAccent.accent} />
            <Text style={[st.noteTxt, { color: skinAccent.accent }]}>
              {t('album.privacyNotice')}
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
          recordedDates={recordedDates}
          recordedRanges={recordedRanges}
          onSelectRecordedTrip={applySourceRecord}
        />
      </LinearGradient>
    );
  }

  // ── 2단계: 사진 선택 ──
  return (
    <LinearGradient colors={['#0A0A0F', '#100620']} style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 24 }]}>
        <TouchableOpacity style={[st.backBtn, { top: insets.top + 18 }]} onPress={() => setPhase('setup')} activeOpacity={0.8}>
          <Text style={st.closeTxt}>←</Text>
        </TouchableOpacity>
        <Text style={[st.title, st.titleIndented]}>{t('album.selectPhotos')}</Text>
        <Text style={st.sub}>{t('album.selectPhotosDateSub', { range: `${fmtDate(startDate)} ~ ${fmtDate(endDate)}` })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* 이어 담기면 남은 자리(총량 - 기존 장수)를 분모로 — 상한 판정과 같은 수를 보여준다 */}
          <Text style={[st.counter, { color: skinAccent.accent }]}>{selected.length} / {selectableMax}</Text>
          {visiblePhotos.length > 0 && (
            <TouchableOpacity onPress={toggleSelectVisible} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[st.selectAllTxt, { color: skinAccent.accent }]}>
                {visibleAllSelected
                  ? t('album.deselectAll')
                  : dayFilter ? t('album.selectAllDay') : t('album.selectAll')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* 국가(GPS) 필터 — 여행 전후 일상 사진을 걸러낸다. GPS 없는 사진은 항상 표시 */}
        {countryFeature && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={[st.gpsChip, gpsOnly && { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.15) }]}
              onPress={() => setGpsOnly((v) => !v)}
              activeOpacity={0.75}
            >
              <PinIcon size={12} color={gpsOnly ? skinAccent.accent : '#A1A1B0'} />
              <Text style={[st.gpsChipTxt, gpsOnly && { color: skinAccent.accent }]}>
                {t('album.gpsOnly', { country: selectedCountry?.name })}
              </Text>
            </TouchableOpacity>
            {geoProgress && (
              <Text style={st.gpsProgress}>{t('album.gpsChecking', { done: geoProgress.done, total: geoProgress.total })}</Text>
            )}
          </View>
        )}
        {isLimited && (
          <Text style={[st.limitedTxt, { color: skinAccent.accent }]}>{t('album.limitedTxt')}</Text>
        )}
      </View>

      {/* 일별 보기 필터 */}
      {days.length > 0 && (
        <View style={st.dayBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dayRow}>
            <TouchableOpacity
              style={[st.dayChip, dayFilter === null && [st.dayChipOn, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.18) }]]}
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
                  style={[st.dayChip, on && [st.dayChipOn, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.18) }]]}
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
          <View style={st.emptyIcon}><GalleryIcon size={40} color="#4A4A59" /></View>
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
          ListFooterComponent={loadingMore ? <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 16 }} /> : null}
          renderItem={({ item, index }) => {
            const on = selected.includes(item.uri);
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggle(item.uri)}
                onLongPress={() => setPreviewIdx(index)} // 꾹 눌러 크게 미리보기
                delayLongPress={300}
                style={{ width: CELL, height: CELL }}
              >
                <Image source={{ uri: item.uri }} style={st.cell} />
                <View style={[st.check, on && [st.checkOn, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]]}>{on && <CheckMark size={12} />}</View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
      <View style={[st.bottom, { paddingBottom: Platform.OS === 'ios' ? 40 : insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[st.nextBtn, selected.length === 0 && st.nextBtnDisabled]}
          onPress={() => setPreviewVisible(true)}
          disabled={selected.length === 0}
          activeOpacity={0.85}
        >
          <LinearGradient colors={skinAccent.btnGradient} style={st.nextGrad}>
            <Text style={st.nextTxt}>
              {selected.length === 0 ? t('album.selectAtLeastOne') : t('album.createWithN', { count: selected.length })}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 꾹 눌러 크게 미리보기 — 표시 중인 사진들을 스와이프로 넘겨볼 수 있다 */}
      <PhotoViewerModal
        visible={previewIdx !== null}
        uris={visiblePhotos.map((p) => p.uri)}
        initialIndex={previewIdx ?? 0}
        onClose={() => setPreviewIdx(null)}
      />

      {/* 기록 카드 미리보기 + 제목 입력 + 썸네일 선택 */}
      <Modal visible={previewVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <KeyboardAvoidingView
          style={st.pvOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          accessibilityViewIsModal
        >
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[st.pvSheet, { paddingBottom: Platform.OS === 'ios' ? 40 : insets.bottom + 16 }]}>
            <Text style={st.pvTitle}>{appendTarget ? t('album.appendTitle') : t('album.previewTitle')}</Text>
            <Text style={st.pvSub}>{appendTarget ? t('album.appendSub') : t('album.previewSub')}</Text>

            {/* 이어 담기 — 카드는 그대로 두고 사진만 붙으므로 제목·썸네일 선택 없이 확인만 */}
            {appendTarget ? (
              <View style={st.apBox}>
                <Text style={st.apName} numberOfLines={1}>
                  {appendTarget.countryFlag} {appendTarget.content}
                </Text>
                <Text style={st.apMeta}>
                  {t('album.appendFrom', { count: appendTarget.medias?.length ?? 0 })}
                  {'  →  '}
                  <Text style={st.apMetaTo}>
                    {t('album.appendTo', { count: (appendTarget.medias?.length ?? 0) + selected.length })}
                  </Text>
                </Text>
                <Text style={st.apHint}>{t('album.appendKeepHint')}</Text>
              </View>
            ) : (
            <>
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
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
                    <Image source={{ uri }} style={[st.pvThumb, on && [st.pvThumbOn, { borderColor: skinAccent.accent }]]} />
                    {on && (
                      <View style={st.pvThumbAdjustBadge}>
                        <Text style={st.pvThumbAdjustTxt}>{t('album.adjust')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            </>
            )}

            <View style={st.pvBtnRow}>
              <TouchableOpacity style={st.pvBackBtn} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                <Text style={st.pvBackTxt}>{t('album.reselect')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.pvOkBtn} onPress={save} activeOpacity={0.85}>
                <LinearGradient colors={skinAccent.btnGradient} style={st.pvOkGrad}>
                  <Text style={st.pvOkTxt}>{appendTarget ? t('album.appendNow') : t('album.createNow')}</Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  titleIndented: { marginLeft: 36 }, // 왼쪽 ← 버튼과 겹치지 않게 제목만 들여쓰기

  sub: { color: '#A1A1B0', fontSize: 13, lineHeight: 19 },
  counter: { color: '#BF85FC', fontSize: 13, fontWeight: '700', marginTop: 6 },
  selectAllTxt: { fontSize: 13, fontWeight: '700', marginTop: 6, textDecorationLine: 'underline' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  gpsChipTxt: { fontSize: 12, color: '#A1A1B0', fontWeight: '600' },
  gpsProgress: { fontSize: 11, color: '#5A5A6E' },
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
  countryCheckMark: { marginLeft: 'auto' },
  noResultText: { color: '#A1A1B0', fontSize: 14, textAlign: 'center', marginVertical: 24 },
  // 날짜 버튼 스타일은 components/record/DateRangeField로 이동했다(화면 4곳 통일)
  loadBtn: { borderRadius: 999, overflow: 'hidden', marginTop: 24 },
  loadGrad: { paddingVertical: 18, alignItems: 'center' },
  loadTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  // 기존 사진첩 안내 — 여행기록카드의 사진첩 액센트와 같은 주황(TripDetailScreen COLORS.albumAccent)
  dupBox: {
    marginTop: 20,
    backgroundColor: 'rgba(255,166,87,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,166,87,0.28)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dupHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dupHead: { color: ALBUM_ACCENT, fontSize: 12, fontWeight: '700' },
  dupName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  dupMeta: { color: '#A1A1B0', fontSize: 11, marginTop: 3 },
  dupHint: { color: '#7A7A89', fontSize: 11, marginTop: 10, lineHeight: 15 },

  // 이어 담기 확인 박스 (미리보기 시트) — 제목·썸네일 대신 대상과 장수만.
  // 같은 '기존 사진첩'을 가리키므로 기간 설정 화면의 안내 박스와 같은 주황을 쓴다.
  apBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,166,87,0.28)',
    backgroundColor: 'rgba(255,166,87,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  apName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  apMeta: { color: '#A1A1B0', fontSize: 12.5, marginTop: 6 },
  apMetaTo: { color: ALBUM_ACCENT, fontWeight: '700' },
  apHint: { color: '#7A7A89', fontSize: 11, marginTop: 10, lineHeight: 15 },

  // 자물쇠 + 문구를 한 덩어리로 묶어 박스 안 가운데에 놓는다.
  // 텍스트에 flex를 주면 남는 폭까지 늘어나 justifyContent가 무의미해지므로 주지 않는다.
  noteBox: {
    flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
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
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: '#A1A1B0', fontSize: 13 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 40, backgroundColor: 'rgba(10,1,24,0.95)' },
  nextBtn: { borderRadius: 999, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.5 },
  nextGrad: { paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  /* 미리보기 모달 */
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  // 이 모달은 RN Modal이라 App.tsx 루트 클램프 바깥에서 렌더된다. CARD_W(→ AdjustedCoverImage
  // frameW)는 Stage 폭(≤480) 기준으로 계산되므로, 시트 자체도 같은 폭으로 가두고 중앙에
  // 둬야 폴드·태블릿에서 미리보기 카드가 왼쪽으로 쏠리지 않는다. pvOverlay(딤 배경)는
  // 전면 유지 — 시트만 좁힌다.
  pvSheet: {
    backgroundColor: '#16121F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
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
