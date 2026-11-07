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
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import TripRecordRenderer from '../components/TripRecordRenderer';
import { SettingsModal, SettingsField, SettingsPillButton, settingsText, SETTINGS_COLORS } from '../components/settings/SettingsUI';
import * as ImagePicker from 'expo-image-picker';
import { getMaxAlbumPhotos } from '../constants/limits';
import { useProfileSettings } from '../store/settingsStore';
import { exifTakenAt, buildAlbumTimeline, effectiveMediaTimes } from '../utils/albumSections';
import { useAlbumPhotoActions } from '../hooks/useAlbumPhotoActions';
import { dayKeyToDate, summarizeAddedDays } from '../utils/albumAddSummary';
import { albumTimeZoneOf } from '../utils/albumTimeZone';
import { lookupDayPlaces } from '../utils/albumPlaceLookup';
import { localAssetIdOf } from '../utils/photoPlace';
import { parseDotDate } from '../utils/momentMatch';
import { withTimeout } from '../utils/withTimeout';
import * as MediaLibrary from 'expo-media-library';
import DateRangePhotoSheet from '../components/record/DateRangePhotoSheet';
import { findMissingPhotoTimes } from '../utils/albumReanalyze';
import { compressImage, ALBUM_EDGE, ALBUM_QUALITY } from '../utils/imageCompress';
import { runWithConcurrency } from '../utils/importPhotoStore';
import { useTranslation } from 'react-i18next';
import { countryLabel } from '../utils/countryLabel';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import { useRecordData, useComments, useRecordActions } from '../store/recordStore';
import { TrashIcon, CommentIcon, BackChevronIcon, OutlineCalendarIcon, PencilIcon, GalleryIcon } from '../components/icons';
import TimeAgoText from '../components/TimeAgoText';
import type { RootStackScreenProps } from '../navigation/types';
import { STAGE_MAX_W } from '../utils/stage';
import { andFitText, andNoFontScale } from '../utils/fitText';
import HeaderGlassButton from '../components/HeaderGlassButton';
import MenuSheet, { MenuSheetItem, MenuSheetDivider, MENU_DANGER } from '../components/MenuSheet';

