import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { buzz } from '../utils/haptics';
import { useRecords, TravelRecord } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { useDM } from '../store/dmStore';
import type { Message, SharedRecord, ReplyInfo } from '../store/dmTypes';
import { GlobeIcon, CameraIcon, GalleryIcon, SearchIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

const { width: SW } = Dimensions.get('window');

const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  accent: '#BF85FC',
  accentDim: 'rgba(107,33,168,0.25)',
  accentBorder: 'rgba(191,133,252,0.3)',
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#4A4A59',
  online: '#34C759',
  myBubble: '#6B21A8',
  theirBubble: '#2E2E3B',
};


type Props = RootStackScreenProps<'DM'>;

// ─── 형식별 기록 버블 ───
function RecordBubble({ rec, isMine, onPress }: { rec: SharedRecord; isMine: boolean; onPress: () => void }) {
  const vt = rec.viewType;

  // ── 피드 / 네컷: 인스타 스타일 ──
  if (vt === 'feed' || vt === 'cut') {
    return (
      <TouchableOpacity style={[rc.feedCard, isMine ? rc.cardMine : rc.cardTheirs]} activeOpacity={0.8} onPress={onPress}>
        {rec.mediaUri ? (
          <Image source={{ uri: rec.mediaUri }} style={rc.feedImage} resizeMode="cover" />
        ) : (
          <View style={[rc.feedImage, rc.feedImageEmpty]}>
            <GlobeIcon size={36} />
          </View>
        )}
        <View style={rc.feedBottom}>
          <View style={rc.feedHeader}>
            <Text style={rc.feedCountry}>{rec.country}</Text>
            <Text style={rc.feedDate}>{rec.date}</Text>
          </View>
          <Text style={rc.feedContent} numberOfLines={2}>{rec.content}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── 블로그: 문서/아티클 스타일 ──
  if (vt === 'blog') {
    return (
      <TouchableOpacity style={[rc.blogCard, isMine ? rc.cardMine : rc.cardTheirs]} activeOpacity={0.8} onPress={onPress}>
        <View style={rc.blogBadgeRow}>
          <Text style={rc.blogBadge}>블로그</Text>
          <Text style={rc.blogDate}>{rec.date}</Text>
        </View>
        <Text style={rc.blogTitle} numberOfLines={2}>{rec.blogTitle || rec.content}</Text>
        {rec.blogPreview ? (
          <Text style={rc.blogPreview} numberOfLines={3}>{rec.blogPreview}</Text>
        ) : null}
        <View style={rc.blogFooter}>
          <Text style={rc.blogCountry}>{rec.country}</Text>
          <Text style={rc.blogReadMore}>읽기 →</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── 앨범: 사진 그리드 ──
  if (vt === 'album') {
    const uris = rec.albumUris?.length ? rec.albumUris : (rec.mediaUri ? [rec.mediaUri] : []);
    return (
      <TouchableOpacity style={[rc.albumCard, isMine ? rc.cardMine : rc.cardTheirs]} activeOpacity={0.8} onPress={onPress}>
        <View style={rc.albumGrid}>
          {uris.slice(0, 4).map((uri, i) => (
            <View key={i} style={[rc.albumCell, uris.length === 1 && rc.albumCellFull]}>
              <Image source={{ uri }} style={rc.albumImg} resizeMode="cover" />
              {i === 3 && uris.length > 4 && (
                <View style={rc.albumMore}>
                  <Text style={rc.albumMoreText}>+{uris.length - 4}</Text>
                </View>
              )}
            </View>
          ))}
          {uris.length === 0 && (
            <View style={[rc.albumCell, rc.albumCellFull, rc.albumEmpty]}>
              <CameraIcon size={30} />
            </View>
          )}
        </View>
        <View style={rc.albumBottom}>
          <Text style={rc.albumBadge}>앨범</Text>
          <Text style={rc.albumCountry}>{rec.country}</Text>
          <Text style={rc.albumDate}>{rec.date}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── 스냅: BeReal PIP 스타일 ──
  if (vt === 'snap') {
    return (
      <TouchableOpacity style={[rc.snapCard, isMine ? rc.cardMine : rc.cardTheirs]} activeOpacity={0.8} onPress={onPress}>
        <View style={rc.snapPhotoArea}>
          {rec.snapBackUri ? (
            <Image source={{ uri: rec.snapBackUri }} style={rc.snapMainPhoto} resizeMode="cover" />
          ) : rec.mediaUri ? (
            <Image source={{ uri: rec.mediaUri }} style={rc.snapMainPhoto} resizeMode="cover" />
          ) : (
            <View style={[rc.snapMainPhoto, { backgroundColor: '#1A1A26', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 30 }}>⚡</Text>
            </View>
          )}
          {rec.snapFrontUri && (
            <View style={rc.snapPip}>
              <Image source={{ uri: rec.snapFrontUri }} style={rc.snapPipImg} resizeMode="cover" />
            </View>
          )}
          <View style={rc.snapBadgeWrap}>
            <Text style={rc.snapBadgeText}>⚡ SNAP</Text>
          </View>
        </View>
        <View style={rc.snapBottom}>
          <Text style={rc.snapCaption} numberOfLines={1}>{rec.snapCaption || rec.content}</Text>
          <Text style={rc.snapMeta}>{rec.country} · {rec.date}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // fallback
  return null;
}

// ─── 답글 미리보기 텍스트 ───
function replyPreviewText(m: Message): string {
  if (m.type === 'image') return '사진';
  if (m.type === 'record') {
    const r = m.record;
    if (!r) return '여행 기록';
    const label =
      r.viewType === 'blog' ? '블로그' :
      r.viewType === 'album' ? '앨범' :
      r.viewType === 'snap' ? '스냅' : '여행 기록';
    return `${label} · ${r.country}`;
  }
  return m.text;
}

function toReplyInfo(m: Message): ReplyInfo {
  return { id: m.id, isMine: m.isMine, type: m.type, text: replyPreviewText(m) };
}

// ─── 날짜 구분 라벨 (오늘 / 어제 / 2026년 6월 16일 (월)) ───
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(m: Message): string | null {
  if (!m.createdAt) return null; // 시각 정보가 없는 시드/구버전 메시지는 구분선 생략
  const d = new Date(m.createdAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return '오늘';
  if (sameDay(d, yesterday)) return '어제';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

// 텍스트를 검색어 기준으로 분할 (일치 구간 강조용)
function splitByQuery(text: string, query: string): { t: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ t: text, hit: false }];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: { t: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) { parts.push({ t: text.slice(i), hit: false }); break; }
    if (idx > i) parts.push({ t: text.slice(i, idx), hit: false });
    parts.push({ t: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return parts;
}

// ─── 왼쪽 스와이프 → 답글 / 롱프레스 → 메뉴 ───
function SwipeRow({ onReply, onLongPress, children }: { onReply: () => void; onLongPress: () => void; children: React.ReactNode }) {
  const tx = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e: any) => {
      // 왼쪽 방향만 따라오게 클램프
      tx.setValue(Math.max(-90, Math.min(0, e.translationX)));
      // 답글 임계점 도달 시 한 번만 진동 (인스타 답글과 유사한 가벼운 톡)
      if (!triggered.current && e.translationX <= -60) {
        triggered.current = true;
        buzz('light');
      }
    })
    .onEnd((e: any) => {
      if (e.translationX <= -60) onReply();
      triggered.current = false;
      Animated.spring(tx, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
    });

  const longPress = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(350)
    .onStart(() => {
      buzz('light');
      onLongPress();
    });

  const composed = Gesture.Race(pan, longPress);

  const iconOpacity = tx.interpolate({
    inputRange: [-60, -20, 0],
    outputRange: [1, 0.25, 0],
    extrapolate: 'clamp',
  });

  return (
    <GestureDetector gesture={composed}>
      <View>
        <Animated.View style={[st.swipeIcon, { opacity: iconOpacity }]} pointerEvents="none">
          <Text style={st.swipeIconText}>↩</Text>
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: tx }] }}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export default function DMScreen({ navigation, route }: Props) {
  const { friend, sharePostId } = route.params as {
    friend: { id?: string; name: string; handle: string; emoji: string; online: boolean };
    sharePostId?: string;
  };

  const { records } = useRecords();
  const { markBadgesEarned } = useSettings();
  const { conversations, addMessage: dmAddMessage, sendRecord, deleteMessage, clearConversation, markRead, loadHistory } = useDM();
  const messages = conversations[friend.handle] ?? [];

  // 대화 진입 시 상대(profile uuid) 등록 + 서버 히스토리 로드 (백엔드 설정 시)
  useEffect(() => {
    loadHistory(friend.handle, friend.id);
  }, [friend.handle, friend.id, loadHistory]);

  // 받은 공유(상대가 보낸 게시물)가 대화에 있으면 배지 80(첫 공유받기) 획득
  useEffect(() => {
    if (messages.some((m) => !m.isMine && m.type === 'record')) markBadgesEarned([80]);
  }, [messages, markBadgesEarned]);
  const [input, setInput] = useState('');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [recordPickerOpen, setRecordPickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPos, setSearchPos] = useState(0);

  // 검색어와 일치하는 메시지들의 인덱스
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as number[];
    const acc: number[] = [];
    messages.forEach((m, i) => {
      if (m.type === 'text' && m.text.toLowerCase().includes(q)) acc.push(i);
    });
    return acc;
  }, [searchQuery, messages]);
  const flatListRef = useRef<FlatList>(null);
  const sharedRef = useRef(false);

  // 내 기록만 필터
  const myRecords = records.filter(r => r.isMyPost !== false);

  // 공유로 진입한 경우 자동 전송
  useEffect(() => {
    if (!sharePostId || sharedRef.current) return;
    const r = records.find(rec => rec.id === sharePostId);
    if (!r) return;
    sharedRef.current = true;
    sendRecord(friend.handle, r);
  }, [sharePostId, records, friend.handle, sendRecord]);

  const addMessage = (msg: Omit<Message, 'id' | 'isMine' | 'time'>) => {
    const replyTo = replyTarget ? toReplyInfo(replyTarget) : undefined;
    dmAddMessage(friend.handle, { type: msg.type, text: msg.text, imageUri: msg.imageUri, record: msg.record, replyTo });
    markBadgesEarned([73]); // 친구에게 첫 DM 전송 → 배지 73(행동 기반, 영구)
    if (replyTarget) setReplyTarget(null);
    setAttachMenuOpen(false);
  };

  // ─── 텍스트 전송 ───
  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage({ type: 'text', text: trimmed });
    setInput('');
  };

  // ─── 사진 전송 ───
  const pickImage = async () => {
    setAttachMenuOpen(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    addMessage({ type: 'image', text: '', imageUri: result.assets[0].uri });
  };

  // ─── 카메라 촬영 전송 ───
  const takePhoto = async () => {
    setAttachMenuOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('카메라 권한 필요', '사진을 촬영하려면 설정에서 카메라 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    addMessage({ type: 'image', text: '', imageUri: result.assets[0].uri });
  };

  // ─── 여행 기록 공유 ───
  const shareRecord = (r: TravelRecord) => {
    setRecordPickerOpen(false);
    sendRecord(friend.handle, r);
  };

  // ─── 답글 인용 탭 → 원본 메시지로 이동 + 하이라이트 ───
  // 인덱스 메시지로 스크롤
  const scrollToIdx = (idx: number) => {
    if (idx < 0 || idx >= messages.length) return;
    flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
  };

  // 스크롤 + 잠깐 하이라이트(1.5초) — 답글 점프용
  const jumpToMessage = (id: string) => {
    const idx = messages.findIndex(m => m.id === id);
    if (idx < 0) return;
    scrollToIdx(idx);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(messages[idx].id);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1500);
  };

  // ─── 대화 내 검색 이동 (강조는 currentMatchId가 검색 중 계속 유지) ───
  const goToMatch = (pos: number) => {
    if (!searchMatches.length) return;
    const clamped = (pos + searchMatches.length) % searchMatches.length;
    setSearchPos(clamped);
    scrollToIdx(searchMatches[clamped]);
  };
  const stepMatch = (dir: number) => goToMatch(searchPos + dir);
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchPos(0);
    setHighlightId(null);
  };

  // 검색어가 바뀌면 가장 최근(마지막) 일치 메시지로 이동
  useEffect(() => {
    if (searchMatches.length) goToMatch(searchMatches.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatches]);

  // ─── 메시지 롱프레스 메뉴 동작 ───
  const handleCopy = async () => {
    if (menuMsg) await Clipboard.setStringAsync(menuMsg.text);
    setMenuMsg(null);
  };

  const handleReplyFromMenu = () => {
    if (menuMsg) setReplyTarget(menuMsg);
    setMenuMsg(null);
  };

  const handleDelete = () => {
    const target = menuMsg;
    setMenuMsg(null);
    if (!target) return;
    Alert.alert('메시지 삭제', '이 메시지를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteMessage(friend.handle, target.id) },
    ]);
  };

  // ─── 헤더 메뉴: 대화 비우기 / 나가기 ───
  const handleClearConversation = () => {
    setHeaderMenuOpen(false);
    Alert.alert('대화 비우기', '이 대화의 모든 메시지를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '비우기', style: 'destructive', onPress: () => clearConversation(friend.handle) },
    ]);
  };

  const handleLeaveConversation = () => {
    setHeaderMenuOpen(false);
    Alert.alert('대화 나가기', '대화를 나가면 메시지가 모두 삭제됩니다. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          clearConversation(friend.handle);
          navigation.goBack();
        },
      },
    ]);
  };

  // 스크롤 (메시지 추가 또는 상대 입력 표시 시 맨 아래로)
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length]);

  // 대화 진입 및 메시지 변동 시 읽음 처리
  useEffect(() => {
    markRead(friend.handle);
  }, [friend.handle, messages.length, markRead]);

  // 하이라이트 타이머 정리
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  // 검색 활성 중 현재 매치 메시지 id (검색이 열려 있는 동안 강조 유지)
  const currentMatchId = searchOpen && searchMatches.length
    ? messages[searchMatches[searchPos]]?.id ?? null
    : null;

  // ─── 메시지 렌더링 ───
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const next = index < messages.length - 1 ? messages[index + 1] : null;
    const label = dayLabel(item);
    const showDate = !!label && label !== (prev ? dayLabel(prev) : null);

    // 같은 사람이 5분 이내·같은 날 연달아 보낸 경우 다음 메시지와 묶는다
    const GROUP_GAP = 5 * 60 * 1000;
    const groupedWithNext =
      !!next &&
      next.isMine === item.isMine &&
      !!item.createdAt && !!next.createdAt &&
      next.createdAt - item.createdAt < GROUP_GAP &&
      sameDay(new Date(item.createdAt), new Date(next.createdAt));

    return (
    <>
    {showDate && (
      <View style={st.dateSep}>
        <Text style={st.dateSepText}>{label}</Text>
      </View>
    )}
    <SwipeRow onReply={() => setReplyTarget(item)} onLongPress={() => setMenuMsg(item)}>
    <View style={[st.msgRow, item.isMine && st.msgRowMine, groupedWithNext && st.msgRowGrouped]}>
      {!item.isMine && (
        groupedWithNext
          ? <View style={st.msgAvatarSpacer} />
          : (
            <View style={st.msgAvatar}>
              <Text style={st.msgAvatarEmoji}>{friend.emoji}</Text>
            </View>
          )
      )}
      <View style={[st.msgContent, (item.id === highlightId || item.id === currentMatchId) && st.msgHighlight]}>
        {item.replyTo && (
          <TouchableOpacity
            style={[st.replyQuote, item.isMine ? st.replyQuoteMine : st.replyQuoteTheirs]}
            activeOpacity={0.7}
            onPress={() => jumpToMessage(item.replyTo!.id)}
          >
            <Text style={st.replyQuoteName}>{item.replyTo.isMine ? '나' : friend.name}</Text>
            <Text style={st.replyQuoteText} numberOfLines={1}>{item.replyTo.text}</Text>
          </TouchableOpacity>
        )}

        {item.type === 'text' && (
          <View style={[st.bubble, item.isMine ? st.bubbleMine : st.bubbleTheirs]}>
            <Text style={st.bubbleText}>
              {searchQuery.trim()
                ? splitByQuery(item.text, searchQuery).map((p, i) =>
                    p.hit
                      ? <Text key={i} style={st.searchHit}>{p.t}</Text>
                      : <Text key={i}>{p.t}</Text>,
                  )
                : item.text}
            </Text>
          </View>
        )}

        {item.type === 'image' && item.imageUri && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setViewerUri(item.imageUri!)}
            style={[st.imgBubble, item.isMine ? st.imgBubbleMine : st.imgBubbleTheirs]}
          >
            <Image source={{ uri: item.imageUri }} style={st.msgImage} resizeMode="cover" />
          </TouchableOpacity>
        )}

        {item.type === 'record' && item.record && (
          <RecordBubble
            rec={item.record}
            isMine={item.isMine}
            onPress={() => {
              const exists = records.some(r => r.id === item.record!.id);
              if (exists) {
                navigation.navigate('PostDetail', { postId: item.record!.id });
              } else {
                Alert.alert('게시물을 찾을 수 없어요', '삭제되었거나 더 이상 볼 수 없는 게시물입니다.');
              }
            }}
          />
        )}

        {!groupedWithNext && (
          <Text style={[st.msgTime, item.isMine && st.msgTimeMine]}>
            {item.time}
          </Text>
        )}
        {item.isMine && index === messages.length - 1 && (
          <Text style={st.readReceipt}>읽음</Text>
        )}
      </View>
    </View>
    </SwipeRow>
    </>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.headerCenter}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FriendProfile', { username: friend.name, handle: friend.handle })}
        >
          <View style={st.headerAvatarWrap}>
            <View style={st.headerAvatar}>
              <Text style={st.headerAvatarEmoji}>{friend.emoji}</Text>
            </View>
          </View>
          <View>
            <Text style={st.headerName}>{friend.name}</Text>
            <Text style={st.headerStatus}>{friend.online ? '온라인' : '오프라인'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={st.headerMenuBtn} onPress={() => { searchOpen ? closeSearch() : setSearchOpen(true); }} activeOpacity={0.7}>
          <SearchIcon size={20} color={searchOpen ? C.accent : C.white} />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerMenuBtn} onPress={() => setHeaderMenuOpen(true)} activeOpacity={0.7}>
          <Text style={st.headerMenuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* 대화 내 검색 바 */}
      {searchOpen && (
        <View style={st.searchBar}>
          <TextInput
            style={st.searchInput}
            placeholder="대화 내 검색..."
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          <Text style={st.searchCount}>
            {searchMatches.length ? `${searchPos + 1}/${searchMatches.length}` : '0/0'}
          </Text>
          <TouchableOpacity onPress={() => stepMatch(-1)} disabled={!searchMatches.length} style={st.searchNavBtn}>
            <Text style={[st.searchNav, !searchMatches.length && st.searchNavOff]}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => stepMatch(1)} disabled={!searchMatches.length} style={st.searchNavBtn}>
            <Text style={[st.searchNav, !searchMatches.length && st.searchNavOff]}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={closeSearch} style={st.searchNavBtn}>
            <Text style={st.searchClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 메시지 목록 */}
      <KeyboardAvoidingView
        style={st.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={st.msgList}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            setShowScrollDown(distanceFromBottom > 240);
          }}
          onScrollToIndexFailed={(info) => {
            // 아직 렌더되지 않은 항목으로 점프 시 재시도
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 300);
          }}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyEmoji}>{friend.emoji}</Text>
              <Text style={st.emptyText}>{friend.name}님과의 대화를 시작해보세요</Text>
            </View>
          }
        />

        {/* 맨아래 이동 버튼 */}
        {showScrollDown && (
          <TouchableOpacity
            style={st.scrollDownBtn}
            activeOpacity={0.8}
            onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          >
            <Text style={st.scrollDownIcon}>↓</Text>
          </TouchableOpacity>
        )}

        {/* 첨부 메뉴 */}
        {attachMenuOpen && (
          <View style={st.attachMenu}>
            <TouchableOpacity style={st.attachItem} onPress={takePhoto}>
              <CameraIcon size={22} />
              <Text style={st.attachLabel}>카메라</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.attachItem} onPress={pickImage}>
              <GalleryIcon size={22} />
              <Text style={st.attachLabel}>사진</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.attachItem} onPress={() => { setAttachMenuOpen(false); setRecordPickerOpen(true); }}>
              <GlobeIcon size={22} />
              <Text style={st.attachLabel}>여행 기록</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 답글 미리보기 바 */}
        {replyTarget && (
          <View style={st.replyBar}>
            <View style={st.replyBarLine} />
            <View style={st.replyBarBody}>
              <Text style={st.replyBarName}>
                {replyTarget.isMine ? '나' : friend.name}님에게 답장
              </Text>
              <Text style={st.replyBarText} numberOfLines={1}>{replyPreviewText(replyTarget)}</Text>
            </View>
            <TouchableOpacity style={st.replyBarClose} onPress={() => setReplyTarget(null)} activeOpacity={0.7}>
              <Text style={st.replyBarCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 입력 바 */}
        <View style={st.inputBar}>
          <TouchableOpacity
            style={st.attachBtn}
            onPress={() => setAttachMenuOpen(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text style={st.attachBtnText}>{attachMenuOpen ? '✕' : '+'}</Text>
          </TouchableOpacity>
          <TextInput
            style={st.input}
            placeholder="메시지 입력..."
            placeholderTextColor={C.muted}
            value={input}
            onChangeText={setInput}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            multiline
            maxLength={500}
            onFocus={() => setAttachMenuOpen(false)}
          />
          <TouchableOpacity
            style={[st.sendBtn, !input.trim() && st.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim()}
            activeOpacity={0.7}
          >
            <Text style={st.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 여행 기록 선택 모달 */}
      <Modal visible={recordPickerOpen} transparent animationType="slide" onRequestClose={() => setRecordPickerOpen(false)}>
        <View style={st.pickerOverlay}>
          <View style={st.pickerSheet}>
            <View style={st.pickerHeader}>
              <Text style={st.pickerTitle}>여행 기록 공유</Text>
              <TouchableOpacity onPress={() => setRecordPickerOpen(false)}>
                <Text style={st.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.pickerList}>
              {myRecords.length === 0 && (
                <Text style={st.pickerEmpty}>공유할 여행 기록이 없어요</Text>
              )}
              {myRecords.map(r => {
                const viewLabel =
                  r.viewType === 'blog' ? '블로그' :
                  r.viewType === 'album' ? '앨범' :
                  r.viewType === 'snap' ? '스냅' : '피드';
                return (
                  <TouchableOpacity key={r.id} style={st.pickerItem} activeOpacity={0.7} onPress={() => shareRecord(r)}>
                    {(r.medias?.[0] || r.snapBackUri) ? (
                      <Image source={{ uri: r.medias?.[0] || r.snapBackUri }} style={st.pickerThumb} resizeMode="cover" />
                    ) : (
                      <View style={[st.pickerThumb, st.pickerThumbEmpty]}>
                        <GlobeIcon size={20} />
                      </View>
                    )}
                    <View style={st.pickerInfo}>
                      <View style={st.pickerTopRow}>
                        <Text style={st.pickerType}>{viewLabel}</Text>
                        <Text style={st.pickerDate}>{r.date}</Text>
                      </View>
                      <Text style={st.pickerCountry}>{r.country}</Text>
                      <Text style={st.pickerContent} numberOfLines={1}>{r.content}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 이미지 전체화면 뷰어 */}
      <Modal visible={!!viewerUri} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerUri(null)}>
        <TouchableOpacity style={st.viewerOverlay} activeOpacity={1} onPress={() => setViewerUri(null)}>
          {viewerUri && (
            <Image source={{ uri: viewerUri }} style={st.viewerImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={st.viewerClose} onPress={() => setViewerUri(null)} activeOpacity={0.7}>
            <Text style={st.viewerCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 메시지 롱프레스 메뉴 */}
      <Modal visible={!!menuMsg} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setMenuMsg(null)}>
        <TouchableOpacity style={st.sheetOverlay} activeOpacity={1} onPress={() => setMenuMsg(null)}>
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <TouchableOpacity style={st.sheetItem} onPress={handleReplyFromMenu}>
              <Text style={st.sheetIcon}>↩</Text>
              <Text style={st.sheetText}>답글</Text>
            </TouchableOpacity>
            {menuMsg?.type === 'text' && (
              <TouchableOpacity style={st.sheetItem} onPress={handleCopy}>
                <Text style={st.sheetIcon}>📋</Text>
                <Text style={st.sheetText}>복사</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.sheetItem} onPress={handleDelete}>
              <Text style={st.sheetIcon}>🗑</Text>
              <Text style={[st.sheetText, { color: '#FF6B6B' }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 헤더 메뉴: 대화 비우기 / 나가기 */}
      <Modal visible={headerMenuOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setHeaderMenuOpen(false)}>
        <TouchableOpacity style={st.sheetOverlay} activeOpacity={1} onPress={() => setHeaderMenuOpen(false)}>
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <TouchableOpacity style={st.sheetItem} onPress={handleClearConversation}>
              <Text style={st.sheetIcon}>🧹</Text>
              <Text style={st.sheetText}>대화 비우기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sheetItem} onPress={handleLeaveConversation}>
              <Text style={st.sheetIcon}>🚪</Text>
              <Text style={[st.sheetText, { color: '#FF6B6B' }]}>나가기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderRadius: 20,
  },
  backIcon: { fontSize: 20, color: C.white },
  headerCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    marginLeft: 12, gap: 10,
  },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarEmoji: { fontSize: 18 },
  headerOnline: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.online, borderWidth: 2, borderColor: C.bg,
  },
  headerName: { fontSize: 15, fontWeight: '700', color: C.white },
  headerStatus: { fontSize: 11, color: C.dim, marginTop: 1 },

  // 메시지 목록
  msgList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowMine: { flexDirection: 'row-reverse' },
  msgAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  msgAvatarEmoji: { fontSize: 14 },
  msgRowGrouped: { marginBottom: 2 },
  msgAvatarSpacer: { width: 30, marginRight: 8 },
  msgContent: { maxWidth: '75%' },
  msgHighlight: {
    backgroundColor: 'rgba(191,133,252,0.18)',
    borderRadius: 14, paddingHorizontal: 6, paddingVertical: 4,
  },

  // 텍스트 버블
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: C.myBubble, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: C.theirBubble, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: C.white, lineHeight: 20 },

  // 입력 중 버블
  typingBubble: { paddingVertical: 14 },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.dim },

  // 이미지 버블
  imgBubble: { borderRadius: 16, overflow: 'hidden' },
  imgBubbleMine: { borderBottomRightRadius: 4 },
  imgBubbleTheirs: { borderBottomLeftRadius: 4 },
  msgImage: { width: SW * 0.55, height: SW * 0.55 * 0.75, borderRadius: 16 },

  // 시간
  msgTime: { fontSize: 10, color: C.muted, marginTop: 4, marginLeft: 4 },
  msgTimeMine: { textAlign: 'right', marginRight: 4, marginLeft: 0 },

  // 읽음 표시
  readReceipt: { fontSize: 10, color: C.accent, textAlign: 'right', marginRight: 4, marginTop: 2 },

  // 헤더 메뉴 버튼
  headerMenuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerMenuIcon: { fontSize: 22, color: C.white, fontWeight: '700' },

  // 대화 내 검색 바
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  searchInput: {
    flex: 1, backgroundColor: C.card, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: C.white,
  },
  searchCount: { fontSize: 12, color: C.dim, minWidth: 36, textAlign: 'center' },
  searchNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchNav: { fontSize: 18, color: C.accent, fontWeight: '700' },
  searchNavOff: { color: C.muted },
  searchClose: { fontSize: 16, color: C.dim },
  searchHit: { backgroundColor: '#FFE08A', color: '#1A1A26', fontWeight: '700' },

  // 맨아래 이동 버튼
  scrollDownBtn: {
    position: 'absolute', right: 16, bottom: 76,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.accentBorder,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  scrollDownIcon: { fontSize: 18, color: C.accent, fontWeight: '700' },

  // 액션 시트 (롱프레스/헤더 메뉴 공용)
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 34, paddingTop: 8, paddingHorizontal: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
    alignSelf: 'center', marginBottom: 8,
  },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 12 },
  sheetIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  sheetText: { fontSize: 15, color: C.white, fontWeight: '600' },

  // 날짜 구분 헤더
  dateSep: { alignItems: 'center', marginVertical: 12 },
  dateSepText: {
    fontSize: 11, color: C.dim, fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, overflow: 'hidden',
  },

  // 스와이프 답글 아이콘
  swipeIcon: {
    position: 'absolute', right: 8, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  swipeIconText: { fontSize: 20, color: C.accent },

  // 버블 안 답글 인용
  replyQuote: {
    borderLeftWidth: 2, borderLeftColor: C.accent,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    marginBottom: 4, maxWidth: '100%',
  },
  replyQuoteMine: { alignSelf: 'flex-end' },
  replyQuoteTheirs: { alignSelf: 'flex-start' },
  replyQuoteName: { fontSize: 10, fontWeight: '700', color: C.accent, marginBottom: 1 },
  replyQuoteText: { fontSize: 11, color: C.dim },

  // 입력창 위 답글 미리보기 바
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, gap: 10,
    borderTopWidth: 1, borderTopColor: C.divider,
  },
  replyBarLine: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.accent },
  replyBarBody: { flex: 1 },
  replyBarName: { fontSize: 11, fontWeight: '700', color: C.accent, marginBottom: 1 },
  replyBarText: { fontSize: 12, color: C.dim },
  replyBarClose: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  replyBarCloseText: { fontSize: 13, color: C.dim },

  // 첨부 메뉴
  attachMenu: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.divider,
  },
  attachItem: {
    alignItems: 'center', gap: 4,
    backgroundColor: C.card, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  attachIcon: { fontSize: 24 },
  attachLabel: { fontSize: 11, color: C.dim, fontWeight: '500' },

  // 입력 바
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.divider, gap: 8,
  },
  attachBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  attachBtnText: { fontSize: 20, fontWeight: '600', color: C.accent },
  input: {
    flex: 1, backgroundColor: C.card, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: C.white, maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.card },
  sendBtnText: { fontSize: 18, fontWeight: '700', color: C.white },

  // 여행 기록 선택 모달
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: C.white },
  pickerClose: { fontSize: 20, color: C.muted },
  pickerList: { paddingHorizontal: 16, paddingTop: 12 },
  pickerEmpty: { textAlign: 'center', color: C.dim, marginTop: 40, fontSize: 14 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14,
    marginBottom: 10, overflow: 'hidden',
  },
  pickerThumb: { width: 70, height: 70 },
  pickerThumbEmpty: { backgroundColor: '#1A1A26', alignItems: 'center', justifyContent: 'center' },
  pickerInfo: { flex: 1, padding: 10 },
  pickerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  pickerType: {
    fontSize: 10, fontWeight: '700', color: C.accent,
    backgroundColor: C.accentDim, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, overflow: 'hidden',
  },
  pickerDate: { fontSize: 10, color: C.muted },
  pickerCountry: { fontSize: 13, fontWeight: '600', color: C.white, marginBottom: 2 },
  pickerContent: { fontSize: 11, color: C.dim },

  // 이미지 전체화면 뷰어
  viewerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute', top: 50, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { fontSize: 18, color: C.white, fontWeight: '700' },

  // 빈 상태
  emptyWrap: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: C.dim },
});

