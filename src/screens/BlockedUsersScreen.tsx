import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Text } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { useSocialGraph, useRecordActions, type BlockedUser } from '../store/recordStore';
import { fetchMyBlockedHandles } from '../services/social';
import { BlockIcon } from '../components/icons';
import DefaultAvatar from '../components/DefaultAvatar';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingsCard,
  SettingsDivider,
  SettingsEmptyState,
  SettingsModal,
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

  // 상대의 '현재' 아이디 { id: handle } — 저장된 handle은 차단 당시 값이라 아이디를 바꾸면 낡는다.
  // 표시만 바꾼다: 저장된 handle은 차단 신원 키(isBlocked·해제 매칭·state_flags 동기화)라 그대로 둔다.
  const [currentHandles, setCurrentHandles] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchMyBlockedHandles().then((m) => { if (alive && m) setCurrentHandles(m); });
    return () => { alive = false; };
  }, []);
  const displayHandle = (u: BlockedUser) => (u.id && currentHandles[u.id]) || u.handle;

  // 해제 재확인 팝업 대상 — 앱 설정 팝업(SettingsModal)으로 한 번 더 묻는다
  const [confirmTarget, setConfirmTarget] = useState<BlockedUser | null>(null);
  const closeConfirm = () => setConfirmTarget(null);
  const confirmUnblock = () => {
    // 신원 키는 저장된 handle 우선 — 동명(name) 계정이 있어도 어떤 계정을 해제하는지 정확하다
    if (confirmTarget) unblockUser(confirmTarget.handle || confirmTarget.name);
    closeConfirm();
  };
  const confirmHandle = confirmTarget ? displayHandle(confirmTarget) : undefined;

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
            <SettingsCard baseRim={COLORS.line}>
              {blockedUsers.map((user, idx) => (
                // id·handle이 모두 없는 구버전 데이터에서 동명+동시각 충돌을 막기 위해 idx로 최종 구분
                <React.Fragment key={user.id ?? user.handle ?? `${user.name}-${user.blockedAt}-${idx}`}>
                  <View style={st.userRow}>
                    {/* 차단된 사용자는 기본 프사로만 표시(사진은 미노출 — 사용자 결정) */}
                    <View style={st.avatarWrap}>
                      <DefaultAvatar size={42} />
                    </View>
                    {/* 프사 옆 — 아이디(현재 값), 그 아래 차단한 날짜 작게 */}
                    <View style={st.userInfo}>
                      <Text style={st.handle} numberOfLines={1}>{displayHandle(user) ? `@${displayHandle(user)}` : user.name}</Text>
                      <Text style={st.blockedDate}>{t('friends.blockedOn', { date: formatDate(user.blockedAt) })}</Text>
                    </View>
                    {/* 차단 해제 = 위험 동작 → 로그아웃과 같은 danger 알약(행 안이라 compact) */}
                    <SettingsPillButton
                      compact
                      tone="danger"
                      label={t('friends.unblockShort')}
                      onPress={() => setConfirmTarget(user)}
                      baseRim={COLORS.line}
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

      {/* 차단 해제 재확인 — 하단 알약(취소) 위에 빨간 해제 알약 */}
      <SettingsModal
        visible={!!confirmTarget}
        title={t('friends.unblockTitle')}
        description={t('friends.unblockMsg', { name: confirmHandle ? `@${confirmHandle}` : confirmTarget?.name ?? '' })}
        closeLabel={t('common.cancel')}
        onClose={closeConfirm}
      >
        <SettingsPillButton tone="danger" label={t('friends.unblock')} onPress={confirmUnblock} baseRim={COLORS.line} style={st.confirmPill} />
      </SettingsModal>
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
  // 아이디 — 설정 행 라벨과 같은 14 흰색
  handle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
  // 차단 날짜 — 아이디 아래 작게(설정 행 설명 줄과 같은 12 흐림)
  blockedDate: {
    fontSize: 12,
    color: COLORS.text50,
    marginTop: 2,
  },
  confirmPill: { marginTop: 20 },
});
