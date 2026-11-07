/**
 * PhotoViewerModal — 전체화면 사진 뷰어 (스와이프 페이징 + 핀치 줌 + n/m 표시)
 *
 * 줌은 페이지별 내부 ScrollView(maximumZoomScale)로 구현 — iOS 네이티브 핀치 줌.
 * (Android는 ScrollView 줌 미지원이라 페이징·카운터만 동작하는 안전한 폴백)
 *
 * 액션 바(선택) — showActions일 때 하단에 기기 저장, 호출부가 넘기면 지구본 사진 지정·커버 지정·삭제.
 *
 * 내 앨범 크롬(선택, albumTitleAt) — 내 사진첩·하루 보기에서만 넘긴다(2026-11-07 시안, 남의 사진첩·게시물은 예전 화면).
 * 헤더(장식 없는 꺾쇠 = 닫기 + 가운데 '국기 N일차') / 구분선 / 'n/m장' 알약 / 폭 맞춤 사진 / 떠 있는 유리 알약 액션 바.
 * 이 모드에선 ✕·검은 n/m 알약·전폭 검은 바를 그리지 않는다. 안 넘기면 예전과 완전히 같은 화면.
 */
import React, { useState, useEffect } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, FlatList, useWindowDimensions, Alert, Platform, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { BackChevronIcon, GlobeIcon, DownloadIcon, GalleryIcon, TrashIcon } from './icons';
import { AutoPillRing } from './record/CalendarBottomSheet';
import { andFitText } from '../utils/fitText';

// 액션 바 아이콘은 라벨과 같은 색을 명시한다.
// (색을 넘기지 않으면 아이콘들이 같은 그라데이션 id를 공유해 한 화면에 여러 개가 뜰 때 서로 간섭한다)
const ACTION_ICON = 22;
const ACTION_TINT = '#FFFFFF';
const ACTION_DANGER = '#FF6B6B';
// 내 앨범 크롬 삭제색 — 시안 값 그대로(앱 토큰 빨강 #FF3B30과 다르다)
const CHROME_DANGER = '#FF0138';

