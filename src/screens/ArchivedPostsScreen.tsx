import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  Image,} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecords, TravelRecord } from '../store/recordStore';
import { useToast } from '../store/toastStore';
import { TrashIcon, LandscapeIcon, PersonIcon, ArchiveIcon } from '../components/icons';
import { andFitText } from '../utils/fitText';
import type { RootStackScreenProps } from '../navigation/types';
import { countryTagLabel } from '../utils/countryLabel';

const C = {
  bg: '#0A0A0F',
  card: '#1A0A2E',
  accent: '#BF85FC',
  accentDim: 'rgba(191,133,252,0.15)',
  accentBorder: 'rgba(191,133,252,0.25)',
  dim: '#A1A1B0',
  white: '#FFFFFF',
  divider: '#1A1A26',
};

// ─────────────────────────────────────────────
// 보관 게시물 카드
// ─────────────────────────────────────────────
function ArchivedCard({
  item,
  onPress,
  onUnarchive,
  onDelete,
}: {
  item: TravelRecord;
  onPress: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);

  // 실제 사진 표시 — 형식별 커버 우선순위 (없을 때만 자리표시자)
  const coverUri =
    item.representativePhoto ?? item.medias?.[0] ?? item.cutPhoto?.previewUri ?? item.snapFrontUri ?? null;

  const handleUnarchive = () => {
    setMenuVisible(false);
    onUnarchive(item.id);
  };

  const handleDeletePress = () => {
    setMenuVisible(false);
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
    // 카드 탭 → 상세 보기(PostDetail — 사진별 글 캐러셀 등 최신 렌더 공유)
    <Pressable style={s.card} onPress={() => onPress(item.id)}>
      {/* 카드 헤더 */}
      <View style={s.cardHeader}>
        <View style={s.avatar}>
          {item.user.photo ? (
            <Image source={{ uri: item.user.photo }} style={s.avatarImg} />
          ) : (
            <PersonIcon size={22} color="#A0A0B0" />
          )}
        </View>
        <View style={s.userInfo}>
          <Text style={s.userName}>{item.user.name}</Text>
          <View style={s.metaRow}>
            <Text style={s.countryTag}>{countryTagLabel(item.country, i18n.language)}</Text>
            <Text style={s.typeTag}>
              {item.viewType === 'blog' ? t('main.formatBlog') : item.viewType === 'snap' ? t('main.formatSnap') : item.viewType === 'cut' ? t('main.formatCut') : item.viewType === 'album' ? t('main.formatAlbum') : t('main.formatFeed')}
            </Text>
            <Text style={s.dateMeta}>{item.date}</Text>
          </View>
        </View>
        <View>
          <TouchableOpacity onPress={() => setMenuVisible((v) => !v)} accessibilityRole="button" accessibilityLabel={t('social.moreA11y')}>
            <Text style={s.moreIcon}>···</Text>
          </TouchableOpacity>
          {menuVisible && (
            <>
              <Pressable style={s.menuOverlay} onPress={() => setMenuVisible(false)} />
              <View style={s.dropdownMenu}>
                <TouchableOpacity style={s.menuItem} onPress={handleUnarchive} activeOpacity={0.7}>
                  <ArchiveIcon size={16} color="#FFFFFF" />
                  <Text style={s.menuItemText}>{t('misc.unarchive')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.delete')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* 사진 — 실제 커버, 없으면 자리표시자 */}
      {coverUri ? (
        <Image source={{ uri: coverUri }} style={s.photo} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1A0A2E', '#3B1E8E']} style={s.photo}>
          <LandscapeIcon size={48} color="#A1A1B0" />
        </LinearGradient>
      )}

      {/* 본문 미리보기 — memo(대표 사진 글) 우선, 없으면 제목 */}
      <View style={s.cardBody}>
        <Text style={s.content} numberOfLines={3}>{item.memo || item.content}</Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// 보관된 게시물 화면
// ─────────────────────────────────────────────
export default function ArchivedPostsScreen({ navigation }: RootStackScreenProps<'ArchivedPosts'>) {
  const { t } = useTranslation();
  useSkinAccent(); // 스킨(아이콘 팔레트) 변경 구독 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const { records, archivedIds, unarchiveRecord, deleteRecord } = useRecords();
  const { pushToast } = useToast(); // 공용 토스트(자체 구현 대체)

  // 기록 형식 필터링 상태 추가
  const [activeTab, setActiveTab] = useState<'all' | 'feed' | 'blog' | 'album' | 'snap' | 'cut'>('all');

  const archivedRecords = records.filter((r) => archivedIds.includes(r.id));

  // 개수 계산
  const counts = {
    all: archivedRecords.length,
    feed: archivedRecords.filter((r) => r.viewType === 'feed' || !r.viewType).length,
    blog: archivedRecords.filter((r) => r.viewType === 'blog').length,
    album: archivedRecords.filter((r) => r.viewType === 'album').length,
    snap: archivedRecords.filter((r) => r.viewType === 'snap').length,
    cut: archivedRecords.filter((r) => r.viewType === 'cut').length,
  };

  // 필터링된 보관 기록
  const filteredRecords = archivedRecords.filter((r) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'feed') return r.viewType === 'feed' || !r.viewType;
    return r.viewType === activeTab;
  });

  const TAB_LABELS = {
    all: t('misc.all'),
    feed: t('main.formatFeed'),
    blog: t('main.formatBlog'),
    album: t('main.formatAlbum'),
    snap: t('main.formatSnap'),
    cut: t('main.formatCut'),
  };

  const handleUnarchive = (id: string) => {
    unarchiveRecord(id);
    pushToast(t('misc.unarchivedToast'));
  };

  // 카드 탭 → 상세 보기 (최신 PostDetail 렌더 공유)
  const handleOpen = (id: string) => {
    navigation.navigate('PostDetail', { postId: id });
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
  };

  const getEmptyMessage = () => {
    if (activeTab === 'all') return t('misc.noArchived');
    return t('misc.noArchivedTab', { label: TAB_LABELS[activeTab] });
  };

  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('misc.archivedTitle')}</Text>
        <View style={s.headerPlaceholder} />
      </View>

      {/* 기록 형식 필터 탭바 */}
      <View style={s.tabBar}>
        {(['all', 'feed', 'blog', 'album', 'snap', 'cut'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tabItem, isActive && s.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, isActive && s.tabTextActive]} {...andFitText}>
                {TAB_LABELS[tab]} <Text style={[s.tabCount, isActive && s.tabCountActive]}>{counts[tab]}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredRecords.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyEmoji}>📦</Text>
          <Text style={s.emptyText}>{getEmptyMessage()}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
          >
            {filteredRecords.map((item) => (
              <ArchivedCard
                key={item.id}
                item={item}
                onPress={handleOpen}
                onUnarchive={handleUnarchive}
                onDelete={handleDelete}
              />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 탭바 스타일
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.bg,
  },
  tabItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accentBorder,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.dim,
  },
  tabTextActive: {
    color: C.white,
    fontWeight: '700',
  },
  tabCount: {
    fontSize: 10,
    color: C.dim,
    opacity: 0.6,
  },
  tabCountActive: {
    color: C.accent,
    opacity: 1,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 30,
    color: C.white,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: C.white,
  },
  headerPlaceholder: {
    width: 40,
  },

  // 스크롤
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // 카드
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(191,133,252,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  userInfo: { flex: 1 },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.white,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  countryTag: {
    fontSize: 11,
    color: C.accent,
    backgroundColor: C.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeTag: {
    fontSize: 10,
    color: C.white,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '500',
  },
  dateMeta: {
    fontSize: 11,
    color: C.dim,
  },
  moreIcon: {
    color: C.dim,
    fontSize: 18,
    letterSpacing: 2,
  },

  // 드롭다운 메뉴
  menuOverlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    width: 5000,
    height: 5000,
    zIndex: 99,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#2E2E3B',
    borderRadius: 12,
    width: 160,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 14,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    gap: 10,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.white,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#3A3A4A',
  },

  // 사진
  photo: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 본문
  cardBody: {
    padding: 16,
  },
  content: {
    fontSize: 13,
    color: C.white,
    lineHeight: 20,
  },

  // 빈 상태
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 14,
    color: C.dim,
  },
});
