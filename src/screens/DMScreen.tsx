import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRecords, TravelRecord } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import type { Message, SharedRecord } from '../store/dmTypes';
import { GlobeIcon, CameraIcon, GalleryIcon } from '../components/icons';

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


interface Props {
  navigation: any;
  route: any;
}

// ─── 형식별 기록 버블 ───
function RecordBubble({ rec, isMine, onPress }: { rec: SharedRecord; isMine: boolean; onPress: () => void }) {
  const vt = rec.viewType;

  // ── 피드: 인스타 스타일 ──
  if (vt === 'feed') {
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

function getTimeString() {
  const now = new Date();
  const hour = now.getHours();
  const min = String(now.getMinutes()).padStart(2, '0');
  const ampm = hour < 12 ? '오전' : '오후';
  return `${ampm} ${hour % 12 || 12}:${min}`;
}

export default function DMScreen({ navigation, route }: Props) {
  const { friend, sharePostId } = route.params as {
    friend: { name: string; handle: string; emoji: string; online: boolean };
    sharePostId?: string;
  };

  const { records } = useRecords();
  const { conversations, addMessage: dmAddMessage, sendRecord } = useDM();
  const messages = conversations[friend.handle] ?? [];
  const [input, setInput] = useState('');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [recordPickerOpen, setRecordPickerOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const sharedRef = useRef(false);

  // 내 기록만 필터
  const myRecords = records.filter(r => r.isMyPost !== false);

  // 공유로 진입한 경우 자동 전송
  useEffect(() => {
    if (!sharePostId || sharedRef.current) return;
    sharedRef.current = true;
    const r = records.find(rec => rec.id === sharePostId);
    if (!r) return;
    sendRecord(friend.handle, r);
  }, [sharePostId]);

  const addMessage = (msg: Omit<Message, 'id' | 'isMine' | 'time'>) => {
    dmAddMessage(friend.handle, { type: msg.type, text: msg.text, imageUri: msg.imageUri, record: msg.record });
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

  // ─── 여행 기록 공유 ───
  const shareRecord = (r: TravelRecord) => {
    setRecordPickerOpen(false);
    sendRecord(friend.handle, r);
  };

  // 스크롤
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // ─── 메시지 렌더링 ───
  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[st.msgRow, item.isMine && st.msgRowMine]}>
      {!item.isMine && (
        <View style={st.msgAvatar}>
          <Text style={st.msgAvatarEmoji}>{friend.emoji}</Text>
        </View>
      )}
      <View style={st.msgContent}>
        {item.type === 'text' && (
          <View style={[st.bubble, item.isMine ? st.bubbleMine : st.bubbleTheirs]}>
            <Text style={st.bubbleText}>{item.text}</Text>
          </View>
        )}

        {item.type === 'image' && item.imageUri && (
          <View style={[st.imgBubble, item.isMine ? st.imgBubbleMine : st.imgBubbleTheirs]}>
            <Image source={{ uri: item.imageUri }} style={st.msgImage} resizeMode="cover" />
          </View>
        )}

        {item.type === 'record' && item.record && (
          <RecordBubble
            rec={item.record}
            isMine={item.isMine}
            onPress={() => navigation.navigate('PostDetail', { postId: item.record!.id })}
          />
        )}

        <Text style={[st.msgTime, item.isMine && st.msgTimeMine]}>
          {item.time}
        </Text>
      </View>
    </View>
  );

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
          onPress={() => navigation.navigate('FriendProfile', { handle: friend.handle })}
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
        <View style={{ width: 40 }} />
      </View>

      {/* 메시지 목록 */}
      <KeyboardAvoidingView
        style={st.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={st.msgList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyEmoji}>{friend.emoji}</Text>
              <Text style={st.emptyText}>{friend.name}님과의 대화를 시작해보세요</Text>
            </View>
          }
        />

        {/* 첨부 메뉴 */}
        {attachMenuOpen && (
          <View style={st.attachMenu}>
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
  msgContent: { maxWidth: '75%' },

  // 텍스트 버블
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: C.myBubble, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: C.theirBubble, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: C.white, lineHeight: 20 },

  // 이미지 버블
  imgBubble: { borderRadius: 16, overflow: 'hidden' },
  imgBubbleMine: { borderBottomRightRadius: 4 },
  imgBubbleTheirs: { borderBottomLeftRadius: 4 },
  msgImage: { width: SW * 0.55, height: SW * 0.55 * 0.75, borderRadius: 16 },

  // 시간
  msgTime: { fontSize: 10, color: C.muted, marginTop: 4, marginLeft: 4 },
  msgTimeMine: { textAlign: 'right', marginRight: 4, marginLeft: 0 },

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
