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
import * as ImagePicker from 'expo-image-picker';
import { MAX_ALBUM_PHOTOS } from './AlbumCreateScreen';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecords } from '../store/recordStore';
import { TrashIcon, CommentIcon } from '../components/icons';
import { timeAgo } from '../utils/timeAgo';
import type { RootStackScreenProps } from '../navigation/types';

export default function TripRecordScreen({ navigation, route }: RootStackScreenProps<'TripRecord'>) {
  const { t } = useTranslation();
  useSkinAccent(); // 스킨(아이콘 팔레트) 변경 구독 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const insets = useSafeAreaInsets();
  const { record: paramRecord, viewType: initialViewType } = route.params;
  const { records, deleteRecord, updateRecord, toggleLike, commentsByPost, addComment } = useRecords();
  // 편집 후 복귀 시 최신 내용이 보이도록 store의 기록을 우선 사용 (파라미터는 스냅샷)
  const record = records.find((r) => r.id === paramRecord.id) ?? paramRecord;

  const viewType = initialViewType ?? record.viewType ?? 'feed';
  // 사진첩(앨범)은 사진 모음 — 좋아요·댓글 등 게시물 요소를 표시하지 않는다 (PostDetail과 동일 정책)
  const isAlbum = viewType === 'album';
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

  // ── 사진첩(앨범) 사진 추가/삭제 — updateRecord가 로컬 영속 복사 + 서버(updatePost) 동기화까지 처리 ──
  const handleAlbumAddPhotos = async () => {
    const current = record.medias ?? [];
    if (current.length >= MAX_ALBUM_PHOTOS) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: MAX_ALBUM_PHOTOS }));
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_ALBUM_PHOTOS - current.length,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.length) return;
      const next = [...current, ...res.assets.map((a) => a.uri)].slice(0, MAX_ALBUM_PHOTOS);
      updateRecord(record.id, { medias: next, representativePhoto: record.representativePhoto ?? next[0] });
    } catch {
      /* 픽커 취소/실패 — 무시 */
    }
  };
  const handleAlbumDeletePhoto = (index: number) => {
    const current = record.medias ?? [];
    const target = current[index];
    if (!target) return;
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotoMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.delete'),
        style: 'destructive',
        onPress: () => {
          const next = current.filter((_, i) => i !== index);
          updateRecord(record.id, {
            medias: next,
            // 대표 사진이 삭제됐으면 남은 첫 사진으로 승계
            representativePhoto: record.representativePhoto === target ? next[0] : record.representativePhoto,
          });
        },
      },
    ]);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert(t('trip.recordDeleteTitle'), t('trip.recordDeleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.delete'),
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('trip.back')}>
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
          <TripRecordRenderer
            record={record}
            viewType={viewType}
            albumEditable={isAlbum}
            onAlbumAddPhotos={handleAlbumAddPhotos}
            onAlbumDeletePhoto={handleAlbumDeletePhoto}
          />

          {/* 사진첩(앨범)은 사진 모음이라 좋아요·댓글 등 게시물 요소를 표시하지 않는다 */}
          {isAlbum ? (
            <Text style={styles.albumCount}>{t('postDetail.albumPhotoCount', { count: record.medias?.length ?? 0 })}</Text>
          ) : (
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
              <Text style={styles.commentEmpty}>{t('trip.noComments')}</Text>
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
          )}
        </ScrollView>

        {/* 댓글 입력 바 (앨범 제외) */}
        {!isAlbum && (
        <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? 8 : insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={commentText}
            onChangeText={setCommentText}
            placeholder={t('trip.commentPlaceholder')}
            placeholderTextColor="#5A5A6E"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
            onPress={submitComment}
            disabled={!commentText.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>{t('trip.post')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>

      {/* ⋯ 팝업 메뉴 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={styles.menuSheet}>
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TrashIcon size={16} color="#FF3B30" /><Text style={[styles.menuItemText, styles.menuItemDelete]}>{t('trip.deleteAction')}</Text></View>
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
  // 사진첩(앨범) — 사진 장수 표기
  albumCount: {
    fontSize: 12,
    color: '#A1A1B0',
    paddingHorizontal: 20,
    paddingTop: 10,
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
});
