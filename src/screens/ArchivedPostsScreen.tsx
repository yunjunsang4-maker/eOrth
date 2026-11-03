import React, { useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Text } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecordData, useRecordActions, TravelRecord } from '../store/recordStore';
import { useToast } from '../store/toastStore';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G } from 'react-native-svg';
import { AutoPillRing } from '../components/record/CalendarBottomSheet';
import { SETTINGS_COLORS, SettingsHeader } from '../components/settings/SettingsUI';
import type { RootStackScreenProps } from '../navigation/types';
// 소셜탭 피드와 동일한 매거진 카드(DiaryCard)·높이 추정치를 그대로 재사용해 형태를 통일한다.
import { DiaryCardMemo, estDiaryHeight } from './SocialScreen';

const C = {
  bg: SETTINGS_COLORS.bg,
  count: '#A78BFA',
  white: '#FFFFFF',
};

const noop = () => {}; // 아카이브 화면에서 안 쓰는 콜백(빠른공유·차단·신고 등) 자리채움

// 2026-11-03 시안 탭 알약 채움 — 위→아래 세로 그라데이션(활성은 한 단계 밝게)
const TAB_FILL = ['#0D0E12', '#17171B'] as const;
const TAB_FILL_ACTIVE = ['#1D1E21', '#28282C'] as const;
const EMPTY_ICON_COLOR = '#9CA3AF'; // 차단한 사용자 빈 상태 금지 표식과 같은 회색

// 빈 상태 아이콘 — 시안의 겹친 북마크 2장(74×74). 앞 장을 배경색 굵은 테두리로 칠해 뒷장과 사이 틈을 낸다.
const BOOKMARK_D = 'M0 12A12 12 0 0 1 12 0H38A12 12 0 0 1 50 12V56.5A2.5 2.5 0 0 1 46.4 58.7L25 50L3.6 58.7A2.5 2.5 0 0 1 0 56.5Z';
const StackedBookmarksIcon = () => (
  <Svg width={74} height={74} viewBox="0 0 74 74">
    <G transform="translate(24 0)"><Path d={BOOKMARK_D} fill={EMPTY_ICON_COLOR} /></G>
    <G transform="translate(1 14)">
      <Path d={BOOKMARK_D} fill="none" stroke={SETTINGS_COLORS.bg} strokeWidth={8} strokeLinejoin="round" />
      <Path d={BOOKMARK_D} fill={EMPTY_ICON_COLOR} />
    </G>
  </Svg>
);

