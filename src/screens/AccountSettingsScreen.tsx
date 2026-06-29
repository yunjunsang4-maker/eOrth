import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,  Alert,
  Switch,
  Platform,
  Modal,
} from 'react-native';
import { useSettings } from '../store/settingsStore';
import { requestAccountDeletion, DELETION_GRACE_DAYS } from '../store/pendingDeletion';
import { signOut } from '../services/auth';
import type { RootStackScreenProps } from '../navigation/types';
import { EmailIcon, LockClosedIcon, GlobeIcon, TrashIcon, GoogleIcon, AppleIcon, CalendarIcon, PersonIcon } from '../components/icons';
import type { Gender } from '../store/settingsStore';

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

type Props = RootStackScreenProps<'AccountSettings'>;

// 입력 숫자를 YYYY-MM-DD 형태로 자동 정렬 (최대 8자리)
const formatBirthday = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (digits.length > 4) out += '-' + m;
  if (digits.length > 6) out += '-' + d;
  return out;
};

// YYYY-MM-DD 유효성 검사 (실제 존재하는 날짜 + 합리적 연도 범위)
const isValidBirthday = (v: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date().getFullYear();
  if (year < 1900 || year > now) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day >= 1 && day <= maxDay;
};

const genderLabel = (g: Gender) => (g === 'male' ? '남' : g === 'female' ? '여' : '미설정');

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
  const { signUpMethod, signUpEmail, setSignUpEmail, birthday, setBirthday, gender, setGender, accountPublic, setAccountPublic } = useSettings();
  const [googleLinked, setGoogleLinked] = useState(signUpMethod === 'google');

  // 생일 편집 모달 상태
  const [isBirthdayModalVisible, setIsBirthdayModalVisible] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState(birthday);
  // 성별 편집 모달 상태
  const [isGenderModalVisible, setIsGenderModalVisible] = useState(false);
  const [genderDraft, setGenderDraft] = useState<Gender>(gender);

  const openBirthdayModal = () => {
    setBirthdayDraft(birthday);
    setIsBirthdayModalVisible(true);
  };
  const submitBirthday = () => {
    if (!isValidBirthday(birthdayDraft)) {
      Alert.alert('오류', '생일을 YYYY-MM-DD 형식으로 정확히 입력해주세요.');
      return;
    }
    setBirthday(birthdayDraft);
    setIsBirthdayModalVisible(false);
  };

  const openGenderModal = () => {
    setGenderDraft(gender);
    setIsGenderModalVisible(true);
  };
  const submitGender = () => {
    if (genderDraft === '') {
      Alert.alert('오류', '성별을 선택해주세요.');
      return;
    }
    setGender(genderDraft);
    setIsGenderModalVisible(false);
  };
  const [appleLinked, setAppleLinked] = useState(signUpMethod === 'apple');
  // 계정 공개 여부는 settingsStore에 영속 저장 (화면 재진입 시 유지)
  const isPublic = accountPublic;

  const handlePublicToggle = (newValue: boolean) => {
    const title = newValue ? '계정 공개 전환' : '계정 비공개 전환';
    const message = newValue
      ? '계정을 공개로 전환할까요?\n이제 모든 사용자가 내 여행 피드를 볼 수 있게 됩니다.'
      : '계정을 비공개로 전환할까요?\n앞으로는 승인한 팔로워만 내 여행 피드를 볼 수 있습니다.';

    Alert.alert(
      title,
      message,
      [
        { text: '취소', style: 'cancel' },
        { text: '전환', onPress: () => setAccountPublic(newValue) }
      ]
    );
  };

  // 비밀번호 변경 모달 상태
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 계정 삭제 모달 상태
  const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [deleteConsent, setDeleteConsent] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonDetail, setDeleteReasonDetail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSocialConfirm, setDeleteSocialConfirm] = useState('');

  const handleEmailChange = () => {
    if (signUpMethod !== 'email') {
      Alert.alert('알림', '소셜 연동 계정의 이메일은 변경할 수 없습니다.');
      return;
    }

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
              setSignUpEmail(trimmed);
              Alert.alert('변경 완료', `${trimmed}으로 이메일이 변경되었어요.`);
            },
          },
        ],
        'plain-text',
        signUpEmail,
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
    if (signUpMethod !== 'email') {
      Alert.alert('알림', '구글/애플 로그인 계정은 비밀번호 변경을 제공하지 않습니다.');
      return;
    }
    setIsPasswordModalVisible(true);
  };

  const submitPasswordChange = () => {
    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedCurrent) {
      Alert.alert('오류', '현재 비밀번호를 입력해주세요.');
      return;
    }
    if (trimmedNew.length < 6) {
      Alert.alert('오류', '새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      Alert.alert('오류', '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }

    // 변경 성공 처리 (Mock)
    Alert.alert('성공', '비밀번호가 안전하게 변경되었습니다.', [
      {
        text: '확인',
        onPress: () => {
          closePasswordModal();
        },
      },
    ]);
  };

  const closePasswordModal = () => {
    setIsPasswordModalVisible(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleDeleteAccount = () => {
    setIsDeleteAccountModalVisible(true);
    setDeleteStep(1);
  };

  const submitDeleteAccount = () => {
    // 보안 검증
    if (signUpMethod === 'email') {
      if (!deletePassword.trim()) {
        Alert.alert('오류', '비밀번호를 입력해주세요.');
        return;
      }
    } else {
      if (deleteSocialConfirm.trim() !== '탈퇴하기') {
        Alert.alert('오류', '"탈퇴하기" 문구를 정확히 입력해주세요.');
        return;
      }
    }

    Alert.alert(
      '탈퇴 신청 완료',
      `그동안 eOrth를 이용해주셔서 감사합니다.\n${DELETION_GRACE_DAYS}일 이내에 다시 로그인하면 계정과 기록이 복구되며, 이후에는 모든 데이터가 영구 삭제됩니다.`,
      [
        {
          text: '확인',
          onPress: () => {
            closeDeleteAccountModal();
            // 즉시 파기하지 않고 유예 플래그만 기록 (30일 내 재로그인 시 복구)
            requestAccountDeletion().catch(() => {});
            signOut(); // 세션 종료 → 재로그인 시 복구 여부를 묻는다
            // Splash로 앱 초기화
            navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
          },
        },
      ]
    );
  };

  const closeDeleteAccountModal = () => {
    setIsDeleteAccountModalVisible(false);
    setDeleteStep(1);
    setDeleteConsent(false);
    setDeleteReason('');
    setDeleteReasonDetail('');
    setDeletePassword('');
    setDeleteSocialConfirm('');
  };

  const toggleSocial = (provider: string, current: boolean, setter: (v: boolean) => void) => {
    const isSignupProvider = (provider === 'Google' && signUpMethod === 'google') ||
                             (provider === 'Apple' && signUpMethod === 'apple');
    if (isSignupProvider) {
      Alert.alert('알림', `${provider} 계정으로 가입하셨기 때문에 연동을 해제할 수 없습니다.`);
      return;
    }

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
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
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
            label={signUpMethod === 'email' ? '이메일 주소' : (signUpMethod === 'google' ? 'Google 로그인 계정' : 'Apple 로그인 계정')}
            value={signUpEmail}
            onPress={signUpMethod === 'email' ? handleEmailChange : undefined}
          />
        </View>

        {/* ── 기본 정보 ── */}
        <SectionTitle label="기본 정보" />
        <View style={styles.card}>
          <CardRow
            icon={<CalendarIcon size={20} />}
            label="생일"
            value={birthday ? birthday : '설정 안 됨'}
            onPress={openBirthdayModal}
          />
          <View style={styles.rowDivider} />
          <CardRow
            icon={<PersonIcon size={20} />}
            label="성별"
            value={genderLabel(gender)}
            onPress={openGenderModal}
          />
        </View>

        {/* ── 비밀번호 ── */}
        <SectionTitle label="비밀번호" />
        <View style={styles.card}>
          <CardRow
            icon={<LockClosedIcon size={20} color={signUpMethod !== 'email' ? COLORS.textMuted : undefined} />}
            label="비밀번호 변경"
            value={signUpMethod === 'email' ? '마지막 변경: 2025.01.15' : '소셜 연동 계정은 변경이 불가능합니다'}
            onPress={handlePasswordChange}
          />
        </View>

        {/* ── 연결된 소셜 계정 ── */}
        <SectionTitle label="연결된 소셜 계정" />
        <View style={styles.card}>
          {/* 구글 */}
          <CardRow
            icon={<GoogleIcon size={18} />}
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
            icon={<AppleIcon size={18} color="#FFFFFF" />}
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
                onValueChange={handlePublicToggle}
                trackColor={{ false: COLORS.divider, true: COLORS.purpleDeep }}
                thumbColor={COLORS.purpleNeon}
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

      {/* ── 생일 편집 모달 ── */}
      <Modal
        visible={isBirthdayModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsBirthdayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>생일 변경</Text>
            <Text style={styles.modalDesc}>생일을 YYYY-MM-DD 형식으로 입력하세요.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>생일</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  birthdayDraft.length > 0 && !isValidBirthday(birthdayDraft) && styles.modalInputError,
                ]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={birthdayDraft}
                onChangeText={(t) => setBirthdayDraft(formatBirthday(t))}
              />
              {birthdayDraft.length > 0 && !isValidBirthday(birthdayDraft) && (
                <Text style={styles.inputErrorText}>형식: YYYY-MM-DD</Text>
              )}
            </View>

            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setIsBirthdayModalVisible(false)}
              >
                <Text style={styles.modalBtnTextCancel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit, !isValidBirthday(birthdayDraft) && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={!isValidBirthday(birthdayDraft)}
                onPress={submitBirthday}
              >
                <Text style={styles.modalBtnTextSubmit}>변경하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 성별 편집 모달 ── */}
      <Modal
        visible={isGenderModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsGenderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>성별 변경</Text>
            <Text style={styles.modalDesc}>성별을 선택하세요.</Text>

            <View style={styles.genderRow}>
              {([
                { value: 'male', label: '남' },
                { value: 'female', label: '여' },
              ] as { value: Gender; label: string }[]).map((opt) => {
                const active = genderDraft === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.genderBtn, active && styles.genderBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setGenderDraft(opt.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setIsGenderModalVisible(false)}
              >
                <Text style={styles.modalBtnTextCancel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit, genderDraft === '' && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={genderDraft === ''}
                onPress={submitGender}
              >
                <Text style={styles.modalBtnTextSubmit}>변경하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 비밀번호 변경 모달 ── */}
      <Modal
        visible={isPasswordModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closePasswordModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>비밀번호 변경</Text>
            <Text style={styles.modalDesc}>
              개인정보 보호를 위해 비밀번호를 안전하게 변경하세요.
            </Text>
            
            {/* 현재 비밀번호 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>현재 비밀번호</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="현재 비밀번호를 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            {/* 새 비밀번호 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>새 비밀번호 (6자 이상)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="새 비밀번호를 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            {/* 새 비밀번호 확인 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>새 비밀번호 확인</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  confirmPassword.length > 0 && newPassword !== confirmPassword && styles.modalInputError
                ]}
                 placeholder="새 비밀번호를 다시 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <Text style={styles.inputErrorText}>비밀번호가 일치하지 않습니다.</Text>
              )}
            </View>

            {/* 버튼 그룹 */}
            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={closePasswordModal}
              >
                <Text style={styles.modalBtnTextCancel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnSubmit,
                  (!currentPassword || newPassword.length < 6 || newPassword !== confirmPassword) && styles.modalBtnDisabled
                ]}
                activeOpacity={0.7}
                disabled={!currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                onPress={submitPasswordChange}
              >
                <Text style={styles.modalBtnTextSubmit}>변경하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 계정 삭제 모달 (디테일 3단계) ── */}
      <Modal
        visible={isDeleteAccountModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeDeleteAccountModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: COLORS.redBorder }]}>
            <Text style={[styles.modalTitle, { color: COLORS.red }]}>계정 삭제</Text>
            
            {/* Step 1: 안내 및 동의 */}
            {deleteStep === 1 && (
              <View>
                <Text style={styles.modalDesc}>계정 삭제 시 다음의 정보가 즉시 파기되며 복구되지 않습니다.</Text>
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>• 나만의 지구본 설정 및 핀(Pin) 기록 전체</Text>
                  <Text style={styles.warningText}>• 모든 스토리, 다이어리 글, 피드 기록</Text>
                  <Text style={styles.warningText}>• 친구, 팔로워 및 내 프로필 정보</Text>
                  <Text style={styles.warningText}>• 방문 국가 기록 및 배지 통계 자료</Text>
                </View>
                
                <TouchableOpacity
                  style={styles.checkboxRow}
                  activeOpacity={0.7}
                  onPress={() => setDeleteConsent(!deleteConsent)}
                >
                  <View style={[styles.checkbox, deleteConsent && styles.checkboxActive]}>
                    {deleteConsent && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>유의사항을 확인했으며, 계정 삭제에 동의합니다.</Text>
                </TouchableOpacity>

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={closeDeleteAccountModal}
                  >
                    <Text style={styles.modalBtnTextCancel}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: COLORS.red }, !deleteConsent && styles.modalBtnDisabled]}
                    disabled={!deleteConsent}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>다음</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 2: 탈퇴 사유 수집 */}
            {deleteStep === 2 && (
              <View>
                <Text style={styles.modalDesc}>탈퇴하시려는 사유를 알려주시면 서비스 개선에 큰 도움이 됩니다.</Text>
                
                <View style={styles.radioGroup}>
                  {['이용 방법이 어려움', '기록할 일이 별로 없음', '개인정보 보호 우려', '기타 (직접 입력)'].map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={styles.radioOption}
                      activeOpacity={0.7}
                      onPress={() => setDeleteReason(reason)}
                    >
                      <View style={[styles.radioCircle, deleteReason === reason && styles.radioCircleActive]}>
                        {deleteReason === reason && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {deleteReason === '기타 (직접 입력)' && (
                  <TextInput
                    style={[styles.modalInput, { marginTop: 10 }]}
                    placeholder="탈퇴 사유를 적어주세요."
                    placeholderTextColor={COLORS.textMuted}
                    value={deleteReasonDetail}
                    onChangeText={setDeleteReasonDetail}
                  />
                )}

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setDeleteStep(1)}
                  >
                    <Text style={styles.modalBtnTextCancel}>이전</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: COLORS.red }, !deleteReason && styles.modalBtnDisabled]}
                    disabled={!deleteReason}
                    onPress={() => setDeleteStep(3)}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>다음</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 3: 보안 비밀번호 확인 */}
            {deleteStep === 3 && (
              <View>
                <Text style={styles.modalDesc}>마지막 단계입니다. 본인 인증을 위해 아래 항목을 완료해주세요.</Text>
                <Text style={styles.modalDesc}>탈퇴 후 {DELETION_GRACE_DAYS}일 이내에 다시 로그인하면 계정이 복구되며, 기간이 지나면 모든 기록이 영구 삭제됩니다.</Text>
                
                {signUpMethod === 'email' ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>현재 비밀번호 입력</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="비밀번호를 입력하세요"
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                    />
                  </View>
                ) : (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>본인 확인을 위해 아래 입력칸에 '탈퇴하기'를 적어주세요.</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="탈퇴하기"
                      placeholderTextColor={COLORS.textMuted}
                      value={deleteSocialConfirm}
                      onChangeText={setDeleteSocialConfirm}
                    />
                  </View>
                )}

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={styles.modalBtnTextCancel}>이전</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalBtn,
                      styles.modalBtnSubmit,
                      { backgroundColor: COLORS.red },
                      ((signUpMethod === 'email' && !deletePassword) || (signUpMethod !== 'email' && deleteSocialConfirm !== '탈퇴하기')) && styles.modalBtnDisabled
                    ]}
                    disabled={(signUpMethod === 'email' && !deletePassword) || (signUpMethod !== 'email' && deleteSocialConfirm !== '탈퇴하기')}
                    onPress={submitDeleteAccount}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>영구 탈퇴</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      </Modal>
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
  
  // 비밀번호 변경 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 12,
    color: COLORS.textDim,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDim,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 14,
  },
  modalInputError: {
    borderColor: COLORS.red,
  },
  inputErrorText: {
    fontSize: 11,
    color: COLORS.red,
    marginTop: 4,
    marginLeft: 2,
  },
  modalBtnGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  modalBtnSubmit: {
    backgroundColor: COLORS.purpleNeon,
  },
  modalBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
  modalBtnTextCancel: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnTextSubmit: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: '600',
  },
  
  // 계정 삭제 디테일 스타일
  warningBox: {
    backgroundColor: COLORS.redBg,
    borderColor: COLORS.redBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  warningText: {
    fontSize: 11,
    color: COLORS.red,
    lineHeight: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.red,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    color: COLORS.textDim,
    flex: 1,
    lineHeight: 16,
  },
  
  // 라디오 그룹
  radioGroup: {
    gap: 12,
    marginBottom: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.red,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.red,
  },
  radioLabel: {
    fontSize: 13,
    color: COLORS.white,
  },

  // 성별 선택 버튼
  genderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  genderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  genderBtnActive: {
    borderColor: COLORS.purpleNeon,
    backgroundColor: COLORS.purpleBg,
  },
  genderText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textDim,
  },
  genderTextActive: {
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
});
