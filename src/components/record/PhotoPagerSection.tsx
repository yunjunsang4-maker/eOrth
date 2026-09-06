// 피드 작성 — 큰 사진 페이저 + 현재 사진의 글 입력 + 사진 액션(대표·비공개·삭제).
// 사진을 넘기면 아래 입력칸이 그 사진의 글로 전환된다.
// 대표 지정·비공개·삭제는 사진 하단 액션 바에서 직접 처리한다.
// 프레임(비율·채움색)은 게시물 단위 — 액션 바 넷째 버튼으로 칩을 펼쳐 고른다(2026-09-06).
import { warn, select } from '../../utils/haptics';
import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, Image, StyleSheet, Alert } from 'react-native';
import { Text, TextInput } from '../../ui/Text';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon } from '../icons';
import { useSkinAccent } from '../../constants/skinTheme';
import { useStageWidth } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';
import {
  PHOTO_FRAME_RATIOS, PHOTO_FRAME_FILLS, isFramed, frameHeight, frameFillColor,
  type PhotoFrame, type PhotoFrameRatio, type PhotoFrameFill,
} from '../../utils/photoFrame';

export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
  onSetRepresentative, onRemove, onPrivacyPress, privacyMarks, frame, onChangeFrame, bleed = 0,
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
  frame: PhotoFrame;
  onChangeFrame: (f: PhotoFrame) => void;
  // 부모 본문의 좌우 패딩(px). 페이저는 스테이지 폭 전체로 그리므로 이 값만큼 음수 마진으로
  // 상쇄해야 화면 가운데에 온다. 안 넘기면 패딩만큼 오른쪽으로 밀리고 끝이 잘린다
  // (cover 크롭일 땐 안 보였지만 프레임 contain+채움에선 좌우 띠 폭이 달라져 드러났다).
  bleed?: number;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  // 페이지 폭은 스크롤 오프셋 계산에 그대로 들어간다 — 박제하면 폴드 펼침 시
  // 페이저가 엉뚱한 사진을 가리킨다. 훅이므로 조기 return보다 위에 둔다.
  const SCREEN_W = useStageWidth();
  const PAGE_W = SCREEN_W; // Stage 폭 전체(최대한 크게)
  // 프레임 모드면 상세와 같은 높이(utils/photoFrame), 원본이면 기존 1.05:1 크롭 미리보기
  const PAGE_H = frameHeight(frame, PAGE_W) ?? Math.round(SCREEN_W * 1.05);
  const framed = isFramed(frame);
  const fillColor = framed ? frameFillColor(frame.fill) : undefined;
  const [activeIdx, setActiveIdx] = useState(0);
  const [frameOpen, setFrameOpen] = useState(false); // 프레임 칩 행 펼침
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
      <TouchableOpacity style={[st.empty, { borderColor: skinAccent.accentDeep }]} onPress={onAddPress} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={t('newRecord.photoEmpty')}>
        <Text style={[st.emptyPlus, { color: skinAccent.accent }]}>＋</Text>
        <Text style={st.emptyText}>{t('newRecord.photoEmpty')}</Text>
      </TouchableOpacity>
    );
  }

  const isRep = representativePhoto === medias[activeIdx];
  const hasPrivacy = privacyMarks?.[activeIdx] === true;

  return (
    <View>
      {/* 페이저 블록만 본문 패딩을 상쇄 — 액션 바·칩·글 입력은 본문 폭 안에 그대로 */}
      <View style={bleed ? { marginHorizontal: -bleed } : undefined}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / PAGE_W))}
          style={{ width: PAGE_W, height: PAGE_H }}
        >
          {medias.map((uri, i) => (
            <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: PAGE_W, height: PAGE_H, backgroundColor: fillColor }} resizeMode={framed ? 'contain' : 'cover'} />
          ))}
        </ScrollView>
        {/* n/N + 대표 배지 */}
        <View style={st.counter}><Text style={st.counterText}>{activeIdx + 1} / {medias.length}</Text></View>
        {isRep && (
          <View style={[st.repBadge, { backgroundColor: skinAccent.accent }]}>
            <Text style={st.repBadgeText}>{t('newRecord.repBadge')}</Text>
          </View>
        )}
        {/* 도트 인디케이터 */}
        <View style={st.dots}>
          {medias.map((_, i) => (
            <View key={i} style={[st.dot, i === activeIdx && [st.dotOn, { backgroundColor: skinAccent.accent }]]} />
          ))}
        </View>
      </View>

      {/* 액션 바: 대표·비공개·프레임·삭제 — 프레임만 게시물 단위, 나머지는 현재 사진 단위 */}
      <View style={st.actionBar}>
        {/* 대표 버튼 — 활성이면 채워진 배지 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, isRep && [st.actionBtnActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
          onPress={() => onSetRepresentative(activeIdx)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.repBadge')}
        >
          <Text style={[st.actionBtnIcon, isRep && { color: skinAccent.accent }]}>★</Text>
          <Text style={[st.actionBtnText, isRep && { color: skinAccent.accent }]} {...andFitText}>{t('newRecord.repBadge')}</Text>
        </TouchableOpacity>

        {/* 비공개 버튼 — 비공개 설정 존재 시 활성 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, hasPrivacy && [st.actionBtnPrivacyActive, { backgroundColor: skinAccent.tint(0.2), borderColor: skinAccent.accentDeep }]]}
          onPress={() => onPrivacyPress(activeIdx)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionPrivacy')}
        >
          <LockClosedIcon size={13} color={hasPrivacy ? skinAccent.accent : '#A1A1B0'} />
          <Text style={[st.actionBtnText, hasPrivacy && { color: skinAccent.accent }]} {...andFitText}>{t('newRecord.actionPrivacy')}</Text>
        </TouchableOpacity>

        {/* 프레임 버튼 — 비율·채움색 칩 행을 토글. 프레임이 적용돼 있으면 활성 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, (framed || frameOpen) && [st.actionBtnActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
          onPress={() => { select(); setFrameOpen((v) => !v); }}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionFrame')}
        >
          <Text style={[st.actionBtnIcon, (framed || frameOpen) && { color: skinAccent.accent }]}>▭</Text>
          <Text style={[st.actionBtnText, (framed || frameOpen) && { color: skinAccent.accent }]} {...andFitText}>{t('newRecord.actionFrame')}</Text>
        </TouchableOpacity>

        {/* 삭제 버튼 — 사진과 그 사진의 글이 함께 지워지므로 확인 후 삭제 */}
        <TouchableOpacity
          style={[st.actionBtn, st.actionBtnDelete]}
          onPress={() => {
            warn(); // 되돌릴 수 없는 동작을 묻는 중
            Alert.alert(
              t('newRecord.deletePhotoTitle'),
              t('newRecord.deletePhotoDesc'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('newRecord.actionDelete'), style: 'destructive', onPress: () => onRemove(activeIdx) },
              ],
            );
          }}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionDelete')}
        >
          <Text style={st.actionBtnDeleteIcon}>✕</Text>
          <Text style={st.actionBtnDeleteText}>{t('newRecord.actionDelete')}</Text>
        </TouchableOpacity>
      </View>

      {/* 프레임 칩 — 비율 한 줄 + 채움색 한 줄. 원본이면 색 칩은 흐리게·비활성(채움이 없으니 의미 없음) */}
      {frameOpen && (
        <View style={st.frameRows}>
          <View style={st.frameRow}>
            {PHOTO_FRAME_RATIOS.map((r: PhotoFrameRatio) => {
              const on = frame.ratio === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[st.chip, on && { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]}
                  onPress={() => { select(); onChangeFrame({ ...frame, ratio: r }); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipText, on && { color: skinAccent.accent }]} {...andFitText}>
                    {r === 'original' ? t('newRecord.frameRatioOriginal') : r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[st.frameRow, !framed && { opacity: 0.4 }]}>
            {PHOTO_FRAME_FILLS.map((f: PhotoFrameFill) => {
              const on = frame.fill === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[st.chip, on && { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]}
                  onPress={() => { select(); onChangeFrame({ ...frame, fill: f }); }}
                  disabled={!framed}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !framed }}
                >
                  <View style={[st.chipSwatch, { backgroundColor: frameFillColor(f) }]} />
                  <Text style={[st.chipText, on && { color: skinAccent.accent }]} {...andFitText}>
                    {f === 'black' ? t('newRecord.frameFillBlack') : t('newRecord.frameFillWhite')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* 현재 사진의 글 */}
      <View style={st.captionBox}>
        <Text style={[st.captionLabel, { color: skinAccent.accent }]}>
          {t('newRecord.photoTextLabel', { n: activeIdx + 1, total: medias.length })}
        </Text>
        <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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

// 보라 계열 값은 전부 지구본 스킨을 따라야 하므로 호출부에서 주입한다.
// 여기 남은 #BF85FC·#6B21A8은 스킨을 못 읽는 경우의 폴백이다.
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
  actionBtnText: { fontSize: 12, color: '#A1A1B0', fontWeight: '600' },
  actionBtnTextActive: { color: '#BF85FC' },
  actionBtnTextPrivacy: { color: '#BF85FC' },
  actionBtnDeleteIcon: { fontSize: 13, color: '#FF3B30' },
  actionBtnDeleteText: { fontSize: 12, color: '#FF3B30', fontWeight: '600' },

  // 프레임 칩 행 — 액션 바와 같은 좌우 여백, 버튼과 같은 어두운 바탕
  frameRows: { marginHorizontal: 16, marginTop: 8, gap: 6 },
  frameRow: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
  },
  chipText: { fontSize: 12, color: '#A1A1B0', fontWeight: '600' },
  chipSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: '#4A4A59' },

  captionBox: { marginHorizontal: 16, marginTop: 10 },
  captionLabel: { color: '#BF85FC', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  captionInput: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 72, textAlignVertical: 'top', fontSize: 14,
  },
});
