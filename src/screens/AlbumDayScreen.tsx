// 사진첩 하루 보기 — 앨범 날짜 줄의 '>'로 들어온다(TripRecordScreen → AlbumTimeline onOpenDay).
// 그날 사진을 촬영시각 순간(utils/albumSections MOMENT_GAP_MS 묶음)별로 '시각 · 장소' 줄 + 가로 사진 줄로 보여 준다.
// 디자인은 사진첩 화면(2026-11-03 시안)과 같은 틀: 글래스 뒤로 + 가운데 제목, 위아래 선 사이 정보 줄, 134 칸 가로 줄.
//
// 장소는 저장하지 않는다(utils/photoPlace 주석) — 이 기기 사진첩 좌표 → 역지오코딩을 화면을 열 때만 한다.
// 그래서 다른 기기에서 만든 사진첩이나 기기 사진첩에 없는 사진은 장소 없이 시각만 나온다.
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import HeaderGlassButton from '../components/HeaderGlassButton';
import { BackChevronIcon, OutlineCalendarIcon, PinIcon } from '../components/icons';
import FeedPhoto from '../components/FeedPhoto';
import PhotoViewerModal from '../components/PhotoViewerModal';
import { useRecordData } from '../store/recordStore';
import { buildAlbumTimeline, effectiveMediaTimes } from '../utils/albumSections';
import { localAssetIdOf, formatPlace } from '../utils/photoPlace';
import { isUsableLatLon } from '../utils/photoLocationBatch';
import { andFitText } from '../utils/fitText';
import { useStageWidth } from '../utils/stage';
import type { RootStackScreenProps } from '../navigation/types';

const ROW_GAP = 3;  // AlbumTimeline 가로 줄과 같은 값
const FADE_W = 70;
const PLACE_TRIES = 3; // 순간마다 좌표를 찾아볼 사진 수 상한 — 역지오코딩 호출 수를 묶는다
const WEEK_KEYS = ['calendar.week0', 'calendar.week1', 'calendar.week2', 'calendar.week3', 'calendar.week4', 'calendar.week5', 'calendar.week6'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

// assetId → 장소 이름(없으면 null). 같은 사진을 다시 열 때 역지오코딩을 또 부르지 않게 앱 실행 동안만 기억한다.
// ponytail: 메모리 캐시만 — 앱을 다시 켜면 다시 찾는다. 느리다는 말이 나오면 AsyncStorage로.
const placeCache = new Map<string, Promise<string | null>>();
function placeOfAsset(assetId: string): Promise<string | null> {
  let p = placeCache.get(assetId);
  if (!p) {
    p = (async () => {
      // 네트워크 다운로드 없이 — 좌표는 사진첩 DB 값이라 iCloud 원본을 받으러 갈 필요가 없다
      const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
      const loc = info?.location;
      if (!loc || !isUsableLatLon(loc.latitude, loc.longitude)) return null;
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.latitude, longitude: loc.longitude });
      return formatPlace(geo);
    })().catch(() => null);
    placeCache.set(assetId, p);
  }
  return p;
}

export default function AlbumDayScreen({ navigation, route }: RootStackScreenProps<'AlbumDay'>) {
  const { t } = useTranslation();
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
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  // 순간별 장소 — 순간의 앞쪽 사진부터 이 기기 assetId가 있는 것으로 최대 PLACE_TRIES장 시도
  const [places, setPlaces] = useState<Record<number, string>>({});
  const { mediaAssetIds, uploadedMediaUrls } = record;
  useEffect(() => {
    if (!day) return;
    let alive = true;
    (async () => {
      const ids = day.moments.map((m) =>
        m.indexes.map((i) => localAssetIdOf({ mediaAssetIds, uploadedMediaUrls }, medias[i]))
          .filter((id): id is string => !!id).slice(0, PLACE_TRIES));
      if (!ids.some((l) => l.length)) return; // 이 기기 사진이 없으면 권한도 묻지 않는다
      try {
        const perm = await MediaLibrary.requestPermissionsAsync(false); // 읽기만
        if (perm.status !== 'granted') return;
      } catch { return; }
      // 순서대로 — iOS 역지오코딩은 연타하면 제한에 걸린다(한 화면 순간 수만큼이라 순차로도 충분)
      for (let mi = 0; mi < ids.length && alive; mi++) {
        for (const id of ids[mi]) {
          const name = await placeOfAsset(id);
          if (!alive) return;
          if (name) { setPlaces((p) => ({ ...p, [mi]: name })); break; }
        }
      }
    })();
    return () => { alive = false; };
  }, [day, medias, mediaAssetIds, uploadedMediaUrls]);

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
          const start = hhmm(m.startMs), end = hhmm(lastTs);
          const overflows = m.indexes.length * cell + (m.indexes.length - 1) * ROW_GAP > width;
          return (
            <View key={m.startMs} style={mi > 0 && styles.momentNext}>
              {/* 시각(첫~마지막 사진) · 장수, 아래 장소 */}
              <View style={styles.head}>
                <Text style={styles.time} numberOfLines={1}>{start === end ? start : `${start} – ${end}`}</Text>
                <Text style={styles.count} numberOfLines={1}>{m.indexes.length}</Text>
              </View>
              {places[mi] ? (
                <View style={styles.placeRow}>
                  <PinIcon size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.place} numberOfLines={1} {...andFitText}>{places[mi]}</Text>
                </View>
              ) : null}
              <View style={styles.rowWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {m.indexes.map((i) => (
                    <TouchableOpacity key={`${medias[i]}-${i}`} activeOpacity={0.85} onPress={() => setViewerAt(order.indexOf(i))}>
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
        visible={viewerAt !== null}
        uris={order.map((i) => medias[i])}
        initialIndex={Math.max(0, viewerAt ?? 0)}
        onClose={() => setViewerAt(null)}
      />
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
  fade: { position: 'absolute', top: 0, right: 0, width: FADE_W },
  empty: { fontSize: 14, color: '#A1A1B0', textAlign: 'center', marginTop: 60 },
});
