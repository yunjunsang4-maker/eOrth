import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Image,
  Platform,
  Modal,
  Dimensions,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
  Path as SvgPath,
  Circle as SvgCircle,
} from 'react-native-svg';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import ImportCtaButton from '../components/ImportCtaButton';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { countryInfoFromCode, clusterForeignTrips, mergeScannedTrips, type ScannedPhoto, type ScannedTrip } from '../utils/pastTripScan';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { countryTagLabel } from '../utils/countryLabel';
import AssetImage from '../components/AssetImage';
import { locateCountry } from '../utils/countryLocate';
import {
  bucketRanges,
  probeOrder,
  segmentsFromProbes,
  fillCountries,
  nextBoundaryProbe,
  estimateProbeCount,
  collectImportedAssetIds,
  excludeImported,
  overlapsImportedTrip,
  MAX_BOUNDARY_STEPS,
  type ProbePoint,
} from '../utils/scanSampling';
import { requestNotificationPermission } from '../services/snapService';
import type { RootStackScreenProps } from '../navigation/types';

// 분석 기간 옵션 — 기간이 길수록 조회·지오코딩할 사진이 많아져 분석 시간이 길어진다.
// 사진 수 상한 없음: 기간 내 사진은 전부 스캔한다 (과거엔 maxAssets 상한 도달 시
// 최신순 스캔이라 오래된 여행이 잘려 누락되는 문제가 있어 제거).
type ScanPeriodKey = 'since' | '1y' | '3y' | 'all';
interface ScanPeriodOption {
  key: ScanPeriodKey;
  label: string;
  years: number | null; // null = 전체 기간
  // 'since' 전용 — 이 시각 이후에 찍은 사진만 스캔(마지막 가져오기 시점 기준)
  sinceTs?: number;
}
const BASE_SCAN_PERIODS: ScanPeriodOption[] = [
  { key: '1y', label: '최근 1년', years: 1 },
  { key: '3y', label: '최근 3년', years: 3 },
  { key: 'all', label: '전체 스캔', years: null },
];
// 재스캔 여유분 — 마지막 가져오기 직전에 찍은 사진이나, 경계에 걸친 여행이
// 통째로 빠지지 않도록 조금 앞에서부터 훑는다.
const RESCAN_OVERLAP_MS = 14 * 24 * 60 * 60 * 1000;
// '지난 불러오기 이후' 옵션 (label은 비표시 필드 — 화면 라벨은 periodLabel의 i18n을 쓴다)
const makeSincePeriod = (lastImportAt: number): ScanPeriodOption => ({
  key: 'since',
  label: 'since-last-import',
  years: null,
  sinceTs: Math.max(0, lastImportAt - RESCAN_OVERLAP_MS),
});
const MIN_TRIP_PHOTOS = 10; // 이 장수 이하인 여행은 결과에서 제외 (10장 초과만 표시)

// 플랫폼별 안내 문구
// iOS: GPS는 로컬 메타데이터로 읽으므로 iCloud 최적화 사진도 다운로드 없이 빠르게 분석
// Android: MediaStore(로컬)만 읽음 → 빠름, 단 클라우드 전용(기기에서 내린) 사진은 제외될 수 있음
const fmtYmd = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const periodRangeText = (p: ScanPeriodOption, tr: TFunction) =>
  p.key === 'since' && p.sinceTs
    ? tr('imports.periodSinceRange', { date: fmtYmd(p.sinceTs) })
    : p.years
      ? tr('imports.periodRecentYears', { years: p.years })
      : tr('imports.periodAllRange');
const periodLabel = (p: ScanPeriodOption, tr: TFunction) =>
  p.key === 'since' ? tr('imports.periodSince')
    : p.key === '1y' ? tr('imports.period1y')
    : p.key === '3y' ? tr('imports.period3y')
    : tr('imports.periodAll');
const scanSubNote = (p: ScanPeriodOption, tr: TFunction) =>
  Platform.OS === 'ios'
    ? tr('imports.analyzingPeriodIos', { range: periodRangeText(p, tr) })
    : tr('imports.analyzingPeriod', { range: periodRangeText(p, tr) });

// 진행률 구간에 연동한 단계별 분석 문구.
// startScan: 사진 페이지네이션(progress 0 고정) → GPS 추출(0~55) → 국가 판정(55~95) → 클러스터링(→100)
const scanPhaseText = (progress: number, tr: TFunction) => {
  if (progress <= 0) return tr('imports.scanPhotos');
  if (progress < 55) return tr('imports.scanLocations');
  if (progress < 95) return tr('imports.scanCountries');
  if (progress < 100) return tr('imports.scanGrouping');
  return tr('imports.scanAlmost');
};

// 촬영일은 asset.creationTime 단일 기준을 쓴다.
// iOS는 PHAsset.creationDate, Android는 MediaStore DATE_TAKEN으로 둘 다 '촬영 시각'이며
// getAssetsAsync가 공짜로 준다. 과거엔 EXIF DateTimeOriginal을 1순위로 파싱했지만, EXIF를
// 읽으려면 사진마다 getAssetInfoAsync(원본 파일 열기)가 필요해 스캔이 느려지는 원인이었고,
// 샘플링 도입 후에는 탐침한 사진만 EXIF를 갖게 돼 시각 기준이 뒤섞이는 문제도 있었다.

type Props = RootStackScreenProps<'TravelImport'>;

// 시안(130:1137)의 중앙 오브 비주얼 — 애니메이션을 위해 z순서대로 레이어 분해한
// 투명 스프라이트(모두 같은 402×404 캔버스 래스터라 absoluteFill 중첩 시 위치 일치).
// 재생성: scripts/build-import-orb-layers.js
const ORB_SPHERE = require('../../assets/import-orb/sphere.png');
const ORB_VR_BACK = require('../../assets/import-orb/vrings-back.png');
const ORB_CROSS = require('../../assets/import-orb/cross.png');
const ORB_VR_FRONT = require('../../assets/import-orb/vrings-front.png');
const ORB_HRINGS = require('../../assets/import-orb/hrings.png');
const ORB_DOT = require('../../assets/import-orb/dot.png');
const SCREEN_W = Dimensions.get('window').width;
const ORB_W = SCREEN_W;
const ORB_H = SCREEN_W * (1212 / 1206);
const ORB_PT = ORB_W / 402; // 시안 pt → 화면 px 배율