export default function PhotoViewerModal({
  visible,
  uris,
  initialIndex = 0,
  onClose,
  showActions,
  onSetGlobeCover,
  onSetCover,
  onDelete,
  albumTitleAt,
}: {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  onClose: () => void;
  /** 하단 액션 바(기기 저장) 표시 여부 */
  showActions?: boolean;
  /** 현재 사진을 유리 지구본 활성화 사진(국가 대표사진)으로 지정 — 넘기면 버튼 표시 */
  onSetGlobeCover?: (index: number) => void;
  /** 현재 사진을 커버(여행카드 썸네일)로 지정 — 넘기면 버튼 표시 */
  onSetCover?: (index: number) => void;
  /** 현재 사진 삭제 — 넘기면 버튼 표시. 확인/삭제 처리는 호출부 책임 (뷰어는 닫힌 뒤 호출) */
  onDelete?: (index: number) => void;
  /** 넘기면 내 앨범 크롬 — 현재 위치(uris 인덱스)의 헤더 제목('🇯🇵 2일차'). 내 사진첩·하루 보기만 넘긴다 */
  albumTitleAt?: (index: number) => string;
}) {
  const { t } = useTranslation();
  // 폭·높이는 창에서 실시간으로 받는다 — 박제하면 폴드 펼침 시 페이지 오프셋이 어긋난다.
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const [index, setIndex] = useState(initialIndex);
  // 크롬 모드 사진 칸 높이 — 헤더·알약·바 사이 남는 높이를 실측한다(창 높이 H로 빼서 구하면 안드로이드 내비바·글꼴 배율에 따라 어긋난다)
  const [areaH, setAreaH] = useState(0);
  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const handleSaveToDevice = async () => {
    try {
      // writeOnly 권한 — iOS는 '추가 전용' 팝업이라 부담이 적다
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert(t('comp.viewerSaveFail')); return; }
      await MediaLibrary.saveToLibraryAsync(uris[index]);
      Alert.alert(t('comp.viewerSaved'));
    } catch {
      Alert.alert(t('comp.viewerSaveFail'));
    }
  };

  if (!visible) return null;
  const hasActionBar = showActions || !!onSetGlobeCover || !!onSetCover || !!onDelete;
  const chrome = !!albumTitleAt;
  // 페이지 높이 — 크롬은 실측한 사진 칸, 아니면 화면 전체(예전 그대로). 크롬 사진은 칸 전체에 폭 맞춤(contain), 예전은 높이 80%
  const pageH = chrome ? areaH : H;
  const imgH = chrome ? areaH : H * 0.8;
  // 페이지 목록은 FlatList(가상화) — 기간 격자에서 수천 장을 넘겨 열면 ScrollView는 페이지(줌 ScrollView)를 전부 만들어
  // 여는 순간이 무거웠다. getItemLayout + initialScrollIndex로 처음부터 그 장에서 열린다(안드로이드 contentOffset 무시 문제도 없음)
  const pager = (
    <FlatList
      data={uris}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(uri, i) => `${uri}-${i}`}
      getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
      initialScrollIndex={Math.min(Math.max(0, initialIndex), Math.max(0, uris.length - 1))}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      extraData={index}
      onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
      renderItem={({ item: uri, index: i }) => (
        <ScrollView
          style={{ width: W, height: pageH }}
          contentContainerStyle={{ width: W, height: pageH, justifyContent: 'center', alignItems: 'center' }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {/* expo-image — RN Image는 iOS ph://(갤러리 원본 참조)를 못 그려(camera-roll 로더 없음) 기간 사진 격자·사진첩 만들기에서
              넘겨 본 사진이 검게 떴다. expo-image는 ph://·file://·http(s)를 모두 그린다.
              ⚠️ 지금 보는 사진 ±1장만 그린다 — 기간 격자는 수백~수천 장을 넘기는데, 전부 마운트하면 여는 순간 그만큼 디코드해
              열림이 몇 초씩 늦고 메모리가 터져 앱이 꺼졌다(2026-11-05 실기기). 나머지 페이지는 같은 크기 빈 칸(페이징 오프셋 유지).
              ⚠️ allowDownscaling 기본값(화면 크기로 줄여 디코드) — 원본 해상도(false)는 48MP 한 장에 ~190MB라 빠른 표시가 우선(사용자 결정:
              원본 아니어도 됨). 대가로 핀치 4배 확대 시 다소 흐리다. */}
          {Math.abs(i - index) <= 1 ? (
            <Image source={{ uri }} style={{ width: W, height: imgH }} contentFit="contain" transition={0} priority={i === index ? 'high' : 'normal'} />
          ) : null}
        </ScrollView>
      )}
    />
  );

  // 액션 버튼 4개 — 두 모양이 같이 쓴다. 크롬은 시안 치수(칸 균등·라벨 10 굵게·삭제 #FF0138), 아니면 예전 값 그대로
  const btnStyle = chrome ? S.chromeBtn : S.btn;
  const labelStyle = chrome ? S.chromeLabel : S.label;
  const danger = chrome ? CHROME_DANGER : ACTION_DANGER;
  const actions = (
    <>
      {onSetGlobeCover && (
        <TouchableOpacity onPress={() => onSetGlobeCover(index)} style={btnStyle} accessibilityRole="button">
          <GlobeIcon size={ACTION_ICON} color={ACTION_TINT} />
          <Text style={labelStyle} {...andFitText}>{t('comp.viewerSetGlobeCover')}</Text>
        </TouchableOpacity>
      )}
      {showActions && (
        <TouchableOpacity onPress={handleSaveToDevice} style={btnStyle} accessibilityRole="button">
          <DownloadIcon size={ACTION_ICON} color={ACTION_TINT} />
          <Text style={labelStyle} {...andFitText}>{t('comp.viewerSave')}</Text>
        </TouchableOpacity>
      )}
      {onSetCover && (
        <TouchableOpacity onPress={() => onSetCover(index)} style={btnStyle} accessibilityRole="button">
          <GalleryIcon size={ACTION_ICON} color={ACTION_TINT} />
          <Text style={labelStyle} {...andFitText}>{t('comp.viewerSetCover')}</Text>
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={() => { const i = index; onClose(); onDelete(i); }} style={btnStyle} accessibilityRole="button">
          <TrashIcon size={ACTION_ICON} color={danger} />
          <Text style={[labelStyle, { color: danger }]} {...andFitText}>{t('comp.viewerDelete')}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  if (albumTitleAt) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
        <View style={S.chromeRoot} accessibilityViewIsModal>
          {/* 헤더 — AlbumDayScreen 헤더와 같은 치수(위 insets.top+10 · 36 줄 · 아래 12 · 0.8 구분선)라 하루 보기 위에 열려도 제목 줄이 그대로다.
              모달은 statusBarTranslucent라 상태바 밑까지 그려지므로 두 플랫폼 모두 insets.top으로 내린다(인셋은 루트 SafeAreaProvider 컨텍스트 값).
              뒤로는 시안대로 장식(유리 원) 없는 꺾쇠 — 누르면 뷰어를 닫는다. 꺾쇠는 왼쪽 16에 붙인다(시안 x 15) */}
          <View style={[S.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              onPress={onClose}
              style={S.headerSide}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('trip.back')}
            >
              <BackChevronIcon opacity={1} />
            </TouchableOpacity>
            <Text style={S.title} numberOfLines={1}>{albumTitleAt(index)}</Text>
            <View style={S.headerSide} />
          </View>
          <View style={S.counter}>
            <Text style={S.counterText} numberOfLines={1}>{t('comp.viewerCountOf', { n: index + 1, total: uris.length })}</Text>
          </View>
          {/* 사진 칸 — 남는 높이를 실측해 페이지 높이로 쓴다. 실측 전(첫 프레임)엔 비워 둔다(페이드 인 중이라 안 보인다) */}
          <View
            style={S.area}
            onLayout={(e) => {
              // floor — round면 iOS에서 칸보다 0.5pt 큰 페이지가 되어 세로로 미세하게 흔들린다(QA L3)
              const h = Math.floor(e.nativeEvent.layout.height);
              setAreaH((p) => (p === h ? p : h)); // 같은 값 setState 루프 방지
            }}
          >
            {areaH > 0 && pager}
          </View>
          {hasActionBar && (
            // 떠 있는 유리 알약 바 — 화면 아래 34(시안, iPhone 홈 인디케이터 인셋과 같다). 안드로이드는 내비바 인셋 + 16(예전 바와 같은 보정).
            // 테두리는 앱 공용 대각 링(AutoPillRing) — 시안의 #CECFCD 위→아래 링은 2026-09-30 폐지된 옛 내보내기다. 블러 없이 흰 10% 바탕만.
            <View style={[S.barWrap, { marginBottom: Platform.OS === 'ios' ? 34 : insets.bottom + 16 }]}>
              <View style={S.bar}>
                <AutoPillRing />
                {actions}
              </View>
            </View>
          )}
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }} accessibilityViewIsModal>
        {pager}

        {/* 상단 좌표 — 안드로이드는 상태바 높이가 기기별로 달라 인셋 기반으로 보정 */}
        {uris.length > 1 && (
          <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 56 : insets.top + 12, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{index + 1} / {uris.length}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : insets.top + 6, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>✕</Text>
        </TouchableOpacity>

        {/* 하단 액션 바 — 보면서 바로 공유/저장/커버/삭제 */}
        {hasActionBar && (
          // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 40 : insets.bottom + 16, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            {actions}
          </View>
        )}
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  // 예전 액션 바 버튼(인라인 값 그대로 옮김 — 크롬 아닌 화면은 바뀌지 않는다)
  btn: { alignItems: 'center', minWidth: 64 },
  label: { color: '#fff', fontSize: 11, marginTop: 3 },
  // ── 내 앨범 크롬(2026-11-07 시안, 기준 폭 402) ──
  chromeRoot: { flex: 1, backgroundColor: '#0A0A0F' }, // 시안 #0A0B0F → 앱 배경 토큰(하루 보기·사진첩 화면과 같은 값)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  headerSide: { width: 36, height: 36, justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  // 구분선 아래 21 → 61×26·r13 알약(흰 3%) → 21 → 사진(시안 y 112.6 → 134 → 160 → 181)
  counter: {
    alignSelf: 'center',
    marginTop: 21,
    minHeight: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
  },
  counterText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  // 사진 칸 아래 34 → 바(시안 사진 끝 743 → 바 777)
  area: { flex: 1, marginTop: 21, marginBottom: 34 },
  // 바 323×63·r31.5 — 좌우 39(시안 x 39). 넓은 창(태블릿)에서도 323을 넘지 않게 maxWidth로 캡
  barWrap: { alignItems: 'center', paddingHorizontal: 39 },
  bar: {
    width: '100%',
    maxWidth: 323,
    minHeight: 63,
    borderRadius: 31.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 21.5, // 버튼 칸 70 × 4 = 280 → (323 − 280) / 2 (시안 아이콘 중심 간격 70)
  },
  chromeBtn: { flex: 1, alignItems: 'center' },
  chromeLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginTop: 4 },
});
