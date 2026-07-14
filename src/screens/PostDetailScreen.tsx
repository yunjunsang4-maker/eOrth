import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Keyboard,
  Platform,
  Modal,
  Alert,
  Share,
  Image,
  Linking,
  Animated,
  Easing,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  interpolate, Extrapolation, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Ellipse as SvgEllipse, Circle as SvgCircle } from 'react-native-svg';
import { CommentIcon as CommentSvgIcon, PersonIcon, PaperclipIcon, TrashIcon, CameraIcon, LandscapeIcon, CalendarIcon, PlaneIcon, TransferIcon, PencilIcon, LinkIcon, MegaphoneIcon, ShareIcon, ArchiveIcon, PinIcon } from '../components/icons';
import { useRecords, TravelRecord, RecordViewType } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { handleFontStyle } from '../constants/handleFonts';
import { useSkinAccent } from '../constants/skinTheme';
import ReportModal from '../components/ReportModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import { sectionSlices } from '../utils/albumSections';
import AuthorAvatar from '../components/AuthorAvatar';
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import { andFitText } from '../utils/fitText';
import type { BlogBlock } from '../types/blogBlocks';
import { extractHeadings, blocksToPlainText, blocksToPhotos } from '../types/blogBlocks';
import { toNaverHtml, BlogData } from '../utils/naverBlogConverter';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { buzz } from '../utils/haptics';
import { fetchPostLikers, PostLiker, likePost, unlikePost } from '../services/social';
import { postLink } from '../utils/appLinks';
import { CUT_LAYOUTS } from '../constants/cutFrames';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// 네컷(스트립) 미리보기를 프레임 규격(가로/세로 비율)에 딱 맞게 — 레터박스(여백) 제거
const cutFitStyle = (layout?: import('../constants/cutFrames').CutLayout) => {
  const aspect = (layout && CUT_LAYOUTS[layout]?.aspect) || 3 / 4; // width / height
  const maxW = SCREEN_W - 40;
  const maxH = SCREEN_H * 0.7;
  let w = maxW;
  let h = maxW / aspect;
  if (h > maxH) { h = maxH; w = maxH * aspect; }
  return { width: w, height: h };
};

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

// 댓글은 recordStore의 commentsByPost에 게시물별로 저장된다 (화면을 나가도 유지)
const commentTime = (c: { time?: string; createdAt: number }) => c.time ?? timeAgo(c.createdAt);

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
  const skinAccent = useSkinAccent();
  const [activeIdx, setActiveIdx] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({}); // index → 세로/가로 비율
  const slideW = SCREEN_W - 40; // 본문 좌우 패딩(20+20)과 일치
  // 각 사진의 원본 비율을 읽어 박스를 맞춤 (크롭 방지)
  useEffect(() => {
    let alive = true;
    items.forEach((it, i) => {
      Image.getSize(
        it.uri,
        (w, h) => { if (alive && w > 0) setRatios((p) => ({ ...p, [i]: h / w })); },
        () => {},
      );
    });
    return () => { alive = false; };
  }, [items]);
  // 너무 길거나 넓은 사진은 적당히 제한(0.6~1.4)
  const heightFor = (i: number) => slideW * Math.min(Math.max(ratios[i] ?? 0.75, 0.6), 1.4);
  const containerH = Math.max(slideW * 0.75, ...items.map((_, i) => heightFor(i)));
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
        style={{ width: slideW, height: containerH }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => onImagePress?.(items.map(it => it.uri), i)}
            style={{ width: slideW, height: containerH, alignItems: 'center', justifyContent: 'center' }}
          >
            <Image source={{ uri: item.uri }} style={{ width: slideW, height: heightFor(i), borderRadius: 8 }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 6, gap: 5 }}>
          {items.map((_, i) => (
            <View key={i} style={{
              width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIdx ? skinAccent.accent : '#4A4A59',
            }} />
          ))}
        </View>
      )}
    </View>
  );
};

