import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { GearIcon, PersonIcon } from '../components/icons';
import GrainOverlay from '../components/GrainOverlay';
import {
  FloatingBlobs,
  LiquidPressable,
  GooeyCircle,
  LiquidCardGlow,
  useEntranceAnimation,
} from '../components/LiquidEffects';
// import { useRecords } from '../store/recordStore';

// ─── 컬러 상수 (Figma 디자인 기반) ───
const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  purpleThumb:  '#1A0A2E',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

// ─── 팔로워 카드 (리퀴드 프레스) ───
const StatCard = ({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) => (
  <LiquidPressable style={styles.statCard} onPress={onPress} intensity={0.08}>
    <LinearGradient
      colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: 48 }]}
    />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </LiquidPressable>
);

// ─── 여행 기록 썸네일 데이터 ───
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 4) / 3);
const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2; // 2열 그리드

// ─── 기록 형식 아이콘 (FAB과 동일한 View 기반) ───
const BADGE_SZ = 14;
const BADGE_C = '#FFFFFF';

const FeedBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 5, height: 2.5, borderTopLeftRadius: 1, borderTopRightRadius: 1, backgroundColor: BADGE_C }} />
    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: BADGE_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

const BlogBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, gap: 1.5 }}>
      <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 12, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 10, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 9, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
    </View>
  </View>
);

const AlbumBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 }}>
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const SnapBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: BADGE_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const VIEW_TYPE_BADGE: Record<string, React.ReactNode> = {
  feed: <FeedBadgeIcon />,
  blog: <BlogBadgeIcon />,
  album: <AlbumBadgeIcon />,
  snap: <SnapBadgeIcon />,
};

const VIEW_TYPE_NAMES: Record<string, string> = {
  feed: '피드', blog: '블로그', album: '앨범', snap: '스냅',
};

// 하나의 여행 = 하나의 썸네일 (여러 형식 기록 포함)
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

const TRIP_THUMBNAILS: TripThumbnail[] = [
  {
    id: 'trip-japan',
    emoji: '🗼',
    title: '도쿄 감성 여행',
    country: '일본',
    countryFlag: '🇯🇵',
    date: '2025.03',
    color: '#1A0A2E',
    records: [
      { id: '1', viewType: 'feed' },
      { id: '2', viewType: 'blog' },
      { id: '4', viewType: 'album' },
    ],
  },
  {
    id: 'trip-usa',
    emoji: '🗽',
    title: 'NYC 자유여행',
    country: '미국',
    countryFlag: '🇺🇸',
    date: '2025.01',
    color: '#0A1A2E',
    records: [
      { id: '3', viewType: 'blog' },
      { id: '7', viewType: 'feed' },
    ],
  },
  {
    id: 'trip-hongkong',
    emoji: '🌃',
    title: '홍콩 야경 투어',
    country: '홍콩',
    countryFlag: '🇭🇰',
    date: '2024.12',
    color: '#1A1A0A',
    records: [
      { id: '5', viewType: 'feed' },
    ],
  },
  {
    id: 'trip-thailand',
    emoji: '🏯',
    title: '방콕 힐링 여행',
    country: '태국',
    countryFlag: '🇹🇭',
    date: '2025.04',
    color: '#2E1A0A',
    records: [
      { id: 'seed-blog-1', viewType: 'blog' },
    ],
  },
  {
    id: 'trip-spain',
    emoji: '💃',
    title: '스페인 건축 탐방',
    country: '스페인',
    countryFlag: '🇪🇸',
    date: '2025.05',
    color: '#2E0A0A',
    records: [
      { id: 'seed-blog-2', viewType: 'blog' },
    ],
  },
  {
    id: 'trip-swiss',
    emoji: '🏔️',
    title: '알프스 설산 트레킹',
    country: '스위스',
    countryFlag: '🇨🇭',
    date: '2025.05',
    color: '#0A2E1A',
    records: [
      { id: 'seed-album', viewType: 'album' },
    ],
  },
];

