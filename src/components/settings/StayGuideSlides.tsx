// 장기 체류 안내 슬라이드 — 설정 '장기체류' 물음표가 연다(글 대신 그림으로, 2026-10-27 사용자 지시).
// 슬라이드 6장은 코드에 실제로 있는 동작만 그린다(SettingsScreen HelpLinesModal 주석의 대조 근거와 같다):
//  1 거주국 불변 가산 레이어(TripGroup.stay) · 2 체류국 기록 → 체류 카드 합류(recordStore)
//  3 체류국 isAbroad=false(도착·스냅 알림 없음) · 4 귀국 일시정지·복귀 재개·제3국 별도 카드(stayMachine)
//  5 체류국 방문국 집계·프로필 '체류 중' 이웃 노출 · 6 동시 1개·60일 무복귀 종료 넛지(shouldNudgeEnd)
// 그림은 앱 아이콘(팔레트 아이콘)과 View 도형만 쓴다 — 이미지 에셋을 늘리지 않는다.
import React, { useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ui/Text';
import { HomeIcon, PlaneIcon, CameraIcon, BellIcon, BellOffIcon, PersonIcon } from '../icons';
import { SETTINGS_COLORS } from './SettingsUI';
import { countryLabel } from '../../utils/countryLabel';

type Place = { flag: string; name: string };

const C = SETTINGS_COLORS;
const PANEL = 'rgba(255,255,255,0.06)';
const PANEL_LINE = 'rgba(255,255,255,0.12)';
const ACCENT_BG = 'rgba(172,111,255,0.16)';
const ACCENT_LINE = 'rgba(172,111,255,0.5)';
const INNER = '#1C1C24';

/** 국기 + 국가명 칩 — 국기와 이름은 다른 Text(삼성 기기 한글 소실, 6ae35f9) */
const PlaceChip = ({ place, accent, tag }: { place: Place; accent?: boolean; tag?: string }) => (
  <View style={[s.chip, accent && s.chipAccent]}>
    <Text style={s.chipText}>{place.flag}</Text>
    <Text style={[s.chipText, accent && s.chipTextAccent]} numberOfLines={1}>{place.name}</Text>
    {tag ? <Text style={[s.chipTag, accent && s.chipTextAccent]}>{tag}</Text> : null}
  </View>
);

const Arrow = () => <Text style={s.arrow}>→</Text>;

export default function StayGuideSlides({ home, stay }: { home: Place; stay: Place }) {
  const { t, i18n } = useTranslation();
  const label = (p: Place): Place => ({ flag: p.flag, name: countryLabel(p.name, i18n.language) });
  const H = label(home);
  const S = label(stay);
  // 제3국 예시 — 거주국·체류국과 겹치지 않게('다른 나라로 가면 새 여행 카드')
  const third = label(
    [{ flag: '🇹🇭', name: '태국' }, { flag: '🇻🇳', name: '베트남' }].find((p) => p.name !== home.name && p.name !== stay.name)
      ?? { flag: '🇫🇷', name: '프랑스' },
  );

  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (w > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / w));
  };
  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * w, animated: true });
    setPage(i);
  };

  const slides: { art: React.ReactNode; title: string; body: string }[] = [
    {
      // 1. 거주 국가는 그대로, 체류 국가가 하나 더
      art: (
        <View style={s.rowCenter}>
          <View style={s.col}>
            <HomeIcon size={48} />
            <PlaceChip place={H} tag={t('stay.guide.tagHome')} />
          </View>
          <Text style={s.plus}>+</Text>
          <View style={s.col}>
            <PlaneIcon size={48} />
            <PlaceChip place={S} accent tag={t('stay.guide.tagStay')} />
          </View>
        </View>
      ),
      title: t('stay.guide.title1'),
      body: t('stay.helpLine1'),
    },
    {
      // 2. 체류국 기록 여러 개 → 체류 카드 한 장
      art: (
        <View style={s.rowCenter}>
          <View style={s.tiles}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[s.tile, { transform: [{ rotate: `${(i - 1) * 8}deg` }] }]}>
                <CameraIcon size={22} />
              </View>
            ))}
          </View>
          <Arrow />
          <View style={s.stayCard}>
            <View style={s.stayCardHead}>
              <Text style={s.chipText}>{S.flag}</Text>
              <Text style={[s.chipText, s.chipTextAccent]} numberOfLines={1}>{t('stay.guide.stayCard', { country: S.name })}</Text>
            </View>
            <View style={s.stayCardLine} />
            <View style={[s.stayCardLine, s.stayCardLineShort]} />
            <Text style={s.small}>{t('stay.guide.recordCount', { count: 12 })}</Text>
          </View>
        </View>
      ),
      title: t('stay.guide.title2'),
      body: t('stay.helpLine2'),
    },
    {
      // 3. 체류국 안에서는 알림 없음 / 다른 해외에서는 도착 알림
      art: (
        <View style={s.rowCenter}>
          <View style={[s.phone, s.phoneAccent]}>
            <PlaceChip place={S} accent />
            <BellOffIcon size={40} slashBg={INNER} />
            <Text style={s.small}>{t('stay.guide.noAlert')}</Text>
          </View>
          <View style={s.phone}>
            <PlaceChip place={third} />
            <BellIcon size={40} dot />
            <Text style={s.small}>{t('stay.guide.arrivalAlert')}</Text>
          </View>
        </View>
      ),
      title: t('stay.guide.title3'),
      body: t('stay.helpLine3'),
    },
    {
      // 4. 체류 → 잠깐 귀국(일시정지) → 다시 체류(재개), 제3국은 새 여행 카드
      art: (
        <View style={s.timelineWrap}>
          <View style={s.timeline}>
            <View style={s.step}>
              <Text style={s.stepFlag}>{S.flag}</Text>
              <Text style={[s.stepPill, s.stepPillOn]}>{t('stay.guide.stepStaying')}</Text>
            </View>
            <Arrow />
            <View style={s.step}>
              <Text style={s.stepFlag}>{H.flag}</Text>
              <Text style={s.stepPill}>{t('stay.guide.stepPaused')}</Text>
            </View>
            <Arrow />
            <View style={s.step}>
              <Text style={s.stepFlag}>{S.flag}</Text>
              <Text style={[s.stepPill, s.stepPillOn]}>{t('stay.guide.stepResumed')}</Text>
            </View>
          </View>
          <View style={s.branch}>
            <Text style={s.stepFlag}>{third.flag}</Text>
            <Arrow />
            <View style={s.tripCard}>
              <Text style={s.small}>{t('stay.guide.newTripCard')}</Text>
            </View>
          </View>
        </View>
      ),
      title: t('stay.guide.title4'),
      body: t('stay.helpLine4'),
    },
    {
      // 5. 방문 국가 +1, 프로필에 '체류 중'
      art: (
        <View style={s.rowCenter}>
          <View style={s.statCard}>
            <Text style={s.small}>{t('stay.guide.visited')}</Text>
            <View style={s.statRow}>
              <Text style={s.statNum}>7</Text>
              <Arrow />
              <Text style={[s.statNum, s.chipTextAccent]}>8</Text>
            </View>
            <View style={s.statRow}>
              <Text style={s.chipText}>+</Text>
              <Text style={s.chipText}>{S.flag}</Text>
            </View>
          </View>
          <View style={s.profileCard}>
            <View style={s.avatar}><PersonIcon size={26} /></View>
            <PlaceChip place={S} accent tag={t('stay.guide.tagStaying')} />
          </View>
        </View>
      ),
      title: t('stay.guide.title5'),
      body: t('stay.helpLine5'),
    },
    {
      // 6. 동시 1개 · 60일 떠나 있으면 끝낼지 한 번 묻기
      art: (
        <View style={s.rowCenter}>
          <View style={s.dayBadge}>
            <Text style={s.dayNum}>60</Text>
            <Text style={s.small}>{t('stay.guide.days')}</Text>
          </View>
          <Arrow />
          <View style={s.bubble}>
            <Text style={s.bubbleText}>{t('stay.guide.endAsk')}</Text>
            <View style={s.bubbleBtns}>
              <Text style={s.bubbleBtn}>{t('common.cancel')}</Text>
              <Text style={[s.bubbleBtn, s.bubbleBtnOn]}>{t('stay.endStay')}</Text>
            </View>
          </View>
        </View>
      ),
      title: t('stay.guide.title6'),
      body: t('stay.helpLine6'),
    },
  ];

  return (
    <View style={s.root} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {w > 0 && (
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
        >
          {slides.map((sl, i) => (
            // 그림은 장식 — 스크린리더는 제목·설명만 한 덩어리로 읽는다
            <View key={i} style={{ width: w }} accessible accessibilityLabel={`${sl.title}. ${sl.body}`}>
              <View style={s.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>{sl.art}</View>
              <Text style={s.title}>{sl.title}</Text>
              <Text style={s.body}>{sl.body}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      {/* 쪽 표시 — 눌러서도 넘긴다 */}
      <View style={s.dots}>
        {slides.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goTo(i)}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1} / ${slides.length}`}
            accessibilityState={{ selected: i === page }}
          >
            <View style={[s.dot, i === page && s.dotOn]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { marginTop: 16 },
  art: { height: 170, borderRadius: 18, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontSize: 15, fontWeight: '700', color: C.white, textAlign: 'center', marginTop: 16 },
  body: { fontSize: 13, lineHeight: 19, color: C.text50, textAlign: 'center', marginTop: 6, paddingHorizontal: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { width: 18, backgroundColor: C.label },

  rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10 },
  col: { alignItems: 'center', gap: 8 },
  plus: { fontSize: 22, fontWeight: '700', color: C.text50 },
  arrow: { fontSize: 18, color: C.text50 },
  small: { fontSize: 11, color: C.text50, textAlign: 'center' },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: PANEL_LINE, maxWidth: 150 },
  chipAccent: { backgroundColor: ACCENT_BG, borderColor: ACCENT_LINE },
  chipText: { fontSize: 12, fontWeight: '600', color: C.white, flexShrink: 1 },
  chipTextAccent: { color: C.label },
  chipTag: { fontSize: 10, fontWeight: '700', color: C.text50 },

  tiles: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  tile: { position: 'absolute', width: 52, height: 52, borderRadius: 10, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', justifyContent: 'center' },
  stayCard: { width: 132, padding: 10, gap: 7, borderRadius: 12, backgroundColor: INNER, borderWidth: 1, borderColor: ACCENT_LINE },
  stayCardHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stayCardLine: { height: 6, borderRadius: 3, backgroundColor: PANEL_LINE },
  stayCardLineShort: { width: '70%' },

  phone: { width: 112, height: 130, borderRadius: 16, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 6 },
  phoneAccent: { borderColor: ACCENT_LINE },

  timelineWrap: { alignItems: 'center', gap: 14 },
  timeline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { alignItems: 'center', gap: 5 },
  stepFlag: { fontSize: 22 },
  stepPill: { fontSize: 10, fontWeight: '700', color: C.text50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: PANEL, overflow: 'hidden' },
  stepPillOn: { color: C.label, backgroundColor: ACCENT_BG },
  branch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripCard: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE },

  statCard: { width: 112, paddingVertical: 12, borderRadius: 12, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', gap: 6 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statNum: { fontSize: 22, fontWeight: '800', color: C.white },
  profileCard: { width: 140, paddingVertical: 12, borderRadius: 12, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center' },

  dayBadge: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: ACCENT_LINE, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 22, fontWeight: '800', color: C.label },
  bubble: { width: 160, padding: 12, borderRadius: 14, backgroundColor: INNER, borderWidth: 1, borderColor: PANEL_LINE, gap: 10 },
  bubbleText: { fontSize: 12, fontWeight: '600', color: C.white, textAlign: 'center' },
  bubbleBtns: { flexDirection: 'row', justifyContent: 'space-around' },
  bubbleBtn: { fontSize: 11, color: C.text50 },
  bubbleBtnOn: { color: C.red, fontWeight: '700' },
});
