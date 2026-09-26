import { warn, success } from '../utils/haptics';
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Image,
  Modal,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { CommentIcon, PlusIcon, PencilIcon, GalleryIcon, ArchiveIcon, TrashIcon, BackChevronIcon, OutlineCalendarIcon, ChevronIcon, HeartIcon } from '../components/icons';
import { useRecords, TravelRecord } from '../store/recordStore';
import { PillRing } from '../components/record/CalendarBottomSheet';
import CutPhotoAdjustModal, { type CutTransform } from '../components/CutPhotoAdjustModal';
import { bakeCoverCrop, copyTripCover } from '../utils/importPhotoStore';
import { getTripPool, pickCoverCandidates } from '../utils/tripPhotoPool';
import { andFitText } from '../utils/fitText';
import { TRAVEL_MOMENTS_ENABLED } from '../constants/featureFlags';
import { countryTagLabel } from '../utils/countryLabel';
import { useMoments } from '../store/momentStore';
import { matchMoments, tripPeriodOf, countryNameToCode, parseDotDate } from '../utils/momentMatch';
import MomentListSheet from '../components/moments/MomentListSheet';
import { useStageWidth, useStageGutter, STAGE_MAX_W } from '../utils/stage';
import { sortFormatModules, type SortOrder } from './tripDetailSort';
import { classifyRowPhoto, pickRowPhoto, type RowPhotoCategory } from './tripDetailRowPhoto';
import { analyzePhotos, isPhotoVisionAvailable } from '../../modules/photo-vision';
import { makeThumbnail } from '../services/photoAI/qualityAssessment';

// 형식 행 펼침(LayoutAnimation)은 안드로이드에서 이 플래그가 켜져 있어야 동작한다 (FAQScreen과 동일)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 뷰타입(feed/blog/album/snap/cut) 표시 라벨 — 값은 데이터 키라 유지하고 표시만 번역
const viewTypeName = (type: string, tr: TFunction): string => {
  switch (type) {
    case 'feed': return tr('main.formatFeed');
    case 'blog': return tr('main.formatBlog');
    case 'album': return tr('main.formatAlbum');
    case 'snap': return tr('main.formatSnap');
    case 'cut': return tr('main.formatCut');
    default: return type;
  }
};

// 카드 썸네일 조정 프레임 — 미리보기 카드(사진첩/과거여행)와 동일 비율.
// 폭(=Stage 폭 - 40)은 컴포넌트 본문에서 실시간으로 받으므로 여기엔 높이만 둔다.
const CARD_H = 180;

// 형식 펼침 시 나오는 기록 타일 — 형식과 무관하게 한 종류다(시안). 폭은 고정이라 상수로 둔다.
const TILE_W = 120;
const TILE_H = 128;
const TILE_GAP = 12;

// 형식 행
const ROW_H = 72;
// 형식 행 오른쪽 '선명 구간'(블러 없음) 폭 — 시안 기준 세로 선이 오른쪽 끝에서 52
const ROW_CLEAR_W = 52;

// ⋯ 버튼 지름 — 스타일과 PillRing 치수가 같은 값을 봐야 링이 버튼 경계에 정확히 앉는다
const MORE_BTN = 36;

const COLORS = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#5A5A6E',
  // 형식별 컬러 — 피드=보라, 블로그=시안, 스트립=민트, 스냅=노랑(유지)
  feedAccent: '#BF85FC',
  feedBg: 'rgba(191,133,252,0.06)',
  blogAccent: '#00D8F3',
  blogBg: 'rgba(0,216,243,0.06)',
  albumAccent: '#FFA657',
  albumBg: 'rgba(255,166,87,0.06)',
  snapAccent: '#FFD60A',
  snapBg: 'rgba(255,214,10,0.06)',
  cutAccent: '#86FFBC',
  cutBg: 'rgba(134,255,188,0.06)',
};

// icon(이모지)은 쓰지 않는다 — 실제 렌더는 FormatIcon이 제작 SVG 아이콘으로 그린다
const VIEW_CONFIG: Record<string, {
  name: string;
  accent: string;
  gradient: [string, string];
}> = {
  feed: {
    name: '피드',
    accent: COLORS.feedAccent,
    gradient: ['rgba(191,133,252,0.12)', 'rgba(191,133,252,0.02)'],
  },
  blog: {
    name: '블로그',
    accent: COLORS.blogAccent,
    gradient: ['rgba(0,216,243,0.12)', 'rgba(0,216,243,0.02)'],
  },
  album: {
    name: '사진첩',
    accent: COLORS.albumAccent,
    gradient: ['rgba(255,166,87,0.12)', 'rgba(255,166,87,0.02)'],
  },
  snap: {
    name: '스냅',
    accent: COLORS.snapAccent,
    gradient: ['rgba(255,214,10,0.12)', 'rgba(255,214,10,0.02)'],
  },
  cut: {
    name: '스트립',
    accent: COLORS.cutAccent,
    gradient: ['rgba(134,255,188,0.12)', 'rgba(134,255,188,0.02)'],
  },
};

// ─── 형식 아이콘 (FAB / RecordFab 와 동일한 커스텀 아이콘을 색상만 받아 재현) ───
const FmtFeedIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 8, height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color }} />
    <View style={{ width: 20, height: 13, borderRadius: 3, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {/* 구멍 색은 RecordFab FeedIcon과 동일(#2E2E3B) — 형식 선택 팝업 버튼 바탕과 같아 FAB 아이콘 그대로 보인다 */}
      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

const FmtBlogIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, gap: 3 }}>
      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />
      <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />
    </View>
  </View>
);

const FmtAlbumIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
    </View>
  </View>
);

const FmtCutIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 18, height: 22, borderWidth: 1.5, borderColor: color, borderRadius: 3, padding: 2.5, flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: color }} />
    </View>
  </View>
);

// 형식별 아이콘 디스패처 (스냅은 FAB에 없으므로 ⚡ 유지)
function FormatIcon({ type, color }: { type: string; color: string }) {
  switch (type) {
    case 'feed':  return <FmtFeedIcon color={color} />;
    case 'blog':  return <FmtBlogIcon color={color} />;
    case 'album': return <FmtAlbumIcon color={color} />;
    case 'cut':   return <FmtCutIcon color={color} />;
    case 'snap':  return <Text style={{ fontSize: 20 }}>⚡</Text>;
    default:      return null;
  }
}

// 기록 추가 시 선택할 형식 목록 (스냅은 상세 카드에서 추가 대상 제외)
const ADD_FORMATS: { type: string; name: string }[] = [
  { type: 'feed',  name: '피드' },
  { type: 'blog',  name: '블로그' },
  { type: 'cut',   name: '스트립' },
  { type: 'album', name: '사진첩' },
];

// 기록의 미리보기 사진들 — 형식마다 사진이 들어 있는 필드가 달라(피드·사진첩은 medias,
// 스냅은 snapBack/Front, 스트립은 cutPhoto) 한곳에 모은다. 형식 행 배경과 펼침 타일이 같이 쓴다.
// representativePhoto는 다른 사진이 하나도 없을 때만 마지막 폴백으로 본다(표지 전용 크롭본이라
// 우선하면 히어로와 같은 사진이 행 배경·타일에 중복으로 깔린다).
function recordThumbs(r: TravelRecord): string[] {
  if (r.medias && r.medias.length > 0) return r.medias;
  if (r.viewType === 'snap') return [r.snapBackUri, r.snapFrontUri].filter(Boolean) as string[];
  if (r.viewType === 'cut' && r.cutPhoto) {
    return r.cutPhoto.previewUri ? [r.cutPhoto.previewUri] : (r.cutPhoto.photos ?? []);
  }
  // medias가 비고 대표 사진만 있는 기록(옛 피드 카드가 보던 폴백) — 타일 배경이 단색으로 비지 않게
  return r.representativePhoto ? [r.representativePhoto] : [];
}

// 형식 행 표시 순서. 컴포넌트 밖에 둬야 매 렌더 새 배열이 되지 않는다 —
// 아래 행 배경 선별 이펙트의 deps에 들어가므로, 안에 두면 렌더마다 재분석이 돈다.
const FORMAT_ORDER = ['feed', 'blog', 'cut', 'snap', 'album'];

