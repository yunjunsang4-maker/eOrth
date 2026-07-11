/**
 * PhotoViewerModal — 전체화면 사진 뷰어 (스와이프 페이징 + 핀치 줌 + n/m 표시)
 *
 * 줌은 페이지별 내부 ScrollView(maximumZoomScale)로 구현 — iOS 네이티브 핀치 줌.
 * (Android는 ScrollView 줌 미지원이라 페이징·카운터만 동작하는 안전한 폴백)
 */
import React, { useRef, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export default function PhotoViewerModal({
  visible,
  uris,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  if (!visible) return null;
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
      </View>
    </Modal>
  );
}
