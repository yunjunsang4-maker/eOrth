import React, { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { useSettings } from '../store/settingsStore';
import { countryInfoFromCode, clusterForeignTrips, mergeScannedTrips, type ScannedPhoto, type ScannedTrip } from '../utils/pastTripScan';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';

// 분석 기간 옵션 — 기간이 길수록 조회·지오코딩할 사진이 많아져 분석 시간이 길어진다.
// maxAssets는 안전 상한: 스캔이 최신순(DESC)이라 도달 시 "오래된 사진부터" 잘림(과거 여행 앞부분 누락).
type ScanPeriodKey = '1y' | '3y' | 'all';
interface ScanPeriodOption {
  key: ScanPeriodKey;
  label: string;
  years: number | null; // null = 전체 기간
  maxAssets: number; // Infinity = 상한 없음
}
const SCAN_PERIODS: ScanPeriodOption[] = [
  { key: '1y', label: '최근 1년', years: 1, maxAssets: 20000 },
  { key: '3y', label: '최근 3년', years: 3, maxAssets: 50000 },
  { key: 'all', label: '전체 스캔', years: null, maxAssets: Number.POSITIVE_INFINITY },
];
const MIN_TRIP_PHOTOS = 10; // 이 장수 이하인 여행은 결과에서 제외 (10장 초과만 표시)

// 플랫폼별 안내 문구
// iOS: GPS는 로컬 메타데이터로 읽으므로 iCloud 최적화 사진도 다운로드 없이 빠르게 분석
// Android: MediaStore(로컬)만 읽음 → 빠름, 단 클라우드 전용(기기에서 내린) 사진은 제외될 수 있음
const periodRangeText = (p: ScanPeriodOption, tr: TFunction) => (p.years ? tr('imports.periodRecentYears', { years: p.years }) : tr('imports.periodAllRange'));
const periodLabel = (p: ScanPeriodOption, tr: TFunction) =>
  p.key === '1y' ? tr('imports.period1y') : p.key === '3y' ? tr('imports.period3y') : tr('imports.periodAll');
const scanNote = (p: ScanPeriodOption, tr: TFunction) =>
  Platform.OS === 'ios'
    ? (p.years ? tr('imports.analyzeRecentYears', { years: p.years }) : tr('imports.analyzeAll'))
    : tr('imports.analyzeAndroid', { range: periodRangeText(p, tr) });
const scanSubNote = (p: ScanPeriodOption, tr: TFunction) =>
  Platform.OS === 'ios'
    ? tr('imports.analyzingPeriodIos', { range: periodRangeText(p, tr) })
    : tr('imports.analyzingPeriod', { range: periodRangeText(p, tr) });

// EXIF 촬영일(DateTimeOriginal)을 ms 타임스탬프로 파싱. 형식: "YYYY:MM:DD HH:MM:SS"
// iOS는 exif['{Exif}'] 아래, Android는 flat 키로 들어온다. 파싱 실패 시 null → creationTime 폴백.
// creationTime은 '기기 갤러리 추가 시각'이라 iCloud 복원·재저장 사진은 부정확 → EXIF를 1순위로 쓴다.
const parseExifDate = (exif: any): number | null => {
  if (!exif) return null;
  const raw: unknown =
    exif.DateTimeOriginal ??
    exif['{Exif}']?.DateTimeOriginal ??
    exif.DateTimeDigitized ??
    exif['{Exif}']?.DateTimeDigitized ??
    exif.DateTime;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return Number.isFinite(ts) ? ts : null;
};

type Props = RootStackScreenProps<'TravelImport'>;

export default function TravelImportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { homeCountryCode } = useSettings();

  // 과거 여행 불러오기를 건너뛰고(또는 결과 없이) 메인으로 갈 때도 튜토리얼(코치마크) 자동 실행
  const goMainWithTutorial = () =>
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [scanning, setScanning] = useState(false);
  const [scanFinished, setScanFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scannedTrips, setScannedTrips] = useState<ScannedTrip[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isLimited, setIsLimited] = useState(false); // 사진 권한이 'limited'(선택 사진만)인지
  const [period, setPeriod] = useState<ScanPeriodOption>(SCAN_PERIODS[0]); // 분석 기간 (기본: 최근 1년)

  // 여행 합치기 (같은 국가가 여러 여행으로 나뉜 경우 — 예: 교환학생 거점 국가)
  const [mergeVisible, setMergeVisible] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);

  // Sync selected IDs when scannedTrips change
  // 첫 스캔 결과에는 전체 선택, 합치기 등으로 목록이 바뀌면 기존 선택을 보존하며 유효한 id만 남긴다
  useEffect(() => {
    if (scannedTrips.length > 0) {
      setSelectedIds((prev) =>
        prev.length === 0
          ? scannedTrips.map((t) => t.id)
          : prev.filter((id) => scannedTrips.some((t) => t.id === id))
      );
    }
  }, [scannedTrips]);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const radarAnim = useRef(new Animated.Value(0)).current;
  const radarAnim2 = useRef(new Animated.Value(0)).current;

  // Pulse effect for the scanning button
  useEffect(() => {
    if (scanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.timing(radarAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.delay(1000),
          Animated.timing(radarAnim2, { toValue: 1, duration: 2000, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      radarAnim.setValue(0);
      radarAnim2.setValue(0);
    }
  }, [scanning]);

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
  //                최근 SCAN_YEARS년 사진만 순회(creationTime 정렬, 안전 상한 MAX_ASSETS).
  //   3) GPS추출 : getAssetInfoAsync({shouldDownloadFromNetwork:false})로 위치 추출.
  //                location은 PHAsset 로컬 DB 메타데이터라 iCloud 원본 다운로드 불필요
  //                (iCloud 최적화 사진도 좌표는 기기에 남아 있음). 위경도가 유한한 숫자인 사진만 통과.
  //   4) 국가판정: 좌표를 0.5도 버킷으로 캐싱, reverseGeocodeAsync를 순차(250ms 간격,
  //                실패 시 500ms 후 1회 재시도)로 호출해 isoCountryCode 획득(레이트리밋 회피).
  //   5) 클러스터: clusterForeignTrips(scanned, homeCountryCode) → 거주국가 밖 + 7일 묶음.
  // ────────────────────────────────────────────────────────────────────────
  const startScan = async () => {
    setScanning(true);
    setProgress(0);
    setScannedTrips([]);
    setSelectedIds([]); // 재스캔 시 결과 전체 선택이 다시 적용되도록 초기화

    // 기간 옵션에 따른 안전 상한·조회 시작점. 전체 스캔은 상한 없음(Infinity) + createdAfter 미적용.
    const MAX_ASSETS = period.maxAssets;
    const CREATED_AFTER = period.years
      ? Date.now() - period.years * 365 * 24 * 60 * 60 * 1000
      : undefined;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      // ── 2) 최근 3년 사진 페이지네이션 스캔 ──
      const assets: MediaLibrary.Asset[] = [];
      let after: string | undefined = undefined;
      let hasNext = true;
      while (hasNext && assets.length < MAX_ASSETS) {
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
      if (hasNext && assets.length >= MAX_ASSETS) {
        // 상한 도달 → 최신순 스캔이라 가장 오래된 쪽(과거 여행)이 잘림
        console.warn(`[TravelImport] MAX_ASSETS(${MAX_ASSETS}) 도달: 스캔 범위가 "${period.label}"보다 짧게 잘렸을 수 있음`);
      }

      const totalAssets = assets.length;

      // ── 3) GPS 추출 (위치 권한과 무관, 로컬 메타데이터만 조회) ──
      // asset.id를 끝까지 전달해야 저장 시 copyTripOriginals가 localUri(file://)를 얻어
      // 복사할 수 있다 (iOS asset.uri는 ph:// 형식이라 직접 복사 불가).
      const located: { id: string; uri: string; creationTime: number; lat: number; lon: number }[] = [];
      const chunkSize = 50; // 네트워크 없이 로컬 DB 조회라 크게 잡아도 안전
      for (let i = 0; i < totalAssets; i += chunkSize) {
        const chunk = assets.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(async (asset) => {
            try {
              // location(GPS)은 PHAsset 로컬 DB 메타데이터라 iCloud 다운로드 불필요.
              // shouldDownloadFromNetwork는 localUri/exif(원본 파일)에만 영향 → false로 두면
              // iCloud 최적화 사진도 원본 다운로드 없이 즉시 좌표를 읽는다.
              const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
              // 촬영일: EXIF(DateTimeOriginal) 1순위 → 없으면 creationTime(기기 추가 시각) → 그것도 없으면 오늘.
              // EXIF는 로컬 원본이 있을 때만 채워지므로 추가 다운로드 없이 정확도만 끌어올린다.
              const creationTime = parseExifDate(info.exif) ?? (asset.creationTime || Date.now());
              return { id: asset.id, uri: asset.uri, creationTime, location: info.location };
            } catch {
              return { id: asset.id, uri: asset.uri, creationTime: asset.creationTime || Date.now(), location: undefined as any };
            }
          })
        );
        for (const r of results) {
          const lat = Number(r.location?.latitude);
          const lon = Number(r.location?.longitude);
          if (r.location && Number.isFinite(lat) && Number.isFinite(lon)) {
            located.push({ id: r.id, uri: r.uri, creationTime: r.creationTime, lat, lon });
          }
        }
        setProgress(Math.min(55, Math.round(((i + chunk.length) / totalAssets) * 55)));
      }

      // ── 4) 국가 판정 (0.5도 버킷 캐시 + 순차 호출 + 재시도로 레이트리밋 회피) ──
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

      const scanned: ScannedPhoto[] = [];
      let geocodedOk = 0;

      for (let i = 0; i < located.length; i++) {
        const p = located[i];
        setProgress(55 + Math.min(40, Math.round((i / Math.max(1, located.length)) * 40)));

        const key = bucketKey(p.lat, p.lon);
        let geo = geocodeCache[key];
        if (geo === undefined) {
          try {
            geo = await reverseOnce(p.lat, p.lon);
          } catch {
            await sleep(500); // 실패 → 잠시 후 1회 재시도
            try {
              geo = await reverseOnce(p.lat, p.lon);
            } catch {
              geo = null;
            }
          }
          geocodeCache[key] = geo;
          await sleep(250); // 호출 간격(레이트리밋 회피). 캐시 히트 시엔 대기 없음
        }
        if (!geo) continue;
        geocodedOk++;

        const cinfo = countryInfoFromCode(geo.code, geo.name);
        scanned.push({
          id: p.id,
          uri: p.uri,
          creationTime: p.creationTime,
          countryCode: geo.code,
          countryName: cinfo.countryName,
          countryFlag: cinfo.countryFlag,
        });
      }

      // ── 5) 클러스터링 (거주국가 밖만) + 사진 적은 여행 제외 ──
      const foreignCount = scanned.filter((s) => s.countryCode && s.countryCode !== homeCountryCode).length;
      const allTrips = clusterForeignTrips(scanned, homeCountryCode);
      // 사진 30장 이하 여행은 표시하지 않음 (짧은 경유/오탐 제거)
      const trips = allTrips.filter((t) => t.photoCount > MIN_TRIP_PHOTOS);

      // 디버그 로그
      console.log('[TravelImport] 총 스캔 사진:', totalAssets);
      console.log('[TravelImport] location 있던 사진:', located.length);
      console.log('[TravelImport] 지오코딩 성공:', geocodedOk);
      console.log('[TravelImport] 거주국가 밖 사진:', foreignCount, '(home=' + homeCountryCode + ')');
      console.log('[TravelImport] 여행 클러스터(전체/' + MIN_TRIP_PHOTOS + '장초과):', allTrips.length, '/', trips.length);

      setProgress(100);
      setTimeout(() => {
        setScanning(false);
        setScanFinished(true);
        setScannedTrips(trips);
      }, 400);
    } catch (error) {
      console.error('Scan failed:', error);
      setProgress(100);
      setTimeout(() => {
        setScanning(false);
        setScanFinished(true);
        setScannedTrips([]);
      }, 400);
    }
  };

  const toggleSelect = (id: string) => {
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
      photos: t.photos, // {id?,uri}[]
    }));
    navigation.navigate('ImportPhotoSelect', { trips });
  };

  // Interpolations for Radar animation
  const radarScale = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.4],
  });
  const radarOpacity = radarAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0],
  });

  const radarScale2 = radarAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.4],
  });
  const radarOpacity2 = radarAnim2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0],
  });

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.stepText}>STEP 2 / 2</Text>
          <Text style={styles.title}>{t('imports.tiTitle')}</Text>
          <Text style={styles.subtitle}>
            내 갤러리에서 거주국가 밖에서 찍은 사진을 분석해{'\n'}다녀온 해외 여행을 자동으로 찾아드려요.
          </Text>
        </View>

        {!scanFinished && !scanning ? (
          /* Permission Request View */
          <View style={styles.centerArea}>
            <View style={styles.globeGlowWrap}>
              <View style={styles.glowBg} />
              <LinearGradient
                colors={['#4A2FCB', '#7B61FF', '#C084FC']}
                style={styles.mockGlobe}
              >
                <Text style={styles.mockGlobeEmoji}>📸</Text>
              </LinearGradient>
            </View>

            {/* 분석 기간 선택 */}
            <View style={styles.periodSection}>
              <Text style={styles.periodTitle}>{t('imports.analyzePeriod')}</Text>
              <View style={styles.periodRow}>
                {SCAN_PERIODS.map((p) => {
                  const on = period.key === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.periodChip, on && styles.periodChipOn]}
                      onPress={() => setPeriod(p)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.periodTxt, on && styles.periodTxtOn]}>{periodLabel(p, t)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.periodHint}>⏱ {t('comp2.importPeriodHint')}</Text>
            </View>

            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.btnGrad}>
                <Text style={styles.btnText}>{t('imports.grantGalleryFind')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={goMainWithTutorial}>
              <Text style={styles.skipText}>{t('imports.skipManual')}</Text>
            </TouchableOpacity>

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{scanNote(period, t)}</Text>
            </View>
          </View>
        ) : scanning ? (
          /* Scanning View */
          <View style={styles.centerArea}>
            <View style={styles.globeGlowWrap}>
              <Animated.View style={[styles.radarRing, { transform: [{ scale: radarScale }], opacity: radarOpacity }]} />
              <Animated.View style={[styles.radarRing, { transform: [{ scale: radarScale2 }], opacity: radarOpacity2 }]} />
              <Animated.View style={[styles.mockGlobe, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={['#3B1E8E', '#7B61FF']}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={styles.mockGlobeEmoji}>🔍</Text>
              </Animated.View>
            </View>

            <Text style={styles.scanText}>{t('imports.analyzingMetadata')}</Text>
            <Text style={styles.scanProgressText}>{progress}% 완료</Text>
            <Text style={styles.scanSubNote}>{scanSubNote(period, t)}</Text>

            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
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
              <Text style={[styles.resultDesc, { color: Colors.primary, marginTop: -8 }]}>
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
                <Text style={styles.mergeBtnTxt}>🧩 {t('comp2.importMerge')}</Text>
                <Text style={styles.mergeBtnSub}>{t('imports.mergeSub')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.listWrap}>
              {scannedTrips.map((trip) => {
                const isSelected = selectedIds.includes(trip.id);
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={[styles.tripCard, isSelected && styles.tripCardSelected]}
                    onPress={() => toggleSelect(trip.id)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: trip.medias[0] }} style={styles.cardImage} />
                    <View style={styles.cardInfo}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.countryBadge}>
                          <Text style={styles.countryText}>{trip.country}</Text>
                        </View>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                      </View>
                      <Text style={styles.cardTitle}>{trip.title}</Text>
                      <Text style={styles.cardDate}>{trip.startDate} ~ {trip.endDate.substring(5)}</Text>
                      <View style={styles.cardFooter}>
                        <Text style={styles.photoCountText}>📷 사진 {trip.photoCount}장 발견</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
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
                    <Image source={{ uri: t.medias[0] }} style={styles.mgThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mgItemTitle}>{t.countryFlag} {t.title}</Text>
                      <Text style={styles.mgItemDate}>
                        {t.startDate} ~ {t.endDate.substring(5)} · 사진 {t.photoCount}장
                      </Text>
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxSelected]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
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
                <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.mgOkGrad}>
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
        /* Floating Bottom Bar for importing */
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.importBtn, selectedIds.length === 0 && styles.importBtnDisabled]}
            disabled={selectedIds.length === 0 || isImporting}
            onPress={handleImport}
            activeOpacity={0.8}
          >
            {isImporting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.importBtnGrad}>
                <Text style={styles.importBtnText}>
                  {selectedIds.length > 0
                    ? t('imports.importSelectedN', { count: selectedIds.length })
                    : t('imports.selectTripsToImport')}
                </Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing[6],
    paddingBottom: 140,
  },
  header: {
    marginBottom: Spacing[8],
  },
  stepText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing[2],
  },
  title: {
    fontSize: Typography.fontSize['3xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
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
    color: Colors.textMuted,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },

  /* 분석 기간 선택 */
  periodSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing[5],
  },
  periodTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing[2],
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  periodChipOn: {
    borderColor: '#7B61FF',
    backgroundColor: 'rgba(123, 97, 255, 0.18)',
  },
  periodTxt: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  periodTxtOn: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.semiBold,
  },
  periodHint: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing[2],
  },
  noteBox: {
    marginTop: Spacing[4],
    backgroundColor: 'rgba(191, 133, 252, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(191, 133, 252, 0.2)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteText: {
    color: '#BF85FC',
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 18,
    textAlign: 'center',
  },
  scanSubNote: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing[4],
    paddingHorizontal: 24,
  },

  /* Scanning animation */
  radarRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: '#7B61FF',
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
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },

  /* Results view */
  resultsArea: {
    width: '100%',
  },
  resultTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  accentText: {
    color: Colors.primary,
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
    backgroundColor: 'rgba(123, 97, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.35)',
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
  mgItemOn: { borderColor: '#7B61FF', backgroundColor: 'rgba(123, 97, 255, 0.08)' },
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
    borderColor: Colors.primary,
    backgroundColor: 'rgba(123, 97, 255, 0.04)',
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
  countryBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  countryText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
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
  cardContent: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing[4],
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingTop: Spacing[3],
  },
  photoCountText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  ratingText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.gold,
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
    backgroundColor: 'rgba(10,1,24,0.95)',
  },
  importBtn: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  importBtnDisabled: {
    opacity: 0.5,
  },
  importBtnGrad: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  importBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
  },
});