// ── 형식 행 배경 사진 1장 선별 ──
// 규칙(풍경 80% · 사람 15% · 음식 5%, 빈 부류는 재정규화)은 순수 함수 tripDetailRowPhoto.ts에 있다.
// 여기 있는 건 그 함수에 먹일 신호를 모으는 부분(썸네일 생성 + 네이티브 분석 + 캐시)뿐이다.

/** 행마다 분석할 후보 사진 상한. 사진첩 한 개가 수백 장이면 행 배경 한 장 고르려고 썸네일 수백 개를 만든다 */
const ROW_PHOTO_MAX_CANDIDATES = 12;
/** 분석 입력 썸네일 한 변(px). 품질 평가(512)보다 작게 — 부류 판정에는 이 정도로 충분하고 생성이 빠르다 */
const ROW_PHOTO_THUMB_SIZE = 256;
/** 네이티브 분석 상한(ms). 응답이 없어도 행 배경이 영영 폴백에 머무르지 않게 */
const ROW_PHOTO_TIMEOUT_MS = 6000;

// 세션 캐시 — 같은 사진을 두 번 분석하지 않는다(화면을 나갔다 들어와도 유지).
const rowPhotoCategoryCache = new Map<string, RowPhotoCategory | null>();
// 카드+형식별로 고른 사진. 같은 카드에 재진입하면 같은 사진이 보여야 한다(매번 바뀌면
// 사용자에겐 깜빡임으로 읽힌다). 후보 목록 지문이 바뀌면(기록 추가·삭제) 다시 고른다.
const rowPhotoPickCache = new Map<string, { fp: string; uri: string | null }>();

/**
 * 이 형식 기록들의 사진을 순서대로 모아 중복을 뺀 뒤 상한까지. (형식별 사진 위치는 recordThumbs가 흡수)
 */
function rowPhotoCandidates(items: TravelRecord[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of items) {
    // 스트립은 합성본(previewUri, 프레임 안 4컷)이 아니라 **구성 사진 낱장**을 후보로 — 행 배경은
    // '기록에 쓰인 사진 한 장'이어야지 스트립 형식 자체가 보이면 안 된다(사용자 지적). 낱장이 없으면 기존 폴백
    const uris = r.viewType === 'cut' && r.cutPhoto?.photos?.length ? r.cutPhoto.photos : recordThumbs(r);
    for (const uri of uris) {
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      out.push(uri);
      if (out.length >= ROW_PHOTO_MAX_CANDIDATES) return out;
    }
  }
  return out;
}

/**
 * 후보 uri → 부류 배열(입력과 같은 순서). 캐시에 없는 것만 썸네일을 만들어 네이티브에 넘긴다.
 *
 * 네이티브가 없는 환경(Expo Go·podspec 이전 구형 빌드)·분석 실패·타임아웃·썸네일 실패는
 * 전부 'other'로 떨어진다 → pickRowPhoto의 "세 부류 다 비면 미분류 중 무작위" 경로를 타므로
 * 행 배경이 비지 않는다. 타임아웃은 캐시에 적지 않아 다음 진입에 다시 시도한다.
 */
async function classifyRowUris(uris: string[]): Promise<(RowPhotoCategory | null)[]> {
  const todo = uris.filter((u) => !rowPhotoCategoryCache.has(u));
  if (todo.length > 0 && isPhotoVisionAvailable) {
    try {
      // 네이티브엔 절대 원본을 넘기지 않는다(OOM) — qualityAssessment와 같은 규칙
      const thumbs = await Promise.all(todo.map((u) => makeThumbnail(u, ROW_PHOTO_THUMB_SIZE)));
      const pairs = todo
        .map((u, i) => ({ u, thumb: thumbs[i] }))
        .filter((p): p is { u: string; thumb: string } => !!p.thumb);
      if (pairs.length > 0) {
        const results = await Promise.race([
          analyzePhotos(pairs.map((p) => p.thumb)),
          new Promise<null>((res) => setTimeout(() => res(null), ROW_PHOTO_TIMEOUT_MS)),
        ]);
        if (results) {
          const byUri = new Map(results.map((r) => [r.uri, r]));
          for (const { u, thumb } of pairs) {
            const raw = byUri.get(thumb);
            rowPhotoCategoryCache.set(u, raw && !raw.error ? classifyRowPhoto(raw) : 'other');
          }
        }
      }
    } catch {
      // 분석이 통째로 실패해도 화면은 폴백 사진으로 굴러간다
    }
  }
  // has()로 갈라야 한다 — 캐시된 null(영수증·문서 제외 판정)을 ??가 'other'로 되살려 제외가 죽는다(QA M-1).
  // 캐시 미적중(썸네일 실패·미지원·타임아웃)만 'other'.
  return uris.map((u) => (rowPhotoCategoryCache.has(u) ? (rowPhotoCategoryCache.get(u) as RowPhotoCategory | null) : 'other'));
}

// ⋯ 메뉴 카드 유리 테두리 — 게시물 상세 ⋯ 메뉴와 같은 좌상단·우하단 흰색 대각 그라데이션 링(PillRing diagonal).
// 부모의 첫 자식으로 넣으면 absoluteFill 층이 제 크기를 실측해 링을 얹는다(행 수가 달라 높이가 변해도 됨).
// ⚠️ 부모에 borderWidth·overflow:'hidden'을 주지 말 것 — 링이 잘리거나 이중 테두리가 된다.
function AutoPillRing({ radius }: { radius: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
      }}
    >
      <PillRing width={size.w} height={size.h} radius={radius} diagonal />
    </View>
  );
}

// 'YYYY.MM.DD' / 'YYYY-MM-DD' → epoch(ms). 실패 시 null (recordStore의 그룹핑 파서와 동일 규칙)
// new Date('YYYY-MM-DD')는 ISO 규칙상 'UTC 자정'으로 읽혀, 아래 fmt()의 로컬 getter로 다시
// 표시하면 미주(UTC-) 시간대에서 하루가 밀린다 → 공용 수동 파서(로컬 자정)를 쓴다.
function parseTripDate(s?: string): number | null {
  return parseDotDate(s);
}

// 기록들의 startDate/endDate/date에서 여행 기간(min~max)을 'YYYY.MM.DD'로 산출
function computeTripPeriod(recs: { startDate?: string; endDate?: string; date?: string }[]): { startDate?: string; endDate?: string } {
  const times: number[] = [];
  for (const r of recs) {
    const st = parseTripDate(r.startDate) ?? parseTripDate(r.date);
    const en = parseTripDate(r.endDate) ?? st;
    if (st != null) times.push(st);
    if (en != null) times.push(en);
  }
  if (times.length === 0) return {};
  return { startDate: fmtDotDate(Math.min(...times)), endDate: fmtDotDate(Math.max(...times)) };
}

