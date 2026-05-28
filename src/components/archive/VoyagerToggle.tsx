// 추후 업데이트 예정 - 보이저 공개 기능
// NewRecordScreen에서 제거됨. 보이저 공개 저장 기능이 준비되면 다시 연결할 것.
// 사용법: <VoyagerToggle value={isVoyager} onValueChange={setIsVoyager} />
// 저장 시 visibility: isVoyager ? 'public' : 'friends' 로 분기 처리 예정.

import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';

const COLORS = {
  card:       '#2E2E3B',
  purpleNeon: '#BF85FC',
  white:      '#FFFFFF',
  textMuted:  '#4A4A59',
  textDim:    '#A1A1B0',
  divider:    '#1A1A26',
};

interface VoyagerToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export default function VoyagerToggle({ value, onValueChange }: VoyagerToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.label}>보이저로 공개 저장</Text>
        <Text style={styles.desc}>
          {value
            ? '친구 탭과 탐색 탭에 공개됩니다 🌍'
            : '친구 탭에만 공개됩니다'}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.textMuted, true: COLORS.purpleNeon }}
        thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  textWrap: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  desc: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 3,
  },
});
