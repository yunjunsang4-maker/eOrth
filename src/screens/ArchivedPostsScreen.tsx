import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecords } from '../store/recordStore';
import { TrashIcon, LandscapeIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

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
  onUnarchive,
  onDelete,
}: {
  item: any;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);

  const handleUnarchive = () => {
    setMenuVisible(false);
    onUnarchive(item.id);
  };

  const handleDeletePress = () => {
    setMenuVisible(false);
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
    <View style={s.card}>
      {/* 카드 헤더 */}
      <View style={s.cardHeader}>
        <View style={s.avatar}>
          <Text style={{ fontSize: 22 }}>{item.user.emoji}</Text>
        </View>
        <View style={s.userInfo}>
          <Text style={s.userName}>{item.user.name}</Text>
          <View style={s.metaRow}>
            <Text style={s.countryTag}>{item.country}</Text>
            <Text style={s.typeTag}>
              {item.viewType === 'blog' ? '블로그' : item.viewType === 'snap' ? '스냅' : item.viewType === 'cut' ? '스트립' : '피드'}
            </Text>
            <Text style={s.dateMeta}>{item.date}</Text>
          </View>
        </View>
        <View>
          <TouchableOpacity onPress={() => setMenuVisible((v) => !v)}>
            <Text style={s.moreIcon}>···</Text>
          </TouchableOpacity>
          {menuVisible && (
            <>
              <Pressable style={s.menuOverlay} onPress={() => setMenuVisible(false)} />
              <View style={s.dropdownMenu}>
                <TouchableOpacity style={s.menuItem} onPress={handleUnarchive} activeOpacity={0.7}>
                  <Text style={s.menuItemIcon}>📤</Text>
                  <Text style={s.menuItemText}>보관 해제</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDeletePress} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>삭제</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* 사진 */}
      <LinearGradient colors={['#1A0A2E', '#3B1E8E']} style={s.photo}>
        <LandscapeIcon size={48} color="#A1A1B0" />
      </LinearGradient>

      {/* 본문 */}
      <View style={s.cardBody}>
        <Text style={s.content}>{item.content}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// 토스트
// ─────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={s.toast} pointerEvents="none">
      <Text style={s.toastText}>{message}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// 보관된 게시물 화면
// ─────────────────────────────────────────────
export default function ArchivedPostsScreen({ navigation }: RootStackScreenProps<'ArchivedPosts'>) {
  const { records, archivedIds, unarchiveRecord, deleteRecord } = useRecords();
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 기록 형식 필터링 상태 추가
  const [activeTab, setActiveTab] = useState<'all' | 'feed' | 'blog' | 'snap' | 'cut'>('all');

  const archivedRecords = records.filter((r) => archivedIds.includes(r.id));

  // 개수 계산
  const counts = {
    all: archivedRecords.length,
    feed: archivedRecords.filter((r) => r.viewType === 'feed' || !r.viewType).length,
    blog: archivedRecords.filter((r) => r.viewType === 'blog').length,
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
    all: '전체',
    feed: '피드',
    blog: '블로그',
    snap: '스냅',
    cut: '스트립',
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message: msg });
    toastTimer.current = setTimeout(() => setToast({ visible: false, message: '' }), 2500);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleUnarchive = (id: string) => {
    unarchiveRecord(id);
    showToast('게시물이 소셜 탭에 다시 표시돼요');
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
  };

  const getEmptyMessage = () => {
    if (activeTab === 'all') return '보관된 게시물이 없어요';
    return `보관된 ${TAB_LABELS[activeTab]}이 없어요`;
  };

  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>보관된 게시물</Text>
        <View style={s.headerPlaceholder} />
      </View>

      {/* 기록 형식 필터 탭바 */}
      <View style={s.tabBar}>
        {(['all', 'feed', 'blog', 'snap', 'cut'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tabItem, isActive && s.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, isActive && s.tabTextActive]}>
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
                onUnarchive={handleUnarchive}
                onDelete={handleDelete}
              />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
          <Toast message={toast.message} visible={toast.visible} />
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
  menuItemIcon: {
    fontSize: 16,
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

  // 토스트
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,30,46,0.96)',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
  },
  toastText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
  },
});
