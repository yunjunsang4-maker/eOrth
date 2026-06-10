import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Image,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommentIcon } from '../components/icons';
import { useRecords, TravelRecord } from '../store/recordStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#5A5A6E',
  // 형식별 컬러
  feedAccent: '#58A6FF',
  feedBg: 'rgba(88,166,255,0.06)',
  blogAccent: '#A78BFA',
  blogBg: 'rgba(167,139,250,0.06)',
  albumAccent: '#FFA657',
  albumBg: 'rgba(255,166,87,0.06)',
  snapAccent: '#FFD60A',
  snapBg: 'rgba(255,214,10,0.06)',
  cutAccent: '#BF85FC',
  cutBg: 'rgba(191,133,252,0.06)',
};

const VIEW_CONFIG: Record<string, {
  icon: string;
  name: string;
  accent: string;
  gradient: [string, string];
}> = {
  feed: {
    icon: '📸',
    name: '피드',
    accent: COLORS.feedAccent,
    gradient: ['rgba(88,166,255,0.12)', 'rgba(88,166,255,0.02)'],
  },
  blog: {
    icon: '📝',
    name: '블로그',
    accent: COLORS.blogAccent,
    gradient: ['rgba(167,139,250,0.12)', 'rgba(167,139,250,0.02)'],
  },
  album: {
    icon: '📷',
    name: '사진첩',
    accent: COLORS.albumAccent,
    gradient: ['rgba(255,166,87,0.12)', 'rgba(255,166,87,0.02)'],
  },
  snap: {
    icon: '⚡',
    name: '스냅',
    accent: COLORS.snapAccent,
    gradient: ['rgba(255,214,10,0.12)', 'rgba(255,214,10,0.02)'],
  },
  cut: {
    icon: '🎞️',
    name: '스트립',
    accent: COLORS.cutAccent,
    gradient: ['rgba(191,133,252,0.12)', 'rgba(191,133,252,0.02)'],
  },
};

interface TripThumbnail {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
}

type RouteParams = {
  TripDetail: { trip: TripThumbnail };
};

