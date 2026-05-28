import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import {
  stickers,
  stickerCategories,
  getStickersByCategory,
  StickerCategory,
  Sticker,
} from './stickers';

const { width: SCREEN_W } = Dimensions.get('window');
const ITEM_SIZE = Math.floor((SCREEN_W - 64) / 4);

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect }) => {
  const [activeCategory, setActiveCategory] = useState<StickerCategory>('travel');
  const categoryStickers = getStickersByCategory(activeCategory);

  return (
    <View style={styles.container}>
      {/* 카테고리 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabRow}>
          {stickerCategories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(cat.id)}
              style={[styles.tab, activeCategory === cat.id && styles.tabActive]}
            >
              <Text style={styles.tabEmoji}>{cat.emoji}</Text>
              <Text style={[styles.tabLabel, activeCategory === cat.id && styles.tabLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 스티커 그리드 */}
      <View style={styles.grid}>
        {categoryStickers.map((sticker) => {
          const StickerComp = sticker.component;
          return (
            <TouchableOpacity
              key={sticker.id}
              style={styles.item}
              onPress={() => onSelect(sticker)}
              activeOpacity={0.7}
            >
              <StickerComp size={40} />
              <Text style={styles.itemLabel}>{sticker.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing[4],
  },
  tabScroll: {
    marginBottom: Spacing[4],
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    gap: 4,
  },
  tabActive: {
    backgroundColor: Colors.primaryDark,
  },
  tabEmoji: {
    fontSize: 14,
  },
  tabLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
  },
  tabLabelActive: {
    color: Colors.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  itemLabel: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
});
