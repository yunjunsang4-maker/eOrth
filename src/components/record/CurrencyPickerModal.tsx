import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SearchIcon as SvgSearchIcon } from '../icons';

/**
 * 기타 통화 선택 모달 — NewRecordScreen 에서 분리.
 * 통화 목록(OTHER_CURRENCIES)은 모달 전용 데이터이므로 함께 둔다.
 */
const COLORS = {
  white: '#FFFFFF',
  bg: '#0A0A0F',
  divider: '#1A1A26',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  purpleNeon: '#BF85FC',
};

const OTHER_CURRENCIES = [
  { code: 'EUR', name: '유로 (EU)' },
  { code: 'CNY', name: '위안 (중국)' },
  { code: 'GBP', name: '파운드 (영국)' },
  { code: 'AUD', name: '호주 달러' },
  { code: 'CAD', name: '캐나다 달러' },
  { code: 'CHF', name: '스위스 프랑' },
  { code: 'HKD', name: '홍콩 달러' },
  { code: 'SGD', name: '싱가포르 달러' },
  { code: 'THB', name: '바트 (태국)' },
  { code: 'VND', name: '동 (베트남)' },
  { code: 'MYR', name: '링깃 (말레이시아)' },
  { code: 'PHP', name: '페소 (필리핀)' },
  { code: 'IDR', name: '루피아 (인도네시아)' },
  { code: 'INR', name: '루피 (인도)' },
  { code: 'TRY', name: '리라 (튀르키예)' },
  { code: 'MXN', name: '페소 (멕시코)' },
  { code: 'BRL', name: '헤알 (브라질)' },
  { code: 'AED', name: '디르함 (UAE)' },
  { code: 'NZD', name: '뉴질랜드 달러' },
  { code: 'SEK', name: '크로나 (스웨덴)' },
  { code: 'NOK', name: '크로네 (노르웨이)' },
  { code: 'DKK', name: '크로네 (덴마크)' },
  { code: 'CZK', name: '코루나 (체코)' },
  { code: 'HUF', name: '포린트 (헝가리)' },
  { code: 'PLN', name: '즐로티 (폴란드)' },
];

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={cs.currModalSheet}>
          <View style={cs.currModalHandle} />
          <Text style={cs.currModalTitle}>통화 선택</Text>
          <View style={cs.currModalSearchWrap}>
            <SvgSearchIcon size={14} color={COLORS.textDim} />
            <TextInput
              style={cs.currModalSearchInput}
              value={search}
              onChangeText={onSearchChange}
              placeholder="통화 검색 (예: EUR, 유로)"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
          </View>
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {OTHER_CURRENCIES
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
                  {selected === c.code && <Text style={cs.currModalCheck}>✓</Text>}
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
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
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
