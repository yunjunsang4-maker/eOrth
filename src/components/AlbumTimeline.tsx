// AlbumTimeline — 사진첩(앨범) 촬영시각 세로 타임라인 (내 사진첩·남의 사진첩 보기 공용)
//
//   ●  3월 2일 (토)  1일차
//   │  ┌──┐┌──┐┌──┐
//   │  14:20                ← 그날 순간이 둘 이상일 때만 시작 시각
//   │  ┌──┐┌──┐
//   ●  3월 3일 (일)  2일차
//
// 데이터는 저장하지 않고 medias + mediaTimes로 렌더 시점에 유도한다(utils/albumSections
// buildAlbumTimeline). 시각 있는 사진이 하나도 없으면(옛 기록·EXIF 없는 사진만) 선 없이
// 예전과 같은 평면 3열 격자로 그린다.
// 선·점은 Svg가 아니라 View로 그린다 — 새 아키텍처에서 Svg는 pointerEvents를 무시하고
// 터치를 삼켜(eorth-android-traps 3) 옆 사진 탭이 먹통이 될 수 있다.
import React, { useMemo, useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import { buildAlbumTimeline } from '../utils/albumSections';
import { useSkinAccent } from '../constants/skinTheme';
import { andFitText } from '../utils/fitText';

const RAIL_W = 28;  // 왼쪽 선 영역
const GAP = 2;      // 사진 사이 간격(예전 격자와 같음)
const DOT = 10;
const HEAD_H = 22;  // 날짜 줄 최소 높이 — 실제 높이는 글자 배율 따라 커지고, 점은 실측 높이 가운데에 맞춘다
const BODY_PB = 16; // 그룹 사이 간격(groupBody 하단 패딩)
const WEEK_KEYS = ['calendar.week0', 'calendar.week1', 'calendar.week2', 'calendar.week3', 'calendar.week4', 'calendar.week5', 'calendar.week6'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

interface Props {
  medias: string[];
  mediaTimes?: Record<string, number>;
  width: number; // 가용 폭
  // 탭한 사진의 medias 전역 인덱스 + 화면 표시 순서(뷰어 스와이프 순서로 쓴다)
  onPressPhoto: (globalIdx: number, order: number[]) => void;
  // 다중 선택 모드 — 탭이 선택 토글로 바뀌고 체크 오버레이 표시
  selecting?: boolean;
  selected?: number[];
  onToggleSelect?: (globalIdx: number) => void;
  onAddPhotos?: () => void; // 있으면 맨 끝에 '+' 타일(편집 모드)
  cellRadius?: number;
  // 있으면(=편집 가능한 내 사진첩) 촬영시각 없는 사진이 있을 때만 '날짜 다시 찾기' 버튼
  onReanalyze?: () => void;
  reanalyzing?: boolean;
}

export default function AlbumTimeline({ medias, mediaTimes, width, onPressPhoto, selecting, selected, onToggleSelect, onAddPhotos, cellRadius = 0, onReanalyze, reanalyzing }: Props) {
  const { t } = useTranslation();
  const a = useSkinAccent();
  const tl = useMemo(() => buildAlbumTimeline(medias, mediaTimes), [medias, mediaTimes]);
  // 날짜 줄 실측 높이 — iOS는 글자 배율 상한이 없어(ui/Text FONT_SCALE_CAP) 큰 글자에서 22를 넘는다.
  // 라벨이 전부 한 줄(numberOfLines=1)·같은 글꼴이라 첫 그룹 하나만 재서 모든 점에 쓴다.
  const [headH, setHeadH] = useState(HEAD_H);
  const flat = tl.days.length === 0;
  // 3등분 — floor로 내려 3칸+간격이 폭을 넘어 줄바꿈되는 일을 막는다
  const cell = Math.floor((width - (flat ? 0 : RAIL_W) - GAP * 2) / 3);
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
        <Image source={{ uri: medias[i] }} style={[cellStyle, styles.img]} resizeMode="cover" />
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

  const addTile = onAddPhotos && !selecting ? (
    <TouchableOpacity key="add" style={[cellStyle, styles.addTile]} onPress={onAddPhotos} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('comp.albumAddPhotos')}>
      <Text style={styles.addPlus}>＋</Text>
      {/* 고정폭 타일 라벨 — 안드로이드 한글 폰트가 넓어 줄바꿈되지 않게 한 줄 축소 */}
      <Text style={styles.addLabel} {...andFitText}>{t('comp.albumAddPhotos')}</Text>
    </TouchableOpacity>
  ) : null;

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
        {/* 시각 있는 사진이 0장이라 선 없이 그리는 경우 — 격자 위 한 줄 안내 + 같은 버튼 */}
        {reanalyzeBtn && (
          <View style={styles.flatHint}>
            <Text style={styles.flatHintTxt} numberOfLines={1} {...andFitText}>{t('comp.albumNoDatesHint')}</Text>
            {reanalyzeBtn}
          </View>
        )}
        <View style={styles.grid}>
          {tl.order.map(tile)}
          {addTile}
        </View>
      </View>
    );
  }

  // 그룹 = 날짜 하루 또는 맨 끝 '날짜 미상'. 마지막 그룹의 마지막 격자에 '+' 타일을 붙인다.
  const groups = [
    ...tl.days.map((d) => {
      const dt = new Date(d.startMs);
      return {
        key: d.key,
        label: `${t('time.monthDay', { m: dt.getMonth() + 1, d: dt.getDate() })} (${t(WEEK_KEYS[dt.getDay()])})`,
        sub: t('comp.sectionDayN', { n: d.dayN }),
        dim: false,
        // 순간이 하나뿐인 날은 시각 라벨 생략
        chunks: d.moments.map((m) => {
          const mt = new Date(m.startMs);
          return { time: d.moments.length > 1 ? `${pad2(mt.getHours())}:${pad2(mt.getMinutes())}` : null, indexes: m.indexes };
        }),
      };
    }),
    ...(tl.undated.length > 0
      ? [{ key: 'undated', label: t('comp.albumUndated'), sub: null, dim: true, chunks: [{ time: null, indexes: tl.undated }] }]
      : []),
  ];

  return (
    <View>
      {groups.map((g, gi) => (
        <View key={g.key} style={styles.groupRow}>
          <View style={styles.rail}>
            {/* 첫 그룹은 점에서 선이 시작하고, 마지막 그룹은 하단 간격을 빼 마지막 사진 행에서 끝난다 */}
            <View style={[styles.line, { top: gi === 0 ? headH / 2 : 0, bottom: gi === groups.length - 1 ? BODY_PB : 0 }]} />
            <View style={[styles.dot, { top: (headH - DOT) / 2, backgroundColor: g.dim ? '#5A5A6E' : a.accent }]} />
          </View>
          <View style={styles.groupBody}>
            <View style={styles.head} onLayout={gi === 0 ? (e) => setHeadH(e.nativeEvent.layout.height) : undefined}>
              <Text style={[styles.headLabel, g.dim && { color: '#A1A1B0' }]} numberOfLines={1} {...andFitText}>{g.label}</Text>
              {g.sub && <Text style={styles.headSub} numberOfLines={1}>{g.sub}</Text>}
              {g.key === 'undated' && reanalyzeBtn}
            </View>
            {g.chunks.map((c, ci) => (
              <View key={ci}>
                {c.time && <Text style={styles.time} numberOfLines={1}>{c.time}</Text>}
                <View style={styles.grid}>
                  {c.indexes.map(tile)}
                  {gi === groups.length - 1 && ci === g.chunks.length - 1 && addTile}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  img: { backgroundColor: '#1A0A2E' },
  groupRow: { flexDirection: 'row' },
  rail: { width: RAIL_W },
  line: {
    position: 'absolute',
    left: RAIL_W / 2 - 1,
    width: 2,
    // 구분선 토큰(#1A1A26)은 배경 위에서 거의 안 보여 한 단계 밝은 카드색을 쓴다
    backgroundColor: '#2E2E3B',
  },
  dot: {
    position: 'absolute',
    left: RAIL_W / 2 - DOT / 2,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  groupBody: { flex: 1, paddingBottom: BODY_PB },
  head: { minHeight: HEAD_H, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headLabel: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  headSub: { fontSize: 12, color: '#A1A1B0' },
  // '날짜 미상' 줄(평면 격자에선 안내 줄)의 오른쪽 끝
  reBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  reTxt: { fontSize: 13, fontWeight: '600' },
  flatHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  flatHintTxt: { flexShrink: 1, fontSize: 13, color: '#A1A1B0' },
  time: { fontSize: 12, fontWeight: '600', color: '#A1A1B0', marginTop: 4, marginBottom: 6 },
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
  addTile: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPlus: { fontSize: 26, color: '#A1A1B0', lineHeight: 30 },
  addLabel: { fontSize: 11, color: '#A1A1B0' },
});
