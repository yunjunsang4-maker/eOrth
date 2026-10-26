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
  KeyboardAvoidingView,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../utils/stage';
import { useHomeSettings, useSettingsActions } from '../store/settingsStore';
import { getHomeRegions, normalizeHomeRegion } from '../constants/homeRegions';
import { detectCurrentCountry } from '../services/snapService';
import { COUNTRIES } from '../constants/countries';
import { BackChevronIcon } from './icons';
import { SettingsChevronIcon } from './icons/SettingsIcons';
import {
  SETTINGS_COLORS,
  SettingsCard,
  SettingsDivider,
  SettingsField,
  SettingsOptionRow,
  SettingsPillButton,
  settingsText,
} from './settings/SettingsUI';

// 거주 지역(시·도) 설정 시트 — 소셜 탭 '일상' 링의 기준값을 받는다.
//
// 재질은 설정 디자인 공용 부품(components/settings/SettingsUI, 2026-10-26 통일) — 검은 카드·설정 행·알약.
// 하단 스프링 등장·핸들 구조는 예전 카드 시트 그대로다. 설정·온보딩·스냅 저장 세 곳이 함께 쓴다.
//
// ⚠️ 위치 권한은 **'현재 위치로 설정' 버튼을 탭한 뒤에만** 요청한다. 시트가 열리자마자
//    요청하면 맥락 없이 권한을 먼저 요구하는 App Store 5.1.1 거부 패턴이 된다
//    (detectCurrentCountry의 allowPrompt 주석과 같은 규칙).
export default function HomeRegionSheet({
  visible,
  onClose,
  onSaved,
  countryCode,
  allowClear = false,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * 지역을 저장했을 때 그 값을 onClose **직전에** 넘긴다(선택). '나중에'·배경 탭으로 닫히면 부르지 않는다.
   * 스토어의 `homeRegion`은 setHomeRegion 직후 같은 틱에선 아직 옛 값이라, 닫히자마자 그 값으로
   * 판정해야 하는 호출부(SnapRecordScreen — 시트 뒤에 스냅을 저장)가 쓴다. 설정·온보딩은 안 넘긴다.
   */
  onSaved?: (region: { name: string; nameEn: string }) => void;
  /**
   * 기준 거주국(ISO2). 주지 않으면 지금처럼 스토어의 `homeCountryCode`를 쓴다.
   *
   * 온보딩(BasicInfoScreen)은 거주국을 **스토어에 즉시 쓰지 않는다** — 로컬 state로만 들고
   * 있다가 [다음]을 눌러야 `setHomeCountryCode`를 부른다. 그래서 그 화면에서 이 시트를
   * 스토어 기준으로 열면 방금 고른 나라가 아니라 옛 나라의 시·도 목록이 뜬다.
   * 그런 호출부가 자기 화면의 현재 나라를 넘길 수 있게 뚫어 둔 구멍이다.
   */
  countryCode?: string | null;
  /** 저장된 거주 지역을 지우는 행을 보일지 — 설정 화면만 켠다(온보딩·스냅 저장 시트는 '고르는' 맥락이라 끈다) */
  allowClear?: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const { homeCountryCode, homeRegion } = useHomeSettings();
  const { setHomeRegion } = useSettingsActions();
  // 이 시트의 거주국 단일 출처. 아래 네 곳(지역 프리셋·국가명·거주국 밖 판정·도시 정규화)이
  // 전부 이 값을 봐야 한다 — 하나라도 스토어 값을 그대로 보면 나라와 지역이 어긋난 값이 저장된다.
  const effectiveCountry = countryCode ?? homeCountryCode;
  const translateY = useRef(new Animated.Value(600)).current;

  const [mode, setMode] = useState<'choose' | 'pick'>('choose');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState(''); // 직접 선택 목록 검색어

  // 거주국가의 지역 프리셋(KR 17개 시·도 / 지오 수록국 행정구역). 비면 자유 입력 한 줄로 받는다.
  const regions = useMemo(() => getHomeRegions(effectiveCountry), [effectiveCountry]);
  const homeCountryName = useMemo(
    () => COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (effectiveCountry || '').toUpperCase())?.name ?? effectiveCountry,
    [effectiveCountry],
  );

  useEffect(() => {
    if (visible) {
      // 열 때마다 초기 화면(주 버튼 강조)으로 되돌린다 — 지난번 '직접 선택' 목록이 남아 있으면
      // 위치 쪽으로 유도하려던 순서가 뒤집힌다
      setMode('choose');
      setNotice(null);
      setTyped('');
      setQuery('');
      setBusy(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
    }
  }, [visible, translateY]);

  const save = (name: string, nameEn: string) => {
    setHomeRegion({ name, nameEn });
    onSaved?.({ name, nameEn });
    onClose();
  };

  // 직접 선택 → 처음 화면. 안드로이드 뒤로도 여기로(바로 닫으면 고르던 맥락을 잃는다)
  const backToChoose = () => { setNotice(null); setQuery(''); setMode('choose'); };

  // 거주 지역 지우기 — 일상 링 기준이 사라진다. onSaved는 부르지 않는다(저장이 아니다)
  const clearRegion = () => { setHomeRegion(null); onClose(); };

  const useCurrentLocation = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      // 측위 결과는 `detected`로 받는다 — 이름을 countryCode로 두면 위의 prop을 가려
      // 아래 비교가 "자기 자신과 비교"가 되어 거주국 밖 판정이 통째로 죽는다.
      const { countryCode: detected, city } = await detectCurrentCountry({ allowPrompt: true });
      if (!detected) {
        // 권한 거부·측위 실패 — 직접 선택으로 유도한다(막다른 길을 만들지 않는다)
        setNotice(t('homeRegion.locationDenied'));
        setMode('pick');
        return;
      }
      if (detected.toUpperCase() !== (effectiveCountry || '').toUpperCase()) {
        // 여행 중에 눌렀을 수 있다 — 거주국 밖이면 저장하지 않고 안내만 (거주 지역은 거주국 안의 값)
        setNotice(t('homeRegion.outsideHome', { country: homeCountryName }));
        return;
      }
      const norm = normalizeHomeRegion(effectiveCountry, city);
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

  // 직접 선택 목록 검색 — 프리셋이 긴 나라(지오 수록국 행정구역)에서만 검색칸을 보인다. 한글·영문 이름 모두
  const filteredRegions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((r) => r.name.toLowerCase().includes(q) || r.nameEn.toLowerCase().includes(q));
  }, [regions, query]);
  const showSearch = regions.length > SEARCH_MIN;
  // '지우기'는 호출부가 허용했고 지금 지역이 저장돼 있을 때만 — 온보딩·스냅 저장 시트에는 없다
  const canClear = allowClear && !!homeRegion;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={mode === 'pick' ? backToChoose : onClose} statusBarTranslucent navigationBarTranslucent>
      {/* 직접 선택의 검색·자유 입력칸이 키보드에 가리지 않게 — 시트가 하단 고정이라 iOS는 패딩으로 밀어 올린다
          (안드로이드 Modal 창은 기본 adjustResize) */}
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {/* 설정 카드 재질(검은 채움·공용 링) — 머리글 → 전폭 구분선 → 설정 행 */}
          <SettingsCard style={styles.card}>
            {mode === 'pick' ? (
              // 직접 선택 — 뒤로(처음 화면) · 가운데 제목. 예전엔 들어오면 돌아갈 길이 '나중에'(닫기)뿐이었다
              <View style={styles.pickHeader}>
                <TouchableOpacity style={styles.backBtn} onPress={backToChoose} hitSlop={BACK_HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
                  <BackChevronIcon />
                </TouchableOpacity>
                <Text style={[settingsText.sheetTitle, styles.pickTitle]} numberOfLines={1}>{t('homeRegion.pickTitle')}</Text>
                <View style={styles.backBtn} />
              </View>
            ) : (
              <View style={styles.head}>
                <Text style={settingsText.sheetTitle}>{t('homeRegion.title')}</Text>
                <Text style={settingsText.sheetDesc}>{t('homeRegion.desc')}</Text>
                {homeRegion ? (
                  // 지금 저장된 값 — 바꾸러 들어왔는지 지우러 들어왔는지 판단할 근거
                  <Text style={styles.current}>{t('homeRegion.currentLabel', { region: homeRegion.name })}</Text>
                ) : null}
              </View>
            )}

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <SettingsDivider />

            {mode === 'choose' ? (
              <>
                {/* 주 동작 — 위치로 유도하는 것이 설계 의도라 맨 위 + 보라 '추천' 표시 */}
                <SettingsOptionRow
                  label={busy ? t('homeRegion.locating') : t('homeRegion.useLocation')}
                  onPress={useCurrentLocation}
                  right={busy
                    ? <ActivityIndicator size="small" color={SETTINGS_COLORS.label} />
                    : <Text style={styles.recommend}>{t('homeRegion.recommended')}</Text>}
                />
                <SettingsDivider />
                <SettingsOptionRow
                  label={t('homeRegion.pickManually')}
                  onPress={() => { setNotice(null); setQuery(''); setMode('pick'); }}
                  right={<SettingsChevronIcon />}
                />
                {canClear ? (
                  <>
                    <SettingsDivider />
                    {/* 지우기 — 일상 링 기준이 사라지는 동작이라 빨강. 다시 설정하면 되돌릴 수 있어 확인 단계는 두지 않는다 */}
                    <TouchableOpacity style={styles.clearRow} activeOpacity={0.7} onPress={clearRegion} accessibilityRole="button">
                      <Text style={styles.clearText}>{t('homeRegion.remove')}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            ) : regions.length > 0 ? (
              <>
                {/* 검색칸 — 시트 카드와 채움이 같아 윤곽이 사라지므로 '나중에' 알약과 같은 옅은 흰 테두리(baseRim) */}
                {showSearch ? (
                  <SettingsField style={styles.search} baseRim={PILL_RIM}>
                    <TextInput
                      cursorColor={SETTINGS_COLORS.label}
                      selectionHandleColor={SETTINGS_COLORS.label}
                      style={settingsText.input}
                      value={query}
                      onChangeText={setQuery}
                      placeholder={t('homeRegion.searchPlaceholder')}
                      placeholderTextColor={SETTINGS_COLORS.text50}
                      autoCorrect={false}
                    />
                  </SettingsField>
                ) : null}
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredRegions.map((r, i) => (
                    <React.Fragment key={r.nameEn}>
                      {i > 0 && <SettingsDivider />}
                      <SettingsOptionRow label={r.name} selected={homeRegion?.nameEn === r.nameEn} onPress={() => save(r.name, r.nameEn)} />
                    </React.Fragment>
                  ))}
                  {filteredRegions.length === 0 ? <Text style={styles.empty}>{t('settings.searchNoResult')}</Text> : null}
                </ScrollView>
              </>
            ) : (
              // 지역 데이터가 없는 국가 — 자유 입력 한 줄 (기존 국내 기록 지역 입력과 같은 폴백)
              <View style={styles.inputWrap}>
                <SettingsField>
                  <TextInput
                    cursorColor={SETTINGS_COLORS.label}
                    selectionHandleColor={SETTINGS_COLORS.label}
                    style={settingsText.input}
                    value={typed}
                    onChangeText={setTyped}
                    placeholder={t('homeRegion.inputPlaceholder')}
                    placeholderTextColor={SETTINGS_COLORS.text50}
                    returnKeyType="done"
                    onSubmitEditing={() => { const v = typed.trim(); if (v) save(v, v); }}
                  />
                </SettingsField>
                <SettingsPillButton
                  label={t('homeRegion.save')}
                  disabled={!typed.trim()}
                  onPress={() => { const v = typed.trim(); if (v) save(v, v); }}
                  baseRim={PILL_RIM}
                />
              </View>
            )}
          </SettingsCard>

          {/* 나중에 — 설정 팝업 닫기와 같은 알약 */}
          <SettingsPillButton label={t('homeRegion.later')} onPress={onClose} baseRim={PILL_RIM} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 시트 위 알약(나중에·저장)의 옅은 흰 테두리 — 같은 채움 위에서도 윤곽이 보이게(설정 팝업 닫기 알약과 같은 값)
const PILL_RIM = 'rgba(255,255,255,0.15)';
// 직접 선택 목록에 검색칸을 보이는 프리셋 개수 기준 — 한국 17개 시·도는 한눈에 보이니 검색 없이
const SEARCH_MIN = 17;
const BACK_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

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
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  card: { marginBottom: 10 },
  head: { paddingHorizontal: 20, paddingVertical: 20 },
  // 지금 저장된 지역 — 그룹 라벨 보라
  current: { fontSize: 13, fontWeight: '600', color: SETTINGS_COLORS.label, textAlign: 'center', marginTop: 10 },
  pickHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { flex: 1 },
  notice: { fontSize: 13, lineHeight: 19, color: SETTINGS_COLORS.label, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 14 },
  recommend: { fontSize: 12, fontWeight: 'bold', color: SETTINGS_COLORS.label },
  clearRow: { minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  clearText: { fontSize: 14, fontWeight: '500', color: SETTINGS_COLORS.red },
  search: { marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
  list: { maxHeight: 360 },
  empty: { fontSize: 13, color: SETTINGS_COLORS.text50, textAlign: 'center', paddingVertical: 24 },
  inputWrap: { gap: 12, padding: 16 },
});
