import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Dimensions,
  Platform,
  Alert,
  Animated,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { PinIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import {
  detectCurrentCountry,
  formatLateSeconds,
} from '../services/snapService';
import { COUNTRIES } from '../constants/countries';
import type { RootStackScreenProps } from '../navigation/types';

const { width: SW, height: SH } = Dimensions.get('window');

const C = {
  bg: '#0A0A0F',
  card: '#1A1A26',
  accent: '#BF85FC',
  accentDim: 'rgba(191,133,252,0.2)',
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#4A4A59',
  red: '#FF3B30',
  snapYellow: '#FFD60A',
  snapBg: '#0D0D12',
};

// ─── 리퀴드 글래스 (실제 BlurView — 디벨롭 빌드 전용) ───
const GLASS = {
  border:      'rgba(255,255,255,0.30)',
  innerTop:    'rgba(255,255,255,0.16)',
  innerBottom: 'rgba(255,255,255,0.02)',
  specular:    'rgba(255,255,255,0.55)',
};

const GlassFill = ({
  intensity = 30,
  tint = 'dark',
  specular = true,
}: {
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  specular?: boolean;
}) => (
  <>
    <BlurView
      intensity={intensity}
      tint={tint}
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <LinearGradient
      colors={[GLASS.innerTop, GLASS.innerBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    {specular ? (
      <LinearGradient
        colors={[GLASS.specular, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.4 }}
        pointerEvents="none"
      />
    ) : null}
  </>
);

// ─── 그라데이션 카메라 회전 아이콘 ───
const FlipIconGradient = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <SvgLinearGradient id="flipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#22D3EE" />
        <Stop offset="50%" stopColor="#A855F7" />
        <Stop offset="100%" stopColor="#D946EF" />
      </SvgLinearGradient>
    </Defs>
    <Path
      d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"
      fill="url(#flipGrad)"
    />
  </Svg>
);

type Props = RootStackScreenProps<'SnapRecord'>;

export default function SnapRecordScreen({ navigation, route }: Props) {
  const { addRecord } = useRecords();
  const { homeCountryCode } = useSettings();

  // ─── 카메라 상태 ───
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraRef = useRef<CameraView>(null);

  // ─── 촬영 단계 ───
  type Phase = 'camera' | 'switching' | 'preview' | 'caption';
  const [phase, setPhase] = useState<Phase>('camera');
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

  // ─── 메타 ───
  const [caption, setCaption] = useState('');
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [shotStartTime] = useState(Date.now());
  const notifTimestamp: number | undefined = route?.params?.notifTimestamp;

  const preselected = route?.params?.selectedCountry;
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; flag: string; region?: string; regionEn?: string } | null>(null);

  useEffect(() => {
    if (preselected) {
      const countryNameOnly = preselected.name.split(' - ')[0];
      const matched = COUNTRIES.find(c => c.name === countryNameOnly);
      if (matched) {
        setSelectedCountry({
          name: matched.name,
          flag: matched.flag,
          region: preselected.region,
          regionEn: preselected.regionEn,
        });
      }
    }
  }, [preselected]);

  // ─── 애니메이션 ───
  const flashAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 촬영 버튼 펄스 애니메이션
  useEffect(() => {
    if (phase !== 'camera' && phase !== 'switching') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  // 위치 감지
  useEffect(() => {
    (async () => {
      try {
        const { countryName, city } = await detectCurrentCountry();
        if (countryName) setDetectedCountry(countryName);
        if (city) setDetectedCity(city);
      } catch (_) {}
    })();
  }, []);

  // 카메라 전환 후 자동 촬영
  useEffect(() => {
    if (phase !== 'switching' || !shooting) return;

    const timer = setTimeout(async () => {
      if (!cameraRef.current) { setShooting(false); return; }

      // 플래시 효과
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      const secondPhoto = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!secondPhoto) { setShooting(false); setPhase('camera'); return; }

      if (facing === 'front') {
        setFrontPhoto(secondPhoto.uri);
      } else {
        setBackPhoto(secondPhoto.uri);
      }

      setShooting(false);
      setPhase('preview');
    }, 800);

    return () => clearTimeout(timer);
  }, [phase, shooting]);

  // ─── 카메라 권한 ───
  if (!permission) {
    return <View style={st.bg} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={st.permScreen}>
        <Text style={st.permEmoji}>📸</Text>
        <Text style={st.permTitle}>카메라 권한이 필요해요</Text>
        <Text style={st.permDesc}>여행의 순간을 포착하려면{'\n'}카메라 접근을 허용해주세요</Text>
        <TouchableOpacity
          style={st.permBtnWrap}
          // 영구 거부 상태에선 요청 다이얼로그가 다시 뜨지 않으므로 설정으로 보낸다
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#22D3EE', '#A855F7', '#D946EF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.permBtnGrad}
          >
            <Text style={st.permBtnText}>{permission.canAskAgain ? '권한 허용' : '설정에서 허용'}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={st.permSkip} onPress={() => navigation.goBack()}>
          <Text style={st.permSkipText}>나중에</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── 동시 촬영 (BeReal 방식) ───
  const takePhoto = async () => {
    if (!cameraRef.current || shooting) return;
    setShooting(true);

    // 플래시 효과
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    // 1) 현재 카메라(후면 or 전면) 촬영
    const firstPhoto = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (!firstPhoto) { setShooting(false); return; }

    const firstFacing = facing;
    const secondFacing = firstFacing === 'back' ? 'front' : 'back';

    if (firstFacing === 'back') {
      setBackPhoto(firstPhoto.uri);
    } else {
      setFrontPhoto(firstPhoto.uri);
    }

    // 2) 카메라 전환 → 자동 촬영
    setFacing(secondFacing);
    setPhase('switching');
  };

  // ─── 재촬영 ───
  const retake = () => {
    setBackPhoto(null);
    setFrontPhoto(null);
    setFacing('back');
    setShooting(false);
    setPhase('camera');
  };

  // ─── 저장 ───
  const handleSave = () => {
    const lateSeconds = notifTimestamp
      ? Math.round((shotStartTime - notifTimestamp) / 1000)
      : 0;

    const finalCountry = selectedCountry || (detectedCountry
      ? COUNTRIES.find(c => c.name === detectedCountry || c.term.toLowerCase() === detectedCountry.toLowerCase())
      : null);

    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    addRecord({
      user: { name: '나', emoji: '⚡', handle: 'yunjunsung' },
      country: finalCountry ? `${finalCountry.flag} ${finalCountry.name}` : (detectedCountry || ''),
      countryName: finalCountry?.name || detectedCountry || '',
      countryFlag: finalCountry?.flag || '',
      countries: finalCountry ? [{ flag: finalCountry.flag, name: finalCountry.name }] : [],
      regionName: selectedCountry?.region || undefined,
      regionNameEn: selectedCountry?.regionEn || undefined,
      date: dateStr,
      content: caption || '⚡ 순간 포착',
      visibility: 'friends',
      medias: [backPhoto, frontPhoto].filter(Boolean) as string[],
      viewType: 'snap',
      snapFrontUri: frontPhoto || undefined,
      snapBackUri: backPhoto || undefined,
      snapCaption: caption || undefined,
      snapDetectedCountry: detectedCountry || undefined,
      snapLateSeconds: lateSeconds > 0 ? lateSeconds : undefined,
      snapExpiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24시간 후 만료
    });

    navigation.goBack();
  };

  // ─── 카메라 화면 ───
  if (phase === 'camera' || phase === 'switching') {
    return (
      <View style={st.bg}>
        <CameraView
          ref={cameraRef}
          style={st.camera}
          facing={facing}
        />

        {/* 플래시 오버레이 */}
        <Animated.View style={[st.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

        {/* 상단 바 */}
        <SafeAreaView style={st.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.topBtn}>
            <GlassFill intensity={24} tint="dark" />
            <Text style={st.topBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={st.topCenter}>
            <Text style={st.snapBadge}>⚡ SNAP</Text>
            {detectedCountry && (
              <Text style={st.locationText}>
                📍 {detectedCountry}{detectedCity ? ` · ${detectedCity}` : ''}
              </Text>
            )}
          </View>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        {/* 안내 문구 */}
        <View style={st.guideWrap}>
          {phase === 'switching' ? (
            <Text style={st.guideText}>📸 전환 중...</Text>
          ) : (
            <Text style={st.guideText}>탭 한 번으로 전면 · 후면 동시 촬영</Text>
          )}
        </View>

        {/* 하단 컨트롤 */}
        <View style={st.bottomBar}>
          {/* 카메라 전환 (촬영 전 방향 선택) */}
          <TouchableOpacity
            style={st.flipBtn}
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            disabled={shooting}
          >
            <GlassFill intensity={20} tint="dark" />
            <FlipIconGradient size={26} />
          </TouchableOpacity>

          {/* 셔터 버튼 */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', justifyContent: 'center' }}>
            {/* 네온 글로우 배경 */}
            <LinearGradient
              colors={['rgba(34,211,238,0.3)', 'rgba(168,85,247,0.3)', 'rgba(217,70,239,0.3)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={st.shutterGlow}
              pointerEvents="none"
            />
            <TouchableOpacity
              style={[shooting && { opacity: 0.5 }]}
              onPress={takePhoto}
              activeOpacity={0.7}
              disabled={shooting}
            >
              <LinearGradient
                colors={['#22D3EE', '#A855F7', '#D946EF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={st.shutterOuterGrad}
              >
                {/* 링 상단 아치 스페큘러 (유리 링 질감 극대화) */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.6 }}
                  style={st.shutterSpecular}
                  pointerEvents="none"
                />
                
                <View style={st.shutterMask}>
                  {/* 안쪽 투명 글래스 */}
                  <GlassFill intensity={35} tint="dark" />
                  
                  {/* 오로라 굴절광 */}
                  <LinearGradient
                    colors={['rgba(34,211,238,0.22)', 'rgba(168,85,247,0.22)', 'rgba(217,70,239,0.22)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  
                  {/* 안쪽 스페큘러 */}
                  <LinearGradient
                    colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={st.shutterInnerSpecular}
                    pointerEvents="none"
                  />
                  
                  <Text style={st.shutterIcon}>⚡</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ width: 50 }} />
        </View>
      </View>
    );
  }

  // ─── 프리뷰 + 캡션 화면 ───
  return (
    <SafeAreaView style={st.previewSafe}>
      {/* 사진 프리뷰 */}
      <View style={st.previewContainer}>
        {/* 후면 사진 (메인) */}
        {backPhoto && (
          <Image source={{ uri: backPhoto }} style={st.previewMain} resizeMode="cover" />
        )}

        {/* 전면 사진 (오버레이 PIP) */}
        {frontPhoto && (
          <View style={st.pipWrapContainer}>
            <LinearGradient
              colors={['#22D3EE', '#A855F7', '#D946EF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={st.pipInner}>
              <Image source={{ uri: frontPhoto }} style={st.pipImage} resizeMode="cover" />
            </View>
          </View>
        )}

        {/* 위치 & 시간 뱃지 */}
        <View style={st.previewBadges}>
          {detectedCountry && (
            <View style={st.previewBadge}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><PinIcon size={12} color="#fff" /><Text style={st.previewBadgeText}>{detectedCountry}{detectedCity ? ` · ${detectedCity}` : ''}</Text></View>
            </View>
          )}
          {notifTimestamp && (
            <View style={st.previewBadge}>
              <Text style={st.previewBadgeText}>
                ⏱ {formatLateSeconds(Math.round((shotStartTime - notifTimestamp) / 1000))}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 캡션 입력 */}
      <View style={st.captionArea}>
        <TextInput
          style={st.captionInput}
          placeholder="이 순간을 한 줄로 남겨보세요..."
          placeholderTextColor={C.muted}
          value={caption}
          onChangeText={setCaption}
          maxLength={100}
          returnKeyType="done"
        />
        <Text style={st.captionCount}>{caption.length}/100</Text>
      </View>

      {/* 하단 버튼 */}
      <View style={st.actionRow}>
        <TouchableOpacity style={st.retakeBtn} onPress={retake}>
          <Text style={st.retakeBtnText}>다시 찍기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.sendBtnWrap} onPress={handleSave} activeOpacity={0.8}>
          <LinearGradient
            colors={['#22D3EE', '#A855F7', '#D946EF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.sendBtnGrad}
          >
            <Text style={st.sendBtnText}>⚡ 공유하기</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 24시간 안내 */}
      <Text style={st.expireNote}>스냅은 24시간 후 친구들에게 흐리게 보여요</Text>
    </SafeAreaView>
  );
}

// ─── 스타일 ───
const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 100,
  },

  // 상단 바
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingBottom: 12,
    zIndex: 10,
  },
  topBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  topBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  topCenter: { alignItems: 'center', gap: 4 },
  snapBadge: {
    color: '#22D3EE', fontSize: 15, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  locationText: {
    color: 'rgba(255,255,255,0.8)', fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // 안내 문구
  guideWrap: {
    position: 'absolute', top: Platform.OS === 'ios' ? 120 : 100, left: 0, right: 0,
    alignItems: 'center', zIndex: 5,
  },
  guideText: {
    color: '#fff', fontSize: 16, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, overflow: 'hidden',
  },

  // 하단 컨트롤
  bottomBar: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 50 : 30, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  shutterGlow: {
    position: 'absolute',
    width: 104, height: 104, borderRadius: 52,
  },
  shutterOuterGrad: {
    width: 80, height: 80, borderRadius: 40,
    padding: 5,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  shutterSpecular: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '60%',
    borderRadius: 40,
  },
  shutterMask: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  shutterInnerSpecular: {
    ...StyleSheet.absoluteFillObject,
  },
  shutterIcon: {
    fontSize: 24,
    color: '#fff',
    textShadowColor: 'rgba(255,255,255,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  flipBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  flipIcon: { fontSize: 24 },

  // 미니 프리뷰
  miniPreview: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 140 : 120,
    left: 20, alignItems: 'center', gap: 4,
  },
  miniImg: {
    width: 60, height: 80, borderRadius: 10,
    borderWidth: 2, borderColor: '#A855F7',
  },
  miniLabel: { color: '#BF85FC', fontSize: 10, fontWeight: '700' },

  // 권한 화면
  permScreen: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  permEmoji: { fontSize: 60, marginBottom: 20 },
  permTitle: { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 10 },
  permDesc: { color: C.dim, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  permBtnWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  permBtnGrad: {
    paddingHorizontal: 32, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  permSkip: { marginTop: 16 },
  permSkipText: { color: C.dim, fontSize: 14 },

  // 프리뷰 화면
  previewSafe: { flex: 1, backgroundColor: C.snapBg },
  previewContainer: {
    flex: 1, margin: 12, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#111',
  },
  previewMain: { width: '100%', height: '100%' },
  pipWrapContainer: {
    position: 'absolute', top: 16, left: 16,
    width: SW * 0.28, height: SW * 0.37,
    borderRadius: 16, overflow: 'hidden',
    padding: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 8,
  },
  pipInner: {
    flex: 1,
    borderRadius: 13,
    overflow: 'hidden',
  },
  pipImage: { width: '100%', height: '100%' },
  previewBadges: {
    position: 'absolute', bottom: 16, left: 16, gap: 6,
  },
  previewBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  previewBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // 캡션
  captionArea: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#1A1A26',
  },
  captionInput: {
    color: C.white, fontSize: 15, lineHeight: 22,
    minHeight: 36,
  },
  captionCount: {
    color: C.muted, fontSize: 11, textAlign: 'right', marginTop: 4,
  },

  // 액션 버튼
  actionRow: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 12,
    paddingBottom: 8,
  },
  retakeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 16,
    borderWidth: 1, borderColor: C.muted, alignItems: 'center',
  },
  retakeBtnText: { color: C.dim, fontSize: 15, fontWeight: '600' },
  sendBtnWrap: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sendBtnGrad: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // 안내
  expireNote: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    paddingVertical: 12,
  },
});