// epoch(ms) → 'YYYY.MM.DD' (로컬). 여행 기간 표시와 펼침 타일의 게시일이 같이 쓴다.
function fmtDotDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 여행 기간을 'YYYY.MM.DD' 또는 'YYYY.MM.DD ~ YYYY.MM.DD' 표시 문자열로
function computeTripDateRange(recs: { startDate?: string; endDate?: string; date?: string }[]): string | null {
  const { startDate, endDate } = computeTripPeriod(recs);
  if (!startDate) return null;
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

interface TripThumbnail {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
}

type RouteParams = {
  // guestRecords: 타인 프로필에서 진입 시 그 여행의 기록들(서버 조회본) — 로컬 스토어에 없어
  // 직접 넘긴다. 존재하면 읽기 전용 게스트 모드(편집 메뉴·기록 추가 숨김).
  TripDetail: { trip: TripThumbnail; guestRecords?: TravelRecord[] };
};

export default function TripDetailScreen() {
  const { t, i18n } = useTranslation();
  // 썸네일 조정 프레임 비율·썸네일 격자 칸은 Stage 폭에서 파생한다 — 박제하면 폴드에서 어긋난다.
  const SCREEN_WIDTH = useStageWidth();
  const CARD_ASPECT = (SCREEN_WIDTH - 40) / CARD_H;
  const thumbCellSize = (SCREEN_WIDTH - 32 - 16) / 3; // 시트 좌우 16×2 + gap 8×2
  // 히어로는 화면 높이의 37%(시안 874 중 ~320). 작은 기기에서 납작해지지 않게 260이 바닥.
  // Stage 폭과 달리 높이는 클램프 대상이 아니라 창 높이를 그대로 쓴다.
  const HERO_H = Math.max(260, Math.round(useWindowDimensions().height * 0.37));
  // ⋯ 메뉴는 Modal(루트 클램프 밖) 안에서 right:20으로 붙는다 — 폴드·태블릿에서
  // 창 오른쪽 끝에 붙어 버튼과 어긋나므로 레터박스 폭만큼 안쪽으로 민다
  const stageGutter = useStageGutter();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TripDetail'>>();
  const { trip, guestRecords } = route.params;
  const isGuest = !!guestRecords; // 타인의 여행 — 읽기 전용
  const { records, tripGroups, updateTripGroup, updateRecord, archiveRecord, deleteRecord, deleteTripGroup, archivedIds } = useRecords();

  const currentGroup = tripGroups.find((g) => g.id === trip.id);

  // 이 여행 기간에 캡처한 순간들 — 국가코드 + 소속 기록들의 날짜 범위로 매칭 (ProfileScreen과 동일 규칙)
  const { moments } = useMoments();
  const tripMoments = useMemo(() => {
    const fullRecs = trip.records
      .map((r) => records.find((x) => x.id === r.id))
      .filter(Boolean) as TravelRecord[];
    const period = tripPeriodOf(fullRecs);
    return matchMoments(moments, {
      countryCode: countryNameToCode(trip.country),
      startMs: period?.startMs,
      endMs: period?.endMs,
    });
  }, [moments, trip, records]);
  const titleToDisplay = currentGroup ? currentGroup.title : trip.title;

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(titleToDisplay);
  const [menuVisible, setMenuVisible] = useState(false); // 우측 상단 ☰ 편집 메뉴
  const [momentSheetVisible, setMomentSheetVisible] = useState(false); // ✨ 여행 기억 시트
  const [thumbPickerVisible, setThumbPickerVisible] = useState(false); // 썸네일 사진 선택
  const [pendingThumb, setPendingThumb] = useState<string | null>(null); // 조정 대기 중인 새 썸네일
  const [adjustVisible, setAdjustVisible] = useState(false); // 노출 영역 조정 모달
  const [formatPickerVisible, setFormatPickerVisible] = useState(false); // 기록 추가 — 형식 선택
  // 형식 행 정렬. 규칙 자체는 순수 함수 sortFormatModules(tripDetailSort.ts)에 있다.
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [sortAnchorY, setSortAnchorY] = useState<number | null>(null);
  const sortBtnRef = useRef<View>(null);

  useEffect(() => {
    setEditedTitle(titleToDisplay);
  }, [titleToDisplay]);

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      updateTripGroup(trip.id, { title: editedTitle.trim() });
      setIsEditing(false);
    }
  };

  // ── ☰ 편집 메뉴 액션 ──
  // 그룹 기반 카드만 보관/삭제/썸네일 변경 가능 (하드코딩 샘플 카드는 그룹이 없음)
  // 보관된 기록은 제외 — 프로필 여행 카드(mappedThumbnails)와 동일 기준
  const groupRecordObjs = currentGroup
    ? currentGroup.records
        .map((id) => records.find((r) => r.id === id))
        .filter((r): r is TravelRecord => !!r && !archivedIds.includes(r.id))
    : [];
  const thumbCandidates = groupRecordObjs.flatMap((r) => r.medias ?? []);

  const handleChangeThumb = () => {
    setMenuVisible(false);
    if (!currentGroup || thumbCandidates.length === 0) {
      Alert.alert(t('trip.noticeTitle'), t('trip.noPhotoToChange'));
      return;
    }
    setThumbPickerVisible(true);
  };

  // ── 썸네일 다시 뽑기 (과거 여행 불러오기로 만든 카드 전용) ──
  // 불러오기는 카드를 만들 때 무작위 1장만 확보한다. 그 한 장이 실패하면(iCloud 오프로드,
  // 읽을 수 없는 원본 등) 카드가 기본 이모지로 남는데, medias가 비어 있어 '썸네일 변경'
  // 메뉴로는 고칠 수 없다 — 고를 사진이 없기 때문이다. 다시 불러오기를 해도 그 여행 사진은
  // 이미 스캔 제외 대상이라 되돌아오지 않는다. 그래서 보관해 둔 후보에서 다시 뽑는 길을 둔다.
  const [poolPhotoCount, setPoolPhotoCount] = useState(0);
  const [rerolling, setRerolling] = useState(false);
  useEffect(() => {
    const gid = currentGroup?.id;
    if (!gid) { setPoolPhotoCount(0); return; }
    let alive = true;
    getTripPool(gid).then((p) => { if (alive) setPoolPhotoCount(p?.photos.length ?? 0); });
    return () => { alive = false; };
  }, [currentGroup?.id]);

  const handleRerollThumb = async () => {
    setMenuVisible(false);
    if (!currentGroup || rerolling) return;
    const pool = await getTripPool(currentGroup.id);
    if (!pool || pool.photos.length === 0) {
      Alert.alert(t('trip.noticeTitle'), t('trip.noPoolPhotos'));
      return;
    }
    const owner = groupRecordObjs.find((r) => r.id === currentGroup.coverRecordId) ?? groupRecordObjs[0];
    if (!owner) return;
    setRerolling(true);
    const res = await copyTripCover(
      currentGroup.id,
      pickCoverCandidates(pool.photos, 8).map((p) => ({ id: p.id, uri: p.uri })),
    );
    setRerolling(false);
    if (!res.uri) {
      // 개발 빌드에서는 실제 사유를 그대로 보여준다 — 콘솔 없이도 원인을 읽을 수 있게
      Alert.alert(t('trip.noticeTitle'), __DEV__ && res.error ? res.error : t('trip.thumbRerollFailed'));
      return;
    }
    // medias가 비어 있으면 이 사진을 채워 둔다 — 이후 '썸네일 변경'에서도 고를 수 있게 된다
    updateRecord(owner.id, {
      representativePhoto: res.uri,
      representativePhotoSource: res.uri,
      ...((owner.medias?.length ?? 0) === 0 ? { medias: [res.uri] } : {}),
    });
    updateTripGroup(currentGroup.id, { coverRecordId: owner.id, coverUri: undefined });
    success();
  };

  // 사진을 고르면 바로 적용하지 않고 노출 영역 조정 단계를 거친다
  const handlePickThumb = (uri: string) => {
    if (!currentGroup) return;
    setThumbPickerVisible(false);
    setPendingThumb(uri);
    setAdjustVisible(true);
  };

  // 조정 확정 → 썸네일 교체 + (이동/확대했다면) 보이는 영역을 실제 크롭해 representativePhoto로 저장
  //
  // ⚠️ medias는 재정렬하지 않는다. 여행 카드 썸네일은 ProfileScreen이
  //    `group.coverUri ?? coverRec.representativePhoto ?? coverRec.medias[0]` 순으로 고르므로,
  //    representativePhoto만 지정하면 medias 순서를 건드리지 않고도 원하는 사진이 썸네일이 된다.
  //    예전처럼 선택 사진을 medias 맨 앞으로 옮기면
  //      · 사진별 글(photoTexts)·비공개 대상(mediaPrivacy)이 인덱스 기준이라 전부 한 칸씩 밀리고
  //      · 사진첩(albumSections)은 섹션 경계가 밀려 '1일차/2일차' 구성이 깨지며
  //      · 이미 발행된 게시물의 사진 순서까지 바뀐다.
  //    (사진첩 화면 TripRecordScreen의 '커버로 지정'과 동일한 방식)
  const applyThumb = async (uri: string, t: CutTransform) => {
    if (!currentGroup) return;
    const owner = groupRecordObjs.find((r) => (r.medias ?? []).includes(uri));
    if (!owner) return;
    const isIdentity = t.scale === 1 && t.tx === 0 && t.ty === 0;
    // 조정 없이 확정하면 원본을, 이동/확대했으면 보이는 영역만 구운 크롭본을 대표로 쓴다
    // (크롭 실패 시에도 원본으로 폴백 — 대표를 비우면 이전 썸네일이 그대로 남는다)
    const rep = isIdentity ? uri : ((await bakeCoverCrop(uri, t, CARD_ASPECT, owner.id)) ?? uri);
    updateRecord(owner.id, { representativePhoto: rep, representativePhotoSource: uri });
    // coverUri는 카드 썸네일 오버라이드(다른 기기에서 지정한 값이 남아 있으면 새 선택을 덮는다) — 함께 해제
    updateTripGroup(currentGroup.id, { coverRecordId: owner.id, coverUri: undefined });
  };

  const handleArchiveCard = () => {
    setMenuVisible(false);
    if (!currentGroup) {
      Alert.alert(t('trip.noticeTitle'), t('trip.sampleNoArchive'));
      return;
    }
    Alert.alert(t('trip.archiveCardTitle'), t('trip.archiveCardMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.archive'),
        onPress: () => {
          currentGroup.records.forEach((id) => archiveRecord(id));
          navigation.goBack();
        },
      },
    ]);
  };

  const handleDeleteCard = () => {
    setMenuVisible(false);
    if (!currentGroup) {
      Alert.alert(t('trip.noticeTitle'), t('trip.sampleNoDelete'));
      return;
    }
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('trip.deleteCardTitle'), t('trip.deleteCardMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.delete'),
        style: 'destructive',
        onPress: () => {
          currentGroup.records.forEach((id) => deleteRecord(id));
          deleteTripGroup(currentGroup.id);
          navigation.goBack();
        },
      },
    ]);
  };

  // 이 여행 카드의 기록 = 해당 그룹(currentGroup)에 묶인 기록만 사용한다.
  // 국가명으로 매칭하면 같은 국가의 '다른 일정' 여행 기록까지 섞여 중복 표시되므로,
  // 그룹이 있으면 그룹 기록만 쓴다. 그룹이 없는 예외 카드만 국가명으로 폴백.
  // 게스트(타인 여행)는 로컬 스토어에 기록이 없으므로 파라미터로 받은 서버 조회본을 그대로 쓴다.
  const matchedRecords = guestRecords
    ? guestRecords
    : currentGroup
      ? groupRecordObjs
      : trip.country
        ? records.filter(
            (r) => !archivedIds.includes(r.id) && (r.countryName === trip.country || r.country?.includes(trip.country))
          )
        : groupRecordObjs;

  // 여행 기간 — 기록들의 실제 날짜에서 산출(없으면 param 스냅샷 trip.date 폴백)
  const tripDateRange = computeTripDateRange(matchedRecords) ?? trip.date;

  // 히어로(상단 ⚡ 자리)에 넣을 대표 썸네일 — 그룹 커버 우선, 없으면 기록의 첫 사진
  const pickPhoto = (r?: TravelRecord): string | undefined =>
    r?.representativePhoto || r?.medias?.[0] || r?.snapBackUri || r?.snapFrontUri || r?.cutPhoto?.previewUri;
  const coverPhoto: string | undefined =
    (currentGroup?.coverRecordId
      ? pickPhoto(records.find((r) => r.id === currentGroup.coverRecordId))
      : undefined) ?? matchedRecords.map(pickPhoto).find(Boolean);

  // viewType별 그룹
  //
  // 불러오기가 만든 '표지 전용' 기록은 뺀다. 그 기록의 viewType은 'album'이지만(피드 제외·
  // 중복 판정이 그 값에 걸려 있어 바꾸지 않는다) 사용자가 만든 사진첩이 아니다 —
  // 그대로 두면 만들지도 않은 사진 1장짜리 사진첩이 형식 목록에 뜨고, 게다가
  // '여행 카드당 사진첩 1개' 규칙에 걸려 진짜 사진첩을 만들 수도 없게 된다.
  const getRecordsByType = (viewType: string): TravelRecord[] => {
    return matchedRecords.filter((r) => (r.viewType || 'feed') === viewType && !r.isImportCover);
  };

  // ── 형식 행: 기록이 있는 형식만 한 줄씩, 탭하면 그 자리에서 펼쳐짐 ──
  // (FORMAT_ORDER는 모듈 최상위로 올려 뒀다 — 행 배경 이펙트 deps에 들어가므로)
  const modules = FORMAT_ORDER
    .map((vt) => ({ vt, config: VIEW_CONFIG[vt], items: getRecordsByType(vt) }))
    .filter((m) => !!m.config && m.items.length > 0);
  // 정렬은 순수 함수에 맡긴다. modules는 매 렌더 새 배열이라 useMemo를 씌워도 캐시가 안 산다.
  const sortedModules = sortFormatModules(modules, sortOrder, FORMAT_ORDER);

  // 형식별 행 배경 후보 — 렌더(폴백 첫 장)와 분석 이펙트가 같은 목록을 본다.
  // 지문은 FORMAT_ORDER 순으로 만든다 — 정렬만 바꿨을 때 재분석이 돌지 않게(정렬은 배경과 무관).
  const rowCands: Record<string, string[]> = {};
  for (const m of modules) rowCands[m.vt] = rowPhotoCandidates(m.items);
  const rowCandsFp = FORMAT_ORDER.map((vt) => `${vt}=${(rowCands[vt] ?? []).join(',')}`).join(';');
  // 확률로 고른 행 배경. 분석이 끝나기 전까지는 비어 있고, 렌더가 후보 첫 장으로 폴백한다.
  const [rowPhoto, setRowPhoto] = useState<Record<string, string | null>>({});
  // 이펙트가 최신 후보 목록을 보게 하는 우회 — rowCands는 매 렌더 새 객체라 deps에 넣을 수 없고,
  // 대신 지문(rowCandsFp)이 바뀔 때만 이펙트가 돌므로 ref로 읽어도 항상 최신이다.
  const rowCandsRef = useRef(rowCands);
  rowCandsRef.current = rowCands;

  // 형식 행 배경 선별 — 형식을 하나씩 순차로 분석한다(동시에 여러 행이 네이티브를 부르면
  // 썸네일 생성이 몰려 진입이 버벅인다). 긴 await 뒤에는 반드시 cancelled를 다시 본다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cands = rowCandsRef.current;
      for (const vt of FORMAT_ORDER) {
        const uris = cands[vt] ?? [];
        if (uris.length === 0) {
          // 후보가 0장이 되면(기록 삭제 등) 이전 사진이 남지 않게 비운다 → 형식색 gradient 폴백(QA L-1)
          if (!cancelled) setRowPhoto((p) => (p[vt] == null ? p : { ...p, [vt]: null }));
          continue;
        }
        const fp = uris.join(',');
        const key = `${trip.id}:${vt}`;
        const cached = rowPhotoPickCache.get(key);
        if (cached && cached.fp === fp) {
          // 같은 카드 재진입 — 다시 뽑지 않고 그때 고른 사진을 그대로 쓴다
          if (!cancelled) setRowPhoto((p) => (p[vt] === cached.uri ? p : { ...p, [vt]: cached.uri }));
          continue;
        }
        const cats = await classifyRowUris(uris);
        if (cancelled) return;
        const pool = uris
          .map((uri, i) => ({ uri, category: cats[i] }))
          .filter((c): c is { uri: string; category: RowPhotoCategory } => c.category !== null);
        // 후보가 전부 제외(영수증·문서)면 첫 장으로 — 행이 단색으로 비는 것보다 낫다
        const picked = pickRowPhoto(pool, Math.random) ?? uris[0];
        rowPhotoPickCache.set(key, { fp, uri: picked });
        setRowPhoto((p) => ({ ...p, [vt]: picked }));
      }
    })();
    return () => { cancelled = true; };
  }, [trip.id, rowCandsFp]);

  const [expandedType, setExpandedType] = useState<string | null>(null);
  // 펼침 가로 목록 오른쪽 페이드 — 뒤에 타일이 더 있을 때만 보인다(끝까지 넘기면 사라짐).
  // 한 번에 한 형식만 펼치므로 상태 하나면 충분하다. 폭은 onLayout/onContentSizeChange 실측.
  const [tileMoreRight, setTileMoreRight] = useState(false);
  const tileListW = useRef(0);
  const tileContentW = useRef(0);
  const tileScrollX = useRef(0);
  const recalcTileMore = () => {
    setTileMoreRight(tileContentW.current - (tileScrollX.current + tileListW.current) > 4);
  };
  // 세로 목록 하단 페이드 — 형식 행이 쌓여 화면 아래를 넘길 때만 보인다(끝까지 내리면 사라짐). 가로와 같은 판정
  const [listMoreBottom, setListMoreBottom] = useState(false);
  const listH = useRef(0);
  const listContentH = useRef(0);
  const listScrollY = useRef(0);
  const recalcListMore = () => {
    setListMoreBottom(listContentH.current - (listScrollY.current + listH.current) > 4);
  };

  // 애니메이션 — 헤더·히어로·행 목록이 같은 값 하나로 함께 페이드 인 (스태거 없음)
  const headerAnim = useRef(new Animated.Value(0)).current;
  // 행 오른쪽 셰브론 각도(0=닫힘 -90°, 1=열림 0°). 형식 수가 최대 5개라 필요한 것만 만들어 둔다.
  const chevronAnims = useRef<Record<string, Animated.Value>>({}).current;
  const chevronFor = (vt: string) => {
    if (!chevronAnims[vt]) chevronAnims[vt] = new Animated.Value(0);
    return chevronAnims[vt];
  };
  const spinChevron = (vt: string, to: number) =>
    Animated.timing(chevronFor(vt), { toValue: to, duration: 180, useNativeDriver: true }).start();

  // 행 펼치기/접기 — 한 번에 하나만 열린다. 닫히는 행의 셰브론도 같이 되돌려야
  // 다음에 그 행을 열 때 이미 아래를 향한 상태로 시작하지 않는다.
  const toggleModule = (vt: string) => {
    const next = expandedType === vt ? null : vt;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedType && expandedType !== next) spinChevron(expandedType, 0);
    if (next) spinChevron(next, 1);
    // 새로 펼치는 목록은 x=0부터 — 이전 형식의 스크롤 위치·폭이 페이드 판정에 남지 않게
    tileScrollX.current = 0; tileContentW.current = 0; setTileMoreRight(false);
    setExpandedType(next);
  };

  // 정렬 버튼이 실제로 어디 있는지 재서 메뉴를 그 아래에 붙인다.
  // measureInWindow는 비동기라 콜백 안에서 열어야 한다(먼저 열면 첫 프레임이 옛 위치로 그려진다).
  // 레포 선례(PostDetailScreen·MainCoachmark)와 같은 가드 — ref가 있어도 measureInWindow가
  // 없는 노드(플래튼된 뷰)가 있어, 없으면 menuSheet 기본 top으로 폴백한다.
  const openSortMenu = () => {
    const node: any = sortBtnRef.current;
    if (!node || typeof node.measureInWindow !== 'function') { setSortAnchorY(null); setSortMenuVisible(true); return; }
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      setSortAnchorY(typeof y === 'number' && typeof h === 'number' ? y + h + 6 : null);
      setSortMenuVisible(true);
    });
  };

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // 이 여행에 새 기록 추가 — 형식별 작성 화면으로 이동(같은 국가라 이 카드 목록에 자동 포함)
  // 미리 채우기(tripPrefill)는 보내지 않는다 — 탭 바 FAB 진입 화면과 똑같이 보이도록 통일.
  const handleAddRecord = (type: string) => {
    setFormatPickerVisible(false);
    const selectedCountry = { name: trip.country || '', flag: trip.countryFlag };
    const nav = navigation as any;
    switch (type) {
      case 'blog':  nav.navigate('BlogRecord', { selectedCountry }); break;
      case 'cut':   nav.navigate('CutRecord', { selectedCountry }); break;
      case 'snap':  nav.navigate('SnapRecord', { selectedCountry }); break;
      case 'album': {
        // 여행 카드당 사진첩 1개 — 이미 있으면 생성 대신 안내 (기존 사진첩에서 추가·정리)
        if (getRecordsByType('album').length > 0) {
          Alert.alert(t('trip.albumOnlyOneTitle'), t('trip.albumOnlyOneMsg'));
          break;
        }
        nav.navigate('AlbumCreate', { selectedCountry, tripGroupId: trip.id });
        break;
      }
      default:      nav.navigate('NewRecord', { selectedCountry });
    }
  };

  const handleRecordPress = (rec: TravelRecord) => {
    // 타인 기록은 전부 게시물 상세로 — TripRecord는 소유자 편집 UI가 섞여 있고,
    // 스토어에 없는 글이라 record 폴백을 함께 넘긴다 (메이트 프로필의 기존 동작과 동일)
    if (isGuest) {
      navigation.navigate('PostDetail', { postId: rec.id, record: rec });
      return;
    }
    // 피드·스트립·블로그는 소셜탭과 동일한 상세 게시물 화면(PostDetail)으로 이동
    const vt = rec.viewType || 'feed';
    if (vt === 'feed' || vt === 'cut' || vt === 'blog') {
      navigation.navigate('PostDetail', { postId: rec.id });
      return;
    }
    // 그 외 형식은 기존 기록 상세 화면 — 기록 전체를 넘겨야 사진첩(medias)·본문 등이 표시된다
    navigation.navigate('TripRecord', {
      record: rec,
      viewType: rec.viewType || 'feed',
    });
  };

  return (
    <View style={s.container}>

      {/* 편집 메뉴 시트 */}
      <Modal visible={menuVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          {/* 메뉴가 열린 동안만 히어로 사진 위쪽을 어둡게 — 밝은 사진 위에서 반투명 카드가 읽히도록(시안).
              사진 높이만큼만 덮고 아래로 갈수록 투명해져 목록은 그대로 보인다. 터치는 통과 */}
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
            locations={[0, 0.55, 1]}
            style={[s.menuTopDim, { height: HERO_H }]}
            pointerEvents="none"
          />
          {/* ⋯ 버튼(헤더 paddingTop insets.top+10, 지름 36) 바로 아래 6px, 오른쪽 끝은 버튼과 맞춤(헤더 gutter 16) */}
          <View style={[s.menuSheet, { right: 16 + stageGutter, top: insets.top + 10 + MORE_BTN + 6 }]}>
            <AutoPillRing radius={10} />
            <TouchableOpacity
              style={s.menuItem}
              accessibilityRole="button"
              accessibilityLabel={t('trip.addRecordA11y')}
              onPress={() => { setMenuVisible(false); setFormatPickerVisible(true); }}
            >
              <PlusIcon size={14} color={COLORS.white} />
              <Text style={s.menuItemText}>{t('comp2.tdAddRecord')}</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity
              style={s.menuItem}
              accessibilityRole="button"
              accessibilityLabel={t('trip.editTitleA11y')}
              onPress={() => {
                setMenuVisible(false);
                // 그룹이 없는 카드(샘플 등)는 제목 저장 대상이 없어 수정 불가 — 다른 메뉴와 동일하게 안내
                if (!currentGroup) { Alert.alert(t('trip.noticeTitle'), t('trip.sampleNoTitleEdit')); return; }
                setIsEditing(true);
              }}
            >
              <PencilIcon size={14} color={COLORS.white} />
              <Text style={s.menuItemText}>{t('comp2.tdEditTitle')}</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleChangeThumb} accessibilityRole="button" accessibilityLabel={t('trip.changeThumbA11y')}>
              <GalleryIcon size={14} color={COLORS.white} />
              <Text style={s.menuItemText}>{t('comp2.tdChangeThumb')}</Text>
            </TouchableOpacity>
            {/* 불러오기로 만든 카드에만 — 보관해 둔 분석 사진이 있을 때 노출 */}
            {poolPhotoCount > 0 && (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleRerollThumb} accessibilityRole="button" accessibilityLabel={t('trip.rerollThumb')}>
                  <GalleryIcon size={14} color={COLORS.white} />
                  <Text style={s.menuItemText}>{rerolling ? t('trip.rerollThumbBusy') : t('trip.rerollThumb')}</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleArchiveCard} accessibilityRole="button" accessibilityLabel={t('trip.archiveCardA11y')}>
              <ArchiveIcon size={14} color={COLORS.white} />
              <Text style={s.menuItemText}>{t('comp2.tdArchive')}</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleDeleteCard} accessibilityRole="button" accessibilityLabel={t('trip.deleteCardA11y')}>
              <TrashIcon size={14} color="#FF3B30" />
              <Text style={[s.menuItemText, s.menuItemDanger]}>{t('comp2.tdDelete')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 정렬 앵커 메뉴 — 편집 메뉴와 같은 카드 스타일을 쓰되 위치만 정렬 버튼 실측값에 붙인다 */}
      <Modal visible={sortMenuVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setSortMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setSortMenuVisible(false)}>
          <View style={[s.menuSheet, { right: 16 + stageGutter }, sortAnchorY != null && { top: sortAnchorY }]}>
            <AutoPillRing radius={10} />
            {(['latest', 'oldest'] as const).map((o, i) => (
              <React.Fragment key={o}>
                {i > 0 && <View style={s.menuDivider} />}
                <TouchableOpacity
                  style={s.menuItem}
                  accessibilityRole="button"
                  onPress={() => { setSortOrder(o); setSortMenuVisible(false); }}
                >
                  <Text style={[s.menuItemText, sortOrder === o && { color: COLORS.purpleNeon }]}>
                    {t(o === 'latest' ? 'trip.sortLatest' : 'trip.sortOldest')}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ✨ 여행 기억 — 이 여행 기간에 캡처한 순간 목록 */}
      <MomentListSheet
        visible={momentSheetVisible}
        onClose={() => setMomentSheetVisible(false)}
        moments={tripMoments}
        tripTitle={`${trip.countryFlag} ${titleToDisplay}`}
      />

      {/* 기록 추가 — 형식 선택 모달 */}
      <Modal visible={formatPickerVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setFormatPickerVisible(false)}>
        <TouchableOpacity style={s.fmOverlay} activeOpacity={1} onPress={() => setFormatPickerVisible(false)}>
          {/* 불투명 카드 + 대각 그라데이션 링(AutoPillRing). 보라 하드코딩 테두리 폐기. 반투명은 사용자 지시로 뺐다 */}
          <View style={s.fmCard}>
            <AutoPillRing radius={20} />
            <Text style={s.fmTitle}>{t('trip.recordFormatTitle')}</Text>
            <Text style={s.fmSub}>
              {trip.country ? t('trip.recordFormatPromptCountry', { country: countryTagLabel(trip.country, i18n.language) }) : t('trip.recordFormatPrompt')}
            </Text>
            {/* "여행 날짜 자동 적용" 안내는 뺐다 — 507c335에서 tripPrefill 전달을 없애 더는 자동 적용되지 않는다(없는 기능 약속 금지) */}
            <View style={s.fmGrid}>
              {ADD_FORMATS.map((f) => (
                <TouchableOpacity key={f.type} style={s.fmItem} activeOpacity={0.8} onPress={() => handleAddRecord(f.type)} accessibilityRole="button" accessibilityLabel={t('trip.addFormatA11y', { format: viewTypeName(f.type, t) })}>
                  <AutoPillRing radius={14} />
                  {/* FAB(RecordFab)와 같은 흰색 아이콘 — 형식색 틴트 없음(사용자 지정) */}
                  <FormatIcon type={f.type} color={COLORS.white} />
                  <Text style={s.fmName}>{viewTypeName(f.type, t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 썸네일 사진 선택 시트 */}
      <Modal visible={thumbPickerVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setThumbPickerVisible(false)}>
        <View style={s.thumbOverlay}>
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[s.thumbSheet, { paddingBottom: Platform.OS === 'ios' ? 40 : insets.bottom + 16 }]}>
            <Text style={s.thumbTitle}>{t('trip.changeThumbTitle')}</Text>
            <Text style={s.thumbSub}>{t('trip.changeThumbSub')}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.thumbGrid}>
                {thumbCandidates.map((uri, i) => (
                  <TouchableOpacity key={uri + i} onPress={() => handlePickThumb(uri)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('trip.pickThumbA11y')}>
                    <Image source={{ uri }} style={[s.thumbCell, { width: thumbCellSize, height: thumbCellSize }]} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={s.thumbCancel} onPress={() => setThumbPickerVisible(false)} activeOpacity={0.85}>
              <Text style={s.thumbCancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 새 썸네일 노출 영역 조정 (드래그/핀치) — 확인 시 적용, 사진 변경 시 선택 시트로 복귀 */}
      <CutPhotoAdjustModal
        visible={adjustVisible}
        uri={pendingThumb}
        aspect={CARD_ASPECT}
        initial={null}
        onConfirm={(t) => {
          setAdjustVisible(false);
          const uri = pendingThumb;
          setPendingThumb(null);
          if (uri) applyThumb(uri, t);
        }}
        onCancel={() => {
          setAdjustVisible(false);
          setPendingThumb(null);
        }}
        onChangePhoto={() => {
          setAdjustVisible(false);
          setPendingThumb(null);
          setThumbPickerVisible(true);
        }}
      />

      {/* 히어로 — 전체 폭 커버 사진, ScrollView 밖이라 스크롤해도 상단에 고정(사용자 지정). 헤더가 이 위에 겹친다. */}
      <Animated.View style={[s.hero, {
        height: HERO_H,
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
      }]}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          // 사진이 없는 카드(불러오기 실패·샘플)는 기존처럼 여행 색 그라데이션 + 이모지
          <LinearGradient
            colors={[trip.color, 'rgba(10,10,15,0.8)', COLORS.bg]}
            style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <Text style={s.heroEmoji}>{trip.emoji}</Text>
          </LinearGradient>
        )}
        {/* 사진 상단만 살짝 어둡게 — 겹친 헤더(제목·버튼) 가독성. 사용자 지정 '살짝만' */}
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
          locations={[0, 0.35]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* 하단 날짜·기록 수 가독성용 옅은 스크림. 배경색까지 녹이지 않아 사진 아래 경계가 또렷하다(시안) */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={s.heroBottomRow} pointerEvents="none">
          <View style={s.heroDateRow}>
            <OutlineCalendarIcon size={13} color={COLORS.white} />
            <Text style={s.heroDate}>{tripDateRange}</Text>
          </View>
          {/* trip.records는 파라미터 스냅샷이라 삭제가 반영되지 않음 — 형식 행과 같은 실측 기준 사용 */}
          {/* 불러오기가 만든 '표지 전용' 기록은 getRecordsByType과 똑같이 뺀다 — 안 빼면 사진첩 없이 카드만 만든 여행이 "1개의 기록"으로 보인다 */}
          <Text style={s.heroCount} {...andFitText}>{t('trip.recordsCount', { n: matchedRecords.filter((r) => !r.isImportCover).length })}</Text>
        </View>
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => { listH.current = e.nativeEvent.layout.height; recalcListMore(); }}
        onContentSizeChange={(_, h) => { listContentH.current = h; recalcListMore(); }}
        onScroll={(e) => { listScrollY.current = e.nativeEvent.contentOffset.y; recalcListMore(); }}
        scrollEventThrottle={32}
      >

        {/* 정렬 */}
        <View style={s.sortRow}>
          {/* 실측용 래퍼 — collapsable={false}가 없으면 안드로이드가 뷰를 플래튼해 measureInWindow가 사라진다.
              TouchableOpacity는 collapsable prop을 받지 않으므로 View로 한 겹 감싼다. */}
          <View ref={sortBtnRef} collapsable={false}>
            <TouchableOpacity
              style={s.sortBtn}
              onPress={openSortMenu}
              accessibilityRole="button"
              accessibilityLabel={t(sortOrder === 'latest' ? 'trip.sortLatest' : 'trip.sortOldest')}
            >
              <Text style={s.sortLabel}>{t(sortOrder === 'latest' ? 'trip.sortLatest' : 'trip.sortOldest')}</Text>
              <ChevronIcon size={16} color="rgba(255,255,255,0.9)" up={sortMenuVisible} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 형식 행: 기록이 있는 형식만 한 줄씩 ── */}
        <View style={s.rows}>
          {sortedModules.map((m) => {
            const open = expandedType === m.vt;
            // 행 배경 사진 — 이 형식 사진 중 한 장이 행을 꽉 채운다(풍경 80 · 사람 15 · 음식 5).
            // 분석이 끝나기 전에는 후보 첫 장을 깔아 두고, 끝나면 고른 사진으로 갈아탄다.
            const rowBg = rowPhoto[m.vt] ?? (rowCands[m.vt] ?? [])[0];
            return (
              <Animated.View key={m.vt} style={[s.rowWrap, { opacity: headerAnim }]}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleModule(m.vt)}
                  style={s.row}
                  accessibilityRole="button"
                  accessibilityLabel={viewTypeName(m.vt, t)}
                >
                  {rowBg ? (
                    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                      <Image source={{ uri: rowBg }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    </View>
                  ) : (
                    <LinearGradient colors={m.config.gradient} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
                  )}
                  {/* 시안: 세로 선 기준 왼쪽(글자 쪽)만 블러+스크림+틴트, 오른쪽(chevron 쪽)은 사진이 선명하게 */}
                  <View style={s.rowGlass} pointerEvents="none">
                    {/* 안드로이드는 experimentalBlurMethod 없으면 no-op — 프로필 정보 바와 같은 dimezisBlurView(실기기 확인 필요) */}
                    <BlurView intensity={10} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                    {/* 가로 스크림 — 글자 쪽을 진하게 덮어 사진 위에서도 읽히게 */}
                    <LinearGradient
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      colors={['rgba(14,14,22,0.7)', 'rgba(14,14,22,0.45)', 'rgba(14,14,22,0.25)']}
                      locations={[0, 0.5, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    {/* 형식색 틴트 — 시안의 '피드는 파랑 기운' 처럼 형식색이 왼쪽에서 은은히 */}
                    <LinearGradient
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      colors={[m.config.accent + '40', m.config.accent + '00']}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                  {/* 블러 경계 세로 선 */}
                  <View style={s.rowDivider} pointerEvents="none" />
                  <View style={s.rowBody}>
                    <Text style={s.rowName} numberOfLines={1}>{viewTypeName(m.vt, t)}</Text>
                    <View style={s.rowMeta}>
                      {/* FormatIcon은 24 고정이라 0.6배로 줄여 14 박스에 맞춘다 */}
                      <View style={s.rowIconBox}>
                        <View style={{ transform: [{ scale: 0.6 }] }}>
                          <FormatIcon type={m.vt} color={COLORS.white} />
                        </View>
                      </View>
                      <Text style={s.rowCount} {...andFitText}>{t('trip.recordsCount', { n: m.items.length })}</Text>
                    </View>
                  </View>
                  <Animated.View
                    style={[s.rowChevron, {
                      transform: [{
                        rotate: chevronFor(m.vt).interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }),
                      }],
                    }]}
                    pointerEvents="none"
                  >
                    <ChevronIcon size={16} color={COLORS.white} />
                  </Animated.View>
                </TouchableOpacity>

                {/* 펼침 — 이 형식의 기록 타일(형식 불문 한 종류). 2개 이상이면 가로 스와이프. */}
                {open && (
                  <View style={s.expandWrap}>
                    {m.items.length > 1 ? (
                      <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={TILE_W + TILE_GAP}
                        decelerationRate="fast"
                        disableIntervalMomentum
                        onLayout={(e) => { tileListW.current = e.nativeEvent.layout.width; recalcTileMore(); }}
                        onContentSizeChange={(w) => { tileContentW.current = w; recalcTileMore(); }}
                        onScroll={(e) => { tileScrollX.current = e.nativeEvent.contentOffset.x; recalcTileMore(); }}
                        scrollEventThrottle={32}
                      >
                        {m.items.map((record, i) => (
                          <RecordTile
                            key={record.id}
                            record={record}
                            onPress={() => handleRecordPress(record)}
                            style={i === m.items.length - 1 ? undefined : { marginRight: TILE_GAP }}
                          />
                        ))}
                      </ScrollView>
                      {/* 오른쪽 끝 페이드 — 3~4번째 타일부터 잘리는 것을 "더 있음"으로 읽히게. 끝까지 넘기면 사라진다 */}
                      {tileMoreRight && (
                        <LinearGradient
                          colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.85)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={s.tileFadeRight}
                          pointerEvents="none"
                        />
                      )}
                      </>
                    ) : (
                      <RecordTile
                        record={m.items[0]}
                        onPress={() => handleRecordPress(m.items[0])}
                        style={{ alignSelf: 'flex-start' }}
                      />
                    )}
                  </View>
                )}
              </Animated.View>
            );
          })}

          {modules.length === 0 && (
            <View style={s.emptyCard}>
              <Text style={s.emptyIcon}>🛰️</Text>
              <Text style={s.emptyText}>{t('trip.emptyTrip')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
      {/* 하단 페이드 — 형식 행이 화면 아래까지 꽉 찼을 때 "더 있음"으로 읽히게. ScrollView 형제라 스크롤과 무관하게 고정 */}
      {listMoreBottom && (
        <View style={[s.listFadeBottom, { height: 72 + insets.bottom }]} pointerEvents="none">
          {/* 유리 느낌 — 옅은 블러 위에 배경색 그라데이션. 안드로이드는 experimentalBlurMethod 없으면 no-op이라
              프로필 썸네일 정보 바(ProfileVisuals)와 같은 dimezisBlurView. 뒤가 어두운 목록이라 흰 블룸 문제 없음 */}
          <BlurView
            intensity={22}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.55)', 'rgba(10,10,15,0.85)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* 헤더 — 히어로 사진 위에 겹친다(배경 투명). 사진이 상태바 아래까지 깔리도록 absolute이고,
          ScrollView 뒤(나중)에 선언 + zIndex·elevation으로 안드로이드에서도 위에 그린다. */}
      <Animated.View style={[s.header, { opacity: headerAnim, paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        {/* 제목 가독성용 딤은 히어로 상단 그라데이션(heroTopDim)이 맡는다 — 헤더 높이에 갇힌 띠가 되지 않게 */}
        <View style={s.headerSide}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtnPlain} accessibilityRole="button" accessibilityLabel={t('trip.back')}>
            <BackChevronIcon />
          </TouchableOpacity>
        </View>
        <View style={s.headerCenter}>
          {isEditing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                value={editedTitle}
                onChangeText={setEditedTitle}
                style={s.headerInput}
                autoFocus
                onSubmitEditing={handleSaveTitle}
              />
              <TouchableOpacity onPress={handleSaveTitle} style={s.saveTitleBtn}>
                <Text style={s.saveTitleTxt}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setIsEditing(false); setEditedTitle(titleToDisplay); }} style={s.saveTitleBtn}>
                <Text style={s.saveTitleTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.headerTitle} numberOfLines={1}>{titleToDisplay}</Text>
          )}
        </View>
        {/* ⋯ 편집 메뉴 — 타인 여행(게스트)은 편집 대상이 없어 숨김.
            테두리 없는 투명 스페이서로 폭만 유지해 제목 중앙 정렬은 그대로 둔다 */}
        {isGuest ? (
          <View style={s.headerSide} />
        ) : (
          <View style={[s.headerSide, { justifyContent: 'flex-end', gap: 6 }]}>
            {/* ✨ 여행 기억 — 이 여행 기간에 캡처한 순간 보기 (내 여행에만 표시) */}
            {TRAVEL_MOMENTS_ENABLED && (
              <TouchableOpacity
                style={s.backBtn}
                onPress={() => setMomentSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('moments.sheetTitle')}
              >
                <Text style={{ fontSize: 16 }}>✨</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.moreBtn} onPress={() => setMenuVisible(true)} accessibilityRole="button" accessibilityLabel={t('trip.editMenuA11y')}>
              {/* 앱 공용 링 — 블로그·게시물 상세 알약과 같은 좌상단·우하단 흰색 대각 그라데이션(PillRing diagonal).
                  버튼이 36 고정이라 실측(AutoPillRing) 없이 직접 얹는다. Svg는 View(pointerEvents none)로 감싸 터치 삼킴 방지 */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <PillRing width={MORE_BTN} height={MORE_BTN} radius={MORE_BTN / 2} diagonal />
              </View>
              <View style={s.moreDots}>
                <View style={s.moreDot} />
                <View style={s.moreDot} />
                <View style={s.moreDot} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// 실제 댓글 수 (시드 숫자 record.comments 대신 commentsByPost 기준 — 답글 포함)
function useCommentCount(recordId: string): number {
  const { commentsByPost } = useRecords();
  const list = commentsByPost[recordId] ?? [];
  return list.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);
}

// ─── 기록 타일 — 형식 펼침 시 나오는 카드(피드·블로그·스냅·스트립·사진첩 공통 1종) ───
// useCommentCount가 훅이라 목록 안에서 바로 부를 수 없어 별도 컴포넌트로 뺀다.
function RecordTile({ record, onPress, style }: {
  record: TravelRecord;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const commentCount = useCommentCount(record.id);
  const photo = recordThumbs(record)[0];
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[tile.card, style]}>
      {photo ? (
        <>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          {/* 아래쪽만 어둡게 — 날짜가 밝은 사진 위에서도 읽히게 */}
          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </>
      ) : null}
      {/* 0이면 숫자를 지우고 아이콘만 둔다(시안) */}
      <View style={tile.stats} pointerEvents="none">
        <View style={tile.statRow}>
          <HeartIcon size={14} color={COLORS.white} />
          {record.likes > 0 && <Text style={tile.statTxt}>{record.likes}</Text>}
        </View>
        <View style={tile.statRow}>
          <CommentIcon size={14} color={COLORS.white} />
          {commentCount > 0 && <Text style={tile.statTxt}>{commentCount}</Text>}
        </View>
      </View>
      {/* 게시일(작성 시각) — 여행 날짜(record.date)가 아니다(사용자 지정). 서버 조회본 등 timestamp가 없으면 여행 날짜로 폴백 */}
      <Text style={tile.date} numberOfLines={1}>{record.timestamp ? fmtDotDate(record.timestamp) : record.date}</Text>
    </TouchableOpacity>
  );
}

// ─── 메인 스타일 ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  // 히어로 사진 위에 겹치는 투명 헤더. ScrollView보다 위에 그려야 하므로 zIndex(iOS)+elevation(Android).
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  // 뒤로가기만 박스 없이 chevron(앱 전 화면 공통). ✨는 위 backBtn 카드형 유지
  backBtnPlain: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  // ⋯ 버튼 — 사진 위에 뜨므로 테두리 흰 55%·바탕 검정 15%로 어느 사진에서나 보이게
  // 테두리는 PillRing(대각 그라데이션)이 그리므로 borderWidth 없음 — overflow hidden도 금지(링이 잘린다)
  moreBtn: {
    width: MORE_BTN, height: MORE_BTN, borderRadius: MORE_BTN / 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  moreDot: { width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: COLORS.white },
  // 좌(뒤로가기)·우(✨·⋯) 동일 폭 → 가운데 제목이 버튼 개수와 무관하게 항상 화면 중앙
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white, letterSpacing: -0.3, textAlign: 'center' },
  headerInput: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 120,
  },
  saveTitleBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTitleTxt: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  // 히어로 — 높이는 창 높이에서 파생되므로 호출부에서 인라인으로 주입한다
  hero: { position: 'relative', overflow: 'hidden', backgroundColor: '#1A0A2E' },
  heroEmoji: { fontSize: 64 },
  heroBottomRow: {
    // 사진 옆·아래 여백 16 (사용자 지정)
    position: 'absolute', left: 0, right: 0, bottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroDate: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },
  heroCount: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },

  /* ── 정렬 행 ── */
  // 히어로 사진 ↔ 정렬 행 ↔ 첫 형식 행 간격 16 (사용자 지정)
  sortRow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, alignItems: 'flex-end' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  // 섹션
  // 빈 상태
  emptyCard: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },

  /* ── ☰ 편집 메뉴 ── */
  // 시안(2026-09-24)은 뒤 화면을 어둡게 하지 않는다 — 딤 없는 투명 오버레이(바깥 탭으로 닫기만)
  menuOverlay: { flex: 1, backgroundColor: 'transparent' },
  menuTopDim: { position: 'absolute', top: 0, left: 0, right: 0 },
  // ⋯ 메뉴 카드 — 게시물 상세 ⋯ 메뉴와 같은 시안 스타일(흰 10% 반투명, rx10, 테두리 없음, 링은 AutoPillRing).
  // overflow:'hidden' 금지 — 링이 잘린다. 행 배경이 없어 클립이 필요 없다.
  menuSheet: {
    position: 'absolute', top: 100, right: 16, minWidth: 130,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
  },
  // 행 28 · 글자 13 — 게시물 상세 ⋯ 메뉴와 동일 치수(시안 SVG 130×88 = 3행)
  menuItem: { flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 12, gap: 8 },
  menuItemText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  menuItemDanger: { color: '#FF3B30' },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  /* ── 기록 추가 형식 선택 모달 ── */
  fmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  // 카드·항목 모두 borderWidth·overflow:'hidden' 금지 — AutoPillRing 링이 테두리를 그린다
  fmCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
  },
  fmTitle: { color: COLORS.white, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  fmSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  fmGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  // 버튼 바탕 #2E2E3B = 디자인 토큰 '카드'이자 RecordFab 피드 아이콘 구멍 색
  fmItem: {
    width: 92, height: 82,
    backgroundColor: '#2E2E3B', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  fmName: { color: COLORS.white, fontSize: 12, fontWeight: '700' },

  /* ── 썸네일 사진 선택 시트 ── */
  // thumbOverlay는 딤 배경(flex:1 + rgba) — 좁히면 폴드에서 양옆이 안 어두워지므로 전면 유지한다.
  thumbOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  // thumbSheet는 콘텐츠 래퍼. RN Modal이라 루트 클램프 밖이고 thumbCellSize가 Stage 폭(≤480)
  // 기준이라, 시트를 같은 폭으로 가두고 중앙에 둬야 썸네일 3열이 시트 폭과 맞는다.
  // (padding 16*2 + gap 8*2 = 32+16이 thumbCellSize 계산의 전제다)
  thumbSheet: {
    backgroundColor: '#16121F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingVertical: 20, paddingHorizontal: 16, paddingBottom: 40, // 좌우는 화면 gutter 16
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
  },
  thumbTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  thumbSub: { color: COLORS.textDim, fontSize: 13, marginBottom: 16 },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // width·height는 Stage 폭에서 파생되므로 호출부에서 인라인으로 주입한다.
  thumbCell: {
    borderRadius: 10, backgroundColor: '#1A0A2E',
  },
  thumbCancel: {
    marginTop: 16, paddingVertical: 14, borderRadius: 999, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  thumbCancelTxt: { color: COLORS.white, fontSize: 15, fontWeight: '600' },

  /* ── 형식 행 (시안: 사진 배경 + 왼쪽 스크림) ── */
  rows: { paddingHorizontal: 16 },
  rowWrap: { marginBottom: 16 },
  row: {
    height: ROW_H, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: '#2E2E3B',
    flexDirection: 'row', alignItems: 'center',
  },
  rowBody: { flex: 1, paddingLeft: 16 },
  rowName: { fontSize: 18, fontWeight: '800', color: COLORS.white, letterSpacing: -0.3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rowIconBox: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  rowCount: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  // 선 오른쪽 선명 구간 폭 = chevron 30 + 오른쪽 여백 12 + 왼쪽 숨 10 (chevron이 구간 가운데)
  rowGlass: { position: 'absolute', top: 0, bottom: 0, left: 0, right: ROW_CLEAR_W, overflow: 'hidden' },
  rowDivider: { position: 'absolute', top: 0, bottom: 0, right: ROW_CLEAR_W, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  // 화살표 뒤 반투명 원은 뺐다(사용자 지시) — 크기·위치는 그대로 두어 터치 영역과 선 오른쪽 구간 배치 유지
  rowChevron: {
    width: 30, height: 30, marginRight: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  expandWrap: { marginTop: 12 },
  tileFadeRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 56 },
  listFadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

// ─── 기록 타일 스타일 ───
const tile = StyleSheet.create({
  card: {
    width: TILE_W, height: TILE_H, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#2E2E3B',
  },
  stats: { position: 'absolute', top: 10, right: 10, gap: 6, alignItems: 'flex-end' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt: { fontSize: 12, fontWeight: '600', color: COLORS.white },
  date: {
    position: 'absolute', left: 10, bottom: 10,
    fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.85)',
  },
});
