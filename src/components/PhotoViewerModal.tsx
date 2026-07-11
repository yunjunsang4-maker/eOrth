/**
 * PhotoViewerModal — 전체화면 사진 뷰어 (스와이프 페이징 + 핀치 줌 + n/m 표시)
 *
 * 줌은 페이지별 내부 ScrollView(maximumZoomScale)로 구현 — iOS 네이티브 핀치 줌.
 * (Android는 ScrollView 줌 미지원이라 페이징·카운터만 동작하는 안전한 폴백)
 *
 * 액션 바(선택) — showActions일 때 하단에 공유·기기 저장, 호출부가 넘기면 커버 지정·삭제.
 * 공유는 RN 내장 Share가 iOS에서만 파일 URL을 지원해 iOS 전용으로 표시한다.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Image, Dimensions, Platform, Share, Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';

const { width: W, height: H } = Dimensions.get('window');

export default function PhotoViewerModal({
  visible,
  uris,
  initialIndex = 0,
  onClose,
  showActions,
  onSetCover,
  onDelete,
}: {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  onClose: () => void;
  /** 하단 액션 바(공유·기기 저장) 표시 여부 */
  showActions?: boolean;
  /** 현재 사진을 커버(여행카드 썸네일)로 지정 — 넘기면 버튼 표시 */
  onSetCover?: (index: number) => void;
  /** 현재 사진 삭제 — 넘기면 버튼 표시. 확인/삭제 처리는 호출부 책임 (뷰어는 닫힌 뒤 호출) */
  onDelete?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const handleShare = async () => {
    try {
      await Share.share({ url: uris[index] });
    } catch {}
  };

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
  const hasActionBar = showActions || !!onSetCover || !!onDelete;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }} accessibilityViewIsModal>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * W, y: 0 }}
          // Android는 contentOffset 초기 적용이 무시될 수 있어 onLayout 폴백 스크롤
          onLayout={() => scrollRef.current?.scrollTo({ x: initialIndex * W, animated: false })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
        >
          {uris.map((uri, i) => (
            <ScrollView
              key={`${uri}-${i}`}
              style={{ width: W, height: H }}
              contentContainerStyle={{ width: W, height: H, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Image source={{ uri }} style={{ width: W, height: H * 0.8 }} resizeMode="contain" />
            </ScrollView>
          ))}
        </ScrollView>
        {uris.length > 1 && (
          <View style={{ position: 'absolute', top: 56, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{index + 1} / {uris.length}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: 50, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>✕</Text>
        </TouchableOpacity>

        {/* 하단 액션 바 — 보면서 바로 공유/저장/커버/삭제 */}
        {hasActionBar && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingTop: 14, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            {showActions && Platform.OS === 'ios' && (
              <TouchableOpacity onPress={handleShare} style={{ alignItems: 'center', minWidth: 64 }} accessibilityRole="button">
                <Text style={{ fontSize: 20 }}>↗️</Text>
                <Text style={{ color: '#fff', fontSize: 11, marginTop: 3 }}>{t('comp.viewerShare')}</Text>
              </TouchableOpacity>
            )}
            {showActions && (
              <TouchableOpacity onPress={handleSaveToDevice} style={{ alignItems: 'center', minWidth: 64 }} accessibilityRole="button">
                <Text style={{ fontSize: 20 }}>⬇️</Text>
                <Text style={{ color: '#fff', fontSize: 11, marginTop: 3 }}>{t('comp.viewerSave')}</Text>
              </TouchableOpacity>
            )}
            {onSetCover && (
              <TouchableOpacity onPress={() => onSetCover(index)} style={{ alignItems: 'center', minWidth: 64 }} accessibilityRole="button">
                <Text style={{ fontSize: 20 }}>🖼️</Text>
                <Text style={{ color: '#fff', fontSize: 11, marginTop: 3 }}>{t('comp.viewerSetCover')}</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => { const i = index; onClose(); onDelete(i); }} style={{ alignItems: 'center', minWidth: 64 }} accessibilityRole="button">
                <Text style={{ fontSize: 20 }}>🗑️</Text>
                <Text style={{ color: '#FF6B6B', fontSize: 11, marginTop: 3 }}>{t('comp.viewerDelete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
