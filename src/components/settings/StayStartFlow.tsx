// 장기 체류 시작 팝업 본문 — 국가 선택 → 유형 선택 두 단계(2026-10-27 '딱딱하다'는 지적으로 재구성).
// 틀(SettingsModal)·단계 전환·시작 동작은 SettingsScreen이 그대로 들고, 여기는 그림만 그린다:
//  · 국가 단계: 1/2 진행 막대 → 검색 → (검색 전) 최근 기록한 나라·추천 국가 국기 버블 캐러셀 → 전체 국가(국기 배지·대륙 부제)
//  · 유형 단계: 2/2 진행 막대 → 고른 나라 히어로(큰 국기·'변경') → 유형 아이콘 카드 2열
// 국가명은 현재 언어로(countryLabel) — 예전 행은 영어 사용자에게도 한글 이름을 보였다.
// 국기와 국가명은 다른 Text(삼성 기기 한글 소실, 6ae35f9).
import React, { useMemo } from 'react';
import { View, ScrollView, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, TextInput } from '../../ui/Text';
import { COUNTRIES, type Country } from '../../constants/countries';
import type { StayType } from '../../utils/stayMachine';
import { countryLabel, continentLabel } from '../../utils/countryLabel';
import { GlobeIcon, ChatIcon, TargetIcon, BackpackIcon, SparkleIcon } from '../icons';
import { SettingsChevronIcon, SettingsSearchIcon } from '../icons/SettingsIcons';
import { SETTINGS_COLORS, SettingsDivider, SettingsField, settingsText } from './SettingsUI';

type Place = { name: string; flag: string };

const C = SETTINGS_COLORS;
const PANEL = 'rgba(255,255,255,0.06)';
const PANEL_LINE = 'rgba(255,255,255,0.12)';
const ACCENT_BG = 'rgba(172,111,255,0.16)';
const ACCENT_LINE = 'rgba(172,111,255,0.5)';

// 추천 체류 국가 — 워홀·교환학생·어학연수로 많이 가는 나라(고정 목록, 통계 아님). 거주국은 뺀다.
const SUGGESTED = ['일본', '미국', '호주', '캐나다', '영국', '독일', '프랑스', '뉴질랜드', '대만', '싱가포르'];

// 유형별 아이콘 — 앱 팔레트 아이콘(스킨색 점 포함)
const TYPE_ICON: Record<StayType, React.FC<{ size?: number }>> = {
  exchange: GlobeIcon,
  language: ChatIcon,
  intern: TargetIcon,
  workingHoliday: BackpackIcon,
  other: SparkleIcon,
};

/** 단계 표시 — 막대 두 칸, 지난·현재 단계는 보라 */
const StepBar = ({ step }: { step: 1 | 2 }) => (
  <View style={s.stepBar} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: step }}>
    <View style={[s.stepSeg, s.stepSegOn]} />
    <View style={[s.stepSeg, step === 2 && s.stepSegOn]} />
  </View>
);

/** 국기 버블 — 원 안에 큰 국기 + 아래 이름 */
const FlagBubble = ({ place, onPress }: { place: Place; onPress: () => void }) => {
  const { i18n } = useTranslation();
  const name = countryLabel(place.name, i18n.language);
  return (
    <TouchableOpacity style={s.bubble} activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <View style={s.bubbleCircle}><Text style={s.bubbleFlag}>{place.flag}</Text></View>
      <Text style={s.bubbleName} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
};

const BubbleRow = ({ title, places, onPick }: { title: string; places: Place[]; onPick: (p: Place) => void }) => (
  <View>
    <Text style={[settingsText.groupLabel, s.sectionLabel]}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleRow} keyboardShouldPersistTaps="handled">
      {places.map((p) => <FlagBubble key={p.name} place={p} onPress={() => onPick(p)} />)}
    </ScrollView>
  </View>
);

/** 전체 국가 행 — 국기 배지 · 국가명 + 대륙 부제 · 꺾쇠 */
const CountryRow = ({ country, onPress }: { country: Country; onPress: () => void }) => {
  const { i18n } = useTranslation();
  const name = countryLabel(country.name, i18n.language);
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <View style={s.rowBadge}><Text style={s.rowFlag}>{country.flag}</Text></View>
      <View style={s.rowText}>
        <Text style={s.rowName} numberOfLines={1}>{name}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{continentLabel(country.continent, i18n.language)}</Text>
      </View>
      <SettingsChevronIcon />
    </TouchableOpacity>
  );
};

