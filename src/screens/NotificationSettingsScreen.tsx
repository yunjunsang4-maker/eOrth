import { select } from '../utils/haptics';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Linking,
  AppState,
} from 'react-native';
import { Text } from '../ui/Text';
import * as Notifications from 'expo-notifications';
import { MapIcon, HeartIcon, ChatIcon, PersonIcon, PlaneIcon, HomeIcon, CalendarIcon, MegaphoneIcon, BellIcon } from '../components/icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useSkinAccent } from '../constants/skinTheme';
import { useSettings } from '../store/settingsStore';
import type { RootStackScreenProps } from '../navigation/types';
import { andFitText } from '../utils/fitText';
import { shouldShowLocationBanner } from '../utils/locationDetectorBanner';

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
  const skinAccent = useSkinAccent();
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
          onValueChange={(v) => { select(); onValueChange(v); }}
          disabled={disabled}
          trackColor={{ false: COLORS.divider, true: skinAccent.accent }}
          thumbColor="#FFFFFF"
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

  // 도착 감지를 켜는 순간 = 위치 권한을 요청할 자연스러운 지점.
  // 앱 시작 시에는 권한을 묻지 않도록 바꿨기 때문에(snapService.detectCurrentCountry),
  // 사용자가 이 기능을 스스로 켤 때 요청하지 않으면 권한을 얻을 기회가 없다.
  // 거부해도 토글은 켠 상태로 두고(설정 앱에서 나중에 허용 가능) 기능만 조용히 쉰다.
  const handleArrivalToggle = async (next: boolean) => {
    setArrivalDetect(next);
    if (!next) return;
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status === 'granted' || !cur.canAskAgain) {
        // 이미 허용됐거나 다시 물을 수 없는 상태 — 배너 판정만 최신화하고 끝낸다.
        setLocationGranted(cur.status === 'granted');
        return;
      }
      const res = await Location.requestForegroundPermissionsAsync();
      // 여기서 갱신하지 않으면 방금 허용했는데도 아래 위치 권한 배너가 그대로 남는다
      // (AppState 'active'는 앱을 벗어났다 돌아올 때만 뛴다 — 인앱 팝업에서는 안 뛴다).
      setLocationGranted(res.status === 'granted');
    } catch {
      /* 권한 모듈 오류는 무시 — 토글 자체는 저장됐다 */
    }
  };

  // 알림 토글은 settingsStore에 영속 저장 (재진입 시 유지)
  const masterEnabled = notifPrefs.master;
  const friendTrip = notifPrefs.friendTrip;
  const likes = notifPrefs.likes;
  const messages = notifPrefs.messages;
  const newFollower = notifPrefs.newFollower;
  const returnDetect = notifPrefs.returnDetect;
  const memoryRemind = notifPrefs.memoryRemind;
  const travelMoment = notifPrefs.travelMoment;
  const marketing = notifPrefs.marketing;

  // 기기 알림 권한 상태
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  // 위치 권한 상태 (null = 아직 확인 전). 여행 감지 알림 4종이 전부 현재 위치를 읽는다.
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  useEffect(() => {
    checkPermission();
    checkLocationPermission();
    // OS 설정에서 권한을 바꾸고 돌아와도 배너가 그대로였다(마운트 1회만 확인) —
    // 앱이 포그라운드로 복귀할 때마다 다시 확인해 배너를 갱신한다.
    // 위치 권한도 같은 경로로 바뀌므로(설정 → eOrth → 위치) 함께 태운다.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { checkPermission(); checkLocationPermission(); }
    });
    return () => sub.remove();
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

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
    } catch {
      // 알림 권한과 같은 규칙 — 확인 자체가 실패하면 배너를 띄우지 않는다
      // (확인도 못 하면서 "권한이 없다"고 단정하면 허용한 사용자에게 거짓 배너가 남는다)
      setLocationGranted(true);
    }
  };

  // 위치 권한 요청. 이미 거부돼 canAskAgain === false면 requestForegroundPermissionsAsync가
  // 팝업 없이 즉시 denied를 돌려준다 — 버튼을 눌러도 아무 일이 없어 고장으로 보이므로
  // 그 경우엔 OS 설정으로 보낸다(위 알림 권한 배너의 requestPermission과 같은 패턴).
  const requestLocationPermission = async () => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status === 'granted') { setLocationGranted(true); return; }
      if (!cur.canAskAgain) { openSettings(); return; }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') setLocationGranted(true);
      else openSettings();
    } catch {
      openSettings();
    }
  };

  // 배너 조건은 감지기 4종의 게이트와 한 글자씩 맞아야 해서 순수 함수로 분리했다
  // (src/utils/locationDetectorBanner.ts — 근거 주석과 검증 파일이 그쪽에 있다).
  const showLocationBanner = shouldShowLocationBanner(locationGranted, {
    master: notifPrefs.master,
    arrivalDetect,
    snapEnabled,
    travelMoment: notifPrefs.travelMoment,
    returnDetect: notifPrefs.returnDetect,
  });

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
    // Linking.openSettings()는 iOS/Android 모두 동작. 실패는 무해화(미처리 rejection 방지)
    Linking.openSettings().catch(() => {});
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
              <Text style={styles.permissionBtnText} {...andFitText}>{t('notifSettings.openSettings')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 위치 권한 배너 ──
            여행 감지 알림(도착·스냅·순간·귀국)은 전부 현재 위치를 읽는데, 감지기들은 절대
            권한 팝업을 띄우지 않는다(로그인 전 스플래시 위에 뜨는 것을 막기 위함 —
            App Store 5.1.1). 그래서 권한이 없으면 토글만 켜진 채 기능이 조용히 죽는다.
            위 알림 권한 배너와 동시에 뜰 수 있다 — 같은 스타일·같은 자리에 세로로 쌓이고
            permissionBanner의 marginTop 12가 두 배너 사이 간격이 된다. */}
        {showLocationBanner && (
          <View style={styles.permissionBanner}>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>{t('notifSettings.locationPermissionTitle')}</Text>
              <Text style={styles.permissionDesc}>
                {t('notifSettings.locationPermissionDesc')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestLocationPermission}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.permissionBtnText} {...andFitText}>{t('notifSettings.locationPermissionBtn')}</Text>
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
            icon={<ChatIcon size={20} />}
            label={t('notifSettings.messagesLabel')}
            description={t('notifSettings.messagesDesc')}
            value={messages}
            onValueChange={(v) => setNotifPref('messages', v)}
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
            onValueChange={handleArrivalToggle}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<BellIcon size={20} />}
            label={t('notifSettings.snapLabel')}
            description={t('notifSettings.snapDesc')}
            value={snapEnabled}
            onValueChange={setSnapEnabled}
            disabled={!masterEnabled}
          />
          <ToggleRow
            icon={<Text style={{ fontSize: 18 }}>✨</Text>}
            label={t('moments.settingsLabel')}
            description={t('moments.settingsDesc')}
            value={travelMoment}
            onValueChange={(v) => setNotifPref('travelMoment', v)}
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
