import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  Animated,
  Pressable,
  Share,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import QuickShareOverlay, { type CardRect } from '../components/QuickShareOverlay';
import { useDM } from '../store/dmStore';
import { hitTestTarget, buildSharedRecord, type TargetRect } from '../store/dmShareLogic';
import { LinearGradient } from 'expo-linear-gradient';
import { CommentIcon as CommentSvgIcon, ShareIcon as ShareSvgIcon, TrashIcon, GalleryIcon, ChatIcon } from '../components/icons';
import { Typography, Spacing, BorderRadius } from '../constants';
import { useRecords } from '../store/recordStore';
import type { TabScreenProps } from '../navigation/types';
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import { CUT_LAYOUTS } from '../constants/cutFrames';
import CutPhotoCanvas from '../components/CutPhotoCanvas';
import { blocksToPlainText } from '../types/blogBlocks';
import * as Clipboard from 'expo-clipboard';
import { handleBlock as blockUser, handleReport as openReport } from '../utils/reportAndBlock';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';

const { width: SCREEN_W } = Dimensions.get('window');
const SCREEN_W_SOCIAL = Dimensions.get('window').width;

// ─────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  card: '#1A0A2E',
  accent: '#BF85FC',
  accentDim: 'rgba(191,133,252,0.15)',
  accentBorder: 'rgba(191,133,252,0.25)',
  dim: '#A1A1B0',
  white: '#FFFFFF',
};

// ─────────────────────────────────────────────
// 샘플 댓글 데이터
// ─────────────────────────────────────────────
const SAMPLE_COMMENTS = [
  { id: '1', initial: '김', name: '김민준', text: '너무 부럽다 나도 가고싶어!', time: '2시간 전' },
  { id: '2', initial: '이', name: '이서연', text: '사진 너무 예쁘다 🔥', time: '1시간 전' },
  { id: '3', initial: '박', name: '박지훈', text: '도쿄 어느 동네야?', time: '30분 전' },
];

// ─────────────────────────────────────────────
// 친구 목록 (공유용)
const SHARE_FRIENDS = [
  { id: '1', name: '김민지', handle: 'minji_travel', emoji: '🌸', online: true },
  { id: '2', name: '이준호', handle: 'junho_world', emoji: '🏄', online: true },
  { id: '3', name: '박서연', handle: 'seoyeon_log', emoji: '✈️', online: false },
  { id: '4', name: '최우진', handle: 'woojin_trip', emoji: '🗺️', online: false },
  { id: '5', name: '정하늘', handle: 'haneul_sky', emoji: '🌅', online: false },
  { id: '6', name: '강도윤', handle: 'doyun_go', emoji: '🎒', online: true },
];

