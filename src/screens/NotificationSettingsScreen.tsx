import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,  Linking,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { MapIcon, HeartIcon, PersonIcon, PlaneIcon, HomeIcon, CalendarIcon, MegaphoneIcon, BellIcon } from '../components/icons';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import type { RootStackScreenProps } from '../navigation/types';

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

type Props = RootStackScreenProps<'NotificationSettings'>;

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
  const { t } = useTranslation();
  const { arrivalDetect, setArrivalDetect, snapEnabled, setSnapEnabled, notifPrefs, setNotifPref } = useSettings();

  // 알림 토글은 settingsStore에 영속 저장 (재진입 시 유지)
  const masterEnabled = notifPrefs.master;
  const friendTrip = notifPrefs.friendTrip;
  const likes = notifPrefs.likes;
  const newFollower = notifPrefs.newFollower;
  const returnDetect = notifPrefs.returnDetect;
  const memoryRemind = notifPrefs.memoryRemind;
  const marketing = notifPrefs.marketing;

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
          accessibilityRole="button"
          accessibilityLabel={t('notifSettings.back')}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifSettings.title')}</Text>
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
              <Text style={styles.permissionTitle}>{t('notifSettings.permissionTitle')}</Text>
              <Text style={styles.permissionDesc}>
                {t('notifSettings.permissionDesc')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionBtnText}>{t('notifSettings.openSettings')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 기본 알림 설정 ── */}
        <SectionLabel label={t('notifSettings.sectionBasic')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<BellIcon size={20} />}
            label={t('notifSettings.masterLabel')}
            description={t('notifSettings.masterDesc')}
            value={masterEnabled}
            onValueChange={(v) => setNotifPref('master', v)}
            isLast
          />
        </View>

        {/* ── 소셜 알림 ── */}
        <SectionLabel label={t('notifSettings.sectionSocial')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<MapIcon size={20} />}
            label={t('notifSettings.friendTripLabel')}
            description={t('notifSettings.friendTripDesc')}
            value={friendTrip}
            onValueChange={(v) => setNotifPref('friendTrip', v)}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<HeartIcon size={20} />}
            label={t('notifSettings.likesLabel')}
            description={t('notifSettings.likesDesc')}
            value={likes}
            onValueChange={(v) => setNotifPref('likes', v)}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<PersonIcon size={20} />}
            label={t('notifSettings.newFollowerLabel')}
            description={t('notifSettings.newFollowerDesc')}
            value={newFollower}
            onValueChange={(v) => setNotifPref('newFollower', v)}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 여행 감지 알림 ── */}
        <SectionLabel label={t('notifSettings.sectionTravelDetect')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<PlaneIcon size={20} />}
            label={t('notifSettings.arrivalLabel')}
            description={t('notifSettings.arrivalDesc')}
            value={arrivalDetect}
            onValueChange={setArrivalDetect}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<HomeIcon size={20} />}
            label={t('notifSettings.returnLabel')}
            description={t('notifSettings.returnDesc')}
            value={returnDetect}
            onValueChange={(v) => setNotifPref('returnDetect', v)}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 스냅 알림 ── */}
        <SectionLabel label={t('notifSettings.sectionSnap')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<BellIcon size={20} />}
            label={t('notifSettings.snapLabel')}
            description={t('notifSettings.snapDesc')}
            value={snapEnabled}
            onValueChange={setSnapEnabled}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 추억 리마인드 ── */}
        <SectionLabel label={t('notifSettings.sectionMemory')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<CalendarIcon size={20} />}
            label={t('notifSettings.memoryLabel')}
            description={t('notifSettings.memoryDesc')}
            value={memoryRemind}
            onValueChange={(v) => setNotifPref('memoryRemind', v)}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* ── 마케팅 ── */}
        <SectionLabel label={t('notifSettings.sectionMarketing')} />
        <View style={styles.card}>
          <ToggleRow
            icon={<MegaphoneIcon size={20} />}
            label={t('notifSettings.marketingLabel')}
            description={t('notifSettings.marketingDesc')}
            value={marketing}
            onValueChange={(v) => setNotifPref('marketing', v)}
            disabled={!masterEnabled}
            isLast
          />
        </View>

        {/* 안내 문구 */}
        <Text style={styles.footnote}>
          {t('notifSettings.footnote')}
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
