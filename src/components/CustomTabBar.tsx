import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { GlobeIcon as SvgGlobeIcon } from './icons';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const TAB_LABELS: Record<string, string> = {
  MainTab: 'Globe',
  StatsTab: '통계',
  SocialTab: '소셜',
  ProfileTab: '프로필',
};

const GlobeIcon = ({ active }: { active: boolean }) => (
  <View style={[styles.iconWrapper, active && styles.activeIconWrap]}>
    <SvgGlobeIcon size={22} color={active ? Colors.primary : Colors.tabInactive} />
  </View>
);

const StatsIcon = ({ active }: { active: boolean }) => (
  <View style={styles.iconWrapper}>
    {/* Bar chart SVG-like rendering */}
    <View style={styles.chartIcon}>
      {[6, 10, 8, 14, 10].map((h, i) => (
        <View
          key={i}
          style={[
            styles.chartBar,
            { height: h, backgroundColor: active ? Colors.primary : Colors.tabInactive },
          ]}
        />
      ))}
    </View>
  </View>
);

// 두 사람이 나란히 있는 소셜 아이콘
// 뒤쪽 인물은 opacity 0.45로 겹쳐서 깊이감 표현
const SocialIcon = ({ active }: { active: boolean }) => {
  const color = active ? Colors.primary : Colors.tabInactive;
  return (
    <View style={styles.iconWrapper}>
      <View style={styles.socialWrap}>
        {/* 뒤 인물 */}
        <View style={[styles.person, { opacity: 0.45 }]}>
          <View style={[styles.personHead, { backgroundColor: color }]} />
          <View style={[styles.personBody, { backgroundColor: color }]} />
        </View>
        {/* 앞 인물 (살짝 왼쪽으로 당겨 겹침) */}
        <View style={[styles.person, { marginLeft: -5 }]}>
          <View style={[styles.personHead, { backgroundColor: color }]} />
          <View style={[styles.personBody, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
};

// 원 + 어깨 호 형태의 프로필 아이콘
const ProfileIcon = ({ active }: { active: boolean }) => {
  const color = active ? Colors.primary : Colors.tabInactive;
  return (
    <View style={styles.iconWrapper}>
      <View style={styles.profileWrap}>
        {/* 머리 */}
        <View style={[styles.profileHead, { backgroundColor: color }]} />
        {/* 어깨 (위쪽만 둥글게) */}
        <View style={[styles.profileBody, { backgroundColor: color }]} />
      </View>
    </View>
  );
};

const TAB_ICON_COMPONENTS: Record<string, React.FC<{ active: boolean }>> = {
  MainTab: GlobeIcon,
  StatsTab: StatsIcon,
  SocialTab: SocialIcon,
  ProfileTab: ProfileIcon,
};

// ─── 개별 탭 아이템 (자체 애니메이션 관리) ───
interface TabItemProps {
  route: any;
  isFocused: boolean;
  label: string;
  IconComponent: React.FC<{ active: boolean }>;
  onPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({ route, isFocused, label, IconComponent, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  // 탭이 활성화될 때 팝 바운스
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isFocused) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.28,
          useNativeDriver: true,
          tension: 380,
          friction: 7,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 220,
          friction: 8,
        }),
      ]).start();
    }
  }, [isFocused]);

  // 누를 때 찌그러짐
  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.78,
      useNativeDriver: true,
      tension: 500,
      friction: 10,
    }).start();
  };

  // 뗄 때 스프링 복귀
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 260,
      friction: 7,
    }).start();
  };

  return (
    <TouchableOpacity
      key={route.key}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={styles.tab}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <IconComponent active={isFocused} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color: isFocused ? Colors.primary : Colors.tabInactive }]}>
        {label}
      </Text>
      {isFocused && <View style={styles.activeIndicator} />}
    </TouchableOpacity>
  );
};

export const CustomTabBar: React.FC<TabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <BlurView intensity={60} tint="dark" style={styles.container}>
      <View style={styles.tabBar}>
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const label = TAB_LABELS[route.name] ?? route.name;
          const IconComponent = TAB_ICON_COMPONENTS[route.name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              route={route}
              isFocused={isFocused}
              label={label}
              IconComponent={IconComponent ?? GlobeIcon}
              onPress={onPress}
            />
          );
        })}
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,10,15,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 20, // iOS home indicator area
    paddingTop: 2,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[2],
    position: 'relative',
  },
  iconWrapper: {
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  activeIconWrap: {},
  chartIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  chartBar: {
    width: 3,
    borderRadius: 2,
  },
  // 소셜 아이콘
  socialWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  person: {
    alignItems: 'center',
    gap: 2,
  },
  personHead: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  personBody: {
    width: 11,
    height: 6,
    borderTopLeftRadius: 5.5,
    borderTopRightRadius: 5.5,
  },
  // 프로필 아이콘
  profileWrap: {
    alignItems: 'center',
    gap: 2,
  },
  profileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  profileBody: {
    width: 14,
    height: 6,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  tabLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    marginTop: 2,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
});
