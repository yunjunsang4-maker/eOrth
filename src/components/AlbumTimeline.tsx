// AlbumTimeline — 사진첩(앨범) 촬영시각 날짜별 묶음 (내 사진첩·남의 사진첩 보기 공용)
//
//   3월 2일 (토)  4                    (⋯)
//   ┌────┐┌────┐┌────┐┌──…  ← 하루 사진은 가로 한 줄 슬라이드(2026-11-03 시안 iPhone 17 - 126)
//   3월 3일 (일)  2
//   ┌────┐┌────┐
//
// 데이터는 저장하지 않고 medias + mediaTimes로 렌더 시점에 유도한다(utils/albumSections
// buildAlbumTimeline). 시각 있는 사진이 하나도 없으면(옛 기록·EXIF 없는 사진만) 날짜 줄 없이
// 예전과 같은 평면 3열 격자로 그린다. 하루 안의 순간(시각) 구분은 시안에서 빠져 한 줄로 이어 붙인다.
// 칸은 FeedPhoto(expo-image)로 그린다 — 메모리·디스크 캐시(재방문 즉시 표시)와, 원격이면 thumbs의 640px 축소본을
// 고르기 위해서다. 크게 보기(뷰어)는 호출부가 medias 원본을 그대로 넘긴다.
// ⚠️ earlyResize 필수: expo-image iOS는 이걸 켜야 칸 크기로 '디코드 단계에서' 줄인다. 끄면 옛 앨범 원본 HEIC
//    (12~48MP)를 칸마다 전체 디코드하고 메모리 캐시에도 전체 크기로 쌓아, 100칸 동시 로드 시 메모리가 치솟는다.
//    안드로이드(Glide)는 원래 목표 크기로 디코드한다.
import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import { buildAlbumTimeline } from '../utils/albumSections';
import { dayKeyToDate } from '../utils/albumAddSummary';
import { useSkinAccent } from '../constants/skinTheme';
import { andFitText } from '../utils/fitText';
import FeedPhoto from './FeedPhoto';
import { BackChevronIcon, PinIcon } from './icons';
import { PillRing } from './record/CalendarBottomSheet';

const GAP = 2;      // 평면 격자 사진 사이 간격(예전 격자와 같음)
const ROW_GAP = 3;  // 가로 줄 사진 사이 간격(시안 3)
const FADE_W = 70;  // 줄 오른쪽 끝 흐림 폭(시안: 검정 25% → 0)
const WEEK_KEYS = ['calendar.week0', 'calendar.week1', 'calendar.week2', 'calendar.week3', 'calendar.week4', 'calendar.week5', 'calendar.week6'] as const;

interface Props {
  medias: string[];
  mediaTimes?: Record<string, number>;
  // 앨범 나라 시간대(utils/albumTimeZone albumTimeZoneOf) — 날짜 줄을 여행지 날짜로 나눈다. 없으면 기기 시간대.
  // 하루 보기(AlbumDayScreen)·날짜별 사진 추가(TripRecordScreen)도 같은 값을 써야 날짜 키가 맞는다
  timeZone?: string;
  // 기록의 원본 URL → 640px 축소본 맵(TravelRecord.thumbs) — 격자 칸에만 쓴다. 로컬 file://는 매칭되지 않아 그대로
  thumbs?: Record<string, string>;
  width: number; // 가용 폭
  // 날짜 줄 좌우 들여쓰기 — 사진 줄은 width 끝까지 붙이고 글자만 안쪽으로(화면 폭을 넘겨받는 내 사진첩 16)
  inset?: number;
  // 탭한 사진의 medias 전역 인덱스 + 화면 표시 순서(뷰어 스와이프 순서로 쓴다)
  onPressPhoto: (globalIdx: number, order: number[]) => void;
  // 다중 선택 모드 — 탭이 선택 토글로 바뀌고 체크 오버레이 표시
  selecting?: boolean;
  selected?: number[];
  onToggleSelect?: (globalIdx: number) => void;
  // 있으면 날짜 줄 오른쪽 ⋯ — 그날 사진의 medias 전역 인덱스·날짜 라벨·그룹 키('YYYY.MM.DD' 또는 'undated')를 넘긴다(메뉴는 호출부가 띄운다)
  onDayMenu?: (indexes: number[], label: string, dayKey: string) => void;
  // 날짜 키 → 그날 장소 이름(내 사진첩만, TripRecordScreen이 기기 사진첩 좌표로 계산). 표시만 한다 — 저장하지 않는 값
  dayPlaces?: Record<string, string>;
  // 있으면 날짜 줄(날짜·장수 + '>')을 누를 때 그날 하루 보기로 — AlbumDay 키('YYYY.MM.DD')를 넘긴다. '날짜 미상'엔 없다
  onOpenDay?: (dayKey: string) => void;
  cellRadius?: number;
  // 있으면(=편집 가능한 내 사진첩) 촬영시각 없는 사진이 있을 때만 '날짜 다시 찾기' 버튼
  onReanalyze?: () => void;
  reanalyzing?: boolean;
}

