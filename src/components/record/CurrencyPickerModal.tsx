import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../../ui/Text';
import { useTranslation } from 'react-i18next';
import { SearchIcon as SvgSearchIcon } from '../icons';
import { useSkinAccent } from '../../constants/skinTheme';
import { STAGE_MAX_W } from '../../utils/stage';
import { OTHER_CURRENCIES, currencyName } from '../../constants/currencies';

/**
 * 기타 통화 선택 모달 — NewRecordScreen 에서 분리.
 * 통화 목록·표시 이름은 constants/currencies 가 단일 출처다
 * (BlogRecordScreen 과 배열을 각자 복제해 두다 항목 수가 어긋난 적이 있다).
 */
const COLORS = {
  white: '#FFFFFF',
  bg: '#0A0A0F',
  divider: '#1A1A26',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  purpleNeon: '#BF85FC',
};


export function CurrencyPickerModal({
  visible,
  search,
  onSearchChange,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  search: string;
  onSearchChange: (text: string) => void;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  return (
    <Modal
      visible={visible}
      transparent statusBarTranslucent navigationBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
        accessibilityViewIsModal
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[cs.currModalSheet, { borderTopColor: skinAccent.tint(0.2) }]}>
          <View style={cs.currModalHandle} />
          <Text style={cs.currModalTitle}>{t('blog.currencySelect')}</Text>
          <View style={cs.currModalSearchWrap}>
            <SvgSearchIcon size={14} color={COLORS.textDim} />
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
              style={cs.currModalSearchInput}
              value={search}
              onChangeText={onSearchChange}
              placeholder={t('blog.currencySearchPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
          </View>
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {/* 검색은 현재 언어로 보이는 이름을 대상으로 한다 — 영어 모드에서 'Euro'로 못 찾으면
                목록이 25줄뿐이어도 사용자는 없는 줄 알고 닫는다 */}
            {OTHER_CURRENCIES
              .map(code => ({ code, name: currencyName(code, t) }))
              .filter(c => {
                const q = search.trim().toLowerCase();
                return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
              })
              .map((c, idx, arr) => (
                <TouchableOpacity
                  key={c.code}
                  style={[cs.currModalItem, idx < arr.length - 1 && cs.currModalItemBorder]}
                  onPress={() => onSelect(c.code)}
                  activeOpacity={0.75}
                >
                  <Text style={cs.currModalCode}>{c.code}</Text>
                  <Text style={cs.currModalName}>{c.name}</Text>
                  {selected === c.code && <Text style={[cs.currModalCheck, { color: skinAccent.accent }]}>✓</Text>}
                </TouchableOpacity>
              ))}
          </ScrollView>
          <View style={{ height: 24 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cs = StyleSheet.create({
  currModalSheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  currModalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  currModalTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.white,
    textAlign: 'center', marginBottom: 14,
  },
  currModalSearchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 10,
  },
  currModalSearchInput: {
    flex: 1, fontSize: 13, color: COLORS.white, padding: 0,
  },
  currModalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, gap: 12,
  },
  currModalItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  currModalCode: {
    fontSize: 14, fontWeight: '700', color: COLORS.white, width: 44,
  },
  currModalName: {
    flex: 1, fontSize: 13, color: COLORS.textDim,
  },
  currModalCheck: {
    fontSize: 15, color: COLORS.purpleNeon, fontWeight: '700',
  },
});
