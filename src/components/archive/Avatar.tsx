import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Typography } from '../../constants';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBorder?: boolean;
}

const sizeMap = { sm: 32, md: 44, lg: 64, xl: 96 };
const fontSizeMap = { sm: 12, md: 16, lg: 24, xl: 36 };

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  name,
  size = 'md',
  showBorder = false,
}) => {
  const dimension = sizeMap[size];
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        },
        showBorder && styles.border,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
          }}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: fontSizeMap[size] }]}>
          {initial}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  border: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  initial: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
});
