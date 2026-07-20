// 프로필 "마이" 티켓 — QR로 자신의 프로필을 공유하는 모달.
// 티켓 카드(ticketRef)를 이미지로 캡처해 갤러리 저장 / 시스템 공유한다.
// 시각 디자인은 추후 확정 — 지금은 기능용 플레이스홀더 레이아웃(ticketRef View 내부만 교체 예정).
import React, { useRef } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

// QR 스캔 호환: 친구찾기 스캐너(USER_LINK_RE = eorth://user/...)가 user 형식만 받으므로
// 여기서도 user 형식으로 인코딩한다(profileLink의 profile 형식을 쓰면 스캔이 안 됨).
const userLink = (code: string) => `eorth://user/${code}`;

export interface ProfileTicketModalProps {
  visible: boolean;
  onClose: () => void;
  handle: string;        // 아이디(없으면 '' → QR 대신 안내)
  name: string;          // 표시 이름(= handle)
  photo: string | null;  // 프로필 사진 uri
  homeLabel: string;     // 예: "🇰🇷 대한민국"
  tripCount: number;
  neighborCount: number;
}

export default function ProfileTicketModal({
  visible, onClose, handle, name, photo, homeLabel, tripCount, neighborCount,
}: ProfileTicketModalProps) {
  const { t } = useTranslation();
  const ticketRef = useRef<View>(null);
  const hasHandle = !!handle;

  // 티켓 카드 영역을 PNG로 캡처 — 실패 시 null
  const capture = async (): Promise<string | null> => {
    try {
      return await captureRef(ticketRef, { format: 'png', quality: 1 });
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      // writeOnly 권한 — iOS는 '추가 전용' 팝업이라 부담이 적다(PhotoViewerModal과 동일)
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert(t('comp.viewerSaveFail')); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(t('comp.viewerSaved'));
    } catch {
      Alert.alert(t('comp.viewerSaveFail'));
    }
  };

  const handleShare = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      // iOS는 이미지 전송, Android는 RN Share 한계로 제한적(앱 전반과 동일 — 의도됨)
      await Share.share({ url: uri });
    } catch {
      // 취소 등 — 무해화
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('profileTicket.closeA11y')}
        />

        {/* 캡처 대상 — 티켓 카드. 추후 시각 디자인은 이 View 내부만 교체 */}
        <View ref={ticketRef} collapsable={false} style={st.ticket}>
          <View style={st.header}>
            {photo
              ? <Image source={{ uri: photo }} style={st.avatar} />
              : <View style={[st.avatar, st.avatarEmpty]} />}
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{name || t('friends.setProfileFirst')}</Text>
              {hasHandle && <Text style={st.handle} numberOfLines={1}>@{handle}</Text>}
              <Text style={st.home} numberOfLines={1}>{homeLabel}</Text>
            </View>
          </View>

          <View style={st.stats}>
            <Text style={st.statText}>{t('profile.tripCount')} {tripCount}</Text>
            <Text style={st.statText}>{t('profile.neighbors')} {neighborCount}</Text>
          </View>

          <View style={st.qrWrap}>
            {hasHandle
              ? <QRCode value={userLink(handle)} size={160} color="#000000" backgroundColor="#FFFFFF" quietZone={8} />
              : <Text style={st.qrHint}>{t('friends.qrHint')}</Text>}
          </View>
        </View>

        {/* 액션 — 캡처 대상 밖(버튼이 티켓 이미지에 찍히지 않게) */}
        <View style={st.actions}>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleSave}
            accessibilityRole="button"
          >
            <Text style={st.actionText}>{t('profileTicket.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleShare}
            accessibilityRole="button"
          >
            <Text style={st.actionText}>{t('profileTicket.share')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  // 티켓 카드(플레이스홀더) — 흰 배경(QR 대비 확보). 추후 디자인 교체 대상.
  ticket: { width: '100%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E5E5EA' },
  avatarEmpty: { backgroundColor: '#D8D8DE' },
  name: { fontSize: 17, fontWeight: '800', color: '#0A0A0F' },
  handle: { fontSize: 13, color: '#6B21A8', marginTop: 1 },
  home: { fontSize: 13, color: '#555', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 14 },
  statText: { fontSize: 13, color: '#333' },
  qrWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 176 },
  qrHint: { fontSize: 13, color: '#888', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%', maxWidth: 340 },
  actionBtn: { flex: 1, backgroundColor: '#6B21A8', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
