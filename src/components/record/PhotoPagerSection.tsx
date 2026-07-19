// 피드 작성 — 큰 사진 페이저 + 현재 사진의 글 입력 + 사진 액션(대표·비공개·삭제).
// 사진을 넘기면 아래 입력칸이 그 사진의 글로 전환된다.
// 대표 지정·비공개·삭제는 사진 하단 액션 바에서 직접 처리한다.
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

const SCREEN_W = Dimensions.get('window').width;
const PAGE_W = SCREEN_W; // 화면 폭 전체(최대한 크게)
const PAGE_H = Math.round(SCREEN_W * 1.05);

export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
  onSetRepresentative, onRemove, onPrivacyPress, privacyMarks,
}: {
  medias: string[];
  photoTexts: string[];
  representativePhoto: string | null;
  onChangeText: (index: number, text: string) => void;
  onAddPress: () => void;
  onSetRepresentative: (index: number) => void;
  onRemove: (index: number) => void;
  onPrivacyPress: (index: number) => void;
  privacyMarks?: boolean[];
}) {
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // 사진 삭제 등으로 배열이 줄면 index와 스크롤 오프셋을 함께 보정
  useEffect(() => {
    if (activeIdx > medias.length - 1) {
      const corrected = Math.max(0, medias.length - 1);
      setActiveIdx(corrected);
      scrollRef.current?.scrollTo({ x: corrected * PAGE_W, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medias.length]); // activeIdx는 의도적으로 제외 — 보정 트리거는 배열 축소뿐

  if (medias.length === 0) {
    return (
      <TouchableOpacity style={st.empty} onPress={onAddPress} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={t('newRecord.photoEmpty')}>
        <Text style={st.emptyPlus}>＋</Text>
        <Text style={st.emptyText}>{t('newRecord.photoEmpty')}</Text>
      </TouchableOpacity>
    );
  }

  const isRep = representativePhoto === medias[activeIdx];
  const hasPrivacy = privacyMarks?.[activeIdx] === true;

  return (
    <View>
      <View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / PAGE_W))}
          style={{ width: PAGE_W, height: PAGE_H }}
        >
          {medias.map((uri, i) => (
            <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: PAGE_W, height: PAGE_H }} resizeMode="cover" />
          ))}
        </ScrollView>
        {/* n/N + 대표 배지 */}
        <View style={st.counter}><Text style={st.counterText}>{activeIdx + 1} / {medias.length}</Text></View>
        {isRep && (
          <View style={st.repBadge}><Text style={st.repBadgeText}>{t('newRecord.repBadge')}</Text></View>
        )}
        {/* 도트 인디케이터 */}
        <View style={st.dots}>
          {medias.map((_, i) => (
            <View key={i} style={[st.dot, i === activeIdx && st.dotOn]} />
          ))}
        </View>
      </View>

      {/* 액션 바: 대표·비공개·삭제 */}
      <View style={st.actionBar}>
        {/* 대표 버튼 — 활성이면 채워진 배지 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, isRep && st.actionBtnActive]}
          onPress={() => onSetRepresentative(activeIdx)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.repBadge')}
        >
          <Text style={[st.actionBtnIcon, isRep && st.actionBtnIconActive]}>★</Text>
          <Text style={[st.actionBtnText, isRep && st.actionBtnTextActive]}>{t('newRecord.repBadge')}</Text>
        </TouchableOpacity>

        {/* 비공개 버튼 — 비공개 설정 존재 시 활성 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, hasPrivacy && st.actionBtnPrivacyActive]}
          onPress={() => onPrivacyPress(activeIdx)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionPrivacy')}
        >
          <Text style={[st.actionBtnIcon, hasPrivacy && st.actionBtnIconPrivacy]}>🔒</Text>
          <Text style={[st.actionBtnText, hasPrivacy && st.actionBtnTextPrivacy]}>{t('newRecord.actionPrivacy')}</Text>
        </TouchableOpacity>

        {/* 삭제 버튼 */}
        <TouchableOpacity
          style={[st.actionBtn, st.actionBtnDelete]}
          onPress={() => onRemove(activeIdx)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionDelete')}
        >
          <Text style={st.actionBtnDeleteIcon}>✕</Text>
          <Text style={st.actionBtnDeleteText}>{t('newRecord.actionDelete')}</Text>
        </TouchableOpacity>
      </View>

      {/* 현재 사진의 글 */}
      <View style={st.captionBox}>
        <Text style={st.captionLabel}>
          {t('newRecord.photoTextLabel', { n: activeIdx + 1, total: medias.length })}
        </Text>
        <TextInput
          style={st.captionInput}
          placeholder={t('newRecord.photoTextPlaceholder')}
          placeholderTextColor="#5a5a68"
          value={photoTexts[activeIdx] ?? ''}
          onChangeText={(v) => onChangeText(activeIdx, v)}
          multiline
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  empty: {
    height: 220, marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#6B21A8', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  emptyPlus: { color: '#BF85FC', fontSize: 34 },
  emptyText: { color: '#A1A1B0', fontSize: 13 },
  counter: {
    position: 'absolute', top: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  counterText: { color: '#FFFFFF', fontSize: 11 },
  repBadge: {
    position: 'absolute', top: 10, left: 12, backgroundColor: '#BF85FC',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  repBadgeText: { color: '#12061f', fontSize: 10, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 4, alignSelf: 'center', position: 'absolute', bottom: 10 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#BF85FC', width: 12 },

  // 액션 바
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 10, gap: 8,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(191,133,252,0.15)', borderColor: '#BF85FC',
  },
  actionBtnPrivacyActive: {
    backgroundColor: 'rgba(107,33,168,0.2)', borderColor: '#6B21A8',
  },
  actionBtnDelete: {
    // 삭제는 기본 스타일에서 텍스트/아이콘 색만 빨강
  },
  actionBtnIcon: { fontSize: 13, color: '#A1A1B0' },
  actionBtnIconActive: { color: '#BF85FC' },
  actionBtnIconPrivacy: { color: '#BF85FC' },
  actionBtnText: { fontSize: 12, color: '#A1A1B0', fontWeight: '600' },
  actionBtnTextActive: { color: '#BF85FC' },
  actionBtnTextPrivacy: { color: '#BF85FC' },
  actionBtnDeleteIcon: { fontSize: 13, color: '#FF3B30' },
  actionBtnDeleteText: { fontSize: 12, color: '#FF3B30', fontWeight: '600' },

  captionBox: { marginHorizontal: 16, marginTop: 10 },
  captionLabel: { color: '#BF85FC', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  captionInput: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 72, textAlignVertical: 'top', fontSize: 14,
  },
});
