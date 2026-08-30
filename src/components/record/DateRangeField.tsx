import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from '../../ui/Text';
import { useSkinAccent } from '../../constants/skinTheme';
import { andFitText } from '../../utils/fitText';
import { CalendarIcon } from '../icons';

/**
 * 날짜 선택 트리거 — CalendarBottomSheet를 여는 버튼.
 *
 * 이전에는 화면마다(NewRecord / CutTravelInfo / BlogRecord / AlbumCreate) 같은 모양을
 * 각자 스타일시트로 4벌 들고 있었다. 시트는 공용인데 버튼만 제각각이라 사진첩 화면만
 * 라벨·아이콘이 없는 식으로 어긋났다. 여기로 합쳐서 한 곳만 고치면 전부 따라오게 한다.
 *
 * 값(startValue/endValue)은 **이미 포맷된 문자열**을 받는다 — 화면마다 표기 규칙
 * (2026.08.30 / 문자열 상태 그대로)이 달라, 포맷까지 여기서 강제하면 호출부가 깨진다.
 */
export function DateRangeField({
  startLabel,
  startValue,
  endLabel,
  endValue,
  onPress,
  style,
  disabled,
}: {
  startLabel: string;
  startValue: string;
  /** endLabel·endValue를 함께 주면 기간(시작 → 종료), 없으면 단일 날짜로 렌더한다 */
  endLabel?: string;
  endValue?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const isRange = endLabel !== undefined && endValue !== undefined;

  return (
    <TouchableOpacity
      style={[df.field, { borderColor: skinAccent.tint(0.28) }, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('calendar.a11yDateField')}
      accessibilityValue={{ text: isRange ? `${startValue} → ${endValue}` : startValue }}
    >
      <View style={df.col}>
        <Text style={df.label} {...andFitText}>{startLabel}</Text>
        <Text style={df.value} numberOfLines={1}>{startValue}</Text>
      </View>
      {isRange && (
        <>
          <Text style={df.arrow}>→</Text>
          <View style={df.col}>
            <Text style={df.label} {...andFitText}>{endLabel}</Text>
            <Text style={df.value} numberOfLines={1}>{endValue}</Text>
          </View>
        </>
      )}
      {/* 아이콘은 장식 — 스크린리더가 버튼 라벨을 두 번 읽지 않도록 트리에서 뺀다.
          pointerEvents='none'는 필수: 새 아키텍처에서 RNSVG가 터치를 삼켜(자체 pointerEvents 무시)
          아이콘 위를 탭하면 버튼이 안 눌리는 사고가 이 저장소에서 반복됐다. 감싼 View로 막는다. */}
      <View
        style={df.icon}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <CalendarIcon size={18} color={skinAccent.accent} />
      </View>
    </TouchableOpacity>
  );
}

const df = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E2E3B',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  col: { flex: 1 },
  label: { fontSize: 11, color: '#A1A1B0', marginBottom: 4 },
  value: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  arrow: { fontSize: 18, color: '#A1A1B0', marginHorizontal: 12 },
  icon: { marginLeft: 10 },
});
