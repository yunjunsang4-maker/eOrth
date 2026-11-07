// 사진첩 하루 보기 — 앨범 날짜 줄의 '>'로 들어온다(TripRecordScreen → AlbumTimeline onOpenDay).
// 그날 사진을 촬영시각 순간(utils/albumSections MOMENT_GAP_MS 묶음)별로 '시각 · 장소' 줄 + 가로 사진 줄로 보여 준다.
// 디자인은 사진첩 화면(2026-11-03 시안)과 같은 틀: 글래스 뒤로 + 가운데 제목, 위아래 선 사이 정보 줄, 134 칸 가로 줄.
//
// 장소는 저장하지 않는다(utils/photoPlace 주석) — 이 기기 사진첩 좌표 → 역지오코딩을 화면을 열 때만 한다.
// 이 기기 assetId가 없는 사진(iOS 원격 URL)은 촬영시각 ±TIME_TOL_MS로 기기 사진첩을 찾아 그 좌표를 쓴다.
// 기기 사진첩에 없는 사진은 장소 없이 시각만 나온다.
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import HeaderGlassButton from '../components/HeaderGlassButton';
import { BackChevronIcon, OutlineCalendarIcon, PinIcon } from '../components/icons';
import FeedPhoto from '../components/FeedPhoto';
import PhotoViewerModal from '../components/PhotoViewerModal';
import MenuSheet, { MenuSheetItem, MenuSheetDivider } from '../components/MenuSheet';
import { useRecordData } from '../store/recordStore';
import { useAlbumPhotoActions } from '../hooks/useAlbumPhotoActions';
import { buildAlbumTimeline, effectiveMediaTimes } from '../utils/albumSections';
import { localAssetIdOf, formatClock } from '../utils/photoPlace';
import { placeOfAsset, assetIdAtTime, type AssetPlace } from '../utils/albumPlaceLookup';
import { andFitText } from '../utils/fitText';
import { useStageWidth } from '../utils/stage';
import type { RootStackScreenProps } from '../navigation/types';


const ROW_GAP = 3;  // AlbumTimeline 가로 줄과 같은 값
const FADE_W = 70;
const PLACE_TRIES = 3; // 순간마다 좌표를 찾아볼 사진 수 상한 — 역지오코딩 호출 수를 묶는다
const WEEK_KEYS = ['calendar.week0', 'calendar.week1', 'calendar.week2', 'calendar.week3', 'calendar.week4', 'calendar.week5', 'calendar.week6'] as const;
// 장소 조회(placeOfAsset·assetIdAtTime)와 그 캐시는 utils/albumPlaceLookup — 사진첩 화면 날짜 줄 장소와 같이 쓴다.
type MapAt = { name: string; lat: number; lon: number; country: string | null };
// 네이버 지도 URL Scheme의 appname(필수, 호출한 앱 식별자 — iOS 번들 ID·안드로이드 applicationId).
// 정보성 값이라 정식 번들 ID 상수로 둔다 — 베타·dev(.beta·.dev 접미사, app.config.js)도 같은 값으로 나가지만 여는 동작엔 영향 없다.
const NAVER_APPNAME = 'com.yunjunsang.eorth';

type PlaceTry = { assetId: string } | { ts: number };

