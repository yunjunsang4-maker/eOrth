import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  Share,
  Image,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  interpolate, Extrapolation, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommentIcon as CommentSvgIcon, PersonIcon, PaperclipIcon, TrashIcon, CameraIcon, LandscapeIcon, CalendarIcon, PlaneIcon, TransferIcon, PencilIcon, LinkIcon, MegaphoneIcon, ShareIcon, ArchiveIcon } from '../components/icons';
import { useRecords, TravelRecord } from '../store/recordStore';
import ReportModal from '../components/ReportModal';
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import type { BlogBlock, HeadingBlock } from '../types/blogBlocks';
import { extractHeadings, blocksToPlainText, blocksToPhotos } from '../types/blogBlocks';
import { stickers } from '../components/stickers';
import { toNaverHtml, BlogData } from '../utils/naverBlogConverter';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const C = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  accent: '#BF85FC',
  accentDim: 'rgba(191,133,252,0.12)',
  accentBorder: 'rgba(191,133,252,0.2)',
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#5A5A6E',
  red: '#FF6B9D',
};

type Comment = {
  id: string;
  emoji: string;
  name: string;
  text: string;
  time: string;
  replies?: Comment[];
};

const SAMPLE_COMMENTS: Comment[] = [
  { id: '1', emoji: '🧑', name: '김민준', text: '너무 부럽다 나도 가고싶어!', time: '2시간 전', replies: [
    { id: '1-1', emoji: '👩', name: '이서연', text: '맞아 진짜 부럽다!', time: '1시간 전' },
  ] },
  { id: '2', emoji: '👩', name: '이서연', text: '사진 너무 예쁘다 🔥', time: '1시간 전' },
  { id: '3', emoji: '🧑‍💻', name: '박지훈', text: '어디 동네야? 정보 공유 좀!', time: '30분 전' },
];

const currencySymbol = (code: string): string => {
  const map: Record<string, string> = {
    KRW: '₩', JPY: '¥', USD: '$',
    EUR: '€', CNY: '¥', GBP: '£',
    AUD: 'A$', CAD: 'C$', CHF: 'CHF',
    HKD: 'HK$', SGD: 'S$', THB: '฿',
    VND: '₫', MYR: 'RM', PHP: '₱',
    IDR: 'Rp', INR: '₹', TRY: '₺',
    MXN: 'MX$', BRL: 'R$', AED: 'AED',
    NZD: 'NZ$', SEK: 'kr', NOK: 'kr',
    DKK: 'kr', CZK: 'Kč', HUF: 'Ft',
    PLN: 'zł',
  };
  return map[code] || code;
};

const weatherIcon = (w: string): string => {
  const map: Record<string, string> = {
    '맑음': '☀️', '화창': '☀️',
    '부분흐림': '🌤️', '구름조금': '🌤️', '구름 조금': '🌤️',
    '흐림': '☁️', '구름많음': '☁️', '구름 많음': '☁️',
    '비': '🌧️', '소나기': '🌦️',
    '눈': '🌨️', '폭설': '❄️',
    '안개': '🌫️',
    '천둥': '⛈️', '번개': '⛈️', '뇌우': '⛈️',
    '바람': '💨',
    '더움': '🔥', '추움': '🥶',
  };
  return map[w] || '🌤️';
};

// ─── 동행자 아이콘 ───
const IC = C.dim;
const ISZ = 14;

const SoloIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: 0, width: 5, height: 5, borderRadius: 2.5, backgroundColor: IC }} />
    <View style={{ position: 'absolute', bottom: 0, width: 7, height: 4, borderTopLeftRadius: 3.5, borderTopRightRadius: 3.5, backgroundColor: IC }} />
    <View style={{ position: 'absolute', top: 1, right: 1, width: 1.5, height: 6, borderRadius: 1, backgroundColor: IC, transform: [{ rotate: '-20deg' }] }} />
  </View>
);

const FriendIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'flex-end' }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
        <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
        <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
      </View>
    </View>
  </View>
);

const CoupleIcon = () => (
  <View style={{ width: ISZ, height: ISZ }}>
    <View style={{ position: 'absolute', left: 0, bottom: 0, alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ position: 'absolute', right: 0, bottom: 0, alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ position: 'absolute', top: 0, left: ISZ / 2 - 3.5, width: 7, height: 6 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: IC }} />
      <View style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: IC }} />
      <View style={{ position: 'absolute', bottom: 0, left: 1, width: 5, height: 4, backgroundColor: IC, transform: [{ rotate: '45deg' }] }} />
    </View>
  </View>
);

const FamilyIcon = () => (
  <View style={{ width: ISZ, height: ISZ, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 }}>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 4, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 4, height: 2.5, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 4, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
  </View>
);

const ParentIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'flex-end' }}>
    <View style={{ position: 'absolute', top: 0, width: 5, height: 5, borderRadius: 2.5, backgroundColor: IC }} />
    <View style={{ width: 8, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: IC }} />
    <View style={{ position: 'absolute', right: 0, bottom: 0, width: 1.5, height: 9, borderRadius: 1, backgroundColor: IC, opacity: 0.6 }} />
  </View>
);

const SiblingIcon = () => (
  <View style={{ width: ISZ, height: ISZ, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 }}>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 3, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
  </View>
);

const companionIcon = (name: string): React.ReactNode => {
  const map: Record<string, React.ReactNode> = {
    '혼자': <SoloIcon />,
    '친구': <FriendIcon />,
    '연인': <CoupleIcon />,
    '가족': <FamilyIcon />,
    '부모님': <ParentIcon />,
    '형제': <SiblingIcon />,
  };
  return map[name] || <FriendIcon />;
};

// ─── 슬라이드 이미지 뷰어 (상세보기용) ───
const SlideImageViewerDetail = ({ items, onImagePress }: { items: { uri: string; caption?: string }[]; onImagePress?: (uris: string[], index: number) => void }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const slideW = SCREEN_W - 32;
  const slideH = slideW * 0.75;
  return (
    <View style={{ marginBottom: 14 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / slideW);
          setActiveIdx(idx);
        }}
        style={{ width: slideW, height: slideH }}
      >
        {items.map((item, i) => (
          <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => onImagePress?.(items.map(it => it.uri), i)}>
            <Image source={{ uri: item.uri }} style={{ width: slideW, height: slideH, borderRadius: 8 }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 6, gap: 5 }}>
          {items.map((_, i) => (
            <View key={i} style={{
              width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIdx ? '#BF85FC' : '#4A4A59',
            }} />
          ))}
        </View>
      )}
    </View>
  );
};

