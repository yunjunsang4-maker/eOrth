// 피드 작성 — 큰 사진 페이저 + 현재 사진의 글 입력.
// 사진을 넘기면 아래 입력칸이 그 사진의 글로 전환된다. 재정렬·대표 지정·비공개는
// 아래 썸네일 스트립(기존 DraggablePhotoGrid)이 담당하고, 이 컴포넌트는 크게 보기+글만.
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

const SCREEN_W = Dimensions.get('window').width;
const PAGE_W = SCREEN_W; // 화면 폭 전체(최대한 크게)
const PAGE_H = Math.round(SCREEN_W * 1.05);

export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
}: {
  medias: string[];
  photoTexts: string[];
  representativePhoto: string | null;
  onChangeText: (index: number, text: string) => void;
  onAddPress: () => void;
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
        {/* n/N + 대표 표시 */}
        <View style={st.counter}><Text style={st.counterText}>{activeIdx + 1} / {medias.length}</Text></View>
        {representativePhoto === medias[activeIdx] && (
          <View style={st.repBadge}><Text style={st.repBadgeText}>{t('newRecord.repBadge')}</Text></View>
        )}
        {/* 도트 인디케이터 */}
        <View style={st.dots}>
          {medias.map((_, i) => (
            <View key={i} style={[st.dot, i === activeIdx && st.dotOn]} />
          ))}
        </View>
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
  captionBox: { marginHorizontal: 16, marginTop: 10 },
  captionLabel: { color: '#BF85FC', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  captionInput: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 72, textAlignVertical: 'top', fontSize: 14,
  },
});
