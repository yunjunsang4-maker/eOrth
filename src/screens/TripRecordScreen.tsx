import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
} from 'react-native';
import TripRecordRenderer from '../components/TripRecordRenderer';
import { useRecords } from '../store/recordStore';
import { TrashIcon, CommentIcon } from '../components/icons';
import { timeAgo } from '../utils/timeAgo';
import type { RootStackScreenProps } from '../navigation/types';

export default function TripRecordScreen({ navigation, route }: RootStackScreenProps<'TripRecord'>) {
  const insets = useSafeAreaInsets();
  const { record: paramRecord, viewType: initialViewType } = route.params;
  const { records, deleteRecord, toggleLike, commentsByPost, addComment } = useRecords();
  // 편집 후 복귀 시 최신 내용이 보이도록 store의 기록을 우선 사용 (파라미터는 스냅샷)
  const record = records.find((r) => r.id === paramRecord.id) ?? paramRecord;

  const viewType = initialViewType ?? record.viewType ?? 'feed';
  const [menuVisible, setMenuVisible] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // 키보드가 올라오면 입력바 하단 여백(safe-area)을 없애 키보드와 붙도록 한다
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // 좋아요 · 댓글 (commentsByPost: 게시물별 댓글 — 답글 포함 카운트)
  const comments = commentsByPost[record.id] ?? [];
  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

  const submitComment = () => {
    const t = commentText.trim();
    if (!t) return;
    addComment(record.id, t);
    setCommentText('');
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert('기록 삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRecord(record.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="뒤로 가기">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{record.countryFlag ?? ''} {record.countryName ?? record.country ?? ''}</Text>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
            <Text style={styles.menuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>

      {/* 본문 + 좋아요/댓글 */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <TripRecordRenderer record={record} viewType={viewType} />

          {/* ── 좋아요 · 댓글 ── */}
          <View style={styles.social}>
            <View style={styles.socialBar}>
              <TouchableOpacity style={styles.socialBtn} onPress={() => toggleLike(record.id)} activeOpacity={0.7}>
                <Text style={[styles.likeIcon, record.liked && styles.likeIconActive]}>
                  {record.liked ? '♥' : '♡'}
                </Text>
                <Text style={styles.socialCount}>{record.likes}</Text>
              </TouchableOpacity>
              <View style={styles.socialBtn}>
                <CommentIcon size={20} color="#A1A1B0" />
                <Text style={styles.socialCount}>{totalComments}</Text>
              </View>
            </View>

            {/* 댓글 목록 */}
            {comments.length === 0 ? (
              <Text style={styles.commentEmpty}>아직 댓글이 없어요. 첫 댓글을 남겨보세요!</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentItem}>
                  <CommentAvatar photo={c.photo} emoji={c.emoji} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentTop}>
                      <Text style={styles.commentName}>{c.name}</Text>
                      <Text style={styles.commentTime}>{c.time ?? timeAgo(c.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                    {c.replies?.map((r) => (
                      <View key={r.id} style={styles.replyItem}>
                        <CommentAvatar photo={r.photo} emoji={r.emoji} small />
                        <View style={{ flex: 1 }}>
                          <View style={styles.commentTop}>
                            <Text style={styles.commentName}>{r.name}</Text>
                            <Text style={styles.commentTime}>{r.time ?? timeAgo(r.createdAt)}</Text>
                          </View>
                          <Text style={styles.commentText}>{r.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* 댓글 입력 바 */}
        <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? 8 : insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="댓글 달기..."
            placeholderTextColor="#5A5A6E"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
            onPress={submitComment}
            disabled={!commentText.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>게시</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ⋯ 팝업 메뉴 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={styles.menuSheet}>
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TrashIcon size={16} color="#FF3B30" /><Text style={[styles.menuItemText, styles.menuItemDelete]}>삭제하기</Text></View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// 댓글 작성자 아바타 — 프로필 사진 있으면 사진, 없으면 이모지
function CommentAvatar({ photo, emoji, small }: { photo?: string; emoji: string; small?: boolean }) {
  const size = small ? 26 : 32;
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#2A2A3A' }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: small ? 13 : 16 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // ── 좋아요 · 댓글 ──
  social: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  socialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 14,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeIcon: {
    fontSize: 22,
    color: '#A1A1B0',
    lineHeight: 24,
  },
  likeIconActive: {
    color: '#FF6B9D',
  },
  socialCount: {
    fontSize: 14,
    color: '#A1A1B0',
    fontWeight: '600',
  },
  commentEmpty: {
    fontSize: 13,
    color: '#5A5A6E',
    paddingVertical: 12,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  commentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentTime: {
    fontSize: 11,
    color: '#5A5A6E',
  },
  commentText: {
    fontSize: 14,
    color: '#E4E4EC',
    lineHeight: 20,
  },
  replyItem: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingLeft: 4,
  },

  // ── 댓글 입력 바 ──
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0A0A0F',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    backgroundColor: '#1C1C28',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6B21A8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#2A2A3A',
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0F',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  backIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  menuIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  // ── 팝업 메뉴 ──
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#1E1B33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  menuItemDelete: {
    color: '#FF3B30',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },
});
