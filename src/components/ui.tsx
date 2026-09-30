import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Typography, Spacing } from '../constants';
import { useSkinAccent } from '../constants/skinTheme';
import { andFitText } from '../utils/fitText';
// 앱 공용 대각 흰색 링. CalendarBottomSheet는 ui.tsx를 (전이적으로도) import하지 않아 순환이 없다(2026-09-30 확인).
import { PillRing } from './record/CalendarBottomSheet';

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
}) => {
  const skinAccent = useSkinAccent(); // 기본 버튼 그라데이션을 스킨 강조색으로 (aurora=기존값)
  return (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.8}
    style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled, style]}
    accessibilityRole="button"
    accessibilityLabel={label}
    // 로딩 중에는 라벨이 스피너로 바뀌어 화면에서 사라진다 — 상태로 알린다
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
  >
    <LinearGradient
      colors={disabled ? ['#3D3D55', '#2D2D45'] : skinAccent.btnGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.primaryBtnGradient}
    >
      {loading ? (
        <ActivityIndicator color={Colors.white} size="small" />
      ) : (
        <Text style={styles.primaryBtnText} {...andFitText}>{label}</Text>
      )}
    </LinearGradient>
  </TouchableOpacity>
  );
};

// ─── Glass Button (앱 기본 버튼) ───────────────────────────────────────────────
// 온보딩 '다음' 버튼 디자인(AppIntro/Login) — 흰색 10% 유리 채움 + 앱 공용 대각 흰색 링(PillRing).
// 진행/다음 계열 기본 버튼으로 쓴다. 옛 #CECFCD 위→아래 링과 `ring="diagonal"` 분기는 2026-09-30 통일로 삭제.
interface GlassButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      style={[styles.glassBtn, disabled && styles.glassBtnDisabled, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {/* 비활성은 옛 링과 같게 링만 0.3 (버튼 전체 0.5와 곱해진다). PillRing이 스스로 Svg를 pointerEvents none View로 감싸고,
          흰색 거리는 기본값(반지름×4/3)이라 큰 알약에서도 곡선에 묻히지 않는다 */}
      <PillRing width={size.w} height={size.h} radius={size.h / 2} opacity={disabled ? 0.3 : 1} />
      {loading ? (
        <ActivityIndicator color={Colors.white} size="small" />
      ) : (
        <Text style={styles.glassBtnText} {...andFitText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

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
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon && <View style={styles.socialBtnIcon}>{icon}</View>}
      {/* 아이콘과 가로 배치라 flexShrink가 있어야 안드로이드에서 자동 축소의 폭 기준이 생긴다 */}
      <Text style={[styles.socialBtnText, { color: textColor, flexShrink: 1 }]} {...andFitText}>{label}</Text>
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
    // 선택 토글이라 role은 button이 아니라 선택 상태를 알리는 편이 맞다
    accessibilityRole={onPress ? 'button' : 'text'}
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
  >
    <Text style={[styles.pillText, active && styles.pillTextActive]} {...andFitText}>{label}</Text>
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
    {/* 안드로이드 한글 폭이 넓어 고정폭 3열에서 줄바꿈됨 — 한 줄 고정+자동 축소 */}
    <Text style={styles.statLabel} {...andFitText}>{label}</Text>
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

  // Glass Button (앱 기본 버튼 — 온보딩 '다음' 디자인)
  glassBtn: {
    borderRadius: BorderRadius.full,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    // overflow:'hidden' 금지 — PillRing 규칙(부모가 자르면 링 가장자리가 잘린다). 자식은 글자·스피너뿐이라 클립이 필요 없다
  },
  glassBtnDisabled: {
    opacity: 0.5,
  },
  glassBtnText: {
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
  GlassButton,
  SocialButton,
  PillTag,
  SectionTitle,
  PaginationDots,
  StatCard,
};
