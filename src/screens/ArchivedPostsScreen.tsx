import React, { useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecords, TravelRecord } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { useToast } from '../store/toastStore';
import { andFitText } from '../utils/fitText';
import type { RootStackScreenProps } from '../navigation/types';
// 소셜탭 피드와 동일한 매거진 카드(DiaryCard)·높이 추정치를 그대로 재사용해 형태를 통일한다.
import { DiaryCardMemo, estDiaryHeight } from './SocialScreen';

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

const noop = () => {}; // 아카이브 화면에서 안 쓰는 콜백(빠른공유·차단·신고 등) 자리채움

// ─────────────────────────────────────────────
// 보관된 게시물 화면
// ─────────────────────────────────────────────
export default function ArchivedPostsScreen({ navigation }: RootStackScreenProps<'ArchivedPosts'>) {
  const { t } = useTranslation();
  useSkinAccent(); // 스킨(아이콘 팔레트) 변경 구독 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const { records, archivedIds, unarchiveRecord, deleteRecord, toggleLike } = useRecords();
  const { diaryCardMode, showCounts } = useSettings();
  const { pushToast } = useToast(); // 공용 토스트(자체 구현 대체)
  // DiaryCard의 빠른공유 팬 제스처가 요구하는 드래그 좌표 — 이 화면에선 no-op이라 더미 값이면 충분
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

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

  const handleDelete = (id: string) => {
    deleteRecord(id);
  };

  const getEmptyMessage = () => {
    if (activeTab === 'all') return t('misc.noArchived');
    return t('misc.noArchivedTab', { label: TAB_LABELS[activeTab] });
  };

  // 소셜탭과 동일한 높이 추정 기반 2단 균형 분배
  const columns: TravelRecord[][] = [[], []];
  const colH = [0, 0];
  filteredRecords.forEach((item) => {
    const c = colH[0] <= colH[1] ? 0 : 1;
    columns[c].push(item);
    colH[c] += estDiaryHeight(item, diaryCardMode);
  });

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
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* 소셜탭 피드와 동일한 2단 매거진 카드 배치 */}
          <View style={s.masonry}>
            {[0, 1].map((ci) => (
              <View key={ci} style={s.col}>
                {columns[ci].map((item) => (
                  <DiaryCardMemo
                    key={item.id}
                    item={item}
                    mode={diaryCardMode}
                    navigation={navigation}
                    variant="archived"
                    toggleLike={toggleLike}
                    showCounts={showCounts}
                    onUnarchive={handleUnarchive}
                    onDelete={handleDelete}
                    onArchive={noop}
                    onBlock={noop}
                    onReport={noop}
                    onToggleVisibility={noop}
                    onQuickStart={noop}
                    onQuickMove={noop}
                    onQuickEnd={noop}
                    onQuickCancel={noop}
                    dragPos={dragPos}
                    columnIndex={ci}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
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

  // 스크롤 + 2단 매거진 (소셜탭과 동일)
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  masonry: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 12 },

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
