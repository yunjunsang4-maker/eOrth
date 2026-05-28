import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  TextInput,
  Dimensions,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PinIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import {
  detectCurrentCountry,
  formatLateSeconds,
} from '../services/snapService';
import { COUNTRIES } from '../constants/countries';

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

interface Props {
  navigation: any;
  route?: any;
}

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
        <TouchableOpacity style={st.permBtn} onPress={requestPermission}>
          <Text style={st.permBtnText}>권한 허용</Text>
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

    const matchedCountry = detectedCountry
      ? COUNTRIES.find(c => c.name === detectedCountry || c.term.toLowerCase() === detectedCountry.toLowerCase())
      : null;

    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    addRecord({
      user: { name: '나', emoji: '⚡', handle: 'yunjunsung' },
      country: matchedCountry ? `${matchedCountry.flag} ${matchedCountry.name}` : (detectedCountry || ''),
      countryName: matchedCountry?.name || detectedCountry || '',
      countryFlag: matchedCountry?.flag || '',
      countries: matchedCountry ? [{ flag: matchedCountry.flag, name: matchedCountry.name }] : [],
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
            <Text style={st.flipIcon}>🔄</Text>
          </TouchableOpacity>

          {/* 셔터 버튼 */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[st.shutterOuter, shooting && { opacity: 0.5 }]}
              onPress={takePhoto}
              activeOpacity={0.7}
              disabled={shooting}
            >
              <View style={st.shutterInner}>
                <Text style={st.shutterIcon}>⚡</Text>
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

        {/* 전면 사진 (오버레이 PIP) */}
        {frontPhoto && (
          <View style={st.pipWrap}>
            <Image source={{ uri: frontPhoto }} style={st.pipImage} resizeMode="cover" />
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
        <TouchableOpacity style={st.sendBtn} onPress={handleSave} activeOpacity={0.7}>
          <Text style={st.sendBtnText}>⚡ 공유하기</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  topCenter: { alignItems: 'center', gap: 4 },
  snapBadge: {
    color: C.snapYellow, fontSize: 15, fontWeight: '900', letterSpacing: 2,
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
  shutterOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4, borderColor: C.snapYellow,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.snapYellow,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterIcon: { fontSize: 28 },
  flipBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  flipIcon: { fontSize: 24 },

  // 미니 프리뷰
  miniPreview: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 140 : 120,
    left: 20, alignItems: 'center', gap: 4,
  },
  miniImg: {
    width: 60, height: 80, borderRadius: 10,
    borderWidth: 2, borderColor: C.snapYellow,
  },
  miniLabel: { color: C.snapYellow, fontSize: 10, fontWeight: '700' },

  // 권한 화면
  permScreen: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  permEmoji: { fontSize: 60, marginBottom: 20 },
  permTitle: { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 10 },
  permDesc: { color: C.dim, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  permBtn: {
    backgroundColor: C.snapYellow, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  permBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  permSkip: { marginTop: 16 },
  permSkipText: { color: C.dim, fontSize: 14 },

  // 프리뷰 화면
  previewSafe: { flex: 1, backgroundColor: C.snapBg },
  previewContainer: {
    flex: 1, margin: 12, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#111',
  },
  previewMain: { width: '100%', height: '100%' },
  pipWrap: {
    position: 'absolute', top: 16, left: 16,
    width: SW * 0.28, height: SW * 0.37,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: C.snapYellow,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 8,
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
  sendBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 16,
    backgroundColor: C.snapYellow, alignItems: 'center',
  },
  sendBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

  // 안내
  expireNote: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    paddingVertical: 12,
  },
});
