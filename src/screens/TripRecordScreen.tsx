import { warn } from '../utils/haptics';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import TripRecordRenderer from '../components/TripRecordRenderer';
import * as ImagePicker from 'expo-image-picker';
import { getMaxAlbumPhotos } from '../constants/limits';
import { useProfileSettings } from '../store/settingsStore';
import { removePhotosAt, exifTakenAt } from '../utils/albumSections';
import { findMissingPhotoTimes } from '../utils/albumReanalyze';
import { useTranslation } from 'react-i18next';
import { countryLabel } from '../utils/countryLabel';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import { useRecordData, useComments, useRecordActions } from '../store/recordStore';
import { TrashIcon, CommentIcon, BackChevronIcon } from '../components/icons';
import TimeAgoText from '../components/TimeAgoText';
import type { RootStackScreenProps } from '../navigation/types';
import { STAGE_MAX_W } from '../utils/stage';
import { andFitText } from '../utils/fitText';
import HeaderGlassButton from '../components/HeaderGlassButton';

export default function TripRecordScreen({ navigation, route }: RootStackScreenProps<'TripRecord'>) {
  const { t, i18n } = useTranslation();
  // 스킨 강조색 — 아이콘 팔레트 리렌더 구독을 겸한다(미구독이면 스택에 남아 있던
  // 이 화면의 아이콘이 이전 팔레트로 표시됨). 스타일도 이 값으로 만든다.
  const a = useSkinAccent();
  const styles = useMemo(() => makeStyles(a), [a]);
  const insets = useSafeAreaInsets();
  const { record: paramRecord, viewType: initialViewType } = route.params;
  const { records, tripGroups } = useRecordData();
  const { commentsByPost } = useComments();
  const { deleteRecord, updateRecord, toggleLike, addComment, updateTripGroup, setCountryCover } = useRecordActions();
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

  // ── 사진첩(앨범) 사진 추가/삭제 ──
  // updateRecord가 로컬 영속 복사 + 서버(updatePost) 동기화까지 처리한다.
  // 화면은 촬영시각 타임라인(AlbumTimeline)이라 저장 순서는 의미가 없다 — 새 사진은 끝에 붙인다.
  // 옛 기록의 albumSections(수동 섹션, 폐지)는 읽지도 쓰지도 않는다.
  const medias = record.medias ?? [];
  // 사진첩 사진 상한 — 모두 100장 (constants/limits.ts getMaxAlbumPhotos, 프리미엄 상향은 제거됨)
  const { isPremium } = useProfileSettings();
  const albumMax = getMaxAlbumPhotos(isPremium);

  const handleAlbumAddPhotos = async () => {
    if (medias.length >= albumMax) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: albumMax - medias.length,
        // 서버 업로드 때 어차피 장변 2048/0.85로 압축되므로(services/posts.ts) 여기서 또 깎으면 이중 손실
        quality: 1,
        // 촬영시각용 — 타임라인과 사진 AI가 mediaTimes를 쓴다(없으면 '날짜 미상'으로 간다)
        exif: true,
      });
      if (res.canceled || !res.assets?.length) return;
      // 이미 담긴 사진(assetId 기준) 제외 — 복사본 uri는 매번 달라 uri 비교로는 못 잡는다
      const existingIds = new Set(Object.values(record.mediaAssetIds ?? {}));
      const fresh = res.assets.filter((a) => !a.assetId || !existingIds.has(a.assetId));
      const dupCount = res.assets.length - fresh.length;
      if (fresh.length === 0) {
        Alert.alert(t('album.noticeTitle'), t('trip.albumDupAll'));
        return;
      }
      const picked = fresh.slice(0, albumMax - medias.length);
      const uris = picked.map((a) => a.uri);
      // 새로 담는 사진의 assetId를 함께 기록 — 다음 추가 때 중복 대조용
      const nextAssetIds = { ...(record.mediaAssetIds ?? {}) };
      picked.forEach((a) => { if (a.assetId) nextAssetIds[a.uri] = a.assetId; });
      // 촬영시각도 같은 uri 키로 — AlbumCreateScreen이 만든 기존 mediaTimes와 병합
      const nextTimes = { ...(record.mediaTimes ?? {}) };
      picked.forEach((a) => { const ts = exifTakenAt(a.exif); if (ts) nextTimes[a.uri] = ts; });
      const nextMedias = [...medias, ...uris];
      updateRecord(record.id, {
        medias: nextMedias,
        representativePhoto: record.representativePhoto ?? nextMedias[0],
        mediaAssetIds: nextAssetIds,
        mediaTimes: nextTimes,
      });
      if (dupCount > 0) {
        Alert.alert(t('album.noticeTitle'), t('trip.albumDupSkipped', { count: dupCount }));
      }
    } catch {
      /* 픽커 취소/실패 — 무시 */
    }
  };

  // ── 날짜 다시 찾기(옛 사진첩) ──
  // 촬영시각(mediaTimes) 없는 사진만 기기 사진첩 creationTime → 파일 EXIF 순으로 찾는다(utils/albumReanalyze).
  // 버튼은 '날짜 미상' 사진이 있을 때만 AlbumTimeline이 보인다.
  // 찾는 동안 사용자가 사진을 추가·삭제할 수 있어, 끝나면 그 시점의 최신 기록·updateRecord로 병합한다 —
  // 누른 시점 클로저로 저장하면 updateRecord가 낡은 기록으로 서버 updatePost를 보내 그 사이 바뀐 medias를 덮는다.
  const [reanalyzing, setReanalyzing] = useState(false);
  const reanalyzingRef = useRef(false); // 연타 방지 — state는 다음 렌더까지 반영이 늦다
  const latestRef = useRef({ record, updateRecord });
  latestRef.current = { record, updateRecord };
  // 찾는 도중 화면을 떠나면 끝나도 Alert·setState는 생략(다른 화면 위에 Alert가 뜨지 않게).
  // 찾은 날짜 저장(updateRecord)은 떠났어도 한다 — 데이터는 살리고 UI만 생략.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const handleReanalyze = async () => {
    if (reanalyzingRef.current) return;
    reanalyzingRef.current = true;
    setReanalyzing(true);
    try {
      const { times, tried, found, reasons } = await findMissingPhotoTimes(record);
      if (found > 0) {
        const { record: cur, updateRecord: update } = latestRef.current;
        const merged = { ...(cur.mediaTimes ?? {}) };
        // 없는 키만 추가 — 그 사이 다른 경로(사진 추가 등)가 채운 값은 덮지 않는다.
        // 그 사이 삭제된 사진의 키는 버린다(고아 키를 남길 이유가 없다).
        const alive = new Set(cur.medias ?? []);
        for (const [uri, ts] of Object.entries(times)) {
          if (alive.has(uri) && !(merged[uri] > 0)) merged[uri] = ts;
        }
        update(cur.id, { mediaTimes: merged });
      }
      if (!mountedRef.current) return;
      const missed = tried - found;
      const lines = [
        ...(found > 0 ? [t('comp.albumReanalyzeFound', { count: found })] : []),
        ...(missed > 0 ? [t('comp.albumReanalyzeMissed', { count: missed })] : []),
        // 못 찾은 이유 — 0이 아닌 것만 한 줄씩. 권한 제한이면 설정 안내를 덧붙인다
        ...(reasons.remote > 0 ? [t('comp.albumReasonRemote', { count: reasons.remote })] : []),
        ...(reasons.permissionLimited > 0 ? [t('comp.albumReasonPermission', { count: reasons.permissionLimited })] : []),
        ...(reasons.fileMissing > 0 ? [t('comp.albumReasonFileMissing', { count: reasons.fileMissing })] : []),
        ...(reasons.noExif > 0 ? [t('comp.albumReasonNoExif', { count: reasons.noExif })] : []),
        ...(reasons.permissionLimited > 0 ? ['', t('comp.albumReasonLimitedHint')] : []),
      ];
      Alert.alert(t('comp.albumReanalyze'), lines.join('\n'));
    } catch {
      /* findMissingPhotoTimes는 사진별 실패를 삼킨다 — 여기 오는 건 예상 밖 오류뿐, 조용히 끝낸다 */
    } finally {
      reanalyzingRef.current = false;
      if (mountedRef.current) setReanalyzing(false);
    }
  };

  // 사진 제거 공용(단일/다중) — 대표 사진 승계 + 여행카드 커버 동기화
  const doDeletePhotos = (indexes: number[]) => {
    const nextMedias = removePhotosAt(medias, indexes);
    const rm = new Set(indexes);
    const coverDeleted = !!record.representativePhoto && medias.some((u, i) => rm.has(i) && u === record.representativePhoto);
    const nextRep = coverDeleted ? nextMedias[0] : record.representativePhoto;
    updateRecord(record.id, { medias: nextMedias, representativePhoto: nextRep });
    // 여행카드 썸네일은 group.coverUri(크롭본 등 오버라이드)를 최우선으로 쓰므로,
    // 대표 사진이 바뀌면 이 기록을 커버로 쓰는 카드의 coverUri도 새 대표로 동기화(스테일 방지)
    if (coverDeleted) {
      tripGroups
        .filter((g) => g.coverRecordId === record.id && g.coverUri)
        .forEach((g) => updateTripGroup(g.id, { coverUri: nextRep }));
    }
  };

  // ── 다중 선택 모드 ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const exitSelecting = () => { setSelecting(false); setSelected([]); };
  const toggleSelect = (idx: number) =>
    setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));

  // 다중 선택 모드 진입 — 선택 바에서 삭제
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

  // 뷰어에서 유리 지구본 활성화 사진 지정 — 그 나라 대표사진 핀(countryCovers)을 이 사진으로 고정한다.
  // 핀은 getCountryPhoto에서 최신순 폴백보다 우선하므로, 이후 새 기록이 생겨도 이 사진이 유지된다.
  const handleSetGlobeCover = (index: number) => {
    const uri = medias[index];
    if (!uri) return;
    // 다국가 기록이면 어느 나라의 지구본 사진으로 쓸지 고른다(핀은 나라 단위라 한 번에 하나).
    const names = (record.countries?.length ? record.countries.map((c) => c.name) : [record.countryName]).filter(Boolean);
    const apply = (name: string) => {
      setCountryCover(name, record.id, uri);
      Alert.alert(t('trip.globeCoverSet', { country: countryLabel(name, i18n.language) }));
    };
    if (names.length <= 1) {
      if (names[0]) apply(names[0]);
      return;
    }
    Alert.alert(t('trip.globeCoverPickTitle'), t('trip.globeCoverPickBody'), [
      ...names.map((n) => ({ text: countryLabel(n, i18n.language), onPress: () => apply(n) })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  // 다중 삭제 확인
  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotosMsg', { count: selected.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => { doDeletePhotos(selected); exitSelecting(); } },
    ]);
  };

  // 뷰어 액션 바 '삭제' — 단일 사진(index는 medias 전역 인덱스, 렌더러가 뷰어 순서에서 되돌려 준다)
  const handleViewerDelete = (globalIndex: number) => {
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotoMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => doDeletePhotos([globalIndex]) },
    ]);
  };

  // ── 앨범 이름 변경 모달 ──
  const [titleModal, setTitleModal] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const openTitleModal = () => { setTitleInput(record.content ?? ''); setTitleModal(true); };
  const confirmTitleModal = () => {
    const title = titleInput.trim();
    if (!title) return;
    // 이 앨범을 커버로 쓰는 여행카드 제목도 함께 갱신
    updateRecord(record.id, { content: title });
    tripGroups
      .filter((g) => g.coverRecordId === record.id)
      .forEach((g) => updateTripGroup(g.id, { title }));
    setTitleModal(false);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    warn(); // 되돌릴 수 없는 동작을 묻는 중
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
          <HeaderGlassButton back onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel={t('trip.back')}>
            <BackChevronIcon />
          </HeaderGlassButton>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{record.countryFlag ?? ''} {record.countryName ? countryLabel(record.countryName, i18n.language) : (record.country ?? '')}</Text>
            {/* 사진첩(앨범) 총 사진 수 — 스크롤 없이 상단에서 바로 확인 */}
            {isAlbum && (
              <Text style={styles.headerCount}>{t('postDetail.albumPhotoCountMax', { count: record.medias?.length ?? 0, max: albumMax })}</Text>
            )}
          </View>
          <HeaderGlassButton
            onPress={() => setMenuVisible(true)}
            style={styles.menuBtn}
            accessibilityLabel={t('postDetail.menuA11y')}
            // iOS 시스템 메뉴(새 빌드) — 없으면 위 onPress로 아래 기존 메뉴. 항목 조건은 기존 메뉴와 같다
            menu={[
              [
                ...(isAlbum ? [{ id: 'rename', title: t('trip.albumRenameAlbum'), icon: 'character.cursor.ibeam', onPress: openTitleModal }] : []),
              ],
              [{ id: 'delete', title: t('trip.deleteAction'), icon: 'trash', destructive: true, onPress: handleDelete }],
            ]}
          >
            <Text style={styles.menuIcon}>⋯</Text>
          </HeaderGlassButton>
        </View>

      {/* 본문 + 좋아요/댓글 */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <TripRecordRenderer
            record={record}
            viewType={viewType}
            albumEditable={isAlbum}
            onAlbumAddPhotos={handleAlbumAddPhotos}
            onAlbumStartSelect={startSelecting}
            onAlbumSetCover={handleSetCover}
            onAlbumSetGlobeCover={handleSetGlobeCover}
            albumSelecting={selecting}
            albumSelected={selected}
            onAlbumToggleSelect={toggleSelect}
            onAlbumRemoveAt={handleViewerDelete}
            onAlbumReanalyze={isAlbum ? handleReanalyze : undefined}
            albumReanalyzing={reanalyzing}
          />

          {/* 사진첩(앨범)은 사진 모음이라 좋아요·댓글 등 게시물 요소를 표시하지 않는다 */}
          {isAlbum ? (
            <Text style={styles.albumCount}>{t('postDetail.albumPhotoCountMax', { count: record.medias?.length ?? 0, max: albumMax })}</Text>
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
                      <Text style={styles.commentTime}>{c.time ?? <TimeAgoText ts={c.createdAt} />}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                    {c.replies?.map((r) => (
                      <View key={r.id} style={styles.replyItem}>
                        <CommentAvatar photo={r.photo} emoji={r.emoji} small />
                        <View style={{ flex: 1 }}>
                          <View style={styles.commentTop}>
                            <Text style={styles.commentName}>{r.name}</Text>
                            <Text style={styles.commentTime}>{r.time ?? <TimeAgoText ts={r.createdAt} />}</Text>
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
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
            <Text style={styles.sendBtnText} {...andFitText}>{t('trip.post')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>

      {/* 앨범 이름 변경 모달 */}
      <Modal visible={titleModal} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setTitleModal(false)}>
        {/* statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 회피 (autoFocus 입력) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sectionModalOverlay} accessibilityViewIsModal>
          <View style={styles.sectionModalCard}>
            <Text style={styles.sectionModalTitle}>{t('trip.albumRenameAlbum')}</Text>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
              style={styles.sectionModalInput}
              value={titleInput}
              onChangeText={setTitleInput}
              placeholder={t('trip.albumTitlePh')}
              placeholderTextColor="#5A5A6E"
              autoFocus
              maxLength={20}
            />
            <View style={styles.sectionModalBtns}>
              <TouchableOpacity style={styles.sectionModalBtn} onPress={() => setTitleModal(false)}>
                <Text style={styles.sectionModalBtnTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionModalBtn, styles.sectionModalBtnOk, !titleInput.trim() && { opacity: 0.4 }]}
                onPress={confirmTitleModal}
                disabled={!titleInput.trim()}
              >
                <Text style={[styles.sectionModalBtnTxt, { color: '#FFFFFF' }]}>{t('trip.albumSectionOk')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ⋯ 팝업 메뉴 */}
      <Modal visible={menuVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[styles.menuSheet, { paddingBottom: Platform.OS === 'ios' ? 32 : insets.bottom + 14 }]}>
            {isAlbum && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuVisible(false); openTitleModal(); }}
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

const makeStyles = (a: SkinAccent) => StyleSheet.create({
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
    // 안드로이드는 lineHeight가 타이트하면 글리프 상하가 잘림 — 안드로이드만 여유 확보
    lineHeight: Platform.OS === 'ios' ? 24 : 27,
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
  // 앨범 이름 입력 모달
  sectionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  sectionModalCard: {
    // 고정 폭이 아니라 width:'100%'라 창 폭을 그대로 먹는다 — Modal은 루트 클램프 밖
    width: '100%',
    maxWidth: STAGE_MAX_W,
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
    backgroundColor: a.accentDeep,
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
    paddingHorizontal: 16,
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
    backgroundColor: a.accentDeep,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1B0',
    marginTop: 2,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: a.tint(0.2),
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
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 menuOverlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1E1B33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: a.tint(0.2),
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
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
