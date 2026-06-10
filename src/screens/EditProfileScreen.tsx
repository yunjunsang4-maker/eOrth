import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { CameraIcon } from '../components/icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from '../components/Toast';
import { useSettings } from '../store/settingsStore';

import type { RootStackScreenProps } from '../navigation/types';

const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  cardLight:    '#1E1E2E',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

export default function EditProfileScreen({ navigation }: RootStackScreenProps<'EditProfile'>) {
  const {
    nickname: globalNickname,
    setNickname: setGlobalNickname,
    handle: globalHandle,
    setHandle: setGlobalHandle,
    bio: globalBio,
    setBio: setGlobalBio,
    profilePhoto: globalProfilePhoto,
    setProfilePhoto: setGlobalProfilePhoto,
    handleLastChanged,
    setHandleLastChanged,
  } = useSettings();

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const timeSinceLastChange = handleLastChanged ? Date.now() - handleLastChanged : null;
  const canChangeHandle = !handleLastChanged || (timeSinceLastChange !== null && timeSinceLastChange >= TWO_WEEKS_MS);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(globalProfilePhoto);
  const [nickname, setNickname] = useState(globalNickname);
  const [handle, setHandle] = useState(globalHandle);
  const [bio, setBio] = useState(globalBio);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  const pickImage = async () => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      if (!canAskAgain) {
        Alert.alert(
          '갤러리 접근 권한 필요',
          '설정에서 갤러리 접근을 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정으로 이동', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!handle.trim()) {
      Alert.alert('알림', '아이디를 입력해주세요.');
      return;
    }
    
    const trimmedHandle = handle.trim();
    if (trimmedHandle !== globalHandle) {
      if (!canChangeHandle) {
        Alert.alert('알림', '아이디 변경 가능 기간이 아닙니다.');
        return;
      }
      setGlobalHandle(trimmedHandle);
      setHandleLastChanged(Date.now());
    }

    // Save to global context
    setGlobalNickname(nickname.trim());
    setGlobalBio(bio.trim());
    setGlobalProfilePhoto(profilePhoto);

    showToast('프로필이 저장되었어요');
    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  };

  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>프로필 편집</Text>
        <TouchableOpacity style={s.saveBtn} activeOpacity={0.7} onPress={handleSave}>
          <Text style={s.saveText}>저장</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 프로필 사진 */}
          <View style={s.avatarSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={s.avatarWrap}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={s.avatarImg} />
              ) : (
                <View style={s.avatarPlaceholder}>
                  <Text style={s.avatarText}>
                    {nickname.trim() ? nickname.trim().charAt(0) : (handle.trim() ? handle.trim().charAt(0) : '?')}
                  </Text>
                </View>
              )}
              <View style={s.cameraIcon}>
                <CameraIcon size={14} color="#A1A1B0" />
              </View>
            </TouchableOpacity>
            <Text style={s.avatarHint}>탭하여 사진 변경</Text>
            {profilePhoto && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('사진 삭제', '프로필 사진을 삭제할까요?', [
                    { text: '취소', style: 'cancel' },
                    { text: '삭제', style: 'destructive', onPress: () => setProfilePhoto(null) },
                  ])
                }
                activeOpacity={0.7}
              >
                <Text style={s.removePhotoText}>사진 삭제</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 닉네임 */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>닉네임</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="닉네임을 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={20}
                autoCorrect={false}
              />
              <Text style={s.charCount}>{nickname.length}/20</Text>
            </View>
          </View>

          {/* 아이디 */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>아이디</Text>
            <View style={[s.inputWrap, !canChangeHandle && s.inputWrapDisabled]}>
              <Text style={s.atPrefix}>@</Text>
              <TextInput
                style={[s.input, { flex: 1 }, !canChangeHandle && s.inputDisabled]}
                value={handle}
                onChangeText={(text) => setHandle(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="영문, 숫자, _만 사용 가능"
                placeholderTextColor={COLORS.textMuted}
                maxLength={30}
                autoCorrect={false}
                autoCapitalize="none"
                editable={canChangeHandle}
              />
              {canChangeHandle && <Text style={s.charCount}>{handle.length}/30</Text>}
            </View>
            {!canChangeHandle && (
              <Text style={s.lockNotice}>
                🔒 아이디는 2주에 한 번만 변경할 수 있습니다. (
                {(() => {
                  const d = new Date(handleLastChanged! + TWO_WEEKS_MS);
                  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                })()} 이후 변경 가능)
              </Text>
            )}
          </View>

          {/* 소개 */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>소개</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={[s.input, s.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="간단한 자기소개를 작성해보세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={100}
                multiline
                textAlignVertical="top"
              />
            </View>
            <Text style={s.charCountBelow}>{bio.length}/100</Text>
          </View>

          {/* 저장 버튼 (하단 대형) */}
          <TouchableOpacity style={s.saveLargeBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={s.saveLargeText}>저장하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Toast visible={toastVisible} message="프로필이 저장되었어요" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  },
  backIcon: {
    fontSize: 30,
    color: COLORS.white,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 8,
  },
  saveText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },

  // 스크롤
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },

  // 아바타
  avatarSection: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 32,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconText: {
    fontSize: 14,
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textDim,
  },
  removePhotoText: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.red,
  },

  // 입력 필드
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    padding: 0,
  },
  atPrefix: {
    fontSize: 14,
    color: COLORS.textDim,
    marginRight: 2,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  charCountBelow: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 4,
    marginRight: 4,
  },
  bioInput: {
    height: 80,
    textAlignVertical: 'top',
  },

  // 선택 버튼
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectBtnText: {
    fontSize: 14,
    color: COLORS.white,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },

  // 하단 저장 버튼
  saveLargeBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveLargeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  inputWrapDisabled: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.03)',
    opacity: 0.6,
  },
  inputDisabled: {
    color: '#4A4A59',
  },
  lockNotice: {
    fontSize: 11,
    color: '#FFB800',
    marginTop: 6,
    marginLeft: 4,
  },
});
