import React, { useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { CameraIcon } from '../components/icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import Toast from '../components/Toast';
import { useSettings } from '../store/settingsStore';
import { isHandleAvailable } from '../services/profile';

import type { RootStackScreenProps } from '../navigation/types';

// 아이디(handle) 형식: 영문/숫자/_ 4~30자
const HANDLE_RE = /^[a-zA-Z0-9_]{4,30}$/;

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
  textMuted:    '#8B8B9E',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

export default function EditProfileScreen({ navigation }: RootStackScreenProps<'EditProfile'>) {
  const { t, i18n } = useTranslation();
  const {
    handle: globalHandle,
    setHandle: setGlobalHandle,
    bio: globalBio,
    setBio: setGlobalBio,
    profilePhoto: globalProfilePhoto,
    setProfilePhoto: setGlobalProfilePhoto,
    handleLastChanged,
    setHandleLastChanged,
    setHandleChosen,
  } = useSettings();

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const timeSinceLastChange = handleLastChanged ? Date.now() - handleLastChanged : null;
  const canChangeHandle = !handleLastChanged || (timeSinceLastChange !== null && timeSinceLastChange >= TWO_WEEKS_MS);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(globalProfilePhoto);
  const [handle, setHandle] = useState(globalHandle);
  const [bio, setBio] = useState(globalBio);
  const [saving, setSaving] = useState(false);
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
          t('editProfile.galleryPermTitle'),
          t('editProfile.galleryPermMsg'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('editProfile.goToSettings'), onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert(t('editProfile.permNeededTitle'), t('editProfile.permNeededMsg'));
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

  const handleSave = async () => {
    if (saving) return;
    if (!handle.trim()) {
      Alert.alert(t('editProfile.noticeTitle'), t('editProfile.handleEmpty'));
      return;
    }

    const trimmedHandle = handle.trim();
    const handleChanged = trimmedHandle !== globalHandle;
    if (handleChanged) {
      if (!canChangeHandle) {
        Alert.alert(t('editProfile.noticeTitle'), t('editProfile.handleChangeBlocked'));
        return;
      }
      if (!HANDLE_RE.test(trimmedHandle)) {
        Alert.alert(t('editProfile.noticeTitle'), t('editProfile.handleInvalid'));
        return;
      }
      // 중복 검사(서버). null=검사 불가(미설정/오류)면 UNIQUE 제약을 최종 방어로 두고 통과.
      setSaving(true);
      const avail = await isHandleAvailable(trimmedHandle);
      setSaving(false);
      if (avail === false) {
        Alert.alert(t('editProfile.noticeTitle'), t('editProfile.handleTaken'));
        return;
      }
      setGlobalHandle(trimmedHandle);
      setHandleLastChanged(Date.now());
      setHandleChosen(true); // 사용자가 아이디를 직접 변경 → 충돌 시 임의 재생성 금지
    }

    // Save to global context
    setGlobalBio(bio.trim());
    setGlobalProfilePhoto(profilePhoto);

    showToast(t('editProfile.savedToast'));
    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  };

  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('editProfile.back')}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('editProfile.title')}</Text>
        <TouchableOpacity style={s.saveBtn} activeOpacity={0.7} onPress={handleSave} disabled={saving}>
          <Text style={s.saveText}>{t('editProfile.save')}</Text>
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
                    {handle.trim() ? handle.trim().charAt(0) : '?'}
                  </Text>
                </View>
              )}
              <View style={s.cameraIcon}>
                <CameraIcon size={14} color="#A1A1B0" />
              </View>
            </TouchableOpacity>
            <Text style={s.avatarHint}>{t('editProfile.avatarHint')}</Text>
            {profilePhoto && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(t('editProfile.removePhoto'), t('editProfile.removePhotoMsg'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('editProfile.delete'), style: 'destructive', onPress: () => setProfilePhoto(null) },
                  ])
                }
                activeOpacity={0.7}
              >
                <Text style={s.removePhotoText}>{t('editProfile.removePhoto')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 아이디 */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('editProfile.handleLabel')}</Text>
            <View style={[s.inputWrap, !canChangeHandle && s.inputWrapDisabled]}>
              <Text style={s.atPrefix}>@</Text>
              <TextInput
                style={[s.input, { flex: 1 }, !canChangeHandle && s.inputDisabled]}
                value={handle}
                onChangeText={(text) => setHandle(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder={t('editProfile.handlePlaceholder')}
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
                {t('editProfile.lockNotice', {
                  date: new Date(handleLastChanged! + TWO_WEEKS_MS).toLocaleDateString(
                    i18n.language === 'ko' ? 'ko-KR' : 'en-US',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  ),
                })}
              </Text>
            )}
          </View>

          {/* 소개 */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('editProfile.bioLabel')}</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={[s.input, s.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder={t('editProfile.bioPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                maxLength={100}
                multiline
                textAlignVertical="top"
              />
            </View>
            <Text style={s.charCountBelow}>{bio.length}/100</Text>
          </View>

          {/* 저장 버튼 (하단 대형) */}
          <TouchableOpacity style={[s.saveLargeBtn, saving && { opacity: 0.6 }]} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
            <Text style={s.saveLargeText}>{saving ? t('editProfile.checking') : t('editProfile.saveLarge')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Toast visible={toastVisible} message={t('editProfile.savedToast')} />
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
