// 해외 도착 감지 시 "여행 / 장기체류" 선택 프롬프트.
// 장기체류 선택 시 유형(교환/어학/인턴/워홀/기타)까지 고르면 onStay(type) 호출.
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassButton } from '../ui';
import type { StayType } from '../../utils/stayMachine';

const TYPES: { value: StayType; key: string }[] = [
  { value: 'exchange', key: 'stay.typeExchange' },
  { value: 'language', key: 'stay.typeLanguage' },
  { value: 'intern', key: 'stay.typeIntern' },
  { value: 'workingHoliday', key: 'stay.typeWorkingHoliday' },
  { value: 'other', key: 'stay.typeOther' },
];

export function StayPromptModal({ countryName, onTravel, onStay, onClose }: {
  countryName: string | null;  // null이면 닫힘
  onTravel: () => void;        // "여행" 선택 (기존 여행 동작 유지)
  onStay: (type: StayType) => void; // "장기체류" + 유형 선택
  onClose: () => void;         // 바깥 탭/뒤로가기 — 여행과 동일 취급은 호출측 결정
}) {
  const { t } = useTranslation();
  const [pickType, setPickType] = useState(false);
  const visible = !!countryName;
  // 새 국가로 다시 열릴 때 유형 선택 단계 초기화
  useEffect(() => { if (visible) setPickType(false); }, [visible, countryName]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          {!pickType ? (
            <>
              <Text style={s.title}>{t('stay.promptTitle', { country: countryName ?? '' })}</Text>
              <Text style={s.desc}>{t('stay.promptDesc')}</Text>
              <GlassButton label={t('stay.chooseTravel')} onPress={onTravel} style={{ marginTop: 16 }} />
              <GlassButton label={t('stay.chooseStay')} onPress={() => setPickType(true)} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <Text style={[s.title, { marginBottom: 12 }]}>{t('stay.typeTitle')}</Text>
              {TYPES.map((ty) => (
                <TouchableOpacity key={ty.value} style={s.typeRow} onPress={() => onStay(ty.value)} activeOpacity={0.8}>
                  <Text style={s.typeTxt}>{t(ty.key)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 28 },
  card: { backgroundColor: '#161421', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  desc: { color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  typeRow: { paddingVertical: 15, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 0 },
  typeTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