export default function AlbumDayScreen({ navigation, route }: RootStackScreenProps<'AlbumDay'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const width = useStageWidth(); // 태블릿에서도 앱 컬럼 폭 기준(규칙 9)
  const { record: paramRecord, dayKey } = route.params;
  const { records } = useRecordData();
  // 사진을 지우고 돌아와도 최신 기록 기준(TripRecordScreen과 같은 방식)
  const record = records.find((r) => r.id === paramRecord.id) ?? paramRecord;
  const medias = useMemo(() => record.medias ?? [], [record.medias]);
  const mediaTimes = useMemo(
    () => effectiveMediaTimes({ mediaTimes: record.mediaTimes, uploadedMediaUrls: record.uploadedMediaUrls }),
    [record.mediaTimes, record.uploadedMediaUrls],
  );
  const day = useMemo(
    () => buildAlbumTimeline(medias, mediaTimes).days.find((d) => d.key === dayKey),
    [medias, mediaTimes, dayKey],
  );
  const order = useMemo(() => day?.moments.flatMap((m) => m.indexes) ?? [], [day]);
  // 뷰어 액션 바(지구본 사진·저장·커버·삭제)는 사진첩 화면 뷰어와 같은 공용 훅 — 하루 보기는 내 사진첩(TripRecordScreen isAlbum)에서만 들어온다.
  // 뷰어는 그날 표시 순서(order)로 넘긴다 — 뷰어 위치 at은 order 기준이라 콜백엔 order[at]으로 medias 전역 인덱스로 되돌린다.
  // order는 연 시점 스냅샷(TripRecordRenderer AlbumView와 같은 방식): 뷰어가 떠 있는 동안 medias가 바뀌는 건 삭제뿐이고, 삭제는 뷰어를 닫는다.
  const { setCover, setGlobeCover, confirmDeletePhoto } = useAlbumPhotoActions(record);
  const [viewer, setViewer] = useState<{ order: number[]; at: number } | null>(null);
  const toGlobal = (fn: (index: number) => void) => (i: number) => { const g = viewer?.order[i]; if (g != null) fn(g); };
  // 장소 줄 → 지도 시트. 열림 여부를 따로 둔다 — 닫을 때 mapAt까지 비우면 닫히는 애니메이션 동안
  // 시트 내용(제목·지도)이 먼저 사라져 빈 시트가 쪼그라드는 게 보인다.
  const [mapAt, setMapAt] = useState<MapAt | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // fallback: url을 못 열면(앱 미설치 — iOS는 completionHandler NO, 안드로이드는 ActivityNotFoundException으로 reject) 대신 연다.
  // canOpenURL은 쓰지 않는다 — iOS LSApplicationQueriesSchemes·안드로이드 <queries>가 있어야 해서 네이티브 빌드가 필요하다(OTA로 못 나감).
  const openMapUrl = (url: string, fallback?: string) => {
    setMapOpen(false);
    Linking.openURL(url).catch(() => (fallback ? Linking.openURL(fallback) : undefined)).catch(() => {});
  };

  // 순간별 장소 — 순간의 앞쪽 사진부터 최대 PLACE_TRIES장 시도. 사진마다 이 기기 assetId가 있으면 그것,
  // 없고 촬영시각이 있으면 시각으로 기기 사진첩 자산을 찾는다(iOS 원격 URL 사진).
  // 키는 순간 시작 시각(m.startMs) — 순번(mi)이면 뷰어에서 사진을 지워 순간이 빠지거나 당겨질 때 남은 순간에 다른 순간의 장소·시간대가 붙는다.
  const [places, setPlaces] = useState<Record<number, AssetPlace>>({});
  const { mediaAssetIds, uploadedMediaUrls } = record;
  useEffect(() => {
    if (!day) return;
    let alive = true;
    (async () => {
      const tries = day.moments.map((m) =>
        m.indexes.map((i): PlaceTry | null => {
          const assetId = localAssetIdOf({ mediaAssetIds, uploadedMediaUrls }, medias[i]);
          if (assetId) return { assetId };
          const ts = mediaTimes?.[medias[i]];
          return ts ? { ts } : null;
        }).filter((c): c is PlaceTry => !!c)
          // 이 기기 assetId가 있는 사진을 먼저 — 시각 매칭이 실패하는 원격 사진에 시도 수를 다 쓰지 않게(안정 정렬)
          .sort((a, b) => Number('ts' in a) - Number('ts' in b))
          .slice(0, PLACE_TRIES));
      if (!tries.some((l) => l.length)) return;
      try {
        // 이 기기 사진이 있으면 기존처럼 권한을 묻고, 시각 폴백만 있으면 팝업 없이 확인만 —
        // 다른 기기 앨범을 열었다고 사진첩 권한 팝업이 뜨면 안 된다
        const hasLocal = tries.some((l) => l.some((c) => 'assetId' in c));
        const perm = hasLocal
          ? await MediaLibrary.requestPermissionsAsync(false) // 읽기만
          : await MediaLibrary.getPermissionsAsync(false);
        if (perm.status !== 'granted') return;
      } catch { return; }
      // 순서대로 — iOS 역지오코딩은 연타하면 제한에 걸린다(한 화면 순간 수만큼이라 순차로도 충분)
      for (let mi = 0; mi < tries.length && alive; mi++) {
        for (const c of tries[mi]) {
          const id = 'assetId' in c ? c.assetId : await assetIdAtTime(c.ts);
          if (!alive) return;
          const place = id ? await placeOfAsset(id) : null;
          if (!alive) return;
          if (place) setPlaces((p) => ({ ...p, [day.moments[mi].startMs]: place }));
          if (place?.name) break; // 시간대만 찾았으면 저장하고 다음 후보로 이름을 더 찾는다
        }
      }
    })();
    return () => { alive = false; };
  }, [day, medias, mediaTimes, mediaAssetIds, uploadedMediaUrls]);

  const dt = day ? new Date(day.startMs) : null;
  const title = dt ? `${t('time.monthDay', { m: dt.getMonth() + 1, d: dt.getDate() })} (${t(WEEK_KEYS[dt.getDay()])})` : '';
  const cell = Math.round(width / 3); // 사진첩 화면과 같은 폭의 1/3

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <HeaderGlassButton back onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel={t('trip.back')}>
          <BackChevronIcon />
        </HeaderGlassButton>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* 정보 줄 — 사진첩 화면과 같은 틀: 달력 + 날짜 · N일차, 오른쪽 그날 사진 수 */}
      <View style={styles.info}>
        <OutlineCalendarIcon size={12} color="rgba(255,255,255,0.6)" />
        <Text style={[styles.infoText, styles.infoGrow]} numberOfLines={1}>
          {dayKey}{day ? `  ·  ${t('comp.sectionDayN', { n: day.dayN })}` : ''}
        </Text>
        <Text style={styles.infoText} numberOfLines={1}>{t('postDetail.albumPhotoCount', { count: order.length })}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {day?.moments.map((m, mi) => {
          const lastTs = mediaTimes?.[medias[m.indexes[m.indexes.length - 1]]] ?? m.startMs;
          // 시각은 사진 찍은 곳의 현지 시간(iOS 역지오코딩 시간대) — 없으면 기기 시간대
          const tz = places[m.startMs]?.tz;
          const start = formatClock(m.startMs, tz), end = formatClock(lastTs, tz);
          const overflows = m.indexes.length * cell + (m.indexes.length - 1) * ROW_GAP > width;
          return (
            <View key={m.startMs} style={mi > 0 && styles.momentNext}>
              {/* 시각(첫~마지막 사진) · 장수, 아래 장소 */}
              <View style={styles.head}>
                <Text style={styles.time} numberOfLines={1}>{start === end ? start : `${start} – ${end}`}</Text>
                <Text style={styles.count} numberOfLines={1}>{m.indexes.length}</Text>
              </View>
              {places[m.startMs]?.name ? (
                <TouchableOpacity
                  style={styles.placeRow}
                  activeOpacity={0.6}
                  hitSlop={{ top: 6, bottom: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('trip.albumDayPlaceMapA11y', { place: places[m.startMs].name })}
                  onPress={() => {
                    const p = places[m.startMs];
                    if (!p.name) return;
                    setMapAt({ name: p.name, lat: p.lat, lon: p.lon, country: p.country });
                    setMapOpen(true);
                  }}
                >
                  <PinIcon size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.place} numberOfLines={1} {...andFitText}>{places[m.startMs].name}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.rowWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {m.indexes.map((i) => (
                    <TouchableOpacity key={`${medias[i]}-${i}`} activeOpacity={0.85} onPress={() => setViewer({ order, at: Math.max(0, order.indexOf(i)) })}>
                      <FeedPhoto uri={medias[i]} thumbs={record.thumbs} style={[styles.img, { width: cell, height: cell }]} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {overflows && (
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.fade, { height: cell }]}
                  />
                )}
              </View>
            </View>
          );
        })}
        {!day && <Text style={styles.empty}>{t('comp.noPhotos')}</Text>}
      </ScrollView>

      <PhotoViewerModal
        visible={viewer !== null}
        uris={viewer ? viewer.order.map((i) => medias[i]) : []}
        initialIndex={viewer?.at ?? 0}
        onClose={() => setViewer(null)}
        showActions
        onSetGlobeCover={toGlobal(setGlobeCover)}
        onSetCover={toGlobal(setCover)}
        onDelete={toGlobal(confirmDeletePhoto)}
      />

      {/* 장소 지도 시트 — 공용 MenuSheet(iOS 시스템 시트 / 안드로이드 Modal 시트) */}
      <MenuSheet visible={mapOpen} onClose={() => setMapOpen(false)} title={mapAt?.name}>
        {mapAt && (
          <>
            {/* 구글 지도 embed — API 키 없이 되는 output=embed 주소. 좌표는 이 요청으로만 나간다(저장 안 함) */}
            <View style={styles.map}>
              <WebView
                // embed 주소를 바로 열면 구글이 "must be used in an iframe"만 낸다(2026-11-04 실기기) — iframe 한 장짜리 페이지로 감싼다
                source={{ html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#2E2E3B}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe src="https://maps.google.com/maps?q=${mapAt.lat},${mapAt.lon}&amp;z=15&amp;hl=${encodeURIComponent(i18n.language)}&amp;output=embed" allowfullscreen></iframe></body></html>` }}
                style={styles.mapWeb}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.mapLoading}><ActivityIndicator color="#A1A1B0" /></View>
                )}
                // 미리보기 밖으로 가는 이동('큰 지도 보기' 링크 등)은 그냥 막는다 — 아래 'Google 지도에서 열기' 행이 그 길이다.
                // 바깥 페이지 첫 로드는 about:(안드로이드는 data:일 수 있음), 지도는 iframe 안(하위 프레임)이라 통과.
                // iframe 주소는 301로 www.google.com/maps/embed?pb=…로 넘어간다 — 두 표시와 유럽 동의 페이지(consent.google.*)도 통과.
                onShouldStartLoadWithRequest={(req) =>
                  req.isTopFrame === false || /output=embed|\/maps\/embed|^about:|^data:|\/\/consent\.google\./.test(req.url)}
              />
            </View>
            {/* 한국 장소만 네이버 지도 — 한국에선 가장 쓸모 있어 맨 위. 앱(nmap://place, 공식 URL Scheme)을 먼저 열고,
                미설치면 모바일 웹 지도(m.map.naver.com/map — lat·lng·dlevel·title로 그 좌표에 핀, dlevel 11 = 위 미리보기 z15)로. */}
            {mapAt.country === 'KR' && (
              <>
                <MenuSheetItem
                  label={t('trip.albumDayOpenNaverMaps')}
                  onPress={() => openMapUrl(
                    `nmap://place?lat=${mapAt.lat}&lng=${mapAt.lon}&name=${encodeURIComponent(mapAt.name)}&appname=${NAVER_APPNAME}`,
                    `https://m.map.naver.com/map?lat=${mapAt.lat}&lng=${mapAt.lon}&dlevel=11&title=${encodeURIComponent(mapAt.name)}`,
                  )}
                />
                <MenuSheetDivider />
              </>
            )}
            <MenuSheetItem
              label={t('trip.albumDayOpenGoogleMaps')}
              onPress={() => openMapUrl(`https://www.google.com/maps/search/?api=1&query=${mapAt.lat},${mapAt.lon}`)}
            />
            {Platform.OS === 'ios' && (
              <>
                <MenuSheetDivider />
                <MenuSheetItem
                  label={t('trip.albumDayOpenAppleMaps')}
                  onPress={() => openMapUrl(`https://maps.apple.com/?ll=${mapAt.lat},${mapAt.lon}&q=${encodeURIComponent(mapAt.name)}`)}
                />
              </>
            )}
          </>
        )}
      </MenuSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  // 헤더 — TripRecordScreen 헤더와 같은 치수
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0F',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  // 정보 줄 — TripRecordScreen albumInfo와 같은 값
  info: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  infoGrow: { flex: 1 },
  // 사진첩 화면 날짜 줄과 같은 간격: 위 30, 줄 아래 11, 다음 묶음 35
  body: { paddingTop: 30 },
  momentNext: { marginTop: 35 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 23 },
  time: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  count: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, marginTop: 4 },
  place: { flexShrink: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  rowWrap: { marginTop: 11 },
  row: { gap: ROW_GAP },
  img: { backgroundColor: '#D9D9D9' },
  map: { height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#2E2E3B', marginBottom: 8 },
  mapWeb: { flex: 1, backgroundColor: '#2E2E3B' },
  mapLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E2E3B' },
  fade: { position: 'absolute', top: 0, right: 0, width: FADE_W },
  empty: { fontSize: 14, color: '#A1A1B0', textAlign: 'center', marginTop: 60 },
});
