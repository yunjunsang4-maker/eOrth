import React, { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Animated,
  Dimensions,
} from 'react-native';
import TripRecordRenderer from '../components/TripRecordRenderer';
import * as ImagePicker from 'expo-image-picker';
import { MAX_ALBUM_PHOTOS } from './AlbumCreateScreen';
import { MAX_RECORD_PHOTOS_PREMIUM } from '../constants/limits';
import { useSettings } from '../store/settingsStore';
import {
  sectionSlices, addPhotosToSection,
  deleteSection, newSectionId, normalizeSections, reorderWithinRange,
  moveSection, removePhotosAt, movePhotosToSection,
} from '../utils/albumSections';
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
  const { records, deleteRecord, updateRecord, toggleLike, commentsByPost, addComment, tripGroups, updateTripGroup } = useRecords();
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

  // ── 사진첩(앨범) 사진 추가/삭제/이동 + 섹션 관리 ──
  // updateRecord가 로컬 영속 복사 + 서버(updatePost) 동기화까지 처리한다.
  const medias = record.medias ?? [];
  // 사진 상한 — 프리미엄이면 100장(기록 사진 혜택과 동일), 아니면 30장
  const { isPremium } = useSettings();
  const albumMax = isPremium ? MAX_RECORD_PHOTOS_PREMIUM : MAX_ALBUM_PHOTOS;
  const sections = record.albumSections && record.albumSections.length > 0
    ? normalizeSections(record.albumSections, medias.length)
    : null;

  const handleAlbumAddPhotos = async (sectionIndex?: number) => {
    if (medias.length >= albumMax) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: albumMax - medias.length,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.length) return;
      const uris = res.assets.map((a) => a.uri).slice(0, albumMax - medias.length);
      if (sections && sectionIndex != null) {
        const next = addPhotosToSection(medias, sections, sectionIndex, uris);
        updateRecord(record.id, { medias: next.medias, albumSections: next.sections, representativePhoto: record.representativePhoto ?? next.medias[0] });
      } else {
        const nextMedias = [...medias, ...uris];
        updateRecord(record.id, {
          medias: nextMedias,
          // 섹션 사용 중이면 평면 추가는 마지막 섹션으로 흡수(normalize 규칙과 일치)
          albumSections: sections ? normalizeSections(sections, nextMedias.length) : record.albumSections,
          representativePhoto: record.representativePhoto ?? nextMedias[0],
        });
      }
    } catch {
      /* 픽커 취소/실패 — 무시 */
    }
  };

  // 사진 제거 공용(단일/다중) — 섹션 counts 정합 + 대표 사진 승계 + 여행카드 커버 동기화
  const doDeletePhotos = (indexes: number[]) => {
    const next = removePhotosAt(medias, sections, indexes);
    const rm = new Set(indexes);
    const coverDeleted = !!record.representativePhoto && medias.some((u, i) => rm.has(i) && u === record.representativePhoto);
    const nextRep = coverDeleted ? next.medias[0] : record.representativePhoto;
    updateRecord(record.id, {
      medias: next.medias,
      albumSections: sections ? next.sections ?? undefined : record.albumSections,
      representativePhoto: nextRep,
    });
    // 여행카드 썸네일은 group.coverUri(크롭본 등 오버라이드)를 최우선으로 쓰므로,
    // 대표 사진이 바뀌면 이 기록을 커버로 쓰는 카드의 coverUri도 새 대표로 동기화(스테일 방지)
    if (coverDeleted) {
      tripGroups
        .filter((g) => g.coverRecordId === record.id && g.coverUri)
        .forEach((g) => updateTripGroup(g.id, { coverUri: nextRep }));
    }
  };
  const doDeletePhoto = (index: number) => doDeletePhotos([index]);

  // ── 다중 선택 모드 ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const exitSelecting = () => { setSelecting(false); setSelected([]); };
  const toggleSelect = (idx: number) =>
    setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));

  // ── 이동 대상 섹션 선택 시트 (단일/다중 공용) ──
  const [moveSheet, setMoveSheet] = useState<{ indexes: number[] } | null>(null);
  const handleMoveTo = (targetSection: number) => {
    if (!moveSheet || !sections) { setMoveSheet(null); return; }
    const next = movePhotosToSection(medias, sections, moveSheet.indexes, targetSection);
    updateRecord(record.id, { medias: next.medias, albumSections: next.sections });
    setMoveSheet(null);
    exitSelecting();
  };

  // 다중 선택 모드 진입 — 사진 꾹 누르기는 순서 편집에 배정돼, 이동/삭제는 선택 모드(액션 바)로 처리
  const startSelecting = () => { setSelecting(true); setSelected([]); };

  // 뷰어에서 커버(대표 사진) 지정 — 이 앨범을 커버로 쓰는 여행카드 썸네일(크롭 오버라이드 포함)도 동기화
  const handleSetCover = (index: number) => {
    const uri = medias[index];
    if (!uri) return;
    updateRecord(record.id, { representativePhoto: uri, representativePhotoSource: uri });
    tripGroups
      .filter((g) => g.coverRecordId === record.id && g.coverUri)
      .forEach((g) => updateTripGroup(g.id, { coverUri: uri }));
    Alert.alert(t('trip.albumCoverSet'));
  };

  // 다중 삭제 확인
  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotosMsg', { count: selected.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => { doDeletePhotos(selected); exitSelecting(); } },
    ]);
  };

  // ── 사진 순서 변경 (제자리 드래그 — 프로필 카드와 동일 UX, 렌더러에서 처리) ──
  const [scrollEnabled, setScrollEnabled] = useState(true); // 드래그 중 스크롤 잠금

  // 드래그 중 가장자리 자동 스크롤 — 화면 밖 슬롯으로도 끌고 갈 수 있게 한다.
  // 스크롤한 만큼(dragScroll)을 렌더러가 타일 위치·목적지 계산에 더해 손가락과 어긋나지 않는다.
  const albumScrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const contentHRef = useRef(0);
  const layoutHRef = useRef(0);
  const dragPageYRef = useRef<number | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragScroll = useRef({ anim: new Animated.Value(0), value: 0 }).current;
  useEffect(() => () => { if (autoScrollTimerRef.current) clearInterval(autoScrollTimerRef.current); }, []);

  const handleAlbumDragState = (dragging: boolean) => {
    setScrollEnabled(!dragging);
    if (dragging) {
      dragPageYRef.current = null;
      if (autoScrollTimerRef.current) clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = setInterval(() => {
        const py = dragPageYRef.current;
        if (py == null) return;
        const WIN_H = Dimensions.get('window').height;
        const EDGE = 130;  // 가장자리 감지 폭
        const STEP = 14;   // 프레임당 스크롤량
        const dir = py < EDGE ? -1 : py > WIN_H - EDGE ? 1 : 0;
        if (!dir) return;
        const max = Math.max(0, contentHRef.current - layoutHRef.current);
        const next = Math.max(0, Math.min(max, scrollYRef.current + dir * STEP));
        if (next === scrollYRef.current) return;
        dragScroll.value += next - scrollYRef.current;
        dragScroll.anim.setValue(dragScroll.value);
        scrollYRef.current = next;
        albumScrollRef.current?.scrollTo({ y: next, animated: false });
      }, 16);
    } else {
      if (autoScrollTimerRef.current) { clearInterval(autoScrollTimerRef.current); autoScrollTimerRef.current = null; }
      dragPageYRef.current = null;
    }
  };

  // 꾹 눌러 끌기 안내 — 한 번이라도 순서 변경에 성공하면 더 이상 표시하지 않는다 (기기 저장)
  const ALBUM_HINT_KEY = 'eorth.albumDragHintSeen';
  const [reorderHintSeen, setReorderHintSeen] = useState(true); // 로드 전 깜빡임 방지: 기본 숨김
  useEffect(() => {
    AsyncStorage.getItem(ALBUM_HINT_KEY)
      .then((v) => { if (!v) setReorderHintSeen(false); })
      .catch(() => {});
  }, []);

  const handleReorder = (section: number | 'flat', fromIdx: number, toIdx: number) => {
    const start = section === 'flat' || !sections
      ? 0
      : sectionSlices(sections, medias.length)[section]?.start ?? 0;
    const next = reorderWithinRange(medias, start, fromIdx, toIdx);
    if (next !== medias) {
      updateRecord(record.id, { medias: next });
      if (!reorderHintSeen) {
        setReorderHintSeen(true);
        AsyncStorage.setItem(ALBUM_HINT_KEY, '1').catch(() => {});
      }
    }
  };
  const handleReorderRemove = (globalIndex: number) => {
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotoMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => doDeletePhoto(globalIndex) },
    ]);
  };

  // ── 섹션 추가/이름변경 모달 ──
  const [sectionModal, setSectionModal] = useState<{ mode: 'add' } | { mode: 'rename'; index: number } | { mode: 'albumTitle' } | null>(null);
  const [sectionTitleInput, setSectionTitleInput] = useState('');
  const openAddSection = () => { setSectionTitleInput(''); setSectionModal({ mode: 'add' }); };
  const confirmSectionModal = () => {
    const title = sectionTitleInput.trim();
    if (!title || !sectionModal) return;
    if (sectionModal.mode === 'albumTitle') {
      // 사진첩 이름 변경 — 이 앨범을 커버로 쓰는 여행카드 제목도 함께 갱신
      updateRecord(record.id, { content: title });
      tripGroups
        .filter((g) => g.coverRecordId === record.id)
        .forEach((g) => updateTripGroup(g.id, { title }));
    } else if (sectionModal.mode === 'add') {
      if (!sections) {
        // 첫 섹션 — 기존 사진 전부가 이 섹션에 담긴다. 이후 섹션을 추가해 이동으로 정리.
        updateRecord(record.id, { albumSections: [{ id: newSectionId(), title, count: medias.length }] });
      } else {
        updateRecord(record.id, { albumSections: [...sections, { id: newSectionId(), title, count: 0 }] });
      }
    } else {
      updateRecord(record.id, {
        albumSections: (sections ?? []).map((sec, i) => (i === sectionModal.index ? { ...sec, title } : sec)),
      });
    }
    setSectionModal(null);
  };

  // 섹션 헤더 ⋯ — 이름 변경 / 섹션 삭제(사진은 옆 섹션으로 합쳐짐)
  const handleSectionMenu = (index: number) => {
    if (!sections) return;
    Alert.alert(sections[index]?.title ?? '', undefined, [
      {
        text: t('trip.albumSectionRename'),
        onPress: () => { setSectionTitleInput(sections[index]?.title ?? ''); setSectionModal({ mode: 'rename', index }); },
      },
      {
        // 순서 변경은 사진 꾹 누르기로 진입 — 메뉴에는 다중 선택(이동/삭제)만 남긴다
        text: t('trip.albumSelect'),
        onPress: startSelecting,
      },
      ...(index > 0 ? [{
        text: t('trip.albumMoveUp'),
        onPress: () => {
          const next = moveSection(medias, sections, index, index - 1);
          updateRecord(record.id, { medias: next.medias, albumSections: next.sections });
        },
      }] : []),
      ...(index < sections.length - 1 ? [{
        text: t('trip.albumMoveDown'),
        onPress: () => {
          const next = moveSection(medias, sections, index, index + 1);
          updateRecord(record.id, { medias: next.medias, albumSections: next.sections });
        },
      }] : []),
      {
        text: t('trip.albumSectionDelete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('trip.albumSectionDelete'), t('trip.albumSectionDeleteMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('trip.delete'),
              style: 'destructive',
              onPress: () => updateRecord(record.id, { albumSections: deleteSection(sections, medias.length, index) ?? undefined }),
            },
          ]);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
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
        <ScrollView
          ref={albumScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          scrollEnabled={scrollEnabled}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          onContentSizeChange={(_w, h) => { contentHRef.current = h; }}
          onLayout={(e) => { layoutHRef.current = e.nativeEvent.layout.height; }}
        >
          <TripRecordRenderer
            record={record}
            viewType={viewType}
            albumEditable={isAlbum}
            onAlbumAddPhotos={handleAlbumAddPhotos}
            onAlbumStartSelect={startSelecting}
            onAlbumSetCover={handleSetCover}
            onAlbumAddSection={openAddSection}
            onAlbumSectionMenu={handleSectionMenu}
            albumSelecting={selecting}
            albumSelected={selected}
            onAlbumToggleSelect={toggleSelect}
            onAlbumReorder={handleReorder}
            onAlbumRemoveAt={handleReorderRemove}
            onAlbumDragStateChange={handleAlbumDragState}
            onAlbumDragPosition={(y) => { dragPageYRef.current = y; }}
            albumDragScroll={dragScroll}
          />

          {/* 사진첩(앨범)은 사진 모음이라 좋아요·댓글 등 게시물 요소를 표시하지 않는다 */}
          {isAlbum ? (
            <>
              <Text style={styles.albumCount}>{t('postDetail.albumPhotoCount', { count: record.medias?.length ?? 0 })}</Text>
              {/* 순서변경 안내 — 버튼이 없어 발견이 어려운 꾹 누르기 드래그 제스처를 알려준다 (첫 성공 후 숨김) */}
              {(record.medias?.length ?? 0) > 1 && !selecting && !reorderHintSeen && (
                <Text style={styles.albumHint}>{t('trip.albumReorderHint')}</Text>
              )}
            </>
          ) : null}
          {!isAlbum && (
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

        {/* 다중 선택 액션 바 */}
        {isAlbum && selecting && (
          <View style={[styles.selectBar, { paddingBottom: insets.bottom + 10 }]}>
            <Text style={styles.selectBarCount}>{t('trip.albumSelectedN', { count: selected.length })}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={styles.selectBarBtn}
              onPress={() => setSelected(selected.length === medias.length ? [] : medias.map((_, i) => i))}
            >
              <Text style={styles.selectBarBtnTxt}>
                {selected.length === medias.length ? t('trip.albumDeselectAll') : t('trip.albumSelectAll')}
              </Text>
            </TouchableOpacity>
            {sections && sections.length > 1 && (
              <TouchableOpacity
                style={[styles.selectBarBtn, selected.length === 0 && { opacity: 0.4 }]}
                disabled={selected.length === 0}
                onPress={() => setMoveSheet({ indexes: selected })}
              >
                <Text style={styles.selectBarBtnTxt}>{t('trip.albumPhotoMove')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.selectBarBtn, styles.selectBarBtnDanger, selected.length === 0 && { opacity: 0.4 }]}
              disabled={selected.length === 0}
              onPress={handleDeleteSelected}
            >
              <Text style={[styles.selectBarBtnTxt, { color: '#FFFFFF' }]}>{t('trip.delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectBarBtn} onPress={exitSelecting}>
              <Text style={styles.selectBarBtnTxt}>{t('comp.albumReorderDone')}</Text>
            </TouchableOpacity>
          </View>
        )}

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

      {/* 이동 대상 섹션 선택 시트 (단일/다중 공용) */}
      <Modal visible={moveSheet !== null} transparent animationType="slide" onRequestClose={() => setMoveSheet(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMoveSheet(null)} accessibilityViewIsModal>
          <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sheetTitle}>{t('trip.albumPhotoMoveTitle')}</Text>
            {(sections ?? []).map((sec, i) => (
              <TouchableOpacity key={sec.id} style={styles.sheetRow} onPress={() => handleMoveTo(i)} activeOpacity={0.7}>
                <Text style={styles.sheetRowTxt}>{sec.title}</Text>
                <Text style={styles.sheetRowCount}>{sec.count}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.sheetRow, { justifyContent: 'center' }]} onPress={() => setMoveSheet(null)}>
              <Text style={[styles.sheetRowTxt, { color: '#A1A1B0' }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 섹션 제목 입력 모달 (추가/이름변경 공용) */}
      <Modal visible={sectionModal !== null} transparent animationType="fade" onRequestClose={() => setSectionModal(null)}>
        <View style={styles.sectionModalOverlay} accessibilityViewIsModal>
          <View style={styles.sectionModalCard}>
            <Text style={styles.sectionModalTitle}>
              {sectionModal?.mode === 'albumTitle'
                ? t('trip.albumRenameAlbum')
                : sectionModal?.mode === 'rename'
                  ? t('trip.albumSectionRename')
                  : t('trip.albumSectionAddTitle')}
            </Text>
            <TextInput
              style={styles.sectionModalInput}
              value={sectionTitleInput}
              onChangeText={setSectionTitleInput}
              placeholder={t('trip.albumSectionTitlePh')}
              placeholderTextColor="#5A5A6E"
              autoFocus
              maxLength={20}
            />
            <View style={styles.sectionModalBtns}>
              <TouchableOpacity style={styles.sectionModalBtn} onPress={() => setSectionModal(null)}>
                <Text style={styles.sectionModalBtnTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionModalBtn, styles.sectionModalBtnOk, !sectionTitleInput.trim() && { opacity: 0.4 }]}
                onPress={confirmSectionModal}
                disabled={!sectionTitleInput.trim()}
              >
                <Text style={[styles.sectionModalBtnTxt, { color: '#FFFFFF' }]}>{t('trip.albumSectionOk')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ⋯ 팝업 메뉴 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={styles.menuSheet}>
            {isAlbum && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  setSectionTitleInput(record.content ?? '');
                  setSectionModal({ mode: 'albumTitle' });
                }}
              >
                <Text style={styles.menuItemText}>{t('trip.albumRenameAlbum')}</Text>
              </TouchableOpacity>
            )}
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
  // 다중 선택 액션 바
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A1A26',
    backgroundColor: '#0A0A0F',
  },
  selectBarCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  selectBarBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectBarBtnDanger: {
    backgroundColor: '#FF3B30',
  },
  selectBarBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1B0',
  },
  // 이동 대상 섹션 시트
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sheetRowTxt: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  sheetRowCount: {
    fontSize: 13,
    color: '#A1A1B0',
  },
  // 섹션 제목 입력 모달
  sectionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  sectionModalCard: {
    width: '100%',
    backgroundColor: '#2E2E3B',
    borderRadius: 16,
    padding: 18,
  },
  sectionModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  sectionModalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sectionModalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  sectionModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sectionModalBtnOk: {
    backgroundColor: '#6B21A8',
  },
  sectionModalBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1B0',
  },
  // 사진첩(앨범) — 사진 장수 표기
  albumCount: {
    fontSize: 12,
    color: '#A1A1B0',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  albumHint: {
    fontSize: 11,
    color: '#5A5A6E',
    paddingHorizontal: 20,
    paddingTop: 3,
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