// ─── 팔로잉 친구 샘플 ───
const FOLLOWING_FRIENDS = [
  { id: '1', username: 'seoyeon_l',  isAbroad: true,  currentCountry: '일본',   currentCountryFlag: '🇯🇵' },
  { id: '2', username: 'jihoon_p',   isAbroad: false, currentCountry: null,     currentCountryFlag: null },
  { id: '3', username: 'woosung_j',  isAbroad: false, currentCountry: null,     currentCountryFlag: null },
];

// ─── 배지 데이터 ───
const BADGES = [
  { id: 1, emoji: '🛫', name: '첫 도장', desc: '첫 번째 여행 기록', earned: true, glow: 'rgba(47,217,244,0.6)' },
  { id: 2, emoji: '🌏', name: '첫 아시아', desc: '아시아 첫 방문', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 3, emoji: '🗼', name: '일본 마스터', desc: '일본 5회 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 4, emoji: '🎒', name: '혼행러', desc: '혼자 여행 10회', earned: true, glow: 'rgba(255,100,100,0.5)' },
  { id: 5, emoji: '💍', name: '허니문', desc: '연인과 별점 5점', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 6, emoji: '🌟', name: '보이저 스타', desc: '보이저 공개 10개', earned: true, glow: 'rgba(47,217,244,0.6)' },
  { id: 7, emoji: '👑', name: '지구 정복자', desc: '50개국 방문', earned: false, glow: 'rgba(255,100,100,0.5)' },
];

// ─── 여행 카드 그라디언트 색상 매핑 ───
const TRIP_GRADIENT_COLORS: Record<string, [string, string]> = {
  'trip-japan': ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)'],
  'trip-usa': ['rgba(137,206,255,0.2)', 'rgba(137,206,255,0)'],
  'trip-hongkong': ['rgba(47,217,244,0.2)', 'rgba(47,217,244,0)'],
  'trip-thailand': ['rgba(255,200,100,0.2)', 'rgba(255,200,100,0)'],
  'trip-spain': ['rgba(255,100,100,0.2)', 'rgba(255,100,100,0)'],
  'trip-swiss': ['rgba(100,255,150,0.2)', 'rgba(100,255,150,0)'],
};

