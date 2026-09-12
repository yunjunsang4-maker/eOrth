import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../utils/stage';
import { useSettings } from '../store/settingsStore';
import { getHomeRegions, normalizeHomeRegion } from '../constants/homeRegions';
import { detectCurrentCountry } from '../services/snapService';
import { COUNTRIES } from '../constants/countries';

// 거주 지역(시·도) 설정 시트 — 소셜 탭 '일상' 링의 기준값을 받는다.
//
// 시트 재질은 UserActionSheet(팔로워 ⋯ 메뉴)와 같은 카드 스타일(#1E1E2E, radius 20,
// 하단 스프링 등장)을 그대로 쓴다. 새 재질을 만들면 앱에 바텀시트 모양이 한 벌 더 생긴다.
//
// ⚠️ 위치 권한은 **'현재 위치로 설정' 버튼을 탭한 뒤에만** 요청한다. 시트가 열리자마자
//    요청하면 맥락 없이 권한을 먼저 요구하는 App Store 5.1.1 거부 패턴이 된다
//    (detectCurrentCountry의 allowPrompt 주석과 같은 규칙).
export default function HomeRegionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const { homeCountryCode, homeRegion, setHomeRegion } = useSettings();
  const translateY = useRef(new Animated.Value(600)).current;

  const [mode, setMode] = useState<'choose' | 'pick'>('choose');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  // 거주국가의 지역 프리셋(KR 17개 시·도 / 지오 수록국 행정구역). 비면 자유 입력 한 줄로 받는다.
  const regions = useMemo(() => getHomeRegions(homeCountryCode), [homeCountryCode]);
  const homeCountryName = useMemo(
    () => COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? homeCountryCode,
    [homeCountryCode],
  );

  useEffect(() => {
    if (visible) {
      // 열 때마다 초기 화면(주 버튼 강조)으로 되돌린다 — 지난번 '직접 선택' 목록이 남아 있으면
      // 위치 쪽으로 유도하려던 순서가 뒤집힌다
      setMode('choose');
      setNotice(null);
      setTyped('');
      setBusy(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
    }
  }, [visible, translateY]);

  const save = (name: string, nameEn: string) => {
    setHomeRegion({ name, nameEn });
    onClose();
  };

  const useCurrentLocation = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { countryCode, city } = await detectCurrentCountry({ allowPrompt: true });
      if (!countryCode) {
        // 권한 거부·측위 실패 — 직접 선택으로 유도한다(막다른 길을 만들지 않는다)
        setNotice(t('homeRegion.locationDenied'));
        setMode('pick');
        return;
      }
      if (countryCode.toUpperCase() !== (homeCountryCode || '').toUpperCase()) {
        // 여행 중에 눌렀을 수 있다 — 거주국 밖이면 저장하지 않고 안내만 (거주 지역은 거주국 안의 값)
        setNotice(t('homeRegion.outsideHome', { country: homeCountryName }));
        return;
      }
      const norm = normalizeHomeRegion(homeCountryCode, city);
      if (norm) { save(norm.name, norm.nameEn); return; }
      // 정규화 실패(프리셋 없는 국가·모르는 도시명) — 도시 원문을 그대로 저장한다.
      // 스냅 저장 쪽도 같은 규칙(정규화 실패 시 원문)이라 문자열이 서로 맞는다.
      if (city) { save(city, city); return; }
      setNotice(t('homeRegion.noRegion'));
      setMode('pick');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        <Animated.View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <View style={styles.card}>
            <Text style={styles.title}>{mode === 'pick' ? t('homeRegion.pickTitle') : t('homeRegion.title')}</Text>
            <Text style={styles.desc}>{t('homeRegion.desc')}</Text>

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            {mode === 'choose' ? (
              <>
                {/* 주 버튼 — 보라 네온. 위치 쪽으로 유도하는 것이 설계 의도라 크게 둔다 */}
                <TouchableOpacity
                  style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                  activeOpacity={0.85}
                  onPress={useCurrentLocation}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t('homeRegion.useLocation')}
                >
                  {busy ? (
                    <View style={styles.busyRow}>
                      <ActivityIndicator size="small" color="#0A0A0F" />
                      <Text style={styles.primaryText}>{t('homeRegion.locating')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryText}>{t('homeRegion.useLocation')}</Text>
                  )}
                </TouchableOpacity>

                {/* 보조 링크 — 작은 텍스트 */}
                <TouchableOpacity style={styles.linkBtn} activeOpacity={0.7} onPress={() => { setNotice(null); setMode('pick'); }}>
                  <Text style={styles.linkText}>{t('homeRegion.pickManually')}</Text>
                </TouchableOpacity>
              </>
            ) : regions.length > 0 ? (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {regions.map((r) => {
                  const selected = homeRegion?.nameEn === r.nameEn;
                  return (
                    <TouchableOpacity
                      key={r.nameEn}
                      style={[styles.row, selected && styles.rowSelected]}
                      activeOpacity={0.7}
                      onPress={() => save(r.name, r.nameEn)}
                    >
                      <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{r.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              // 지역 데이터가 없는 국가 — 자유 입력 한 줄 (기존 국내 기록 지역 입력과 같은 폴백)
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={typed}
                  onChangeText={setTyped}
                  placeholder={t('homeRegion.inputPlaceholder')}
                  placeholderTextColor="#4A4A59"
                  returnKeyType="done"
                  onSubmitEditing={() => { const v = typed.trim(); if (v) save(v, v); }}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, !typed.trim() && { opacity: 0.4 }]}
                  activeOpacity={0.85}
                  disabled={!typed.trim()}
                  onPress={() => { const v = typed.trim(); if (v) save(v, v); }}
                >
                  <Text style={styles.primaryText}>{t('homeRegion.save')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.cancelCard} activeOpacity={0.8} onPress={onClose}>
            <Text style={styles.cancelText}>{t('homeRegion.later')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 overlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  desc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#A1A1B0',
    marginBottom: 16,
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    color: '#BF85FC',
    marginBottom: 14,
  },
  primaryBtn: {
    backgroundColor: '#BF85FC',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0F',
  },
  linkBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: '#A1A1B0',
    textDecorationLine: 'underline',
  },
  list: {
    maxHeight: 320,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  rowSelected: {
    backgroundColor: '#2E2E3B',
  },
  rowText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  rowTextSelected: {
    color: '#BF85FC',
    fontWeight: '700',
  },
  inputWrap: {
    gap: 12,
  },
  input: {
    backgroundColor: '#2E2E3B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});
