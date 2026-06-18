import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastProps {
  visible: boolean;
  message: string;
  position?: 'top' | 'bottom'; // 기본 하단. 'top'이면 상단(상태바 아래)에 표시
  onPress?: () => void;        // 지정 시 토스트를 누를 수 있게 됨(예: 배지 리스트로 이동)
}

export default function Toast({ visible, message, position = 'bottom', onPress }: ToastProps) {
  const insets = useSafeAreaInsets();
  const isTop = position === 'top';
  const hiddenOffset = isTop ? -16 : 16; // 상단이면 위에서, 하단이면 아래에서 슬라이드
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(hiddenOffset)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: hiddenOffset, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View
      style={[
        s.toast,
        isTop ? { top: insets.top + 12 } : { bottom: 48 },
        { opacity, transform: [{ translateY }] },
      ]}
      pointerEvents={onPress ? 'box-none' : 'none'}
    >
      {onPress ? (
        <Pressable onPress={onPress} style={s.pressable}>
          <Text style={s.text}>{message}</Text>
        </Pressable>
      ) : (
        <Text style={s.text}>{message}</Text>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#2E2E3B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  pressable: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: -20, // toast 패딩을 Pressable이 흡수해 터치 영역 확보
    marginVertical: -12,
  },
  text: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
