import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ImageBackground,
  Animated,
  Pressable,
  Share,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import QuickShareOverlay, { type CardRect } from '../components/QuickShareOverlay';
import { useDM } from '../store/dmStore';
import { hitTestTarget, buildSharedRecord, type TargetRect } from '../store/dmShareLogic';
import * as Haptics from 'expo-haptics';
import { setTabBarHidden } from '../components/tabBarVisibility';
import { requestOpenRecordFab } from '../components/recordFabState';
import { LinearGradient } from 'expo-linear-gradient';
import { CommentIcon as CommentSvgIcon, ShareIcon as ShareSvgIcon, TrashIcon, GalleryIcon, PersonIcon } from '../components/icons';
import { Typography, Spacing, BorderRadius } from '../constants';
import { useRecords } from '../store/recordStore';
import type { TabScreenProps } from '../navigation/types';
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import { andFitText } from '../utils/fitText';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { CUT_LAYOUTS, getCutFrame } from '../constants/cutFrames';
import { SNS_SHARE_ENABLED, FEED_ADS_ENABLED } from '../constants/featureFlags';
import { getHouseAd, type HouseAd } from '../constants/houseAds';
import { fetchFriendSuggestions, type FriendSuggestion } from '../services/social';
import { isSupabaseConfigured } from '../services/supabase';
import { handleFontStyle } from '../constants/handleFonts';
import { countryEnglishName } from '../constants/countries';
import StarFieldBackground from '../components/StarFieldBackground';
import FeedAdCard, { type FeedAdVariant } from '../components/ads/FeedAdCard';
import CutPhotoCanvas from '../components/CutPhotoCanvas';
import { useSkinAccent } from '../constants/skinTheme';
import BlogPin from '../components/BlogPin';
import FeedTape from '../components/FeedTape';
import AuthorAvatar from '../components/AuthorAvatar';

const APP_LOGO = require('../../assets/icon.png');
import { blocksToPlainText } from '../types/blogBlocks';
import * as Clipboard from 'expo-clipboard';
import { handleBlock as confirmBlock, handleReport as openReport } from '../utils/reportAndBlock';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';
import FeatureShowcaseCard from '../components/social/FeatureShowcaseCard';
import { EXAMPLE_FEED_RECORD, EXAMPLE_SNAP } from '../constants/exampleContent';

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
// 댓글 — recordStore.commentsByPost 공유 (게시물별 저장, PostDetail과 동기화)
// ─────────────────────────────────────────────
type SheetComment = { id: string; name: string; text: string; time?: string; createdAt: number; photo?: string };
const sheetCommentTime = (c: SheetComment) => c.time ?? timeAgo(c.createdAt);