// 공유 바텀시트
// ─────────────────────────────────────────────
function ShareBottomSheet({
  visible,
  onClose,
  onLinkCopied,
  postId,
  navigation,
}: {
  visible: boolean;
  onClose: () => void;
  onLinkCopied: () => void;
  postId?: string;
  navigation: any;
}) {
  const [prepareVisible, setPrepareVisible] = useState(false);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const { records } = useRecords();

  const handleSNS = () => {
    setPrepareVisible(true);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync('https://eorth.app/post/share');
    onClose();
    onLinkCopied();
  };

  const handleFriendSend = () => {
    setFriendPickerVisible(true);
  };

  const handleSelectFriend = (friend: typeof SHARE_FRIENDS[0]) => {
    // 내부 View 오버레이 닫기
    setFriendPickerVisible(false);
    const doNav = () => {
      navigation.navigate('DM', {
        friend: { ...friend, lastMessage: '', time: '', unread: 0 },
        sharePostId: postId,
      });
    };
    // iOS: onDismiss 콜백에서 네비게이션 실행
    pendingNavRef.current = doNav;
    // 외부 Modal 닫기
    onClose();
    // Android 폴백: onDismiss가 호출되지 않을 수 있으므로 타이머로 보장
    if (Platform.OS === 'android') {
      setTimeout(() => {
        if (pendingNavRef.current) {
          pendingNavRef.current = null;
          doNav();
        }
      }, 500);
    }
  };

  const SHARE_OPTIONS = [
    { key: 'friends', icon: '👥', label: '친구에게\n보내기', onPress: handleFriendSend },
    { key: 'instagram', icon: '📷', label: '인스타그램', onPress: handleSNS },
    { key: 'tiktok', icon: '🎵', label: '틱톡', onPress: handleSNS },
    { key: 'link', icon: '🔗', label: '링크 복사', onPress: handleCopyLink },
  ];

  // 네비게이션 대기 ref — Modal의 onDismiss에서 실행
  const pendingNavRef = useRef<(() => void) | null>(null);

  const handleDismiss = () => {
    if (pendingNavRef.current) {
      const nav = pendingNavRef.current;
      pendingNavRef.current = null;
      nav();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={handleDismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => {
          if (!prepareVisible && !friendPickerVisible) onClose();
        }} />

        {/* 바텀시트 */}
        <View style={ss.sheet}>
          {/* 핸들 바 */}
          <View style={ss.handle} />

          {/* 타이틀 */}
          <Text style={ss.sheetTitle}>공유하기</Text>

          {/* 공유 옵션 */}
          <View style={ss.optionsRow}>
            {SHARE_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.key} style={ss.optionItem} onPress={opt.onPress} activeOpacity={0.75}>
                <View style={ss.optionIconWrap}>
                  <Text style={ss.optionIcon}>{opt.icon}</Text>
                </View>
                <Text style={ss.optionLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 취소 */}
          <TouchableOpacity style={ss.cancelCard} onPress={onClose} activeOpacity={0.75}>
            <Text style={ss.cancelText}>취소</Text>
          </TouchableOpacity>
        </View>

        {/* 서비스 준비 중 — View 오버레이 (Modal 아님) */}
        {prepareVisible && (
          <View style={[StyleSheet.absoluteFill, ss.prepareOverlay]}>
            <View style={ss.prepareCard}>
              <Text style={ss.prepareEmoji}>🚧</Text>
              <Text style={ss.prepareTitle}>서비스 준비 중이에요</Text>
              <Text style={ss.prepareDesc}>{'eOrth만의 방식으로 더 특별하게\n공유할 수 있도록 준비 중이에요 ✨'}</Text>
              <TouchableOpacity style={ss.prepareBtn} onPress={() => setPrepareVisible(false)} activeOpacity={0.85}>
                <Text style={ss.prepareBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 친구 선택 — View 오버레이 (Modal 아님) */}
        {friendPickerVisible && (
          <View style={[StyleSheet.absoluteFill, ss.prepareOverlay]}>
            <View style={ss.friendPickerCard}>
              <Text style={ss.friendPickerTitle}>보낼 친구 선택</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                {SHARE_FRIENDS.map(f => (
                  <TouchableOpacity key={f.id} style={ss.friendRow} activeOpacity={0.7} onPress={() => handleSelectFriend(f)}>
                    <View style={ss.friendAvatarWrap}>
                      <View style={ss.friendAvatar}>
                        <Text style={ss.friendAvatarEmoji}>{f.emoji}</Text>
                      </View>
                      {f.online && <View style={ss.friendOnline} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ss.friendName}>{f.name}</Text>
                      <Text style={ss.friendHandle}>@{f.handle}</Text>
                    </View>
                    <Text style={ss.friendSendIcon}>→</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={ss.friendCancelBtn} onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85}>
                <Text style={ss.friendCancelText}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// 댓글 바텀시트
// ─────────────────────────────────────────────
function CommentBottomSheet({
  visible,
  onClose,
  comments,
  onSend,
  commentText,
  setCommentText,
}: {
  visible: boolean;
  onClose: () => void;
  comments: { id: string; initial: string; name: string; text: string; time: string }[];
  onSend: () => void;
  commentText: string;
  setCommentText: (t: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={cs.sheet}>
            {/* 핸들 바 */}
            <View style={cs.handle} />

            {/* 헤더 */}
            <View style={cs.sheetHeader}>
              <Text style={cs.sheetTitle}>댓글</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={cs.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 댓글 목록 */}
            <ScrollView style={cs.commentList} showsVerticalScrollIndicator={false}>
              {comments.map((c, idx) => (
                <View key={c.id}>
                  <View style={cs.commentRow}>
                    <View style={cs.commentAvatar}>
                      <Text style={cs.commentAvatarText}>{c.initial}</Text>
                    </View>
                    <View style={cs.commentContent}>
                      <Text style={cs.commentName}>{c.name}</Text>
                      <Text style={cs.commentBody}>{c.text}</Text>
                      <Text style={cs.commentTime}>{c.time}</Text>
                    </View>
                  </View>
                  {idx < comments.length - 1 && <View style={cs.divider} />}
                </View>
              ))}
            </ScrollView>

            {/* 입력창 */}
            <View style={cs.inputRow}>
              <View style={cs.myAvatar}>
                <Text style={cs.myAvatarText}>나</Text>
              </View>
              <View style={cs.inputWrap}>
                <TextInput
                  style={cs.input}
                  placeholder="댓글을 입력하세요"
                  placeholderTextColor="#4A4A59"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                />
                <TouchableOpacity style={cs.sendBtn} onPress={onSend}>
                  <Text style={cs.sendIcon}>↑</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const CommentIcon = ({ active, color }: { active: boolean; color?: string }) => {
  const iconColor = color || (active ? C.accent : C.dim);
  return <CommentSvgIcon size={22} color={iconColor} />;
};

const ShareIcon = ({ active }: { active: boolean }) => (
  <ShareSvgIcon size={22} color={active ? C.accent : C.dim} />
);

// ─────────────────────────────────────────────
// 피드 카드 (아이콘 active 상태 개별 관리)
// ─────────────────────────────────────────────
function FeedCard({
  item,
  toggleLike,
  onBlock,
  onArchive,
  onDelete,
  navigation,
  activeMenuId,
  onOpenMenu,
}: {
  item: any;
  toggleLike: (id: string) => void;
  onBlock: (user: { name: string; emoji: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { showCounts } = useSettings();
  const menuBtnRef = useRef<View>(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const [commentActive, setCommentActive] = useState(false);
  const [shareActive, setShareActive] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [comments, setComments] = useState(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const shareToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [menuToastMsg, setMenuToastMsg] = useState('');
  const [menuToastVisible, setMenuToastVisible] = useState(false);
  const menuToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showShareToast = () => {
    if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
    setShareToast(true);
    shareToastTimer.current = setTimeout(() => setShareToast(false), 2500);
  };

  const showMenuToast = (msg: string) => {
    if (menuToastTimer.current) clearTimeout(menuToastTimer.current);
    setMenuToastMsg(msg);
    setMenuToastVisible(true);
    menuToastTimer.current = setTimeout(() => setMenuToastVisible(false), 2000);
  };

  const isMyPost = item.isMyPost ?? false;
  const menuOpen = activeMenuId === item.id;

  const handleArchive = () => {
    onOpenMenu(null);
    onArchive(item.id);
  };

  const handleEdit = () => {
    onOpenMenu(null);
    navigation.navigate('NewRecord', { editRecord: item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      '정말 삭제할까요?',
      '이 작업은 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <View style={s.feedCard}>
      {/* 카드 헤더 */}
      <View style={s.cardHeader}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
          activeOpacity={0.7}
        >
          <View style={s.feedAvatar}>
            <Text style={{ fontSize: 22 }}>{item.user.emoji}</Text>
          </View>
        </TouchableOpacity>
        <View style={s.userInfo}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
            activeOpacity={0.7}
          >
            <Text style={s.userName}>{item.user.handle}</Text>
          </TouchableOpacity>
          <View style={s.metaRow}>
            {item.countries && item.countries.length > 0
              ? item.countries.length <= 3
                ? item.countries.map((c: { flag: string; name: string }, idx: number) => (
                    <Text key={idx} style={s.countryTag}>{c.flag} {c.name}</Text>
                  ))
                : <>
                    <Text style={s.countryTag}>{item.countries[0].flag} {item.countries[0].name}</Text>
                    <Text style={s.countryTag}>+{item.countries.length - 1}</Text>
                  </>
              : <Text style={s.countryTag}>{item.country}</Text>
            }
            <Text style={s.dateMeta}>{timeAgo(item.timestamp)}</Text>
          </View>
        </View>

        {isMyPost ? (
          /* 내 게시물 ⋯ → Modal 드롭다운 */
          <View ref={menuBtnRef}>
            <TouchableOpacity
              onPress={() => {
                if (menuOpen) {
                  onOpenMenu(null);
                } else {
                  menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                    setDropdownTop(py + h + 4);
                  });
                  onOpenMenu(item.id);
                }
              }}
            >
              <Text style={s.moreIcon}>···</Text>
            </TouchableOpacity>
            <Modal
              visible={menuOpen}
              transparent
              animationType="none"
              statusBarTranslucent
              onRequestClose={() => onOpenMenu(null)}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => onOpenMenu(null)}
              />
              <View style={[s.myDropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                <TouchableOpacity
                  style={s.myMenuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    setShareSheetVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>↗</Text>
                  <Text style={s.menuItemText}>공유</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>📦</Text>
                  <Text style={s.menuItemText}>보관</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>✏️</Text>
                  <Text style={s.menuItemText}>편집</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </View>
        ) : (
          /* 다른 사람 게시물 ⋯ → Modal 드롭다운 */
          <View ref={menuBtnRef}>
            <TouchableOpacity
              onPress={() => {
                if (menuOpen) {
                  onOpenMenu(null);
                } else {
                  menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                    setDropdownTop(py + h + 4);
                  });
                  onOpenMenu(item.id);
                }
              }}
            >
              <Text style={s.moreIcon}>···</Text>
            </TouchableOpacity>
            <Modal
              visible={menuOpen}
              transparent
              animationType="none"
              statusBarTranslucent
              onRequestClose={() => onOpenMenu(null)}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => onOpenMenu(null)}
              />
              <View style={[s.dropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    setShareSheetVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>↗</Text>
                  <Text style={s.menuItemText}>공유</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    blockUser(item.user.name, () => {
                      onBlock(item.user);
                      showMenuToast('차단되었어요');
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>⛔</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>차단</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    openReport(setReportVisible);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>🚨</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>신고</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </View>
        )}
      </View>

      {/* 사진 영역 */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
        <LinearGradient colors={['#1A0A2E', '#3B1E8E']} style={s.photoPlaceholder}>
          <Text style={{ fontSize: 48, opacity: 0.4 }}>🌄</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* 본문 */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
        <View style={s.cardBody}>
          <Text style={s.content}>{item.content}</Text>
        </View>
      </TouchableOpacity>
      <View style={[s.cardBody, { paddingTop: 0 }]}>
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => toggleLike(item.id)}>
            <Text style={[s.actionIcon, item.liked && { color: '#FF6B9D' }]}>
              {item.liked ? '♥' : '♡'}
            </Text>
            {showCounts && <Text style={s.actionCount}>{item.likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => setCommentSheetVisible(true)}>
            <CommentIcon active={commentActive} />
            {showCounts && <Text style={s.actionCount}>{comments.length}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => setShareSheetVisible(true)}>
            <ShareIcon active={shareActive} />
          </TouchableOpacity>
        </View>
      </View>

      <ShareBottomSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        onLinkCopied={showShareToast}
        postId={item.id}
        navigation={navigation}
      />
      {shareToast && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>링크가 복사되었어요!</Text>
        </View>
      )}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          showMenuToast('신고가 접수되었어요');
        }}
      />

      <Toast visible={menuToastVisible} message={menuToastMsg} />

      <CommentBottomSheet
        visible={commentSheetVisible}
        onClose={() => setCommentSheetVisible(false)}
        comments={comments}
        commentText={commentText}
        setCommentText={setCommentText}
        onSend={() => {
          if (commentText.trim()) {
            setComments((prev) => [
              ...prev,
              { id: String(Date.now()), initial: '나', name: '나', text: commentText.trim(), time: '방금 전' },
            ]);
            setCommentText('');
          }
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// 블로그 카드
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 스냅 카드 (BeReal 스타일)
// ─────────────────────────────────────────────
function SnapCard({ item, toggleLike, navigation }: { item: any; toggleLike: (id: string) => void; navigation: any }) {
  const { showCounts } = useSettings();
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [comments, setComments] = useState(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');

  // 촬영 지연
  const lateText = (() => {
    if (!item.snapLateSeconds || item.snapLateSeconds <= 0) return null;
    const s = item.snapLateSeconds;
    if (s < 60) return `${s}초 후 촬영`;
    return `${Math.floor(s / 60)}분 ${s % 60}초 후 촬영`;
  })();

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
      <View style={sc.card}>
        {/* 헤더 */}
        <View style={sc.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} activeOpacity={0.7}
          >
            <View style={sc.avatar}>
              <Text style={{ fontSize: 14 }}>⚡</Text>
            </View>
            <View>
              <Text style={sc.userName}>{item.user.handle}</Text>
              <Text style={sc.date}>{timeAgo(item.timestamp)}</Text>
            </View>
          </TouchableOpacity>
          <View style={sc.snapBadge}>
            <Text style={sc.snapBadgeText}>⚡ SNAP</Text>
          </View>
        </View>

        {/* 사진 영역 */}
        <View style={sc.photoArea}>
          {/* 후면 사진 (메인) — 더미는 그라데이션 */}
          <View style={sc.backPhoto}>
            {item.snapBackUri ? (
              <Image source={{ uri: item.snapBackUri }} style={sc.backImg} resizeMode="cover" />
            ) : (
              <View style={sc.placeholderBg}>
                <Text style={sc.placeholderEmoji}>📸</Text>
              </View>
            )}
          </View>

          {/* 전면 사진 (PIP) */}
          {item.snapFrontUri ? (
            <View style={sc.pipWrap}>
              <Image source={{ uri: item.snapFrontUri }} style={sc.pipImg} resizeMode="cover" />
            </View>
          ) : (
            <View style={sc.pipWrap}>
              <View style={sc.pipPlaceholder}>
                <Text style={{ fontSize: 20 }}>🤳</Text>
              </View>
            </View>
          )}

          {/* 국가 뱃지 */}
          {item.countryFlag && (
            <View style={sc.countryBadge}>
              <Text style={sc.countryBadgeText}>{item.countryFlag} {item.countryName}</Text>
            </View>
          )}

          {/* 촬영 지연 뱃지 */}
          {lateText && (
            <View style={sc.lateBadge}>
              <Text style={sc.lateBadgeText}>⏱ {lateText}</Text>
            </View>
          )}

        </View>

        {/* 캡션 */}
        {item.snapCaption ? (
          <Text style={sc.caption}>{item.snapCaption}</Text>
        ) : null}

        {/* 하단 */}
        <View style={sc.footer}>
          <TouchableOpacity onPress={() => toggleLike(item.id)} style={sc.actionBtn}>
            <Text style={[sc.actionIcon, item.liked && { color: '#FF6B9D' }]}>
              {item.liked ? '♥' : '♡'}
            </Text>
            {showCounts && <Text style={sc.actionCount}>{item.likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={sc.actionBtn} onPress={() => setCommentSheetVisible(true)}>
            <CommentIcon active={false} color="#A1A1B0" />
            {showCounts && <Text style={sc.actionCount}>{comments.length}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={sc.actionBtn} onPress={() => setShareSheetVisible(true)}>
            <ShareIcon active={false} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
      </View>
      <ShareBottomSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        onLinkCopied={() => {}}
        postId={item.id}
        navigation={navigation}
      />
      <CommentBottomSheet
        visible={commentSheetVisible}
        onClose={() => setCommentSheetVisible(false)}
        comments={comments}
        commentText={commentText}
        setCommentText={setCommentText}
        onSend={() => {
          if (commentText.trim()) {
            setComments(prev => [
              ...prev,
              { id: String(Date.now()), initial: '나', name: '나', text: commentText.trim(), time: '방금 전' },
            ]);
            setCommentText('');
          }
        }}
      />
    </TouchableOpacity>
  );
}

const sc = StyleSheet.create({
  card: {
    backgroundColor: '#0D0D16', borderRadius: 20, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.15)', overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,214,10,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  userName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  date: { color: '#A1A1B0', fontSize: 11 },
  snapBadge: {
    backgroundColor: 'rgba(255,214,10,0.15)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  snapBadgeText: { color: '#FFD60A', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  photoArea: {
    marginHorizontal: 10, borderRadius: 16, overflow: 'hidden',
    aspectRatio: 3 / 4, backgroundColor: '#111',
  },
  photoAreaExpired: { opacity: 0.4 },
  backPhoto: { flex: 1 },
  backImg: { width: '100%', height: '100%' },
  placeholderBg: {
    flex: 1, backgroundColor: '#1A1A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderEmoji: { fontSize: 48, opacity: 0.3 },
  pipWrap: {
    position: 'absolute', top: 12, left: 12,
    width: 80, height: 106, borderRadius: 14,
    overflow: 'hidden', borderWidth: 3, borderColor: '#FFD60A',
  },
  pipImg: { width: '100%', height: '100%' },
  pipPlaceholder: {
    flex: 1, backgroundColor: '#2A2A3A',
    alignItems: 'center', justifyContent: 'center',
  },
  countryBadge: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  countryBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  lateBadge: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: 'rgba(255,214,10,0.2)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  lateBadgeText: { color: '#FFD60A', fontSize: 11, fontWeight: '700' },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  expiredText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  caption: {
    color: '#fff', fontSize: 15, lineHeight: 22,
    paddingHorizontal: 16, paddingTop: 12,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
    marginTop: 8,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 20, color: '#A1A1B0' },
  actionCount: { fontSize: 12, color: '#A1A1B0', fontWeight: '500' },
  timeLeft: { color: '#FFD60A', fontSize: 11, fontWeight: '600' },
});


function BlogCard({
  item,
  toggleLike,
  onBlock,
  onArchive,
  onDelete,
  navigation,
  activeMenuId,
  onOpenMenu,
}: {
  item: any;
  toggleLike: (id: string) => void;
  onBlock: (user: { name: string; emoji: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { showCounts } = useSettings();
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [comments, setComments] = useState(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [menuToastMsg, setMenuToastMsg] = useState('');
  const [menuToastVisible, setMenuToastVisible] = useState(false);
  const menuToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuBtnRef = useRef<View>(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const isMyPost = item.isMyPost ?? false;
  const menuOpen = activeMenuId === item.id;

  const showMenuToast = (msg: string) => {
    if (menuToastTimer.current) clearTimeout(menuToastTimer.current);
    setMenuToastMsg(msg);
    setMenuToastVisible(true);
    menuToastTimer.current = setTimeout(() => setMenuToastVisible(false), 2000);
  };

  const handleArchive = () => {
    onOpenMenu(null);
    onArchive(item.id);
  };

  const handleEdit = () => {
    onOpenMenu(null);
    navigation.navigate('NewRecord', { editRecord: item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      '정말 삭제할까요?',
      '이 작업은 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
      <View style={bc.card}>
        {/* 블로그 헤더 */}
        <View style={bc.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }} activeOpacity={0.7}
          >
            <View style={bc.avatar}>
              <Text style={{ fontSize: 14 }}>{item.user.emoji}</Text>
            </View>
            <View>
              <Text style={bc.userName}>{item.user.handle}</Text>
              <Text style={bc.date}>{timeAgo(item.timestamp)}</Text>
            </View>
          </TouchableOpacity>

          {isMyPost ? (
            <View ref={menuBtnRef}>
              <TouchableOpacity
                onPress={() => {
                  if (menuOpen) {
                    onOpenMenu(null);
                  } else {
                    menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                      setDropdownTop(py + h + 4);
                    });
                    onOpenMenu(item.id);
                  }
                }}
              >
                <Text style={bc.moreIcon}>···</Text>
              </TouchableOpacity>
              <Modal
                visible={menuOpen}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={() => onOpenMenu(null)}
              >
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => onOpenMenu(null)} />
                <View style={[s.myDropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                  <TouchableOpacity style={s.myMenuItem} onPress={handleArchive} activeOpacity={0.7}>
                    <Text style={s.menuItemIcon}>📦</Text>
                    <Text style={s.menuItemText}>보관</Text>
                  </TouchableOpacity>
                  <View style={s.myMenuDivider} />
                  <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                    <Text style={s.menuItemIcon}>✏️</Text>
                    <Text style={s.menuItemText}>수정</Text>
                  </TouchableOpacity>
                  <View style={s.myMenuDivider} />
                  <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                    <TrashIcon size={16} color="#FF3B30" />
                    <Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </Modal>
            </View>
          ) : (
            <View ref={menuBtnRef}>
              <TouchableOpacity
                onPress={() => {
                  if (menuOpen) {
                    onOpenMenu(null);
                  } else {
                    menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                      setDropdownTop(py + h + 4);
                    });
                    onOpenMenu(item.id);
                  }
                }}
              >
                <Text style={bc.moreIcon}>···</Text>
              </TouchableOpacity>
              <Modal
                visible={menuOpen}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={() => onOpenMenu(null)}
              >
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => onOpenMenu(null)} />
                <View style={[s.dropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                  <TouchableOpacity
                    style={s.menuItem}
                    onPress={() => {
                      onOpenMenu(null);
                      blockUser(item.user.name, () => {
                        onBlock(item.user);
                        showMenuToast('차단되었어요');
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.menuItemIcon}>⛔</Text>
                    <Text style={[s.menuItemText, s.menuItemDanger]}>차단하기</Text>
                  </TouchableOpacity>
                  <View style={s.menuDivider} />
                  <TouchableOpacity
                    style={s.menuItem}
                    onPress={() => {
                      onOpenMenu(null);
                      openReport(setReportVisible);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.menuItemIcon}>🚨</Text>
                    <Text style={[s.menuItemText, s.menuItemDanger]}>신고하기</Text>
                  </TouchableOpacity>
                </View>
              </Modal>
            </View>
          )}
        </View>

        {/* 국가 태그 */}
        <View style={bc.countryRow}>
          {item.countries ? (
            item.countries.slice(0, 3).map((c: any, i: number) => (
              <View key={i} style={bc.countryTag}>
                <Text style={bc.countryTagText}>{c.flag} {c.name}</Text>
              </View>
            ))
          ) : (
            <View style={bc.countryTag}>
              <Text style={bc.countryTagText}>{item.countryFlag} {item.countryName}</Text>
            </View>
          )}
          {item.countries && item.countries.length > 3 && (
            <View style={bc.countryTag}>
              <Text style={bc.countryTagText}>+{item.countries.length - 3}</Text>
            </View>
          )}
        </View>

        {/* 블로그 본문 미리보기 */}
        <Text style={bc.content} numberOfLines={4}>{item.content}</Text>

        {/* 메모 */}
        {item.memo && (
          <Text style={bc.memo} numberOfLines={2}>{item.memo}</Text>
        )}

        {/* 키워드 태그 */}
        {item.keywords && item.keywords.length > 0 && (
          <View style={bc.keywordRow}>
            {item.keywords.slice(0, 4).map((kw: string, i: number) => (
              <View key={i} style={bc.keyword}>
                <Text style={bc.keywordText}>#{kw}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 하단 액션 */}
        <View style={bc.footer}>
          <TouchableOpacity onPress={() => toggleLike(item.id)} style={bc.actionBtn}>
            <Text style={[bc.actionIcon, item.liked && { color: '#FF6B9D' }]}>
              {item.liked ? '♥' : '♡'}
            </Text>
            {showCounts && <Text style={bc.actionCount}>{item.likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={bc.actionBtn} onPress={() => setCommentSheetVisible(true)}>
            <CommentIcon active={false} color="#A1A1B0" />
            {showCounts && <Text style={bc.actionCount}>{comments.length}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={bc.actionBtn} onPress={() => setShareSheetVisible(true)}>
            <ShareIcon active={false} />
          </TouchableOpacity>
        </View>
      </View>
      <ShareBottomSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        onLinkCopied={() => {}}
        postId={item.id}
        navigation={navigation}
      />
      <CommentBottomSheet
        visible={commentSheetVisible}
        onClose={() => setCommentSheetVisible(false)}
        comments={comments}
        commentText={commentText}
        setCommentText={setCommentText}
        onSend={() => {
          if (commentText.trim()) {
            setComments(prev => [
              ...prev,
              { id: String(Date.now()), initial: '나', name: '나', text: commentText.trim(), time: '방금 전' },
            ]);
            setCommentText('');
          }
        }}
      />
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={() => {
          setReportVisible(false);
          showMenuToast('신고가 접수되었어요');
        }}
      />
      <Toast visible={menuToastVisible} message={menuToastMsg} />
    </TouchableOpacity>
  );
}

const bc = StyleSheet.create({
  card: { backgroundColor: '#13102A', borderRadius: 16, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(191,133,252,0.12)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(191,133,252,0.15)', alignItems: 'center', justifyContent: 'center' },
  userName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  date: { color: '#A1A1B0', fontSize: 11 },
  moreIcon: { fontSize: 18, color: '#A1A1B0', fontWeight: '700', paddingHorizontal: 4 },
  countryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  countryTag: { backgroundColor: 'rgba(191,133,252,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  countryTagText: { color: '#BF85FC', fontSize: 11, fontWeight: '500' },
  content: { color: '#fff', fontSize: 14, lineHeight: 22, marginBottom: 8 },
  memo: { color: '#A1A1B0', fontSize: 13, lineHeight: 19, marginBottom: 8, fontStyle: 'italic' },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  keyword: { backgroundColor: 'rgba(107,33,168,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  keywordText: { color: '#A78BFA', fontSize: 11 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 20, color: '#A1A1B0' },
  actionCount: { fontSize: 12, color: '#A1A1B0', fontWeight: '500' },
});


// ─────────────────────────────────────────────
// 앨범 카드 (미니 갤러리 그리드)
// ─────────────────────────────────────────────
function AlbumCard({
  item,
  toggleLike,
  onBlock,
  onArchive,
  onDelete,
  navigation,
  activeMenuId,
  onOpenMenu,
}: {
  item: any;
  toggleLike: (id: string) => void;
  onBlock: (user: { name: string; emoji: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { showCounts } = useSettings();
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [comments, setComments] = useState(SAMPLE_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [menuToastMsg, setMenuToastMsg] = useState('');
  const [menuToastVisible, setMenuToastVisible] = useState(false);
  const menuToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuBtnRef = useRef<View>(null);
  const [dropdownTop, setDropdownTop] = useState(0);
  const medias: string[] = item.medias || [];
  const displayCount = Math.min(medias.length, 4);
  const extraCount = medias.length - 4;

  const isMyPost = item.isMyPost ?? false;
  const menuOpen = activeMenuId === item.id;

  const showMenuToast = (msg: string) => {
    if (menuToastTimer.current) clearTimeout(menuToastTimer.current);
    setMenuToastMsg(msg);
    setMenuToastVisible(true);
    menuToastTimer.current = setTimeout(() => setMenuToastVisible(false), 2000);
  };

  const handleArchive = () => {
    onOpenMenu(null);
    onArchive(item.id);
  };

  const handleEdit = () => {
    onOpenMenu(null);
    navigation.navigate('NewRecord', { editRecord: item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      '정말 삭제할까요?',
      '이 작업은 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
    <View style={ab.card}>
      {/* 헤더 */}
      <View style={ab.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
          style={ab.userRow} activeOpacity={0.7}
        >
          <View style={ab.avatar}>
            <Text style={{ fontSize: 18 }}>{item.user.emoji}</Text>
          </View>
          <View>
            <Text style={ab.userName}>{item.user.handle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {item.countries && (
                item.countries.length <= 3
                  ? item.countries.map((c: any, i: number) => (
                      <Text key={i} style={ab.countryTag}>{c.flag} {c.name}</Text>
                    ))
                  : <>
                      <Text style={ab.countryTag}>{item.countries[0].flag} {item.countries[0].name}</Text>
                      <Text style={ab.countryTag}>+{item.countries.length - 1}</Text>
                    </>
              )}
              <Text style={ab.date}>{timeAgo(item.timestamp)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isMyPost ? (
          <View ref={menuBtnRef}>
            <TouchableOpacity
              onPress={() => {
                if (menuOpen) {
                  onOpenMenu(null);
                } else {
                  menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                    setDropdownTop(py + h + 4);
                  });
                  onOpenMenu(item.id);
                }
              }}
            >
              <Text style={ab.moreIcon}>···</Text>
            </TouchableOpacity>
            <Modal
              visible={menuOpen}
              transparent
              animationType="none"
              statusBarTranslucent
              onRequestClose={() => onOpenMenu(null)}
            >
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => onOpenMenu(null)} />
              <View style={[s.myDropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                <TouchableOpacity style={s.myMenuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>📦</Text>
                  <Text style={s.menuItemText}>보관</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>✏️</Text>
                  <Text style={s.menuItemText}>수정</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </View>
        ) : (
          <View ref={menuBtnRef}>
            <TouchableOpacity
              onPress={() => {
                if (menuOpen) {
                  onOpenMenu(null);
                } else {
                  menuBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                    setDropdownTop(py + h + 4);
                  });
                  onOpenMenu(item.id);
                }
              }}
            >
              <Text style={ab.moreIcon}>···</Text>
            </TouchableOpacity>
            <Modal
              visible={menuOpen}
              transparent
              animationType="none"
              statusBarTranslucent
              onRequestClose={() => onOpenMenu(null)}
            >
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => onOpenMenu(null)} />
              <View style={[s.dropdownMenu, { position: 'absolute', top: dropdownTop, right: 16 }]}>
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    blockUser(item.user.name, () => {
                      onBlock(item.user);
                      showMenuToast('차단되었어요');
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>⛔</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>차단하기</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    openReport(setReportVisible);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>🚨</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>신고하기</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </View>
        )}
      </View>

      {/* 앨범 제목 */}
      <View style={ab.titleRow}>
        <GalleryIcon size={16} color="#A1A1B0" />
        <Text style={ab.albumTitle}>{item.content}</Text>
      </View>

      {/* 사진 그리드 */}
      {medias.length > 0 ? (
        <View style={ab.grid}>
          {medias.length === 1 && (
            <Image source={{ uri: medias[0] }} style={ab.gridSingle} resizeMode="cover" />
          )}
          {medias.length === 2 && (
            <View style={ab.gridRow}>
              <Image source={{ uri: medias[0] }} style={ab.gridHalf} resizeMode="cover" />
              <Image source={{ uri: medias[1] }} style={ab.gridHalf} resizeMode="cover" />
            </View>
          )}
          {medias.length === 3 && (
            <View style={ab.gridRow}>
              <Image source={{ uri: medias[0] }} style={ab.gridTwoThird} resizeMode="cover" />
              <View style={ab.gridCol}>
                <Image source={{ uri: medias[1] }} style={ab.gridSmall} resizeMode="cover" />
                <Image source={{ uri: medias[2] }} style={ab.gridSmall} resizeMode="cover" />
              </View>
            </View>
          )}
          {medias.length >= 4 && (
            <View style={ab.grid4}>
              <View style={ab.gridRow}>
                <Image source={{ uri: medias[0] }} style={ab.grid4Cell} resizeMode="cover" />
                <Image source={{ uri: medias[1] }} style={ab.grid4Cell} resizeMode="cover" />
              </View>
              <View style={ab.gridRow}>
                <Image source={{ uri: medias[2] }} style={ab.grid4Cell} resizeMode="cover" />
                <View style={ab.grid4Cell}>
                  <Image source={{ uri: medias[3] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  {extraCount > 0 && (
                    <View style={ab.moreOverlay}>
                      <Text style={ab.moreText}>+{extraCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      ) : (
        <LinearGradient colors={['#1A0A2E', '#2A1052']} style={ab.noMedia}>
          <GalleryIcon size={40} color="#A1A1B0" />
          <Text style={ab.noMediaText}>사진 앨범</Text>
        </LinearGradient>
      )}

      {/* 하단 액션 */}
      <View style={ab.bottom}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => toggleLike(item.id)} style={ab.likeBtn}>
            <Text style={[ab.actionIcon, item.liked && { color: '#FF6B9D' }]}>
              {item.liked ? '♥' : '♡'}
            </Text>
            {showCounts && <Text style={ab.actionCount}>{item.likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={ab.likeBtn} onPress={() => setCommentSheetVisible(true)}>
            <CommentIcon active={false} />
            {showCounts && <Text style={ab.actionCount}>{comments.length}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={ab.likeBtn} onPress={() => setShareSheetVisible(true)}>
            <ShareIcon active={false} />
          </TouchableOpacity>
        </View>
        {medias.length > 0 && (
          <Text style={ab.photoCount}>{medias.length}장</Text>
        )}
      </View>
    </View>
    <ShareBottomSheet
      visible={shareSheetVisible}
      onClose={() => setShareSheetVisible(false)}
      onLinkCopied={() => {}}
      postId={item.id}
      navigation={navigation}
    />
    <CommentBottomSheet
      visible={commentSheetVisible}
      onClose={() => setCommentSheetVisible(false)}
      comments={comments}
      commentText={commentText}
      setCommentText={setCommentText}
      onSend={() => {
        if (commentText.trim()) {
          setComments(prev => [
            ...prev,
            { id: String(Date.now()), initial: '나', name: '나', text: commentText.trim(), time: '방금 전' },
          ]);
          setCommentText('');
        }
      }}
    />
    <ReportModal
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      onSubmit={() => {
        setReportVisible(false);
        showMenuToast('신고가 접수되었어요');
      }}
    />
    <Toast visible={menuToastVisible} message={menuToastMsg} />
    </TouchableOpacity>
  );
}

const GRID_GAP = 3;
const GRID_W = SCREEN_W - 32 - 2; // 패딩 + 보더
const ab = StyleSheet.create({
  card: { backgroundColor: '#1A0A2E', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(191,133,252,0.2)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingBottom: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(191,133,252,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(191,133,252,0.2)' },
  userName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  countryTag: { color: '#BF85FC', fontSize: 11, fontWeight: '600' },
  date: { color: '#A1A1B0', fontSize: 11, marginLeft: 2 },
  moreIcon: { fontSize: 18, color: '#A1A1B0', fontWeight: '700', paddingHorizontal: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  albumIcon: { fontSize: 16 },
  albumTitle: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  // 그리드 레이아웃
  grid: { marginHorizontal: 1, overflow: 'hidden' },
  gridSingle: { width: GRID_W, height: GRID_W * 0.65, borderRadius: 4 },
  gridRow: { flexDirection: 'row', gap: GRID_GAP },
  gridHalf: { width: (GRID_W - GRID_GAP) / 2, height: (GRID_W - GRID_GAP) / 2 * 0.75, borderRadius: 4 },
  gridTwoThird: { width: (GRID_W - GRID_GAP) * 0.6, height: (GRID_W - GRID_GAP) * 0.45, borderRadius: 4 },
  gridCol: { flex: 1, gap: GRID_GAP },
  gridSmall: { flex: 1, borderRadius: 4, minHeight: 10 },
  grid4: { gap: GRID_GAP },
  grid4Cell: { width: (GRID_W - GRID_GAP) / 2, height: (GRID_W - GRID_GAP) / 2 * 0.5, borderRadius: 4, overflow: 'hidden' },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  noMedia: { height: 140, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noMediaText: { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '500' },
  bottom: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  actionBtn: { paddingRight: 4 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 22, color: '#A1A1B0', lineHeight: 22 },
  actionCount: { fontSize: 12, color: '#A1A1B0', fontWeight: '500' },
  photoCount: { color: '#A1A1B0', fontSize: 12, marginLeft: 'auto' },
});

// ─────────────────────────────────────────────
// 친구 피드
// ─────────────────────────────────────────────
// ── 몰입형 스크롤링: 카드 등장 애니메이션 래퍼 ──
// ─────────────────────────────────────────────
// 여행 다이어리 카드 (2단 매거진 배치)
// ─────────────────────────────────────────────
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const firstPhoto = (item: any): string | null => {
  if (item.viewType === 'cut') return item.cutPhoto?.previewUri || item.medias?.[0] || null;
  return item.medias?.[0] || null;
};
const blogExcerpt = (item: any): string => {
  let t = '';
  if (item.blogBlocks) { try { t = blocksToPlainText(item.blogBlocks); } catch { t = ''; } }
  if (!t) t = item.memo || item.content || '';
  return t.trim();
};
const countryLabel = (item: any): string => {
  if (item.countries?.length) return `${item.countries[0].flag} ${item.countries[0].name}`;
  return item.country || '';
};

// 카드별 자연스러운 기울기 (id 기반 고정값 → 리렌더에도 흔들리지 않음)
const TILTS = [-2.4, 1.8, -1.2, 2.2, -1.8, 1.2, -2.0, 1.5, -0.8, 2.0, -1.5, 0.9];
const tiltFor = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILTS[Math.abs(h) % TILTS.length];
};

function DiaryMeta({ item, navigation, toggleLike, onMore, showCounts, onLight }: any) {
  const { nickname: globalNickname, handle: globalHandle, profilePhoto: globalProfilePhoto } = useSettings();
  const isMyPost = item.isMyPost || item.user.handle === 'yunjunsung' || item.user.handle === globalHandle;
  const displayName = isMyPost
    ? (globalNickname ? globalNickname : globalHandle)
    : (item.user.name ? item.user.name : item.user.handle);

  return (
    <View style={d.meta}>
      <TouchableOpacity
        style={d.metaUser}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.user.name })}
      >
        <View style={[d.metaAvatar, onLight && d.metaAvatarLight]}>
          {isMyPost && globalProfilePhoto ? (
            <Image source={{ uri: globalProfilePhoto }} style={{ width: 18, height: 18, borderRadius: 9 }} />
          ) : (
            <Text style={{ fontSize: 11 }}>{item.user.emoji}</Text>
          )}
        </View>
        <Text style={[d.metaHandle, onLight && d.metaTextLight]} numberOfLines={1}>{displayName}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={d.metaLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => toggleLike(item.id)}>
        <Text style={[d.heart, item.liked && d.heartOn]}>{item.liked ? '♥' : '♡'}</Text>
        {showCounts && item.likes > 0 && <Text style={[d.metaCount, onLight && d.metaTextLight]}>{item.likes}</Text>}
      </TouchableOpacity>
      <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onMore}>
        <Text style={[d.more, onLight && d.metaTextLight]}>⋯</Text>
      </TouchableOpacity>
    </View>
  );
}

// 한 번 탭 → 상세, 두 번 연속 탭 → 좋아요
function useDoubleTap(onSingle: () => void, onDouble: () => void) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    const now = Date.now();
    if (now - last.current < 260) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      last.current = 0;
      onDouble();
    } else {
      last.current = now;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; onSingle(); }, 260);
    }
  };
}

// 탭 래퍼 + 더블탭 하트 팝 애니메이션
function DiaryTappable({ style, tilt, onSingle, onDouble, onLayout, children }: any) {
  const heart = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pop = () => {
    heart.stopAnimation();
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, useNativeDriver: true, friction: 4, tension: 130 }),
      Animated.timing(heart, { toValue: 0, duration: 220, delay: 420, useNativeDriver: true }),
    ]).start();
  };
  const onPress = useDoubleTap(onSingle, () => { pop(); onDouble(); });
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();

  const cardTransform: any[] = [];
  if (tilt) cardTransform.push({ rotate: `${tilt}deg` });
  cardTransform.push({ scale });

  return (
    <View style={d.tapWrap}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} onLayout={onLayout}>
        <Animated.View style={[style, { transform: cardTransform }]}>
          {children}
        </Animated.View>
      </Pressable>
      <Animated.View
        pointerEvents="none"
        style={[d.heartPop, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.1] }) }] }]}
      >
        <Text style={d.heartIcon}>♥</Text>
      </Animated.View>
    </View>
  );
}

// 네컷 카드 — 컬럼 폭을 측정해 프레임을 라이브 합성
function CutDiaryCard({ item, meta, tilt, onSingle, onDouble }: any) {
  const [w, setW] = useState(0);
  return (
    <DiaryTappable
      style={d.cutCard}
      tilt={tilt}
      onSingle={onSingle}
      onDouble={onDouble}
      onLayout={(e: any) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 && (
        <CutPhotoCanvas
          frameId={item.cutPhoto.frameId}
          photos={item.cutPhoto.photos}
          width={w - 12}
          bgOverride={item.cutPhoto.frameColor}
          capture
        />
      )}
      {meta}
    </DiaryTappable>
  );
}

function DiaryCard({ item, mode, navigation, toggleLike, showCounts, onArchive, onDelete, onBlock, onQuickStart, onQuickMove, onQuickEnd, dragPos, columnIndex }: any) {
  const vt = item.viewType || 'feed';
  const open = () => navigation.navigate('PostDetail', { postId: item.id });
  // 두 번 연속 탭 → 좋아요 (이미 좋아요면 유지)
  const like = () => { if (!item.liked) toggleLike(item.id); };
  const tilt = tiltFor(item.id);
  const isMy = item.isMyPost ?? false;
  const [reportVisible, setReportVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const onMore = () => setMenuVisible(true);

  const handleShare = async () => {
    const text = (item.content || item.memo || '').trim();
    const url = `https://eorth.app/post/${item.id}`;
    try {
      await Share.share({ message: text ? `${text}\n${url}` : url, url });
    } catch (e: any) {
      Alert.alert('공유 실패', String(e?.message ?? e));
    }
  };

  const confirmDelete = () => Alert.alert('정말 삭제할까요?', '되돌릴 수 없어요.', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => onDelete(item.id) },
  ]);

  const menuOptions: { key: string; icon: string; label: string; danger?: boolean; onPress: () => void }[] = isMy
    ? [
        { key: 'share', icon: '↗', label: '공유', onPress: handleShare },
        { key: 'archive', icon: '📦', label: '보관', onPress: () => onArchive(item.id) },
        { key: 'edit', icon: '✏️', label: '편집', onPress: () => navigation.navigate('NewRecord', { editRecord: item }) },
        { key: 'delete', icon: '🗑', label: '삭제', danger: true, onPress: confirmDelete },
      ]
    : [
        { key: 'share', icon: '↗', label: '공유', onPress: handleShare },
        { key: 'block', icon: '⛔', label: '차단', danger: true, onPress: () => onBlock({ name: item.user.name, emoji: item.user.emoji }) },
        { key: 'report', icon: '🚨', label: '신고', danger: true, onPress: () => setReportVisible(true) },
      ];

  const meta = mode === 'full'
    ? <DiaryMeta item={item} navigation={navigation} toggleLike={toggleLike} onMore={onMore} showCounts={showCounts} onLight={vt === 'feed'} />
    : null;

  const cardRef = useRef<View>(null);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(250)
    .onStart((e: any) => {
      cardRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        let correctedX = x;
        let correctedY = y;
        let correctedW = w;
        let correctedH = h;

        if (correctedW <= 0) correctedW = (SCREEN_W_SOCIAL - 48 - 10) / 2;
        if (correctedH <= 0) correctedH = 220;

        if (correctedX <= 0 || correctedX > SCREEN_W_SOCIAL) {
          correctedX = columnIndex === 0 ? 24 : 24 + correctedW + 10;
        }

        if (correctedY <= 0 || correctedY > e.absoluteY || (correctedY + correctedH) < e.absoluteY) {
          correctedY = e.absoluteY - correctedH / 2;
        }

        onQuickStart(item, { x: correctedX, y: correctedY, w: correctedW, h: correctedH } as CardRect);
        dragPos.setValue({ x: e.absoluteX, y: e.absoluteY });
      });
    })
    .onUpdate((e: any) => {
      dragPos.setValue({ x: e.absoluteX, y: e.absoluteY });
      onQuickMove(e.absoluteX, e.absoluteY);
    })
    .onEnd((e: any) => {
      onQuickEnd(e.absoluteX, e.absoluteY);
    });

  const card = (() => {
  // 네컷 → 프레임 합성 라이브 렌더 (CutPhotoCanvas)
  if (vt === 'cut') {
    if (item.cutPhoto?.photos) {
      return <CutDiaryCard item={item} meta={meta} tilt={tilt} onSingle={open} onDouble={like} />;
    }
    const uri = firstPhoto(item);
    const aspect = (item.cutPhoto?.layout && (CUT_LAYOUTS as any)[item.cutPhoto.layout]?.aspect) || 0.7;
    return (
      <DiaryTappable style={d.cutCard} tilt={tilt} onSingle={open} onDouble={like}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', aspectRatio: aspect, borderRadius: 3 }} resizeMode="cover" /> : null}
        {meta}
      </DiaryTappable>
    );
  }

  // 블로그 / 앨범
  if (vt === 'blog' || vt === 'album') {
    const photo = firstPhoto(item);
    const title = (item.content || '').trim();
    const excerpt = blogExcerpt(item);
    if (photo) {
      return (
        <DiaryTappable style={d.scrap} tilt={tilt} onSingle={open} onDouble={like}>
          <View style={d.tape} />
          <Image source={{ uri: photo }} style={d.scrapImg} resizeMode="cover" />
          {!!title && <Text style={[d.scrapTitle, { fontFamily: SERIF }]} numberOfLines={2}>{title}</Text>}
          {!!excerpt && <Text style={d.scrapExcerpt} numberOfLines={3}>{excerpt}</Text>}
          {meta}
        </DiaryTappable>
      );
    }
    return (
      <DiaryTappable style={d.jour} tilt={tilt} onSingle={open} onDouble={like}>
        {!!countryLabel(item) && <Text style={d.jourLoc}>📍 {countryLabel(item)}</Text>}
        {!!title && <Text style={[d.jourTitle, { fontFamily: SERIF }]} numberOfLines={2}>{title}</Text>}
        {!!excerpt && <Text style={d.jourBody} numberOfLines={7}>{excerpt}</Text>}
        <Text style={d.jourDate}>{timeAgo(item.timestamp)}</Text>
        {meta}
      </DiaryTappable>
    );
  }

  // 피드 → 폴라로이드
  const photo = firstPhoto(item);
  const caption = (item.content || item.memo || '').trim();
  return (
    <DiaryTappable style={d.pola} tilt={tilt} onSingle={open} onDouble={like}>
      {photo ? <Image source={{ uri: photo }} style={d.polaImg} resizeMode="cover" /> : <View style={[d.polaImg, d.polaEmpty]} />}
      {!!caption && <Text style={[d.polaCap, { fontFamily: SERIF }]} numberOfLines={2}>{caption}</Text>}
      {meta}
    </DiaryTappable>
  );
  })();

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <View ref={cardRef} collapsable={false}>{card}</View>
      </GestureDetector>
      <Modal visible={menuVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMenuVisible(false)} />
          <View style={ss.sheet}>
            <View style={ss.handle} />
            <View style={{ paddingTop: 4, paddingBottom: 8 }}>
              {menuOptions.map((opt, i) => (
                <View key={opt.key}>
                  {i > 0 && <View style={[s.menuDivider, { marginHorizontal: 16 }]} />}
                  <TouchableOpacity
                    style={[s.menuItem, { height: 54 }]}
                    activeOpacity={0.7}
                    onPress={() => { setMenuVisible(false); setTimeout(opt.onPress, 280); }}
                  >
                    <Text style={[s.menuItemIcon, { fontSize: 18, width: 24, textAlign: 'center' }]}>{opt.icon}</Text>
                    <Text style={[s.menuItemText, { fontSize: 15 }, opt.danger && s.menuItemDanger]}>{opt.label}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity style={ss.cancelCard} activeOpacity={0.7} onPress={() => setMenuVisible(false)}>
              <Text style={ss.cancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={() => setReportVisible(false)}
      />
    </>
  );
}

// 높이 추정 (2단 균형 분배용)
const estDiaryHeight = (item: any, mode: string): number => {
  const vt = item.viewType || 'feed';
  let h = 200;
  if (vt === 'cut') {
    const a = (item.cutPhoto?.layout && (CUT_LAYOUTS as any)[item.cutPhoto.layout]?.aspect) || 0.7;
    h = 30 + 165 / a;
  } else if (vt === 'blog' || vt === 'album') {
    h = firstPhoto(item) ? 240 : 200;
  } else {
    h = 210;
  }
  return h + (mode === 'full' ? 34 : 0);
};

const d = StyleSheet.create({
  masonry: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 12 },

  // 더블탭 하트 팝
  tapWrap: { position: 'relative' },
  heartPop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heartIcon: { fontSize: 68, color: 'rgba(255,255,255,0.95)', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },

  // 폴라로이드 (피드)
  pola: { 
    backgroundColor: 'rgba(26,10,46,0.5)', 
    borderRadius: 8, 
    padding: 10, 
    paddingBottom: 8, 
    borderWidth: 1, 
    borderColor: 'rgba(191,133,252,0.15)',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 
  },
  polaImg: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: '#2A2735' },
  polaEmpty: { backgroundColor: '#1A0A2E' },
  polaCap: { color: '#FFFFFF', fontSize: 12, textAlign: 'center', paddingTop: 8, paddingBottom: 2 },

  // 스크랩 카드 (블로그/앨범 + 사진)
  scrap: { 
    backgroundColor: 'rgba(26,10,46,0.5)', 
    borderWidth: 1, 
    borderColor: 'rgba(191,133,252,0.15)', 
    borderRadius: 8, 
    padding: 10 
  },
  tape: { position: 'absolute', top: -8, left: 18, width: 42, height: 16, backgroundColor: 'rgba(191,133,252,0.30)', transform: [{ rotate: '-6deg' }], borderRadius: 1 },
  scrapImg: { width: '100%', aspectRatio: 1.3, borderRadius: 4, backgroundColor: '#2A2735', marginBottom: 8 },
  scrapTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 17 },
  scrapExcerpt: { color: '#9A95A5', fontSize: 11, lineHeight: 16, marginTop: 5 },

  // 저널 (텍스트 블로그)
  jour: { 
    backgroundColor: 'rgba(26,10,46,0.5)', 
    borderWidth: 1, 
    borderColor: 'rgba(191,133,252,0.15)', 
    borderRadius: 8, 
    padding: 12 
  },
  jourLoc: { color: '#BF85FC', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  jourTitle: { color: '#BF85FC', fontSize: 15, marginBottom: 6 },
  jourBody: { color: '#B8B3C2', fontSize: 11, lineHeight: 17 },
  jourDate: { color: '#5A5A6A', fontSize: 9, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(191,133,252,0.15)', paddingTop: 6 },

  // 네컷
  cutCard: { 
    backgroundColor: 'rgba(26,10,46,0.55)', 
    borderRadius: 8, 
    padding: 6, 
    borderWidth: 1, 
    borderColor: 'rgba(191,133,252,0.15)' 
  },

  // 상호작용 푸터
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaUser: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 },
  metaAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#3A2A5E', alignItems: 'center', justifyContent: 'center' },
  metaAvatarLight: { backgroundColor: '#ddd6c6' },
  metaHandle: { color: '#9A95A5', fontSize: 10, flexShrink: 1 },
  metaTextLight: { color: '#8a7f6c' },
  metaLike: { flexDirection: 'row', alignItems: 'center' },
  heart: { color: '#7A7A8A', fontSize: 13 },
  heartOn: { color: '#FF6B9D' },
  metaCount: { color: '#9A95A5', fontSize: 10, marginLeft: 3 },
  more: { color: '#6A6A7A', fontSize: 14, paddingLeft: 4 },
});

function ImmersiveCard({ children, index }: { children: React.ReactNode; index: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

function FriendsTab({ navigation }: { navigation: any }) {
  const { records, toggleLike, blockedUsers, blockUser, deleteRecord, archivedIds, archiveRecord } = useRecords();
  const { diaryCardMode, showCounts, nickname: globalNickname, handle: globalHandle, profilePhoto: globalProfilePhoto } = useSettings();
  
  const getPostDisplayName = (postUser: any, isMy: boolean) => {
    if (isMy) {
      return globalNickname ? globalNickname : globalHandle;
    }
    return postUser.name ? postUser.name : postUser.handle;
  };
  
  const { sendRecord, topFriends, friends } = useDM();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // ── 빠른공유 드래그 상태 ──
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [quick, setQuick] = useState<{ active: boolean; item: any; cardRect: CardRect | null; side: 'left' | 'right' }>({ active: false, item: null, cardRect: null, side: 'right' });
  const [quickHover, setQuickHover] = useState<string | null>(null);
  const quickTargets = useRef<TargetRect[]>([]);
  const [quickToast, setQuickToast] = useState('');
  const [quickToastVisible, setQuickToastVisible] = useState(false);
  const quickToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [otherPickerItem, setOtherPickerItem] = useState<any>(null);
  const top3 = topFriends(3);

  const showQuickToast = (msg: string) => {
    if (quickToastTimer.current) clearTimeout(quickToastTimer.current);
    setQuickToast(msg); setQuickToastVisible(true);
    quickToastTimer.current = setTimeout(() => setQuickToastVisible(false), 1800);
  };

  const handleQuickStart = (item: any, cardRect: CardRect) => {
    const side: 'left' | 'right' = cardRect.x < SCREEN_W_SOCIAL / 2 ? 'right' : 'left';
    quickTargets.current = [];
    setQuick({ active: true, item, cardRect, side });
    setQuickHover(null);
  };
  const handleQuickMove = (px: number, py: number) => {
    setQuickHover(hitTestTarget(px, py, quickTargets.current));
  };
  const handleQuickEnd = (px: number, py: number) => {
    const key = hitTestTarget(px, py, quickTargets.current);
    const item = quick.item;
    setQuick({ active: false, item: null, cardRect: null, side: 'right' });
    setQuickHover(null);
    if (!key || !item) return;
    if (key === 'other') {
      setOtherPickerItem(item);
      return;
    }
    const friend = top3.find((f) => f.handle === key);
    if (friend) {
      sendRecord(friend.handle, item);
      showQuickToast(`${friend.name}님에게 전송됨`);
    }
  };
  const onQuickTargetLayout = (key: string, rect: { x: number; y: number; w: number; h: number }) => {
    const others = quickTargets.current.filter((t) => t.key !== key);
    quickTargets.current = [...others, { key, ...rect }];
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message: msg });
    toastTimer.current = setTimeout(() => setToast({ visible: false, message: '' }), 2500);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleArchive = (id: string) => {
    archiveRecord(id);
    showToast('게시물이 보관되었어요');
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
    showToast('게시물이 삭제되었어요');
  };

  const blockedNames = blockedUsers.map((b) => b.name);
  const allVisible = records.filter(
    (r) =>
      (r.visibility === 'friends' || r.visibility === 'public') &&
      !blockedNames.includes(r.user.name) &&
      !archivedIds.includes(r.id)
  );

  // viewType별 분류
  const feedItems = allVisible.filter(r => !r.viewType || r.viewType === 'feed');
  const blogItems = allVisible.filter(r => r.viewType === 'blog');
  const albumItems = allVisible.filter(r => r.viewType === 'album');
  const cutItems = allVisible.filter(r => r.viewType === 'cut');
  const snapItems = useMemo(() => {
    const snaps = allVisible.filter(r => r.viewType === 'snap');
    const seen = new Set<string>();
    return snaps.reduce<any[]>((acc, snap) => {
      // 같은 사용자라도 다른 나라면 별도 스토리로 인식
      const key = `${snap.user.handle}::${snap.countryName || snap.snapDetectedCountry || ''}`;
      if (seen.has(key)) {
        // 같은 작성자+같은 나라의 추가 스냅: 안 본 게 있으면 대표 항목에 반영
        const rep = acc.find((s: any) =>
          s.user.handle === snap.user.handle &&
          (s.countryName || s.snapDetectedCountry || '') === (snap.countryName || snap.snapDetectedCountry || '')
        );
        if (rep && !snap.snapViewed) rep._hasUnviewed = true;
        return acc;
      }
      seen.add(key);
      acc.push({ ...snap, _hasUnviewed: !snap.snapViewed });
      return acc;
    }, []);
  }, [allVisible]);
  // 피드·블로그·앨범·네컷을 시간순으로 섞어 2단 매거진으로 배치 (스냅은 상단 스토리 라인)
  const timelineItems = [...feedItems, ...blogItems, ...albumItems, ...cutItems]
    .sort((a, b) => b.timestamp - a.timestamp);

  // 높이 추정 기반 2단 균형 분배
  const columns = useMemo(() => {
    const cols: any[][] = [[], []];
    const h = [0, 0];
    timelineItems.forEach((item) => {
      const c = h[0] <= h[1] ? 0 : 1;
      cols[c].push(item);
      h[c] += estDiaryHeight(item, diaryCardMode);
    });
    return cols;
  }, [timelineItems, diaryCardMode]);

  // 헤더 패럴랙스 (몰입형 스크롤링)
  const headerScale = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.92],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: () => { if (activeMenuId !== null) setActiveMenuId(null); },
          }
        )}
        scrollEventThrottle={16}
      >
        {/* 스냅 스토리 라인 (인스타 스토리 스타일) */}
        {snapItems.length > 0 && (
          <View style={s.storySection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storyScroll}>
              {snapItems.map(snap => (
                <TouchableOpacity
                  key={snap.id}
                  style={s.storyItem}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('PostDetail', { postId: snap.id })}
                >
                  <LinearGradient
                    colors={snap._hasUnviewed ? ['#22D3EE', '#A855F7', '#D946EF'] : ['#3A3A4A', '#3A3A4A']}
                    style={s.storyRing}
                  >
                    <View style={s.storyAvatarWrap}>
                      <View style={s.storyAvatar}>
                        {(snap.isMyPost || snap.user.handle === 'yunjunsung' || snap.user.handle === globalHandle) && globalProfilePhoto ? (
                          <Image source={{ uri: globalProfilePhoto }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                        ) : (
                          <Text style={s.storyAvatarEmoji}>{snap.user.emoji}</Text>
                        )}
                      </View>
                    </View>
                  </LinearGradient>
                  <Text style={s.storyName} numberOfLines={1}>
                    {snap.countryFlag ? `${snap.countryFlag} ` : ''}
                    {getPostDisplayName(snap.user, snap.isMyPost || snap.user.handle === 'yunjunsung' || snap.user.handle === globalHandle)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 여행 다이어리 — 피드·블로그·앨범·네컷 2단 매거진 배치 */}
        <View style={s.friendsScroll}>
          {allVisible.length === 0 && (
            <Text style={s.emptyText}>아직 공유된 기록이 없어요</Text>
          )}
          <View style={d.masonry}>
            {[0, 1].map((ci) => (
              <View key={ci} style={d.col}>
                {columns[ci].map((item: any) => (
                  <DiaryCard
                    key={item.id}
                    item={item}
                    mode={diaryCardMode}
                    navigation={navigation}
                    toggleLike={toggleLike}
                    showCounts={showCounts}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onBlock={blockUser}
                    onQuickStart={handleQuickStart}
                    onQuickMove={handleQuickMove}
                    onQuickEnd={handleQuickEnd}
                    dragPos={dragPos}
                    columnIndex={ci}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={{ height: 100 }} />
        </View>
      </Animated.ScrollView>
      <Toast message={toast.message} visible={toast.visible} />
      <QuickShareOverlay
        visible={quick.active}
        record={quick.item ? buildSharedRecord(quick.item) : null}
        cardRect={quick.cardRect}
        side={quick.side}
        pos={dragPos}
        friends={top3}
        hoveredKey={quickHover}
        onTargetLayout={onQuickTargetLayout}
        onCancel={() => { setQuick({ active: false, item: null, cardRect: null, side: 'right' }); setQuickHover(null); }}
      />
      <Toast visible={quickToastVisible} message={quickToast} />
      {/* 기타 피커 */}
      <Modal visible={!!otherPickerItem} transparent animationType="slide" onRequestClose={() => setOtherPickerItem(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOtherPickerItem(null)} />
          <View style={ss.sheet}>
            <View style={ss.handle} />
            <Text style={ss.sheetTitle}>보낼 친구 선택</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {friends.map((f) => (
                <TouchableOpacity
                  key={f.handle}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const it = otherPickerItem;
                    setOtherPickerItem(null);
                    if (it) { sendRecord(f.handle, it); showQuickToast(`${f.name}님에게 전송됨`); }
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{f.emoji}</Text>
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────
export default function SocialScreen({ navigation }: TabScreenProps<'SocialTab'>) {
  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>소셜</Text>
        <TouchableOpacity
          style={s.addFriendBtn}
          onPress={() => navigation.navigate('Friends')}
          accessibilityLabel="디엠"
        >
          <ChatIcon size={20} color={C.accent} />
        </TouchableOpacity>
      </View>

      <FriendsTab navigation={navigation} />
    </View>
  );
}

// ── Grain Blur가 필요한 곳에 import
// (SocialScreen의 카드들은 이미 반투명 배경으로 글래스 효과 적용됨)

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 헤더
  header: {
    paddingTop: 56,
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.bold,
    color: C.white,
  },
  addFriendBtn: {
    backgroundColor: 'rgba(191,133,252,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
    padding: 8,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.accent,
  },

  // 스냅 스토리 라인
  storySection: {
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  storyScroll: {
    paddingHorizontal: 12,
    gap: 14,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(46,46,59,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarEmoji: {
    fontSize: 24,
  },
  storyName: {
    color: '#A1A1B0',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    width: 68,
  },
  storyLiveDot: {
    position: 'absolute',
    top: 2,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#0A0A0F',
  },

  // 친구 피드
  friendsScroll: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
  },
  feedCard: {
    backgroundColor: 'rgba(26,10,46,0.5)',
    borderRadius: BorderRadius['2xl'],
    marginBottom: Spacing[4],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  feedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(191,133,252,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  userInfo: { flex: 1 },
  userName: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.white,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: 2,
  },
  countryTag: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: C.accent,
    backgroundColor: C.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dateMeta: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: C.dim,
  },
  moreIcon: {
    color: C.dim,
    fontSize: 18,
    letterSpacing: 2,
  },
  dropdownMenu: {
    backgroundColor: '#2E2E3B',
    borderRadius: 12,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  myDropdownMenu: {
    backgroundColor: '#2E2E3B',
    borderRadius: 12,
    width: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 14,
    overflow: 'hidden',
  },
  myMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    gap: 10,
  },
  myMenuDivider: {
    height: 1,
    backgroundColor: '#3A3A4A',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    gap: 10,
  },
  menuItemIcon: {
    fontSize: 16,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.white,
  },
  menuItemDanger: {
    color: '#FF3B30',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#3A3A4A',
  },
  photoPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing[4],
  },
  content: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: C.white,
    lineHeight: 20,
    marginBottom: Spacing[4],
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing[5],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    fontSize: 22,
    color: C.dim,
  },
  actionCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: C.dim,
  },

  // 토스트
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,30,46,0.96)',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  // 빈 상태
  emptyText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: C.dim,
    textAlign: 'center',
    marginTop: Spacing[8],
  },
});

// ─────────────────────────────────────────────
// 댓글 바텀시트 스타일
// ─────────────────────────────────────────────
const cs = StyleSheet.create({
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4A4A59',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    color: '#A1A1B0',
    fontSize: 18,
  },
  commentList: {
    paddingHorizontal: 20,
    maxHeight: 300,
  },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    gap: 12,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191,133,252,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: '#BF85FC',
    fontSize: 14,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
    gap: 2,
  },
  commentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentBody: {
    fontSize: 14,
    color: '#A1A1B0',
  },
  commentTime: {
    fontSize: 11,
    color: '#4A4A59',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#2E2E3B',
  },
  myAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191,133,252,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myAvatarText: {
    color: '#BF85FC',
    fontSize: 13,
    fontWeight: '700',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E2E3B',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

// ─────────────────────────────────────────────
// 공유 바텀시트 스타일
// ─────────────────────────────────────────────
const ss = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(20,20,35,0.75)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4A4A59',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionItem: {
    alignItems: 'center',
    gap: 8,
    minWidth: 64,
  },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIcon: {
    fontSize: 24,
  },
  optionLabel: {
    fontSize: 11,
    color: '#A1A1B0',
    textAlign: 'center',
    lineHeight: 15,
  },
  cancelCard: {
    marginHorizontal: 16,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#A1A1B0',
  },
  // 서비스 준비 중 모달
  prepareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  prepareCard: {
    backgroundColor: 'rgba(20,20,35,0.7)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  prepareEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  prepareTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  prepareDesc: {
    fontSize: 14,
    color: '#A1A1B0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  prepareBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  prepareBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 친구 선택 모달
  friendPickerCard: {
    backgroundColor: 'rgba(20,20,32,0.7)',
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    width: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  friendPickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  friendAvatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  friendAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarEmoji: { fontSize: 20 },
  friendOnline: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#1A1A26',
  },
  friendName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  friendHandle: {
    fontSize: 11,
    color: '#A1A1B0',
    marginTop: 1,
  },
  friendSendIcon: {
    fontSize: 18,
    color: '#BF85FC',
    fontWeight: '700',
  },
  friendCancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  friendCancelText: {
    fontSize: 14,
    color: '#A1A1B0',
  },
});
