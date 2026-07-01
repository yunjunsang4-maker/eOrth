import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { PinIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import {
  detectCurrentCountry,
  formatLateSeconds,
} from '../services/snapService';
import { COUNTRIES } from '../constants/countries';
import type { RootStackScreenProps } from '../navigation/types';

const { width: SW } = Dimensions.get('window');

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

// ─── 그라데이션 번개(촬영) 아이콘 — 노랑→주황 ───
const BoltGradient = ({ size = 32 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <SvgLinearGradient id="boltGrad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFE072" />
        <Stop offset="1" stopColor="#FF9F0A" />
      </SvgLinearGradient>
    </Defs>
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#boltGrad)" />
  </Svg>
);

// ─── 셔터(촬영) 버튼 프레임 — Group 2085664476.svg 그대로 재현 ───
// 어두운 보라 반투명 원판 + 흰 rim + 시안→마젠타 네온 링. (viewBox 34 좌표계 유지, 크기만 스케일)
const ShutterGraphic = ({ size = 80 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 34 34" fill="none">
    <Defs>
      <SvgLinearGradient id="shutRim" x1="16.8365" y1="4.639" x2="24.035" y2="29.034" gradientUnits="userSpaceOnUse">
        <Stop stopColor="#666666" stopOpacity="0" />
        <Stop offset="1" stopColor="#FFFFFF" />
      </SvgLinearGradient>
      <SvgLinearGradient id="shutNeon" x1="16.8585" y1="6.0997" x2="23.1709" y2="27.4916" gradientUnits="userSpaceOnUse">
        <Stop stopColor="#00D8F3" />
        <Stop offset="1" stopColor="#FF14E4" />
      </SvgLinearGradient>
    </Defs>
    <Circle cx="16.8365" cy="16.8365" r="12.1975" fill="#390048" fillOpacity={0.38} />
    <Circle cx="16.8365" cy="16.8365" r="11.9975" stroke="url(#shutRim)" strokeOpacity={0.6} strokeWidth={0.4} fill="none" />
    <Circle cx="16.8585" cy="16.7957" r="10.3769" stroke="url(#shutNeon)" strokeOpacity={0.6} strokeWidth={0.638} fill="none" />
  </Svg>
);

type Props = RootStackScreenProps<'SnapRecord'>;

export default function SnapRecordScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { addRecord } = useRecords();
  const { homeCountryCode } = useSettings();
  const insets = useSafeAreaInsets();

  // ─── 카메라 상태 ───
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const cameraRef = useRef<CameraView>(null);
  const cycleFlash = () => setFlash(f => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'));

  // ─── 촬영 단계 ───
  type Phase = 'camera' | 'switching' | 'preview' | 'caption';
  const [phase, setPhase] = useState<Phase>('camera');
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [guidePillSize, setGuidePillSize] = useState({ w: 0, h: 0 }); // 안내 알약 SVG 배경 크기
  const secondShotRef = useRef(false); // 전환 후 2차 촬영 중복 방지
  const savedRef = useRef(false);      // 저장 후 나가기는 확인 건너뜀

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
      } catch {}
    })();
  }, []);

  // 카메라 전환 후 자동 촬영 — 전환된 카메라가 준비되면 촬영(고정 지연 대신 onCameraReady 기반, 폴백 1.2s)
  useEffect(() => {
    if (phase !== 'switching' || !shooting) return;

    const capture = async () => {
      if (secondShotRef.current || !cameraRef.current) return;
      secondShotRef.current = true;

      // 플래시 효과
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      try {
        const secondPhoto = await cameraRef.current.takePictureAsync({ quality: 0.85 });
        if (!secondPhoto) { setShooting(false); setPhase('camera'); return; }
        if (facing === 'front') {
          setFrontPhoto(secondPhoto.uri);
        } else {
          setBackPhoto(secondPhoto.uri);
        }
        setShooting(false);
        setPhase('preview');
      } catch {
        setShooting(false);
        setPhase('camera');
        Alert.alert(t('snap.captureFailTitle'), t('snap.captureFail2nd'));
      }
    };

    // 전환 카메라 준비되면 짧게, 아직이면 최대 1.2초 후 폴백 촬영
    const timer = setTimeout(capture, cameraReady ? 250 : 1200);
    return () => clearTimeout(timer);
  }, [phase, shooting, cameraReady, facing]);

  // 찍은 스냅 두고 나갈 때 확인 (뒤로/스와이프/닫기) — 저장 시엔 건너뜀
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current || (!backPhoto && !frontPhoto)) return;
      e.preventDefault();
      Alert.alert(t('snap.exitTitle'), t('snap.exitMsg'), [
        { text: t('snap.continue'), style: 'cancel' },
        { text: t('snap.exit'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation, backPhoto, frontPhoto]);

  // ─── 카메라 권한 ───
  if (!permission) {
    return <View style={st.bg} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={st.permScreen}>
        <Text style={st.permEmoji}>📸</Text>
        <Text style={st.permTitle}>{t('snap.permTitle')}</Text>
        <Text style={st.permDesc}>{t('snap.permDesc')}</Text>
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
            <Text style={st.permBtnText}>{permission.canAskAgain ? t('snap.permAllow') : t('snap.permSettings')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={st.permSkip} onPress={() => navigation.goBack()}>
          <Text style={st.permSkipText}>{t('snap.later')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── 동시 촬영 (BeReal 방식) ───
  const takePhoto = async () => {
    if (!cameraRef.current || shooting || !cameraReady) return;
    setShooting(true);

    // 플래시 효과
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    try {
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

      // 2) 카메라 전환 → 준비되면 자동 촬영
      secondShotRef.current = false;
      setCameraReady(false);
      setFacing(secondFacing);
      setPhase('switching');
    } catch {
      setShooting(false);
      Alert.alert(t('snap.captureFailTitle'), t('snap.captureFailMsg'));
    }
  };

  // ─── 메인 ↔ 전면(PIP) 스왑 (프리뷰에서 탭) ───
  const swapPhotos = () => {
    setBackPhoto(frontPhoto);
    setFrontPhoto(backPhoto);
  };

  // ─── 재촬영 ───
  const retake = () => {
    setBackPhoto(null);
    setFrontPhoto(null);
    setFacing('back');
    setShooting(false);
    secondShotRef.current = false;
    setPhase('camera');
  };

  // 위치 못 잡고 선택도 없을 때 폴백할 홈 국가 (term 첫 토큰 = 국가코드)
  const homeCountry = COUNTRIES.find(c => c.term.split(' ')[0] === (homeCountryCode || '').toLowerCase()) || null;

  // 상단 위치 라벨(📍 국가 · 도시)
  const locCountryObj = selectedCountry
    || (detectedCountry ? COUNTRIES.find(c => c.name === detectedCountry || c.term.toLowerCase() === detectedCountry.toLowerCase()) : null)
    || homeCountry;
  const locName = detectedCountry || locCountryObj?.name || '';

  // ─── 저장 ───
  const handleSave = () => {
    const lateSeconds = notifTimestamp
      ? Math.round((shotStartTime - notifTimestamp) / 1000)
      : 0;

    const finalCountry = selectedCountry
      || (detectedCountry
        ? COUNTRIES.find(c => c.name === detectedCountry || c.term.toLowerCase() === detectedCountry.toLowerCase())
        : null)
      || homeCountry; // 위치 거부/실패 시 홈 국가로 기록(빈 국가 방지)

    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    addRecord({
      user: { name: '', emoji: '⚡', handle: '' }, // addRecord가 로그인 사용자로 채움
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
      snapHour: today.getHours(), // 촬영 시점 현지 시각의 시 (89·90 시간대 배지용)
    });

    savedRef.current = true;
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
          flash={flash}
          onCameraReady={() => setCameraReady(true)}
        />

        {/* 플래시 오버레이 */}
        <Animated.View style={[st.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

        {/* 상단 바 */}
        <SafeAreaView style={st.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <GlassFill intensity={20} tint="dark" />
            <Text style={st.backBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={st.topCenter}>
            <Text style={st.snapBadge}>SNAP</Text>
            {locName ? (
              <Text style={st.locationText}>
                📍 {locName}{detectedCity ? ` · ${detectedCity}` : ''}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={cycleFlash} style={st.topBtn} accessibilityRole="button" accessibilityLabel={t('snap.flashA11y')}>
            <GlassFill intensity={24} tint="dark" />
            <Text style={[st.topBtnText, { fontSize: 17, color: flash === 'on' ? C.snapYellow : flash === 'auto' ? '#22D3EE' : 'rgba(255,255,255,0.5)' }]}>
              {flash === 'auto' ? '⚡A' : '⚡'}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>

        {/* 안내 문구 — 상단 바 아래. 배경 #751AAD 30% + 테두리 시안→마젠타 그라데이션 (Rectangle 240652656.svg) */}
        <View style={[st.guideWrap, { top: insets.top + 70 }]}>
          <View
            style={st.guidePill}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width !== guidePillSize.w || height !== guidePillSize.h) setGuidePillSize({ w: width, h: height });
            }}
          >
            {guidePillSize.w > 0 && (
              <Svg width={guidePillSize.w} height={guidePillSize.h} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <SvgLinearGradient id="guideBorder" x1="0" y1="0" x2={String(guidePillSize.w)} y2={String(guidePillSize.h)} gradientUnits="userSpaceOnUse">
                    <Stop stopColor="#00D8F3" />
                    <Stop offset="1" stopColor="#FF14E4" />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x={0.75}
                  y={0.75}
                  width={guidePillSize.w - 1.5}
                  height={guidePillSize.h - 1.5}
                  rx={(guidePillSize.h - 1.5) / 2}
                  fill="#751AAD"
                  fillOpacity={0.3}
                  stroke="url(#guideBorder)"
                  strokeWidth={1.5}
                />
              </Svg>
            )}
            <Text style={st.guideText}>
              {phase === 'switching' ? `📸 ${t('comp2.snapSwitching')}` : t('snap.guideText')}
            </Text>
          </View>
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

          {/* 셔터 버튼 — Group 2085664476.svg 디자인 (보라 원판 + 네온 링) + 번개 아이콘 */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[st.shutterBtn, shooting && { opacity: 0.5 }]}
              onPress={takePhoto}
              activeOpacity={0.7}
              disabled={shooting}
            >
              <ShutterGraphic size={112} />
              {/* 중앙 번개 (노랑→주황 + 따뜻한 글로우) */}
              <View style={st.shutterBoltWrap} pointerEvents="none">
                <View style={st.boltGlow}>
                  <BoltGradient size={34} />
                </View>
              </View>
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

        {/* 닫기 */}
        <TouchableOpacity style={st.previewClose} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('snap.closeA11y')}>
          <GlassFill intensity={22} tint="dark" />
          <Text style={st.previewCloseText}>✕</Text>
        </TouchableOpacity>

        {/* 전면 사진 (오버레이 PIP) — 탭하면 메인과 전환 */}
        {frontPhoto && backPhoto && (
          <TouchableOpacity
            style={st.pipWrapContainer}
            onPress={swapPhotos}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('snap.swapA11y')}
          >
            <LinearGradient
              colors={['#22D3EE', '#A855F7', '#D946EF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={st.pipInner}>
              <Image source={{ uri: frontPhoto }} style={st.pipImage} resizeMode="cover" />
              <View style={st.pipSwapBadge}>
                <GlassFill intensity={18} tint="dark" />
                <Text style={st.pipSwapIcon}>⇄</Text>
              </View>
            </View>
          </TouchableOpacity>
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
          {!detectedCountry && !selectedCountry && (
            <View style={st.previewBadge}>
              <Text style={st.previewBadgeText}>
                📍 위치 미확인{homeCountry ? ` · ${homeCountry.flag} ${homeCountry.name}로 기록` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 캡션 입력 */}
      <View style={st.captionArea}>
        <TextInput
          style={st.captionInput}
          placeholder={t('snap.captionPlaceholder')}
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
          <GlassFill intensity={18} tint="dark" />
          <Text style={st.retakeBtnText}>{t('snap.retake')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.sendBtnWrap} onPress={handleSave} activeOpacity={0.8}>
          <LinearGradient
            colors={['#22D3EE', '#A855F7', '#D946EF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.sendBtnGrad}
          >
            {/* 유리 스페큘러 하이라이트 (상단) */}
            <LinearGradient
              colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={st.sendSpecular}
              pointerEvents="none"
            />
            <Text style={st.sendBtnText}>⚡ {t('comp2.snapShare')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* 스냅은 영구 보존 (인스타 스토리와 달리 사라지지 않음) */}
      <Text style={st.expireNote}>{t('snap.expireNote')}</Text>
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
    // SafeAreaView가 상단 노치/상태바 인셋을 자동 패딩으로 추가하므로 여기선 작은 여백만.
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
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
  // 이전(닫기) 버튼 — 보라 틴트 글래스 (디자인 iPhone 17-58)
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(123,97,255,0.30)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  backBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  topCenter: { alignItems: 'center', gap: 4 },
  snapBadge: {
    color: '#22D3EE', fontSize: 24, fontWeight: '900', letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  locationText: {
    color: 'rgba(255,255,255,0.9)', fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // 안내 문구
  guideWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', zIndex: 5,
  },
  guidePill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 18, paddingVertical: 8,
  },
  guideText: {
    color: '#fff', fontSize: 14, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // 하단 컨트롤
  bottomBar: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 50 : 30, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  // 셔터 버튼 (Group 2085664476 디자인) — 시안 네온 글로우.
  // SVG는 원판 주위 여백이 있어(원판=프레임의 ~72%) 원래 외곽 ~80px에 맞추려 112로 렌더한다.
  shutterBtn: {
    width: 112, height: 112,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#22D3EE', shadowOpacity: 0.5, shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  shutterBoltWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  // 번개 아이콘 따뜻한 글로우
  boltGlow: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FFC53D', shadowOpacity: 0.9, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
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
  previewClose: {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  previewCloseText: { color: '#fff', fontSize: 18, fontWeight: '600' },
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
  pipSwapBadge: {
    position: 'absolute', right: 4, bottom: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  pipSwapIcon: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
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
    overflow: 'hidden',
  },
  sendSpecular: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '55%',
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // 안내
  expireNote: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    paddingVertical: 12,
  },
});