// ─────────────────────────────────────────────
// 보관된 게시물 화면
// ─────────────────────────────────────────────
export default function ArchivedPostsScreen({ navigation }: RootStackScreenProps<'ArchivedPosts'>) {
  const { t } = useTranslation();
  useSkinAccent(); // 스킨(아이콘 팔레트) 변경 구독 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const { records, archivedIds } = useRecordData();
  const { unarchiveRecord, deleteRecord, toggleLike } = useRecordActions();
  const { pushToast } = useToast(); // 공용 토스트(자체 구현 대체)
  // DiaryCard의 빠른공유 팬 제스처가 요구하는 드래그 좌표 — 이 화면에선 no-op이라 더미 값이면 충분
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // 기록 형식 필터링 상태 추가
  const [activeTab, setActiveTab] = useState<'all' | 'feed' | 'blog' | 'album' | 'snap' | 'cut'>('all');

  const archivedRecords = records.filter((r) => archivedIds.includes(r.id));

  // 과거 여행 불러오기가 카드만 세우려고 만든 '표지 전용' 기록 판정.
  // viewType은 'album'이지만 사용자가 만든 사진첩이 아니라, 사진첩 탭·개수에서 뺀다.
  //
  // ⚠️ '전체' 탭에서까지 빼면 안 된다 — 여행 카드를 보관하면 그 안의 기록이 전부 보관되는데
  //    (TripDetail의 카드 보관), 표지가 목록에 안 뜨면 보관 해제할 방법이 없어져
  //    카드가 프로필에서 영영 사라진다(기록 0개인 카드는 프로필 목록에서 빠진다).
  const isCover = (r: TravelRecord) => !!r.isImportCover;

  // 개수 계산
  const counts = {
    all: archivedRecords.length,
    feed: archivedRecords.filter((r) => r.viewType === 'feed' || !r.viewType).length,
    blog: archivedRecords.filter((r) => r.viewType === 'blog').length,
    album: archivedRecords.filter((r) => r.viewType === 'album' && !isCover(r)).length,
    snap: archivedRecords.filter((r) => r.viewType === 'snap').length,
    cut: archivedRecords.filter((r) => r.viewType === 'cut').length,
  };

  // 필터링된 보관 기록
  const filteredRecords = archivedRecords.filter((r) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'feed') return r.viewType === 'feed' || !r.viewType;
    if (activeTab === 'album') return r.viewType === 'album' && !isCover(r);
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
    // 보관함은 '간단히 보기' 설정을 적용하지 않는다 — 보관 해제·삭제 ⋯ 메뉴가 full 카드 푸터에 있어서
    // 설정을 따르면 minimal 사용자는 보관함에서 꺼낼 방법이 사라진다. 카드 mode도 아래에서 'full' 고정.
    colH[c] += estDiaryHeight(item, 'full');
  });

  return (
    <SafeAreaView style={s.safeArea}>
      <SettingsHeader title={t('misc.archivedTitle')} onBack={() => navigation.goBack()} backA11yLabel={t('friends.back')} />

      {/* 기록 형식 필터 탭바 */}
      {/* 2026-11-03 시안: 가로 스크롤 알약(높이 30·간격 12) — 그라데이션 채움 + 공용 대각 링 */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {(['all', 'feed', 'blog', 'album', 'snap', 'cut'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <View key={tab} style={s.tabItem}>
                <LinearGradient colors={isActive ? TAB_FILL_ACTIVE : TAB_FILL} style={[StyleSheet.absoluteFill, s.tabFill]} pointerEvents="none" />
                <AutoPillRing />
                <TouchableOpacity style={s.tabInner} onPress={() => setActiveTab(tab)} activeOpacity={0.7}>
                  <Text style={[s.tabText, isActive && s.tabTextActive]} numberOfLines={1}>
                    {TAB_LABELS[tab]} <Text style={[s.tabCount, isActive && s.tabCountActive]}>{counts[tab]}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {filteredRecords.length === 0 ? (
        // 빈 상태 — 회색 겹친 북마크 + 흰 제목 18, 세로 가운데보다 조금 위(차단한 사용자 빈 상태와 같은 배치)
        <View style={s.emptyContainer}>
          <StackedBookmarksIcon />
          <Text style={s.emptyTitle}>{getEmptyMessage()}</Text>
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
                    mode="full"
                    navigation={navigation}
                    variant="archived"
                    toggleLike={toggleLike}
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
  // 시안: 탭 줄 높이 52(위아래 11 + 알약 30), 아래 헤더와 같은 0.8pt 흰 15% 구분선
  tabBar: {
    borderBottomWidth: 0.8,
    borderBottomColor: SETTINGS_COLORS.line,
    backgroundColor: C.bg,
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  // 링(AutoPillRing) 때문에 borderWidth·overflow hidden 금지 — 채움은 LinearGradient 자체 모서리로
  tabItem: {
    height: 30,
    borderRadius: 15,
  },
  tabFill: { borderRadius: 15 },
  tabInner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: SETTINGS_COLORS.text50,
  },
  tabTextActive: {
    color: C.white,
    fontWeight: '700',
  },
  // 개수 — 시안 #A78BFA, 비활성은 반투명
  tabCount: {
    fontSize: 12,
    color: C.count,
    opacity: 0.5,
  },
  tabCountActive: {
    opacity: 1,
  },

  // 스크롤 + 2단 매거진 (소셜탭과 동일)
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  masonry: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 12 },

  // 빈 상태 — 가운데 정렬 후 paddingBottom만큼 위로(시안: 묶음 중심이 본문 중심보다 ~60 위)
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 120,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center', marginTop: 20 },
});
