import React, { useState, useRef, useEffect } from 'react';
import { warn } from '../utils/haptics';
import { isKoreanLang, isJapaneseLang, isTraditionalChineseLang, spanishVariant, isFrenchLang } from '../utils/langKind';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { CameraIcon, LockClosedIcon } from '../components/icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import DefaultAvatar from '../components/DefaultAvatar';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import Toast from '../components/Toast';
import { useProfileSettings, useSettingsActions } from '../store/settingsStore';
import { isHandleAvailable } from '../services/profile';
import RequirementList from '../components/RequirementList';
import { andFitText } from '../utils/fitText';
import { AutoPillRing } from '../components/record/CalendarBottomSheet';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingsField,
  SettingsPillButton,
  settingsText,
} from '../components/settings/SettingsUI';

import type { RootStackScreenProps } from '../navigation/types';

// 아이디(handle) 형식: 영문/숫자/_ 4~30자
const HANDLE_RE = /^[a-zA-Z0-9_]{4,30}$/;

// 아이디 중복 검사 디바운스 — 온보딩(BasicInfoScreen)과 같은 값으로 맞춘다.
const HANDLE_CHECK_DEBOUNCE_MS = 500;

const PROFILE_MEDIA_DIR = 'profile/';

// 프로필 사진을 documentDirectory로 복사해 OS 캐시 정리 후에도 유지한다
// (MomentCaptureScreen의 persistMomentPhoto와 같은 패턴 — 피커가 준 캐시 URI를 그대로 영속하면
//  며칠 뒤 아바타가 통째로 사라진다). 복사 실패 시엔 기존 컨벤션대로 원본 URI를 그대로 쓴다.
async function persistProfilePhoto(srcUri: string): Promise<string> {
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const base = FileSystem.documentDirectory;
    if (base) {
      const dir = `${base}${PROFILE_MEDIA_DIR}`;
      try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* 이미 존재 */ }
      const ext = (srcUri.split('?')[0].match(/\.(jpg|jpeg|png|webp|heic)$/i)?.[1] || 'jpg').toLowerCase();
      const to = `${dir}profile-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: srcUri, to });
      return to;
    }
  } catch { /* 복사 실패 → 원본 URI 유지 */ }
  return srcUri;
}

const COLORS = {
  ...SETTINGS_COLORS,
  card:         '#2E2E3B', // 아바타 카메라 배지(프로필 탭 아바타와 같은 모양 유지)
};

export default function EditProfileScreen({ navigation }: RootStackScreenProps<'EditProfile'>) {
  const { t, i18n } = useTranslation();
  const { handle: globalHandle, bio: globalBio, profilePhoto: globalProfilePhoto, handleLastChanged } = useProfileSettings();
  const { setHandle: setGlobalHandle, setBio: setGlobalBio, setProfilePhoto: setGlobalProfilePhoto, setHandleLastChanged, setHandleChosen } = useSettingsActions();

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const timeSinceLastChange = handleLastChanged ? Date.now() - handleLastChanged : null;
  const canChangeHandle = !handleLastChanged || (timeSinceLastChange !== null && timeSinceLastChange >= TWO_WEEKS_MS);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(globalProfilePhoto);
  const [handle, setHandle] = useState(globalHandle);
  const [bio, setBio] = useState(globalBio);
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 저장 재진입 가드 — setSaving은 비동기 반영이라 연타 사이에 늦어, 판정은 ref로 한다.
  const savingRef = useRef(false);
  // 저장 후 뒤로가기 예약 타이머 + 1회 보장 플래그(수동 뒤로가기와 겹쳐 아래 화면까지 팝되는 것 방지)
  const goBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wentBackRef = useRef(false);

  // 아이디 입력 조건 — 온보딩(BasicInfoScreen)과 같은 규칙. 저장을 누른 뒤 알림으로
  // 지적하는 대신 조건을 먼저 보여주고 충족되면 밝아진다(components/RequirementList).
  // 단 여기선 **아이디를 실제로 바꾸는 중일 때만** 띄운다 — 칸에 현재 아이디가 이미 채워져
  // 있어서, 안 바꾸는데도 체크 세 줄이 늘 켜져 있으면 잔소리로만 보인다.
  const trimmedHandle = handle.trim();
  const handleChanged = trimmedHandle !== globalHandle;
  const handleFormatOk = HANDLE_RE.test(trimmedHandle);
  const showHandleRequirements = canChangeHandle && handleChanged;

  // 중복 검사 상태 — 'idle'은 아직 서버를 부르지 않은 상태, 'unknown'은 검사 불가
  // (미설정·오프라인·타임아웃). 둘 다 줄을 감춘다. 최종 방어는 handleSave의 제출 시점
  // 검사와 profiles.handle UNIQUE 제약이 그대로 맡는다.
  const [handleAvail, setHandleAvail] =
    useState<'idle' | 'checking' | 'available' | 'taken' | 'unknown'>('idle');

  useEffect(() => {
    // 안 바꾸는 중이거나 형식부터 틀렸으면 서버를 부르지 않는다.
    if (!showHandleRequirements || !handleFormatOk) {
      setHandleAvail('idle');
      return;
    }
    let cancelled = false;
    setHandleAvail('checking');
    // 입력이 바뀌면 이전 타이머와 응답을 모두 버려서, 늦게 온 옛 응답이 최신 결과를
    // 덮어쓰지 못하게 한다(순서 뒤바뀜 방지).
    const timer = setTimeout(() => {
      void isHandleAvailable(trimmedHandle).then((avail) => {
        if (cancelled) return;
        setHandleAvail(avail === null ? 'unknown' : avail ? 'available' : 'taken');
      });
    }, HANDLE_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedHandle, showHandleRequirements, handleFormatOk]);

  const handleRequirements = [
    {
      key: 'length',
      label: t('basicInfo.handleReqLength'),
      met: trimmedHandle.length >= 4 && trimmedHandle.length <= 30,
    },
    {
      key: 'charset',
      label: t('basicInfo.handleReqCharset'),
      met: trimmedHandle.length > 0 && /^[a-zA-Z0-9_]+$/.test(trimmedHandle),
    },
    ...(handleAvail === 'idle' || handleAvail === 'unknown'
      ? []
      : [
          {
            key: 'available',
            label:
              handleAvail === 'checking'
                ? t('basicInfo.handleReqChecking')
                : handleAvail === 'taken'
                  ? t('basicInfo.handleReqTaken')
                  : t('basicInfo.handleReqAvailable'),
            met: handleAvail === 'available',
            pending: handleAvail === 'checking',
            failed: handleAvail === 'taken',
          },
        ]),
  ];

  // 언마운트 시 예약된 타이머 정리 — 남겨두면 이미 떠난 화면에서 goBack이 한 번 더 돈다.
  useEffect(() => {
    wentBackRef.current = false; // 재마운트 시 잠금이 남아 뒤로가기가 막히지 않게 초기화
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (goBackTimer.current) clearTimeout(goBackTimer.current);
      wentBackRef.current = true; // 화면이 사라진 뒤의 잔여 콜백은 무효화
    };
  }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  // 뒤로가기는 어떤 경로로든 딱 한 번만 (예약 타이머 · 수동 탭 공용)
  const goBackOnce = () => {
    if (wentBackRef.current) return;
    wentBackRef.current = true;
    navigation.goBack();
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
      // 피커 캐시 URI를 그대로 두면 OS가 캐시를 비울 때 아바타가 사라진다 → 앱 문서함으로 복사
      setProfilePhoto(await persistProfilePhoto(result.assets[0].uri));
    }
  };

  const handleSave = async () => {
    // 아이디 미변경 경로는 await가 없어 예전 saving 상태 가드를 그대로 통과했다 —
    // 연타하면 goBack 예약이 두 번 걸려 아래 화면까지 팝됐다. ref로 즉시 잠근다.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    let exitScheduled = false;
    try {
      if (!handle.trim()) {
        Alert.alert(t('editProfile.noticeTitle'), t('editProfile.handleEmpty'));
        return;
      }

      // trimmedHandle·handleChanged는 위(조건 목록과 공용)에서 이미 계산한 값을 쓴다.
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
        const avail = await isHandleAvailable(trimmedHandle);
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
      exitScheduled = true; // 이동이 예약됐으니 잠금은 풀지 않는다(중복 저장·중복 팝 방지)
      goBackTimer.current = setTimeout(goBackOnce, 1000);
    } finally {
      // 검증 실패로 화면에 머무는 경로에서만 다시 저장할 수 있게 잠금 해제
      if (!exitScheduled) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 — 오른쪽 슬롯에 앱 공용 저장 알약(블로그·스트립 정보 헤더와 같은 70×30·흰 10%·AutoPillRing).
          링(AutoPillRing) → 콘텐츠 순. 폭은 문구(다국어)마다 달라져 AutoPillRing이 스스로 실측한다 */}
      <SettingsHeader
        title={t('editProfile.title')}
        onBack={goBackOnce}
        backA11yLabel={t('editProfile.back')}
        right={
          <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
            <View style={[s.saveBtn, saving && s.saveBtnBusy]}>
              <AutoPillRing />
              <Text style={s.saveText} {...andFitText}>{t('editProfile.save')}</Text>
            </View>
          </TouchableOpacity>
        }
      />

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
          {/* 프로필 사진 — 프로필 탭과 동일한 아바타 디자인(사진 있으면 글래스 틴트, 없으면 공용 DefaultAvatar) */}
          <View style={s.avatarSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={s.avatarWrap}>
              <View style={s.avatarRing}>
                {profilePhoto ? (
                  <>
                    <Image source={{ uri: profilePhoto }} style={s.avatarImg} />
                    {/* 새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다 */}
                    <View style={s.avatarInner} pointerEvents="none">
                      <Svg width={110} height={110} viewBox="0 0 111 111" fill="none">
                        <Defs>
                          <SvgLinearGradient id="editAvatarInnerGrad" x1="74" y1="48.5" x2="99.5" y2="95.5" gradientUnits="userSpaceOnUse">
                            <Stop stopColor="#000000" stopOpacity="0" />
                            <Stop offset="1" stopColor="#FFFFFF" />
                          </SvgLinearGradient>
                        </Defs>
                        <Circle cx="55.5" cy="55.5" r="55" fill="#751AAD" fillOpacity="0.1" stroke="url(#editAvatarInnerGrad)" strokeWidth="0.5" />
                      </Svg>
                    </View>
                  </>
                ) : (
                  // 기본 프사 — 프로필 탭과 동일하게 공용 DefaultAvatar(120, 사진 크기와 동일)만 (컬러 링·보라 틴트 폐지, 2026-10 시안)
                  <DefaultAvatar size={120} />
                )}
              </View>
              <View style={s.cameraIcon}>
                <CameraIcon size={14} color="#A1A1B0" />
              </View>
            </TouchableOpacity>
            <Text style={s.avatarHint}>{t('editProfile.avatarHint')}</Text>
            {profilePhoto && (
              <TouchableOpacity
                onPress={() => {
                  warn(); // 되돌릴 수 없는 동작을 묻는 중
                  Alert.alert(t('editProfile.removePhoto'), t('editProfile.removePhotoMsg'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('editProfile.delete'), style: 'destructive', onPress: () => setProfilePhoto(null) },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.removePhotoText}>{t('editProfile.removePhoto')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 아이디 */}
          <View style={s.fieldGroup}>
            <Text style={settingsText.fieldLabel}>{t('editProfile.handleLabel')}</Text>
            <SettingsField style={!canChangeHandle && s.fieldLocked}>
              <Text style={s.atPrefix}>@</Text>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={[settingsText.input, !canChangeHandle && s.inputDisabled]}
                value={handle}
                onChangeText={(text) => setHandle(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder={t('editProfile.handlePlaceholder')}
                placeholderTextColor={COLORS.text50}
                maxLength={30}
                autoCorrect={false}
                autoCapitalize="none"
                editable={canChangeHandle}
              />
              {canChangeHandle && <Text style={s.charCount}>{handle.length}/30</Text>}
            </SettingsField>
            {showHandleRequirements && (
              <RequirementList items={handleRequirements} style={s.reqList} />
            )}
            {!canChangeHandle && (
              <View style={s.lockNoticeRow}>
                <LockClosedIcon size={11} color="#FFB800" />
                <Text style={s.lockNotice}>
                  {t('editProfile.lockNotice', {
                    date: new Date(handleLastChanged! + TWO_WEEKS_MS).toLocaleDateString(
                      // 날짜만큼은 언어별 로케일이 있다(Intl이 '2026年9月19日'로 조립해 준다).
                      // zh-Hant 는 대만 표기가 기준이라 'zh-TW'(zh-Hant.STYLE.md 서두).
                      // 스페인어는 앱 언어 코드를 그대로 Intl 에 넘긴다 — 'es-419'·'es-ES' 둘 다
                      // 유효한 BCP-47 이고 노드 ICU 에서 「19 de septiembre de 2026」로 나오는 것을 확인했다.
                      isKoreanLang(i18n.language) ? 'ko-KR'
                        : isJapaneseLang(i18n.language) ? 'ja-JP'
                        : isTraditionalChineseLang(i18n.language) ? 'zh-TW'
                        : spanishVariant(i18n.language) === 'ES' ? 'es-ES'
                        : spanishVariant(i18n.language) === '419' ? 'es-419'
                        // 앱 코드는 'fr' 하나지만 Intl 에는 지역을 붙인 'fr-FR' 를 넘긴다
                        // (「19 septembre 2026」 — 맨 'fr' 도 같은 결과지만 의도를 명시해 둔다).
                        : isFrenchLang(i18n.language) ? 'fr-FR'
                        : 'en-US',
                      { year: 'numeric', month: 'long', day: 'numeric' }
                    ),
                  })}
                </Text>
              </View>
            )}
          </View>

          {/* 소개 */}
          <View style={s.fieldGroup}>
            <Text style={settingsText.fieldLabel}>{t('editProfile.bioLabel')}</Text>
            <SettingsField>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={[settingsText.input, s.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder={t('editProfile.bioPlaceholder')}
                placeholderTextColor={COLORS.text50}
                maxLength={50}
                multiline
                textAlignVertical="top"
              />
            </SettingsField>
            <Text style={s.charCountBelow}>{bio.length}/50</Text>
          </View>

          {/* 저장 버튼 (하단 대형) — 설정 알약. 저장 중엔 잠기고 흐려진다 */}
          <SettingsPillButton
            label={saving ? t('editProfile.checking') : t('editProfile.saveLarge')}
            onPress={handleSave}
            disabled={saving}
            style={s.saveLargeBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 토스트 문구는 showToast(msg)가 넘긴 값을 그대로 쓴다(고정 문구 하드코딩 제거) */}
      <Toast visible={toastVisible} message={toastMsg} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 헤더 오른쪽 저장 — 앱 공용 저장 알약(BlogRecordScreen st.saveBtn과 같은 값): 70×30·반경 15·바탕 흰 10%,
  // 테두리는 AutoPillRing이 그리므로 borderWidth 없음(링 실측이 밀린다). minWidth라 긴 번역도 잘리지 않는다.
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    minWidth: 70,
    height: 30,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnBusy: { opacity: 0.5 },
  saveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C3C3C3',
  },

  // 스크롤 — 좌우 16 = 설정 화면 카드 폭
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
  // 프로필 탭 아바타와 동일 치수 (링 128 / 아바타 120 / 글래스 오버레이 110)
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarInner: {
    position: 'absolute',
    top: 9,
    left: 9,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.text50,
  },
  removePhotoText: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.red,
  },

  // 입력 필드 — 칸은 SettingsField(설정 카드 재질), 라벨은 settingsText.fieldLabel(흰 50%)
  fieldGroup: {
    marginBottom: 20,
  },
  atPrefix: {
    fontSize: 14,
    color: COLORS.text50,
    marginRight: 2,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.text50,
    marginLeft: 8,
  },
  charCountBelow: {
    fontSize: 11,
    color: COLORS.text50,
    textAlign: 'right',
    marginTop: 6,
    marginRight: 17,
  },
  // 여러 줄 소개 — settingsText.input의 세로 15를 12로 줄이고 높이를 104로 해서 글 영역 80(예전 칸 안쪽 높이)을 지킨다.
  // 칸(SettingsField)은 높이를 따라 늘어나며, 글은 위에서부터(textAlignVertical top) 채워진다.
  bioInput: {
    height: 104,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },

  // 하단 저장 알약
  saveLargeBtn: {
    marginTop: 12,
  },
  // 아이디 변경 잠금(2주) — 칸 전체를 흐리게
  fieldLocked: {
    opacity: 0.6,
  },
  inputDisabled: {
    color: '#4A4A59',
  },
  reqList: {
    marginTop: 8,
    marginLeft: 17,
  },
  // 안내가 두 줄로 넘어갈 수 있어 아이콘은 첫 줄에 맞춰 위쪽 고정
  lockNoticeRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
    marginLeft: 17,
    paddingTop: 1,
  },
  lockNotice: {
    flex: 1,
    fontSize: 11,
    color: '#FFB800',
    lineHeight: 15,
  },
});