// ── 오브 애니메이션 유틸 ──
// 단일 선형 루프 + 사인 보간 테이블 — sequence/loop의 JS 경계에서 생기는 툭툭 끊김 방지
const WAVE_N = 33;
function sineLoop(v: Animated.Value, amp: number, center = 0, phase = 0) {
  const inp: number[] = [], out: number[] = [];
  for (let i = 0; i < WAVE_N; i++) {
    const t = i / (WAVE_N - 1);
    inp.push(t);
    out.push(center + amp * Math.sin(2 * Math.PI * (t + phase)));
  }
  return v.interpolate({ inputRange: inp, outputRange: out });
}
// 십자선 순찰 — 우/상/좌/하 4구간, 각 구간에서 sin²(0→진폭→0)으로 나갔다 돌아온다.
// 구간 양끝 속도 0이라 중앙에서 잠깐 머무는 스캐너 리듬이 된다.
function patrolWave(v: Animated.Value, axis: 'x' | 'y', amp: number) {
  const inp: number[] = [], out: number[] = [];
  const SEG = 16;
  for (let s = 0; s < 4; s++) {
    for (let i = s === 0 ? 0 : 1; i <= SEG; i++) {
      const t = (s + i / SEG) / 4;
      const bump = Math.sin(Math.PI * (i / SEG)) ** 2;
      let val = 0;
      if (axis === 'x') val = s === 0 ? amp * bump : s === 2 ? -amp * bump : 0;
      else val = s === 1 ? -amp * bump : s === 3 ? amp * bump : 0;
      inp.push(t);
      out.push(val);
    }
  }
  return v.interpolate({ inputRange: inp, outputRange: out });
}