// ─── 배지 하이라이트 아이템 (리퀴드 구이 서클) ───
const BadgeHighlightItem = ({ emoji, name, glow, earned = true }: { emoji: string; name: string; glow?: string; earned?: boolean }) => (
  <LiquidPressable style={[badgeHL.item, !earned && { opacity: 0.6 }]} intensity={0.1}>
    <GooeyCircle size={48} color={glow || '#A855F7'} glowOpacity={earned ? 0.3 : 0.1}>
      <LinearGradient
        colors={['rgba(221,183,255,0.15)', 'rgba(221,183,255,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={badgeHL.glassCircleGradient}
      >
        {earned ? (
          <Text style={badgeHL.emoji}>{emoji}</Text>
        ) : (
          <Text style={badgeHL.lockIcon}>🔒</Text>
        )}
      </LinearGradient>
    </GooeyCircle>
  </LiquidPressable>
);

// ─── 배지 전체 목록 모달 ───
function BadgeListModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={blStyles.root}>
        {/* 핸들 바 */}
        <View style={blStyles.handle} />
        <Text style={blStyles.title}>획득한 배지</Text>

        <ScrollView
          contentContainerStyle={blStyles.grid}
          showsVerticalScrollIndicator={false}
        >
          {BADGES.map((badge) => (
            <View key={badge.id} style={[blStyles.cell, !badge.earned && { opacity: 0.3 }]}>
              <View style={blStyles.cellCircle}>
                <Text style={blStyles.cellEmoji}>{badge.emoji}</Text>
              </View>
              <Text style={blStyles.cellName}>{badge.name}</Text>
              <Text style={blStyles.cellDesc}>{badge.desc}</Text>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={blStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={blStyles.closeBtnText}>닫기</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 프로필 편집 모달 ───
function EditProfileModal({
  visible,
  currentName,
  currentPhoto,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  currentPhoto: string | null;
  onSave: (name: string, photo: string | null) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [photo, setPhoto] = useState<string | null>(currentPhoto);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('알림', '닉네임을 입력해주세요.');
      return;
    }
    onSave(name.trim(), photo);
    onClose();
  };

  // 모달이 열릴 때마다 현재 값으로 초기화
  React.useEffect(() => {
    if (visible) {
      setName(currentName);
      setPhoto(currentPhoto);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        {/* 헤더 */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>프로필 편집</Text>
          <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn}>
            <Text style={styles.modalSaveText}>저장</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 프로필 사진 */}
          <View style={styles.modalAvatarSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.modalAvatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.modalAvatarImg} />
              ) : (
                <View style={styles.modalAvatarPlaceholder}>
                  <PersonIcon size={50} color="#A0A0B0" />
                </View>
              )}
              {/* 편집 뱃지 */}
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.modalAvatarHint}>탭하여 사진 변경</Text>
          </View>

          {/* 닉네임 입력 */}
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>닉네임</Text>
            <View style={styles.modalInputWrap}>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder="닉네임을 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={20}
                autoCorrect={false}
              />
              <Text style={styles.modalCharCount}>{name.length}/20</Text>
            </View>
          </View>

          {/* 저장 버튼 (하단 대형) */}
          <TouchableOpacity style={styles.modalSaveLargeBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.modalSaveLargeText}>저장하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 사진 전체화면 뷰어 ───
function PhotoViewerModal({
  visible,
  photoUri,
  onClose,
}: {
  visible: boolean;
  photoUri: string;
  onClose: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const lastDistance = useRef(0);

  useEffect(() => {
    if (!visible) {
      currentScale.current = 1;
      scale.setValue(1);
    }
  }, [visible]);

  const getDistance = (touches: any[]) => {
    const [t1, t2] = touches;
    return Math.sqrt(
      Math.pow(t2.pageX - t1.pageX, 2) + Math.pow(t2.pageY - t1.pageY, 2)
    );
  };

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          lastDistance.current = getDistance([...evt.nativeEvent.touches]);
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          const dist = getDistance([...evt.nativeEvent.touches]);
          if (lastDistance.current > 0) {
            const ratio = dist / lastDistance.current;
            const next = Math.max(1, Math.min(4, currentScale.current * ratio));
            currentScale.current = next;
            scale.setValue(next);
          }
          lastDistance.current = dist;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        lastDistance.current = 0;
        if (currentScale.current < 1) {
          currentScale.current = 1;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={pvStyles.container}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 이미지 (핀치 줌) */}
        <View
          style={[pvStyles.imageWrap, { width: SCREEN_W, height: SCREEN_H }]}
          {...pinchResponder.panHandlers}
        >
          <Animated.Image
            source={{ uri: photoUri }}
            style={[pvStyles.image, { width: SCREEN_W, height: SCREEN_H, transform: [{ scale }] }]}
            resizeMode="contain"
          />
        </View>
        {/* X 버튼 */}
        <TouchableOpacity style={pvStyles.closeBtn} onPress={onClose}>
          <Text style={pvStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 아바타 액션 시트 ───
function AvatarActionSheet({
  visible,
  hasPhoto,
  onClose,
  onViewPhoto,
  onChangePhoto,
  onDeletePhoto,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onViewPhoto: () => void;
  onChangePhoto: () => void;
  onDeletePhoto: () => void;
}) {
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      translateY.setValue(500);
    }
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={asStyles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 바텀시트 */}
        <Animated.View style={[asStyles.sheet, { transform: [{ translateY }] }]}>
          {/* 핸들 바 */}
          <View style={asStyles.handle} />

          {/* 옵션 카드 */}
          <View style={asStyles.optionsCard}>
            {hasPhoto && (
              <>
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onViewPhoto}
                >
                  <Text style={asStyles.optionIcon}>📷</Text>
                  <Text style={asStyles.optionText}>사진 크게 보기</Text>
                </TouchableOpacity>
                <View style={asStyles.divider} />
              </>
            )}
            <TouchableOpacity
              style={asStyles.option}
              activeOpacity={0.7}
              onPress={onChangePhoto}
            >
              <Text style={asStyles.optionIcon}>✏️</Text>
              <Text style={asStyles.optionText}>프로필 사진 변경</Text>
            </TouchableOpacity>
            {hasPhoto && (
              <>
                <View style={asStyles.divider} />
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onDeletePhoto}
                >
                  <Text style={asStyles.optionIcon}>🗑️</Text>
                  <Text style={[asStyles.optionText, asStyles.deleteText]}>프로필 사진 삭제</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 취소 카드 */}
          <TouchableOpacity style={asStyles.cancelCard} activeOpacity={0.7} onPress={onClose}>
            <Text style={asStyles.cancelText}>취소</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── 드래그 핸들 ───
function DragHandle({
  onStart,
  onMove,
  onEnd,
}: {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
}) {
  const cbRef = useRef({ onStart, onMove, onEnd });
  cbRef.current = { onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => cbRef.current.onStart(),
      onPanResponderMove: (_, { dy }) => cbRef.current.onMove(dy),
      onPanResponderRelease: (_, { dy }) => cbRef.current.onEnd(dy),
      onPanResponderTerminate: (_, { dy }) => cbRef.current.onEnd(dy),
    })
  ).current;
  return (
    <View {...pan.panHandlers} style={orderSt.handle}>
      <Text style={orderSt.handleIcon}>⠿</Text>
    </View>
  );
}

// ─── 순서 조정 리스트 ───
const ITEM_H = 64;
type TripItem = { id: string; emoji: string; country: string; color: string; viewType: string };

function OrderableList({
  records,
  onReorder,
}: {
  records: TripItem[];
  onReorder: (newRecords: TripItem[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dragOffset = useRef(new Animated.Value(0)).current;
  const activeIdxRef = useRef<number | null>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const handleDragStart = (idx: number) => {
    activeIdxRef.current = idx;
    setActiveIdx(idx);
    dragOffset.setValue(0);
  };

  const handleDragMove = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    dragOffset.setValue(dy);
  };

  const handleDragEnd = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    const recs = recordsRef.current;
    const newIdx = Math.max(0, Math.min(recs.length - 1, idx + Math.round(dy / ITEM_H)));
    if (newIdx !== idx) {
      const newOrder = [...recs];
      const [removed] = newOrder.splice(idx, 1);
      newOrder.splice(newIdx, 0, removed);
      onReorder(newOrder);
    }
    activeIdxRef.current = null;
    setActiveIdx(null);
    dragOffset.setValue(0);
  };

  return (
    <View>
      {records.map((record, idx) => {
        const isActive = activeIdx === idx;
        return (
          <Animated.View
            key={record.id}
            style={[
              orderSt.item,
              isActive && {
                opacity: 0.85,
                transform: [{ translateY: dragOffset }, { scale: 1.02 }],
                zIndex: 10,
                elevation: 6,
              },
            ]}
          >
            <Text style={orderSt.emoji}>{record.emoji}</Text>
            <View style={orderSt.info}>
              <Text style={orderSt.name}>{record.country}</Text>
            </View>
            <DragHandle
              onStart={() => handleDragStart(idx)}
              onMove={(dy) => handleDragMove(idx, dy)}
              onEnd={(dy) => handleDragEnd(idx, dy)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── 묶음 설정 모달 ───
function GroupMergeModal({
  visible,
  selectedRecords,
  onClose,
  onSave,
}: {
  visible: boolean;
  selectedRecords: TripItem[];
  onClose: () => void;
  onSave: (title: string, coverRecordId: string, ordered: TripItem[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(selectedRecords[0]?.id ?? '');
  const [ordered, setOrdered] = useState<TripItem[]>([...selectedRecords]);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCover(selectedRecords[0]?.id ?? '');
      setOrdered([...selectedRecords]);
    }
  }, [visible]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('알림', '묶음 이름을 입력해주세요.');
      return;
    }
    onSave(title.trim(), cover, ordered);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={gmSt.sheet}>
          <View style={gmSt.handle} />
          <Text style={gmSt.sheetTitle}>묶음 설정</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 묶음 제목 */}
            <Text style={gmSt.sectionLabel}>묶음 제목</Text>
            <View style={gmSt.inputWrap}>
              <TextInput
                style={gmSt.input}
                value={title}
                onChangeText={setTitle}
                placeholder="여행 묶음 이름을 입력해주세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={30}
              />
            </View>
            <Text style={gmSt.inputHint}>예시: "유럽 3개국 여행", "일본 두 번째 방문"</Text>

            {/* 대표 기록 선택 */}
            <Text style={gmSt.sectionLabel}>대표 기록</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={gmSt.coverScroll}
              contentContainerStyle={gmSt.coverContent}
              nestedScrollEnabled
            >
              {ordered.map((record) => (
                <TouchableOpacity
                  key={record.id}
                  style={gmSt.coverThumb}
                  onPress={() => setCover(record.id)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      gmSt.thumbBg,
                      { backgroundColor: record.color },
                      cover === record.id && { borderColor: '#BF85FC' },
                    ]}
                  >
                    <Text style={gmSt.thumbEmoji}>{record.emoji}</Text>
                    {cover === record.id && (
                      <View style={gmSt.coverCheckBadge}>
                        <Text style={gmSt.coverCheckText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={gmSt.thumbLabel} numberOfLines={1}>
                    {record.country.split(' ').slice(1).join(' ')}
                  </Text>
                  {cover !== record.id && (
                    <Text style={gmSt.setAsLabel}>대표로 설정</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 기록 순서 조정 */}
            <Text style={gmSt.sectionLabel}>기록 순서</Text>
            <OrderableList records={ordered} onReorder={setOrdered} />

            {/* 저장 */}
            <TouchableOpacity style={gmSt.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={gmSt.saveBtnText}>저장하기</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 메인 프로필 화면 ───
export default function ProfileScreen({ navigation }: { navigation: any }) {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [badgeListVisible, setBadgeListVisible] = useState(false);

  const [profileName, setProfileName] = useState('yunjunsung');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);


  const handleChangePhoto = async () => {
    setActionSheetVisible(false);

    // 권한 확인
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      if (!canAskAgain) {
        // 권한이 영구적으로 거부된 경우 → 설정 화면으로 유도
        Alert.alert(
          '갤러리 접근 권한 필요',
          '갤러리 접근 권한이 필요해요. 설정에서 권한을 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            {
              text: '설정으로 이동',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      } else {
        Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
      }
      return;
    }

    // 갤러리 열기 (사진 유무와 관계없이 동일 흐름)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const handleDeletePhoto = () => {
    setActionSheetVisible(false);
    Alert.alert(
      '프로필 사진 삭제',
      '프로필 사진을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => setProfilePhoto(null),
        },
      ]
    );
  };

  const handleViewPhoto = () => {
    setActionSheetVisible(false);
    setTimeout(() => setPhotoViewerVisible(true), 150);
  };

  const openTripDetail = (trip: TripThumbnail) => {
    navigation.navigate('TripDetail', { trip });
  };


  return (
    <View style={styles.safeArea}>
      {/* 배경 떠다니는 블롭들 */}
      <FloatingBlobs />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 헤더 */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>프로필</Text>
          <LiquidPressable
            style={styles.settingBtn}
            onPress={() => navigation.navigate('Settings')}
            intensity={0.12}
          >
            <GearIcon size={22} color="#A0A0B0" />
          </LiquidPressable>
        </View>

        {/* 프로필 헤더 (아바타 + 정보) */}
        <View style={styles.profileRow}>
          <GrainOverlay opacity={0.03} dotCount={60} />
          {/* 아바타 — 구이 이펙트 서클 */}
          <LiquidPressable onPress={() => setActionSheetVisible(true)} intensity={0.08}>
            <GooeyCircle size={96} color="#A855F7" glowOpacity={0.35}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatar}>
                  <PersonIcon size={44} color="#A0A0B0" />
                </View>
              )}
            </GooeyCircle>
          </LiquidPressable>

          {/* 이름 · 위치 · 통계 */}
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{profileName}</Text>
            <Text style={styles.userLocation}>🇰🇷 대한민국</Text>
            <View style={styles.statsRow}>
              <StatCard value="8" label="기록 수" />
              <StatCard value={String(FOLLOWING_FRIENDS.length)} label="팔로잉" onPress={() => navigation.navigate('FollowingList')} />
              <StatCard value="3" label="방문국가" />
            </View>
          </View>
        </View>

        {/* 배지 하이라이트 (구이 서클) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={badgeHL.scroll}
          contentContainerStyle={badgeHL.scrollContent}
        >
          {BADGES.slice(0, 5).map((badge) => (
            <BadgeHighlightItem key={badge.id} emoji={badge.emoji} name={badge.name} glow={badge.glow} earned={badge.earned} />
          ))}
          {BADGES.length > 5 && (
            <LiquidPressable
              style={badgeHL.item}
              onPress={() => setBadgeListVisible(true)}
              intensity={0.1}
            >
              <View style={badgeHL.moreCircle}>
                <Text style={badgeHL.moreText}>{'전체\n보기'}</Text>
              </View>
            </LiquidPressable>
          )}
        </ScrollView>

        <View style={styles.divider} />

        {/* 여행 기록 헤더 */}
        <View style={gridSt.gridHeaderRow}>
          <Text style={gridSt.gridHeaderTitle}>여행 기록</Text>
          <Text style={gridSt.tripCount}>{TRIP_THUMBNAILS.length}개의 여행</Text>
        </View>

        {/* 여행 썸네일 - 첫 번째 카드 (풀 와이드 + 리퀴드 글로우) */}
        {TRIP_THUMBNAILS.length > 0 && (
          <LiquidPressable
            style={thumbSt.mainCard}
            onPress={() => openTripDetail(TRIP_THUMBNAILS[0])}
            intensity={0.04}
          >
            {/* 출렁이는 글로우 배경 */}
            <LiquidCardGlow
              width={SCREEN_WIDTH}
              height={320}
              color={TRIP_THUMBNAILS[0].id === 'trip-japan' ? '#DDB7FF' : '#A855F7'}
              opacity={0.2}
            />
            <LinearGradient
              colors={TRIP_GRADIENT_COLORS[TRIP_THUMBNAILS[0].id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={thumbSt.mainEmojiWrap}>
              <Text style={thumbSt.mainEmoji}>{TRIP_THUMBNAILS[0].emoji}</Text>
            </View>
            <View style={thumbSt.mainInfoBar}>
              <View style={{ flex: 1 }}>
                <Text style={thumbSt.mainTitle}>{TRIP_THUMBNAILS[0].countryFlag} {TRIP_THUMBNAILS[0].title}</Text>
                <Text style={thumbSt.mainDate}>{TRIP_THUMBNAILS[0].date}</Text>
              </View>
              <View style={thumbSt.mainBadges}>
                {TRIP_THUMBNAILS[0].records.map((rec) => (
                  <LiquidPressable key={rec.id} style={thumbSt.mainBadge} intensity={0.15}>
                    {VIEW_TYPE_BADGE[rec.viewType] || null}
                  </LiquidPressable>
                ))}
              </View>
            </View>
          </LiquidPressable>
        )}

        {/* 여행 썸네일 - 그리드 카드 (2열 + 리퀴드 프레스 + 글로우) */}
        <View style={thumbSt.grid}>
          {TRIP_THUMBNAILS.slice(1).map((trip) => (
            <LiquidPressable
              key={trip.id}
              style={thumbSt.gridCard}
              onPress={() => openTripDetail(trip)}
              intensity={0.05}
            >
              {/* 출렁이는 글로우 */}
              <LiquidCardGlow
                width={THUMB_WIDTH}
                height={260}
                color={TRIP_GRADIENT_COLORS[trip.id]?.[0]?.replace(/[,\s]0\.\d+\)/, ',1)') || '#A855F7'}
                opacity={0.15}
              />
              <LinearGradient
                colors={TRIP_GRADIENT_COLORS[trip.id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={thumbSt.gridEmojiWrap}>
                <Text style={thumbSt.gridEmoji}>{trip.emoji}</Text>
              </View>
              <View style={thumbSt.gridInfoBar}>
                <Text style={thumbSt.gridTitle}>{trip.countryFlag} {trip.title}</Text>
                <Text style={thumbSt.gridDate}>{trip.date}</Text>
                <View style={thumbSt.gridBadges}>
                  {trip.records.map((rec) => (
                    <LiquidPressable key={rec.id} style={thumbSt.gridBadge} intensity={0.15}>
                      {VIEW_TYPE_BADGE[rec.viewType] || null}
                    </LiquidPressable>
                  ))}
                </View>
              </View>
            </LiquidPressable>
          ))}
        </View>

      </ScrollView>


      {/* 아바타 액션 시트 */}
      <AvatarActionSheet
        visible={actionSheetVisible}
        hasPhoto={!!profilePhoto}
        onClose={() => setActionSheetVisible(false)}
        onViewPhoto={handleViewPhoto}
        onChangePhoto={handleChangePhoto}
        onDeletePhoto={handleDeletePhoto}
      />

      {/* 사진 전체화면 뷰어 */}
      {profilePhoto && (
        <PhotoViewerModal
          visible={photoViewerVisible}
          photoUri={profilePhoto}
          onClose={() => setPhotoViewerVisible(false)}
        />
      )}

      {/* 배지 전체 목록 모달 */}
      <BadgeListModal
        visible={badgeListVisible}
        onClose={() => setBadgeListVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // 헤더
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 56,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  settingBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(46,46,59,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // 프로필 헤더 행 (아바타 + 정보)
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1F1F22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(168,85,247,0.6)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarImg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: 'rgba(168,85,247,0.6)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
    textShadowColor: 'rgba(191,133,252,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  userHandle: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  userLocation: {
    fontSize: 12,
    color: '#CFC2D6',
    letterSpacing: 0.6,
  },

  // 통계 행
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  statCard: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  statValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#CFC2D6',
    letterSpacing: 0.4,
  },
  followingExpandedWrap: {
    marginTop: 8,
    backgroundColor: '#1A1A26',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: -16,
    marginBottom: 10,
  },
  friendsSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 8,
    marginTop: 8,
  },
  friendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  friendBarAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  friendBarUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  friendBarAbroad: {
    fontSize: 12,
    color: COLORS.purpleNeon,
    marginTop: 2,
  },
  friendBarHome: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 48,
  },
  itemDividerFull: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 80,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 여행 아이템
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  tripThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.purpleThumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEmoji: {
    fontSize: 20,
  },
  tripInfo: {
    flex: 1,
    gap: 2,
  },
  tripCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripDate: {
    fontSize: 10,
    color: COLORS.textDim,
  },
  tripStars: {
    fontSize: 10,
    color: COLORS.purpleNeon,
  },

  // 획득 배지
  badgesScroll: {
    marginBottom: 4,
  },
  badgesContent: {
    gap: 10,
    paddingVertical: 4,
  },
  badgeCard: {
    width: 72,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  badgeCardLocked: {
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#1A1A24',
  },
  badgeEmoji: {
    fontSize: 26,
  },
  badgeName: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textDim,
    textAlign: 'center',
  },
  badgeLock: {
    fontSize: 10,
  },

  // 프리미엄 배너
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  premiumIcon: {
    fontSize: 24,
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  premiumSub: {
    fontSize: 11,
    color: COLORS.textDim,
  },

  // 설정 그룹
  settingGroup: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    fontSize: 16,
    width: 24,
  },
  settingLabel: {
    fontSize: 13,
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  premiumBadge: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 로그아웃
  logoutBtn: {
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: COLORS.redBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    fontSize: 14,
    color: COLORS.red,
  },

  // 버전
  versionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // ─── 편집 모달 스타일 ───
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  modalCancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalCancelText: {
    fontSize: 14,
    color: COLORS.textDim,
  },
  modalSaveBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },

  // 모달 아바타
  modalAvatarSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  modalAvatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  modalAvatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarImg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
  },
  modalAvatarText: {
    fontSize: 38,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    fontSize: 14,
  },
  modalAvatarHint: {
    fontSize: 12,
    color: COLORS.purpleNeon,
  },

  // 모달 입력 필드
  modalField: {
    marginBottom: 28,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    paddingHorizontal: 16,
  },
  modalInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
    paddingVertical: 15,
  },
  modalCharCount: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // 모달 저장 버튼
  modalSaveLargeBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSaveLargeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
  },
});

// ─── 사진 뷰어 스타일 ───
const pvStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

// ─── 여행 기록 3열 그리드 스타일 ───
const gridSt = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginHorizontal: -16,
    marginBottom: 20,
  },
  cell: {
    width: CELL_SIZE,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  cellEmoji: {
    fontSize: 36,
  },
  cellCountry: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  typeBadgeIcon: {
    fontSize: 12,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editBtnText: {
    fontSize: 14,
    color: '#BF85FC',
    fontWeight: '500',
  },
  tripCount: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(191,133,252,0.18)',
  },

  // ── 행 기반 그리드 ──
  rowContainer: {
    marginHorizontal: -16,
    marginBottom: 20,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
  },

  // ── 묶음 셀 ──
  groupCell: {
    width: CELL_SIZE * 2 + 2,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupCoverEmoji: {
    fontSize: 44,
  },
  groupOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    paddingRight: 34,
    gap: 2,
  },
  groupFlags: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  groupBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  groupBadgeIcon: {
    fontSize: 13,
  },
});

// ─── 배지 하이라이트 스타일 ───
const badgeHL = StyleSheet.create({
  scroll: {
    marginBottom: 10,
    height: 80,
  },
  scrollContent: {
    paddingLeft: 16,
    paddingRight: 8,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  item: {
    alignItems: 'center',
    width: 48,
  },
  glassCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
    elevation: 10,
  },
  glassCircleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  lockIcon: {
    fontSize: 18,
  },
  name: {
    fontSize: 12,
    color: '#CFC2D6',
    textAlign: 'center',
  },
  moreCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    color: '#BF85FC',
    textAlign: 'center',
    lineHeight: 15,
  },
});

// ─── 배지 전체 목록 모달 스타일 ───
const blStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  cell: {
    width: '47%',
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    gap: 6,
  },
  cellCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A1A24',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cellEmoji: {
    fontSize: 28,
  },
  cellName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cellDesc: {
    fontSize: 11,
    color: '#A1A1B0',
    textAlign: 'center',
  },
  closeBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});

// ─── 썸네일 그리드 스타일 ───
const thumbSt = StyleSheet.create({
  // 메인 카드 (첫 번째 여행)
  mainCard: {
    width: '100%',
    height: 260,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
  },
  mainEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainEmoji: {
    fontSize: 72,
  },
  mainInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,14,17,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mainDate: {
    fontSize: 12,
    color: '#CFC2D6',
    marginTop: 2,
  },
  mainBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  mainBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // 그리드 카드 (나머지 여행들)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridCard: {
    width: THUMB_WIDTH,
    height: 210,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  gridEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEmoji: {
    fontSize: 48,
  },
  gridInfoBar: {
    backgroundColor: 'rgba(14,14,17,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gridDate: {
    fontSize: 12,
    color: '#CFC2D6',
  },
  gridBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  gridBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

// ─── 여행 상세 모달 스타일 ───
const detailSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#A1A1B0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  list: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemEmoji: {
    fontSize: 22,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemDesc: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  itemArrow: {
    fontSize: 22,
    color: '#BF85FC',
    fontWeight: '300',
  },
});

// ─── 묶음 설정 모달 스타일 ───
const gmSt = StyleSheet.create({
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BF85FC',
    marginBottom: 10,
    marginTop: 20,
    letterSpacing: 0.3,
  },
  inputWrap: {
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
    paddingHorizontal: 14,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 13,
  },
  inputHint: {
    fontSize: 11,
    color: '#A1A1B0',
    marginTop: 6,
  },
  coverScroll: {
    marginBottom: 4,
  },
  coverContent: {
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  coverThumb: {
    width: 72,
    alignItems: 'center',
    gap: 5,
  },
  thumbBg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbEmoji: {
    fontSize: 28,
  },
  coverCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCheckText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  thumbLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  setAsLabel: {
    fontSize: 9,
    color: '#BF85FC',
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

// ─── 순서 조정 리스트 스타일 ───
const orderSt = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  emoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  handle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIcon: {
    fontSize: 20,
    color: '#A1A1B0',
  },
});

// ─── 액션 시트 스타일 ───
const asStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  optionsCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionIcon: {
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteText: {
    color: '#FF3B30',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
    marginLeft: 58,
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});
