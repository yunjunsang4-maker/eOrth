import React, { useMemo, useState } from 'react';
import { View, Modal, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, TextInput } from '../ui/Text';
import { COUNTRIES, type Country } from '../constants/countries';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { STAGE_MAX_W } from '../utils/stage';
import { select } from '../utils/haptics';

/**
 * 국가 선택 모달 — 국기·국가명 목록에서 고른다. 검색 지원.
 *
 * 온보딩(BasicInfoScreen)에만 있던 선택 UI를 여기로 뽑았다. 설정 화면은 원래
 * **국가 코드 2자리를 직접 타이핑**하게 했는데(“예: KR, US, JP”), 같은 값을 정하면서
 * 한쪽은 목록이고 한쪽은 사용자가 자기 나라의 ISO 코드를 알아야 하는 상태였다.
 * 두 화면이 이 컴포넌트를 함께 쓴다.
 *
 * 코드는 `term`의 첫 토큰이 ISO 2자다(constants/countries.ts). 저장은 호출부가 한다 —
 * 이 컴포넌트는 고른 Country를 그대로 넘길 뿐이라 거주국·체류국 어느 쪽에도 쓸 수 있다.
 */
export const countryCodeOf = (c: Country) => c.term.split(' ')[0].toUpperCase();

export default function CountryPickerModal({
  visible,
  onClose,
  onSelect,
  title,
  searchPlaceholder,
  selectedCode,
  excludeCodes,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
  title: string;
  searchPlaceholder: string;
  /** 체크(✓) 표시할 현재 값. ISO 2자 */
  selectedCode?: string;
  /** 목록에서 뺄 코드들 — 체류국 선택에서 거주국을 제외하는 식으로 쓴다 */
  excludeCodes?: string[];
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const ex = new Set((excludeCodes ?? []).map((c) => c.toUpperCase()));
    const base = ex.size ? COUNTRIES.filter((c) => !ex.has(countryCodeOf(c))) : COUNTRIES;
    const q = search.trim();
    if (!q) return base;
    // 한글 이름과 term(코드+영문명) 양쪽으로 찾는다 — 'kr'·'korea'·'대한'이 모두 걸린다
    return base.filter((c) => c.name.includes(q) || c.term.toLowerCase().includes(q.toLowerCase()));
  }, [search, excludeCodes]);

  const close = () => { setSearch(''); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      {/* 검색 TextInput이 autoFocus라 열리자마자 키보드가 올라온다 — KAV 없이는
          안드로이드에서 목록 하단이 키보드에 그대로 먹힌다. */}
      {/* 안드로이드는 상태바 높이가 기기별로 달라 인셋 기반으로 상단 여백 보정 (iOS 60은 노치 기준) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[s.root, Platform.OS === 'android' && { paddingTop: insets.top + 12 }]}
        accessibilityViewIsModal
      >
        {/* RN Modal은 App.tsx 루트 클램프 밖이라 콘텐츠 폭을 여기서 다시 가둔다.
            root(불투명 페이지 배경)는 전면 유지 — 좁히면 양옆이 모달 기본 배경이 된다. */}
        <View style={s.clamp}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Text style={s.close}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            cursorColor="#BF85FC"
            selectionHandleColor="#BF85FC"
            style={s.search}
            placeholder={searchPlaceholder}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={data}
            keyExtractor={(c) => c.term}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = !!selectedCode && countryCodeOf(item) === selectedCode.toUpperCase();
              return (
                <TouchableOpacity
                  style={s.item}
                  onPress={() => { select(); onSelect(item); setSearch(''); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={item.name}
                >
                  {/* 국기·국가명을 한 Text에 합치지 말 것 — 삼성 기기에서 한글이 사라진다(6ae35f9) */}
                  <View style={s.valueRow}>
                    <Text style={s.itemText}>{item.flag}</Text>
                    <Text style={s.itemText}>{item.name}</Text>
                  </View>
                  {on && <Text style={s.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0B0F', paddingTop: 60 },
  clamp: { flex: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  title: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  close: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontFamily: Typography.fontFamily.medium },
  search: {
    marginHorizontal: Spacing[6], marginBottom: Spacing[3],
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12,
    fontSize: Typography.fontSize.base,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[6], paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  itemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  check: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontWeight: 'bold' },
});
