// 초대 귀속 넛지 모달 — 초대 딥링크로 가입한 사용자에게 첫 메인 진입 시
// "초대자와 메이트 연결"을 제안한다. (Alert 대체 — 앱 다크 보라 톤, StayPromptModal 관례)
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PersonIcon } from './icons';

export interface InviteNudgeTarget {
  userId: string;
  handle: string;
  photo: string | null;
}

export function InviteNudgeModal({ target, onSend, onClose }: {
  target: InviteNudgeTarget | null; // null이면 닫힘
  onSend: () => void;               // "메이트 신청" — 호출측이 신청+프로필 이동 처리
  onClose: () => void;              // "나중에"/바깥·뒤로가기 — 원샷이라 재등장 없음
}) {
  const { t } = useTranslation();
  // 사진 로드 실패 시 아이콘으로 회귀 (깨진 이미지 방지)
  const [imgError, setImgError] = useState(false);
  const visible = !!target;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.avatar}>
            {target?.photo && !imgError ? (
              <Image source={{ uri: target.photo }} style={s.avatarImg} onError={() => setImgError(true)} />
            ) : (
              <PersonIcon size={30} color="#A0A0B0" />
            )}
          </View>
          <Text style={s.title}>{t('friends.inviteNudgeTitle')}</Text>
          <Text style={s.desc}>{t('friends.inviteNudgeMsg', { handle: target?.handle ?? '' })}</Text>
          <TouchableOpacity
            style={s.sendBtn}
            activeOpacity={0.85}
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel={t('friends.inviteNudgeSend')}
          >
            <Text style={s.sendBtnTxt}>{t('friends.inviteNudgeSend')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.laterBtn}
            activeOpacity={0.7}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('friends.inviteNudgeLater')}
          >
            <Text style={s.laterBtnTxt}>{t('friends.inviteNudgeLater')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 28 },
  card: { backgroundColor: '#161421', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
  avatarImg: { width: 64, height: 64 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  desc: { color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  sendBtn: { alignSelf: 'stretch', marginTop: 18, height: 46, borderRadius: 999, backgroundColor: '#6B21A8', alignItems: 'center', justifyContent: 'center' },
  sendBtnTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  laterBtn: { alignSelf: 'stretch', marginTop: 10, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  laterBtnTxt: { color: '#A1A1B0', fontSize: 14, fontWeight: '600' },
});