// ─── 블로그 블록 렌더러 ───
// ─── 블로그 영상 플레이어 (로컬: expo-video, 임베드: WebView) ───
const BlogLocalVideo = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.muted = false; });
  return (
    <VideoView style={blogS.video} player={player} contentFit="contain" nativeControls allowsFullscreen />
  );
};

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const getPlayableVideoUrl = (uri: string) => {
  const naverEmbedMatch = uri.match(/tv\.naver\.com\/embed\/([A-Za-z0-9]+)/);
  if (naverEmbedMatch) return `https://m.tv.naver.com/v/${naverEmbedMatch[1]}`;
  const playerMatch = uri.match(/player\.naver\.com[^"]*vid=([A-Za-z0-9]+)/);
  if (playerMatch) return `https://m.tv.naver.com/v/${playerMatch[1]}`;
  return uri;
};

const BlogVideoBlock = ({ uri, caption }: { uri: string; caption?: string }) => {
  const { t } = useTranslation();
  const isLocal = uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('/');
  const isEmbed = uri.startsWith('http');
  return (
    <View style={blogS.imageWrap}>
      {isLocal ? (
        <BlogLocalVideo uri={uri} />
      ) : isEmbed ? (
        <View style={blogS.video}>
          <WebView
            source={{ uri: getPlayableVideoUrl(uri) }}
            style={{ flex: 1, backgroundColor: '#000' }}
            userAgent={MOBILE_UA}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : (
        <TouchableOpacity style={[blogS.video, { justifyContent: 'center', alignItems: 'center' }]} activeOpacity={0.7} onPress={() => Linking.openURL(uri).catch(() => {})}>
          <Text style={{ color: '#fff', fontSize: 40 }}>▶</Text>
          <Text style={{ color: '#A1A1B0', fontSize: 12, marginTop: 8 }}>{t('blog.externalVideo')}</Text>
        </TouchableOpacity>
      )}
      {caption ? <Text style={blogS.caption}>{caption}</Text> : null}
    </View>
  );
};

const BlogBlockRenderer = ({
  block,
  fontScale,
  onImagePress,
}: {
  block: BlogBlock;
  fontScale: number;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  const skinAccent = useSkinAccent(); // 인용구 등 강조를 스킨색으로
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
        <View style={[blogS.quote, { borderLeftColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.06) }]}>
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
    case 'video':
      // 가져오기 자리 표시(채워지지 않은 placeholder)는 읽기 화면에서 숨긴다
      if ((block as any).placeholder || !block.uri) return null;
      return <BlogVideoBlock uri={block.uri} caption={block.caption} />;
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
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [open, setOpen] = useState(false);
  if (headings.length === 0) return null;
  return (
    <View style={[blogS.tocWrap, { backgroundColor: skinAccent.tint(0.06), borderColor: skinAccent.tint(0.12) }]}>
      <TouchableOpacity style={blogS.tocToggle} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={[blogS.tocToggleText, { color: skinAccent.accent }]}>📋 {t('comp2.toc')}</Text>
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
  viewers = [],
}: {
  visible: boolean;
  onClose: () => void;
  viewers?: { handle: string; name: string; time: number; emoji?: string }[];
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={viewerS.root} accessibilityViewIsModal>
        {/* 드래그바 */}
        <View style={viewerS.handle} />
        <Text style={viewerS.title}>{t('postDetail.snapViewersTitle')}</Text>
        <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.totalReadN', { count: viewers.length })}</Text>

        <ScrollView contentContainerStyle={viewerS.list} showsVerticalScrollIndicator={false}>
          {viewers.length === 0 && (
            <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.noSnapViewers')}</Text>
          )}
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
          <Text style={viewerS.closeBtnText}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function SnapStoryViewer({
  initialPostId, records, navigation, toggleLike, deleteRecord, markSnapViewed,
}: {
  initialPostId: string;
  records: TravelRecord[];
  navigation: any;
  toggleLike: (id: string) => void;
  deleteRecord: (id: string) => void;
  markSnapViewed: (id: string) => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 댓글 배지·전송 버튼 등 강조를 스킨색으로
  // 내 프로필(사진·아이디)은 실시간 설정에서 읽어, 프로필 변경이 내 스냅 헤더에 즉시 반영되게 한다
  const { handle: myHandle, profilePhoto: myPhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
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
    // 스토리 안 스냅은 제일 먼저 올린 것부터(오름차순) 재생
    return keys.map(k => ({
      key: k,
      snaps: [...byKey[k]].sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    }));
  }, [allSnaps, initialPostId]);

  // 초기 위치는 한 번만 확정 (이후 store 변경으로 뷰어가 점프하지 않게).
  // stories가 처음 채워진 렌더에서 계산해, 데이터가 늦게 와도 올바른 위치를 잡는다.
  const initPosRef = useRef<{ si: number; li: number } | null>(null);
  if (initPosRef.current === null && stories.length > 0) {
    let pos = { si: 0, li: 0 };
    for (let si = 0; si < stories.length; si++) {
      // 해당 스토리를 열면 제일 먼저 올린 스냅(li=0)부터 재생
      if (stories[si].snaps.some((s: any) => s.id === initialPostId)) { pos = { si, li: 0 }; break; }
    }
    initPosRef.current = pos;
  }
  const initPos = initPosRef.current ?? { si: 0, li: 0 };

  const [storyIdx, setStoryIdx] = useState(initPos.si);
  const [localIdx, setLocalIdx] = useState(initPos.li);
  const currentStory = stories[storyIdx];
  const currentSnap = currentStory?.snaps[Math.min(localIdx, (currentStory?.snaps.length || 1) - 1)];
  // 스냅 열람 시 viewed 처리 — 스냅 id가 바뀔 때만 실행(snapViewed 변경으로 인한 재실행 방지)
  useEffect(() => {
    if (currentSnap && !currentSnap.isMyPost && !currentSnap.snapViewed) markSnapViewed(currentSnap.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap?.id]);

  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [replyBarOpen, setReplyBarOpen] = useState(false);
  const { commentsByPost, addComment: addCommentToStore, reportPost, followingUsers } = useRecords();
  // ── 공유 시트 (인스타식: 친구 DM으로 보내기 + 외부 공유) ──
  const { sendRecord, conversations } = useDM();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // 대화량 많은 친구 순 — 소셜 피드 빠른공유와 동일 기준
  const shareFriends = useMemo(
    () => followingUsers
      .map((f) => ({ id: f.id, name: f.username, handle: f.username, emoji: '🧳' }))
      .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0)),
    [followingUsers, conversations]
  );
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const replyInputRef = useRef<TextInput>(null);
  const commentInputRef = useRef<TextInput>(null);

  const commentSheetAnim = useRef(new Animated.Value(SCREEN_H * 0.6)).current;
  const commentOverlayAnim = useRef(new Animated.Value(0)).current;
  // 댓글 시트는 화면 하단 고정(absolute)이라 내부 KeyboardAvoidingView만으로는 입력창이 키보드에
  // 가린다. 키보드 높이만큼 시트 전체를 위로 들어올려 입력창이 항상 키보드 위에 보이게 한다.
  const keyboardLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: e.endCoordinates?.height ?? 0,
        duration: e.duration || 220,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: e?.duration || 200,
        useNativeDriver: true,
      }).start();
    };
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [keyboardLift]);

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

  // 댓글 시트 드래그 닫기 PanResponder — Hook이므로 early return 위에서 생성한다.
  // (콜백은 렌더 시점이 아닌 제스처 시점에 실행되므로 아래의 closeCommentSheet 전방 참조는 안전)
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

  // 표시할 스냅이 없으면 닫기 — 렌더 중 부수효과 금지, useEffect에서 처리
  useEffect(() => {
    if (!currentSnap || stories.length === 0) navigation.goBack();
  }, [currentSnap, stories.length, navigation]);

  // ── 스토리 자동 넘김 + 진행 바 + 길게 눌러 일시정지 ──
  const STORY_DURATION = 5000; // 스냅 1장 노출 시간(ms)
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const [paused, setPaused] = useState(false);
  const [dragPaused, setDragPaused] = useState(false); // 아래로 끌어 닫기 드래그 중 일시정지
  // 꾹 누르는 동안 UI 전체 페이드 아웃 — 사진만 보기 (인스타 스토리 패턴)
  const uiOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(uiOpacity, { toValue: paused ? 0 : 1, duration: 150, useNativeDriver: true }).start();
  }, [paused, uiOpacity]);
  const advanceRef = useRef<(dir: 'next' | 'prev') => void>(() => {});

  // 어떤 오버레이도 안 떠 있고 일시정지/드래그 아니면 재생
  const storyPlaying =
    !paused && !dragPaused && !commentSheetOpen && !replyBarOpen && !menuVisible && !reportVisible && !viewerListOpen && !shareSheetOpen;

  // 스냅이 바뀌면 진행도 리셋
  useEffect(() => { progressAnim.setValue(0); }, [storyIdx, localIdx]);

  // 다음 스냅 이미지 미리 받기 — 자동 넘김 전환 시 깜빡임/로딩 감소
  useEffect(() => {
    if (!currentStory) return;
    const next = localIdx < currentStory.snaps.length - 1
      ? currentStory.snaps[localIdx + 1]
      : stories[storyIdx + 1]?.snaps?.[0];
    const uri = next && (next.snapBackUri || next.snapFrontUri || next.medias?.[0]);
    if (uri) Image.prefetch(uri).catch(() => {});
  }, [storyIdx, localIdx, currentStory, stories]);

  // 재생 중일 때 현재 값에서 이어서 진행, 완료되면 다음으로
  useEffect(() => {
    if (!storyPlaying) { progressAnim.stopAnimation(); return; }
    progressAnim.stopAnimation((v: number) => {
      const remaining = STORY_DURATION * (1 - v);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: Math.max(0, remaining),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => { if (finished) advanceRef.current('next'); });
    });
    return () => { progressAnim.stopAnimation(); };
  }, [storyPlaying, storyIdx, localIdx]);

  if (!currentSnap || stories.length === 0) return null;

  const comments = commentsByPost[currentSnap.id] ?? [];
  const totalComments = comments.reduce((sum: number, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = currentSnap.isMyPost === true;

  const addComment = () => {
    if (!commentText.trim()) return;
    addCommentToStore(currentSnap.id, commentText.trim(), replyTo?.id);
    setReplyTo(null);
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
  // 자동 넘김 타이머가 최신 advance를 참조하도록 (stale 클로저 방지)
  advanceRef.current = advance;

  // 아래로 끌어 닫기 (gesture-handler + reanimated, 가로 스크롤과 공존)
  const closeViewer = () => navigation.goBack();
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([14, 9999])
    .failOffsetX([-18, 18])
    .onStart(() => { 'worklet'; runOnJS(setDragPaused)(true); }) // 드래그 동안 자동 넘김 정지
    .onUpdate((e) => { 'worklet'; if (e.translationY > 0) ty.value = e.translationY; })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 100 || e.velocityY > 700) {
        ty.value = withTiming(SCREEN_H, { duration: 180 }, () => { runOnJS(closeViewer)(); });
        // 닫히는 중이므로 재개 불필요
      } else {
        ty.value = withSpring(0, { damping: 18, stiffness: 180 });
        runOnJS(setDragPaused)(false); // 취소(원위치)면 자동 넘김 재개
      }
    });

  // 한 스토리(유저) 페이지 렌더 — 같은 스토리는 사진만 교체
  const renderStoryPage = (story: any, si: number) => {
    const li = si === storyIdx ? Math.min(localIdx, story.snaps.length - 1) : 0;
    const s = story.snaps[li];
    // 이 페이지(스냅) 기준 댓글 수 — currentSnap 기준(totalComments)으로 그리면 다른 페이지에 오표시됨
    const sComments = commentsByPost[s.id] ?? [];
    const sTotalComments = sComments.reduce((sum: number, c: any) => sum + 1 + (c.replies?.length || 0), 0);
    const late = (s.snapLateSeconds && s.snapLateSeconds > 0)
      ? (s.snapLateSeconds < 60 ? t('postDetail.snapLateSec', { sec: s.snapLateSeconds }) : t('postDetail.snapLateMinSec', { min: Math.floor(s.snapLateSeconds / 60), sec: s.snapLateSeconds % 60 }))
      : '';
    return (
      <>
        <CrossfadePhoto uri={s.snapBackUri || s.snapFrontUri || s.medias?.[0]} />
        {/* 탭으로 넘기기 — 하단(캡션·지역 배지·액션)·상단 헤더 영역은 제외해 오탭 방지 */}
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 64, bottom: 140 }}
          onPress={onTapPage}
          onLongPress={() => setPaused(true)}
          delayLongPress={200}
          onPressOut={() => setPaused(false)}
        />
        {/* PiP(다른 방향 사진)는 꾹 눌러도 사진과 함께 계속 보인다 — 페이드 래퍼 밖 */}
        {s.snapBackUri && s.snapFrontUri && (
          <LinearGradient colors={['#00D8F3', '#7B61FF', '#FF14E4']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={storyS.pipWrap}>
            <Image source={{ uri: s.snapFrontUri }} style={storyS.pipImg} resizeMode="cover" />
          </LinearGradient>
        )}
        {/* 꾹 누르는 동안(paused) 오버레이 UI 전체가 페이드 아웃되고 사진만 남는다 (인스타 스토리 패턴) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={paused ? 'none' : 'box-none'}>
        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={storyS.topGradient} pointerEvents="box-none">
          <View style={storyS.progressRow}>
            {story.snaps.map((_: any, k: number) => {
              const isCurrentPage = si === storyIdx;
              const isPast = isCurrentPage && k < li;
              const isActive = isCurrentPage && k === li;
              return (
                <View key={k} style={storyS.progressSeg}>
                  {isActive ? (
                    <Animated.View style={[storyS.progressFill, { width: progressWidth }]} />
                  ) : (
                    <View style={[storyS.progressFill, { width: isPast ? '100%' : '0%' }]} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={storyS.topRow}>
            {/* 프로필 사진·아이디 탭 → 프로필 화면 (내 스냅이면 내 프로필로) */}
            <TouchableOpacity
              style={storyS.authorTap}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={s.isMyPost === true ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
              onPress={() => {
                navigation.navigate('FriendProfile', s.isMyPost === true
                  ? { userId: s.authorId ?? s.id, username: myHandle || s.user.name, handle: myHandle }
                  : { userId: s.authorId ?? s.id, username: s.user.name, handle: s.user.handle });
              }}
            >
              <View style={storyS.avatarRing}><View style={storyS.avatar}>
                {s.isMyPost === true && myPhoto ? (
                  <Image source={{ uri: myPhoto }} style={storyS.avatarImg} />
                ) : (
                  <PersonIcon size={22} color="#A0A0B0" />
                )}
              </View></View>
              <View style={storyS.userInfo}>
                <Text style={[storyS.handle, handleFontStyle(s.isMyPost === true ? (myPremium ? myHandleFont : null) : s.user.font)]}>@{s.isMyPost === true ? (myHandle || s.user.handle) : s.user.handle}</Text>
                <Text style={storyS.timeText}>{timeAgo(s.timestamp)}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={storyS.moreBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.more')}><Text style={storyS.moreBtnText}>···</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={storyS.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}><Text style={storyS.closeBtnText}>✕</Text></TouchableOpacity>
          </View>
        </LinearGradient>
        {/* 스냅 및 촬영지연 뱃지 비활성화 */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={storyS.bottomGradient} pointerEvents="box-none">
          {s.snapDetectedCountry && (
            <View style={storyS.locationBadge}>
              <PinIcon size={13} color="#FFFFFF" />
              <Text style={storyS.locationText}>{s.snapDetectedCountry}{s.regionName ? ` · ${s.regionName}` : ''}</Text>
            </View>
          )}
          {s.snapCaption ? <Text style={storyS.caption}>{s.snapCaption}</Text> : null}
          <View style={storyS.actionRow}>
            {s.isMyPost === true ? (
              /* 내가 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.actionBtnWithLabel} onPress={() => setViewerListOpen(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.viewersA11y')}>
                  <EyesSvg size={20} />
                  <Text style={storyS.actionLabel}>{s.snapViewers?.length ?? 0}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                  <CommentSvg size={22} color="#fff" />
                  {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={() => toggleLike(s.id)} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                  <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}>
                  <SendPlaneSvg size={22} />
                </TouchableOpacity>
              </>
            ) : (
              /* 타인이 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.replyWrap} activeOpacity={0.8} onPress={() => { setReplyBarOpen(true); setTimeout(() => replyInputRef.current?.focus(), 100); }} accessibilityRole="button" accessibilityLabel={t('postDetail.sendMessageA11y')}>
                  <View style={storyS.replyInput} pointerEvents="none"><Text style={storyS.replyPlaceholder}>{t('postDetail.sendMessagePlaceholder')}</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                  <CommentSvg size={22} color="#fff" />
                  {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={() => toggleLike(s.id)} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                  <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}><SendPlaneSvg size={22} /></TouchableOpacity>
              </>
            )}
          </View>
        </LinearGradient>
        </Animated.View>
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

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const handleCopyLink = async () => { setMenuVisible(false); await Clipboard.setStringAsync(postLink(currentSnap.remoteId ?? currentSnap.id)); setToastMsg(t('social.linkCopiedToast')); setTimeout(() => setToastMsg(''), 2000); };
  // 공유 아이콘 → 인스타처럼 시트에서 친구 DM 전송 또는 외부 공유를 고른다
  const handleSharePost = () => { setMenuVisible(false); setShareSheetOpen(true); };
  const handleShareExternal = () => {
    setShareSheetOpen(false);
    // 공유 시트 모달이 닫히는 중에 시스템 공유 시트를 띄우면 iOS가 무시한다 — 닫힘 완료 후 호출
    const id = currentSnap.remoteId ?? currentSnap.id;
    setTimeout(() => { Share.share({ message: t('comp2.sharePostMsg', { id }) }); }, 400);
  };
  const handleSendToFriend = (f: { name: string; handle: string }) => {
    setShareSheetOpen(false);
    const rec = records.find((r) => r.id === currentSnap.id);
    if (!rec) return;
    sendRecord(f.handle, rec);
    setToastMsg(t('comp2.toastSentTo', { name: f.name }));
    setTimeout(() => setToastMsg(''), 2000);
  };
  const handleDelete = () => { setMenuVisible(false); Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('postDetail.delete'), style: 'destructive', onPress: () => { deleteRecord(currentSnap.id); navigation.goBack(); } }]); };
  const handleReport = () => { setMenuVisible(false); setReportVisible(true); };

  // 시안(Group.svg): 두 줄 텍스트가 든 말풍선 아웃라인 — 스냅 스토리 전용 댓글 아이콘
  const CommentSvg = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size * (25 / 23)} height={size} viewBox="0 0 25 23" fill="none">
      <SvgPath d="M2.77778 7.68154C2.77778 6.54653 2.77778 5.77572 2.83056 5.17974C2.87917 4.59965 2.96944 4.30166 3.08055 4.09506L0.605556 2.8925C0.2625 3.53483 0.125 4.21955 0.061111 4.96387C-1.24176e-07 5.69229 0 6.59023 0 7.68154H2.77778ZM2.77778 10.5952V7.68154H0V10.5952H2.77778ZM0 10.5952V17.2172H2.77778V10.5952H0ZM0 17.2172V21.0766H2.77778V17.2172H0ZM0 21.0766C0 22.7864 2.16944 23.6433 3.4375 22.4341L1.47361 20.5614C1.58044 20.4594 1.71658 20.39 1.86479 20.3619C2.013 20.3338 2.16664 20.3482 2.30625 20.4034C2.44586 20.4585 2.56519 20.5519 2.64912 20.6717C2.73305 20.7916 2.77783 20.9325 2.77778 21.0766H0ZM3.4375 22.4341L7.52083 18.5417L5.55555 16.6689L1.47361 20.5614L3.4375 22.4341ZM16.9444 15.8928H7.51944V18.5417H16.9444V15.8928ZM20.7056 15.6041C20.4889 15.7101 20.1778 15.7962 19.5681 15.8425C18.9431 15.8915 18.1347 15.8928 16.9444 15.8928V18.5417C18.0889 18.5417 19.0292 18.5417 19.7944 18.4834C20.575 18.4225 21.2931 18.2913 21.9667 17.9642L20.7056 15.6041ZM21.9194 14.4466C21.6531 14.945 21.2282 15.3502 20.7056 15.6041L21.9667 17.9642C23.012 17.4563 23.8618 16.6459 24.3944 15.6492L21.9194 14.4466ZM22.2222 10.8601C22.2222 11.9951 22.2222 12.7659 22.1694 13.3619C22.1208 13.942 22.0306 14.24 21.9194 14.4466L24.3944 15.6492C24.7375 15.0068 24.875 14.3221 24.9389 13.5778C25.0014 12.8494 25 11.9514 25 10.8601H22.2222ZM22.2222 7.68154V10.8601H25V7.68154H22.2222ZM21.9194 4.09506C22.0306 4.30166 22.1208 4.59833 22.1694 5.17974C22.2222 5.77572 22.2222 6.54653 22.2222 7.68154H25C25 6.59023 25 5.69361 24.9389 4.96387C24.875 4.21955 24.7375 3.53483 24.3944 2.8925L21.9194 4.09506ZM20.7056 2.93753C21.2282 3.19147 21.6531 3.59667 21.9194 4.09506L24.3944 2.8925C23.8618 1.89573 23.012 1.08533 21.9667 0.57744L20.7056 2.93753ZM16.9444 2.64881C18.1347 2.64881 18.9431 2.64881 19.5681 2.69914C20.1764 2.74549 20.4889 2.83158 20.7056 2.93753L21.9667 0.57744C21.2931 0.250312 20.575 0.119197 19.7944 0.058274C19.0306 1.95844e-07 18.0889 0 16.9444 0V2.64881ZM8.05555 2.64881H16.9444V0H8.05555V2.64881ZM4.29444 2.93753C4.51111 2.83158 4.82222 2.74549 5.43194 2.69914C6.05694 2.64881 6.86528 2.64881 8.05555 2.64881V0C6.91111 0 5.97083 1.95844e-07 5.20555 0.058274C4.425 0.119197 3.70694 0.250312 3.03333 0.57744L4.29444 2.93753ZM3.08055 4.09506C3.34687 3.59667 3.77179 3.19147 4.29444 2.93753L3.03333 0.57744C1.98803 1.08533 1.13818 1.89573 0.605556 2.8925L3.08055 4.09506ZM7.51944 18.5417V15.8928C6.78279 15.893 6.07637 16.1722 5.55555 16.6689L7.51944 18.5417Z" fill={color} />
      <SvgPath d="M7.66699 6.6665H18.3337M7.66699 11.9998H14.3337" stroke={color} strokeWidth={1.98} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  // 디자인 시안(iPhone 17 - 63) 화이트 아웃라인 아이콘 — 조회(👀)·공유(종이비행기)
  const EyesSvg = ({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <Svg width={size * 1.5} height={size} viewBox="0 0 36 24" fill="none">
      <SvgEllipse cx={10} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgEllipse cx={26} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgCircle cx={11.5} cy={14.5} r={3} fill={color} />
      <SvgCircle cx={27.5} cy={14.5} r={3} fill={color} />
    </Svg>
  );
  // 시안(akar-icons_paper-airplane.svg): 종이비행기 아웃라인 — 스냅 스토리 전용 공유 아이콘
  const SendPlaneSvg = ({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <SvgPath d="M11.0531 18.6664L21.7643 22.4978C21.9442 22.5625 22.1364 22.5861 22.3266 22.567C22.5169 22.5479 22.7005 22.4865 22.864 22.3873C23.0275 22.2881 23.1667 22.1536 23.2716 21.9937C23.3764 21.8338 23.4442 21.6524 23.4699 21.4629L25.6551 4.94528C25.7881 3.93962 24.7463 3.18945 23.8269 3.62695L3.06145 13.5389C2.03478 14.0289 2.11178 15.5106 3.18511 15.8921L6.03178 16.9048L7.58345 17.4496M15.1668 20.1364L12.8451 24.0168C12.0868 24.9595 10.5596 24.4263 10.5596 23.2199V20.1131C10.5597 19.5268 10.7804 18.962 11.1779 18.5311L20.5624 9.62473" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
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
                placeholder={t('postDetail.sendMessagePlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={() => { addComment(); setReplyBarOpen(false); }}
                returnKeyType="send"
                autoFocus
                onBlur={() => { if (!commentText.trim()) setReplyBarOpen(false); }}
              />
              <TouchableOpacity
                style={[storyS.inlineSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { opacity: 0.35 }]}
                onPress={() => { addComment(); setReplyBarOpen(false); }}
                disabled={!commentText.trim()}
              >
                <Text style={storyS.inlineSendText}>{t('postDetail.send')}</Text>
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

      {/* 댓글 바텀시트 — 키보드 높이만큼 시트 전체를 위로 들어올린다(입력창이 키보드에 안 가리게) */}
      <Animated.View style={[storyS.commentSheet, { transform: [{ translateY: Animated.subtract(commentSheetAnim, keyboardLift) }] }]} pointerEvents={commentSheetOpen ? 'auto' : 'none'}>
        <View style={storyS.csHandleArea} {...commentSheetPan.panHandlers}>
          <View style={storyS.csHandle} />
        </View>
        <View style={storyS.csTitleRow}>
          <Text style={storyS.csTitle}>{t('social.comments')}</Text>
          <Text style={storyS.csCount}>{totalComments}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {comments.map((c: any) => (
              <View key={c.id}>
                <View style={storyS.csCommentItem}>
                  <View style={storyS.csAvatar}><AuthorAvatar photo={c.photo} emoji={c.emoji} size={32} emojiSize={15} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={storyS.csTopRow}><Text style={storyS.csName}>{c.name}</Text><Text style={storyS.csTime}>{commentTime(c)}</Text></View>
                    <Text style={storyS.csText}>{c.text}</Text>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}><Text style={storyS.csReplyBtn}>{t('postDetail.reply')}</Text></TouchableOpacity>
                  </View>
                </View>
                {c.replies && c.replies.map((r: any) => (
                  <View key={r.id} style={[storyS.csCommentItem, { marginLeft: 42 }]}>
                    <View style={storyS.csAvatar}><AuthorAvatar photo={r.photo} emoji={r.emoji} size={32} emojiSize={13} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={storyS.csTopRow}><Text style={storyS.csName}>{r.name}</Text><Text style={storyS.csTime}>{commentTime(r)}</Text></View>
                      <Text style={storyS.csText}>{r.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {comments.length === 0 && <Text style={{ color: '#5A5A6E', fontSize: 14, textAlign: 'center', marginTop: 32 }}>{t('postDetail.noComments')}</Text>}
          </ScrollView>
          {replyTo && (
            <View style={storyS.csReplyBar}>
              <Text style={[storyS.csReplyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
              <TouchableOpacity onPress={cancelReply}><Text style={storyS.csReplyBarCancel}>✕</Text></TouchableOpacity>
            </View>
          )}
          <View style={storyS.csInputBar}>
            <TextInput ref={commentInputRef} style={storyS.csInput} placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')} placeholderTextColor="#5A5A6E" value={commentText} onChangeText={setCommentText} onSubmitEditing={addComment} returnKeyType="send" />
            <TouchableOpacity style={[storyS.csSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { backgroundColor: "#2A2A3A" }]} onPress={addComment} disabled={!commentText.trim()}>
              <Text style={[storyS.csSendText, !commentText.trim() && { color: '#5A5A6E' }]}>{t('postDetail.send')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* 메뉴 모달 */}
      <Modal visible={menuVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" /><Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>
            {isMyPost ? (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                <TrashIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
              </TouchableOpacity></>
            ) : (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }} activeOpacity={0.7}>
                <MegaphoneIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
              </TouchableOpacity></>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 공유 시트 — 친구 DM으로 보내기(대화량 많은 순) + 외부 공유 */}
      <Modal visible={shareSheetOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShareSheetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} accessibilityViewIsModal>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShareSheetOpen(false)} />
          <View style={shareS.sheet}>
            <View style={shareS.handle} />
            <Text style={shareS.title}>{t('social.friendPickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 320, flexShrink: 1 }}>
              {shareFriends.map((f) => (
                <TouchableOpacity key={f.handle} style={shareS.friendRow} activeOpacity={0.7} onPress={() => handleSendToFriend(f)}>
                  <View style={shareS.friendAvatar}><Text style={{ fontSize: 18 }}>{f.emoji}</Text></View>
                  <Text style={shareS.friendName}>{f.name}</Text>
                  <Text style={[shareS.friendSend, { color: skinAccent.accent }]}>{t('postDetail.send')}</Text>
                </TouchableOpacity>
              ))}
              {shareFriends.length === 0 && (
                <Text style={shareS.empty}>{t('postDetail.shareNoFriends')}</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={shareS.externalBtn} activeOpacity={0.8} onPress={handleShareExternal}>
              <ShareIcon size={16} color="#FFFFFF" />
              <Text style={shareS.externalTxt}>{t('postDetail.shareExternal')}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>

      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={(reason) => { setReportVisible(false); reportPost(currentSnap.id, reason); setToastMsg(t('social.reportReceivedToast')); setTimeout(() => setToastMsg(''), 2000); }} />
      {toastMsg !== '' && <View style={s.toast} pointerEvents="none"><Text style={s.toastText}>{toastMsg}</Text></View>}
      <SnapViewerModal
        visible={viewerListOpen}
        onClose={() => setViewerListOpen(false)}
        viewers={(currentSnap.snapViewers ?? []).map((v: { handle: string; name: string; time: number }) => ({
          name: v.name,
          handle: v.handle,
          time: timeAgo(v.time),
          emoji: '👤',
        }))}
      />
    </View>
  );
}

type RouteParams = {
  PostDetail: { postId: string; record?: TravelRecord };
};

export default function PostDetailScreen() {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 카테고리 배지·메모 박스 등 강조를 스킨색으로
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { postId } = route.params;
  const { records, feedPosts, toggleLike, deleteRecord, archiveRecord, markSnapViewed, commentsByPost, addComment: addCommentToStore, toggleCommentLike, deleteComment, followingUsers, followUser, unfollowUser, currentViewer, refreshComments, reportPost, isBlocked, archivedIds, reportedPostIds } = useRecords();
  // 스냅 스토리 뷰어 소스 — 소셜 탭 스토리 링과 동일한 필터(공개범위·차단·보관·신고·뷰어 숨김) 적용.
  // 무필터로 넘기면 차단/신고한 사용자의 스냅이 스와이프로 그대로 재생된다.
  const { handle: globalHandle, profilePhoto: globalProfilePhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  // 내 글은 미리보기 뷰어(currentViewer), 타인 글은 '나'(내 핸들)를 뷰어로 —
  // 서버 data에 전체 사진이 내려오므로 안 거르면 작성자가 나에게 숨긴 사진이 보인다.
  const viewerFor = (r: TravelRecord) =>
    r.isMyPost || r.user?.handle === globalHandle ? currentViewer : (globalHandle || null);
  const snapViewerRecords = useMemo(
    () =>
      [...records, ...feedPosts]
        .filter(
          (r) =>
            (r.visibility === 'friends' || r.visibility === 'public') &&
            !isBlocked(r.user) &&
            !archivedIds.includes(r.id) &&
            !reportedPostIds.includes(r.id)
        )
        .filter((r) => !isPostHiddenForViewer(r, viewerFor(r)))
        .map((r) => applyViewer(r, viewerFor(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, feedPosts, archivedIds, reportedPostIds, currentViewer, isBlocked, globalHandle]
  );

  const comments = commentsByPost[postId] ?? [];
  const [commentText, setCommentText] = useState('');
  const [showCompanions, setShowCompanions] = useState(false);
  const [showTravelInfo, setShowTravelInfo] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fontScale, setFontScale] = useState(1);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [likersVisible, setLikersVisible] = useState(false);
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
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
  // 더블탭 좋아요
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 더블탭 단일탭 타이머 정리 (unmounted setState 방지)
  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);

  // 스토어에 없는 글(타인 프로필에서 조회한 공개 글)은 라우트로 넘어온 record 폴백 사용.
  // 폴백은 로컬 상태로 들고 좋아요를 직접 반영/서버 동기화한다 (store toggleLike는 스토어 글만 처리).
  const [fallbackRecord, setFallbackRecord] = useState<TravelRecord | null>(route.params.record ?? null);
  const storeRecord = records.find((r) => r.id === postId) ?? feedPosts.find((r) => r.id === postId);
  const rawRecord = storeRecord ?? fallbackRecord ?? undefined;
  const handleToggleLike = () => {
    if (storeRecord) {
      toggleLike(postId);
      return;
    }
    if (!fallbackRecord) return;
    const nowLiked = !fallbackRecord.liked;
    setFallbackRecord({
      ...fallbackRecord,
      liked: nowLiked,
      likes: nowLiked ? fallbackRecord.likes + 1 : Math.max(0, fallbackRecord.likes - 1),
    });
    const remoteId = fallbackRecord.remoteId ?? fallbackRecord.id;
    if (remoteId) {
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch(() => {
        // 서버 실패 → 낙관 반영 롤백
        setFallbackRecord((p) =>
          p ? { ...p, liked: !nowLiked, likes: nowLiked ? Math.max(0, p.likes - 1) : p.likes + 1 } : p
        );
      });
    }
  };
  // 백엔드 게시물이면 댓글을 서버에서 불러온다 (로컬 글은 remoteId 없음 → 무동작)
  useEffect(() => {
    if (!rawRecord?.remoteId) return;
    setCommentsLoading(true);
    refreshComments(postId, rawRecord.remoteId).finally(() => setCommentsLoading(false));
    // postId/remoteId가 바뀔 때만 댓글 재조회 (refreshComments는 스토어 액션)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, rawRecord?.remoteId]);
  // 뷰어 시점에서 비공개 사진을 제거한 사본 — 내 글은 미리보기 뷰어, 타인 글은 나
  const record = rawRecord ? applyViewer(rawRecord, viewerFor(rawRecord)) : rawRecord;

  if (!record) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('postDetail.postTitle')}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>{t('postDetail.postNotFound')}</Text>
        </View>
      </View>
    );
  }

  const viewType: RecordViewType = record.viewType || 'feed';
  // 헤더 타이틀: 국가명 우선, 없으면 형식 라벨
  const typeLabel =
    viewType === 'blog' ? t('postDetail.typeBlog') :
    viewType === 'album' ? t('postDetail.typeAlbum') :
    viewType === 'cut' ? t('postDetail.typeCut') :
    viewType === 'snap' ? t('postDetail.typeSnap') : t('postDetail.typeFeed');
  const headerTitleText = record.countryName
    ? `${record.countryFlag ? record.countryFlag + ' ' : ''}${record.countryName}`
    : typeLabel;
  // 본문 텍스트(피드·앨범) — 일정 길이 이상이면 "더보기"로 접기
  const bodyText = record.memo || record.content || '';
  const bodyLong = bodyText.trim().length > 150;

  const addComment = () => {
    if (!commentText.trim()) return;
    // remoteId 오버라이드 — 스토어에 없는 폴백 글(타인 프로필)도 댓글이 서버에 저장되게
    addCommentToStore(postId, commentText.trim(), replyTo?.id, record.remoteId ?? undefined);
    setReplyTo(null);
    setCommentText('');
    // 새 댓글이 렌더된 뒤 맨 아래로 스크롤
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const handleReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    commentInputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const canShowLikers = !!rawRecord?.remoteId && record.likes > 0;
  const openLikers = async () => {
    if (!canShowLikers) return;
    setLikersVisible(true);
    setLikersLoading(true);
    const list = await fetchPostLikers(rawRecord!.remoteId!);
    setLikers(list);
    setLikersLoading(false);
  };

  const confirmDeleteComment = (commentId: string) => {
    Alert.alert(t('postDetail.deleteCommentTitle'), t('postDetail.deleteCommentMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('postDetail.delete'), style: 'destructive', onPress: () => deleteComment(postId, commentId) },
    ]);
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = record?.isMyPost === true;

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const shareId = record?.remoteId ?? postId;
  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(postLink(shareId));
    setToastMsg(t('social.linkCopiedToast'));
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleSharePost = () => {
    setMenuVisible(false);
    // 메뉴 모달이 닫히는 동안 공유 시트를 띄우면 표시할 화면이 없어 무동작 → 모달 닫힘 후 호출
    setTimeout(() => {
      Share.share({ message: t('comp2.sharePostMsg', { id: shareId }) }).catch(() => {});
    }, 350);
  };

  const handleExportToNaver = () => {
    setMenuVisible(false);
    const bodyText = record.blogBlocks ? blocksToPlainText(record.blogBlocks) : record.content;
    const photos = record.blogBlocks ? blocksToPhotos(record.blogBlocks) : (record.medias || []);
    const blogData: BlogData = {
      title: record.content.trim() || `${record.countryFlag ?? ''} ${record.countryName ?? ''}`.trim() || t('postDetail.travelRecord'),
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
    Alert.alert(t('postDetail.naverExportTitle'), t('postDetail.naverExportMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.htmlCopy'),
        onPress: async () => {
          await Clipboard.setStringAsync(html);
          setToastMsg(t('postDetail.htmlCopied'));
          setTimeout(() => setToastMsg(''), 2000);
        },
      },
      {
        text: t('postDetail.textShare'),
        onPress: () => {
          const lines: string[] = [];
          if (record.countryFlag && record.countryName) lines.push(`📍 ${record.countryFlag} ${record.countryName}`);
          if (record.startDate && record.endDate) lines.push(`📅 ${record.startDate} ~ ${record.endDate}`);
          if (bodyText) lines.push('', bodyText);
          if (record.keywords?.length) lines.push('', record.keywords.map((k) => `#${k}`).join(' '));
          lines.push('', t('postDetail.shareFooter'));
          Share.share({ message: lines.join('\n') });
        },
      },
    ]);
  };

  const handleArchive = () => {
    setMenuVisible(false);
    archiveRecord(record.id);
    setToastMsg(t('social.archivedToast'));
    setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.delete'), style: 'destructive',
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

  // 더블탭: 좋아요(이미 좋아요면 유지) + 하트 버스트 애니메이션
  const triggerLikeBurst = () => {
    if (!record.liked) handleToggleLike();
    buzz('light');
    setHeartBurst(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
      Animated.timing(heartScale, { toValue: 0, duration: 250, delay: 450, useNativeDriver: true }),
    ]).start(() => setHeartBurst(false));
  };
  // 단일 탭(풀스크린)과 더블 탭(좋아요) 구분
  const handleMediaTap = (onSingle: () => void) => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
      lastTapRef.current = 0;
      triggerLikeBurst();
    } else {
      lastTapRef.current = now;
      singleTapTimer.current = setTimeout(() => { onSingle(); singleTapTimer.current = null; }, 280);
    }
  };

  const renderCountries = () => {
    if (!record.countries || record.countries.length === 0) {
      return record.country ? (
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{record.country}</Text>
        </View>
      ) : null;
    }
    if (record.countries.length <= 3) {
      return record.countries.map((c, i) => (
        <View key={i} style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{c.flag} {c.name}</Text>
        </View>
      ));
    }
    return (
      <>
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{record.countries[0].flag} {record.countries[0].name}</Text>
        </View>
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>+{record.countries.length - 1}</Text>
        </View>
      </>
    );
  };

  const CommentSvg = ({ size = 20, color = C.dim }: { size?: number; color?: string }) => (
    <CommentSvgIcon size={size} color={color} />
  );

  // ── 스냅: 인스타 스토리 스타일 전체화면 ──
  if (viewType === 'snap') {
    return (
      <SnapStoryViewer
        initialPostId={postId}
        // 친구 스냅은 feedPosts에 있다 — records만 넘기면 친구 스냅을 열 때 내 스토리가
        // 재생되거나(내 스냅 존재 시) 뷰어가 열리자마자 닫힌다. 소셜 탭 스토리 링과 동일 소스+동일 필터.
        records={snapViewerRecords}
        navigation={navigation}
        toggleLike={toggleLike}
        deleteRecord={deleteRecord}
        markSnapViewed={markSnapViewed}
      />
    );
  }

  // 사진/네컷/placeholder 위에 공통으로 올리는 동행자 오버레이
  const companionsOverlay = record.companions && record.companions.length > 0 ? (
    <>
      <TouchableOpacity
        style={s.tagBtn}
        activeOpacity={0.8}
        onPress={() => setShowCompanions(!showCompanions)}
      >
        <PersonIcon size={14} color="#fff" />
      </TouchableOpacity>
      {showCompanions && (
        <View style={s.companionPopup}>
          {record.companions.map((comp, i) => (
            <View key={i} style={s.companionPopupItem}>
              <View style={s.companionIconWrap}>{companionIcon(comp)}</View>
              <Text style={s.companionPopupText}>{comp}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  ) : null;

  // 더블탭 좋아요 하트 버스트 (사진/네컷 위 오버레이)
  const heartOverlay = heartBurst ? (
    <Animated.View pointerEvents="none" style={[s.heartBurst, { transform: [{ scale: heartScale }] }]}>
      <Text style={s.heartBurstIcon}>♥</Text>
    </Animated.View>
  ) : null;

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitleText}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 && (
              <TouchableOpacity
                onPress={() => setFontScale((p) => (p >= 1.4 ? 0.85 : p + 0.15))}
                style={s.menuBtn}
                accessibilityRole="button"
                accessibilityLabel={t('postDetail.fontSizeA11y')}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: fontScale !== 1 ? skinAccent.accent : C.dim }}>{t('blog.fontSizeBtn')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={s.menuBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.menuA11y')}>
              <Text style={s.menuDots}>···</Text>
            </TouchableOpacity>
          </View>
        </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                const isMyPost = record.isMyPost === true || record.user.handle === globalHandle;
                const postDisplayName = isMyPost
                  ? `@${globalHandle}`
                  : (record.user.name ? record.user.name : `@${record.user.handle}`);
                const authorUsername = record.user.name || record.user.handle;
                const followedEntry = followingUsers.find(
                  (f) => (record.authorId && f.id === record.authorId) || f.username === authorUsername
                );
                const toggleFollow = () => {
                  buzz('light');
                  if (followedEntry) unfollowUser(followedEntry.id || followedEntry.username);
                  else followUser({ id: record.authorId ?? '', username: authorUsername, isAbroad: false, currentCountry: null, currentCountryFlag: null });
                };
                return (
                  <View style={s.userRow}>
                    <TouchableOpacity
                      style={s.authorTouch}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={isMyPost ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
                      onPress={() => {
                        navigation.navigate('FriendProfile', isMyPost
                          ? { userId: record.authorId ?? record.id, username: globalHandle || record.user.name, handle: globalHandle }
                          : { userId: record.authorId ?? record.id, username: record.user.name, handle: record.user.handle });
                      }}
                    >
                      <View style={s.avatar}>
                        {isMyPost && globalProfilePhoto ? (
                          <Image source={{ uri: globalProfilePhoto }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : record.user.photo ? (
                          <Image source={{ uri: record.user.photo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : (
                          <PersonIcon size={24} color="#A0A0B0" />
                        )}
                      </View>
                      <View style={s.userInfo}>
                        {/* 아이디 폰트(프리미엄) — 내 글은 내 설정값, 타인 글은 서버 handle_font */}
                        <Text style={[s.userName, handleFontStyle(isMyPost ? (myPremium ? myHandleFont : null) : record.user.font)]}>{postDisplayName}</Text>
                        <View style={s.userMeta}>
                          {renderCountries()}
                          <Text style={s.dateMeta}>{timeAgo(record.timestamp)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    {record.rating != null && record.rating > 0 && (
                      <Text style={[s.ratingStars, { color: skinAccent.accent }]}>{'★'.repeat(record.rating)}{'☆'.repeat(5 - record.rating)}</Text>
                    )}
                    {!isMyPost && (
                      <TouchableOpacity
                        style={[s.followBtn, { backgroundColor: skinAccent.accent }, followedEntry && s.followingBtn]}
                        onPress={toggleFollow}
                        accessibilityRole="button"
                        accessibilityLabel={followedEntry ? t('postDetail.unfollowA11y') : t('postDetail.followA11y')}
                      >
                        <Text style={[s.followBtnText, followedEntry && s.followingBtnText]}>
                          {followedEntry ? t('postDetail.following') : t('postDetail.follow')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}

              {/* ── 블로그 콘텐츠 ── (스냅은 viewType==='snap'에서 early return 처리) */}
              {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 ? (
                <>
                  {/* 카테고리 뱃지 */}
                  {record.blogCategory && (
                    <View style={[blogS.categoryBadge, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.25) }]}>
                      <Text style={[blogS.categoryBadgeText, { color: skinAccent.accent }]}>{record.blogCategory}</Text>
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
                  {viewType === 'cut' && record.cutPhoto?.previewUri ? (
                    /* 네컷: 합성 미리보기 이미지 */
                    <View style={s.mediaWrap}>
                      <TouchableOpacity activeOpacity={0.9} onPress={() => handleMediaTap(() => openFullImage([record.cutPhoto!.previewUri], 0))}>
                        <Image source={{ uri: record.cutPhoto!.previewUri }} style={[s.cutImage, cutFitStyle(record.cutPhoto!.layout)]} resizeMode="cover" />
                      </TouchableOpacity>
                      {companionsOverlay}
                      {heartOverlay}
                    </View>
                  ) : viewType === 'album' && record.medias && record.medias.length > 0 ? (
                    /* 사진첩: 게시물이 아닌 앨범 — 전체 사진 그리드 + 장수 표기 (좋아요·댓글·여행정보 없음)
                       섹션(albumSections)이 있으면 섹션 제목별로 나눠 그린다 (보기 전용) */
                    <>
                      {(record.albumSections && record.albumSections.length > 0
                        ? sectionSlices(record.albumSections, record.medias.length)
                        : [null]
                      ).map((sec) => (
                        <View key={sec?.id ?? 'flat'}>
                          {sec && (
                            <View style={s.albumSectionHeader}>
                              <Text style={s.albumSectionTitle}>{sec.title}</Text>
                              <Text style={s.albumSectionCount}>{sec.count}</Text>
                            </View>
                          )}
                          <View style={s.albumGrid}>
                            {(sec ? record.medias!.slice(sec.start, sec.end) : record.medias!).map((uri, i) => {
                              const globalIdx = sec ? sec.start + i : i;
                              return (
                                <TouchableOpacity
                                  key={`${uri}-${globalIdx}`}
                                  activeOpacity={0.85}
                                  onPress={() => handleMediaTap(() => openFullImage(record.medias!, globalIdx))}
                                >
                                  <Image source={{ uri }} style={s.albumGridImg} />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                      <Text style={s.albumCount}>{t('postDetail.albumPhotoCount', { count: record.medias.length })}</Text>
                    </>
                  ) : record.medias && record.medias.length > 0 ? (
                    /* 피드: 실제 첨부 사진 캐러셀 */
                    <View style={s.mediaWrap}>
                      <SlideImageViewerDetail
                        items={record.medias.map((uri) => ({ uri }))}
                        onImagePress={(uris, i) => handleMediaTap(() => openFullImage(uris, i))}
                      />
                      {companionsOverlay}
                      {heartOverlay}
                    </View>
                  ) : (
                    /* 사진 없음: 그라데이션 placeholder */
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
                      <View style={[s.viewTypeBadge, { backgroundColor: skinAccent.tint(0.12) }]}>
                        <Text style={[s.viewTypeText, { color: skinAccent.accent }]}>
                          {viewType === 'feed' ? t('postDetail.typeFeed') : viewType === 'cut' ? t('postDetail.typeCut') : t('postDetail.typeAlbum')}
                        </Text>
                      </View>
                      {companionsOverlay}
                    </LinearGradient>
                  )}

                  <Text
                    style={[
                      s.content,
                      { marginBottom: bodyLong && !bodyExpanded ? 2 : (bodyText.trim().length > 50 ? 4 : 0) },
                    ]}
                    numberOfLines={bodyLong && !bodyExpanded ? 6 : undefined}
                  >
                    {bodyText}
                  </Text>
                  {bodyLong && !bodyExpanded && (
                    <TouchableOpacity onPress={() => setBodyExpanded(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.bodyMoreA11y')}>
                      <Text style={[s.moreBtn, { color: skinAccent.accent }]}>{t('postDetail.more')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

          {/* ── 이하 공통: 정보 칩, 메모, 키워드, 좋아요, 댓글 ── */}
          <View>

          {/* ── 키워드 (여행정보 위, 항상 표시 — 앨범은 사진 모음이라 제외) ── */}
          {viewType !== 'album' && record.keywords && record.keywords.length > 0 && (
            <View style={s.keywords}>
              {record.keywords.map((k) => (
                <View key={k} style={[s.keyword, { backgroundColor: skinAccent.tint(0.12) }]}>
                  <Text style={[s.keywordText, { color: skinAccent.accent }]}>#{k}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 여행정보 토글 버튼 (앨범 제외) ── */}
          {viewType !== 'album' && (record.startDate || record.weather || record.budget || record.flightType) && (
            <TouchableOpacity
              style={[s.travelInfoBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.2) }]}
              activeOpacity={0.8}
              onPress={() => setShowTravelInfo((v) => !v)}
            >
              <CalendarIcon size={14} color={skinAccent.accent} />
              <Text style={[s.travelInfoBtnText, { color: skinAccent.accent }]}>{t('postDetail.travelInfo')}</Text>
              <Text style={[s.travelInfoArrow, { color: skinAccent.accent }]}>{showTravelInfo ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          )}

          {/* ── 정보 칩들 ── */}
          {viewType !== 'album' && showTravelInfo && (record.startDate || record.weather || record.budget || record.flightType) && (
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

          {/* ── 메모 (본문에 글이 나오는 피드·앨범·스트립은 중복 방지, 블로그만 표시) ── */}
          {record.memo && viewType === 'blog' && (
            <View style={[s.memoBox, { backgroundColor: skinAccent.tint(0.06), borderLeftColor: skinAccent.accent }]}>
              <Text style={s.memoText}>{record.memo}</Text>
            </View>
          )}

          {/* ── 좋아요 · 댓글 수 + 댓글 목록 (앨범은 사진 모음이라 소셜 요소 없음) ── */}
          {viewType !== 'album' && (<>
          <View style={s.statsRow}>
            <View style={s.statBtn}>
              <TouchableOpacity onPress={() => { buzz('light'); handleToggleLike(); }} accessibilityRole="button" accessibilityLabel={record.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                <Text style={[s.statIcon, record.liked && { color: C.red }]}>
                  {record.liked ? '♥' : '♡'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openLikers} disabled={!canShowLikers} accessibilityRole="button" accessibilityLabel={t('postDetail.likersA11y')}>
                <Text style={[s.statCount, record.liked && { color: C.red }]}>{record.likes}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.statBtn} onPress={() => commentInputRef.current?.focus()} accessibilityRole="button" accessibilityLabel={t('postDetail.commentInputA11y')}>
              <CommentSvg />
              <Text style={s.statCount}>{totalComments}</Text>
            </TouchableOpacity>
          </View>

          {/* ── 구분선 ── */}
          <View style={s.divider} />

          {/* ── 댓글 목록 ── */}
          <Text style={s.commentTitle}>{t('postDetail.commentCountN', { count: totalComments })}</Text>
          {comments.map((c) => (
            <View key={c.id}>
              <View style={s.commentItem}>
                {/* 아바타/이름 탭 → 작성자 프로필 (서버 댓글만 authorId 보유) */}
                <TouchableOpacity
                  style={s.commentAvatar}
                  disabled={!c.authorId}
                  onPress={() => c.authorId && navigation.navigate('FriendProfile', { userId: c.authorId, username: c.name })}
                >
                  <AuthorAvatar photo={c.photo} emoji={c.emoji} size={32} emojiSize={15} />
                </TouchableOpacity>
                <View style={s.commentBody}>
                  <View style={s.commentTopRow}>
                    <Text
                      style={s.commentName}
                      onPress={c.authorId ? () => navigation.navigate('FriendProfile', { userId: c.authorId!, username: c.name }) : undefined}
                    >
                      {c.name}
                    </Text>
                    <Text style={s.commentTime}>{commentTime(c)}</Text>
                  </View>
                  <Text style={s.commentText}>{c.text}</Text>
                  <View style={s.commentActions}>
                    <TouchableOpacity style={s.commentLikeBtn} onPress={() => { buzz('light'); toggleCommentLike(postId, c.id); }}>
                      <Text style={[s.commentLikeIcon, c.liked && { color: C.red }]}>{c.liked ? '♥' : '♡'}</Text>
                      {!!c.likes && <Text style={s.commentLikeCount}>{c.likes}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}>
                      <Text style={s.commentActionText}>{t('postDetail.reply')}</Text>
                    </TouchableOpacity>
                    {c.isMine && (
                      <TouchableOpacity onPress={() => confirmDeleteComment(c.id)}>
                        <Text style={[s.commentActionText, { color: C.red }]}>{t('postDetail.delete')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {/* 답글 목록 */}
              {c.replies && c.replies.length > 0 && c.replies.map((r) => (
                <View key={r.id} style={s.replyItem}>
                  <TouchableOpacity
                    style={s.commentAvatar}
                    disabled={!r.authorId}
                    onPress={() => r.authorId && navigation.navigate('FriendProfile', { userId: r.authorId, username: r.name })}
                  >
                    <AuthorAvatar photo={r.photo} emoji={r.emoji} size={32} emojiSize={13} />
                  </TouchableOpacity>
                  <View style={s.commentBody}>
                    <View style={s.commentTopRow}>
                      <Text
                        style={s.commentName}
                        onPress={r.authorId ? () => navigation.navigate('FriendProfile', { userId: r.authorId!, username: r.name }) : undefined}
                      >
                        {r.name}
                      </Text>
                      <Text style={s.commentTime}>{commentTime(r)}</Text>
                    </View>
                    <Text style={s.commentText}>{r.text}</Text>
                    <View style={s.commentActions}>
                      <TouchableOpacity style={s.commentLikeBtn} onPress={() => { buzz('light'); toggleCommentLike(postId, r.id); }}>
                        <Text style={[s.commentLikeIcon, r.liked && { color: C.red }]}>{r.liked ? '♥' : '♡'}</Text>
                        {!!r.likes && <Text style={s.commentLikeCount}>{r.likes}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleReply(r.id, r.name)}>
                        <Text style={s.commentActionText}>{t('postDetail.reply')}</Text>
                      </TouchableOpacity>
                      {r.isMine && (
                        <TouchableOpacity onPress={() => confirmDeleteComment(r.id)}>
                          <Text style={[s.commentActionText, { color: C.red }]}>{t('postDetail.delete')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
          {commentsLoading && comments.length === 0 ? (
            <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 20 }} />
          ) : comments.length === 0 ? (
            <Text style={s.commentEmpty}>{t('trip.noComments')}</Text>
          ) : null}
          </>)}
          <View style={{ height: 16 }} />
          </View>
        </ScrollView>

        {/* ── 답글 표시 바 ── */}
        {replyTo && (
          <View style={s.replyBar}>
            <Text style={[s.replyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={s.replyBarCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ── 댓글 입력 (앨범 제외) ── */}
        {viewType !== 'album' && (
        <View style={s.inputBar}>
          <TextInput
            ref={commentInputRef}
            style={s.input}
            placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')}
            placeholderTextColor={C.muted}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={addComment}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && s.sendBtnDisabled]}
            onPress={addComment}
            disabled={!commentText.trim()}
          >
            <Text style={[s.sendText, !commentText.trim() && s.sendTextDisabled]}>{t('postDetail.send')}</Text>
          </TouchableOpacity>
        </View>
        )}
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
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={s.menuCard}>
            {/* 공통 메뉴 */}
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleSharePost} activeOpacity={0.7}>
              <ShareIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>{t('postDetail.shareAction')}</Text>
            </TouchableOpacity>

            {viewType === 'blog' && (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleExportToNaver} activeOpacity={0.7}>
                  <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#03C75A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>N</Text>
                  </View>
                  <Text style={s.menuItemText}>{t('postDetail.naverExportTitle')}</Text>
                </TouchableOpacity>
              </>
            )}

            {isMyPost ? (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <ArchiveIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.archiveAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={() => {
                  setMenuVisible(false);
                  if (viewType === 'blog') {
                    navigation.navigate('BlogRecord', { record: rawRecord });
                  } else if (viewType === 'album') {
                    // 사진첩 편집(추가·삭제·섹션 정리)은 전용 화면(TripRecord)에서 — 차단 알림 대체
                    if (rawRecord) navigation.navigate('TripRecord', { record: rawRecord, viewType: 'album' });
                  } else {
                    navigation.navigate('NewRecord', { record: rawRecord });
                  }
                }} activeOpacity={0.7}>
                  <PencilIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.editAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleReport} activeOpacity={0.7}>
                  <MegaphoneIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
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
        onSubmit={(reason) => {
          setReportVisible(false);
          reportPost(record.id, reason);
          setToastMsg(t('social.reportReceivedToast'));
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* ── 좋아요한 사람 목록 ── */}
      <Modal visible={likersVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setLikersVisible(false)}>
        <TouchableOpacity style={s.likersOverlay} activeOpacity={1} onPress={() => setLikersVisible(false)} accessibilityViewIsModal>
          <View style={s.likersSheet}>
            <View style={s.likersHandle} />
            <Text style={s.likersTitle}>{t('postDetail.likersCountN', { count: likers.length })}</Text>
            {likersLoading ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 24 }} />
            ) : likers.length === 0 ? (
              <Text style={s.commentEmpty}>{t('postDetail.noLikers')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                {likers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={s.likerRow}
                    activeOpacity={0.7}
                    onPress={() => { setLikersVisible(false); navigation.navigate('FriendProfile', { userId: u.id, username: u.name, handle: u.handle }); }}
                  >
                    <AuthorAvatar photo={u.photo} emoji={u.emoji} size={38} emojiSize={17} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.likerName}>{u.name}</Text>
                      {!!u.handle && <Text style={s.likerHandle}>@{u.handle}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 토스트 ── */}
      {toastMsg !== '' && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* ── 풀스크린 이미지 뷰어 ── */}
      {/* 전체화면 사진 뷰어 — 스와이프 + 핀치 줌 + n/m (공용) */}
      <PhotoViewerModal
        visible={fullImgVisible}
        uris={fullImgList}
        initialIndex={fullImgIndex}
        onClose={() => setFullImgVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── 헤더 ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },

  // ── 미디어 전체 영역 (여백 없이, 위까지) ──
  // 인스타 스토리식 상단 오버레이

  // ── 유저 정보 ──
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18,
  },
  authorTouch: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: C.accent },
  followBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cardBorder },
  followingBtnText: { color: C.dim },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.accentBorder,
  },
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

  // ── 실제 사진/네컷 영역 ──
  mediaWrap: { position: 'relative', marginBottom: 4 },
  // 사진첩(앨범) 그리드 — 본문 패딩(20+20) 안 3열
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 10 },
  albumGridImg: {
    width: Math.floor((SCREEN_W - 40 - 4) / 3),
    height: Math.floor((SCREEN_W - 40 - 4) / 3),
    borderRadius: 4,
    backgroundColor: '#1F1F22',
  },
  albumCount: { color: '#A1A1B0', fontSize: 12, marginBottom: 10 },
  albumSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 8 },
  albumSectionTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  albumSectionCount: { fontSize: 12, color: '#A1A1B0' },
  cutImage: {
    width: SCREEN_W - 40, height: SCREEN_H * 0.6, borderRadius: 12,
    marginBottom: 14, backgroundColor: '#000', alignSelf: 'center',
  },
  heartBurst: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  heartBurstIcon: {
    fontSize: 96, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 16,
  },
  commentEmpty: {
    color: C.muted, fontSize: 14, textAlign: 'center',
    marginTop: 20, marginBottom: 8,
  },
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
  companionIconWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  infoChipText: { fontSize: 12, color: C.dim },
  weatherChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  weatherEmoji: { fontSize: 18 },

  // ── 여행정보 토글 버튼 ──
  travelInfoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 18,
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentBorder,
  },
  travelInfoBtnText: { fontSize: 13, color: C.accent, fontWeight: '600' },
  travelInfoArrow: { fontSize: 10, color: C.accent, marginLeft: 2 },

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
  moreBtn: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 6 },
  // ── 좋아요한 사람 목록 ──
  likersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  likersSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, maxHeight: '70%',
  },
  likersHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.cardBorder, marginBottom: 12 },
  likersTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 12 },
  likerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  likerName: { fontSize: 14, fontWeight: '600', color: C.white },
  likerHandle: { fontSize: 12, color: C.dim, marginTop: 1 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  commentLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentLikeIcon: { fontSize: 14, color: C.dim },
  commentLikeCount: { fontSize: 12, color: C.dim },
  commentActionText: { fontSize: 12, color: C.muted, fontWeight: '600' },
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
  video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 12 },
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
  fileBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C28', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A3A', gap: 10, marginBottom: 12 },
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
    marginTop: 10, // 진행 바를 상단에서 조금 내림
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8, // 아이디·올린 시간 줄을 진행 바에서 조금 내림
  },
  // 아바타+아이디를 감싸는 탭 영역 — flex:1로 더보기·닫기 버튼을 우측에 유지
  authorTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 시안(iPhone 17 - 63): 링 없는 40pt 아바타 + 아이디·시간 한 줄 배치
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // 시안: 배경 원 없이 글리프만
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  moreBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closeBtnText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '400',
  },

  // PIP (전면 사진) — 시안: 좌상단, 시안→보라→마젠타 네온 그라데이션 테두리
  pipWrap: {
    position: 'absolute',
    top: 150,
    left: 24, // 사이드에서 조금 더 안쪽으로 (기존 16)
    width: SCREEN_W * 0.32,
    height: SCREEN_W * 0.48, // 세로를 늘려 1:1.5 비율 (기존 0.416 ≈ 1:1.3)
    borderRadius: 22,
    padding: 3,
    zIndex: 8,
  },
  pipImg: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
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
  // 시안(Group 2085664529): 하단 중앙 알약형 위치 배지 — #1C1C1C 20% 투명 유리 느낌, 높이 28
  locationBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,28,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
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
    paddingHorizontal: 8, // 조회·댓글·공유 아이콘을 사이드에서 조금 떨어뜨림 (기본 여백 16 + 8)
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
    marginLeft: 8, // 조회 아이콘을 사이드에서 조금 더 떨어뜨림 (액션 줄 여백 24 + 8)
    paddingRight: 12,
    gap: 6,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
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

// ─── 스냅 공유 시트 (친구 DM 전송 + 외부 공유) 스타일 ───
const shareS = StyleSheet.create({
  sheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
    flexShrink: 1,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  friendName: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  friendSend: { color: '#BF85FC', fontSize: 13, fontWeight: '700' },
  empty: { color: '#8B8B9E', fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 13,
    backgroundColor: '#2E2E3B',
  },
  externalTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
