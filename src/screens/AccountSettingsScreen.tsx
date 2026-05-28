import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { useRecords } from '../store/recordStore';
import { EmailIcon, LockClosedIcon, GlobeIcon, TrashIcon } from '../components/icons';

const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  red:          '#FF3B30',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  green:        '#34C759',
};

interface Props {
  navigation: any;
}

// ─── 섹션 타이틀 ───
const SectionTitle = ({ label }: { label: string }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

// ─── 카드 아이템 ───
const CardRow = ({
  icon,
  label,
  value,
  onPress,
  danger,
  rightElement,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
}) => (
  <TouchableOpacity
    style={styles.cardRow}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={styles.cardLeft}>
      <View style={styles.cardIcon}>{icon}</View>
      <View>
        <Text style={[styles.cardLabel, danger && { color: COLORS.red }]}>{label}</Text>
        {value ? <Text style={styles.cardValue}>{value}</Text> : null}
      </View>
    </View>
    {rightElement ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
  </TouchableOpacity>
);

export default function AccountSettingsScreen({ navigation }: Props) {
  const [googleLinked, setGoogleLinked] = useState(true);
  const [appleLinked, setAppleLinked] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [email, setEmail] = useState('user@eorth.app');
  const { records, deleteRecord } = useRecords();

  const handleEmailChange = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        '이메일 주소 변경',
        '새 이메일 주소를 입력해주세요.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '변경',
            onPress: (value: string | undefined) => {
              const trimmed = (value ?? '').trim();
              if (!trimmed) {
                Alert.alert('알림', '이메일 주소를 입력해주세요.');
                return;
              }
              setEmail(trimmed);
              Alert.alert('변경 완료', `${trimmed}으로 이메일이 변경되었어요.`);
            },
          },
        ],
        'plain-text',
        email,
        'email-address'
      );
    } else {
      // Android: TextInput이 포함된 Alert 대신 별도 안내
      Alert.alert(
        '이메일 주소 변경',
        '새 이메일 주소로 변경하려면 설정 화면을 이용해주세요.',
        [{ text: '확인' }]
      );
    }
  };

  const handlePasswordChange = () => {
    Alert.alert(
      '비밀번호 변경',
      '등록된 이메일로 비밀번호 재설정 링크를 전송할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전송',
          onPress: () => Alert.alert('전송 완료', '이메일을 확인해주세요.'),
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '계정 삭제',
      '계정을 삭제하면 모든 여행 기록이 사라집니다.\n정말 삭제하시겠어요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            // 모든 records 삭제
            [...records].forEach((r) => deleteRecord(r.id));
            // Splash로 앱 초기화
            navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
          },
        },
      ]
    );
  };

  const toggleSocial = (provider: string, current: boolean, setter: (v: boolean) => void) => {
    if (current) {
      Alert.alert(
        `${provider} 연결 해제`,
        `${provider} 계정 연결을 해제할까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '해제', style: 'destructive', onPress: () => setter(false) },
        ]
      );
    } else {
      setter(true);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>계정 설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 이메일 ── */}
        <SectionTitle label="이메일" />
        <View style={styles.card}>
          <CardRow
            icon={<EmailIcon size={20} />}
            label="이메일 주소"
            value={email}
            onPress={handleEmailChange}
          />
        </View>

        {/* ── 비밀번호 ── */}
        <SectionTitle label="비밀번호" />
        <View style={styles.card}>
          <CardRow
            icon={<LockClosedIcon size={20} />}
            label="비밀번호 변경"
            value="마지막 변경: 2025.01.15"
            onPress={handlePasswordChange}
          />
        </View>

        {/* ── 연결된 소셜 계정 ── */}
        <SectionTitle label="연결된 소셜 계정" />
        <View style={styles.card}>
          {/* 구글 */}
          <CardRow
            icon={<Text style={{ fontSize: 18 }}>🔵</Text>}
            label="Google"
            value={googleLinked ? '연결됨' : '연결 안 됨'}
            rightElement={
              <Switch
                value={googleLinked}
                onValueChange={(v) => toggleSocial('Google', googleLinked, setGoogleLinked)}
                trackColor={{ false: COLORS.divider, true: '#4285F4' }}
                thumbColor={COLORS.white}
              />
            }
          />
          <View style={styles.rowDivider} />
          {/* 애플 */}
          <CardRow
            icon={<Text style={{ fontSize: 18 }}>🍎</Text>}
            label="Apple"
            value={appleLinked ? '연결됨' : '연결 안 됨'}
            rightElement={
              <Switch
                value={appleLinked}
                onValueChange={(v) => toggleSocial('Apple', appleLinked, setAppleLinked)}
                trackColor={{ false: COLORS.divider, true: '#555' }}
                thumbColor={COLORS.white}
              />
            }
          />
        </View>

        {/* ── 공개 설정 ── */}
        <SectionTitle label="계정 공개 · 비공개 설정" />
        <View style={styles.card}>
          <CardRow
            icon={isPublic ? <GlobeIcon size={20} /> : <LockClosedIcon size={20} />}
            label="계정 공개"
            value={isPublic ? '팔로워 누구나 여행 피드 볼 수 있음' : '승인한 팔로워만 볼 수 있음'}
            rightElement={
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: COLORS.divider, true: COLORS.purpleDeep }}
                thumbColor={isPublic ? COLORS.purpleNeon : '#888'}
                ios_backgroundColor={COLORS.divider}
              />
            }
          />
        </View>

        {/* ── 위험 구역 ── */}
        <SectionTitle label="위험 구역" />
        <View style={styles.card}>
          <CardRow
            icon={<TrashIcon size={20} />}
            label="계정 삭제"
            danger
            onPress={handleDeleteAccount}
          />
        </View>

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
    paddingTop: 24,
    paddingBottom: 32,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textDim,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },

  // 카드
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIcon: {
    width: 26,
    height: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 2,
  },
  cardLabel: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 54,
  },
});