export default function TripDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'TripDetail'>>();
  const { trip } = route.params;
  const { records, tripGroups, updateTripGroup, updateRecord, archiveRecord, deleteRecord, deleteTripGroup } = useRecords();

  const currentGroup = tripGroups.find((g) => g.id === trip.id);
  const titleToDisplay = currentGroup ? currentGroup.title : trip.title;

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(titleToDisplay);
  const [menuVisible, setMenuVisible] = useState(false); // 우측 상단 ☰ 편집 메뉴
  const [thumbPickerVisible, setThumbPickerVisible] = useState(false); // 썸네일 사진 선택

  useEffect(() => {
    setEditedTitle(titleToDisplay);
  }, [titleToDisplay]);

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      updateTripGroup(trip.id, { title: editedTitle.trim() });
      setIsEditing(false);
    }
  };

  // ── ☰ 편집 메뉴 액션 ──
  // 그룹 기반 카드만 보관/삭제/썸네일 변경 가능 (하드코딩 샘플 카드는 그룹이 없음)
  const groupRecordObjs = currentGroup
    ? (currentGroup.records.map((id) => records.find((r) => r.id === id)).filter(Boolean) as TravelRecord[])
    : [];
  const thumbCandidates = groupRecordObjs.flatMap((r) => r.medias ?? []);

  const handleChangeThumb = () => {
    setMenuVisible(false);
    if (!currentGroup || thumbCandidates.length === 0) {
      Alert.alert('알림', '변경할 수 있는 사진이 없어요.');
      return;
    }
    setThumbPickerVisible(true);
  };

  const handlePickThumb = (uri: string) => {
    if (!currentGroup) return;
    const owner = groupRecordObjs.find((r) => (r.medias ?? []).includes(uri));
    if (!owner) return;
    // 선택한 사진을 해당 기록의 맨 앞으로 + 그 기록을 대표 기록으로 → 프로필 카드 썸네일(medias[0]) 반영
    // representativePhoto(위치 조정 크롭본)가 남아 있으면 새 썸네일을 가리므로 함께 비운다
    updateRecord(owner.id, {
      medias: [uri, ...(owner.medias ?? []).filter((u) => u !== uri)],
      representativePhoto: undefined,
    });
    updateTripGroup(currentGroup.id, { coverRecordId: owner.id });
    setThumbPickerVisible(false);
  };

  const handleArchiveCard = () => {
    setMenuVisible(false);
    if (!currentGroup) {
      Alert.alert('알림', '샘플 여행 카드는 보관할 수 없어요.');
      return;
    }
    Alert.alert('기록카드 보관', '이 여행의 모든 기록이 보관함으로 이동하고, 프로필에서 카드가 숨겨져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '보관',
        onPress: () => {
          currentGroup.records.forEach((id) => archiveRecord(id));
          navigation.goBack();
        },
      },
    ]);
  };

  const handleDeleteCard = () => {
    setMenuVisible(false);
    if (!currentGroup) {
      Alert.alert('알림', '샘플 여행 카드는 삭제할 수 없어요.');
      return;
    }
    Alert.alert('기록카드 삭제', '이 여행의 모든 기록이 함께 삭제돼요. 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          currentGroup.records.forEach((id) => deleteRecord(id));
          deleteTripGroup(currentGroup.id);
          navigation.goBack();
        },
      },
    ]);
  };

  // 이 여행의 국가와 매칭되는 실제 기록 가져오기
  // 국가 없는 카드(사진첩 등 trip.country='')는 includes('')가 모든 기록을 통과시키므로
  // 그룹에 직접 묶인 기록만 사용한다.
  const matchedRecords = trip.country
    ? records.filter(
        (r) => r.countryName === trip.country || r.country?.includes(trip.country)
      )
    : groupRecordObjs;

  // viewType별 그룹
  const getRecordsByType = (viewType: string): TravelRecord[] => {
    return matchedRecords.filter((r) => (r.viewType || 'feed') === viewType);
  };

  // ── 포맷 콘솔: 기록이 있는 형식만 모듈 목록으로 표시, 탭하면 펼쳐짐 ──
  const FORMAT_ORDER = ['feed', 'blog', 'album', 'snap', 'cut'];
  const modules = FORMAT_ORDER
    .map((vt) => ({ vt, config: VIEW_CONFIG[vt], items: getRecordsByType(vt) }))
    .filter((m) => !!m.config && m.items.length > 0);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  // 애니메이션
  const headerAnim = useRef(new Animated.Value(0)).current;
  const moduleAnims = useRef(FORMAT_ORDER.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    moduleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: 1,
        delay: 150 + i * 110,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  const handleRecordPress = (rec: TravelRecord) => {
    // 기록 전체를 넘겨야 사진첩(medias)·본문 등 실제 콘텐츠가 상세 화면에 표시된다
    navigation.navigate('TripRecord', {
      record: rec,
      viewType: rec.viewType || 'feed',
    });
  };

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <Animated.View style={[s.header, { opacity: headerAnim }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          {isEditing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput
                value={editedTitle}
                onChangeText={setEditedTitle}
                style={s.headerInput}
                autoFocus
                onSubmitEditing={handleSaveTitle}
              />
              <TouchableOpacity onPress={handleSaveTitle} style={s.saveTitleBtn}>
                <Text style={s.saveTitleTxt}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setIsEditing(false); setEditedTitle(titleToDisplay); }} style={s.saveTitleBtn}>
                <Text style={s.saveTitleTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.headerTitle}>{titleToDisplay}</Text>
          )}
        </View>
        {/* ☰ 편집 메뉴 */}
        <TouchableOpacity style={s.backBtn} onPress={() => setMenuVisible(true)}>
          <View style={s.menuBars}>
            <View style={s.menuBar} />
            <View style={s.menuBar} />
            <View style={s.menuBar} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* 편집 메뉴 시트 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={s.menuSheet}>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setMenuVisible(false); setIsEditing(true); }}
            >
              <Text style={s.menuItemText}>✏️  제목 수정</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleChangeThumb}>
              <Text style={s.menuItemText}>🖼️  썸네일 사진 변경</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleArchiveCard}>
              <Text style={s.menuItemText}>📦  기록카드 보관</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleDeleteCard}>
              <Text style={[s.menuItemText, s.menuItemDanger]}>🗑️  기록카드 삭제</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 썸네일 사진 선택 시트 */}
      <Modal visible={thumbPickerVisible} transparent animationType="slide" onRequestClose={() => setThumbPickerVisible(false)}>
        <View style={s.thumbOverlay}>
          <View style={s.thumbSheet}>
            <Text style={s.thumbTitle}>썸네일 사진 변경</Text>
            <Text style={s.thumbSub}>프로필 여행 카드에 표시될 사진을 골라주세요.</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.thumbGrid}>
                {thumbCandidates.map((uri, i) => (
                  <TouchableOpacity key={uri + i} onPress={() => handlePickThumb(uri)} activeOpacity={0.85}>
                    <Image source={{ uri }} style={s.thumbCell} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={s.thumbCancel} onPress={() => setThumbPickerVisible(false)} activeOpacity={0.85}>
              <Text style={s.thumbCancelTxt}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 히어로 배너 */}
        <Animated.View style={[s.hero, {
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        }]}>
          <LinearGradient
            colors={[trip.color, 'rgba(10,10,15,0.8)', COLORS.bg]}
            style={s.heroBg}
          />
          <Text style={s.heroEmoji}>{trip.emoji}</Text>
          <Text style={s.heroDate}>{trip.date}</Text>
          <View style={s.heroPill}>
            <Text style={s.heroPillText}>{trip.records.length}개의 기록</Text>
          </View>
        </Animated.View>

        {/* ── 기록 포맷 콘솔: 네온 레일에 도킹된 형식별 모듈 목록 ── */}
        <View style={s.console}>
          {/* 에너지 레일 */}
          <LinearGradient
            colors={['rgba(191,133,252,0)', 'rgba(191,133,252,0.55)', 'rgba(191,133,252,0)']}
            style={s.rail}
          />

          {modules.map((m, idx) => {
            const open = expandedType === m.vt;
            const even = idx % 2 === 0;
            const thumbs = m.items.flatMap((r) => r.medias ?? []).slice(0, 3);
            const animStyle = {
              opacity: moduleAnims[idx],
              transform: [{
                translateX: moduleAnims[idx].interpolate({
                  inputRange: [0, 1],
                  outputRange: [even ? -48 : 48, 0],
                }),
              }],
            };
            return (
              <Animated.View key={m.vt} style={[s.moduleWrap, animStyle]}>
                {/* 레일 노드 + 커넥터 */}
                <View style={[s.railNode, { backgroundColor: m.config.accent, shadowColor: m.config.accent }]} />
                <View style={[s.railLink, { backgroundColor: m.config.accent + '55' }]} />

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setExpandedType(open ? null : m.vt)}
                  style={[
                    s.module,
                    even ? s.moduleCutA : s.moduleCutB,
                    { borderColor: open ? m.config.accent : m.config.accent + '38' },
                    even ? { marginRight: 22 } : { marginLeft: 22 },
                  ]}
                >
                  <LinearGradient
                    colors={m.config.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={[s.moduleEdge, { backgroundColor: m.config.accent, shadowColor: m.config.accent }]} />

                  <Text style={[s.moduleIndex, { color: m.config.accent }]}>
                    {String(idx + 1).padStart(2, '0')}
                  </Text>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.moduleCode, { color: m.config.accent + 'AA' }]}>
                      MODULE // {m.vt.toUpperCase()}
                    </Text>
                    <Text style={s.moduleName}>{m.config.icon} {m.config.name}</Text>
                    <View style={s.moduleMetaRow}>
                      <View style={[s.moduleDataLine, { backgroundColor: m.config.accent + '45' }]} />
                      <Text style={[s.moduleCount, { color: m.config.accent }]}>{m.items.length}개 기록</Text>
                    </View>
                  </View>

                  {thumbs.length > 0 ? (
                    <View style={s.thumbStack}>
                      {thumbs.map((uri, i) => (
                        <Image
                          key={i}
                          source={{ uri }}
                          style={[
                            s.thumbMini,
                            { marginLeft: i === 0 ? 0 : -14, transform: [{ rotate: `${(i - 1) * 7}deg` }] },
                          ]}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={s.moduleBigIcon}>{m.config.icon}</Text>
                  )}

                  <Text style={[s.moduleChevron, { color: m.config.accent }, open && s.moduleChevronOpen]}>❯</Text>
                </TouchableOpacity>

                {/* 펼침 — 해당 형식으로 기록된 것들 */}
                {open && (
                  <View style={[s.expandWrap, { borderLeftColor: m.config.accent + '44' }]}>
                    {m.items.map((record) => (
                      <TouchableOpacity
                        key={record.id}
                        activeOpacity={0.75}
                        onPress={() => handleRecordPress(record)}
                      >
                        {m.vt === 'feed' && <FeedCard record={record} accent={m.config.accent} />}
                        {m.vt === 'blog' && <BlogCard record={record} accent={m.config.accent} />}
                        {m.vt === 'album' && <AlbumCard record={record} accent={m.config.accent} />}
                        {m.vt === 'snap' && <SnapCard record={record} accent={m.config.accent} />}
                        {m.vt === 'cut' && <CutCard record={record} accent={m.config.accent} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Animated.View>
            );
          })}

          {modules.length === 0 && (
            <View style={s.emptyCard}>
              <Text style={s.emptyIcon}>🛰️</Text>
              <Text style={s.emptyText}>아직 이 여행에 기록이 없어요</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── 피드 카드 ───
function FeedCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.feed, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(88,166,255,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 상단 유저 */}
      <View style={card.feedHeader}>
        <View style={card.feedAvatar}>
          <Text style={card.feedAvatarEmoji}>{record.user.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.feedUserName}>{record.user.name}</Text>
          <Text style={card.feedDate}>{record.date}</Text>
        </View>
        <View style={[card.feedTypeBadge, { backgroundColor: accent + '15' }]}>
          <Text style={[card.feedTypeText, { color: accent }]}>피드</Text>
        </View>
      </View>
      {/* 본문 */}
      <Text style={card.feedContent} numberOfLines={3}>{record.content}</Text>
      {/* 하단 인터랙션 */}
      <View style={card.feedFooter}>
        <Text style={card.feedStat}>♥ {record.likes}</Text>
        <View style={card.feedStatRow}>
          <CommentIcon size={14} color="#A1A1B0" />
          <Text style={card.feedStat}>{record.comments}</Text>
        </View>
        {record.keywords && record.keywords.length > 0 && (
          <View style={card.feedTags}>
            {record.keywords.slice(0, 2).map((k) => (
              <Text key={k} style={[card.feedTag, { color: accent }]}>#{k}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── 모먼트 카드 ───
function MomentCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.moment, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(255,107,205,0.1)', 'rgba(255,107,205,0.02)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 감성 큰 따옴표 */}
      <Text style={[card.momentQuote, { color: accent + '30' }]}>"</Text>
      {/* 본문 (감성 강조) */}
      <Text style={card.momentContent}>{record.content}</Text>
      {/* 메모 */}
      {record.memo && (
        <View style={[card.momentMemoBox, { borderLeftColor: accent + '50' }]}>
          <Text style={card.momentMemo}>{record.memo}</Text>
        </View>
      )}
      {/* 하단 정보 */}
      <View style={card.momentFooter}>
        <Text style={card.momentDate}>{record.date}</Text>
        {record.weather && <Text style={card.momentWeather}>{record.weather}</Text>}
        {record.rating && (
          <Text style={[card.momentRating, { color: accent }]}>
            {'★'.repeat(record.rating)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 스토리보드 카드 ───
function StoryboardCard({ record, accent }: { record: TravelRecord; accent: string }) {
  // DAY 파싱
  const days = record.content.split('→').map((d) => d.trim());

  return (
    <View style={[card.story, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(126,231,135,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 타임라인 */}
      <View style={card.storyTimeline}>
        {days.map((day, i) => (
          <View key={i} style={card.storyDay}>
            <View style={card.storyNodeCol}>
              <View style={[card.storyNode, { backgroundColor: accent }]} />
              {i < days.length - 1 && (
                <View style={[card.storyConnector, { backgroundColor: accent + '30' }]} />
              )}
            </View>
            <View style={card.storyDayContent}>
              <Text style={card.storyDayText}>{day}</Text>
            </View>
          </View>
        ))}
      </View>
      {/* 하단 메타 */}
      <View style={card.storyMeta}>
        {record.startDate && record.endDate && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              {record.startDate} ~ {record.endDate}
            </Text>
          </View>
        )}
        {record.companions && record.companions.length > 0 && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              👥 {record.companions.join(', ')}
            </Text>
          </View>
        )}
        {record.budget && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              💰 {record.budget.amount.toLocaleString()}{record.budget.currency === 'KRW' ? '원' : record.budget.currency}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── 앨범 카드 ───
function AlbumCard({ record, accent }: { record: TravelRecord; accent: string }) {
  const medias = record.medias ?? [];
  const cells = medias.slice(0, 6);
  const extra = medias.length - cells.length; // 7장 이상이면 마지막 칸에 +N 표시
  return (
    <View style={[card.album, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(255,166,87,0.1)', 'rgba(255,166,87,0.02)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 사진첩 그리드 — 실제 사진이 있으면 썸네일, 없으면 플레이스홀더 */}
      <View style={card.albumGrid}>
        {cells.length > 0 ? (
          cells.map((uri, i) => (
            <View key={i} style={[card.albumCell, card.albumCellPhoto]}>
              <Image source={{ uri }} style={card.albumPhoto} resizeMode="cover" />
              {i === cells.length - 1 && extra > 0 && (
                <View style={card.albumMoreOverlay}>
                  <Text style={card.albumMoreTxt}>+{extra}</Text>
                </View>
              )}
            </View>
          ))
        ) : (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[card.albumCell, { backgroundColor: accent + (i < 2 ? '20' : '10') }]}>
              {i === 0 && <Text style={card.albumCellIcon}>🏔️</Text>}
              {i === 1 && <Text style={card.albumCellIcon}>🌅</Text>}
              {i === 2 && <Text style={card.albumCellIcon}>☁️</Text>}
              {i === 3 && <Text style={card.albumCellIcon}>🚠</Text>}
              {i === 4 && <Text style={card.albumCellIcon}>❄️</Text>}
              {i === 5 && <Text style={{ fontSize: 11, color: accent }}>+</Text>}
            </View>
          ))
        )}
      </View>
      {/* 설명 */}
      <Text style={card.albumContent} numberOfLines={2}>{record.content}</Text>
      {/* 하단 */}
      <View style={card.albumFooter}>
        <Text style={card.albumDate}>{record.date}</Text>
        {record.memo && (
          <Text style={[card.albumMemo, { color: accent }]} numberOfLines={1}>
            💡 {record.memo}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 블로그 카드 ───
function BlogCard({ record, accent }: { record: TravelRecord; accent: string }) {
  const getBlogExcerpt = () => {
    if (record.blogBlocks && record.blogBlocks.length > 0) {
      const textBlock = record.blogBlocks.find((b) => b.type === 'text');
      if (textBlock) return textBlock.value;
    }
    return record.content;
  };

  const getBlogTitle = () => {
    if (record.blogBlocks && record.blogBlocks.length > 0) {
      const headingBlock = record.blogBlocks.find((b) => b.type === 'heading');
      if (headingBlock) return headingBlock.value;
    }
    return '블로그 여행기';
  };

  return (
    <View style={[card.feed, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={[accent + '14', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={card.feedHeader}>
        <View style={[card.feedAvatar, { backgroundColor: accent + '12' }]}>
          <Text style={card.feedAvatarEmoji}>{record.user.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.feedUserName}>{record.user.name}</Text>
          <Text style={card.feedDate}>{record.date}</Text>
        </View>
        <View style={[card.feedTypeBadge, { backgroundColor: accent + '15' }]}>
          <Text style={[card.feedTypeText, { color: accent }]}>블로그</Text>
        </View>
      </View>
      <Text style={[card.feedTitle, { color: COLORS.white, marginBottom: 4 }]} numberOfLines={1}>
        {getBlogTitle()}
      </Text>
      <Text style={card.feedContent} numberOfLines={2}>
        {getBlogExcerpt()}
      </Text>
      <View style={card.feedFooter}>
        <Text style={card.feedStat}>♥ {record.likes}</Text>
        <Text style={card.feedStat}>💬 {record.comments}</Text>
      </View>
    </View>
  );
}

// ─── 스냅 카드 ───
function SnapCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.feed, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={[accent + '14', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={card.feedHeader}>
        <View style={[card.feedAvatar, { backgroundColor: accent + '12' }]}>
          <Text style={card.feedAvatarEmoji}>{record.user.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.feedUserName}>{record.user.name}</Text>
          <Text style={card.feedDate}>{record.date}</Text>
        </View>
        <View style={[card.feedTypeBadge, { backgroundColor: accent + '15' }]}>
          <Text style={[card.feedTypeText, { color: accent }]}>스냅</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
        {record.snapBackUri ? (
          <Image
            source={{ uri: record.snapBackUri }}
            style={{ width: 60, height: 80, borderRadius: 6, backgroundColor: '#222' }}
          />
        ) : (
          <View
            style={{
              width: 60,
              height: 80,
              borderRadius: 6,
              backgroundColor: '#2A2A3A',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 12, color: '#A1A1B0' }}>📸</Text>
          </View>
        )}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, color: '#FFF', fontStyle: 'italic' }}>
            "{record.snapCaption || '오늘의 순간'}"
          </Text>
          {record.snapLateSeconds !== undefined && (
            <Text style={{ fontSize: 11, color: accent, marginTop: 4 }}>
              ⏱ {record.snapLateSeconds}초 늦음
            </Text>
          )}
        </View>
      </View>
      <View style={card.feedFooter}>
        <Text style={card.feedStat}>♥ {record.likes}</Text>
        <Text style={card.feedStat}>💬 {record.comments}</Text>
      </View>
    </View>
  );
}

// ─── 스트립 카드 ───
function CutCard({ record, accent }: { record: TravelRecord; accent: string }) {
  const photos = record.cutPhoto?.photos ?? [];
  return (
    <View style={[card.feed, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={[accent + '14', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={card.feedHeader}>
        <View style={[card.feedAvatar, { backgroundColor: accent + '12' }]}>
          <Text style={card.feedAvatarEmoji}>{record.user.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.feedUserName}>{record.user.name}</Text>
          <Text style={card.feedDate}>{record.date}</Text>
        </View>
        <View style={[card.feedTypeBadge, { backgroundColor: accent + '15' }]}>
          <Text style={[card.feedTypeText, { color: accent }]}>스트립</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {photos.slice(0, 4).map((p, i) => (
          <Image
            key={i}
            source={{ uri: p }}
            style={{ width: 45, height: 60, borderRadius: 4, backgroundColor: '#222' }}
          />
        ))}
        {photos.length === 0 && (
          <View
            style={{
              width: 45,
              height: 60,
              borderRadius: 4,
              backgroundColor: '#2A2A3A',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 12, color: '#A1A1B0' }}>🎞️</Text>
          </View>
        )}
      </View>
      <Text style={card.feedContent} numberOfLines={1}>
        {record.content || '네컷 사진'}
      </Text>
      <View style={card.feedFooter}>
        <Text style={card.feedStat}>♥ {record.likes}</Text>
        <Text style={card.feedStat}>💬 {record.comments}</Text>
      </View>
    </View>
  );
}

// ─── 메인 스타일 ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 17, color: COLORS.white },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerFlag: { fontSize: 18 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white, letterSpacing: -0.3 },
  headerInput: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 120,
  },
  saveTitleBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTitleTxt: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  // 히어로
  hero: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 28,
    position: 'relative', overflow: 'hidden',
  },
  heroBg: { ...StyleSheet.absoluteFillObject, opacity: 0.7 },
  heroEmoji: { fontSize: 64, marginBottom: 10 },
  heroDate: { fontSize: 14, color: COLORS.textDim, fontWeight: '500', letterSpacing: 0.5 },
  heroPill: {
    marginTop: 8, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, backgroundColor: 'rgba(191,133,252,0.12)',
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.2)',
  },
  heroPillText: { fontSize: 12, color: COLORS.purpleNeon, fontWeight: '600' },
  // 섹션
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  sectionLine: { flex: 1, height: 1, borderRadius: 1 },
  // 빈 상태
  emptyCard: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },

  /* ── ☰ 편집 메뉴 ── */
  menuBars: { gap: 4, alignItems: 'center', justifyContent: 'center' },
  menuBar: { width: 16, height: 2, borderRadius: 1, backgroundColor: COLORS.white },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  menuSheet: {
    position: 'absolute', top: 100, right: 20, minWidth: 160,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    paddingVertical: 6, overflow: 'hidden',
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  menuItemDanger: { color: '#FF3B30' },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },

  /* ── 썸네일 사진 선택 시트 ── */
  thumbOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  thumbSheet: {
    backgroundColor: '#16121F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  thumbTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  thumbSub: { color: COLORS.textDim, fontSize: 13, marginBottom: 16 },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbCell: {
    width: (SCREEN_WIDTH - 40 - 16) / 3, height: (SCREEN_WIDTH - 40 - 16) / 3,
    borderRadius: 10, backgroundColor: '#1A0A2E',
  },
  thumbCancel: {
    marginTop: 16, paddingVertical: 14, borderRadius: 999, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  thumbCancelTxt: { color: COLORS.white, fontSize: 15, fontWeight: '600' },

  /* ── 기록 포맷 콘솔 (네온 레일 + 모듈) ── */
  console: { position: 'relative', paddingLeft: 30, paddingTop: 4 },
  rail: { position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, borderRadius: 1 },
  moduleWrap: { position: 'relative', marginBottom: 16 },
  railNode: {
    position: 'absolute', left: -23, top: 30, width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 6,
    zIndex: 2,
  },
  railLink: { position: 'absolute', left: -14, top: 34, width: 14, height: 1.5, borderRadius: 1 },
  module: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(26,26,38,0.85)',
    borderWidth: 1, paddingVertical: 14, paddingHorizontal: 14,
    overflow: 'hidden',
  },
  // 비대칭 컷 코너 — 짝수/홀수 모듈이 서로 거울 형태
  moduleCutA: { borderTopLeftRadius: 4, borderTopRightRadius: 24, borderBottomRightRadius: 4, borderBottomLeftRadius: 24 },
  moduleCutB: { borderTopLeftRadius: 24, borderTopRightRadius: 4, borderBottomRightRadius: 24, borderBottomLeftRadius: 4 },
  moduleEdge: {
    position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 5, elevation: 4,
  },
  moduleIndex: { fontSize: 18, fontWeight: '800', letterSpacing: 1, width: 30, textAlign: 'center' },
  moduleCode: { fontSize: 9, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  moduleName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  moduleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  moduleDataLine: { flex: 1, height: 1, maxWidth: 90 },
  moduleCount: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  thumbStack: { flexDirection: 'row', alignItems: 'center' },
  thumbMini: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#1A0A2E',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  moduleBigIcon: { fontSize: 22 },
  moduleChevron: { fontSize: 14, fontWeight: '800', marginLeft: 2 },
  moduleChevronOpen: { transform: [{ rotate: '90deg' }] },
  expandWrap: { marginTop: 10, marginLeft: 8, paddingLeft: 12, borderLeftWidth: 2 },
});

// ─── 카드 스타일 ───
const card = StyleSheet.create({
  // Feed
  feed: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  feedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  feedAvatar: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(88,166,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  feedAvatarEmoji: { fontSize: 18 },
  feedUserName: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  feedDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  feedTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  feedTypeText: { fontSize: 10, fontWeight: '700' },
  feedTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white, marginBottom: 4 },
  feedContent: { fontSize: 14, color: COLORS.white, lineHeight: 21, marginBottom: 12 },
  feedFooter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  feedStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedStat: { fontSize: 12, color: COLORS.textDim },
  feedTags: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  feedTag: { fontSize: 11, fontWeight: '600' },

  // Moment
  moment: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 20, marginBottom: 10, overflow: 'hidden',
    position: 'relative',
  },
  momentQuote: { fontSize: 48, fontWeight: '800', position: 'absolute', top: 8, left: 16 },
  momentContent: {
    fontSize: 15, color: COLORS.white, lineHeight: 24,
    fontStyle: 'italic', marginTop: 10, marginBottom: 12,
  },
  momentMemoBox: {
    borderLeftWidth: 2, paddingLeft: 10, marginBottom: 12,
  },
  momentMemo: { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  momentFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  momentDate: { fontSize: 11, color: COLORS.textMuted },
  momentWeather: { fontSize: 12 },
  momentRating: { fontSize: 11, marginLeft: 'auto' },

  // Storyboard
  story: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  storyTimeline: { marginBottom: 12 },
  storyDay: { flexDirection: 'row', minHeight: 36 },
  storyNodeCol: { width: 20, alignItems: 'center' },
  storyNode: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  storyConnector: { width: 2, flex: 1, marginTop: 2, marginBottom: 2, borderRadius: 1 },
  storyDayContent: { flex: 1, paddingLeft: 8, paddingBottom: 8 },
  storyDayText: { fontSize: 13, color: COLORS.white, lineHeight: 20 },
  storyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  storyMetaPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  storyMetaText: { fontSize: 11, fontWeight: '600' },

  // Album
  album: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  albumGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },
  albumCell: {
    width: (SCREEN_WIDTH - 40 - 32 - 30) / 3, height: 56,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  albumCellIcon: { fontSize: 20 },
  albumCellPhoto: { overflow: 'hidden', backgroundColor: '#1A0A2E' },
  albumPhoto: { width: '100%', height: '100%' },
  albumMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  albumMoreTxt: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  albumContent: { fontSize: 13, color: COLORS.white, lineHeight: 20, marginBottom: 10 },
  albumFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  albumDate: { fontSize: 11, color: COLORS.textMuted },
  albumMemo: { fontSize: 11, fontWeight: '500', flex: 1 },
});
