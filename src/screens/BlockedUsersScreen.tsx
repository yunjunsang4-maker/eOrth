import React, { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Text } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { useSocialGraph, useRecordActions } from '../store/recordStore';
import { BlockIcon } from '../components/icons';
import DefaultAvatar from '../components/DefaultAvatar';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingsCard,
  SettingsDivider,
  SettingsEmptyState,
  SettingsPillButton,
  settingsText,
} from '../components/settings/SettingsUI';
import type { RootStackScreenProps } from '../navigation/types';

const COLORS = SETTINGS_COLORS;

export default function BlockedUsersScreen({ navigation }: RootStackScreenProps<'BlockedUsers'>) {
  // 지구본 스킨 강조색 연동
  const a = useSkinAccent();
  const st = useMemo(() => makeStyles(a), [a]);
  const { t } = useTranslation();
  const { blockedUsers } = useSocialGraph();
  const { unblockUser } = useRecordActions();

  // handle 우선 — 동명(name) 계정이 있어도 어떤 계정을 해제하는지 식별·매칭이 정확하다
  const handleUnblock = (name: string, handle?: string) => {
    const label = handle ? `@${handle}` : name;
    Alert.alert(t('friends.unblockTitle'), t('friends.unblockMsg', { name: label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.unblock'),
        onPress: () => {
          unblockUser(handle || name);
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={st.safeArea}>
      <SettingsHeader title={t('friends.blockedTitle')} onBack={() => navigation.goBack()} backA11yLabel={t('friends.back')} />

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {blockedUsers.length === 0 ? (
          <SettingsEmptyState
            // 색상 prop 없이 두면 아이콘 전역 팔레트(지구본 스킨)를 따른다
            icon={<BlockIcon size={48} />}
            title={t('friends.noBlocked')}
            desc={t('friends.noBlockedDesc')}
            style={st.empty}
          />
        ) : (
          <>
            <Text style={settingsText.groupLabel}>{t('friends.blockedCount', { count: blockedUsers.length })}</Text>
            <SettingsCard>
              {blockedUsers.map((user, idx) => (
                // id·handle이 모두 없는 구버전 데이터에서 동명+동시각 충돌을 막기 위해 idx로 최종 구분
                <React.Fragment key={user.id ?? user.handle ?? `${user.name}-${user.blockedAt}-${idx}`}>
                  <View style={st.userRow}>
                    {/* 차단된 사용자는 기본 프사로만 표시(신원 시각 정보 미노출 — 사용자 결정) */}
                    <View style={st.avatarWrap}>
                      <DefaultAvatar size={42} />
                    </View>
                    {/* 프사 옆에는 차단한 날짜만 표시 */}
                    <View style={st.userInfo}>
                      <Text style={st.blockedDate}>{t('friends.blockedOn', { date: formatDate(user.blockedAt) })}</Text>
                    </View>
                    {/* 차단 해제 = 위험 동작 → 로그아웃과 같은 danger 알약(행 안이라 compact) */}
                    <SettingsPillButton
                      compact
                      tone="danger"
                      label={t('friends.unblockShort')}
                      onPress={() => handleUnblock(user.name, user.handle)}
                    />
                  </View>
                  {idx < blockedUsers.length - 1 && <SettingsDivider />}
                </React.Fragment>
              ))}
            </SettingsCard>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (a: SkinAccent) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 스크롤 — 좌우 16 = 설정 화면 카드 폭
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },

  // 빈 상태
  empty: {
    paddingTop: 80,
  },

  // 사용자 행 — 설정 행과 같은 좌 20 / 우 19, 아바타 44 + 위아래 10
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingLeft: 20,
    paddingRight: 19,
    paddingVertical: 10,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: a.tint(0.1),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: a.tint(0.25),
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  // 행의 유일한 텍스트(차단 날짜) — 설정 행 라벨과 같은 14 흰색
  blockedDate: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
});
