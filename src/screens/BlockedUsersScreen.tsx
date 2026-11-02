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
import { PillRing } from '../components/record/CalendarBottomSheet';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingsCard,
  SettingsDivider,
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

      {blockedUsers.length === 0 ? (
        // 빈 상태 — 2026-11-02 시안: 회색 금지 표식(원 84) + 흰 제목 + 설명 속 ⋯는 작은 원 아이콘. 세로 가운데보다 조금 위
        <View style={st.emptyWrap}>
          <BlockIcon size={92} color="#9CA3AF" />
          <Text style={st.emptyTitle}>{t('friends.noBlocked')}</Text>
          <Text style={st.emptyDesc}>
            {t('friends.noBlockedDesc').split('···').map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <View style={st.moreDotWrap}>
                    <PillRing width={16} height={16} radius={8} />
                    <View style={st.moreDot} /><View style={st.moreDot} /><View style={st.moreDot} />
                  </View>
                )}
                {part}
              </React.Fragment>
            ))}
          </Text>
        </View>
      ) : (
      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
          <>
            <Text style={settingsText.groupLabel}>{t('friends.blockedCount', { count: blockedUsers.length })}</Text>
            {/* 모서리 32 = 행 높이(64)의 절반 → 양옆이 완전한 반원(알약) */}
            <SettingsCard radius={32} baseRim={COLORS.line}>
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
                    {/* 차단 해제 = 위험 동작 → 로그아웃과 같은 danger 알약(행 안이라 compact).
                        danger 채움이 배경과 달라 윤곽선(baseRim)·그라데이션 링 없이 둔다 */}
                    <SettingsPillButton
                      compact
                      noRing
                      tone="danger"
                      label={t('friends.unblockShort')}
                      onPress={() => setConfirmTarget(user)}
                    />
                  </View>
                  {idx < blockedUsers.length - 1 && <SettingsDivider />}
                </React.Fragment>
              ))}
            </SettingsCard>
          </>
        <View style={{ height: 40 }} />
      </ScrollView>
      )}

      {/* 차단 해제 재확인 — 하단 알약(취소) 위에 빨간 해제 알약 */}
      <SettingsModal
        visible={!!confirmTarget}
        title={t('friends.unblockTitle')}
        description={t('friends.unblockMsg', { name: confirmHandle ? `@${confirmHandle}` : confirmTarget?.name ?? '' })}
        closeLabel={t('common.cancel')}
        onClose={closeConfirm}
      >
        <SettingsPillButton tone="danger" noRing label={t('friends.unblock')} onPress={confirmUnblock} style={st.confirmPill} />
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

  // 빈 상태 — 가운데 정렬 후 paddingBottom만큼 위로(시안: 묶음 중심이 본문 중심보다 ~60 위)
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 120,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginTop: 20 },
  emptyDesc: { fontSize: 14, lineHeight: 21, color: COLORS.text50, textAlign: 'center', marginTop: 8 },
  // 설명 속 ⋯ — 게시물 ⋯ 알약처럼 흰 12% 원 + 대각 링 + 흰 점 3개(인라인 뷰라 글자 기준선에 맞춰 살짝 내림)
  moreDotWrap: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1.5,
    transform: [{ translateY: 3 }],
  },
  moreDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: COLORS.white },

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