// ─── 블로그 블록 렌더러 ───
const BlogBlockRenderer = ({
  block,
  fontScale,
  onImagePress,
}: {
  block: BlogBlock;
  fontScale: number;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  switch (block.type) {
    case 'text': {
      const fs = (block.fontSize || 15) * fontScale;
      return (
        <Text
          style={[
            blogS.text,
            { fontSize: fs, lineHeight: fs * 1.7 },
            block.bold && { fontWeight: '700' },
            block.italic && { fontStyle: 'italic' },
            (block.underline || block.strikethrough) && {
              textDecorationLine: block.underline
                ? (block.strikethrough ? 'underline line-through' : 'underline')
                : 'line-through',
            },
            block.color && { color: block.color },
            block.bgColor && block.bgColor !== 'transparent' && { backgroundColor: block.bgColor },
            block.align && { textAlign: block.align },
            block.fontFamily && block.fontFamily !== 'System' && { fontFamily: block.fontFamily },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'heading': {
      const sizes = { 1: 24, 2: 20, 3: 17 };
      const fs = sizes[block.level] * fontScale;
      return (
        <Text
          style={[
            blogS.heading,
            { fontSize: fs, lineHeight: fs * 1.4 },
            block.align && { textAlign: block.align },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'image':
      return (
        <View style={blogS.imageWrap}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.([block.uri], 0)}>
            <Image source={{ uri: block.uri }} style={blogS.image} resizeMode="cover" />
          </TouchableOpacity>
          {block.caption ? <Text style={blogS.caption}>{block.caption}</Text> : null}
        </View>
      );
    case 'images': {
      if (block.layout === 'slide') {
        return <SlideImageViewerDetail items={block.items} onImagePress={onImagePress} />;
      }
      const cols = block.layout === 'grid3' ? 3 : 2;
      return (
        <View style={blogS.imagesGrid}>
          {block.items.map((item, i) => (
            <View key={i} style={{ width: `${100 / cols - 1}%` as any }}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.(block.items.map(it => it.uri), i)}>
                <Image source={{ uri: item.uri }} style={blogS.gridImage} resizeMode="cover" />
              </TouchableOpacity>
              {item.caption ? <Text style={blogS.caption}>{item.caption}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    case 'separator': {
      const sepStyles: Record<string, any> = {
        line: { borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
        dots: { borderBottomWidth: 1, borderStyle: 'dotted', borderBottomColor: '#2A2A3A' },
        dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: '#2A2A3A' },
        thick: { borderBottomWidth: 3, borderBottomColor: '#2A2A3A' },
        space: { height: 32 },
      };
      return <View style={[blogS.separator, sepStyles[block.style] || sepStyles.line]} />;
    }
    case 'quote':
      return (
        <View style={blogS.quote}>
          <Text style={[blogS.quoteText, { fontSize: 15 * fontScale }]}>{block.value}</Text>
        </View>
      );
    case 'link':
      return (
        <TouchableOpacity
          style={blogS.linkCard}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(block.url).catch(() => {})}
        >
          {block.thumbnail ? (
            <Image source={{ uri: block.thumbnail }} style={blogS.linkThumb} />
          ) : null}
          <View style={blogS.linkInfo}>
            <Text style={blogS.linkTitle} numberOfLines={1}>
              {block.title || block.url}
            </Text>
            {block.description ? (
              <Text style={blogS.linkDesc} numberOfLines={2}>{block.description}</Text>
            ) : null}
            <Text style={blogS.linkUrl} numberOfLines={1}>{block.url}</Text>
          </View>
        </TouchableOpacity>
      );
    case 'sticker': {
      const found = stickers.find((s) => s.id === block.stickerId);
      if (found) {
        const StickerComp = found.component;
        return (
          <View style={blogS.stickerWrap}>
            <StickerComp size={80} />
          </View>
        );
      }
      return (
        <View style={blogS.stickerWrap}>
          <Text style={blogS.stickerFallback}>{block.stickerName}</Text>
        </View>
      );
    }
    case 'file': {
      const sizeStr = block.fileSize ? (block.fileSize < 1024 * 1024 ? `${(block.fileSize / 1024).toFixed(0)}KB` : `${(block.fileSize / (1024 * 1024)).toFixed(1)}MB`) : '';
      return (
        <View style={blogS.fileBlock}>
          <PaperclipIcon size={20} color="#A1A1B0" />
          <View style={{ flex: 1 }}>
            <Text style={blogS.fileName} numberOfLines={1}>{block.fileName}</Text>
            {sizeStr ? <Text style={blogS.fileSize}>{sizeStr}</Text> : null}
          </View>
        </View>
      );
    }
    default:
      return null;
  }
};

// ─── 목차(TOC) 컴포넌트 ───
const TableOfContents = ({
  headings,
  onPress,
}: {
  headings: { id: string; level: number; text: string }[];
  onPress: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  if (headings.length === 0) return null;
  return (
    <View style={blogS.tocWrap}>
      <TouchableOpacity style={blogS.tocToggle} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={blogS.tocToggleText}>📋 목차</Text>
        <Text style={blogS.tocArrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open &&
        headings.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[blogS.tocItem, { paddingLeft: 16 + (h.level - 1) * 16 }]}
            onPress={() => onPress(h.id)}
            activeOpacity={0.7}
          >
            <Text style={blogS.tocItemText}>{h.text}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
};

// ── 스냅 스토리 뷰어 (자립형 — 내부에서 스냅 인덱스 관리) ──
// 같은 스토리 안에서 스냅 사진이 바뀔 때 부드럽게 크로스페이드
function CrossfadePhoto({ uri }: { uri?: string }) {
  const op = useRef(new Animated.Value(1)).current;
  const prev = useRef(uri);
  useEffect(() => {
    if (prev.current !== uri) {
      prev.current = uri;
      op.setValue(0.4);
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [uri]);
  if (!uri) {
    return <View style={storyS.bgPlaceholder}><Text style={{ fontSize: 64, opacity: 0.2 }}>📸</Text></View>;
  }
  return <Animated.Image source={{ uri }} style={[storyS.bgPhoto, { opacity: op }]} resizeMode="cover" />;
}

// ── 큐브 페이지: scrollX 기반으로 100% UI 스레드에서 3D rotateY 회전 ──
function SnapCubePage({ index, scrollX, width, leftCube, rightCube, children }: {
  index: number; scrollX: any; width: number; leftCube: boolean; rightCube: boolean; children: React.ReactNode;
}) {
  // 같은 유저/여행 경계는 평범한 슬라이드(회전 0), 다른 유저 경계만 큐브 회전
  const cubeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const lA = leftCube ? 88 : 0;
    const rA = rightCube ? -88 : 0;
    const rotateY = interpolate(scrollX.value, input, [lA, 0, rA], Extrapolation.CLAMP);
    const pivot = interpolate(scrollX.value, input, [leftCube ? -width / 2 : 0, 0, rightCube ? width / 2 : 0], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.value, input, [leftCube ? 0.93 : 1, 1, rightCube ? 0.93 : 1], Extrapolation.CLAMP);
    return {
      transform: [
        { perspective: width * 1.6 },
        { translateX: pivot },
        { rotateY: `${rotateY}deg` },
        { translateX: -pivot },
        { scale },
      ],
    };
  });
  const shadeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const opacity = interpolate(scrollX.value, input, [leftCube ? 0.5 : 0, 0, rightCube ? 0.5 : 0], Extrapolation.CLAMP);
    return { opacity };
  });
  return (
    <Reanimated.View style={[{ width, height: '100%', backfaceVisibility: 'hidden' }, cubeStyle]}>
      {children}
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shadeStyle]} />
    </Reanimated.View>
  );
}

function SnapViewerModal({
  visible,
  onClose,
  viewers = [
    { name: '김서연', handle: 'seoyeon_l', time: '5분 전', emoji: '🌸' },
    { name: '김민준', handle: 'minjun_k', time: '20분 전', emoji: '⚡' },
    { name: '박지훈', handle: 'jihoon_p', time: '1시간 전', emoji: '🎒' },
  ]
}: {
  visible: boolean;
  onClose: () => void;
  viewers?: any[];
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={viewerS.root}>
        {/* 드래그바 */}
        <View style={viewerS.handle} />
        <Text style={viewerS.title}>이 스냅을 본 친구들</Text>
        <Text style={viewerS.subtitle}>총 {viewers.length}명이 읽음</Text>
        
        <ScrollView contentContainerStyle={viewerS.list} showsVerticalScrollIndicator={false}>
          {viewers.map((v, i) => (
            <View key={i} style={viewerS.row}>
              <View style={viewerS.avatar}>
                <Text style={viewerS.avatarText}>{v.emoji}</Text>
              </View>
              <View style={viewerS.info}>
                <Text style={viewerS.name}>{v.name}</Text>
                <Text style={viewerS.handleText}>@{v.handle}</Text>
              </View>
              <Text style={viewerS.time}>{v.time}</Text>
            </View>
          ))}
        </ScrollView>
        
        <TouchableOpacity style={viewerS.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={viewerS.closeBtnText}>닫기</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function SnapStoryViewer({
  initialPostId, records, navigation, toggleLike, deleteRecord, markSnapViewed,
}: {
  initialPostId: string;
  records: any[];
  navigation: any;
  toggleLike: (id: string) => void;
  deleteRecord: (id: string) => void;
  markSnapViewed: (id: string) => void;
}) {
  // 작성자별로 그룹화된 전체 스냅 목록 (같은 작성자끼리 연속 배치)
  const allSnaps = useMemo(() => records.filter((r: any) => r.viewType === 'snap'), [records]);
  // 작성자 + 국가별로 그룹화 (같은 사용자라도 다른 나라면 별도 스토리)
  const getStoryKey = (s: any) =>
    `${s.user.handle}::${s.countryName || s.snapDetectedCountry || ''}`;

  // 스토리(유저+국가) 단위 그룹 — 선택한 스토리를 맨 앞으로
  const stories = useMemo(() => {
    const byKey: Record<string, any[]> = {};
    const order: string[] = [];
    const initialSnap = allSnaps.find((r: any) => r.id === initialPostId);
    const startKey = initialSnap ? getStoryKey(initialSnap) : '';
    allSnaps.forEach((s: any) => {
      const k = getStoryKey(s);
      if (!byKey[k]) { byKey[k] = []; order.push(k); }
      byKey[k].push(s);
    });
    const keys = [startKey, ...order.filter(k => k !== startKey)].filter(k => byKey[k]);
    return keys.map(k => ({ key: k, snaps: byKey[k] }));
  }, [allSnaps, initialPostId]);

  const initPos = useMemo(() => {
    for (let si = 0; si < stories.length; si++) {
      const li = stories[si].snaps.findIndex((s: any) => s.id === initialPostId);
      if (li >= 0) return { si, li };
    }
    return { si: 0, li: 0 };
  }, []);

  const [storyIdx, setStoryIdx] = useState(initPos.si);
  const [localIdx, setLocalIdx] = useState(initPos.li);
  const currentStory = stories[storyIdx];
  const currentSnap = currentStory?.snaps[Math.min(localIdx, (currentStory?.snaps.length || 1) - 1)];
  // 스냅 열람 시 viewed 처리
  useEffect(() => {
    if (currentSnap && !currentSnap.snapViewed) markSnapViewed(currentSnap.id);
  }, [currentSnap?.id]);

  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [replyBarOpen, setReplyBarOpen] = useState(false);
  const [comments, setComments] = useState<any[]>(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const replyInputRef = useRef<TextInput>(null);
  const commentInputRef = useRef<TextInput>(null);

  const commentSheetAnim = useRef(new Animated.Value(SCREEN_H * 0.6)).current;
  const commentOverlayAnim = useRef(new Animated.Value(0)).current;

  // ── Reanimated 큐브 캐러셀 (스토리 단위 페이지) ──
  const scrollRef = useRef<any>(null);
  const scrollX = useSharedValue(initPos.si * SCREEN_W);
  const ty = useSharedValue(0); // 아래로 끌어 닫기
  const onStoryChange = (i: number) => {
    const t = Math.max(0, Math.min(stories.length - 1, i));
    setStoryIdx(t); setLocalIdx(0);
  };
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: (e) => { runOnJS(onStoryChange)(Math.round(e.contentOffset.x / SCREEN_W)); },
  });
  const dismissStyle = useAnimatedStyle(() => {
    const scale = interpolate(ty.value, [0, SCREEN_H], [1, 0.86], Extrapolation.CLAMP);
    const radius = interpolate(ty.value, [0, 120], [0, 22], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty.value }, { scale }], borderRadius: radius };
  });
  useEffect(() => {
    if (initPos.si > 0) {
      const t = setTimeout(() => scrollRef.current?.scrollTo({ x: initPos.si * SCREEN_W, animated: false }), 0);
      return () => clearTimeout(t);
    }
  }, []);

  if (!currentSnap || stories.length === 0) {
    navigation.goBack();
    return null;
  }

  const totalComments = comments.reduce((sum: number, c: any) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = currentSnap.isMyPost === true;

  const addComment = () => {
    if (!commentText.trim()) return;
    const nc = { id: `c-${Date.now()}`, emoji: '🙂', name: '나', text: commentText.trim(), time: '방금' };
    if (replyTo) {
      setComments(prev => prev.map(c => c.id === replyTo.id ? { ...c, replies: [...(c.replies || []), nc] } : c));
      setReplyTo(null);
    } else {
      setComments(prev => [...prev, nc]);
    }
    setCommentText('');
  };
  const handleReply = (id: string, name: string) => { setReplyTo({ id, name }); commentInputRef.current?.focus(); };
  const cancelReply = () => setReplyTo(null);

  const goToStory = (target: number) => {
    if (target < 0 || target >= stories.length) { navigation.goBack(); return; }
    scrollRef.current?.scrollTo({ x: target * SCREEN_W, animated: true });
  };
  // 같은 스토리 안에선 사진만 교체(localIdx), 끝이면 다음 스토리로(큐브)
  const advance = (dir: 'next' | 'prev') => {
    if (replyBarOpen || commentSheetOpen) return;
    const len = currentStory.snaps.length;
    if (dir === 'next') {
      if (localIdx < len - 1) setLocalIdx(localIdx + 1);
      else goToStory(storyIdx + 1);
    } else {
      if (localIdx > 0) setLocalIdx(localIdx - 1);
      else goToStory(storyIdx - 1);
    }
  };
  const onTapPage = (evt: any) => {
    if (replyBarOpen || commentSheetOpen) return;
    advance(evt.nativeEvent.locationX < SCREEN_W / 3 ? 'prev' : 'next');
  };

  // 아래로 끌어 닫기 (gesture-handler + reanimated, 가로 스크롤과 공존)
  const closeViewer = () => navigation.goBack();
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([14, 9999])
    .failOffsetX([-18, 18])
    .onUpdate((e) => { 'worklet'; if (e.translationY > 0) ty.value = e.translationY; })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 100 || e.velocityY > 700) {
        ty.value = withTiming(SCREEN_H, { duration: 180 }, () => { runOnJS(closeViewer)(); });
      } else {
        ty.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  // 한 스토리(유저) 페이지 렌더 — 같은 스토리는 사진만 교체
  const renderStoryPage = (story: any, si: number) => {
    const li = si === storyIdx ? Math.min(localIdx, story.snaps.length - 1) : 0;
    const s = story.snaps[li];
    const late = (s.snapLateSeconds && s.snapLateSeconds > 0)
      ? (s.snapLateSeconds < 60 ? `${s.snapLateSeconds}초 후 촬영` : `${Math.floor(s.snapLateSeconds / 60)}분 ${s.snapLateSeconds % 60}초 후 촬영`)
      : '';
    return (
      <>
        <CrossfadePhoto uri={s.snapBackUri} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onTapPage} />
        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={storyS.topGradient} pointerEvents="box-none">
          <View style={storyS.progressRow}>
            {Array.from({ length: story.snaps.length }, (_, k) => (
              <View key={k} style={[storyS.progressSeg, k === li && storyS.progressSegActive]} />
            ))}
          </View>
          <View style={storyS.topRow}>
            <View style={storyS.avatarRing}><View style={storyS.avatar}><Text style={storyS.avatarEmoji}>{s.user.emoji}</Text></View></View>
            <View style={storyS.userInfo}>
              <Text style={storyS.handle}>@{s.user.handle}</Text>
              <Text style={storyS.timeText}>{timeAgo(s.timestamp)}</Text>
            </View>
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={storyS.moreBtn}><Text style={storyS.moreBtnText}>···</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={storyS.closeBtn}><Text style={storyS.closeBtnText}>✕</Text></TouchableOpacity>
          </View>
        </LinearGradient>
        {s.snapFrontUri && (
          <View style={storyS.pipWrap}><Image source={{ uri: s.snapFrontUri }} style={storyS.pipImg} resizeMode="cover" /></View>
        )}
        {/* 스냅 및 촬영지연 뱃지 비활성화 */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={storyS.bottomGradient} pointerEvents="box-none">
          {s.snapDetectedCountry && (
            <View style={storyS.locationBadge}><Text style={storyS.locationText}>📍 {s.countryFlag} {s.snapDetectedCountry}</Text></View>
          )}
          {s.snapCaption ? <Text style={storyS.caption}>{s.snapCaption}</Text> : null}
          <View style={storyS.actionRow}>
            {s.isMyPost === true ? (
              /* 내가 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.actionBtnWithLabel} onPress={() => setViewerListOpen(true)}>
                  <Text style={storyS.actionIcon}>👁</Text>
                  <Text style={storyS.actionLabel}>조회 3</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet}>
                  <CommentSvg size={22} color="#fff" />
                  {totalComments > 0 && (<View style={storyS.commentCountBadge}><Text style={storyS.commentCountText}>{totalComments}</Text></View>)}
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost}>
                  <Text style={storyS.actionIcon}>↗</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* 타인이 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.replyWrap} activeOpacity={0.8} onPress={() => { setReplyBarOpen(true); setTimeout(() => replyInputRef.current?.focus(), 100); }}>
                  <View style={storyS.replyInput} pointerEvents="none"><Text style={storyS.replyPlaceholder}>메시지 보내기...</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={() => toggleLike(s.id)}>
                  <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet}>
                  <CommentSvg size={22} color="#fff" />
                  {totalComments > 0 && (<View style={storyS.commentCountBadge}><Text style={storyS.commentCountText}>{totalComments}</Text></View>)}
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost}><Text style={storyS.actionIcon}>↗</Text></TouchableOpacity>
              </>
            )}
          </View>
        </LinearGradient>
      </>
    );
  };

  // 댓글 시트
  const openCommentSheet = () => {
    setCommentSheetOpen(true);
    Animated.parallel([
      Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(commentOverlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };
  const closeCommentSheet = () => {
    Animated.parallel([
      Animated.timing(commentSheetAnim, { toValue: SCREEN_H * 0.6, duration: 280, useNativeDriver: true }),
      Animated.timing(commentOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setCommentSheetOpen(false));
  };
  const commentSheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => { if (g.dy > 0) commentSheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) closeCommentSheet();
        else Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
      },
    })
  ).current;

  const handleCopyLink = async () => { setMenuVisible(false); await Clipboard.setStringAsync(`eOrth://post/${currentSnap.id}`); setToastMsg('링크가 복사되었어요!'); setTimeout(() => setToastMsg(''), 2000); };
  const handleSharePost = () => { setMenuVisible(false); Share.share({ message: `eOrth에서 게시물을 확인해보세요!\neOrth://post/${currentSnap.id}` }); };
  const handleDelete = () => { setMenuVisible(false); Alert.alert('게시물 삭제', '이 게시물을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { deleteRecord(currentSnap.id); navigation.goBack(); } }]); };
  const handleReport = () => { setMenuVisible(false); setReportVisible(true); };

  const CommentSvg = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <CommentSvgIcon size={size} color={color} />
  );

  return (
    <View style={storyS.container}>
      <GestureDetector gesture={dismissGesture}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, dismissStyle]}>
          <Reanimated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            contentOffset={{ x: initPos.si * SCREEN_W, y: 0 }}
            style={StyleSheet.absoluteFill}
          >
            {stories.map((story: any, si: number) => (
              <SnapCubePage key={story.key} index={si} scrollX={scrollX} width={SCREEN_W} leftCube={si > 0} rightCube={si < stories.length - 1}>
                {renderStoryPage(story, si)}
              </SnapCubePage>
            ))}
          </Reanimated.ScrollView>
        </Reanimated.View>
      </GestureDetector>

      {/* 인라인 메시지 입력 */}
      {replyBarOpen && (
        <>
          <Pressable style={storyS.inlineOverlay} onPress={() => { setReplyBarOpen(false); setCommentText(''); }} />
          <KeyboardAvoidingView style={storyS.inlineInputWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
            <View style={storyS.inlineInputRow}>
              <TextInput
                ref={replyInputRef}
                style={storyS.inlineInput}
                placeholder="메시지 보내기..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={() => { addComment(); setReplyBarOpen(false); }}
                returnKeyType="send"
                autoFocus
                onBlur={() => { if (!commentText.trim()) setReplyBarOpen(false); }}
              />
              <TouchableOpacity
                style={[storyS.inlineSendBtn, !commentText.trim() && { opacity: 0.35 }]}
                onPress={() => { addComment(); setReplyBarOpen(false); }}
                disabled={!commentText.trim()}
              >
                <Text style={storyS.inlineSendText}>전송</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}

      {/* 댓글 바텀시트 오버레이 */}
      {commentSheetOpen && (
        <Animated.View style={[storyS.sheetOverlay, { opacity: commentOverlayAnim }]} pointerEvents="auto">
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCommentSheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* 댓글 바텀시트 */}
      <Animated.View style={[storyS.commentSheet, { transform: [{ translateY: commentSheetAnim }] }]} pointerEvents={commentSheetOpen ? 'auto' : 'none'}>
        <View style={storyS.csHandleArea} {...commentSheetPan.panHandlers}>
          <View style={storyS.csHandle} />
        </View>
        <View style={storyS.csTitleRow}>
          <Text style={storyS.csTitle}>댓글</Text>
          <Text style={storyS.csCount}>{totalComments}</Text>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {comments.map((c: any) => (
              <View key={c.id}>
                <View style={storyS.csCommentItem}>
                  <View style={storyS.csAvatar}><Text style={{ fontSize: 15 }}>{c.emoji}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={storyS.csTopRow}><Text style={storyS.csName}>{c.name}</Text><Text style={storyS.csTime}>{c.time}</Text></View>
                    <Text style={storyS.csText}>{c.text}</Text>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}><Text style={storyS.csReplyBtn}>답글</Text></TouchableOpacity>
                  </View>
                </View>
                {c.replies && c.replies.map((r: any) => (
                  <View key={r.id} style={[storyS.csCommentItem, { marginLeft: 42 }]}>
                    <View style={storyS.csAvatar}><Text style={{ fontSize: 13 }}>{r.emoji}</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={storyS.csTopRow}><Text style={storyS.csName}>{r.name}</Text><Text style={storyS.csTime}>{r.time}</Text></View>
                      <Text style={storyS.csText}>{r.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {comments.length === 0 && <Text style={{ color: '#5A5A6E', fontSize: 14, textAlign: 'center', marginTop: 32 }}>아직 댓글이 없어요</Text>}
          </ScrollView>
          {replyTo && (
            <View style={storyS.csReplyBar}>
              <Text style={storyS.csReplyBarText}>{replyTo.name}에게 답글 남기는 중</Text>
              <TouchableOpacity onPress={cancelReply}><Text style={storyS.csReplyBarCancel}>✕</Text></TouchableOpacity>
            </View>
          )}
          <View style={storyS.csInputBar}>
            <TextInput ref={commentInputRef} style={storyS.csInput} placeholder={replyTo ? `${replyTo.name}에게 답글...` : '댓글을 입력하세요...'} placeholderTextColor="#5A5A6E" value={commentText} onChangeText={setCommentText} onSubmitEditing={addComment} returnKeyType="send" />
            <TouchableOpacity style={[storyS.csSendBtn, !commentText.trim() && { backgroundColor: '#2A2A3A' }]} onPress={addComment} disabled={!commentText.trim()}>
              <Text style={[storyS.csSendText, !commentText.trim() && { color: '#5A5A6E' }]}>전송</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* 메뉴 모달 */}
      <Modal visible={menuVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" /><Text style={s.menuItemText}>링크 복사</Text>
            </TouchableOpacity>
            {isMyPost ? (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                <TrashIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제하기</Text>
              </TouchableOpacity></>
            ) : (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }} activeOpacity={0.7}>
                <MegaphoneIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>신고하기</Text>
              </TouchableOpacity></>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={() => { setReportVisible(false); setToastMsg('신고가 접수되었어요'); setTimeout(() => setToastMsg(''), 2000); }} />
      {toastMsg !== '' && <View style={s.toast} pointerEvents="none"><Text style={s.toastText}>{toastMsg}</Text></View>}
      <SnapViewerModal visible={viewerListOpen} onClose={() => setViewerListOpen(false)} />
    </View>
  );
}

type RouteParams = {
  PostDetail: { postId: string };
};

export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { postId } = route.params;
  const { records, toggleLike, deleteRecord, archiveRecord, markSnapViewed } = useRecords();
  const { nickname: globalNickname, handle: globalHandle, profilePhoto: globalProfilePhoto } = useSettings();

  const [comments, setComments] = useState<Comment[]>(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [showCompanions, setShowCompanions] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fontScale, setFontScale] = useState(1);
  const [fullImgVisible, setFullImgVisible] = useState(false);
  const [fullImgList, setFullImgList] = useState<string[]>([]);
  const [fullImgIndex, setFullImgIndex] = useState(0);
  const openFullImage = (uris: string[], index: number) => {
    setFullImgList(uris);
    setFullImgIndex(index);
    setFullImgVisible(true);
  };
  const commentInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const blockYPositions = useRef<Record<string, number>>({});

  const record = records.find((r) => r.id === postId);

  if (!record) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
        </View>
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>게시물을 찾을 수 없어요</Text>
        </View>
      </View>
    );
  }

  const viewType = (record.viewType || 'feed') as any;

  const addComment = () => {
    if (!commentText.trim()) return;
    const newComment: Comment = { id: `c-${Date.now()}`, emoji: '🙂', name: '나', text: commentText.trim(), time: '방금' };
    if (replyTo) {
      setComments((prev) => prev.map((c) =>
        c.id === replyTo.id
          ? { ...c, replies: [...(c.replies || []), newComment] }
          : c
      ));
      setReplyTo(null);
    } else {
      setComments((prev) => [...prev, newComment]);
    }
    setCommentText('');
  };

  const handleReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    commentInputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = record?.isMyPost === true;

  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(`eOrth://post/${postId}`);
    setToastMsg('링크가 복사되었어요!');
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleSharePost = () => {
    setMenuVisible(false);
    Share.share({ message: `eOrth에서 게시물을 확인해보세요!\neOrth://post/${postId}` });
  };

  const handleExportToNaver = () => {
    setMenuVisible(false);
    const bodyText = record.blogBlocks ? blocksToPlainText(record.blogBlocks) : record.content;
    const photos = record.blogBlocks ? blocksToPhotos(record.blogBlocks) : (record.medias || []);
    const blogData: BlogData = {
      title: record.content.slice(0, 50),
      body: bodyText,
      photos,
      memo: record.memo,
      startDate: record.startDate,
      endDate: record.endDate,
      rating: record.rating,
      companions: record.companions,
      weather: record.weather,
      keywords: record.keywords,
      countryName: record.countryName,
      countryFlag: record.countryFlag,
    };
    const html = toNaverHtml(blogData);
    Alert.alert('네이버 블로그로 내보내기', 'HTML 또는 텍스트로 내보낼 수 있어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: 'HTML 복사',
        onPress: async () => {
          await Clipboard.setStringAsync(html);
          setToastMsg('HTML이 복사되었어요!');
          setTimeout(() => setToastMsg(''), 2000);
        },
      },
      {
        text: '텍스트 공유',
        onPress: () => {
          const lines: string[] = [];
          if (record.countryFlag && record.countryName) lines.push(`📍 ${record.countryFlag} ${record.countryName}`);
          if (record.startDate && record.endDate) lines.push(`📅 ${record.startDate} ~ ${record.endDate}`);
          if (bodyText) lines.push('', bodyText);
          if (record.keywords?.length) lines.push('', record.keywords.map((k) => `#${k}`).join(' '));
          lines.push('', '— eOrth 여행기록 앱에서 작성');
          Share.share({ message: lines.join('\n') });
        },
      },
    ]);
  };

  const handleArchive = () => {
    setMenuVisible(false);
    archiveRecord(record.id);
    setToastMsg('게시물이 보관되었어요');
    setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert('게시물 삭제', '이 게시물을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: () => {
          deleteRecord(record.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleReport = () => {
    setMenuVisible(false);
    setReportVisible(true);
  };

  const renderCountries = () => {
    if (!record.countries || record.countries.length === 0) {
      return record.country ? (
        <View style={s.countryTag}>
          <Text style={s.countryTagText}>{record.country}</Text>
        </View>
      ) : null;
    }
    if (record.countries.length <= 3) {
      return record.countries.map((c, i) => (
        <View key={i} style={s.countryTag}>
          <Text style={s.countryTagText}>{c.flag} {c.name}</Text>
        </View>
      ));
    }
    return (
      <>
        <View style={s.countryTag}>
          <Text style={s.countryTagText}>{record.countries[0].flag} {record.countries[0].name}</Text>
        </View>
        <View style={s.countryTag}>
          <Text style={s.countryTagText}>+{record.countries.length - 1}</Text>
        </View>
      </>
    );
  };

  const CommentSvg = ({ size = 20, color = C.dim }: { size?: number; color?: string }) => (
    <CommentSvgIcon size={size} color={color} />
  );

  const firstMedia = record.medias?.[0];

  // ── 스냅: 인스타 스토리 스타일 전체화면 ──
  if (viewType === 'snap') {
    return (
      <SnapStoryViewer
        initialPostId={postId}
        records={records}
        navigation={navigation}
        toggleLike={toggleLike}
        deleteRecord={deleteRecord}
        markSnapViewed={markSnapViewed}
      />
    );
  }

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>게시물</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 && (
              <TouchableOpacity
                onPress={() => setFontScale((p) => (p >= 1.4 ? 0.85 : p + 0.15))}
                style={s.menuBtn}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: fontScale !== 1 ? C.accent : C.dim }}>가</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={s.menuBtn}>
              <Text style={s.menuDots}>···</Text>
            </TouchableOpacity>
          </View>
        </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setShowCompanions(false)}
        >
              {/* ── 유저 정보 + 이미지 + 본문 ── */}
              {(() => {
                const isMyPost = record.isMyPost === true || record.user.handle === 'yunjunsung' || record.user.handle === globalHandle;
                const postDisplayName = isMyPost
                  ? (globalNickname ? globalNickname : `@${globalHandle}`)
                  : (record.user.name ? record.user.name : `@${record.user.handle}`);
                return (
                  <View style={s.userRow}>
                    <View style={s.avatar}>
                      {isMyPost && globalProfilePhoto ? (
                        <Image source={{ uri: globalProfilePhoto }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                      ) : (
                        <Text style={s.avatarEmoji}>{record.user.emoji}</Text>
                      )}
                    </View>
                    <View style={s.userInfo}>
                      <Text style={s.userName}>{postDisplayName}</Text>
                      <View style={s.userMeta}>
                        {renderCountries()}
                        <Text style={s.dateMeta}>{timeAgo(record.timestamp)}</Text>
                      </View>
                    </View>
                    {record.rating != null && record.rating > 0 && (
                      <Text style={s.ratingStars}>{'★'.repeat(record.rating)}{'☆'.repeat(5 - record.rating)}</Text>
                    )}
                  </View>
                );
              })()}

              {/* ── 스냅 콘텐츠 ── */}
              {viewType === 'snap' ? (
                <>
                  <View style={snapS.photoArea}>
                    {/* 후면 사진 */}
                    {record.snapBackUri ? (
                      <Image source={{ uri: record.snapBackUri }} style={snapS.mainPhoto} resizeMode="cover" />
                    ) : (
                      <View style={snapS.placeholderBg}>
                        <Text style={{ fontSize: 48, opacity: 0.3 }}>📸</Text>
                      </View>
                    )}
                    {/* 전면 사진 (PIP) */}
                    {record.snapFrontUri && (
                      <View style={snapS.pipWrap}>
                        <Image source={{ uri: record.snapFrontUri }} style={snapS.pipImg} resizeMode="cover" />
                      </View>
                    )}
                    {/* 국가 뱃지 */}
                    {record.snapDetectedCountry && (
                      <View style={snapS.countryBadge}>
                        <Text style={snapS.countryBadgeText}>📍 {record.countryFlag} {record.snapDetectedCountry}</Text>
                      </View>
                    )}
                    {/* 촬영 지연 비활성화 */}
                    {/* 만료 오버레이 */}
                    {record.snapExpiresAt && Date.now() > record.snapExpiresAt && (
                      <View style={snapS.expiredOverlay}>
                        <Text style={snapS.expiredText}>24시간 경과</Text>
                      </View>
                    )}
                  </View>
                  {record.snapCaption ? (
                    <Text style={snapS.caption}>{record.snapCaption}</Text>
                  ) : null}
                  {record.snapExpiresAt && Date.now() < record.snapExpiresAt && (
                    <Text style={snapS.timeLeft}>
                      ⏳ {(() => {
                        const diff = record.snapExpiresAt! - Date.now();
                        const h = Math.floor(diff / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
                      })()}
                    </Text>
                  )}
                </>
              ) : viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 ? (
                <>
                  {/* 카테고리 뱃지 */}
                  {record.blogCategory && (
                    <View style={blogS.categoryBadge}>
                      <Text style={blogS.categoryBadgeText}>{record.blogCategory}</Text>
                    </View>
                  )}

                  {/* 목차 */}
                  <TableOfContents
                    headings={extractHeadings(record.blogBlocks)}
                    onPress={(id) => {
                      const y = blockYPositions.current[id];
                      if (y != null) {
                        scrollRef.current?.scrollTo({ y, animated: true });
                      }
                    }}
                  />

                  {/* 블록 렌더링 */}
                  {record.blogBlocks.map((block) =>
                    block.type === 'heading' ? (
                      <View
                        key={block.id}
                        onLayout={(e) => {
                          blockYPositions.current[block.id] = e.nativeEvent.layout.y;
                        }}
                      >
                        <BlogBlockRenderer block={block} fontScale={fontScale} onImagePress={openFullImage} />
                      </View>
                    ) : (
                      <BlogBlockRenderer key={block.id} block={block} fontScale={fontScale} />
                    )
                  )}
                </>
              ) : (
                <>
                  <LinearGradient
                    colors={
                      viewType === 'album' ? ['#2E1A0A', '#1A0A2E'] :
                      ['#1A0A2E', '#3B1E8E']
                    }
                    style={s.imageArea}
                  >
                    <View style={{ opacity: 0.4 }}>
                      {viewType === 'album' ? <CameraIcon size={48} color="#fff" /> : <LandscapeIcon size={48} color="#fff" />}
                    </View>
                    <View style={s.viewTypeBadge}>
                      <Text style={s.viewTypeText}>
                        {viewType === 'feed' ? '피드' : '앨범'}
                      </Text>
                    </View>
                    {record.companions && record.companions.length > 0 && (
                      <TouchableOpacity
                        style={s.tagBtn}
                        activeOpacity={0.8}
                        onPress={() => setShowCompanions(!showCompanions)}
                      >
                        <PersonIcon size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {showCompanions && record.companions && record.companions.length > 0 && (
                      <View style={s.companionPopup}>
                        {record.companions.map((comp, i) => (
                          <View key={i} style={s.companionPopupItem}>
                            <View style={s.companionIconWrap}>{companionIcon(comp)}</View>
                            <Text style={s.companionPopupText}>{comp}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </LinearGradient>

                  <Text style={s.content}>{record.content}</Text>
                </>
              )}

          {/* ── 이하 공통: 정보 칩, 메모, 키워드, 좋아요, 댓글 ── */}
          <View>

          {/* ── 정보 칩들 ── */}
          {(record.startDate || record.weather || record.budget || record.flightType) && (
            <View style={s.infoRow}>
              {record.startDate && record.endDate && (
                <View style={s.infoChip}>
                  <CalendarIcon size={13} color="#A1A1B0" />
                  <Text style={s.infoChipText}>{record.startDate} ~ {record.endDate}</Text>
                </View>
              )}
              {record.weather && (
                <View style={s.weatherChip}>
                  <Text style={s.weatherEmoji}>{weatherIcon(record.weather)}</Text>
                </View>
              )}
              {record.flightType && (
                <View style={s.infoChip}>
                  {record.flightType === '직항' ? <PlaneIcon size={13} color="#A1A1B0" /> : <TransferIcon size={13} color="#A1A1B0" />}
                  <Text style={s.infoChipText}>{record.flightType}</Text>
                </View>
              )}
              {record.budget && (
                <View style={s.infoChip}>
                  <Text style={s.infoChipText}>
                    {currencySymbol(record.budget.currency)}{' '}{record.budget.amount.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── 메모 ── */}
          {record.memo && (
            <View style={s.memoBox}>
              <Text style={s.memoText}>{record.memo}</Text>
            </View>
          )}

          {/* ── 키워드 ── */}
          {record.keywords && record.keywords.length > 0 && (
            <View style={s.keywords}>
              {record.keywords.map((k) => (
                <View key={k} style={s.keyword}>
                  <Text style={s.keywordText}>#{k}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 좋아요 · 댓글 수 ── */}
          <View style={s.statsRow}>
            <TouchableOpacity style={s.statBtn} onPress={() => toggleLike(record.id)}>
              <Text style={[s.statIcon, record.liked && { color: C.red }]}>
                {record.liked ? '♥' : '♡'}
              </Text>
              <Text style={[s.statCount, record.liked && { color: C.red }]}>{record.likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.statBtn} onPress={() => commentInputRef.current?.focus()}>
              <CommentSvg />
              <Text style={s.statCount}>{totalComments}</Text>
            </TouchableOpacity>
          </View>

          {/* ── 구분선 ── */}
          <View style={s.divider} />

          {/* ── 댓글 목록 ── */}
          <Text style={s.commentTitle}>댓글 {totalComments}</Text>
          {comments.map((c) => (
            <View key={c.id}>
              <View style={s.commentItem}>
                <View style={s.commentAvatar}>
                  <Text style={{ fontSize: 15 }}>{c.emoji}</Text>
                </View>
                <View style={s.commentBody}>
                  <View style={s.commentTopRow}>
                    <Text style={s.commentName}>{c.name}</Text>
                    <Text style={s.commentTime}>{c.time}</Text>
                  </View>
                  <Text style={s.commentText}>{c.text}</Text>
                  <TouchableOpacity style={s.replyBtn} onPress={() => handleReply(c.id, c.name)}>
                    <Text style={s.replyBtnText}>답글</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* 답글 목록 */}
              {c.replies && c.replies.length > 0 && c.replies.map((r) => (
                <View key={r.id} style={s.replyItem}>
                  <View style={s.commentAvatar}>
                    <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
                  </View>
                  <View style={s.commentBody}>
                    <View style={s.commentTopRow}>
                      <Text style={s.commentName}>{r.name}</Text>
                      <Text style={s.commentTime}>{r.time}</Text>
                    </View>
                    <Text style={s.commentText}>{r.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: 16 }} />
          </View>
        </ScrollView>

        {/* ── 답글 표시 바 ── */}
        {replyTo && (
          <View style={s.replyBar}>
            <Text style={s.replyBarText}>{replyTo.name}에게 답글 남기는 중</Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={s.replyBarCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ── 댓글 입력 ── */}
        <View style={s.inputBar}>
          <TextInput
            ref={commentInputRef}
            style={s.input}
            placeholder={replyTo ? `${replyTo.name}에게 답글...` : '댓글을 입력하세요...'}
            placeholderTextColor={C.muted}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={addComment}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[s.sendBtn, !commentText.trim() && s.sendBtnDisabled]}
            onPress={addComment}
            disabled={!commentText.trim()}
          >
            <Text style={[s.sendText, !commentText.trim() && s.sendTextDisabled]}>전송</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 동행자 팝업 닫기용 오버레이 */}
      {showCompanions && (
        <Pressable
          style={s.dismissOverlay}
          onPress={() => setShowCompanions(false)}
        />
      )}

      {/* ── 메뉴 모달 ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={s.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={s.menuCard}>
            {/* 공통 메뉴 */}
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>링크 복사</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleSharePost} activeOpacity={0.7}>
              <ShareIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>공유하기</Text>
            </TouchableOpacity>

            {viewType === 'blog' && (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleExportToNaver} activeOpacity={0.7}>
                  <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#03C75A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>N</Text>
                  </View>
                  <Text style={s.menuItemText}>네이버 블로그로 내보내기</Text>
                </TouchableOpacity>
              </>
            )}

            {isMyPost ? (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <ArchiveIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>보관하기</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={() => {
                  setMenuVisible(false);
                  if (viewType === 'snap') {
                    Alert.alert('수정 불가', '스냅은 수정할 수 없어요');
                  } else if (viewType === 'blog') {
                    navigation.navigate('BlogRecord', { record });
                  } else if (viewType === 'album') {
                    Alert.alert('수정 불가', '앨범 형식은 현재 보관 중이라 수정할 수 없어요.');
                  } else {
                    navigation.navigate('NewRecord', { record });
                  }
                }} activeOpacity={0.7}>
                  <PencilIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>수정하기</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제하기</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleReport} activeOpacity={0.7}>
                  <MegaphoneIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>신고하기</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 신고 모달 ── */}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={() => {
          setReportVisible(false);
          setToastMsg('신고가 접수되었어요');
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* ── 토스트 ── */}
      {toastMsg !== '' && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* ── 풀스크린 이미지 뷰어 ── */}
      {fullImgVisible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setFullImgVisible(false)} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: fullImgIndex * SCREEN_W, y: 0 }}
              onMomentumScrollEnd={(e) => setFullImgIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            >
              {fullImgList.map((uri, i) => (
                <View key={i} style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center', alignItems: 'center' }}>
                  <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.8 }} resizeMode="contain" />
                </View>
              ))}
            </ScrollView>
            {fullImgList.length > 1 && (
              <View style={{ position: 'absolute', bottom: 60, alignSelf: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14 }}>{fullImgIndex + 1} / {fullImgList.length}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setFullImgVisible(false)} style={{ position: 'absolute', top: 50, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── 헤더 ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 22, color: C.white, marginTop: -1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.white },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  menuDots: { fontSize: 16, color: C.dim, letterSpacing: 2, marginTop: -2 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  scrollContentV2: { paddingBottom: 8 },
  belowMediaPad: { paddingHorizontal: 20, paddingTop: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },

  // ── 미디어 전체 영역 (여백 없이, 위까지) ──
  mediaFullWrap: {
    width: SCREEN_W,
    aspectRatio: 3 / 4,
    backgroundColor: '#1A0A2E',
    position: 'relative',
    overflow: 'hidden',
  },
  mediaFullImage: {
    width: '100%',
    height: '100%',
  },
  mediaFullPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 인스타 스토리식 상단 오버레이
  storyTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 24,
    zIndex: 10,
  },
  storyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191,133,252,0.45)',
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarEmoji: {
    fontSize: 17,
  },
  storyUserInfo: {
    flex: 1,
    marginLeft: 10,
    gap: 1,
  },
  storyHandle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  storyTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  storyCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  storyCloseBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ── 유저 정보 ──
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.accentBorder,
  },
  avatarEmoji: { fontSize: 22 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: C.white },
  userMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  countryTag: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  countryTagText: { fontSize: 11, fontWeight: '600', color: C.accent },
  dateMeta: { fontSize: 11, color: C.muted },
  ratingStars: { fontSize: 13, color: C.accent, letterSpacing: 1.5 },

  // ── 이미지 ──
  imageArea: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 16, marginBottom: 18,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    zIndex: 10,
  },
  imageEmoji: { fontSize: 48, opacity: 0.4 },
  viewTypeBadge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewTypeText: { fontSize: 11, fontWeight: '600', color: C.accent },
  tagBtn: {
    position: 'absolute', bottom: 12, left: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  companionPopup: {
    position: 'absolute', bottom: 12, left: 50,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  companionPopupItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  companionPopupText: { fontSize: 12, color: '#fff', fontWeight: '500' },

  // ── 본문 ──
  content: {
    fontSize: 15, color: C.white, lineHeight: 24, marginBottom: 18,
  },

  // ── 정보 칩들 ──
  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18,
    alignItems: 'center',
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  infoChipIcon: { fontSize: 13 },
  companionIconWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  infoChipText: { fontSize: 12, color: C.dim },
  weatherChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  weatherEmoji: { fontSize: 18 },

  // ── 메모 ──
  memoBox: {
    backgroundColor: 'rgba(191,133,252,0.06)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  memoText: { fontSize: 13, color: C.dim, lineHeight: 20, fontStyle: 'italic' },

  // ── 키워드 ──
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  keyword: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: C.accentDim,
  },
  keywordText: { fontSize: 12, color: C.accent, fontWeight: '500' },

  // ── 좋아요 · 댓글 ──
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  statBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statIcon: { fontSize: 22, color: C.dim },
  statCount: { fontSize: 14, fontWeight: '600', color: C.white },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder, marginBottom: 16 },

  // ── 댓글 목록 ──
  commentTitle: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 14 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  commentBody: { flex: 1 },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  commentName: { fontSize: 13, fontWeight: '600', color: C.white },
  commentTime: { fontSize: 11, color: C.muted },
  commentText: { fontSize: 13, color: C.dim, lineHeight: 19 },
  replyBtn: { marginTop: 4 },
  replyBtnText: { fontSize: 11, color: C.muted, fontWeight: '600' },
  replyItem: { flexDirection: 'row', gap: 8, marginBottom: 12, marginLeft: 42 },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.cardBorder,
  },
  replyBarText: { fontSize: 12, color: C.accent, fontWeight: '600' },
  replyBarCancel: { fontSize: 16, color: C.muted, paddingHorizontal: 4 },

  // ── 댓글 입력 ──
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: C.cardBorder,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1, height: 40, borderRadius: 20,
    backgroundColor: C.card, paddingHorizontal: 16,
    color: C.white, fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: C.accent,
  },
  sendBtnDisabled: {
    backgroundColor: C.cardBorder,
  },
  sendText: { fontSize: 13, fontWeight: '700', color: '#0A0A0F' },
  sendTextDisabled: { color: C.muted },

  // ── 동행자 팝업 닫기 오버레이 ──
  dismissOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 5,
  },

  // ── 메뉴 모달 ──
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 110, paddingRight: 20,
  },
  menuCard: {
    width: 180, backgroundColor: C.card,
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, paddingHorizontal: 16, gap: 10,
  },
  menuItemIcon: { fontSize: 16 },
  menuItemText: { fontSize: 14, color: C.white, fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#3A3A4A' },
  menuSectionDivider: { height: 6, backgroundColor: '#1A1A26' },

  // ── 토스트 ──
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(30,30,50,0.95)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── 스냅 상세 스타일 ──
const snapS = StyleSheet.create({
  photoArea: {
    borderRadius: 20, overflow: 'hidden', aspectRatio: 3 / 4,
    backgroundColor: '#111', marginBottom: 12,
  },
  mainPhoto: { width: '100%', height: '100%' },
  placeholderBg: {
    flex: 1, backgroundColor: '#1A1A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  pipWrap: {
    position: 'absolute', top: 16, left: 16,
    width: SCREEN_W * 0.25, height: SCREEN_W * 0.33,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: '#FFD60A',
  },
  pipImg: { width: '100%', height: '100%' },
  countryBadge: {
    position: 'absolute', bottom: 16, left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  countryBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  lateBadge: {
    position: 'absolute', bottom: 16, right: 16,
    backgroundColor: 'rgba(255,214,10,0.2)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  lateBadgeText: { color: '#FFD60A', fontSize: 12, fontWeight: '700' },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  expiredText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' },
  caption: {
    color: '#fff', fontSize: 17, lineHeight: 26, fontWeight: '500',
    marginBottom: 8,
  },
  timeLeft: {
    color: '#FFD60A', fontSize: 12, fontWeight: '600', marginBottom: 12,
  },
});

// ── 블로그 블록 스타일 ──
const blogS = StyleSheet.create({
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(191,133,252,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  categoryBadgeText: { fontSize: 12, fontWeight: '600', color: '#BF85FC' },
  text: {
    fontSize: 15, color: '#FFFFFF', lineHeight: 26, marginBottom: 6,
  },
  heading: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 20, marginBottom: 10,
  },
  imageWrap: { marginBottom: 14, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  caption: {
    fontSize: 12, color: '#A1A1B0', textAlign: 'center', marginTop: 6,
    fontStyle: 'italic',
  },
  imagesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14,
  },
  gridImage: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  separator: { marginVertical: 16 },
  quote: {
    borderLeftWidth: 3, borderLeftColor: '#BF85FC',
    backgroundColor: 'rgba(191,133,252,0.06)',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    marginBottom: 12,
  },
  quoteText: { color: '#A1A1B0', fontStyle: 'italic', lineHeight: 24 },
  linkCard: {
    flexDirection: 'row', backgroundColor: '#1C1C28',
    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    borderWidth: 1, borderColor: '#2A2A3A',
  },
  linkThumb: { width: 80, height: 80 },
  linkInfo: { flex: 1, padding: 10, gap: 4 },
  linkTitle: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  linkDesc: { fontSize: 11, color: '#A1A1B0', lineHeight: 16 },
  linkUrl: { fontSize: 10, color: '#5A5A6E' },
  stickerWrap: { alignItems: 'center', marginVertical: 12 },
  stickerFallback: { fontSize: 40 },
  fileBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C28', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A3A', gap: 10, marginBottom: 12 },
  fileIcon: { fontSize: 20 },
  fileName: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  fileSize: { color: '#5A5A6E', fontSize: 11, marginTop: 2 },
  tocWrap: {
    backgroundColor: 'rgba(191,133,252,0.06)',
    borderRadius: 12, marginBottom: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.12)',
  },
  tocToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  tocToggleText: { fontSize: 14, fontWeight: '600', color: '#BF85FC' },
  tocArrow: { fontSize: 12, color: '#A1A1B0' },
  tocItem: { paddingVertical: 8, paddingRight: 16 },
  tocItemText: { fontSize: 13, color: '#A1A1B0' },
});

// ── 모먼트 스토리 스타일 ──
const sm = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 24,
    zIndex: 10,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191,133,252,0.5)',
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
  },
  userInfo: {
    flex: 1,
    marginLeft: 10,
    gap: 1,
  },
  handle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  time: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 80,
    gap: 6,
    alignItems: 'center',
  },
  country: {
    fontSize: 13,
    color: '#BF85FC',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  content: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  memo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  rating: {
    fontSize: 14,
    color: '#FBBF24',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

// ── 스냅 스토리 전체화면 스타일 ──
const storyS = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  bgPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  expiredText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '700',
  },

  // 상단 그라데이션
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 32,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 1,
  },
  progressSegActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
    marginLeft: 10,
  },
  handle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  moreBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // PIP (전면 사진)
  pipWrap: {
    position: 'absolute',
    top: 110,
    left: 16,
    width: SCREEN_W * 0.26,
    height: SCREEN_W * 0.35,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFD60A',
    zIndex: 8,
  },
  pipImg: {
    width: '100%',
    height: '100%',
  },

  // SNAP 뱃지
  snapBadge: {
    position: 'absolute',
    top: 110,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  snapBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // 촬영 지연 뱃지
  lateBadge: {
    position: 'absolute',
    top: 145,
    right: 16,
    backgroundColor: 'rgba(255,214,10,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  lateBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '700',
  },

  // 하단 그라데이션
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 100,
    zIndex: 10,
  },
  locationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 10,
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timeLeft: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // 하단 액션 바
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  replyWrap: {
    flex: 1,
  },
  replyInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  replyPlaceholder: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingRight: 12,
    gap: 6,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  actionIcon: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  commentCountBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  commentCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── 인라인 메시지 입력 ──
  inlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 25,
  },
  inlineInputWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 26,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 10,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inlineInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inlineSendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: '#BF85FC',
  },
  inlineSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── 댓글 바텀시트 ──
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 30,
  },
  commentSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.6,
    backgroundColor: '#1C1C28',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 40,
    overflow: 'hidden',
  },
  csHandleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  csHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
  },
  csTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
    gap: 8,
  },
  csTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  csCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1B0',
  },
  csCommentItem: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  csAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  csTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  csName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  csTime: {
    fontSize: 11,
    color: '#5A5A6E',
  },
  csText: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 19,
  },
  csReplyBtn: {
    fontSize: 11,
    color: '#5A5A6E',
    fontWeight: '600',
    marginTop: 4,
  },
  csReplyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2A2A3A',
  },
  csReplyBarText: {
    fontSize: 12,
    color: '#BF85FC',
    fontWeight: '600',
  },
  csReplyBarCancel: {
    fontSize: 16,
    color: '#5A5A6E',
    paddingHorizontal: 4,
  },
  csInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#2A2A3A',
  },
  csInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E2E3B',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  csSendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#BF85FC',
  },
  csSendText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0A0F',
  },
});

const viewerS = StyleSheet.create({
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#BF85FC',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A26',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  handleText: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  time: {
    fontSize: 12,
    color: '#4A4A59',
  },
  closeBtn: {
    margin: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