// ─── 형식별 기록 버블 스타일 ───
const CARD_W = SW * 0.65;

const rc = StyleSheet.create({
  // 공통
  cardMine: { borderBottomRightRadius: 4 },
  cardTheirs: { borderBottomLeftRadius: 4 },

  // ── 피드 (인스타 스타일) ──
  feedCard: {
    width: CARD_W, borderRadius: 16, overflow: 'hidden',
    backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(191,133,252,0.15)',
  },
  feedImage: { width: '100%', height: CARD_W * 0.75 },
  feedImageEmpty: { backgroundColor: '#1A1A26', alignItems: 'center', justifyContent: 'center' },
  feedBottom: { padding: 10 },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  feedCountry: { fontSize: 13, fontWeight: '700', color: C.white },
  feedDate: { fontSize: 10, color: C.muted },
  feedContent: { fontSize: 12, color: C.dim, lineHeight: 17 },

  // ── 블로그 (문서 스타일) ──
  blogCard: {
    width: CARD_W, borderRadius: 16, overflow: 'hidden',
    backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(191,133,252,0.15)',
    padding: 14,
  },
  blogBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  blogBadge: {
    fontSize: 10, fontWeight: '700', color: C.accent,
    backgroundColor: C.accentDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: 'hidden',
  },
  blogDate: { fontSize: 10, color: C.muted },
  blogTitle: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 6, lineHeight: 21 },
  blogPreview: { fontSize: 12, color: C.dim, lineHeight: 18, marginBottom: 10 },
  blogFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 8 },
  blogCountry: { fontSize: 11, color: C.dim },
  blogReadMore: { fontSize: 11, fontWeight: '600', color: C.accent },

  // ── 앨범 (사진 그리드) ──
  albumCard: {
    width: CARD_W, borderRadius: 16, overflow: 'hidden',
    backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(191,133,252,0.15)',
  },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  albumCell: { width: '50%', height: CARD_W * 0.38, position: 'relative' },
  albumCellFull: { width: '100%', height: CARD_W * 0.6 },
  albumImg: { width: '100%', height: '100%' },
  albumEmpty: { backgroundColor: '#1A1A26', alignItems: 'center', justifyContent: 'center' },
  albumMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  albumMoreText: { fontSize: 18, fontWeight: '700', color: C.white },
  albumBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
  },
  albumBadge: {
    fontSize: 10, fontWeight: '700', color: '#34C759',
    backgroundColor: 'rgba(52,199,89,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  albumCountry: { fontSize: 12, fontWeight: '600', color: C.white, flex: 1 },
  albumDate: { fontSize: 10, color: C.muted },

  // ── 스냅 (BeReal PIP) ──
  snapCard: {
    width: CARD_W * 0.85, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#0D0D12', borderWidth: 1.5, borderColor: 'rgba(255,214,10,0.4)',
  },
  snapPhotoArea: { width: '100%', aspectRatio: 3 / 4, position: 'relative' },
  snapMainPhoto: { width: '100%', height: '100%' },
  snapPip: {
    position: 'absolute', top: 8, left: 8,
    width: '30%', aspectRatio: 3 / 4,
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: '#FFD60A',
  },
  snapPipImg: { width: '100%', height: '100%' },
  snapBadgeWrap: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  snapBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFD60A', letterSpacing: 1 },
  snapBottom: { padding: 10 },
  snapCaption: { fontSize: 13, fontWeight: '600', color: C.white, marginBottom: 3 },
  snapMeta: { fontSize: 10, color: C.muted },
});