export default function AlbumTimeline({ medias, mediaTimes, timeZone, thumbs, width, inset = 0, onPressPhoto, selecting, selected, onToggleSelect, onDayMenu, dayPlaces, onOpenDay, cellRadius = 0, onReanalyze, reanalyzing }: Props) {
  const { t } = useTranslation();
  const a = useSkinAccent();
  const tl = useMemo(() => buildAlbumTimeline(medias, mediaTimes, timeZone), [medias, mediaTimes, timeZone]);
  const flat = tl.days.length === 0;
  // 평면 격자는 3등분(floor — 3칸+간격이 폭을 넘어 줄바꿈되지 않게). 가로 줄은 폭의 1/3(402 → 134)이라
  // 셋째 칸이 살짝 잘려 옆으로 넘길 수 있다는 게 보인다(시안)
  const cell = flat ? Math.floor((width - GAP * 2) / 3) : Math.round(width / 3);
  const cellStyle = { width: cell, height: cell, borderRadius: cellRadius };

  const tile = (i: number) => {
    const isSel = !!selecting && (selected ?? []).includes(i);
    return (
      <TouchableOpacity
        key={`${medias[i]}-${i}`}
        activeOpacity={0.85}
        onPress={() => (selecting ? onToggleSelect?.(i) : onPressPhoto(i, tl.order))}
        style={[cellStyle, { overflow: 'hidden' }]}
      >
        <FeedPhoto uri={medias[i]} thumbs={thumbs} style={[cellStyle, styles.img]} earlyResize />
        {selecting && (
          <View style={[styles.selOverlay, isSel && styles.selOverlayOn]}>
            <View style={[styles.selCheck, isSel && styles.selCheckOn]}>
              {isSel && <Text style={styles.selCheckTxt}>✓</Text>}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // '날짜 다시 찾기' — 촬영시각 없는 사진이 있을 때만. 선택 모드에선 숨긴다(탭이 선택 토글이라 헷갈림).
  const reLabel = t(reanalyzing ? 'comp.albumReanalyzing' : 'comp.albumReanalyze');
  const reanalyzeBtn = onReanalyze && !selecting && tl.undated.length > 0 ? (
    <TouchableOpacity
      onPress={onReanalyze}
      disabled={reanalyzing}
      // 13px 한 줄 라벨(약 18pt) + 위아래 14 = 세로 44pt 이상
      hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityState={{ busy: !!reanalyzing, disabled: !!reanalyzing }}
      accessibilityLabel={reLabel}
      style={styles.reBtn}
      activeOpacity={0.7}
    >
      {reanalyzing && <ActivityIndicator size="small" color={a.accent} />}
      {/* 짧은 버튼 라벨 — 안드로이드 한글 폰트가 넓어 줄바꿈되지 않게 한 줄 축소 */}
      <Text style={[styles.reTxt, { color: a.accent }]} numberOfLines={1} {...andFitText}>{reLabel}</Text>
    </TouchableOpacity>
  ) : null;

  if (flat) {
    return (
      <View>
        {/* 시각 있는 사진이 0장이라 날짜 줄 없이 그리는 경우 — 격자 위 한 줄 안내 + 같은 버튼 */}
        {reanalyzeBtn && (
          <View style={[styles.flatHint, { paddingHorizontal: inset }]}>
            <Text style={styles.flatHintTxt} numberOfLines={1} {...andFitText}>{t('comp.albumNoDatesHint')}</Text>
            {reanalyzeBtn}
          </View>
        )}
        <View style={styles.grid}>
          {tl.order.map(tile)}
        </View>
      </View>
    );
  }

  // 그룹 = 날짜 하루 또는 맨 끝 '날짜 미상'.
  const groups = [
    ...tl.days.map((d) => {
      // 라벨은 날짜 키(앨범 시간대 날짜)에서 — 기기 시간대 new Date(startMs)로 만들면 키와 다른 날·요일이 찍힌다
      const dt = dayKeyToDate(d.key) ?? new Date(d.startMs);
      return {
        key: d.key,
        label: `${t('time.monthDay', { m: dt.getMonth() + 1, d: dt.getDate() })} (${t(WEEK_KEYS[dt.getDay()])})`,
        dim: false,
        indexes: d.moments.flatMap((m) => m.indexes),
      };
    }),
    ...(tl.undated.length > 0 ? [{ key: 'undated', label: t('comp.albumUndated'), dim: true, indexes: tl.undated }] : []),
  ];

  return (
    <View>
      {groups.map((g, gi) => {
        const n = g.indexes.length;
        // 칸들이 폭을 넘을 때만 오른쪽 흐림 — 넘길 게 더 있다는 신호
        const overflows = n * cell + (n - 1) * ROW_GAP > width;
        const place = dayPlaces?.[g.key];
        return (
          <View key={g.key} style={gi > 0 && styles.dayNext}>
            <View style={[styles.head, { paddingHorizontal: inset }, !!place && styles.headWithPlace]}>
              {onOpenDay && !selecting && g.key !== 'undated' ? (
                <TouchableOpacity
                  style={styles.headOpen}
                  onPress={() => onOpenDay(g.key)}
                  hitSlop={{ top: 11, bottom: 11 }}
                  accessibilityRole="button"
                  accessibilityLabel={g.label}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headLabel} numberOfLines={1} {...andFitText}>{g.label}</Text>
                  <Text style={styles.headCount} numberOfLines={1}>{g.indexes.length}</Text>
                  {/* 상대 프로필 '겹치는 나라' 줄과 같은 원형 '>' — 원 14·#28292D + 공용 유리 테두리 + 공용 꺾쇠 좌우 반전.
                      꺾쇠 Svg는 터치 삼킴 방지로 View(pointerEvents none)로 감싼다 */}
                  <View style={styles.headChevron}>
                    <PillRing width={14} height={14} radius={7} />
                    <View pointerEvents="none" style={styles.headChevronFlip}>
                      <BackChevronIcon size={7} opacity={1} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={[styles.headLabel, g.dim && { color: '#A1A1B0' }]} numberOfLines={1} {...andFitText}>{g.label}</Text>
                  <Text style={styles.headCount} numberOfLines={1}>{g.indexes.length}</Text>
                </>
              )}
              {g.key === 'undated' && reanalyzeBtn}
              {onDayMenu && !selecting && (
                <TouchableOpacity
                  style={styles.dayMenuBtn}
                  onPress={() => onDayMenu(g.indexes, g.label, g.key)}
                  hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.label} ⋯`}
                  activeOpacity={0.7}
                >
                  {/* 앱 공용 유리 테두리(대각 그라데이션) — 게시물·프로필 ⋯ 버튼과 같은 링.
                      날짜마다 반복돼 기본 세기는 강하다는 지적(2026-11-07)으로 이 버튼만 0.6 */}
                  <PillRing width={23} height={23} radius={11.5} opacity={0.6} />
                  <View style={styles.dayMenuDot} /><View style={styles.dayMenuDot} /><View style={styles.dayMenuDot} />
                </TouchableOpacity>
              )}
            </View>
            {/* 그날 장소 한 줄 — 가변 길이라 축소(andFitText) 대신 말줄임. 시안 없음: 날짜 줄 아래 12 회색 */}
            {place ? (
              <View style={[styles.placeRow, { paddingHorizontal: inset }]}>
                <PinIcon size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.placeTxt} numberOfLines={1}>{place}</Text>
              </View>
            ) : null}
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {g.indexes.map(tile)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  img: { backgroundColor: '#D9D9D9' }, // 로딩 중 칸 색 — 2026-11-03 시안 자리표시 회백색
  // 시안: 날짜 줄 아래 11 → 사진 줄, 사진 줄 아래 35 → 다음 날짜 줄
  dayNext: { marginTop: 35 },
  head: { minHeight: 23, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  headLabel: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  headCount: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  // 장소 줄이 있으면 날짜 줄 아래 4 → 장소 줄 → 11 → 사진 줄(장소 없을 때의 11 간격은 그대로)
  headWithPlace: { marginBottom: 4 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 11 },
  placeTxt: { flexShrink: 1, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  // 날짜·장수·'>' 묶음 — 줄 안에서 줄어들 수 있게(⋯ 버튼 자리 보장)
  headOpen: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  // FriendProfileScreen overlapChevron과 같은 값 — 테두리는 PillRing(borderWidth 주면 이중 테두리)
  headChevron: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#28292D', alignItems: 'center', justifyContent: 'center' },
  headChevronFlip: { transform: [{ scaleX: -1 }] },
  // 시안 ⋯ — 지름 22.6·흰 10% 원 + 흰 점 3개(지름 2.3)
  dayMenuBtn: {
    marginLeft: 'auto',
    width: 23,
    height: 23,
    borderRadius: 11.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayMenuDot: { width: 2.3, height: 2.3, borderRadius: 1.15, backgroundColor: '#FFFFFF' },
  row: { gap: ROW_GAP },
  fade: { position: 'absolute', top: 0, right: 0, width: FADE_W },
  // '날짜 미상' 줄(평면 격자에선 안내 줄)의 오른쪽 끝
  reBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  reTxt: { fontSize: 13, fontWeight: '600' },
  flatHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  flatHintTxt: { flexShrink: 1, fontSize: 13, color: '#A1A1B0' },
  selOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
  },
  selOverlayOn: { backgroundColor: 'rgba(107,33,168,0.35)' },
  selCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCheckOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  selCheckTxt: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', lineHeight: 15 },
});
