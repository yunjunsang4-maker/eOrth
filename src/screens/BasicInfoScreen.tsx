import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '../store/settingsStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { PersonIcon, PencilIcon } from '../components/icons';
import { COUNTRIES, type Country } from '../constants/countries';

const { width } = Dimensions.get('window');

const codeOf = (c: Country) => c.term.split(' ')[0].toUpperCase();
const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => codeOf(c) === 'KR') ?? COUNTRIES[0];

type Props = RootStackScreenProps<'BasicInfo'>;

export default function BasicInfoScreen({ navigation }: Props) {
  const { nickname: storeNickname, setNickname: setStoreNickname, setProfilePhoto, profilePhoto, homeCountryCode, setHomeCountryCode } = useSettings();
  const [nickname, setNickname] = useState(storeNickname || '');
  const [photo, setPhoto] = useState<string | null>(profilePhoto || null);
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find((c) => codeOf(c) === homeCountryCode) ?? DEFAULT_COUNTRY
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Sync state if storeNickname updates (e.g. from social login)
  React.useEffect(() => {
    if (storeNickname) {
      setNickname(storeNickname);
    }
  }, [storeNickname]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showPermissionDeniedAlert('갤러리');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleFinish = () => {
    setStoreNickname(nickname.trim());
    setProfilePhoto(photo);
    setHomeCountryCode(codeOf(selectedCountry));
    navigation.navigate('TravelImport');
  };

  const canContinue = nickname.trim().length > 0;

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.stepText}>STEP 1 / 2</Text>
            <Text style={styles.title}>나의 정보</Text>
            <Text style={styles.subtitle}>eOrth에서 사용할 닉네임과 거주국가를 설정해주세요</Text>
          </View>

          {/* Avatar Placeholder */}
          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8} onPress={pickImage}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={['#3B1E8E', '#7B61FF']}
                style={styles.avatar}
              >
                <PersonIcon size={28} color="#FFFFFF" />
              </LinearGradient>
            )}
            <View style={styles.avatarEditBadge}>
              <PencilIcon size={12} color="#A1A1B0" />
            </View>
          </TouchableOpacity>

          {/* Nickname Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>닉네임</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="닉네임을 입력하세요"
                placeholderTextColor={Colors.textMuted}
                value={nickname}
                onChangeText={setNickname}
                maxLength={16}
                autoCapitalize="none"
              />
              <Text style={styles.charCount}>{nickname.length}/16</Text>
            </View>
          </View>

          {/* 거주국가 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>거주국가</Text>
            <TouchableOpacity
              style={styles.inputWrapper}
              activeOpacity={0.8}
              onPress={() => { setCountrySearch(''); setCountryModalVisible(true); }}
            >
              <Text style={[styles.input, { paddingVertical: 16 }]}>
                {selectedCountry.flag} {selectedCountry.name}
              </Text>
              <Text style={styles.charCount}>변경</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.bottomCTA}>
          <PrimaryButton
            label="다음"
            onPress={handleFinish}
            disabled={!canContinue}
            style={styles.doneBtn}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={countryModalVisible} animationType="slide" onRequestClose={() => setCountryModalVisible(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>거주국가 선택</Text>
            <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
              <Text style={styles.modalClose}>닫기</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="국가 검색 (예: 한국, japan)"
            placeholderTextColor={Colors.textMuted}
            value={countrySearch}
            onChangeText={setCountrySearch}
            autoFocus
          />
          <FlatList
            data={countrySearch.trim()
              ? COUNTRIES.filter((c) => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
              : COUNTRIES}
            keyExtractor={(c) => c.term}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { setSelectedCountry(item); setCountryModalVisible(false); setCountrySearch(''); }}
              >
                <Text style={styles.modalItemText}>{item.flag} {item.name}</Text>
                {codeOf(item) === codeOf(selectedCountry) && <Text style={styles.modalItemCheck}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    paddingTop: 80,
    paddingHorizontal: Spacing[6],
    paddingBottom: 120,
  },
  header: {
    marginBottom: Spacing[8],
  },
  stepText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing[2],
  },
  title: {
    fontSize: Typography.fontSize['3xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Avatar
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: Spacing[8],
    position: 'relative',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 36 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: Colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Input
  inputSection: { marginBottom: Spacing[6] },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing[2],
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing[4],
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: 16,
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },

  // Tags style removed

  // Bottom
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 48,
    paddingTop: Spacing[4],
    backgroundColor: 'rgba(10,1,24,0.95)',
  },
  doneBtn: { width: '100%' },

  // Modal
  modalRoot: { flex: 1, backgroundColor: '#0A0118', paddingTop: 60 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  modalTitle: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  modalClose: { fontSize: Typography.fontSize.base, color: Colors.primary, fontFamily: Typography.fontFamily.medium },
  modalSearch: { marginHorizontal: Spacing[6], marginBottom: Spacing[3], backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12, fontSize: Typography.fontSize.base },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalItemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  modalItemCheck: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: 'bold' },
});