// 분석 효과 오브 — 링은 축 방향 회전 투영(scale 진동), 보라 원은 십자선 왕복 순찰.
// width 미지정 시 화면 폭(초기 화면). 스캔 화면 등은 작은 width로 재사용한다.
function ImportOrbVisual({ width = ORB_W }: { width?: number }) {
  const spinV = useRef(new Animated.Value(0)).current; // 세로 링
  const spinH = useRef(new Animated.Value(0)).current; // 가로 링
  const walk = useRef(new Animated.Value(0)).current;  // 보라 원 순찰

  useEffect(() => {
    const mk = (v: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
      );
    const anims = [mk(spinV, 5600), mk(spinH, 7200), mk(walk, 9600)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [spinV, spinH, walk]);

  // 세로 링: 세로축 회전의 좌우 폭 투영, 가로 링: 가로축 회전의 상하 폭 투영
  const vScaleX = sineLoop(spinV, 0.16, 1);
  const hScaleY = sineLoop(spinH, 0.16, 1, 0.4);

  // 보라 원: 십자선 끝(±160pt)까지 왕복. 스프라이트에 박힌 기본 위치를 정적 래퍼로
  // 십자 교점에 되돌린 뒤 대칭 순찰시킨다. 오프셋은 래스터 실측값(scripts/measure-orb-dot.js).
  const pt = width / 402; // 시안 pt → 이 오브 크기 배율
  const AMP = 160 * pt;
  const dotX = patrolWave(walk, 'x', AMP);
  const dotY = patrolWave(walk, 'y', AMP);
  const wrap = { width, height: width * (1212 / 1206) };

  return (
    <View style={wrap}>
      <Image source={ORB_SPHERE} style={styles.orbLayer} />
      <Animated.Image source={ORB_VR_BACK} style={[styles.orbLayer, { transform: [{ scaleX: vScaleX }] }]} />
      <Image source={ORB_CROSS} style={styles.orbLayer} />
      <Animated.Image source={ORB_VR_FRONT} style={[styles.orbLayer, { transform: [{ scaleX: vScaleX }] }]} />
      <Animated.Image source={ORB_HRINGS} style={[styles.orbLayer, { transform: [{ scaleY: hScaleY }] }]} />
      <View style={[styles.orbLayer, { transform: [{ translateX: -46.53 * pt }, { translateY: 0.54 * pt }] }]}>
        <Animated.Image
          source={ORB_DOT}
          style={[styles.orbLayer, { transform: [{ translateX: dotX }, { translateY: dotY }] }]}
        />
      </View>
    </View>
  );
}

// 분석 기간 칩 — 상단좌측이 밝고 하단우측으로 어두워지는 그라데이션 테두리(입체감).
function PeriodChip({ label, on, idSuffix, onPress }: { label: string; on: boolean; idSuffix: string; onPress: () => void }) {
  const [w, setW] = useState(0);
  const H = 25;
  const gid = `periodChipRing_${idSuffix}`;
  return (
    <TouchableOpacity
      style={[styles.periodChip, on && styles.periodChipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 && (
        <Svg width={w} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgDefs>
            <SvgLinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
              <SvgStop offset="0.35" stopColor="#FFFFFF" stopOpacity={0.12} />
              <SvgStop offset="0.65" stopColor="#88888F" stopOpacity={0.12} />
              <SvgStop offset="1" stopColor="#88888F" stopOpacity={0.6} />
            </SvgLinearGradient>
          </SvgDefs>
          <SvgRect
            x={0.5} y={0.5} width={w - 1} height={H - 1} rx={(H - 1) / 2}
            fill="none" stroke={`url(#${gid})`} strokeWidth={1}
          />
        </Svg>
      )}
      <Text style={styles.periodTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// 스캔 중 발견된 나라 국기 칩 — 마운트 시 톡 튀어오르며 나타난다(스프링).
function FlagChip({ flag, name }: { flag: string; name: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[
        styles.flagChip,
        { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
      ]}
    >
      <Text style={styles.flagChipEmoji}>{flag}</Text>
      <Text style={styles.flagChipName} numberOfLines={1}>{name}</Text>
    </Animated.View>
  );
}

// 사진 장수 앞 카메라 아이콘 — 선(outline) 스타일. 앱 CameraIcon은 꽉 찬 실루엣이라
// 회색으로 써도 이모지처럼 보여서, 얇은 스트로크로 UI 아이콘답게 다시 그린다.
function PhotoCountIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M4.5 8h2.2l1.1-1.7A1 1 0 0 1 8.6 6h6.8a1 1 0 0 1 .8.3L17.3 8h2.2A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8Z"
        stroke={color} strokeWidth={1.6} strokeLinejoin="round"
      />
      <SvgCircle cx={12} cy={13} r={3.2} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

// 결과 여행 카드 — 마운트 시 스태거 페이드·슬라이드인, 선택 체크박스는 그라데이션 필로 스프링.
function TripCard({
  trip, index, selected, onPress, lang,
}: {
  trip: ScannedTrip;
  index: number;
  selected: boolean;
  onPress: () => void;
  lang: string;
}) {
  const { t } = useTranslation();
  const enter = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index, 8) * 60, // 최대 8장까지만 지연 누적(그 이상은 동시)
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  useEffect(() => {
    Animated.spring(check, { toValue: selected ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [selected, check]);

  return (
    <Animated.View
      style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}
    >
      <TouchableOpacity
        style={[styles.tripCard, selected && styles.tripCardSelected]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <AssetImage uri={trip.medias[0]} assetId={trip.photos[0]?.id} style={styles.cardImage} />
        <View style={styles.cardInfo}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.countryBadge}>
              <Text style={styles.countryText}>{countryTagLabel(trip.country, lang)}</Text>
            </View>
            {/* 같은 국가·기간의 기록이 이미 있는 여행 — 기본 선택에서 빠져 있고, 원하면 직접 선택 */}
            {trip.alreadyImported && (
              <View style={styles.importedBadge}>
                <Text style={styles.importedBadgeTxt}>{t('imports.alreadyImported')}</Text>
              </View>
            )}
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              <Animated.View
                style={[
                  styles.checkFill,
                  { opacity: check, transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
                ]}
              >
                <LinearGradient
                  colors={['#FF14E4', '#00D8F3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Animated.View>
            </View>
          </View>
          <Text style={styles.cardTitle}>{trip.title}</Text>
          <Text style={styles.cardDate}>{trip.startDate} ~ {trip.endDate.substring(5)}</Text>
          <View style={styles.cardFooter}>
            <PhotoCountIcon size={14} color={Colors.textSecondary} />
            <Text style={styles.photoCountText}>{t('imports.photosFound', { count: trip.photoCount })}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TravelImportScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { homeCountryCode, lastImportAt } = useSettings();
  // 이미 가져온 사진·여행 판정용 — 앱 내에서 다시 불러오기를 열었을 때 중복 카드를 막는다
  const { records } = useRecords();
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // 과거 여행 불러오기를 건너뛰고(또는 결과 없이) 메인으로 갈 때도 튜토리얼(코치마크) 자동 실행
  // 온보딩 마지막 단계 — 메인 진입 직전에 알림 권한을 한 번 요청한다 (사용 중 뜬금 팝업 방지)
  const goMainWithTutorial = async () => {
    await requestNotificationPermission().catch(() => {});
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
  };
  const [, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [scanning, setScanning] = useState(false);
  // 스캔 취소 플래그 — startScan의 페이지네이션·GPS·지오코딩 루프가 매 반복마다 확인
  const scanCancelRef = useRef(false);
  useEffect(() => () => { scanCancelRef.current = true; }, []); // 화면 이탈 시 진행 중 스캔 중단
  const [scanFinished, setScanFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scannedTrips, setScannedTrips] = useState<ScannedTrip[]>([]);
  const [isImporting] = useState(false);
  const [isLimited, setIsLimited] = useState(false); // 사진 권한이 'limited'(선택 사진만)인지
  // 분석 기간 목록 — 이전에 가져온 적이 있으면 '지난 불러오기 이후' 옵션을 맨 앞에 추가한다.
  // 재스캔은 그 이후 사진만 보면 충분해 버킷 수(=좌표 조회 횟수)가 크게 줄어든다.
  const scanPeriods = useMemo<ScanPeriodOption[]>(
    () => (lastImportAt ? [makeSincePeriod(lastImportAt), ...BASE_SCAN_PERIODS] : BASE_SCAN_PERIODS),
    [lastImportAt]
  );
  // 기본 선택: 재스캔이면 '지난 불러오기 이후', 첫 스캔이면 최근 1년
  const [period, setPeriod] = useState<ScanPeriodOption>(() =>
    lastImportAt ? makeSincePeriod(lastImportAt) : BASE_SCAN_PERIODS[0]
  );

  // 스캔 중 실시간으로 발견한 해외 나라(중복 제외) — 국기 칩으로 톡톡 등장
  const [discovered, setDiscovered] = useState<{ code: string; flag: string; name: string }[]>([]);
  // 진행률을 부드럽게 뒤따르는 Animated 값 — 바 채움(width)과 % 카운트업에 함께 쓴다
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => setDisplayPct(Math.round(value)));
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width 보간이라 네이티브 드라이버 불가
    }).start();
  }, [progress, progressAnim]);
  const barWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  // 여행 합치기 (같은 국가가 여러 여행으로 나뉜 경우 — 예: 교환학생 거점 국가)
  const [mergeVisible, setMergeVisible] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);

  // Sync selected IDs when scannedTrips change
  // 첫 스캔 결과에는 전체 선택, 합치기 등으로 목록이 바뀌면 기존 선택을 보존하며 유효한 id만 남긴다
  useEffect(() => {
    if (scannedTrips.length > 0) {
      setSelectedIds((prev) =>
        prev.length === 0
          // 첫 스캔 결과는 전체 선택 — 단 이미 가져온 여행은 빼 둔다(사용자가 원하면 직접 선택)
          ? scannedTrips.filter((t) => !t.alreadyImported).map((t) => t.id)
          : prev.filter((id) => scannedTrips.some((t) => t.id === id))
      );
    }
  }, [scannedTrips]);

  const requestPermission = async () => {
    try {
      // 사진(MediaLibrary) 권한만 요청한다. 위치 권한은 불필요:
      // info.location은 사진 EXIF의 GPS이고, reverseGeocodeAsync는 좌표를 직접 받는다.
      const perm = await MediaLibrary.requestPermissionsAsync(false);

      if (perm.status === 'granted') {
        setPermissionStatus('granted');
        // '선택한 사진만'은 status가 아니라 accessPrivileges로 온다 —
        // status==='limited' 비교는 절대 참이 되지 않아 제한 접근 안내가 전부 빗나갔다.
        setIsLimited(perm.accessPrivileges === 'limited');
        startScan();
      } else {
        setPermissionStatus('denied');
        setScanFinished(true);
        setScannedTrips([]);
        // OS는 한 번 거부하면 다이얼로그를 다시 안 띄운다 — 설정 이동 동선을 제공해
        // "여행 못 찾음" 화면에서 재허용 경로 없이 데드엔드가 되는 것을 막는다.
        showPermissionDeniedAlert(t('imports.galleryPermTarget'));
      }
    } catch (err) {
      console.error('Permission request failed:', err);
      setPermissionStatus('denied');
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // startScan 데이터 흐름:
  //   1) 권한    : MediaLibrary(사진) 권한만 사용. 위치 권한 불필요
  //                (info.location = 사진 EXIF의 GPS, reverseGeocodeAsync는 좌표를 직접 받음).
  //   2) 스캔    : getAssetsAsync를 endCursor/hasNextPage로 페이지네이션. createdAfter로
  //                선택한 기간의 사진만 순회(creationTime 정렬, 사진 수 상한 없음).
  //   3) 샘플링  : ⚠️ 사진 1장마다 getAssetInfoAsync를 부르면 안 된다 — iOS 구현이 매번
  //                원본 파일을 열어 EXIF를 파싱해(requestContentEditingInput + CIImage)
  //                스캔 시간이 사진 개수에 비례해 폭증했다(2만 장 = 수십 초~수 분).
  //                대신 촬영시각으로 12시간 버킷을 만들어 버킷당 1~3장만 좌표를 조회하고,
  //                국가가 바뀌는 경계만 이분 탐색으로 좁힌 뒤 구간 국가를 전체에 채운다.
  //                → 조회 횟수가 '사진 수'가 아니라 '기간'에 비례(utils/scanSampling.ts).
  //   4) 국가판정: 좌표 → 오프라인 폴리곤(locateCountry) 1순위, 실패분만 reverseGeocodeAsync
  //                폴백(0.5도 버킷 캐시, 250ms 간격, 실패 시 500ms 후 1회 재시도).
  //   5) 클러스터: clusterForeignTrips(scanned, homeCountryCode) → 거주국가 밖 + 7일 묶음.
  //                구간 국가를 물려받으므로 GPS 없는 실내 사진도 여행에 포함된다.
  // ────────────────────────────────────────────────────────────────────────
  const startScan = async () => {
    scanCancelRef.current = false;
    setScanning(true);
    setProgress(0);
    progressAnim.setValue(0); // 재스캔 시 부드러운 바가 이전 값에서 시작하지 않도록 즉시 리셋
    setDisplayPct(0);
    setDiscovered([]);
    setScannedTrips([]);
    setSelectedIds([]); // 재스캔 시 결과 전체 선택이 다시 적용되도록 초기화
    const foundCodes = new Set<string>(); // 발견 나라 중복 방지(홈 국가 제외)

    // 기간 옵션에 따른 조회 시작점. 전체 스캔은 createdAfter 미적용.
    const CREATED_AFTER = period.key === 'since' && period.sinceTs
      ? period.sinceTs
      : period.years
      ? Date.now() - period.years * 365 * 24 * 60 * 60 * 1000
      : undefined;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      // ── 2) 최근 3년 사진 페이지네이션 스캔 ──
      const assets: MediaLibrary.Asset[] = [];
      let after: string | undefined = undefined;
      let hasNext = true;
      while (hasNext) {
        if (scanCancelRef.current) return;
        const page = await MediaLibrary.getAssetsAsync({
          first: 100,
          after,
          mediaType: 'photo',
          sortBy: 'creationTime',
          createdAfter: CREATED_AFTER, // 선택한 기간만 조회 (전체 스캔이면 undefined → 전체)
        });
        if (page.assets.length === 0) break;
        assets.push(...page.assets);
        after = page.endCursor;
        hasNext = page.hasNextPage;
      }
      if (assets.length === 0) throw new Error('No photos found in gallery');

      // 촬영시각 오름차순 보장 — 버킷 분할·경계 탐색이 정렬을 전제로 한다
      assets.sort((x, y) => (x.creationTime || 0) - (y.creationTime || 0));

      // 이미 가져온 사진은 스캔 대상에서 제외 — 앱 내 재실행 시 같은 여행이 중복 카드로
      // 또 만들어지는 것을 막고, 조회 대상이 줄어 재스캔도 빨라진다.
      const importedIds = collectImportedAssetIds(recordsRef.current);
      const scanTargets = excludeImported(assets, importedIds);
      const skippedImported = assets.length - scanTargets.length;
      assets.length = 0;
      assets.push(...scanTargets);
      if (assets.length === 0) throw new Error('No new photos to scan');
      const totalAssets = assets.length;

      // ── 3) 시간 버킷 샘플링으로 좌표 조회 (핵심 최적화) ──
      // getAssetInfoAsync 1회 = 원본 파일 I/O 1회라 호출 횟수 자체를 줄여야 한다.
      // 버킷(12시간)마다 대표 1~3장만 조회하고, 좌표를 얻으면 그 버킷은 즉시 중단한다.
      const buckets = bucketRanges(assets);
      const probeBudget = estimateProbeCount(buckets.length);
      let probesDone = 0;

      // 좌표 → 국가코드 (오프라인 폴리곤 1순위, 실패분만 지오코딩 폴백). 0.5도 버킷 캐시.
      const geocodeCache: Record<string, { code: string; name: string } | null> = {};
      const bucketKey = (lat: number, lon: number) =>
        `${Math.round(lat * 2) / 2}_${Math.round(lon * 2) / 2}`; // 0.5도 단위(국가 판정엔 충분)

      const reverseOnce = async (lat: number, lon: number) => {
        const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        const addr = res && res[0];
        return addr?.isoCountryCode
          ? { code: addr.isoCountryCode, name: addr.country || addr.isoCountryCode }
          : null;
      };

      const countryAt = async (lat: number, lon: number) => {
        const key = bucketKey(lat, lon);
        let geo = geocodeCache[key];
        if (geo === undefined) {
          geo = locateCountry(lat, lon); // 오프라인 point-in-polygon (즉시)
          if (!geo) {
            // 폴리곤 미포함(해안·국경 인접) 좌표만 지오코딩 — 전체의 극히 일부
            try {
              geo = await reverseOnce(lat, lon);
            } catch {
              await sleep(500);
              try { geo = await reverseOnce(lat, lon); } catch { geo = null; }
            }
            await sleep(250); // 레이트리밋 회피 (캐시 히트·오프라인 성공 시엔 대기 없음)
          }
          geocodeCache[key] = geo;
        }
        return geo;
      };

      // 자산 1건의 좌표를 읽어 국가코드로 — localUri도 함께 회수해 저장 단계의 재조회를 줄인다
      const localUriById = new Map<string, string>();
      const probeCountry = async (index: number): Promise<string | null> => {
        const asset = assets[index];
        probesDone++;
        // 진행률 0~80%는 샘플링 구간 (예산 초과 시 80에서 멈춰 있게)
        setProgress(Math.min(80, Math.round((probesDone / Math.max(1, probeBudget)) * 80)));
        try {
          // location은 PHAsset 로컬 DB 값이라 iCloud 다운로드 불필요(shouldDownloadFromNetwork:false)
          const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
          if (info.localUri) localUriById.set(asset.id, info.localUri);
          const lat = Number(info.location?.latitude);
          const lon = Number(info.location?.longitude);
          if (!info.location || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const geo = await countryAt(lat, lon);
          if (!geo) return null;
          // 거주국 밖의 새 나라를 처음 만나면 국기 칩으로 실시간 노출
          if (geo.code !== homeCountryCode && !foundCodes.has(geo.code)) {
            foundCodes.add(geo.code);
            const cinfo0 = countryInfoFromCode(geo.code, geo.name);
            const code = geo.code;
            setDiscovered((prev) =>
              prev.some((d) => d.code === code)
                ? prev
                : [...prev, { code, flag: cinfo0.countryFlag, name: cinfo0.countryName }]
            );
            Haptics.selectionAsync().catch(() => {});
          }
          return geo.code;
        } catch {
          return null;
        }
      };

      const probes: ProbePoint[] = [];
      for (const b of buckets) {
        if (scanCancelRef.current) return;
        // 버킷에서 좌표가 나올 때까지 최대 3장 시도 (실내 사진만 있는 버킷은 미상 처리)
        for (const idx of probeOrder(b.start, b.end)) {
          const code = await probeCountry(idx);
          probes.push({ index: idx, code });
          if (code) break;
        }
        await sleep(0); // UI 양보 + iOS가 메타데이터 메모리를 회수할 틈
      }

      // ── 3-2) 국가 전환 경계를 이분 탐색으로 좁힌다 (출입국 날짜 정확도) ──
      // 좌표를 얻은 탐침만 대상. 인접한 두 탐침의 국가가 다르면 그 사이를 최대 6회 조사한다.
      const known = probes.filter((p) => p.code != null).sort((a2, b2) => a2.index - b2.index);
      for (let k = 1; k < known.length; k++) {
        if (scanCancelRef.current) return;
        if (known[k].code === known[k - 1].code) continue;
        let lo = known[k - 1].index;
        let hi = known[k].index;
        for (let step = 0; step < MAX_BOUNDARY_STEPS; step++) {
          const mid = nextBoundaryProbe(lo, hi);
          if (mid == null) break;
          const code = await probeCountry(mid);
          probes.push({ index: mid, code });
          // 미상이면 더 좁힐 수 없다(어느 쪽인지 모름) → 중단
          if (code == null) break;
          if (code === known[k - 1].code) lo = mid;
          else if (code === known[k].code) hi = mid;
          else break; // 사이에 제3국 — 중간 경계로 두고 종료
        }
      }

      // ── 4) 구간 확정 → 전체 사진에 국가 채우기 ──
      // GPS가 없던 사진도 그 구간의 국가를 물려받는다(실내 사진 누락 해소).
      const segments = segmentsFromProbes(probes, totalAssets);
      const codes = fillCountries(totalAssets, segments);
      setProgress(90);

      const scanned: ScannedPhoto[] = [];
      let geocodedOk = 0;
      for (let i = 0; i < totalAssets; i++) {
        const code = codes[i];
        if (!code) continue;
        geocodedOk++;
        const asset = assets[i];
        const cinfo = countryInfoFromCode(code);
        scanned.push({
          id: asset.id,
          // 표시용 uri는 localUri(file://) 우선 — iOS ph://는 선택 그리드에서 검은 타일로 뜬다.
          // 탐침하지 않은 사진은 ph:// 그대로지만, 선택 화면이 asset id로 썸네일을 만든다.
          uri: localUriById.get(asset.id) || asset.uri,
          localUri: localUriById.get(asset.id),
          creationTime: asset.creationTime || Date.now(),
          countryCode: code,
          countryName: cinfo.countryName,
          countryFlag: cinfo.countryFlag,
        });
      }
      // ── 5) 클러스터링 (거주국가 밖만) + 사진 적은 여행 제외 ──
      const foreignCount = scanned.filter((s) => s.countryCode && s.countryCode !== homeCountryCode).length;
      const allTrips = clusterForeignTrips(scanned, homeCountryCode);
      // 사진 30장 이하 여행은 표시하지 않음 (짧은 경유/오탐 제거)
      const sized = allTrips.filter((t) => t.photoCount > MIN_TRIP_PHOTOS);
      // 2차 방어선 — 자산 id로 못 거른 경우(다른 기기에서 가져옴·사진 재추가 등)를 위해
      // 같은 국가 + 기간이 겹치는 기존 기록이 있으면 표시해 둔다(기본 선택에서 제외된다).
      const importedAlbums = recordsRef.current.filter((r) => r.viewType === 'album');
      const trips = sized.map((t) => ({ ...t, alreadyImported: overlapsImportedTrip(t, importedAlbums) }));

      // 디버그 로그 — 좌표 조회 횟수가 사진 수 대비 얼마나 줄었는지 확인용
      console.log('[TravelImport] 총 스캔 사진:', totalAssets, '/ 버킷:', buckets.length, '/ 이미 가져와 제외:', skippedImported);
      console.log('[TravelImport] 좌표 조회(getAssetInfoAsync):', probesDone, `(사진 대비 ${totalAssets ? Math.round((probesDone / totalAssets) * 100) : 0}%)`);
      console.log('[TravelImport] 국가 확정 구간:', segments.length, '→ 국가 채워진 사진:', geocodedOk);
      console.log('[TravelImport] 거주국가 밖 사진:', foreignCount, '(home=' + homeCountryCode + ')');
      console.log('[TravelImport] 여행 클러스터(전체/' + MIN_TRIP_PHOTOS + '장초과):', allTrips.length, '/', trips.length);

      if (scanCancelRef.current) return;
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => {
        if (scanCancelRef.current) return;
        setScanning(false);
        setScanFinished(true);
        setScannedTrips(trips);
      }, 400);
    } catch (error) {
      if (scanCancelRef.current) return;
      console.error('Scan failed:', error);
      setProgress(100);
      setTimeout(() => {
        if (scanCancelRef.current) return;
        setScanning(false);
        setScanFinished(true);
        setScannedTrips([]);
      }, 400);
    }
  };

  // 스캔 취소 — 진행 중인 루프는 scanCancelRef를 보고 즉시 중단, UI는 시작 화면으로 복귀
  const cancelScan = () => {
    scanCancelRef.current = true;
    setScanning(false);
    setScanFinished(false);
    setProgress(0);
    progressAnim.setValue(0);
    setDisplayPct(0);
    setDiscovered([]);
  };

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ── 여행 합치기 ──
  // 같은 국가의 여행만 함께 선택 가능 (다른 국가가 섞이면 국가·지구본 매칭이 깨짐)
  const mergeCountry = mergeIds.length > 0
    ? scannedTrips.find((t) => t.id === mergeIds[0])?.countryName ?? null
    : null;
  // 같은 국가가 2개 이상으로 나뉜 경우에만 합치기 버튼 노출
  const hasMergeable = scannedTrips.some((t, i) =>
    scannedTrips.some((u, j) => j !== i && u.countryName === t.countryName)
  );

  const toggleMergeId = (id: string) => {
    setMergeIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const confirmMerge = () => {
    const chosen = scannedTrips.filter((t) => mergeIds.includes(t.id));
    if (chosen.length < 2) return;
    const merged = mergeScannedTrips(chosen);
    setScannedTrips((prev) => {
      const rest = prev.filter((t) => !mergeIds.includes(t.id));
      const next = [...rest, merged];
      next.sort(
        (a, b) => new Date(b.date.replace(/\./g, '-')).getTime() - new Date(a.date.replace(/\./g, '-')).getTime()
      );
      return next;
    });
    // 합쳐진 여행은 선택 상태로 추가 (기존 선택은 useEffect가 유효 id만 남겨 보존)
    setSelectedIds((prev) => [...prev.filter((id) => !mergeIds.includes(id)), merged.id]);
    setMergeIds([]);
    setMergeVisible(false);
  };

  const handleImport = () => {
    const chosen = scannedTrips
      .filter((t) => selectedIds.includes(t.id))
      .sort((a, b) => new Date(a.startDate.replace(/\./g, '-')).getTime() - new Date(b.startDate.replace(/\./g, '-')).getTime());
    if (chosen.length === 0) return;
    const trips = chosen.map((t) => ({
      id: t.id,
      country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
      title: t.title, date: t.date, startDate: t.startDate, endDate: t.endDate,
      photos: t.photos, // {id?, uri, localUri?, creationTime?}[] — localUri는 저장 단계 재조회 생략용
    }));
    navigation.navigate('ImportPhotoSelect', { trips, from: route.params?.from });
  };

  // 하단 140pt 여백은 결과 목록의 플로팅 가져오기 바 전용 — 초기·스캔 화면엔 불필요.
  // 컨텐츠가 화면에 다 들어오면 스크롤을 잠근다(작은 기기에서만 스크롤 허용).
  const showResults = scanFinished && scannedTrips.length > 0;
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const canScroll = contentH > viewportH + 1;

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 14, paddingBottom: showResults ? 140 : insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentH(h)}
        scrollEnabled={canScroll}
        bounces={canScroll}
      >

        {/* Header — 결과 화면에서는 부제를 숨기고 아래 결과 문구와 간격을 벌린다 */}
        <View style={[styles.header, showResults && styles.headerResults]}>
          <Text style={styles.stepText}>Final step</Text>
          <Text style={[styles.title, showResults && styles.titleResults]}>{t('imports.tiTitle')}</Text>
          {!showResults && (
            <Text style={styles.subtitle}>
              내 갤러리에서 거주국가 밖에서 찍은 사진을 분석해{'\n'}다녀온 해외여행을 자동으로 찾아드려요.
            </Text>
          )}
        </View>

        {!scanFinished && !scanning ? (
          /* Permission Request View — 시안 130:1137 */
          <View style={styles.initialArea}>
            <View style={styles.orbWrap}>
              <ImportOrbVisual />
            </View>

            {/* 분석 기간 선택 */}
            <View style={styles.periodSection}>
              <Text style={styles.periodTitle}>{t('imports.analyzePeriod')}</Text>
              <View style={styles.periodRow}>
                {scanPeriods.map((p) => (
                  <PeriodChip
                    key={p.key}
                    label={periodLabel(p, t)}
                    on={period.key === p.key}
                    idSuffix={p.key}
                    onPress={() => setPeriod(p)}
                  />
                ))}
              </View>
              <Text style={styles.periodHint}>{t('comp2.importPeriodHint')}</Text>
            </View>

            <ImportCtaButton label={t('imports.grantGalleryFind')} onPress={requestPermission} style={styles.ctaMargin} />

            <TouchableOpacity style={styles.skipBtn} onPress={goMainWithTutorial}>
              <Text style={styles.skipText}>{t('imports.skipManual')}</Text>
            </TouchableOpacity>
          </View>
        ) : scanning ? (
          /* Scanning View — 초기 화면과 동일한 전체 크기 오브 + 아래로 내린 안내/진행 */
          <View style={styles.initialArea}>
            <View style={styles.orbWrap}>
              <ImportOrbVisual />
            </View>

            {/* 단계별 문구(진행률 연동) + 부드럽게 카운트업하는 % */}
            <Text style={styles.scanText}>{scanPhaseText(progress, t)}</Text>
            <Text style={styles.scanProgressText}>{displayPct}%</Text>
            <Text style={styles.scanSubNote}>{scanSubNote(period, t)}</Text>

            {/* 그라데이션 채움 + 진행 끝 발광 */}
            <View style={styles.progressContainer}>
              <Animated.View style={[styles.progressFill, { width: barWidth }]}>
                <LinearGradient
                  colors={['#FF14E4', '#00D8F3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressGrad}
                />
                <View style={styles.progressGlow} />
              </Animated.View>
            </View>

            {/* 실시간 발견 나라 국기 칩 */}
            {discovered.length > 0 && (
              <View style={styles.foundWrap}>
                <Text style={styles.foundLabel}>{t('imports.scanFoundCountries')}</Text>
                <View style={styles.foundChips}>
                  {discovered.map((d) => (
                    <FlagChip key={d.code} flag={d.flag} name={d.name} />
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.scanCancelBtn} onPress={cancelScan} activeOpacity={0.7}>
              <Text style={styles.scanCancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : scannedTrips.length === 0 ? (
          /* 빈 상태 — 해외 사진 못 찾음/권한 거부 */
          <View style={styles.centerArea}>
            <View style={styles.globeGlowWrap}>
              <View style={styles.glowBg} />
              <View style={styles.mockGlobe}>
                <Text style={styles.mockGlobeEmoji}>🔍</Text>
              </View>
            </View>
            <Text style={styles.scanText}>{t('imports.noTripsFound')}</Text>
            <Text style={[styles.resultDesc, { textAlign: 'center', paddingHorizontal: 20 }]}>
              {isLimited ? t('imports.noTripsLimited') : t('imports.noTripsNoGps')}
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={goMainWithTutorial}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.btnGrad}>
                <Text style={styles.btnText}>{t('imports.recordManually')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={goMainWithTutorial}>
              <Text style={styles.skipText}>{t('imports.skip')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Scanned Suggested Trips List View */
          <View style={styles.resultsArea}>
            <Text style={styles.resultTitle}>
              {t('imports.foundTripsPrefix')}<Text style={styles.accentText}>{t('imports.foundTripsCountN', { count: scannedTrips.length })}</Text>{t('imports.foundTripsSuffix')}
            </Text>
            <Text style={styles.resultDesc}>{t('imports.selectTripsDesc')}</Text>
            {isLimited && (
              <Text style={[styles.resultDesc, { color: '#EC34F7', marginTop: -8 }]}>
                {t('imports.limitedHint')}
              </Text>
            )}

            {/* 같은 국가가 여러 여행으로 나뉜 경우 합치기 */}
            {hasMergeable && (
              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={() => { setMergeIds([]); setMergeVisible(true); }}
                activeOpacity={0.85}
              >
                <Text style={styles.mergeBtnTxt}>{t('comp2.importMerge')}</Text>
                <Text style={styles.mergeBtnSub}>{t('imports.mergeSub')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.listWrap}>
              {scannedTrips.map((trip, index) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  index={index}
                  selected={selectedIds.includes(trip.id)}
                  onPress={() => toggleSelect(trip.id)}
                  lang={i18n.language}
                />
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── 여행 합치기 모달 ── */}
      <Modal visible={mergeVisible} transparent animationType="slide" onRequestClose={() => setMergeVisible(false)}>
        <View style={styles.mgOverlay} accessibilityViewIsModal>
          <View style={styles.mgSheet}>
            <Text style={styles.mgTitle}>{t('imports.mergeTitle')}</Text>
            <Text style={styles.mgSub}>
              합칠 여행을 2개 이상 선택하세요.{'\n'}같은 나라의 여행끼리만 합칠 수 있어요.
            </Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {scannedTrips.map((t) => {
                const on = mergeIds.includes(t.id);
                const disabled = !on && mergeCountry !== null && t.countryName !== mergeCountry;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.mgItem, on && styles.mgItemOn, disabled && styles.mgItemDisabled]}
                    onPress={() => toggleMergeId(t.id)}
                    disabled={disabled}
                    activeOpacity={0.85}
                  >
                    <AssetImage uri={t.medias[0]} assetId={t.photos[0]?.id} style={styles.mgThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mgItemTitle}>{t.countryFlag} {t.title}</Text>
                      <Text style={styles.mgItemDate}>
                        {t.startDate} ~ {t.endDate.substring(5)} · 사진 {t.photoCount}장
                      </Text>
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxSelected]}>
                      {on && (
                        <View style={styles.checkFill}>
                          <LinearGradient
                            colors={['#FF14E4', '#00D8F3']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                            <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.mgBtnRow}>
              <TouchableOpacity style={styles.mgCancelBtn} onPress={() => setMergeVisible(false)} activeOpacity={0.85}>
                <Text style={styles.mgCancelTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mgOkBtn, mergeIds.length < 2 && styles.importBtnDisabled]}
                onPress={confirmMerge}
                disabled={mergeIds.length < 2}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#FF14E4', '#00D8F3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mgOkGrad}>
                  <Text style={styles.mgOkTxt}>
                    {mergeIds.length < 2 ? t('imports.mergeSelect2') : t('imports.mergeN', { count: mergeIds.length })}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {scanFinished && scannedTrips.length > 0 && (
        /* Floating Bottom Bar for importing — 우리 CTA 디자인(유리 그라데이션 링) */
        <View style={styles.bottomBar}>
          <ImportCtaButton
            gid="importBottomCta"
            disabled={selectedIds.length === 0}
            loading={isImporting}
            onPress={handleImport}
            label={
              selectedIds.length > 0
                ? t('imports.importSelectedN', { count: selectedIds.length })
                : t('imports.selectTripsToImport')
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0F',
  },
  scroll: {
    paddingHorizontal: Spacing[6],
  },
  header: {
    marginBottom: 0,
  },
  // 결과 화면: 부제가 없으므로 헤더-결과 문구 사이를 넉넉히 벌린다
  headerResults: {
    marginBottom: Spacing[6],
  },
  stepText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#EC34F7',
    marginBottom: Spacing[1],
  },
  title: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: Spacing[3],
  },
  // 결과 화면: 아래에 결과 제목이 붙으므로 타이틀 자체 하단 여백은 없앤다
  titleResults: {
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },

  /* 시안 초기 화면 — 오브 비주얼 + 기간 칩 + CTA */
  orbWrap: {
    width: ORB_W,
    height: ORB_H,
    marginTop: -Spacing[2],
    marginBottom: -Spacing[1],
  },
  orbLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  initialArea: {
    alignItems: 'center',
    width: '100%',
  },

  /* Center Area */
  centerArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    width: '100%',
  },
  globeGlowWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    position: 'relative',
  },
  glowBg: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(123, 97, 255, 0.12)',
  },
  mockGlobe: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 20,
    elevation: 10,
    backgroundColor: '#3B1E8E',
  },
  mockGlobeEmoji: {
    fontSize: 50,
  },
  permissionBtn: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing[4],
  },
  btnGrad: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },

  /* 분석 기간 선택 — 시안 칩: 93×25 r12.5, 활성 #751AAD 30% / 비활성 white 21% */
  periodSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing[8],
  },
  periodTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing[4],
  },
  periodRow: {
    flexDirection: 'row',
    gap: 14,
  },
  periodChip: {
    minWidth: 93,
    height: 25,
    paddingHorizontal: 14,
    borderRadius: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.21)',
  },
  periodChipOn: {
    backgroundColor: 'rgba(117,26,173,0.30)',
  },
  periodTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  periodHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing[4],
    textAlign: 'center',
  },

  /* CTA — 초기 화면에서 건너뛰기 버튼과의 간격 */
  ctaMargin: {
    marginBottom: Spacing[3],
  },
  scanSubNote: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing[4],
    paddingHorizontal: 24,
  },

  scanText: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: Spacing[4],
    marginBottom: Spacing[1],
  },
  scanProgressText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
    marginBottom: Spacing[4],
  },
  progressContainer: {
    width: '80%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    justifyContent: 'center',
  },
  progressGrad: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 3,
  },
  // 진행 끝 발광 — 채움 오른쪽 끝에 맺히는 밝은 캡
  progressGlow: {
    position: 'absolute',
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -2,
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },

  // 실시간 발견 나라
  foundWrap: {
    width: '86%',
    alignItems: 'center',
    marginTop: Spacing[5],
  },
  foundLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing[2],
  },
  foundChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  flagChipEmoji: {
    fontSize: 15,
  },
  flagChipName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    maxWidth: 120,
  },
  scanCancelBtn: {
    marginTop: 22,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  scanCancelTxt: {
    color: '#A1A1B0',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Results view */
  resultsArea: {
    width: '100%',
  },
  resultTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  accentText: {
    color: '#EC34F7',
  },
  resultDesc: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: Spacing[6],
  },
  listWrap: {
    gap: Spacing[4],
  },

  /* 여행 합치기 */
  mergeBtn: {
    backgroundColor: 'rgba(236, 52, 247, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(236, 52, 247, 0.35)',
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: Spacing[4],
  },
  mergeBtnTxt: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: 2,
  },
  mergeBtnSub: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
  mgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  mgSheet: {
    backgroundColor: '#16121F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  mgTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  mgSub: { color: '#A1A1B0', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  mgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 8,
  },
  mgItemOn: { borderColor: '#EC34F7', backgroundColor: 'rgba(236, 52, 247, 0.08)' },
  mgItemDisabled: { opacity: 0.35 },
  mgThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#2A2735' },
  mgItemTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  mgItemDate: { color: '#A1A1B0', fontSize: 12 },
  mgBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mgCancelBtn: {
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mgCancelTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  mgOkBtn: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  mgOkGrad: { paddingVertical: 16, alignItems: 'center' },
  mgOkTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  tripCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tripCardSelected: {
    borderColor: '#EC34F7',
    backgroundColor: 'rgba(236, 52, 247, 0.06)',
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardInfo: {
    padding: Spacing[4],
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  // 스캔 화면 '발견한 나라' 칩과 동일한 스타일(국기 + 이름 + 얇은 테두리)로 통일
  importedBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  importedBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A1A1B0',
  },
  countryBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  countryText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checkboxSelected: {
    borderColor: '#EC34F7',
  },
  // 선택 시 채워지는 그라데이션 필(체크 포함) — 스프링으로 등장
  checkFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cardDate: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginBottom: Spacing[3],
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingTop: Spacing[3],
  },
  photoCountText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },

  /* Bottom Bar */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 48,
    paddingTop: Spacing[4],
    backgroundColor: 'rgba(10,11,15,0.95)',
  },
  // 합치기 모달 확인 버튼의 비활성 상태에서만 사용
  importBtnDisabled: {
    opacity: 0.5,
  },
});