// 지금 앨범에 살아 있는 사진의 이 기기 원본 assetId — 사진 추가의 중복 제외(선택기 dup·날짜 격자 '담김') 공용.
// mediaAssetIds 전체를 쓰면 안 된다: 사진을 지워도(hooks/useAlbumPhotoActions deletePhotos) 그 항목은 남아, 지운 사진을 다시 담을 수 없게 된다.
// mediaAssetIds를 삭제 때 같이 정리하지 않는 건 동기화 경로(서버 병합)에 영향을 주지 않기 위해서다.
// 원격 URL 사진은 업로드 캐시를 거꾸로 따라 로컬 키의 id를 찾는다(localAssetIdOf).
function liveAssetIds(rec: { medias?: string[]; mediaAssetIds?: Record<string, string>; uploadedMediaUrls?: Record<string, string> }): string[] {
  return (rec.medias ?? []).map((u) => localAssetIdOf(rec, u)).filter((id): id is string => !!id);
}

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
  const { deleteRecord, updateRecord, toggleLike, addComment, updateTripGroup } = useRecordActions();
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
  // 앨범 나라(국기) 시간대 — 날짜 줄(TripRecordRenderer → AlbumTimeline)·하루 보기(AlbumDayScreen)와 같은 계산(utils/albumTimeZone).
  // 아래 날짜 장소(albumDays)·추가 안내(summarizeAddedDays)·날짜/기간 사진 격자(DateRangePhotoSheet timeZone)·
  // 시스템 선택기 촬영시각(exifTakenAt)이 모두 이 값을 써야 서로 같은 날을 가리킨다. 없으면 전부 기기 시간대(예전 그대로).
  const albumTz = albumTimeZoneOf(record);
  // 사진첩 사진 상한 — 모두 100장 (constants/limits.ts getMaxAlbumPhotos, 프리미엄 상향은 제거됨)
  const { isPremium } = useProfileSettings();
  const albumMax = getMaxAlbumPhotos(isPremium);

  // 압축 중 표시·연타 방지 — 압축은 장당 수백 ms라 여러 장이면 몇 초 걸린다
  const [addingPhotos, setAddingPhotos] = useState(false);
  const addingRef = useRef(false);
  const setBusy = (on: boolean) => {
    addingRef.current = on;
    if (mountedRef.current) setAddingPhotos(on);
  };

  // 사진 추가 공용 꼬리 — 시스템 선택기(handleAlbumAddPhotos)와 날짜 사진 격자(confirmDaySheet)가 같이 탄다.
  // 압축 → 최신 기록에 medias·mediaAssetIds·mediaTimes 병합 → 어느 날짜에 들어갔는지 Alert 한 번.
  // 날짜 배치는 따로 하지 않는다: mediaTimes만 있으면 AlbumTimeline(buildAlbumTimeline)이 맞는 날짜 줄에 넣는다.
  // 연타 방지 플래그(setBusy)는 호출부가 감싼다 — 격자 경로는 압축 전 자산 정보 받기도 진행 표시에 포함해야 해서.
  type PickedPhoto = { uri: string; assetId?: string; ts?: number };
  const addPickedPhotos = async (items: PickedPhoto[], notes: { dup?: number; cloudFailed?: number } = {}) => {
    // 상한은 최신 기록 기준 — 시트·선택기가 떠 있는 사이 사진이 바뀌었을 수 있다(누른 시점 클로저는 낡았다)
    const picked = items.slice(0, Math.max(0, albumMax - (latestRef.current.record.medias?.length ?? 0)));
    // 원본 대신 사진첩 규격(장변 2048/0.85) 압축본으로 담는다 — 격자 표시·저장 용량·업로드가 가벼워진다.
    // 촬영시각은 압축 전 원본 메타(picker exif / 사진첩 creationTime)에서 이미 읽어 왔으므로 압축본에 EXIF가 없어도 타임라인은 그대로다.
    // 실패·이미 작은 사진은 compressImage가 원본 uri를 그대로 돌려준다(누락 없음).
    // 동시 2장 — 장마다 원본을 통째로 디코드(48MP ≈ 190MB)해 동시 수가 곧 메모리 피크다(copyTripOriginals와 같은 값).
    const uris = picked.map((p) => p.uri);
    await runWithConcurrency(picked.length, 2, async (k) => {
      uris[k] = await compressImage(picked[k].uri, ALBUM_EDGE, ALBUM_QUALITY);
    });
    // 압축하는 사이 사진이 추가·삭제됐을 수 있어 최신 기록 기준으로 병합한다
    const { record: cur, updateRecord: update } = latestRef.current;
    const curMedias = cur.medias ?? [];
    const n = Math.max(0, Math.min(picked.length, albumMax - curMedias.length)); // 실제로 들어가는 장수
    // 새로 담는 사진의 assetId를 함께 기록 — 다음 추가 때 중복 대조용.
    // 촬영시각도 같은 uri 키로 — AlbumCreateScreen이 만든 기존 mediaTimes와 병합
    const nextAssetIds = { ...(cur.mediaAssetIds ?? {}) };
    const nextTimes = { ...(cur.mediaTimes ?? {}) };
    for (let k = 0; k < n; k++) {
      if (picked[k].assetId) nextAssetIds[uris[k]] = picked[k].assetId!;
      if (picked[k].ts) nextTimes[uris[k]] = picked[k].ts!;
    }
    if (n > 0) {
      const nextMedias = [...curMedias, ...uris.slice(0, n)];
      update(cur.id, {
        medias: nextMedias,
        representativePhoto: cur.representativePhoto ?? nextMedias[0],
        mediaAssetIds: nextAssetIds,
        mediaTimes: nextTimes,
      });
    }
    if (!mountedRef.current) return; // 떠났으면 저장만 하고 안내는 생략(다른 화면 위에 Alert가 뜨지 않게)
    // 안내는 한 번에 — 날짜 배치·날짜 미상·중복 제외·iCloud 실패를 줄로 모아 Alert가 연달아 뜨지 않게 한다
    const sum = summarizeAddedDays(picked.slice(0, n).map((p) => p.ts), albumTz);
    const first = dayKeyToDate(sum.days[0]);
    const firstLabel = first ? t('time.monthDay', { m: first.getMonth() + 1, d: first.getDate() }) : '';
    const lines = [
      ...(sum.dated > 0 && first
        ? [sum.days.length > 1
          ? t('trip.albumAddedToDays', { count: sum.dated, day: firstLabel, more: sum.days.length - 1 })
          : t('trip.albumAddedToDay', { count: sum.dated, day: firstLabel })]
        : []),
      ...(sum.undated > 0 ? [t('trip.albumAddedUndated', { count: sum.undated, label: t('comp.albumUndated') })] : []),
      ...(notes.dup ? [t('trip.albumDupSkipped', { count: notes.dup })] : []),
      ...(notes.cloudFailed ? [t('album.icloudSkipped', { count: notes.cloudFailed })] : []),
    ];
    if (lines.length) Alert.alert(t('album.noticeTitle'), lines.join('\n'));
  };

  const handleAlbumAddPhotos = async () => {
    if (addingRef.current) return;
    if (medias.length >= albumMax) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: albumMax - medias.length,
        // 압축은 addPickedPhotos에서 우리가 한 번(장변 2048/0.85) — 여기서도 깎으면 이중 손실
        quality: 1,
        // 촬영시각용 — 타임라인과 사진 AI가 mediaTimes를 쓴다(없으면 '날짜 미상'으로 간다)
        exif: true,
      });
      if (res.canceled || !res.assets?.length) return;
      // 이미 담긴 사진(assetId 기준) 제외 — 복사본 uri는 매번 달라 uri 비교로는 못 잡는다. 지운 사진은 다시 담을 수 있게 살아 있는 것만
      const existingIds = new Set(liveAssetIds(latestRef.current.record));
      const fresh = res.assets.filter((a) => !a.assetId || !existingIds.has(a.assetId));
      const dupCount = res.assets.length - fresh.length;
      if (fresh.length === 0) {
        Alert.alert(t('album.noticeTitle'), t('trip.albumDupAll'));
        return;
      }
      setBusy(true);
      try {
        await addPickedPhotos(
          // 오프셋 태그 없는 EXIF(안드로이드 picker)는 앨범 시간대 벽시계로 읽는다 — 기기(한국) 시각으로 읽으면 시차만큼 어긋나 저장된다
          fresh.map((a) => ({ uri: a.uri, assetId: a.assetId ?? undefined, ts: exifTakenAt(a.exif, albumTz) })),
          { dup: dupCount },
        );
      } finally {
        setBusy(false);
      }
    } catch {
      /* 픽커 취소/실패 — 무시 */
    }
  };

  // ── 시트 닫힘 대기(날짜 사진 격자·⋯ 메뉴 시트 공용) ──
  // 시트(RN Modal·시스템 시트)는 닫힘이 끝난 뒤에만 다음 일을 한다:
  //  - 시스템 선택기 present: 닫히는 도중에 띄우면 보이지 않는 모달 껍데기가 남아 앱 전체 터치를 삼킨다(eorth-ios-modal-picker-touch-freeze).
  //  - 안내 Alert: iOS Alert는 최상위 present VC에 붙어, 시트가 닫히는 중이면 시트와 같이 사라진다.
  // iOS는 닫힘 완료 신호(RN Modal onDismiss → handleSheetDismissed)를 기다리고, 안 오면 넉넉한 지연(1.2초)으로 폴백.
  // iOS 시스템 시트(MenuSheet NATIVE_SHEET)는 신호를 못 받아 늘 이 폴백으로 간다 — UIKit 닫힘(~0.3초+)보다 충분히 길다.
  // 안드로이드는 RN이 onDismiss를 부르지 않아 타이머만 — NewRecordScreen openSystemPickerFromSheet와 같은 값·방식.
  // 대기는 한 번에 하나(두 시트가 동시에 닫히는 경로가 없다). 같은 resolve를 신호·폴백이 둘 다 불러도 뒤 동작은 await 뒤 한 번뿐이다.
  const SHEET_DISMISS_MS = 400;
  const ICLOUD_DL_TIMEOUT_MS = 15000; // NewRecordScreen downloadCloudAssets와 같은 장당 타임아웃
  const sheetWaitRef = useRef<(() => void) | null>(null);
  const waitSheetClosed = () => new Promise<void>((resolve) => {
    if (Platform.OS === 'ios') {
      sheetWaitRef.current = resolve;
      setTimeout(resolve, SHEET_DISMISS_MS * 3);
    } else {
      setTimeout(resolve, SHEET_DISMISS_MS);
    }
  });
  const handleSheetDismissed = () => {
    const resolve = sheetWaitRef.current;
    sheetWaitRef.current = null;
    resolve?.();
  };

  // ── 기간 사진 격자(DateRangePhotoSheet) 한 벌 — 그 기간에 찍은 기기 사진만 앱 안 격자로 ──
  // 일반 '사진 추가'(상단 ⋯·날짜 미상 ⋯)는 기록 기간(startDate~endDate), 날짜 줄 ⋯ '이 날 찍은 사진 추가'는 그날 하루.
  // 같은 시트 인스턴스·같은 담기(confirmDaySheet)·같은 닫힘 대기(waitSheetClosed)를 쓴다.
  const [daySheetRange, setDaySheetRange] = useState<{ start: Date; end: Date } | null>(null); // 닫는 애니메이션 동안 내용이 바뀌지 않게 열림과 따로 둔다
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const openRangeSheet = (start: Date, end: Date) => {
    if (addingRef.current) return;
    if (medias.length >= albumMax) {
      Alert.alert(t('album.noticeTitle'), t('album.maxPhotos', { max: albumMax }));
      return;
    }
    setDaySheetRange({ start, end });
    setDaySheetOpen(true);
  };
  // 일반 '사진 추가' 진입점 — 기록 기간이 있으면 그 기간 격자, 없거나 못 읽으면 시스템 선택기(handleAlbumAddPhotos).
  // 기간 규칙은 utils/momentMatch tripPeriodOf와 같다: 시작 = startDate ?? date, 끝 = endDate ?? 시작(로컬 자정 ms).
  // 시작·끝이 뒤집혀 있어도 시트(dayRangeMs)가 바로잡는다.
  const openAlbumAddPhotos = () => {
    if (addingRef.current) return;
    const s = parseDotDate(record.startDate) ?? parseDotDate(record.date);
    const e = parseDotDate(record.endDate) ?? s;
    if (s == null || e == null) { void handleAlbumAddPhotos(); return; }
    openRangeSheet(new Date(s), new Date(e));
  };
  // key는 앨범 시간대 날짜. dayKeyToDate는 그 달력 날짜의 로컬 자정 Date라, 시트가 그 날짜를 timeZone의 하루로 다시 읽는다(dayRangeMs tz)
  const handleAlbumAddPhotosForDay = (key: string) => {
    const d = dayKeyToDate(key);
    if (!d) { openAlbumAddPhotos(); return; } // 'undated' 등 — 렌더러가 이미 걸러 주지만 방어
    openRangeSheet(d, d);
  };
  // 시트 안 '전체 사진첩에서 고르기' — 기간 밖 사진을 넣는 탈출구라 시스템 선택기로 직접 간다
  // (openAlbumAddPhotos를 부르면 시트가 다시 열려 시트 ↔ 선택기가 돌기만 한다)
  const openPickerFromDaySheet = async () => {
    setDaySheetOpen(false);
    await waitSheetClosed();
    void handleAlbumAddPhotos();
  };
  // 격자에서 담기 — 시트 경로엔 picker exif가 없어 사진첩 자산 정보에서 원본 경로(localUri)와 촬영시각(creationTime)을 받는다.
  // iCloud 오프로드분(cloudAssetIds)도 같은 호출(shouldDownloadFromNetwork)로 받는다. 순차 — 동시 다운로드는 실패·메모리 급증.
  // 조회가 실패하면(안드로이드는 ACCESS_MEDIA_LOCATION이 없으면 getAssetInfo가 예외) 시트가 목록 단계에서 가진
  // creationTimes로 시각을, 시트 uri(안드로이드는 이미 파일 경로)로 사진을 살린다 — 안 그러면 그날 사진이 '날짜 미상'으로 간다.
  const confirmDaySheet = async (uris: string[], cloudAssetIds: string[], assetIds: string[], creationTimes?: (number | undefined)[]) => {
    setDaySheetOpen(false);
    if (addingRef.current || assetIds.length === 0) return;
    setBusy(true);
    try {
      await waitSheetClosed();
      const cloud = new Set(cloudAssetIds);
      const items: PickedPhoto[] = [];
      let cloudFailed = 0;
      for (let i = 0; i < assetIds.length; i++) {
        const id = assetIds[i];
        // assetIds = [uris 순서대로의 id..., cloud id...] — 기기에 있는 사진은 시트가 준 경로를 폴백으로 쓴다
        const sheetUri = i < uris.length ? uris[i] : undefined;
        let uri: string | undefined;
        let ts: number | undefined;
        try {
          const info = await withTimeout(MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true }), ICLOUD_DL_TIMEOUT_MS);
          uri = info?.localUri ?? undefined;
          ts = (info?.creationTime ?? 0) > 0 ? info.creationTime : undefined;
        } catch { /* 실패·타임아웃 — 아래 폴백 */ }
        const sheetTs = creationTimes?.[i];
        ts ??= typeof sheetTs === 'number' && sheetTs > 0 ? sheetTs : undefined;
        uri ??= cloud.has(id) ? undefined : sheetUri;
        if (uri) items.push({ uri, assetId: id, ts });
        else cloudFailed++;
      }
      await addPickedPhotos(items, { cloudFailed });
    } finally {
      setBusy(false);
    }
  };
  // 격자에서 '담김'으로 빼 둘 사진 — 지금 앨범에 살아 있는 사진의 원본 assetId(liveAssetIds, 선택기 중복 제외와 같은 계산)
  const excludeAssetIds = useMemo(() => liveAssetIds(record), [record]);

  // ── 날짜 줄 장소(내 사진첩만) ──
  // 그날 앞쪽 사진의 기기 사진첩 좌표 → 역지오코딩(utils/albumPlaceLookup, 하루 보기와 캐시 공유).
  // 메모리 state에만 둔다 — 기록·스토어·서버에 쓰지 않는다(utils/photoPlace 주석: 사진별 좌표를 공개될 수 있는 기록에 올리지 않는 결정).
  const [dayPlaces, setDayPlaces] = useState<Record<string, string>>({});
  const albumTimes = useMemo(
    () => effectiveMediaTimes({ mediaTimes: record.mediaTimes, uploadedMediaUrls: record.uploadedMediaUrls }),
    [record.mediaTimes, record.uploadedMediaUrls],
  );
  const albumDays = useMemo(() => {
    if (!isAlbum) return [];
    const list = record.medias ?? [];
    return buildAlbumTimeline(list, albumTimes, albumTz).days.map((d) => ({ key: d.key, uris: d.moments.flatMap((m) => m.indexes).map((i) => list[i]) }));
  }, [isAlbum, record.medias, albumTimes, albumTz]);
  const { mediaAssetIds, uploadedMediaUrls } = record;
  useEffect(() => {
    if (albumDays.length === 0) return;
    let alive = true;
    // 사진이 바뀌어 다시 돌아도 캐시라 이미 찾은 날은 즉시 — 같은 값이면 state를 건드리지 않는다
    void lookupDayPlaces(albumDays, { mediaAssetIds, uploadedMediaUrls }, albumTimes, (key, name) => {
      setDayPlaces((p) => (p[key] === name ? p : { ...p, [key]: name }));
    }, () => alive);
    return () => { alive = false; };
    // daySheetOpen: lookupDayPlaces는 권한을 확인만 한다(요청 안 함). 날짜 사진 격자가 권한을 묻고 허용받은 뒤
    // 사진을 안 담고 닫아도 장소를 다시 찾도록, 시트가 열리고 닫힐 때 한 번 더 돈다(캐시라 비용은 권한 확인 정도)
  }, [albumDays, albumTimes, mediaAssetIds, uploadedMediaUrls, daySheetOpen]);

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
      const { times, assetIds, tried, found, reasons } = await findMissingPhotoTimes(record);
      if (found > 0) {
        const { record: cur, updateRecord: update } = latestRef.current;
        const merged = { ...(cur.mediaTimes ?? {}) };
        // 없는 키만 추가 — 그 사이 다른 경로(사진 추가 등)가 채운 값은 덮지 않는다.
        // 그 사이 삭제된 사진의 키는 버린다(고아 키를 남길 이유가 없다).
        const alive = new Set(cur.medias ?? []);
        for (const [uri, ts] of Object.entries(times)) {
          if (alive.has(uri) && !(merged[uri] > 0)) merged[uri] = ts;
        }
        // 사진첩 매칭으로 알게 된 원본 assetId — 다음 중복 판정(AlbumCreateScreen)·재분석에 쓴다.
        // 키는 로컬 경로라 medias가 업로드 URL로 바뀐 사진은 uploadedMediaUrls로 살아 있는지 본다. 기존 키는 덮지 않는다.
        const ids = { ...(cur.mediaAssetIds ?? {}) };
        let idsChanged = false;
        for (const [key, id] of Object.entries(assetIds)) {
          const up = cur.uploadedMediaUrls?.[key];
          if ((alive.has(key) || (!!up && alive.has(up))) && !ids[key]) { ids[key] = id; idsChanged = true; }
        }
        update(cur.id, idsChanged ? { mediaTimes: merged, mediaAssetIds: ids } : { mediaTimes: merged });
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

  // 사진 삭제(단일/다중)·커버 지정·지구본 사진 지정 — 하루 보기(AlbumDayScreen) 뷰어와 같은 동작이라 공용 훅(hooks/useAlbumPhotoActions)
  const { deletePhotos, setCover, setGlobeCover, confirmDeletePhoto } = useAlbumPhotoActions(record);

  // ── 다중 선택 모드 ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const exitSelecting = () => { setSelecting(false); setSelected([]); };
  const toggleSelect = (idx: number) =>
    setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));

  // 다중 선택 모드 진입(⋯ 메뉴 '선택') — 삭제는 아래 선택 액션 바에서
  const startSelecting = () => { setSelecting(true); setSelected([]); };

  // 다중 삭제 확인
  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotosMsg', { count: selected.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => { deletePhotos(selected); exitSelecting(); } },
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
          {/* 사진 선택 모드에선 뒤로·⋯를 숨긴다(빠져나가기는 아래 선택 바 '완료') — 같은 크기 빈 칸으로 제목 가운데 유지 */}
          {/* 사진첩만 iOS 리퀴드 글래스 없이(뒤로·⋯ 둘 다, 2026-11-07 사용자 요청) — ⋯의 iOS 시스템 메뉴는 그대로 */}
          {selecting ? <View style={styles.headerSlot} /> : (
          <HeaderGlassButton back glass={!isAlbum} onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel={t('trip.back')}>
            <BackChevronIcon />
          </HeaderGlassButton>
          )}
          <View style={styles.headerTitleWrap}>
            {/* 사진첩(앨범)은 2026-11-03 시안대로 국기 없이 — 사진 수는 아래 정보 줄로 옮겼다.
                국가명 자리에 앨범 이름(content)을 둔다: AlbumCreate가 만든 앨범은 지구본·통계 제외를 위해
                countryName을 비워 둬서 이 줄이 비었고, '앨범 이름 변경'도 보이는 곳이 없었다. 이름이 없으면 국가명 폴백 */}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {isAlbum && record.content?.trim()
                ? record.content.trim()
                : `${isAlbum ? '' : `${record.countryFlag ?? ''} `}${record.countryName ? countryLabel(record.countryName, i18n.language) : (record.country ?? '')}`}
            </Text>
          </View>
          {selecting ? <View style={styles.headerSlot} /> : (
          <HeaderGlassButton
            onPress={() => setMenuVisible(true)}
            glass={!isAlbum} // 사진첩만 글래스 없음(2026-11-07 사용자 요청) — 위 뒤로가기와 짝
            // 사진첩은 ⋯도 원(배경·테두리) 없이 뒤로가기와 같은 무테 36×36(2026-11-07 사용자 요청 "점3개에 원이 있는데 이것도 빼줘")
            style={isAlbum ? styles.backBtn : styles.menuBtn}
            accessibilityLabel={t('postDetail.menuA11y')}
            // iOS 시스템 메뉴(새 빌드) — 없으면 위 onPress로 아래 기존 메뉴. 항목 조건은 기존 메뉴와 같다
            // '사진 추가'는 시스템 메뉴(UIMenu)에선 바로 선택기 — UIMenu는 RN Modal이 아니라 닫힘을 기다릴 껍데기가 없다
            menu={[
              [
                ...(isAlbum ? [
                  { id: 'add', title: t('comp.albumAddPhotos'), icon: 'photo.badge.plus', onPress: openAlbumAddPhotos },
                  // '선택'은 고를 사진이 있을 때만(옛 본문 '✓ 선택' 막대의 medias.length > 0 조건 그대로)
                  ...(medias.length > 0 ? [{ id: 'select', title: t('trip.albumSelect'), icon: 'checkmark.circle', onPress: startSelecting }] : []),
                  { id: 'rename', title: t('trip.albumRenameAlbum'), icon: 'character.cursor.ibeam', onPress: openTitleModal },
                ] : []),
              ],
              [{ id: 'delete', title: t('trip.deleteAction'), icon: 'trash', destructive: true, onPress: handleDelete }],
            ]}
          >
            <Text style={styles.menuIcon}>⋯</Text>
          </HeaderGlassButton>
          )}
        </View>

      {/* 사진첩 정보 줄(시안) — 위아래 0.8pt 흰 15% 선 사이 높이 52: 달력 + 여행 기간 · 오른쪽 사진 수 */}
      {isAlbum && (
        <View style={styles.albumInfo}>
          <OutlineCalendarIcon size={12} color="rgba(255,255,255,0.6)" />
          <Text style={styles.albumInfoText} numberOfLines={1}>
            {record.startDate && record.endDate ? `${record.startDate} ~ ${record.endDate}` : (record.startDate || record.date)}
          </Text>
          <Text style={styles.albumInfoCount} numberOfLines={1}>{t('postDetail.albumPhotoCountMax', { count: record.medias?.length ?? 0, max: albumMax })}</Text>
        </View>
      )}

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
            onAlbumAddPhotos={openAlbumAddPhotos}
            onAlbumSetCover={setCover}
            onAlbumSetGlobeCover={setGlobeCover}
            albumSelecting={selecting}
            albumSelected={selected}
            onAlbumToggleSelect={toggleSelect}
            onAlbumRemoveAt={confirmDeletePhoto}
            onAlbumReanalyze={isAlbum ? handleReanalyze : undefined}
            onAlbumSelectIndexes={(idx) => { setSelecting(true); setSelected(idx); }}
            onAlbumOpenDay={isAlbum ? (dayKey) => navigation.navigate('AlbumDay', { record, dayKey }) : undefined}
            onAlbumAddPhotosForDay={isAlbum ? handleAlbumAddPhotosForDay : undefined}
            albumDayPlaces={isAlbum ? dayPlaces : undefined}
            albumReanalyzing={reanalyzing}
          />

          {/* 사진첩(앨범)은 사진 모음이라 좋아요·댓글 등 게시물 요소를 표시하지 않는다 */}
          {isAlbum && addingPhotos ? <ActivityIndicator style={{ marginTop: 10 }} color={a.accent} /> : null}
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

        {/* 다중 선택 액션 바 — 설정 계열 공용 compact 알약(#111116 + 유리 링, 삭제는 danger 톤). 위 선은 사진첩 정보 줄과 같은 0.8 흰15% */}
        {isAlbum && selecting && (
          <View style={[styles.selectBar, { paddingBottom: insets.bottom + 10 }]}>
            <Text style={styles.selectBarCount} numberOfLines={1}>{t('trip.albumSelectedN', { count: selected.length })}</Text>
            <SettingsPillButton
              compact
              label={selected.length === medias.length ? t('trip.albumDeselectAll') : t('trip.albumSelectAll')}
              onPress={() => setSelected(selected.length === medias.length ? [] : medias.map((_, i) => i))}
            />
            <SettingsPillButton compact tone="danger" label={t('trip.delete')} disabled={selected.length === 0} onPress={handleDeleteSelected} />
            <SettingsPillButton compact label={t('comp.albumReorderDone')} onPress={exitSelecting} />
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

      {/* 앨범 이름 변경 — 앱 공용 팝업(SettingsModal: 카드·제목·하단 취소 알약) + 공용 입력칸·확인 알약.
          입력 중 실수 탭으로 날아가지 않게 배경 탭 닫힘은 끈다(안드로이드 뒤로·취소는 닫힘). autoFocus라 키보드 회피(avoidKeyboard) */}
      <SettingsModal
        visible={titleModal}
        title={t('trip.albumRenameAlbum')}
        closeLabel={t('common.cancel')}
        onClose={() => setTitleModal(false)}
        avoidKeyboard
        backdropDismiss={false}
      >
        <SettingsField baseRim={SETTINGS_COLORS.line} style={styles.renameField}>
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
            style={settingsText.input}
            value={titleInput}
            onChangeText={setTitleInput}
            placeholder={t('trip.albumTitlePh')}
            placeholderTextColor={SETTINGS_COLORS.text50}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={confirmTitleModal}
          />
        </SettingsField>
        <SettingsPillButton
          label={t('trip.albumSectionOk')}
          onPress={confirmTitleModal}
          disabled={!titleInput.trim()}
          baseRim={SETTINGS_COLORS.line}
          style={styles.renameOk}
        />
      </SettingsModal>

      {/* 기간 사진 격자 한 벌 — 일반 '사진 추가'는 기록 기간, 날짜 줄 ⋯는 그날(앨범 시간대 00:00~23:59:59.999, 없으면 기기 로컬). 이미 담긴 사진은 assetId로 '담김' 처리 */}
      {isAlbum && daySheetRange && (
        <DateRangePhotoSheet
          visible={daySheetOpen}
          startDate={daySheetRange.start}
          endDate={daySheetRange.end}
          max={Math.max(1, albumMax - medias.length)}
          excludeAssetIds={excludeAssetIds}
          timeZone={albumTz}
          onConfirm={confirmDaySheet}
          onOpenSystemPicker={() => { void openPickerFromDaySheet(); }}
          onClose={() => setDaySheetOpen(false)}
          onDismiss={handleSheetDismissed}
        />
      )}

      {/* ⋯ 메뉴 — 앱 공용 바텀시트(components/MenuSheet). iOS 새 빌드는 위 HeaderGlassButton 시스템 메뉴가 먼저 뜬다 */}
      <MenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} onDismissed={handleSheetDismissed}>
        {isAlbum && (
          <>
            {/* 사진 추가 — 시트(Modal)가 내려간 뒤에 선택기를 띄운다. 닫히는 중에 present하면 보이지 않는
                모달 껍데기가 남아 터치를 삼킨다(eorth-ios-modal-picker-touch-freeze). 닫힘 신호(onDismissed, iOS Modal 시트) + 폴백 타이머(waitSheetClosed) */}
            <MenuSheetItem
              icon={<GalleryIcon size={18} color="#FFFFFF" />}
              label={t('comp.albumAddPhotos')}
              onPress={async () => { setMenuVisible(false); await waitSheetClosed(); openAlbumAddPhotos(); }}
            />
            <MenuSheetDivider />
            {/* 선택 — 상태만 바꾸고 다른 Modal을 띄우지 않아 닫힘 대기가 필요 없다(이름 변경과 같은 패턴).
                공용 아이콘에 체크가 없어, 옛 '✓ 선택' 막대와 같은 ✓ 글자를 다른 행 아이콘 칸(18)에 맞춰 둔다 */}
            {medias.length > 0 && (
              <>
                <MenuSheetItem
                  icon={<Text style={styles.menuCheck} {...andNoFontScale}>✓</Text>}
                  label={t('trip.albumSelect')}
                  onPress={() => { setMenuVisible(false); startSelecting(); }}
                />
                <MenuSheetDivider />
              </>
            )}
            <MenuSheetItem
              icon={<PencilIcon size={18} color="#FFFFFF" />}
              label={t('trip.albumRenameAlbum')}
              onPress={() => { setMenuVisible(false); openTitleModal(); }}
            />
            <MenuSheetDivider />
          </>
        )}
        <MenuSheetItem icon={<TrashIcon size={18} color={MENU_DANGER} />} label={t('trip.deleteAction')} onPress={handleDelete} danger />
      </MenuSheet>
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
    borderTopWidth: 0.8,
    borderTopColor: SETTINGS_COLORS.line,
    backgroundColor: '#0A0A0F',
  },
  selectBarCount: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // 앨범 이름 변경 팝업 — 설명 없는 제목 아래 20, 확인 알약은 입력칸 아래 14(하단 취소 알약과 같은 간격)
  renameField: { marginTop: 20 },
  renameOk: { marginTop: 14 },
  // 사진첩(앨범) — 사진 장수 표기
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
  headerSlot: { width: 36, height: 36 }, // 선택 모드에서 숨긴 뒤로·⋯ 자리(backBtn·menuBtn과 같은 크기)
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
  albumInfo: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  albumInfoText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  albumInfoCount: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
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
  // ⋯ 시트 '선택' 행의 ✓ — MenuSheetItem 아이콘 칸(18)과 같은 폭이라 글자 시작이 다른 행과 맞는다
  menuCheck: {
    width: 18,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },

});
