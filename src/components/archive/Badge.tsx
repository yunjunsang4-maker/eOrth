import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../constants';

interface BadgeProps {
  count?: number;
  visible?: boolean;
  variant?: 'primary' | 'danger' | 'gold';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  count,
  visible = true,
  variant = 'primary',
  size = 'sm',
}) => {
  if (!visible) return null;

  const bgColor =
    variant === 'danger' ? '#FF3B30' :
    variant === 'gold' ? Colors.gold : Colors.primary;

  const dimension = size === 'sm' ? 18 : 24;
  const fontSize = size === 'sm' ? 10 : 13;

  if (count === undefined) {
    return (
      <View
        style={[
          styles.dot,
          { backgroundColor: bgColor, width: 10, height: 10, borderRadius: 5 },
        ]}
      />
    );
  }

  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColor,
          minWidth: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize }]}>{displayCount}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.bold,
    textAlign: 'center',
  },
});
