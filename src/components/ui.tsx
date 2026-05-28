import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Typography, Spacing } from '../constants';

// ─── Primary Button ────────────────────────────────────────────────────────────
interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.8}
    style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled, style]}
  >
    <LinearGradient
      colors={disabled ? ['#3D3D55', '#2D2D45'] : ['#7B61FF', '#5A42DD']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.primaryBtnGradient}
    >
      {loading ? (
        <ActivityIndicator color={Colors.white} size="small" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </LinearGradient>
  </TouchableOpacity>
);

// ─── Social Login Button ────────────────────────────────────────────────────────
interface SocialButtonProps {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  variant: 'kakao' | 'google' | 'apple';
}

export const SocialButton: React.FC<SocialButtonProps> = ({
  label,
  icon,
  onPress,
  variant,
}) => {
  const bgColor =
    variant === 'kakao' ? Colors.kakaoYellow :
    variant === 'google' ? Colors.googleWhite : Colors.appleBlack;
  const textColor =
    variant === 'kakao' ? '#3A1D1D' :
    variant === 'google' ? '#333333' : Colors.white;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.socialBtn, { backgroundColor: bgColor }]}
    >
      {icon && <View style={styles.socialBtnIcon}>{icon}</View>}
      <Text style={[styles.socialBtnText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
};

// ─── Pill Tag ──────────────────────────────────────────────────────────────────
interface PillTagProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export const PillTag: React.FC<PillTagProps> = ({ label, active = false, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[styles.pill, active && styles.pillActive]}
  >
    <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
  </TouchableOpacity>
);

// ─── Section Title ─────────────────────────────────────────────────────────────
interface SectionTitleProps {
  title: string;
  subtitle?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ title, subtitle }) => (
  <View style={styles.sectionTitle}>
    <Text style={styles.sectionTitleText}>{title}</Text>
    {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
  </View>
);

// ─── Pagination Dots ───────────────────────────────────────────────────────────
interface PaginationDotsProps {
  count: number;
  activeIndex: number;
}

export const PaginationDots: React.FC<PaginationDotsProps> = ({ count, activeIndex }) => (
  <View style={styles.dotsContainer}>
    {Array.from({ length: count }).map((_, i) => (
      <View
        key={i}
        style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
      />
    ))}
  </View>
);

// ─── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  value: string;
  label: string;
  icon?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ value, label, icon }) => (
  <View style={styles.statCard}>
    {icon && <Text style={styles.statIcon}>{icon}</Text>}
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Primary Button
  primaryBtn: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderRadius: BorderRadius.full,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 0.3,
  },

  // Social Button
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing[3],
    minHeight: 52,
  },
  socialBtnIcon: {
    marginRight: Spacing[2],
    width: 22,
    alignItems: 'center',
  },
  socialBtnText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
  },

  // Pill Tag
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing[2],
    marginBottom: Spacing[2],
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  pillTextActive: {
    color: Colors.white,
  },

  // Section Title
  sectionTitle: {
    marginBottom: Spacing[4],
  },
  sectionTitleText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing[1],
    lineHeight: 22,
  },

  // Pagination Dots
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  dotInactive: {
    backgroundColor: Colors.dotInactive,
  },

  // Stat Card
  statCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: Spacing[1],
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 2,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
  },
});

export default {
  PrimaryButton,
  SocialButton,
  PillTag,
  SectionTitle,
  PaginationDots,
  StatCard,
};
