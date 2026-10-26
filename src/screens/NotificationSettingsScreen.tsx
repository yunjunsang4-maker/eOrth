import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  AppState,
} from 'react-native';
import { Text } from '../ui/Text';
import * as Notifications from 'expo-notifications';
import { MapIcon, HeartIcon, ChatIcon, PersonIcon, PlaneIcon, HomeIcon, CalendarIcon, MegaphoneIcon, BellIcon, BackpackIcon, SparkleIcon } from '../components/icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useNotifSettings, useSettingsActions } from '../store/settingsStore';
import type { RootStackScreenProps } from '../navigation/types';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingGroup,
  SettingsCard,
  SettingsPillButton,
  settingsText,
  type SettingItem,
} from '../components/settings/SettingsUI';
import { shouldShowLocationBanner } from '../utils/locationDetectorBanner';
import { TRAVEL_MOMENTS_ENABLED } from '../constants/featureFlags';

const COLORS = SETTINGS_COLORS;

type Props = RootStackScreenProps<'NotificationSettings'>;

// 토글 행은 설정 화면 SettingGroup의 토글 항목을 그대로 쓴다(햅틱 select()·스킨색 트랙·흰 썸·가운데 정렬 포함).
// 설명은 SettingItem.description(라벨 아래 11·흰 50%), 전체 알림이 꺼졌을 때의 하위 토글은 disabled(흐리게·잠금·꺼짐 표시).

