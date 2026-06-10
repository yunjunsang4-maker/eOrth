import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  SafeAreaView,
  Linking,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { MapIcon, HeartIcon, PersonIcon, PlaneIcon, HomeIcon, CalendarIcon, MegaphoneIcon, BellIcon } from '../components/icons';
import { useSettings } from '../store/settingsStore';

const COLORS = {
  bg:          '#0A0A0F',
  card:        '#2E2E3B',
  divider:     '#1A1A26',
  purpleNeon:  '#BF85FC',
  purpleDeep:  '#6B21A8',
  white:       '#FFFFFF',
  textDim:     '#A1A1B0',
  textMuted:   '#4A4A59',
};

interface Props {
  navigation: any;
}

// ─── 섹션 타이틀 ───
const SectionLabel = ({ label }: { label: string }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

// ─── 토글 행 ───
const ToggleRow = ({
  icon,
  label,
  description,
  value,
  onValueChange,
  isLast,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isLast?: boolean;
  disabled?: boolean;
}) => {
  const displayValue = disabled ? false : value;
  return (
    <>
      <View style={[styles.row, disabled && { opacity: 0.4 }]}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}>{icon}</View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{label}</Text>
            {description ? (
              <Text style={styles.rowDesc}>{description}</Text>
            ) : null}
          </View>
        </View>
        <Switch
          value={displayValue}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: COLORS.divider, true: COLORS.purpleDeep }}
          thumbColor={COLORS.purpleNeon}
          ios_backgroundColor={COLORS.divider}
        />
      </View>
      {!isLast && <View style={styles.rowDivider} />}
    </>
  );
};

export default function NotificationSettingsScreen({ navigation }: Props) {
  const { arrivalDetect, setArrivalDetect, snapEnabled, setSnapEnabled } = useSettings();

  // 전체 마스터 알림 설정
  const [masterEnabled, setMasterEnabled] = useState(true);

  // 소셜 알림
  const [friendTrip, setFriendTrip] = useState(true);
  const [likes, setLikes] = useState(true);
  const [newFollower, setNewFollower] = useState(true);

  // 여행 감지 알림
  const [returnDetect, setReturnDetect] = useState(false);

  // 추억 리마인드
  const [memoryRemind, setMemoryRemind] = useState(true);

  // 마케팅
  const [marketing, setMarketing] = useState(false);

  // 기기 알림 권한 상태
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionGranted(status === 'granted');
    } catch {
      // 권한 확인 실패 시 배너 미표시
      setPermissionGranted(true);
    }
  };

  const requestPermission = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
      } else {
        // 이미 거부된 경우 기기 설정으로 이동
        openSettings();
      }
    } catch {
      openSettings();
    }
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림 설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 기기 알림 권한 배너 ── */}
        {permissionGranted === false && (
          <View style={styles.permissionBanner}>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>알림 권한이 꺼져 있어요</Text>
              <Text style={styles.permissionDesc}>
                기기 설정에서 알림을 허용해야{'\n'}아래 알림을 받을 수 있어요.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionBtnText}>설정 열기</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 기본 알림 설정 ── */}
        <SectionLabel label="기본 알림 설정" />
        <View style={styles.card}>
          <ToggleRow
            icon={<BellIcon size={20} />}
            label="푸시 알림 허용"
            description="eOrth에서 보내는 모든 푸시 알림을 켜고 끕니다"
            value={masterEnabled}
            onValueChange={setMasterEnabled}
            isLast
          />
        </View>

        {/* ── 소셜 알림 ── */}
        <SectionLabel label="소셜 알림" />
        <View style={styles.card}>
          <ToggleRow
            icon={<MapIcon size={20} />}
            label="친구 새 여행 기록"
            description="팔로우하는 친구가 여행 기록을 올렸을 때"
            value={friendTrip}
            onValueChange={setFriendTrip}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<HeartIcon size={20} />}
            label="좋아요 · 댓글"
            description="내 기록에 좋아요나 댓글이 달렸을 때"
            value={likes}
            onValueChange={setLikes}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<PersonIcon size={20} />}
            label="새 팔로워"
            description="누군가 나를 팔로우했을 때"
            value={newFollower}
            onValueChange={setNewFollower}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 여행 감지 알림 ── */}
        <SectionLabel label="여행 감지 알림" />
        <View style={styles.card}>
          <ToggleRow
            icon={<PlaneIcon size={20} />}
            label="해외 도착 감지"
            description="해외에 도착하면 여행 기록을 시작할지 알려줘요"
            value={arrivalDetect}
            onValueChange={setArrivalDetect}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<HomeIcon size={20} />}
            label="귀국 감지"
            description="귀국하면 여행을 마무리할지 알려줘요"
            value={returnDetect}
            onValueChange={setReturnDetect}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 스냅 알림 ── */}
        <SectionLabel label="스냅 알림" />
        <View style={styles.card}>
          <ToggleRow
            icon={<BellIcon size={20} />}
            label="실시간 스냅 알림"
            description="해외 여행 중 무작위 시점에 사진을 기록하라고 알려줘요"
            value={snapEnabled}
            onValueChange={setSnapEnabled}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 추억 리마인드 ── */}
        <SectionLabel label="추억 리마인드" />
        <View style={styles.card}>
          <ToggleRow
            icon={<CalendarIcon size={20} />}
            label="1년 전 오늘 알림"
            description="1년 전 오늘의 여행 기록을 돌아봐요"
            value={memoryRemind}
            onValueChange={setMemoryRemind}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 마케팅 ── */}
        <SectionLabel label="마케팅" />
        <View style={styles.card}>
          <ToggleRow
            icon={<MegaphoneIcon size={20} />}
            label="새 기능 · 이벤트 알림"
            description="eOrth의 업데이트 소식과 이벤트를 받아요"
            value={marketing}
            onValueChange={setMarketing}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* 안내 문구 */}
        <Text style={styles.footnote}>
          일부 알림은 기기의 알림 설정에 따라 제한될 수 있어요.{'\n'}
          기기 설정 → eOrth에서 전체 알림 권한을 확인해주세요.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
  },
  backIcon: {
    fontSize: 20,
    color: COLORS.white,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textDim,
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 카드
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },

  // 토글 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
  rowDesc: {
    fontSize: 11,
    color: COLORS.textDim,
    lineHeight: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 56,
  },

  // 권한 배너
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1530',
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
    gap: 12,
  },
  permissionTextWrap: {
    flex: 1,
    gap: 3,
  },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },
  permissionDesc: {
    fontSize: 11,
    color: COLORS.textDim,
    lineHeight: 16,
  },
  permissionBtn: {
    backgroundColor: COLORS.purpleNeon,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  permissionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A0A0F',
  },

  // 안내 문구
  footnote: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
    paddingHorizontal: 8,
  },
});