export function StayCountryStep({ search, onSearch, recent, countries, homeCountryName, onPick }: {
  search: string;
  onSearch: (v: string) => void;
  /** 최근 기록한 나라(거주국 제외·최신순) */
  recent: Place[];
  /** 검색어로 걸러진 전체 국가(거주국 제외) */
  countries: Country[];
  homeCountryName: string | null;
  onPick: (p: Place) => void;
}) {
  const { t } = useTranslation();
  const suggested = useMemo(
    () => SUGGESTED
      .filter((n) => n !== homeCountryName)
      .map((n) => COUNTRIES.find((c) => c.name === n))
      .filter((c): c is Country => !!c),
    [homeCountryName],
  );
  const searching = search.trim() !== '';
  return (
    <>
      <StepBar step={1} />
      {/* 팝업 카드와 채움이 같아 링 가운데에서 윤곽이 사라진다 — 하단 취소 알약과 같은 옅은 흰 테두리 */}
      <SettingsField style={s.search} baseRim={C.line}>
        <SettingsSearchIcon />
        <TextInput
          cursorColor={C.label}
          selectionHandleColor={C.label}
          style={[settingsText.input, s.searchInput]}
          value={search}
          onChangeText={onSearch}
          placeholder={t('basicInfo.residenceSearchPlaceholder')}
          placeholderTextColor={C.text50}
          autoCorrect={false}
        />
      </SettingsField>
      <FlatList
        data={countries}
        keyExtractor={(c) => c.name}
        style={s.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={SettingsDivider}
        // 빠른 선택(버블)은 검색 중엔 숨긴다 — 검색 결과 위에 무관한 나라가 뜨면 방해다
        ListHeaderComponent={searching ? null : (
          <View>
            {recent.length > 0 ? <BubbleRow title={t('stay.recentCountries')} places={recent} onPick={onPick} /> : null}
            {suggested.length > 0 ? <BubbleRow title={t('stay.suggestedCountries')} places={suggested} onPick={onPick} /> : null}
            <Text style={[settingsText.groupLabel, s.sectionLabel]}>{t('stay.allCountries')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>{t('settings.searchNoResult')}</Text>}
        renderItem={({ item }) => <CountryRow country={item} onPress={() => onPick({ name: item.name, flag: item.flag })} />}
      />
    </>
  );
}

export function StayTypeStep({ country, types, onChangeCountry, onPick }: {
  country: Place | null;
  types: { type: StayType; labelKey: string }[];
  onChangeCountry: () => void;
  onPick: (type: StayType) => void;
}) {
  const { t, i18n } = useTranslation();
  const grid = types.filter((x) => x.type !== 'other');
  const other = types.find((x) => x.type === 'other');
  return (
    <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
      <StepBar step={2} />
      {/* 고른 나라 — 큰 국기·이름·'변경'(탭하면 국가 단계로) */}
      {country ? (
        <View style={s.hero}>
          <View style={s.heroCircle}><Text style={s.heroFlag}>{country.flag}</Text></View>
          <Text style={s.heroName} numberOfLines={1}>{countryLabel(country.name, i18n.language)}</Text>
          <TouchableOpacity style={s.changeChip} activeOpacity={0.7} onPress={onChangeCountry} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.changeText}>{t('stay.changeCountry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* 유형 카드 — 2열, '기타'만 한 줄 전폭. 누르면 바로 시작(예전과 같다) */}
      <View style={s.grid}>
        {grid.map((x) => {
          const Icon = TYPE_ICON[x.type];
          return (
            <TouchableOpacity key={x.type} style={s.typeCard} activeOpacity={0.7} onPress={() => onPick(x.type)} accessibilityRole="button">
              <Icon size={34} />
              <Text style={s.typeLabel} numberOfLines={1}>{t(x.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {other ? (
        <TouchableOpacity style={s.typeWide} activeOpacity={0.7} onPress={() => onPick(other.type)} accessibilityRole="button">
          <SparkleIcon size={26} />
          <Text style={s.typeLabel} numberOfLines={1}>{t(other.labelKey)}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  stepBar: { flexDirection: 'row', gap: 6, marginTop: 16, alignSelf: 'center', width: 96 },
  stepSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: PANEL_LINE },
  stepSegOn: { backgroundColor: C.label },

  search: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14 },
  searchInput: { paddingVertical: 12 },
  list: { flexGrow: 0, flexShrink: 1, marginTop: 4 },
  sectionLabel: { marginTop: 18, marginLeft: 4 },
  empty: { fontSize: 13, color: C.text50, textAlign: 'center', paddingVertical: 24 },

  bubbleRow: { gap: 14, paddingHorizontal: 2, paddingBottom: 4 },
  bubble: { width: 60, alignItems: 'center', gap: 6 },
  bubbleCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: PANEL, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', justifyContent: 'center' },
  bubbleFlag: { fontSize: 28 },
  bubbleName: { fontSize: 11, color: C.white, maxWidth: 60 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 4 },
  rowBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center' },
  rowFlag: { fontSize: 20 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '500', color: C.white },
  rowSub: { fontSize: 12, color: C.text50 },

  hero: { alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 18 },
  heroCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_BG, borderWidth: 1, borderColor: ACCENT_LINE, alignItems: 'center', justifyContent: 'center' },
  heroFlag: { fontSize: 38 },
  heroName: { fontSize: 18, fontWeight: '800', color: C.white },
  changeChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: PANEL_LINE },
  changeText: { fontSize: 12, fontWeight: '600', color: C.label },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: { width: '48%', flexGrow: 1, height: 96, borderRadius: 18, backgroundColor: PANEL, borderWidth: 1, borderColor: PANEL_LINE, alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeWide: { marginTop: 10, height: 56, borderRadius: 18, backgroundColor: PANEL, borderWidth: 1, borderColor: PANEL_LINE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeLabel: { fontSize: 13, fontWeight: '700', color: C.white },
});