export default function NotificationSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { arrivalDetect, snapEnabled, notifPrefs } = useNotifSettings();
  const { setArrivalDetect, setSnapEnabled, setNotifPref } = useSettingsActions();

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
  const stayTripSuggest = notifPrefs.stayTripSuggest;
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
    travelMoment: TRAVEL_MOMENTS_ENABLED && notifPrefs.travelMoment, // 기능이 꺼져 있으면 MomentNotifier도 위치를 안 읽는다
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

  // 하위 토글은 전부 전체 알림(master)이 꺼지면 잠긴다 — 예전 ToggleRow의 disabled={!masterEnabled}와 같다
  const sub = (item: SettingItem): SettingItem => ({ ...item, disabled: !masterEnabled });

  const basicItems: SettingItem[] = [
    {
      icon: <BellIcon size={20} />,
      label: t('notifSettings.masterLabel'),
      description: t('notifSettings.masterDesc'),
      toggle: masterEnabled,
      onToggle: (v) => setNotifPref('master', v),
    },
  ];
  const socialItems: SettingItem[] = [
    sub({ icon: <MapIcon size={20} />, label: t('notifSettings.friendTripLabel'), description: t('notifSettings.friendTripDesc'), toggle: friendTrip, onToggle: (v) => setNotifPref('friendTrip', v) }),
    sub({ icon: <HeartIcon size={20} />, label: t('notifSettings.likesLabel'), description: t('notifSettings.likesDesc'), toggle: likes, onToggle: (v) => setNotifPref('likes', v) }),
    sub({ icon: <ChatIcon size={20} />, label: t('notifSettings.messagesLabel'), description: t('notifSettings.messagesDesc'), toggle: messages, onToggle: (v) => setNotifPref('messages', v) }),
    sub({ icon: <PersonIcon size={20} />, label: t('notifSettings.newFollowerLabel'), description: t('notifSettings.newFollowerDesc'), toggle: newFollower, onToggle: (v) => setNotifPref('newFollower', v) }),
  ];
  const travelItems: SettingItem[] = [
    sub({ icon: <PlaneIcon size={20} />, label: t('notifSettings.arrivalLabel'), description: t('notifSettings.arrivalDesc'), toggle: arrivalDetect, onToggle: handleArrivalToggle }),
    sub({ icon: <BellIcon size={20} />, label: t('notifSettings.snapLabel'), description: t('notifSettings.snapDesc'), toggle: snapEnabled, onToggle: setSnapEnabled }),
    ...(TRAVEL_MOMENTS_ENABLED
      ? [sub({ icon: <SparkleIcon size={20} />, label: t('moments.settingsLabel'), description: t('moments.settingsDesc'), toggle: travelMoment, onToggle: (v) => setNotifPref('travelMoment', v) })]
      : []),
    sub({ icon: <HomeIcon size={20} />, label: t('notifSettings.returnLabel'), description: t('notifSettings.returnDesc'), toggle: returnDetect, onToggle: (v) => setNotifPref('returnDetect', v) }),
    // 이 줄만 위치 권한이 필요 없다 — 최근 사진에서 체류국 밖 여행을 찾는다
    // 아이콘은 이모지(🧳) 대신 앱 팔레트 아이콘 — 다른 행과 같은 크기·스킨색 점
    sub({ icon: <BackpackIcon size={20} />, label: t('notifSettings.stayTripLabel'), description: t('notifSettings.stayTripDesc'), toggle: stayTripSuggest, onToggle: (v) => setNotifPref('stayTripSuggest', v) }),
  ];
  const memoryItems: SettingItem[] = [
    sub({ icon: <CalendarIcon size={20} />, label: t('notifSettings.memoryLabel'), description: t('notifSettings.memoryDesc'), toggle: memoryRemind, onToggle: (v) => setNotifPref('memoryRemind', v) }),
  ];
  const marketingItems: SettingItem[] = [
    sub({ icon: <MegaphoneIcon size={20} />, label: t('notifSettings.marketingLabel'), description: t('notifSettings.marketingDesc'), toggle: marketing, onToggle: (v) => setNotifPref('marketing', v) }),
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <SettingsHeader title={t('notifSettings.title')} onBack={() => navigation.goBack()} backA11yLabel={t('notifSettings.back')} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 기기 알림 권한 배너 ── */}
        {permissionGranted === false && (
          <SettingsCard style={styles.permissionBanner}>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>{t('notifSettings.permissionTitle')}</Text>
              <Text style={styles.permissionDesc}>
                {t('notifSettings.permissionDesc')}
              </Text>
            </View>
            {/* 배너 카드와 채움이 같아 윤곽이 사라진다 — 팝업 취소 알약과 같은 옅은 흰 테두리 */}
            <SettingsPillButton compact label={t('notifSettings.openSettings')} onPress={requestPermission} baseRim={SETTINGS_COLORS.line} />
          </SettingsCard>
        )}

        {/* ── 위치 권한 배너 ──
            여행 감지 알림(도착·스냅·순간·귀국)은 전부 현재 위치를 읽는데, 감지기들은 절대
            권한 팝업을 띄우지 않는다(로그인 전 스플래시 위에 뜨는 것을 막기 위함 —
            App Store 5.1.1). 그래서 권한이 없으면 토글만 켜진 채 기능이 조용히 죽는다.
            위 알림 권한 배너와 동시에 뜰 수 있다 — 같은 스타일·같은 자리에 세로로 쌓이고
            permissionBanner의 marginTop 12가 두 배너 사이 간격이 된다. */}
        {showLocationBanner && (
          <SettingsCard style={styles.permissionBanner}>
            <View style={styles.permissionTextWrap}>
              <Text style={styles.permissionTitle}>{t('notifSettings.locationPermissionTitle')}</Text>
              <Text style={styles.permissionDesc}>
                {t('notifSettings.locationPermissionDesc')}
              </Text>
            </View>
            <SettingsPillButton compact label={t('notifSettings.locationPermissionBtn')} onPress={requestLocationPermission} baseRim={SETTINGS_COLORS.line} />
          </SettingsCard>
        )}

        {/* ── 기본 알림 설정 ── */}
        <SettingGroup label={t('notifSettings.sectionBasic')} items={basicItems} />

        {/* ── 소셜 알림 ── */}
        <SettingGroup label={t('notifSettings.sectionSocial')} items={socialItems} />

        {/* ── 여행 감지 알림 ── */}
        <SettingGroup label={t('notifSettings.sectionTravelDetect')} items={travelItems} />

        {/* ── 추억 리마인드 ── */}
        <SettingGroup label={t('notifSettings.sectionMemory')} items={memoryItems} />

        {/* ── 마케팅 ── */}
        <SettingGroup label={t('notifSettings.sectionMarketing')} items={marketingItems} />

        {/* 안내 문구 */}
        <Text style={[settingsText.groupNote, styles.footnote]}>
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

  // 좌우 16 = 설정 화면 카드 폭
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // 권한 배너 — 설정 카드 재질. 놓치면 기능이 조용히 죽는 안내라 제목만 보라(그룹 라벨 색)로 띄운다
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 14,
    paddingVertical: 14,
    marginTop: 12,
    gap: 12,
  },
  permissionTextWrap: {
    flex: 1,
    gap: 3,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.label,
  },
  permissionDesc: {
    fontSize: 11,
    color: COLORS.text50,
    lineHeight: 16,
  },

  // 안내 문구 — 카드 아래 안내문(groupNote) 톤, 가운데
  footnote: {
    textAlign: 'center',
    marginTop: 20,
  },
});
