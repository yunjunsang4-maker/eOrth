import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { countryInfoFromCode, clusterForeignTrips, type ScannedPhoto, type ScannedTrip } from '../utils/pastTripScan';

const { width } = Dimensions.get('window');

interface Props {
  navigation: any;
}

export default function TravelImportScreen({ navigation }: Props) {
  const { addRecord } = useRecords();
  const { homeCountryCode } = useSettings();
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [scanning, setScanning] = useState(false);
  const [scanFinished, setScanFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scannedTrips, setScannedTrips] = useState<ScannedTrip[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Sync selected IDs when scannedTrips change
  useEffect(() => {
    if (scannedTrips.length > 0) {
      setSelectedIds(scannedTrips.map((t) => t.id));
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
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync(false);

      if (mediaStatus === 'granted' || (mediaStatus as string) === 'limited') {
        setPermissionStatus('granted');

        // Request location permission as well (optional, but recommended for geocoding)
        try {
          const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
          startScan(locStatus === 'granted');
        } catch (locErr) {
          console.warn('Failed to request location permission:', locErr);
          startScan(false);
        }
      } else {
        setPermissionStatus('denied');
        setScanFinished(true);
        setScannedTrips([]);
      }
    } catch (err) {
      console.error('Permission request failed:', err);
      setPermissionStatus('denied');
    }
  };

  const startScan = async (hasLocationPermission: boolean) => {
    setScanning(true);
    setProgress(0);
    setScannedTrips([]);

    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        first: 150,
        mediaType: 'photo',
        sortBy: 'creationTime',
      });
      if (!assets || assets.length === 0) throw new Error('No photos found in gallery');

      const totalAssets = assets.length;
      const assetInfos: { id: string; uri: string; creationTime: number; location: any }[] = [];
      const chunkSize = 15;

      for (let i = 0; i < totalAssets; i += chunkSize) {
        const chunk = assets.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(async (asset) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              return { id: asset.id, uri: asset.uri, creationTime: asset.creationTime || Date.now(), location: info.location };
            } catch {
              return { id: asset.id, uri: asset.uri, creationTime: asset.creationTime || Date.now(), location: undefined };
            }
          })
        );
        assetInfos.push(...results);
        setProgress(Math.min(60, Math.round(((i + chunk.length) / totalAssets) * 60)));
      }

      // 지오코딩 (해외 사진만 ScannedPhoto로 수집)
      const geocodeCache: Record<string, { code: string; name: string } | null> = {};
      const scanned: ScannedPhoto[] = [];

      for (let i = 0; i < assetInfos.length; i++) {
        const info = assetInfos[i];
        setProgress(60 + Math.min(35, Math.round((i / totalAssets) * 35)));

        if (!(hasLocationPermission && info.location && info.location.latitude && info.location.longitude)) {
          continue; // GPS 없음 → 제외
        }
        const lat = info.location.latitude;
        const lon = info.location.longitude;
        const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;

        let geo = geocodeCache[cacheKey];
        if (geo === undefined) {
          try {
            const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            const addr = res && res[0];
            geo = addr?.isoCountryCode ? { code: addr.isoCountryCode, name: addr.country || addr.isoCountryCode } : null;
          } catch {
            geo = null;
          }
          geocodeCache[cacheKey] = geo;
        }
        if (!geo) continue; // 지오코딩 실패 → 제외

        const cinfo = countryInfoFromCode(geo.code, geo.name);
        scanned.push({
          uri: info.uri,
          creationTime: info.creationTime,
          countryCode: geo.code,
          countryName: cinfo.countryName,
          countryFlag: cinfo.countryFlag,
        });
      }

      const trips = clusterForeignTrips(scanned, homeCountryCode);
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

  const handleImport = () => {
    setIsImporting(true);

    // Simulate loading/saving process
    setTimeout(() => {
      // Add records to store
      scannedTrips.forEach((trip) => {
        if (selectedIds.includes(trip.id)) {
          addRecord({
            user: { name: '', emoji: '✈️', handle: '' }, // Replaced dynamically inside addRecord
            country: trip.country,
            countryName: trip.countryName,
            countryFlag: trip.countryFlag,
            date: trip.date,
            startDate: trip.startDate,
            endDate: trip.endDate,
            rating: trip.rating,
            content: trip.content,
            medias: trip.medias,
            isMyPost: true,
            visibility: 'private',
            viewType: 'feed',
            weather: trip.weather,
            companions: trip.companions,
          });
        }
      });
      setIsImporting(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }, 1200);
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.stepText}>STEP 2 / 2</Text>
          <Text style={styles.title}>과거 여행 불러오기</Text>
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

            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.btnGrad}>
                <Text style={styles.btnText}>갤러리 접근 허용하고 찾기</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
              <Text style={styles.skipText}>건너뛰기 (수동으로 기록하기)</Text>
            </TouchableOpacity>
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

            <Text style={styles.scanText}>갤러리 메타데이터 분석 중...</Text>
            <Text style={styles.scanProgressText}>{progress}% 완료</Text>

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
            <Text style={styles.scanText}>해외 여행 사진을 찾지 못했어요</Text>
            <Text style={[styles.resultDesc, { textAlign: 'center', paddingHorizontal: 20 }]}>
              거주국가 밖에서 GPS가 기록된 사진이 없어요.{'\n'}위치 접근을 허용하면 더 잘 찾을 수 있어요.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.btnGrad}>
                <Text style={styles.btnText}>수동으로 기록하기</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
              <Text style={styles.skipText}>건너뛰기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Scanned Suggested Trips List View */
          <View style={styles.resultsArea}>
            <Text style={styles.resultTitle}>
              총 <Text style={styles.accentText}>{scannedTrips.length}개</Text>의 해외 여행을 발견했습니다!
            </Text>
            <Text style={styles.resultDesc}>가져올 여행 기록을 선택해 주세요. 지구본에 바로 연동됩니다.</Text>

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
                      <Text style={styles.cardContent} numberOfLines={2}>{trip.content}</Text>
                      <View style={styles.cardFooter}>
                        <Text style={styles.photoCountText}>📷 사진 {trip.photoCount}장 발견</Text>
                        <Text style={styles.ratingText}>★ {trip.rating}.0</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>

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
                    ? `선택한 여행 ${selectedIds.length}개 가져오기`
                    : '가져올 여행을 선택하세요'}
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
    paddingTop: 80,
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