// ─────────────────────────────────────────────
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
  const { t } = useTranslation();
  const [prepareVisible, setPrepareVisible] = useState(false);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const { neighbors } = useRecords();
  // 공유 대상은 실제 팔로우한 친구에서 가져온다 (데모 친구 제거) — 프로필 이모지·사진 반영
  const shareFriends = neighbors.map((f) => ({
    id: f.id, name: f.username, handle: f.username, emoji: f.emoji || '🧳', photo: f.photo, online: false,
  }));

  const handleSNS = () => {
    // 테스트/베타 빌드에서는 외부 SNS 공유를 막고 '준비 중'만 안내한다.
    if (!SNS_SHARE_ENABLED) {
      setPrepareVisible(true);
      return;
    }
    // 프로덕션: OS 공유 시트로 인스타그램·틱톡 등 외부 앱 공유
    Share.share({ message: 'https://eorth.app/post/share' }).catch(() => {});
    onClose();
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync('https://eorth.app/post/share');
    onClose();
    onLinkCopied();
  };

  const handleFriendSend = () => {
    setFriendPickerVisible(true);
  };

  const handleSelectFriend = (friend: typeof shareFriends[0]) => {
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
    { key: 'friends', icon: '👥', label: t('social.friendsSend'), onPress: handleFriendSend },
    { key: 'instagram', icon: '📷', label: t('social.instagram'), onPress: handleSNS },
    { key: 'tiktok', icon: '🎵', label: t('social.tiktok'), onPress: handleSNS },
    { key: 'link', icon: '🔗', label: t('social.copyLink'), onPress: handleCopyLink },
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
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} accessibilityViewIsModal>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => {
          if (!prepareVisible && !friendPickerVisible) onClose();
        }} />

        {/* 바텀시트 */}
        <View style={ss.sheet}>
          {/* 핸들 바 */}
          <View style={ss.handle} />

          {/* 타이틀 */}
          <Text style={ss.sheetTitle}>{t('social.shareTitle')}</Text>

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
            <Text style={ss.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>

        {/* 서비스 준비 중 — View 오버레이 (Modal 아님) */}
        {prepareVisible && (
          <View style={[StyleSheet.absoluteFill, ss.prepareOverlay]}>
            <View style={ss.prepareCard}>
              <Text style={ss.prepareEmoji}>🚧</Text>
              <Text style={ss.prepareTitle}>{t('social.prepareTitle')}</Text>
              <Text style={ss.prepareDesc}>{t('social.prepareDesc')}</Text>
              <TouchableOpacity style={ss.prepareBtn} onPress={() => setPrepareVisible(false)} activeOpacity={0.85}>
                <Text style={ss.prepareBtnText}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 친구 선택 — View 오버레이 (Modal 아님) */}
        {friendPickerVisible && (
          <View style={[StyleSheet.absoluteFill, ss.prepareOverlay]}>
            <View style={ss.friendPickerCard}>
              <Text style={ss.friendPickerTitle}>{t('social.friendPickerTitle')}</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                {shareFriends.length === 0 ? (
                  <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 28 }}>
                    {t('social.noFollowedFriends')}
                  </Text>
                ) : shareFriends.map(f => (
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
                <Text style={ss.friendCancelText}>{t('common.cancel')}</Text>
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
  comments: SheetComment[];
  onSend: () => void;
  commentText: string;
  setCommentText: (t: string) => void;
}) {
  const { t } = useTranslation();
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
              <Text style={cs.sheetTitle}>{t('social.comments')}</Text>
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
                      {c.photo ? (
                        <Image source={{ uri: c.photo }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                      ) : (
                        <Text style={cs.commentAvatarText}>{c.name.charAt(0)}</Text>
                      )}
                    </View>
                    <View style={cs.commentContent}>
                      <Text style={cs.commentName}>{c.name}</Text>
                      <Text style={cs.commentBody}>{c.text}</Text>
                      <Text style={cs.commentTime}>{sheetCommentTime(c)}</Text>
                    </View>
                  </View>
                  {idx < comments.length - 1 && <View style={cs.divider} />}
                </View>
              ))}
            </ScrollView>

            {/* 입력창 */}
            <View style={cs.inputRow}>
              <View style={cs.myAvatar}>
                <Text style={cs.myAvatarText}>{t('social.me')}</Text>
              </View>
              <View style={cs.inputWrap}>
                <TextInput
                  style={cs.input}
                  placeholder={t('social.commentPlaceholder')}
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

// 게시물 작성자 아이디 폰트(프리미엄) — 내 글은 내 설정값(구독 중일 때만),
// 타인 글은 서버(profiles.handle_font)에서 온 item.user.font 로 렌더한다.
function usePostNameFont(item: any) {
  const { handle, handleFont, isPremium } = useSettings();
  const isMine = item?.isMyPost || item?.user?.handle === handle;
  return handleFontStyle(isMine ? (isPremium ? handleFont : null) : item?.user?.font);
}

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
  onBlock: (user: { name: string; emoji: string; handle?: string; id?: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const { showCounts } = useSettings();
  const nameFontStyle = usePostNameFont(item);
  const menuBtnRef = useRef<View>(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const [commentActive, setCommentActive] = useState(false);
  const [shareActive, setShareActive] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const { records, commentsByPost, addComment } = useRecords();
  const comments = commentsByPost[item.id] ?? [];
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
    navigation.navigate('NewRecord', { editRecord: records.find((r) => r.id === item.id) ?? item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      t('social.deleteConfirmTitle'),
      t('social.deleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('social.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <View style={s.feedCard}>
      {/* 카드 헤더 */}
      <View style={s.cardHeader}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle })}
          activeOpacity={0.7}
        >
          <View style={s.feedAvatar}>
            <AuthorAvatar photo={item.user.photo} emoji={item.user.emoji} size={44} emojiSize={22} isExample={item.isExample} />
          </View>
        </TouchableOpacity>
        <View style={s.userInfo}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle })}
            activeOpacity={0.7}
          >
            <Text style={[s.userName, nameFontStyle]}>{item.user.handle}</Text>
          </TouchableOpacity>
          <View style={s.metaRow}>
            {item.countries && item.countries.length > 0
              ? item.countries.length <= 3
                ? item.countries.map((c: { flag: string; name: string }, idx: number) => (
                    <Text key={idx} style={s.countryTag} {...andFitText}>{c.flag} {c.name}</Text>
                  ))
                : <>
                    <Text style={s.countryTag} {...andFitText}>{item.countries[0].flag} {item.countries[0].name}</Text>
                    <Text style={s.countryTag} {...andFitText}>+{item.countries.length - 1}</Text>
                  </>
              : <Text style={s.countryTag} {...andFitText}>{item.country}</Text>
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
                  <Text style={s.menuItemText}>{t('social.share')}</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>📦</Text>
                  <Text style={s.menuItemText}>{t('social.archive')}</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>✏️</Text>
                  <Text style={s.menuItemText}>{t('social.edit')}</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.delete')}</Text>
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
                  <Text style={s.menuItemText}>{t('social.share')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => {
                    onOpenMenu(null);
                    confirmBlock(item.user.name, () => {
                      onBlock({ ...item.user, id: item.authorId });
                      showMenuToast(t('social.blockedToast'));
                    }, t);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>⛔</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.block')}</Text>
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
                  <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.report')}</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </View>
        )}
      </View>

      {/* 사진 영역 */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined })}>
        <LinearGradient colors={['#1A0A2E', '#3B1E8E']} style={s.photoPlaceholder}>
          <Text style={{ fontSize: 48, opacity: 0.4 }}>🌄</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* 본문 */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined })}>
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
          <Text style={s.toastText}>{t('social.linkCopiedToast')}</Text>
        </View>
      )}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          showMenuToast(t('social.reportReceivedToast'));
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
            addComment(item.id, commentText.trim());
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
  const { commentsByPost, addComment } = useRecords();
  const comments = commentsByPost[item.id] ?? [];
  const [commentText, setCommentText] = useState('');
  const nameFontStyle = usePostNameFont(item);

  // 촬영 지연
  const lateText = (() => {
    if (!item.snapLateSeconds || item.snapLateSeconds <= 0) return null;
    const s = item.snapLateSeconds;
    if (s < 60) return `${s}초 후 촬영`;
    return `${Math.floor(s / 60)}분 ${s % 60}초 후 촬영`;
  })();

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined })}>
      <View style={sc.card}>
        {/* 헤더 */}
        <View style={sc.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} activeOpacity={0.7}
          >
            <View style={sc.avatar}>
              <Text style={{ fontSize: 14 }}>⚡</Text>
            </View>
            <View>
              <Text style={[sc.userName, nameFontStyle]}>{item.user.handle}</Text>
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
            addComment(item.id, commentText.trim());
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
  onBlock: (user: { name: string; emoji: string; handle?: string; id?: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const { showCounts } = useSettings();
  const nameFontStyle = usePostNameFont(item);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const { records, commentsByPost, addComment } = useRecords();
  const comments = commentsByPost[item.id] ?? [];
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
    navigation.navigate('NewRecord', { editRecord: records.find((r) => r.id === item.id) ?? item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      t('social.deleteConfirmTitle'),
      t('social.deleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('social.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined })}>
      <View style={bc.card}>
        {/* 블로그 헤더 */}
        <View style={bc.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }} activeOpacity={0.7}
          >
            <View style={bc.avatar}>
              <AuthorAvatar photo={item.user.photo} emoji={item.user.emoji} size={32} emojiSize={14} isExample={item.isExample} />
            </View>
            <View>
              <Text style={[bc.userName, nameFontStyle]}>{item.user.handle}</Text>
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
                    <Text style={s.menuItemText}>{t('social.archive')}</Text>
                  </TouchableOpacity>
                  <View style={s.myMenuDivider} />
                  <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                    <Text style={s.menuItemIcon}>✏️</Text>
                    <Text style={s.menuItemText}>{t('social.modify')}</Text>
                  </TouchableOpacity>
                  <View style={s.myMenuDivider} />
                  <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                    <TrashIcon size={16} color="#FF3B30" />
                    <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.delete')}</Text>
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
                      confirmBlock(item.user.name, () => {
                        onBlock({ ...item.user, id: item.authorId });
                        showMenuToast(t('social.blockedToast'));
                      }, t);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.menuItemIcon}>⛔</Text>
                    <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.blockLong')}</Text>
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
                    <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.reportLong')}</Text>
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
                <Text style={bc.countryTagText} {...andFitText}>{c.flag} {c.name}</Text>
              </View>
            ))
          ) : (
            <View style={bc.countryTag}>
              <Text style={bc.countryTagText} {...andFitText}>{item.countryFlag} {item.countryName}</Text>
            </View>
          )}
          {item.countries && item.countries.length > 3 && (
            <View style={bc.countryTag}>
              <Text style={bc.countryTagText} {...andFitText}>+{item.countries.length - 3}</Text>
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
            addComment(item.id, commentText.trim());
            setCommentText('');
          }
        }}
      />
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={() => {
          setReportVisible(false);
          showMenuToast(t('social.reportReceivedToast'));
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
  onBlock: (user: { name: string; emoji: string; handle?: string; id?: string }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  navigation: any;
  activeMenuId: string | null;
  onOpenMenu: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const { showCounts } = useSettings();
  const nameFontStyle = usePostNameFont(item);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const { records, commentsByPost, addComment } = useRecords();
  const comments = commentsByPost[item.id] ?? [];
  const [commentText, setCommentText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [menuToastMsg, setMenuToastMsg] = useState('');
  const [menuToastVisible, setMenuToastVisible] = useState(false);
  const menuToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuBtnRef = useRef<View>(null);
  const [dropdownTop, setDropdownTop] = useState(0);
  const medias: string[] = item.medias || [];
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
    navigation.navigate('NewRecord', { editRecord: records.find((r) => r.id === item.id) ?? item });
  };

  const handleDeletePress = () => {
    onOpenMenu(null);
    Alert.alert(
      t('social.deleteConfirmTitle'),
      t('social.deleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('social.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined })}>
    <View style={ab.card}>
      {/* 헤더 */}
      <View style={ab.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle })}
          style={ab.userRow} activeOpacity={0.7}
        >
          <View style={ab.avatar}>
            <AuthorAvatar photo={item.user.photo} emoji={item.user.emoji} size={38} emojiSize={18} isExample={item.isExample} />
          </View>
          <View>
            <Text style={[ab.userName, nameFontStyle]}>{item.user.handle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {item.countries && (
                item.countries.length <= 3
                  ? item.countries.map((c: any, i: number) => (
                      <Text key={i} style={ab.countryTag} {...andFitText}>{c.flag} {c.name}</Text>
                    ))
                  : <>
                      <Text style={ab.countryTag} {...andFitText}>{item.countries[0].flag} {item.countries[0].name}</Text>
                      <Text style={ab.countryTag} {...andFitText}>+{item.countries.length - 1}</Text>
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
                  <Text style={s.menuItemText}>{t('social.archive')}</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleEdit} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>✏️</Text>
                  <Text style={s.menuItemText}>{t('social.modify')}</Text>
                </TouchableOpacity>
                <View style={s.myMenuDivider} />
                <TouchableOpacity style={s.myMenuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.delete')}</Text>
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
                    confirmBlock(item.user.name, () => {
                      onBlock({ ...item.user, id: item.authorId });
                      showMenuToast(t('social.blockedToast'));
                    }, t);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.menuItemIcon}>⛔</Text>
                  <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.blockLong')}</Text>
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
                  <Text style={[s.menuItemText, s.menuItemDanger]}>{t('social.reportLong')}</Text>
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
          <Text style={ab.noMediaText}>{t('social.album')}</Text>
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
          addComment(item.id, commentText.trim());
          setCommentText('');
        }
      }}
    />
    <ReportModal
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      onSubmit={() => {
        setReportVisible(false);
        showMenuToast(t('social.reportReceivedToast'));
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
// 시안(Group 2085664520) 블로그 카드 상단 라벨 — 국기·지역 없이 국가 영어명(단어마다 첫 글자 대문자)
const jourPlaceLabel = (item: any): string => {
  const name = item.countries?.length ? item.countries[0].name : (item.countryName || (item.country || '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim());
  return countryEnglishName(name);
};

// 카드별 자연스러운 기울기 (id 기반 고정값 → 리렌더에도 흔들리지 않음)
const TILTS = [-2.4, 1.8, -1.2, 2.2, -1.8, 1.2, -2.0, 1.5, -0.8, 2.0, -1.5, 0.9];
const tiltFor = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILTS[Math.abs(h) % TILTS.length];
};

function DiaryMeta({ item, navigation, toggleLike, onMore, showCounts, onLight }: any) {
  const { t } = useTranslation();
  const { handle: globalHandle, profilePhoto: globalProfilePhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  const isMyPost = item.isMyPost || item.user.handle === globalHandle;
  const displayName = isMyPost
    ? globalHandle
    : (item.user.name ? item.user.name : item.user.handle);
  // 아이디 표시 폰트(프리미엄) — 내 글은 현재 설정값(구독 중일 때만), 타인 글은 프로필 조인 값
  const nameFontStyle = handleFontStyle(isMyPost ? (myPremium ? myHandleFont : null) : item.user.font);

  return (
    <View style={d.meta}>
      <TouchableOpacity
        style={d.metaUser}
        activeOpacity={item.isExample ? 1 : 0.7}
        onPress={() => { if (item.isExample) return; navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle }); }}
      >
        <View style={[d.metaAvatar, onLight && d.metaAvatarLight, item.isExample && { overflow: 'hidden' }]}>
          {item.isExample ? (
            <Image source={APP_LOGO} style={{ width: 24, height: 24 }} resizeMode="cover" />
          ) : isMyPost && globalProfilePhoto ? (
            <Image source={{ uri: globalProfilePhoto }} style={{ width: 18, height: 18, borderRadius: 9 }} />
          ) : item.user.photo ? (
            <Image source={{ uri: item.user.photo }} style={{ width: 18, height: 18, borderRadius: 9 }} />
          ) : (
            <PersonIcon size={12} color="#A0A0B0" />
          )}
        </View>
        {/* 예시 콘텐츠는 @핸들 대신 'eOrth 공식' 필 배지만 표시 (기능 소개 카드와 동일 룩) */}
        {item.isExample ? (
          <Text style={d.officialBadge}>{t('socialEmpty.official')}</Text>
        ) : (
          <Text style={[d.metaHandle, onLight && d.metaTextLight, nameFontStyle]} numberOfLines={1}>{displayName}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={d.metaLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { if (item.isExample) return; toggleLike(item.id); }} accessibilityRole="button" accessibilityLabel={t('social.likeA11y')}>
        <Text style={[d.heart, item.liked && d.heartOn]}>{item.liked ? '♥' : '♡'}</Text>
        {showCounts && item.likes > 0 && <Text style={[d.metaCount, onLight && d.metaTextLight]}>{item.likes}</Text>}
      </TouchableOpacity>
      {!item.isExample && (
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onMore} accessibilityRole="button" accessibilityLabel={t('social.moreA11y')}>
          <Text style={[d.more, onLight && d.metaTextLight]}>⋯</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// 스트립(네컷) 카드 전용 푸터 — 시안(Group 2085664520): 프로필사진 없이 @아이디, 프레임과 아이디 사이에 방문국가.
// 카드가 반투명 라이트(어두운 배경 위)라 글자는 밝은색.
function CutMeta({ item, navigation, toggleLike, onMore, showCounts }: any) {
  const { t } = useTranslation();
  const { handle: globalHandle, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  const skinAccent = useSkinAccent();
  const isMyPost = item.isMyPost || item.user.handle === globalHandle;
  const displayHandle = isMyPost ? (globalHandle || item.user.handle) : item.user.handle;
  const nameFontStyle = handleFontStyle(isMyPost ? (myPremium ? myHandleFont : null) : item.user.font);
  // 방문국가 — 블로그 기록 카드와 동일한 라벨(영문 국가명) + 폰트(jourCountry: Gilroy-Black)
  const placeLabel = jourPlaceLabel(item);
  return (
    <View style={d.cutMeta}>
      {/* 프레임과 아이디 사이: 방문국가(좌) + 올린시간(우, 보라) — 시안처럼 같은 행 */}
      <View style={d.cutMetaTopRow}>
        <Text style={d.cutMetaCountry} numberOfLines={1}>{placeLabel}</Text>
        <Text style={[d.cutMetaTime, { color: skinAccent.accent }]} numberOfLines={1}>{timeAgo(item.timestamp)}</Text>
      </View>
      <View style={d.cutMetaRow}>
        <TouchableOpacity
          style={d.cutMetaIdBtn}
          activeOpacity={item.isExample ? 1 : 0.7}
          onPress={() => { if (item.isExample) return; navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle }); }}
        >
          {item.isExample ? (
            <Text style={d.officialBadge}>{t('socialEmpty.official')}</Text>
          ) : (
            <Text style={[d.cutMetaHandle, nameFontStyle]} numberOfLines={1}>@{displayHandle}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={d.metaLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { if (item.isExample) return; toggleLike(item.id); }} accessibilityRole="button" accessibilityLabel={t('social.likeA11y')}>
          <Text style={[d.heart, item.liked && d.heartOn]}>{item.liked ? '♥' : '♡'}</Text>
          {showCounts && item.likes > 0 && <Text style={d.metaCount}>{item.likes}</Text>}
        </TouchableOpacity>
        {!item.isExample && (
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onMore} accessibilityRole="button" accessibilityLabel={t('social.moreA11y')}>
            <Text style={d.more}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>
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
          transforms={item.cutPhoto.transforms}
          width={w - 12}
          bgOverride={item.cutPhoto.frameColor}
          bgImageOverride={item.cutPhoto.frameImage}
          capture
          showLogo={!item.cutPhoto.noLogo}
          stamp={item.cutPhoto.stamp}
        />
      )}
      {meta}
    </DiaryTappable>
  );
}

// 색이 밝은지 판정 (푸터 글자색 결정용)
function isLightColor(hex?: string): boolean {
  if (!hex) return true;
  const h = hex.replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

// 스트립 프레임 배경 해석 — 사용자 override(색/이미지) → 프레임 기본 배경(색/이미지). isLight로 푸터 글자색 결정.
function resolveCutBg(cutPhoto: any): { color?: string; image?: any; isLight: boolean } {
  const frame = cutPhoto?.frameId ? getCutFrame(cutPhoto.frameId) : undefined;
  const bg = frame?.background;
  const color = cutPhoto?.frameColor || (bg?.type === 'color' ? bg.value : undefined);
  const image = cutPhoto?.frameImage ? { uri: cutPhoto.frameImage } : (bg?.type === 'image' ? bg.source : undefined);
  return { color, image, isLight: image ? false : isLightColor(color) };
}

// 스트립(네컷) 기록 카드의 사진 영역 — 시안(Group 2085664520)처럼 각 프레임 슬롯대로 사진을 격자 배치.
// 프레임 색/이미지는 이 '사진 영역'의 배경으로 살린다(가폭 사이로 프레임이 비침 = 스트립 사진 프레임).
// 바깥 카드 배경은 시안대로 라이트 톤 유지. 슬롯(x/y/w/h 0~1)·aspect를 써서 모든 스트립 포맷에 자동 대응.
function CutGridPreview({ cutPhoto }: { cutPhoto: any }) {
  const frame = cutPhoto?.frameId ? getCutFrame(cutPhoto.frameId) : undefined;
  const lay = frame?.layout || cutPhoto?.layout || 'four';
  const spec = (CUT_LAYOUTS as any)[lay] || CUT_LAYOUTS['four'];
  const bg = resolveCutBg(cutPhoto);
  const photos: string[] = cutPhoto?.photos || [];
  const slots = spec.slots.map((s: any, i: number) => (
    <View
      key={i}
      style={{
        position: 'absolute',
        left: `${s.x * 100}%`, top: `${s.y * 100}%`,
        width: `${s.w * 100}%`, height: `${s.h * 100}%`,
        borderRadius: 2, overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.10)', // 빈 슬롯 살짝 음영 (프레임 위)
      }}
    >
      {photos[i] ? (
        <Image source={{ uri: photos[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : null}
    </View>
  ));
  // 프레임 이미지 테마면 사진 영역 배경을 이미지로, 아니면 프레임 색으로. 프레임 모서리는 둥글게.
  // overflow:hidden은 카드 회전(tilt)과 겹치면 라운드 코너가 깨져(계단현상) 보이므로 쓰지 않고,
  // borderRadius로 배경/이미지 자체를 둥글게 한다(슬롯 사진은 여백만큼 안쪽이라 코너를 침범하지 않음).
  if (bg.image) {
    return (
      <ImageBackground
        source={bg.image}
        style={{ width: '100%', aspectRatio: spec.aspect, position: 'relative', borderRadius: 5 }}
        imageStyle={{ borderRadius: 5 }}
        resizeMode="cover"
      >
        {slots}
      </ImageBackground>
    );
  }
  return (
    <View style={{ width: '100%', aspectRatio: spec.aspect, position: 'relative', backgroundColor: bg.color || '#FFFFFF', borderRadius: 5 }}>
      {slots}
    </View>
  );
}

function DiaryCard({ item, mode, navigation, toggleLike, showCounts, onArchive, onDelete, onBlock, onReport, onQuickStart, onQuickMove, onQuickEnd, onQuickCancel, dragPos, columnIndex }: any) {
  const { t } = useTranslation();
  const { records } = useRecords();
  const { handle: globalHandle, isPremium, handleFont: myHandleFont } = useSettings();
  const skinAccent = useSkinAccent(); // 저널 카드 부제·시간 강조를 스킨색으로
  const vt = item.viewType || 'feed';
  const open = () => navigation.navigate('PostDetail', { postId: item.id, record: item.isExample ? item : undefined });
  // 두 번 연속 탭 → 좋아요 (이미 좋아요면 유지)
  const like = () => { if (item.isExample || item.liked) return; toggleLike(item.id); };
  const tilt = tiltFor(item.id);
  const isMy = item.isMyPost ?? false;
  // 게시자 아이디 + 프리미엄 폰트 (내 글=내 설정값, 타인=프로필 조인 값)
  const postHandle = isMy ? (globalHandle || item.user.handle) : item.user.handle;
  const postHandleFont = handleFontStyle(isMy ? (isPremium ? myHandleFont : null) : item.user.font);
  const [reportVisible, setReportVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const onMore = () => { if (item.isExample) return; setMenuVisible(true); };

  const handleShare = async () => {
    const text = (item.content || item.memo || '').trim();
    const url = `https://eorth.app/post/${item.id}`;
    try {
      await Share.share({ message: text ? `${text}\n${url}` : url, url });
    } catch (e: any) {
      Alert.alert(t('social.shareFailed'), String(e?.message ?? e));
    }
  };

  const confirmDelete = () => Alert.alert(t('social.deleteConfirmTitle'), t('social.deleteConfirmMsgShort'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('social.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
  ]);

  const menuOptions: { key: string; icon: string; label: string; danger?: boolean; onPress: () => void }[] = isMy
    ? [
        { key: 'share', icon: '↗', label: t('social.share'), onPress: handleShare },
        { key: 'archive', icon: '📦', label: t('social.archive'), onPress: () => onArchive(item.id) },
        { key: 'edit', icon: '✏️', label: t('social.edit'), onPress: () => navigation.navigate('NewRecord', { editRecord: records.find((r) => r.id === item.id) ?? item }) },
        { key: 'delete', icon: '🗑', label: t('social.delete'), danger: true, onPress: confirmDelete },
      ]
    : [
        { key: 'share', icon: '↗', label: t('social.share'), onPress: handleShare },
        { key: 'block', icon: '⛔', label: t('social.block'), danger: true, onPress: () => onBlock({ name: item.user.name, emoji: item.user.emoji, handle: item.user.handle, id: item.authorId }) },
        { key: 'report', icon: '🚨', label: t('social.report'), danger: true, onPress: () => setReportVisible(true) },
      ];

  const meta = mode === 'full'
    ? <DiaryMeta item={item} navigation={navigation} toggleLike={toggleLike} onMore={onMore} showCounts={showCounts} onLight={vt === 'feed'} />
    : null;
  // 스트립(네컷) 전용 푸터 — 프로필사진 없이 @아이디 + 방문국가
  const cutMeta = mode === 'full'
    ? <CutMeta item={item} navigation={navigation} toggleLike={toggleLike} onMore={onMore} showCounts={showCounts} />
    : null;

  const cardRef = useRef<View>(null);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(250)
    .onStart((e) => {
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
    .onUpdate((e) => {
      dragPos.setValue({ x: e.absoluteX, y: e.absoluteY });
      onQuickMove(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      onQuickEnd(e.absoluteX, e.absoluteY);
    })
    // onEnd가 안 불리는 취소 케이스(스크롤 개입·시스템 제스처 등)에도 오버레이가 남지 않게 정리.
    // 정상 드롭 후에는 handleQuickEnd가 active를 내려 no-op.
    .onFinalize(() => {
      onQuickCancel?.();
    });

  const card = (() => {
  // 스트립(네컷) → 시안(Group 2085664520): 라이트 각짐 카드 + 프레임 살린 사진 격자 + 메타 푸터.
  if (vt === 'cut') {
    const photos: string[] = item.cutPhoto?.photos || [];
    const hasGrid = photos.some(Boolean) && (item.cutPhoto?.frameId || item.cutPhoto?.layout);
    if (hasGrid) {
      return (
        <DiaryTappable style={d.cutCardLight} tilt={tilt} onSingle={open} onDouble={like}>
          <CutGridPreview cutPhoto={item.cutPhoto} />
          {cutMeta}
        </DiaryTappable>
      );
    }
    // 폴백: 사진/프레임 정보가 없는 옛 기록만 저장된 합성본(previewUri)으로
    const uri = firstPhoto(item);
    const aspect = (item.cutPhoto?.layout && (CUT_LAYOUTS as any)[item.cutPhoto.layout]?.aspect) || 0.7;
    if (uri) {
      return (
        <DiaryTappable style={d.cutCardLight} tilt={tilt} onSingle={open} onDouble={like}>
          <Image source={{ uri }} style={{ width: '100%', aspectRatio: aspect, borderRadius: 3 }} resizeMode="cover" />
          {cutMeta}
        </DiaryTappable>
      );
    }
    return <DiaryTappable style={d.cutCardLight} tilt={tilt} onSingle={open} onDouble={like}>{cutMeta}</DiaryTappable>;
  }

  // 블로그 / 앨범
  if (vt === 'blog' || vt === 'album') {
    const photo = firstPhoto(item);
    const title = (item.content || '').trim();
    const excerpt = blogExcerpt(item);
    // 블로그는 사진이 있어도 시안처럼 글로만(저널 레이아웃). 사진 스크랩은 앨범만.
    if (photo && vt === 'album') {
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
        {/* 데코 핀(Group 2085664575) — 카드가 기운 쪽 위 모서리에 꽂음. 좌측이면 좌우 반전 */}
        <View pointerEvents="none" style={[d.jourPin, tilt < 0 ? d.jourPinLeft : d.jourPinRight]}>
          <BlogPin flip={tilt < 0} />
        </View>
        {/* 그라데이션 테두리 — 밝은 좌상단 → 어두운 우하단으로 빛/그림자 대비를 줘 입체감 */}
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.25)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={d.jourBorderGrad}
        >
        <View style={d.jourInner}>
        {/* 시안(Group 2085664520): 국가·지역 라벨 → 제목 → 소제목(memo) → 본문 → 구분선 → 푸터 */}
        {!!jourPlaceLabel(item) && <Text style={d.jourCountry} numberOfLines={1}>{jourPlaceLabel(item)}</Text>}
        {!!title && <Text style={[d.jourTitle, { fontFamily: SERIF }]} numberOfLines={2}>{title}</Text>}
        {!!item.subtitle && <Text style={[d.jourSubtitle, { color: skinAccent.accent }]} numberOfLines={1}>{item.subtitle}</Text>}
        {!!excerpt && <Text style={d.jourBody} numberOfLines={3}>{excerpt}</Text>}
        <View style={d.jourFooter}>
          {/* 시안: 구분선 아래 보라색 올린 시간 → @아이디(좌) + 하트·더보기(우) */}
          <Text style={[d.jourTime, { color: skinAccent.accent }]} numberOfLines={1}>{timeAgo(item.timestamp)}</Text>
          <View style={d.jourFooterRow}>
            <TouchableOpacity
              style={d.jourHandleBtn}
              activeOpacity={item.isExample ? 1 : 0.7}
              onPress={() => { if (item.isExample) return; navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle }); }}
            >
              {item.isExample ? (
                <Text style={d.officialBadge}>{t('socialEmpty.official')}</Text>
              ) : (
                <Text style={[d.jourHandle, postHandleFont]} numberOfLines={1}>@{postHandle}</Text>
              )}
            </TouchableOpacity>
            <View style={d.jourFooterRight}>
              <TouchableOpacity onPress={() => { if (item.isExample) return; toggleLike(item.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={d.jourLikeBtn} accessibilityRole="button" accessibilityLabel={t('social.likeA11y')}>
                <Text style={[d.jourHeart, item.liked && d.jourHeartOn]}>{item.liked ? '♥' : '♡'}</Text>
                {showCounts && item.likes > 0 && <Text style={d.jourLikeCount}>{item.likes}</Text>}
              </TouchableOpacity>
              {!item.isExample && (
                <TouchableOpacity onPress={onMore} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('social.moreA11y')}>
                  <Text style={d.jourMore}>⋯</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        </View>
        </LinearGradient>
      </DiaryTappable>
    );
  }

  // 피드 → 폴라로이드
  const photo = firstPhoto(item);
  // 사진 밑 캡션은 게시물의 글(memo) 우선. content는 제목(미입력 시 "{국가} 여행 기록" 기본값)이라 폴백으로만.
  const caption = (item.memo || item.content || '').trim();
  // 데코 테이프 2종 랜덤 — id 해시라 카드마다 고정(리렌더에도 안 바뀜)
  const tapeVariant = (Math.abs(String(item.id).split('').reduce((a: number, c: string) => ((a * 31 + c.charCodeAt(0)) | 0), 7)) % 2) as 0 | 1;
  return (
    <DiaryTappable style={d.polaWrap} tilt={tilt} onSingle={open} onDouble={like}>
      {/* 시안(Group 2085664521): 뒷장이 살짝 어긋나게 겹쳐 두 장이 포개진 입체감 */}
      <View style={d.polaBack} pointerEvents="none" />
      <View style={d.polaFront}>
        {/* 데코 테이프 — 위 모서리에 붙임 (2종 중 카드별 랜덤) */}
        <View pointerEvents="none" style={[d.polaTape, tapeVariant === 1 && { top: -13 }]}>
          <FeedTape variant={tapeVariant} />
        </View>
        {photo ? <Image source={{ uri: photo }} style={d.polaImg} resizeMode="cover" /> : <View style={[d.polaImg, d.polaEmpty]} />}
        {/* 사진과 글 사이: 방문국가(좌) + 올린시간(우, 보라) — 스트립 카드와 동일 */}
        <View style={[d.cutMetaTopRow, { paddingTop: 8 }]}>
          <Text style={d.cutMetaCountry} numberOfLines={1}>{jourPlaceLabel(item)}</Text>
          <Text style={[d.cutMetaTime, { color: skinAccent.accent }]} numberOfLines={1}>{timeAgo(item.timestamp)}</Text>
        </View>
        {/* 시안(Group 2085664521): 그 아래 게시물 글 한 줄 */}
        {!!caption && <Text style={[d.polaCap, { fontFamily: SERIF }]} numberOfLines={1} ellipsizeMode="tail">{caption}</Text>}
        {/* 그 아래: @아이디(좌) + 좋아요·더보기(우) */}
        <View style={d.polaMetaRow}>
          <TouchableOpacity
            style={d.polaHandleBtn}
            activeOpacity={item.isExample ? 1 : 0.7}
            onPress={() => { if (item.isExample) return; navigation.navigate('FriendProfile', { userId: item.authorId ?? item.id, username: item.user.name, handle: item.user.handle }); }}
          >
            {item.isExample ? (
              <Text style={d.officialBadge}>{t('socialEmpty.official')}</Text>
            ) : (
              <Text style={[d.polaHandle, postHandleFont]} numberOfLines={1}>@{postHandle}</Text>
            )}
          </TouchableOpacity>
          <View style={d.polaMetaRight}>
            <TouchableOpacity onPress={() => { if (item.isExample) return; toggleLike(item.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={d.polaLikeBtn} accessibilityRole="button" accessibilityLabel={t('social.likeA11y')}>
              <Text style={[d.polaHeart, item.liked && d.polaHeartOn]}>{item.liked ? '♥' : '♡'}</Text>
              {showCounts && item.likes > 0 && <Text style={d.polaLikeCount}>{item.likes}</Text>}
            </TouchableOpacity>
            {!item.isExample && (
              <TouchableOpacity onPress={onMore} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('social.moreA11y')}>
                <Text style={d.polaMore}>⋯</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
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
              <Text style={ss.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => { setReportVisible(false); onReport(item.id, reason); }}
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
  // 예시 콘텐츠 공식 배지 — 기능 소개 카드(FeatureShowcaseCard.badge)와 동일 룩
  officialBadge: { alignSelf: 'center', fontSize: 9, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },

  // 공식 예시 콘텐츠 배지

  // 더블탭 하트 팝
  tapWrap: { position: 'relative' },
  heartPop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heartIcon: { fontSize: 68, color: 'rgba(255,255,255,0.95)', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },

  // 폴라로이드 (피드)
  // 시안(Group 2085664521): 두 장 겹친 각진 폴라로이드
  polaWrap: {},
  // 뒷장 — 앞장과 같은 크기를 살짝 더 회전시켜 모서리가 뒤로 삐져나와 겹쳐 보인다
  polaBack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2B2B30',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 0,
    transform: [{ rotate: '-5deg' }],
  },
  // 앞장 — 불투명 회색 유리 룩(별 차단), 각진 모서리(블로그 카드처럼)
  polaFront: {
    backgroundColor: '#333337',
    borderRadius: 0,
    padding: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  // 폴라로이드 데코 테이프 — 상단 중앙, 카드 위로 살짝 걸침
  polaTape: { position: 'absolute', top: -8, alignSelf: 'center', zIndex: 5, elevation: 5 },
  polaImg: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: '#2A2735' },
  polaEmpty: { backgroundColor: '#1A0A2E' },
  // 사진 밑 캡션 — 한 줄
  polaCap: { color: '#FFFFFF', fontSize: 12, paddingTop: 4 },
  // 캡션 아래 메타 행 — 좌: @아이디, 우: 좋아요·더보기
  polaMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 6, paddingBottom: 2 },
  polaHandleBtn: { flexShrink: 1 },
  polaHandle: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  polaMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  polaLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  polaHeart: { color: '#99999B', fontSize: 15 },
  polaHeartOn: { color: '#FF6B9D' },
  polaLikeCount: { color: '#99999B', fontSize: 11, fontWeight: '500' },
  polaMore: { color: '#99999B', fontSize: 16, fontWeight: '700' },

  // 스크랩 카드 (블로그/앨범 + 사진)
  scrap: {
    backgroundColor: 'rgba(217,217,217,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 10
  },
  tape: { position: 'absolute', top: -8, left: 18, width: 42, height: 16, backgroundColor: 'rgba(191,133,252,0.30)', transform: [{ rotate: '-6deg' }], borderRadius: 1 },
  scrapImg: { width: '100%', aspectRatio: 1.3, borderRadius: 4, backgroundColor: '#2A2735', marginBottom: 8 },
  scrapTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 17 },
  scrapExcerpt: { color: '#9A95A5', fontSize: 11, lineHeight: 16, marginTop: 5 },

  // 저널 (텍스트 블로그) — 시안(Group 2085664520): 반투명 회색 유리 카드
  // 저널 카드 = 그라데이션 테두리 래퍼(투명) + 안쪽 불투명 카드
  jour: { borderRadius: 0 },
  // 저널 카드 데코 핀 — 위 모서리에 살짝 걸치게(카드 밖으로 머리가 나옴), 콘텐츠 위 레이어
  jourPin: { position: 'absolute', top: -10, zIndex: 5, elevation: 5 },
  jourPinRight: { right: 8 },
  jourPinLeft: { left: 8 },
  // 그라데이션 테두리 레이어 — padding이 테두리 두께가 된다(안쪽 카드가 그만큼 작아짐)
  jourBorderGrad: { padding: 1.5, borderRadius: 0 },
  // 안쪽 카드 — 불투명 합성색(#0A0A0F 위에 rgba(217,217,217,0.2)를 얹은 값)이라 별이 투과되지 않고 유리 룩 유지
  jourInner: { backgroundColor: '#333337', padding: 12 },
  // 시안 구조: 국가·지역 라벨 → 제목 → 소제목 → 본문 → 구분선 → 푸터
  // 시안 스펙: Gilroy-Black 10px, line-height 130%, letter-spacing 3% (앞글자만 대문자는 라벨에서 처리)
  jourCountry: { color: 'rgba(255,255,255,0.5)', fontFamily: 'Gilroy-Black', fontSize: 12, lineHeight: 15, letterSpacing: 0.3, marginBottom: 6 },
  jourTitle: { color: '#FFFFFF', fontSize: 15, marginBottom: 4 },
  jourSubtitle: { color: '#AA54C1', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  jourBody: { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 17 },
  // 구분선 아래 푸터 — 보라색 올린 시간 → @아이디(좌) + 좋아요·더보기(우)
  jourFooter: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(170,170,170,0.2)' },
  jourTime: { color: '#AA54C1', fontSize: 11, fontWeight: '500', marginBottom: 4 },
  jourFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jourHandleBtn: { flexShrink: 1 },
  jourHandle: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  jourFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jourLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  jourHeart: { color: '#99999B', fontSize: 15 },
  jourHeartOn: { color: '#FF6B9D' },
  jourLikeCount: { color: '#99999B', fontSize: 11, fontWeight: '500' },
  jourMore: { color: '#99999B', fontSize: 16, fontWeight: '700' },

  // 네컷
  cutCard: {
    backgroundColor: 'rgba(26,10,46,0.55)',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)'
  },
  // 스트립 기록 카드 — 시안(Group 2085664520): 각진 모서리.
  // 배경은 rgba(217,217,217,0.2)를 #0A0A0F 위에 얹은 불투명 합성색(#333337) — 룩은 시안과 동일하되
  // 별 배경이 투과되지 않는다(피드 폴라로이드/저널 카드와 동일 방식).
  // 프레임 색/이미지는 카드가 아니라 사진 영역(CutGridPreview)에서 살린다.
  cutCardLight: {
    backgroundColor: '#333337',
    borderRadius: 0,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  // 스트립 카드 푸터 (시안): 방문국가 줄 → @아이디 + 하트·⋯ 행
  cutMeta: { paddingTop: 8, paddingBottom: 2, gap: 5 },
  // 국가(좌) + 올린시간(우) 같은 행 — 시안처럼 시간을 카드 오른쪽에 정렬
  cutMetaTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  // 블로그 기록 카드의 국가 라벨(jourCountry)과 동일한 글자 — Gilroy-Black 10px (위치/여백은 cutMeta가 유지)
  cutMetaCountry: { color: 'rgba(255,255,255,0.5)', fontFamily: 'Gilroy-Black', fontSize: 12, lineHeight: 15, letterSpacing: 0.3, flexShrink: 1 },
  // 올린시간 — 블로그 카드 jourTime과 동일 톤(보라)
  cutMetaTime: { color: '#AA54C1', fontSize: 11, fontWeight: '500' },
  cutMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cutMetaIdBtn: { flex: 1, minWidth: 0 },
  cutMetaHandle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

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
  more: { color: '#8B8B9E', fontSize: 14, paddingLeft: 4 },
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

// 피드 카드 — props가 안정적일 때 리렌더를 건너뛰도록 memo화 (스크롤·다른 글 변경 시 불필요 렌더 방지)
const DiaryCardMemo = React.memo(DiaryCard);

function FriendsTab({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 스냅 스토리 링 그라데이션을 스킨색으로
  const { records, toggleLike, blockUser, deleteRecord, archivedIds, archiveRecord, currentViewer, feedPosts, refreshFeed, isBlocked, neighbors, reportedPostIds, reportPost, viewedSnapIds } = useRecords();
  // 빈 피드 기본 콘텐츠 — 추천 친구 (팔로우할 사람이 생기면 피드가 채워진다)
  const [suggested, setSuggested] = useState<FriendSuggestion[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchFriendSuggestions(5).then((list) => { if (alive) setSuggested(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // 당겨서 새로고침 → 백엔드 피드 갱신
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshFeed(); } finally { setRefreshing(false); }
  };
  const { diaryCardMode, showCounts, handle: globalHandle, profilePhoto: globalProfilePhoto, isPremium, handleFont: myHandleFont } = useSettings();

  const getPostDisplayName = (postUser: any, isMy: boolean) => {
    if (isMy) {
      return globalHandle;
    }
    return postUser.name ? postUser.name : postUser.handle;
  };
  
  const { sendRecord, conversations } = useDM();
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
  // 빠른공유 친구는 이웃(neighbors)에서 — 대화량 많은 순 상위 3명.
  // (dmStore.friends는 항상 비어 있어 더 이상 사용하지 않음)
  const dmFriends = useMemo(
    () => neighbors
      // 차단한 상대는 공유 대상에서 제외 — 차단 시 언팔되지만 로컬 상태가 어긋난 경우의 안전망
      .filter((f) => !isBlocked({ handle: f.username, name: f.username }))
      .map((f) => ({ id: f.id, name: f.username, handle: f.username, emoji: f.emoji || '🧳' })),
    [neighbors, isBlocked]
  );
  const top3 = useMemo(
    () => [...dmFriends]
      .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0))
      .slice(0, 3),
    [dmFriends, conversations]
  );

  const showQuickToast = (msg: string) => {
    if (quickToastTimer.current) clearTimeout(quickToastTimer.current);
    setQuickToast(msg); setQuickToastVisible(true);
    quickToastTimer.current = setTimeout(() => setQuickToastVisible(false), 1800);
  };

  // 드롭 판정 여유(px) — 원을 정확히 덮지 않아도 근처면 인정 (자연스러운 드롭감)
  const QUICK_HIT_MARGIN = 12;
  // 호버는 '바뀔 때만' setState — 드래그 매 프레임 리렌더 방지 + 진입 시 햅틱 틱
  const quickHoverRef = useRef<string | null>(null);
  const quickActiveRef = useRef(false);

  const handleQuickStart = (item: any, cardRect: CardRect) => {
    const side: 'left' | 'right' = cardRect.x < SCREEN_W_SOCIAL / 2 ? 'right' : 'left';
    quickTargets.current = [];
    quickHoverRef.current = null;
    quickActiveRef.current = true;
    setQuick({ active: true, item, cardRect, side });
    setQuickHover(null);
    // 드래그 동안 하단 탭 바 잠시 숨김 — 드롭 영역·딤을 가리지 않게
    setTabBarHidden(true);
    // 카드가 '집힌' 순간의 촉각 피드백
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const handleQuickMove = (px: number, py: number) => {
    const key = hitTestTarget(px, py, quickTargets.current, QUICK_HIT_MARGIN);
    if (key === quickHoverRef.current) return;
    quickHoverRef.current = key;
    if (key) Haptics.selectionAsync().catch(() => {});
    setQuickHover(key);
  };
  const handleQuickEnd = (px: number, py: number) => {
    const key = hitTestTarget(px, py, quickTargets.current, QUICK_HIT_MARGIN);
    const item = quick.item;
    quickHoverRef.current = null;
    quickActiveRef.current = false;
    setQuick({ active: false, item: null, cardRect: null, side: 'right' });
    setQuickHover(null);
    setTabBarHidden(false);
    if (!key || !item) return;
    if (key === 'other') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setOtherPickerItem(item);
      return;
    }
    const friend = top3.find((f) => f.handle === key);
    if (friend) {
      sendRecord(friend.handle, item);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showQuickToast(t('comp2.toastSentTo', { name: friend.name }));
    }
  };
  // 제스처가 취소(스크롤 개입·터치 이탈 등)돼 onEnd가 안 불려도 오버레이가 남지 않게 정리
  const handleQuickCancel = () => {
    if (!quickActiveRef.current) return;
    quickHoverRef.current = null;
    quickActiveRef.current = false;
    setQuick({ active: false, item: null, cardRect: null, side: 'right' });
    setQuickHover(null);
    setTabBarHidden(false);
  };
  // 화면 이탈 시 탭 바 숨김이 남지 않게 안전 복원
  useEffect(() => () => setTabBarHidden(false), []);
  const onQuickTargetLayout = (key: string, rect: { x: number; y: number; w: number; h: number }) => {
    const others = quickTargets.current.filter((t) => t.key !== key);
    quickTargets.current = [...others, { key, ...rect }];
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message: msg });
    toastTimer.current = setTimeout(() => setToast({ visible: false, message: '' }), 2500);
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (quickToastTimer.current) clearTimeout(quickToastTimer.current);
  }, []);

  const handleArchive = (id: string) => {
    archiveRecord(id);
    showToast(t('social.archivedToast'));
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
    showToast(t('social.deletedToast'));
  };

  // 차단(확인 다이얼로그 경유)
  const handleBlock = (user: { name: string; emoji: string; handle?: string; id?: string }) => {
    confirmBlock(user.name, () => { blockUser(user); showToast(t('social.blockedToast')); }, t);
  };

  // 메모이즈된 카드(DiaryCardMemo)에 넘길 콜백을 안정적인 ref로 박제 — 매 렌더 최신 함수를 가리키되
  // 콜백 ref 자체는 불변 → 카드 props가 안정되어 React.memo가 불필요 리렌더를 건너뛴다.
  const fnRef = useRef({ toggleLike, reportPost, handleArchive, handleDelete, handleBlock, handleQuickStart, handleQuickMove, handleQuickEnd, handleQuickCancel });
  fnRef.current = { toggleLike, reportPost, handleArchive, handleDelete, handleBlock, handleQuickStart, handleQuickMove, handleQuickEnd, handleQuickCancel };
  const cbToggleLike = useCallback((id: string) => fnRef.current.toggleLike(id), []);
  const cbReport     = useCallback((id: string, reason?: string) => fnRef.current.reportPost(id, reason), []);
  const cbArchive    = useCallback((id: string) => fnRef.current.handleArchive(id), []);
  const cbDelete     = useCallback((id: string) => fnRef.current.handleDelete(id), []);
  const cbBlock      = useCallback((user: { name: string; emoji: string; handle?: string; id?: string }) => fnRef.current.handleBlock(user), []);
  const cbQuickStart = useCallback((item: any, rect: any) => fnRef.current.handleQuickStart(item, rect), []);
  const cbQuickMove  = useCallback((px: number, py: number) => fnRef.current.handleQuickMove(px, py), []);
  const cbQuickEnd   = useCallback((px: number, py: number) => fnRef.current.handleQuickEnd(px, py), []);
  const cbQuickCancel = useCallback(() => fnRef.current.handleQuickCancel(), []);

  // 내 글(records) + 백엔드 피드의 남들 글(feedPosts)을 합쳐 최신순 정렬 → 실제 소셜 피드.
  // 정렬+다중 필터+applyViewer 비용이 커서 입력이 바뀔 때만 재계산하도록 memo화.
  const allVisible = useMemo(() => {
    // 내 글은 미리보기 뷰어(currentViewer), 타인 글은 '나'(내 핸들)를 뷰어로 —
    // 서버 data에 전체 사진이 내려오므로 여기서 안 거르면 작성자가 나에게 숨긴 사진이 보인다.
    const viewerFor = (r: (typeof records)[number]) =>
      r.isMyPost || r.user?.handle === globalHandle ? currentViewer : (globalHandle || null);
    return [...records, ...feedPosts]
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .filter(
        (r) =>
          r.visibility === 'neighbors' &&
          // 사진첩(과거 여행 불러오기)은 게시물이 아니라 앨범 — 이웃 프로필·여행 카드에서만
          // 보이고 소셜 피드 스트림에는 흐르지 않는다 (b84d93a로 friends 승격되며 피드
          // 공개범위 조건을 충족하게 된 부작용 차단).
          r.viewType !== 'album' &&
          !isBlocked(r.user) &&
          !archivedIds.includes(r.id) &&
          !reportedPostIds.includes(r.id)
      )
      // 블로그·스트립은 기록 전체 비공개 — 뷰어가 대상이면 글 전체를 피드에서 숨김
      .filter((r) => !isPostHiddenForViewer(r, viewerFor(r)))
      // 뷰어 시점에서 비공개 사진을 제거한 사본으로 교체 (viewer=null이면 원본 그대로)
      .map((r) => applyViewer(r, viewerFor(r)));
  }, [records, feedPosts, archivedIds, reportedPostIds, currentViewer, isBlocked, globalHandle]);

  const snapItems = useMemo(() => {
    // 내 스냅 판정 (isMyPost 누락 대비 핸들 비교 병행). 내 스냅은 '본 것'으로 취급 → 안 본 링 안 뜸
    const isMine = (s: any) => s.isMyPost || s.user.handle === globalHandle;
    // snapViewed는 세션 한정(feedPosts 재조회 시 초기화) → 영속 viewedSnapIds(remoteId)도 함께 판정
    const isUnviewed = (s: any) =>
      !isMine(s) && !s.snapViewed && !viewedSnapIds.includes(s.remoteId ?? s.id);
    const snaps = allVisible.filter(r => r.viewType === 'snap');
    const seen = new Set<string>();
    const reps = snaps.reduce<any[]>((acc, snap) => {
      // 같은 사용자라도 다른 나라면 별도 스토리로 인식
      const key = `${snap.user.handle}::${snap.countryName || snap.snapDetectedCountry || ''}`;
      if (seen.has(key)) {
        // 같은 작성자+같은 나라의 추가 스냅: 안 본 게 있으면 대표 항목에 반영
        const rep = acc.find((s: any) =>
          s.user.handle === snap.user.handle &&
          (s.countryName || s.snapDetectedCountry || '') === (snap.countryName || snap.snapDetectedCountry || '')
        );
        if (rep && isUnviewed(snap)) rep._hasUnviewed = true;
        return acc;
      }
      seen.add(key);
      acc.push({ ...snap, _hasUnviewed: isUnviewed(snap) });
      return acc;
    }, []);
    // 모든 스토리를 다 봤으면(내 스냅은 본 것으로 간주) 제일 먼저 올린 것부터(오름차순) 정렬
    const allViewed = reps.every((s: any) => !s._hasUnviewed);
    if (allViewed) reps.sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return reps;
  }, [allVisible, globalHandle, viewedSnapIds]);
  // 피드·블로그·앨범·네컷(스냅 제외)을 시간순으로 섞어 2단 매거진으로 배치 (스냅은 상단 스토리 라인)
  const timelineItems = useMemo(
    () => allVisible.filter((r) => r.viewType !== 'snap').sort((a, b) => b.timestamp - a.timestamp),
    [allVisible]
  );

  // 광고 슬롯 삽입 — 폴라로이드/스티커 주기를 독립 운용.
  //  · 폴라로이드(독립 카드): 1번째 게시물 뒤 시작, 5개 주기(1·6·11번째 뒤 …)
  //  · 스티커(게시물 위 오버레이): 4번째 게시물부터 시작, 5개 주기(4·9·14번째 …)
  // 소스는 현재 하우스 광고(getHouseAd) — 직판/AdMob으로 교체 시 이 지점만 갈아끼운다.
  const AD_FREQ = 5;
  const STICKER_OFFSET = 3; // i=3 → 4번째 게시물부터
  const timelineWithAds = useMemo(() => {
    // 프리미엄 구독자는 광고 제거
    if (!FEED_ADS_ENABLED || isPremium || timelineItems.length < 2) return timelineItems;
    const out: any[] = [];
    let polaroidSlot = 0;
    let stickerSlot = 0;
    timelineItems.forEach((item, i) => {
      // 마지막 게시물에는 광고를 붙이지/뒤에 넣지 않음 — 피드 끝이 광고로 끝나는 것 방지
      const isLast = i === timelineItems.length - 1;
      // 스티커: 별도 카드가 아니라 이 게시물에 부착해 위로 겹친다 (시안 iPhone 17 - 54)
      const stickerHere = i % AD_FREQ === STICKER_OFFSET && !isLast;
      out.push(stickerHere ? { ...item, _overlayAd: getHouseAd(stickerSlot), _overlayTilt: stickerSlot % 2 === 0 ? -8 : 9 } : item);
      if (stickerHere) stickerSlot += 1;
      // 폴라로이드: 피드 흐름에 독립 카드로 삽입
      const polaroidHere = i % AD_FREQ === 0 && !isLast;
      if (polaroidHere) {
        out.push({
          _adSlot: true,
          id: `ad-slot-${polaroidSlot}`,
          ad: getHouseAd(polaroidSlot),
          adVariant: 'polaroid' as FeedAdVariant,
          // 폴라로이드 기울기를 슬롯마다 살짝 다르게 (±3도 교차)
          adTilt: polaroidSlot % 2 === 0 ? -3 : 3,
        });
        polaroidSlot += 1;
      }
    });
    return out;
  }, [timelineItems, isPremium]);

  const isEmptyFeed = allVisible.length === 0;

  // 스냅이 하나도 없으면 eOrth 데모 스냅으로 스냅 링 소개
  const snapDisplay = snapItems.length === 0 ? [{ ...EXAMPLE_SNAP, _hasUnviewed: true }] : snapItems;

  // 높이 추정 기반 2단 균형 분배 (광고 슬롯은 variant별 고정 추정치)
  const columns = useMemo(() => {
    // 빈 피드 — eOrth 공식 예시(예시 기록 + 기능 소개 카드)로 첫인상을 채운다
    const feedSource = isEmptyFeed
      ? [EXAMPLE_FEED_RECORD, { _featureCard: true, id: 'feature-card' }]
      : timelineWithAds;
    const cols: any[][] = [[], []];
    const h = [0, 0];
    feedSource.forEach((item) => {
      const c = h[0] <= h[1] ? 0 : 1;
      cols[c].push(item);
      h[c] += item._adSlot
        ? 190 // 폴라로이드 광고 카드 (스티커는 오버레이라 높이 미차지)
        : item._featureCard
          ? 260 // 기능 소개 카드 고정 추정치
          : estDiaryHeight(item, diaryCardMode);
    });
    return cols;
  }, [isEmptyFeed, timelineWithAds, diaryCardMode]);

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
        contentContainerStyle={{ paddingBottom: 110 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: () => { if (activeMenuId !== null) setActiveMenuId(null); },
          }
        )}
        scrollEventThrottle={16}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 스냅 스토리 라인 (인스타 스토리 스타일) */}
        {snapDisplay.length > 0 && (
          <View style={s.storySection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storyScroll}>
              {snapDisplay.map(snap => (
                <TouchableOpacity
                  key={snap.id}
                  style={s.storyItem}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('PostDetail', { postId: snap.id, record: snap.isExample ? snap : undefined })}
                >
                  <LinearGradient
                    colors={snap._hasUnviewed ? (skinAccent.ringGradient ?? ['#22D3EE', '#A855F7', '#D946EF']) : ['#3A3A4A', '#3A3A4A']}
                    style={s.storyRing}
                  >
                    <View style={s.storyAvatarWrap}>
                      <View style={[s.storyAvatar, snap.isExample && { overflow: 'hidden' }]}>
                        {snap.isExample ? (
                          <Image source={APP_LOGO} style={{ width: 70, height: 70 }} resizeMode="cover" />
                        ) : (snap.isMyPost || snap.user.handle === globalHandle) && globalProfilePhoto ? (
                          <Image source={{ uri: globalProfilePhoto }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                        ) : snap.user.photo ? (
                          <Image source={{ uri: snap.user.photo }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                        ) : (
                          <PersonIcon size={30} color="#A0A0B0" />
                        )}
                      </View>
                    </View>
                  </LinearGradient>
                  <Text
                    style={[
                      s.storyName,
                      // 아이디 폰트(프리미엄) — 내 스냅은 내 설정값, 타인은 서버 handle_font
                      handleFontStyle(
                        snap.isMyPost || snap.user.handle === globalHandle
                          ? (isPremium ? myHandleFont : null)
                          : snap.user.font
                      ),
                    ]}
                    numberOfLines={1}
                  >
                    {snap.countryFlag ? `${snap.countryFlag} ` : ''}
                    {getPostDisplayName(snap.user, snap.isMyPost || snap.user.handle === globalHandle)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 여행 다이어리 — 피드·블로그·앨범·네컷 2단 매거진 배치 */}
        <View style={s.friendsScroll}>
          {isEmptyFeed && (
            /* 빈 피드 기본 콘텐츠 — 안내 + 기록 유도 CTA + 추천 친구 + 친구 찾기 보조 링크 */
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>{t('socialEmpty.title')}</Text>
              {/* 주 CTA: 첫 기록 남기기 */}
              <TouchableOpacity
                style={[s.emptyCta, { backgroundColor: skinAccent.accentDeep, shadowColor: skinAccent.accent }]}
                activeOpacity={0.85}
                onPress={() => {
                  // 메인(지구본) 탭으로 이동한 뒤 RecordFab의 기록 형식 메뉴를 펼친다.
                  requestOpenRecordFab();
                  navigation.navigate('MainTab');
                }}
              >
                <Text style={s.emptyCtaText}>{t('socialEmpty.cta')}</Text>
              </TouchableOpacity>
              {/* 추천 친구 (보조) */}
              {suggested.length > 0 && (
                <>
                  <Text style={s.emptySuggestTitle}>{t('social.emptySuggestTitle')}</Text>
                  {suggested.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={s.suggestRow}
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('FriendProfile', { userId: f.id, username: f.handle || '', handle: f.handle || undefined })}
                    >
                      {f.profilePhoto ? (
                        <Image source={{ uri: f.profilePhoto }} style={s.suggestAvatarImg} />
                      ) : (
                        <View style={s.suggestAvatar}>
                          <PersonIcon size={20} color="#A0A0B0" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={s.suggestHandle}>@{f.handle || ''}</Text>
                        {f.mutualCount > 0 && (
                          <Text style={s.suggestMeta}>{t('social.mutualN', { count: f.mutualCount })}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {/* 친구찾기 보조 링크 (덜 강조) */}
              <TouchableOpacity
                style={s.emptyCtaLink}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('FriendSearch')}
              >
                <Text style={s.emptyCtaLinkText}>{t('social.emptyCtaFindFriends')}</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={d.masonry}>
            {[0, 1].map((ci) => (
              <View key={ci} style={d.col}>
                {columns[ci].map((item: any) => {
                  if (item._featureCard) {
                    return <FeatureShowcaseCard key={item.id} />;
                  }
                  if (item._adSlot) {
                    return (
                      <FeedAdCard
                        key={item.id}
                        ad={item.ad as HouseAd}
                        variant={item.adVariant}
                        tilt={item.adTilt}
                        onPress={() => { /* 광고 클릭 임시 비활성화 — 눌러도 이동 없음 */ }}
                      />
                    );
                  }
                  const card = (
                    <DiaryCardMemo
                      item={item}
                      mode={diaryCardMode}
                      navigation={navigation}
                      toggleLike={cbToggleLike}
                      showCounts={showCounts}
                      onArchive={cbArchive}
                      onDelete={cbDelete}
                      onBlock={cbBlock}
                      onReport={cbReport}
                      onQuickStart={cbQuickStart}
                      onQuickMove={cbQuickMove}
                      onQuickEnd={cbQuickEnd}
                      onQuickCancel={cbQuickCancel}
                      dragPos={dragPos}
                      columnIndex={ci}
                    />
                  );
                  // 스티커 광고: 게시물 위에 겹쳐 붙임 (시안 iPhone 17 - 54)
                  if (item._overlayAd) {
                    return (
                      <View key={item.id} style={{ position: 'relative' }}>
                        {card}
                        <FeedAdCard
                          ad={item._overlayAd as HouseAd}
                          variant="sticker"
                          overlay
                          overlaySide={ci === 0 ? 'right' : 'left'}
                          tilt={item._overlayTilt}
                          onPress={() => { /* 광고 클릭 임시 비활성화 — 눌러도 이동 없음 */ }}
                        />
                      </View>
                    );
                  }
                  return <React.Fragment key={item.id}>{card}</React.Fragment>;
                })}
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
        onCancel={handleQuickCancel}
      />
      <Toast visible={quickToastVisible} message={quickToast} />
      {/* 기타 피커 */}
      <Modal visible={!!otherPickerItem} transparent animationType="slide" onRequestClose={() => setOtherPickerItem(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} accessibilityViewIsModal>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOtherPickerItem(null)} />
          <View style={ss.sheet}>
            <View style={ss.handle} />
            <Text style={ss.sheetTitle}>{t('social.friendPickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {dmFriends.map((f) => (
                <TouchableOpacity
                  key={f.handle}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const it = otherPickerItem;
                    setOtherPickerItem(null);
                    if (it) { sendRecord(f.handle, it); showQuickToast(t('comp2.toastSentTo', { name: f.name })); }
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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={s.container}>
      {/* 별 배경 (Stars.svg) — 콘텐츠 뒤에 깔린다 */}
      <StarFieldBackground />
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + 17 }]}>
        <Svg width={101} height={27} viewBox="0 0 101 27" fill="none">
          <Path
            d="M6.86637 13.5174C6.86637 13.8512 7.16437 14.1253 7.76039 14.3399C8.38024 14.5545 9.1193 14.7571 9.97756 14.9478C10.8597 15.1386 11.7298 15.4127 12.5881 15.7703C13.4702 16.1041 14.2093 16.6882 14.8053 17.5226C15.4251 18.357 15.7351 19.406 15.7351 20.6696C15.7351 22.7199 14.9722 24.2338 13.4464 25.2112C11.9206 26.1887 10.1087 26.6774 8.01071 26.6774C4.0055 26.6774 1.33535 25.2589 0.00028023 22.4219L5.18561 19.8113C5.63858 21.1226 6.56836 21.7782 7.97495 21.7782C9.04778 21.7782 9.58419 21.4563 9.58419 20.8126C9.58419 20.4789 9.28619 20.2047 8.69017 19.9901C8.09416 19.7756 7.36702 19.561 6.50876 19.3464C5.6505 19.1319 4.79224 18.8458 3.93398 18.4882C3.07571 18.1306 2.34858 17.5584 1.75256 16.7716C1.15655 15.9611 0.858541 14.9717 0.858541 13.8035C0.858541 11.8963 1.56184 10.4181 2.96843 9.36915C4.37503 8.32016 6.06771 7.79567 8.04648 7.79567C11.5749 7.79567 14.0305 9.17842 15.4132 11.9439L10.4067 14.1969C9.8822 13.1717 9.14314 12.6591 8.18952 12.6591C7.30742 12.6591 6.86637 12.9452 6.86637 13.5174ZM27.7409 26.6774C25.0946 26.6774 22.8417 25.7715 20.9821 23.9596C19.1226 22.1239 18.1928 19.8828 18.1928 17.2365C18.1928 14.5902 19.1226 12.3611 20.9821 10.5493C22.8417 8.71353 25.0946 7.79567 27.7409 7.79567C30.4111 7.79567 32.664 8.71353 34.4997 10.5493C36.3593 12.3611 37.2891 14.5902 37.2891 17.2365C37.2891 19.8828 36.3593 22.1239 34.4997 23.9596C32.664 25.7715 30.4111 26.6774 27.7409 26.6774ZM27.7409 20.9557C28.7899 20.9557 29.6482 20.61 30.3157 19.9186C31.0071 19.2272 31.3528 18.3332 31.3528 17.2365C31.3528 16.1399 31.0071 15.2459 30.3157 14.5545C29.6482 13.8631 28.7899 13.5174 27.7409 13.5174C26.7158 13.5174 25.8575 13.8631 25.1662 14.5545C24.4986 15.2459 24.1649 16.1399 24.1649 17.2365C24.1649 18.3332 24.4986 19.2272 25.1662 19.9186C25.8575 20.61 26.7158 20.9557 27.7409 20.9557ZM49.6269 26.6774C46.909 26.6774 44.6442 25.7715 42.8323 23.9596C41.0204 22.1477 40.1145 19.9067 40.1145 17.2365C40.1145 14.5664 41.0204 12.3254 42.8323 10.5135C44.6442 8.70161 46.909 7.79567 49.6269 7.79567C51.3911 7.79567 52.9884 8.21288 54.4188 9.0473C55.8731 9.88172 56.9936 11.0022 57.7803 12.4088L52.7023 15.3412C52.0586 14.173 51.0215 13.5889 49.5911 13.5889C48.5898 13.5889 47.7554 13.9346 47.0878 14.626C46.4203 15.2935 46.0865 16.1637 46.0865 17.2365C46.0865 18.3094 46.4203 19.1915 47.0878 19.8828C47.7554 20.5504 48.5898 20.8841 49.5911 20.8841C51.0692 20.8841 52.1063 20.2881 52.7023 19.0961L57.7803 22.0285C56.9936 23.4589 55.8731 24.5914 54.4188 25.4258C52.9884 26.2602 51.3911 26.6774 49.6269 26.6774ZM66.1283 5.82882C65.4607 6.49636 64.6621 6.83013 63.7323 6.83013C62.8025 6.83013 61.9919 6.49636 61.3006 5.82882C60.633 5.13745 60.2993 4.32687 60.2993 3.39708C60.2993 2.4673 60.633 1.66864 61.3006 1.0011C61.9919 0.333569 62.8025 -0.000199509 63.7323 -0.000199509C64.6621 -0.000199509 65.4607 0.333569 66.1283 1.0011C66.8197 1.66864 67.1653 2.4673 67.1653 3.39708C67.1653 4.32687 66.8197 5.13745 66.1283 5.82882ZM60.7641 26.1768V8.29632H66.7004V26.1768H60.7641ZM83.7849 8.29632H89.7212V26.1768H83.7849V24.5318C82.5691 25.9622 80.8764 26.6774 78.7069 26.6774C76.3228 26.6774 74.3202 25.7834 72.6991 23.9953C71.1017 22.1835 70.3031 19.9305 70.3031 17.2365C70.3031 14.5426 71.1017 12.3015 72.6991 10.5135C74.3202 8.70161 76.3228 7.79567 78.7069 7.79567C80.8764 7.79567 82.5691 8.51089 83.7849 9.94132V8.29632ZM77.3122 20.0616C78.0036 20.7769 78.9095 21.1345 80.03 21.1345C81.1505 21.1345 82.0565 20.7769 82.7479 20.0616C83.4392 19.3464 83.7849 18.4047 83.7849 17.2365C83.7849 16.0684 83.4392 15.1266 82.7479 14.4114C82.0565 13.6962 81.1505 13.3386 80.03 13.3386C78.9095 13.3386 78.0036 13.6962 77.3122 14.4114C76.6208 15.1266 76.2751 16.0684 76.2751 17.2365C76.2751 18.4047 76.6208 19.3464 77.3122 20.0616ZM94.2355 26.1768V0.0713234H100.172V26.1768H94.2355Z"
            fill={C.white}
          />
        </Svg>
        <TouchableOpacity
          style={s.addFriendBtn}
          onPress={() => navigation.navigate('Friends')}
          accessibilityLabel={t('social.dmA11y')}
        >
          <Svg width={29} height={27} viewBox="0 0 29 27" fill="none">
            <Path
              d="M11.0985 18.4679L23.3398 22.8466C23.5455 22.9205 23.7651 22.9475 23.9825 22.9257C24.2 22.9038 24.4098 22.8336 24.5966 22.7203C24.7835 22.6069 24.9426 22.4532 25.0625 22.2705C25.1823 22.0877 25.2597 21.8805 25.2892 21.6639L27.7865 2.78659C27.9385 1.63725 26.7478 0.77992 25.6972 1.27992L1.96518 12.6079C0.791842 13.1679 0.879842 14.8613 2.10651 15.2973L5.35984 16.4546L7.13317 17.0773M15.7998 20.1479L13.1465 24.5826C12.2798 25.6599 10.5345 25.0506 10.5345 23.6719V20.1213C10.5346 19.4512 10.7868 18.8057 11.2412 18.3133L21.9663 8.13452"
              stroke={C.white}
              strokeWidth={2.26667}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
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
    // 목업(iPhone 17 - 53.svg) 정확 배치: 워드마크 잉크 좌측 ≈36, DM 아이콘 우측 ≈35, 상단 정렬
    paddingLeft: 36,
    paddingRight: 31,
    paddingBottom: Spacing[3],
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.bold,
    color: C.white,
  },
  addFriendBtn: {
    padding: Spacing[1],
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
  // 빈 피드 기본 콘텐츠 (추천 친구 + CTA)
  emptyWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  emptySuggestTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 10,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  suggestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1F22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  suggestHandle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  suggestMeta: {
    fontSize: 11,
    color: C.dim,
    marginTop: 1,
  },
  emptyCta: {
    // 하단 탭의 활성 알약과 동일한 디자인: 보라 알약 + 밝은(#CECFCD) 테두리 + 보라 글로우
    marginTop: 18,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(206, 207, 205, 0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCtaLink: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyCtaLinkText: {
    fontSize: 13,
    color: C.dim,
    textDecorationLine: 'underline',
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

const vc = StyleSheet.create({
  bar: { paddingTop: 10, paddingBottom: 4, paddingHorizontal: 16, gap: 6 },
  label: { color: '#A1A1B0', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipOn: { borderColor: '#BF85FC', backgroundColor: 'rgba(191,133,252,0.18)' },
  chipTxt: { color: '#A1A1B0', fontSize: 13, fontWeight: '500' },
  chipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
});
