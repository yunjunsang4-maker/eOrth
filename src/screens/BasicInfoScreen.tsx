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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { PersonIcon, PencilIcon } from '../components/icons';

const { width } = Dimensions.get('window');

const INTEREST_TAGS = ['자연', '음식', '역사', '문화', '액티비티', '도시', '해변', '산', '캠핑', '사진'];

interface Props {
  navigation: any;
}

export default function BasicInfoScreen({ navigation }: Props) {
  const [nickname, setNickname] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
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
            <Text style={styles.subtitle}>eOrth에서 사용할 닉네임을 설정해주세요</Text>
          </View>

          {/* Avatar Placeholder */}
          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8}>
            <LinearGradient
              colors={['#3B1E8E', '#7B61FF']}
              style={styles.avatar}
            >
              <PersonIcon size={28} color="#FFFFFF" />
            </LinearGradient>
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

          {/* Interest Tags */}
          <View style={styles.tagsSection}>
            <Text style={styles.inputLabel}>여행 관심사 (선택)</Text>
            <Text style={styles.tagsHint}>좋아하는 여행 스타일을 선택해주세요</Text>
            <View style={styles.tagsWrap}>
              {INTEREST_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  activeOpacity={0.8}
                  style={[
                    styles.tag,
                    selectedTags.includes(tag) && styles.tagActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      selectedTags.includes(tag) && styles.tagTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.bottomCTA}>
          <PrimaryButton
            label="완료"
            onPress={() => navigation.navigate('Main')}
            disabled={!canContinue}
            style={styles.doneBtn}
          />
        </View>
      </KeyboardAvoidingView>
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

  // Tags
  tagsSection: { marginBottom: Spacing[8] },
  tagsHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
    marginBottom: Spacing[3],
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  tagTextActive: { color: Colors.white },

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
});
