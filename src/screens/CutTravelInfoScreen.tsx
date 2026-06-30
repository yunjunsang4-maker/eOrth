import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, KeyboardAvoidingView, Platform, PanResponder, Modal, Alert, Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRecords, type Visibility } from '../store/recordStore';
import { detectCurrentCountry } from '../services/snapService';
import { currencyForCountryName } from '../constants/countryCurrency';
import type { CutLayout } from '../constants/cutFrames';
import { COUNTRIES, Country, CONTINENT_ORDER } from '../constants/countries';
import type { RootStackScreenProps } from '../navigation/types';
import {
  CalendarIcon, CoinIcon, TagIcon, TakeoffIcon, TransferIcon,
  PartlyCloudyIcon, PlaneIcon, SearchIcon,
  SoloIcon, FriendIcon, CoupleIcon, FamilyIcon, ParentIcon, SiblingIcon,
  SunIcon, CloudyIcon, RainIcon, SnowIcon, WindIcon,
  LockClosedIcon, LockOpenIcon,
} from '../components/icons';

// 디자인 토큰
const C = {
  bg: '#0A0A0F', card: '#2E2E3B', divider: '#1A1A26',
  purpleNeon: '#BF85FC', purpleDeep: '#6B21A8',
  purpleBg: 'rgba(107,33,168,0.25)', purpleBorder: 'rgba(191,133,252,0.3)',
  white: '#FFFFFF', textDim: '#A1A1B0', textMuted: '#4A4A59', gold: '#FFD700',
};
const IC = C.purpleNeon;

// ─── 상수 (피드와 동일) ───
const COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];
const WEATHER_OPTIONS = [
  { label: '☀️ 맑음',     value: '맑음' },
  { label: '🌤️ 부분흐림', value: '부분흐림' },
  { label: '⛅ 흐림',     value: '흐림' },
  { label: '🌧️ 비',       value: '비' },
  { label: '❄️ 눈',       value: '눈' },
  { label: '💨 바람',     value: '바람' },
];
const FLIGHT_OPTIONS = ['직항', '경유'];
const CURRENCIES = ['KRW', 'JPY', 'USD'];
const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'public',  label: '🌐 전체 공개' },
  { value: 'friends', label: '👥 친구만' },
  { value: 'private', label: '🔒 나만 보기' },
];
const OTHER_CURRENCIES = [
  { code: 'EUR', name: '유로 (EU)' }, { code: 'CNY', name: '위안 (중국)' },
  { code: 'GBP', name: '파운드 (영국)' }, { code: 'AUD', name: '호주 달러' },
  { code: 'CAD', name: '캐나다 달러' }, { code: 'CHF', name: '스위스 프랑' },
  { code: 'HKD', name: '홍콩 달러' }, { code: 'SGD', name: '싱가포르 달러' },
  { code: 'THB', name: '바트 (태국)' }, { code: 'VND', name: '동 (베트남)' },
  { code: 'MYR', name: '링깃 (말레이시아)' }, { code: 'PHP', name: '페소 (필리핀)' },
  { code: 'IDR', name: '루피아 (인도네시아)' }, { code: 'INR', name: '루피 (인도)' },
  { code: 'TRY', name: '리라 (튀르키예)' }, { code: 'AED', name: '디르함 (UAE)' },
  { code: 'NZD', name: '뉴질랜드 달러' },
];

// ─── 동행자 아이콘 ───
const companionIcon = (comp: string, color: string): React.ReactNode => {
  switch (comp) {
    case '혼자': return <SoloIcon size={16} color={color} />;
    case '친구': return <FriendIcon size={16} color={color} />;
    case '연인': return <CoupleIcon size={16} color={color} />;
    case '가족': return <FamilyIcon size={16} color={color} />;
    case '부모님': return <ParentIcon size={16} color={color} />;
    case '형제': return <SiblingIcon size={16} color={color} />;
    default: return null;
  }
};

// ─── 날씨 아이콘 ───
const WEATHER_ICON_MAP: Record<string, React.ReactNode> = {
  '맑음':     <SunIcon size={16} />,
  '부분흐림': <PartlyCloudyIcon size={16} />,
  '흐림':     <CloudyIcon size={16} />,
  '비':       <RainIcon size={16} />,
  '눈':       <SnowIcon size={16} />,
  '바람':     <WindIcon size={16} />,
};

const fmtDate = (d: Date | null, tr: TFunction) =>
  d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : tr('cutInfo.dateSelect');

// 동행자/날씨/항공편/공개범위 값(저장 키)은 유지하고 표시만 번역
const companionLabel = (c: string, tr: TFunction) => {
  switch (c) {
    case '혼자': return tr('newRecord.compSolo');
    case '친구': return tr('newRecord.compFriend');
    case '연인': return tr('newRecord.compCouple');
    case '가족': return tr('newRecord.compFamily');
    case '부모님': return tr('newRecord.compParents');
    case '형제': return tr('newRecord.compSibling');
    default: return c;
  }
};
const weatherLabel = (v: string, tr: TFunction) => {
  switch (v) {
    case '맑음': return tr('newRecord.wSunny');
    case '부분흐림': return tr('newRecord.wPartly');
    case '흐림': return tr('newRecord.wCloudy');
    case '비': return tr('newRecord.wRain');
    case '눈': return tr('newRecord.wSnow');
    case '바람': return tr('newRecord.wWind');
    default: return v;
  }
};
const flightLabel = (f: string, tr: TFunction) => (f === '직항' ? tr('newRecord.flightDirect') : tr('newRecord.flightLayover'));
const visibilityLabel = (v: Visibility, tr: TFunction) => {
  switch (v) {
    case 'public': return `🌐 ${tr('newRecord.visPublic')}`;
    case 'friends': return `👥 ${tr('newRecord.visFriends')}`;
    case 'private': return `🔒 ${tr('newRecord.visPrivate')}`;
    default: return '';
  }
};

// ─── 기간 선택 캘린더 ───
const DOW_KEYS = ['blog.week0', 'blog.week1', 'blog.week2', 'blog.week3', 'blog.week4', 'blog.week5', 'blog.week6'] as const;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstDow = (y: number, m: number) => new Date(y, m, 1).getDay();

function RangeCalendar({ visible, initialStart, initialEnd, onConfirm, onClose }: {
  visible: boolean;
  initialStart: Date | null;
  initialEnd: Date | null;
  onConfirm: (start: Date, end: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const base = initialStart ?? new Date();
  const [vy, setVy] = useState(base.getFullYear());
  const [vm, setVm] = useState(base.getMonth());
  const [start, setStart] = useState<Date | null>(initialStart);
  const [end, setEnd] = useState<Date | null>(initialEnd);

  useEffect(() => {
    if (visible) {
      const b = initialStart ?? new Date();
      setVy(b.getFullYear()); setVm(b.getMonth());
      setStart(initialStart); setEnd(initialEnd);
    }
  }, [visible]);

  if (!visible) return null;

  const prevMonth = () => { if (vm === 0) { setVy(vy - 1); setVm(11); } else setVm(vm - 1); };
  const nextMonth = () => { if (vm === 11) { setVy(vy + 1); setVm(0); } else setVm(vm + 1); };

  const pick = (day: number) => {
    const d = new Date(vy, vm, day);
    if (!start || (start && end)) { setStart(d); setEnd(null); }
    else if (d.getTime() < start.getTime()) { setEnd(start); setStart(d); }
    else setEnd(d);
  };
  const inRange = (day: number) => {
    if (!start) return false;
    const d = new Date(vy, vm, day).getTime();
    const s = start.getTime(); const e = (end ?? start).getTime();
    return d >= Math.min(s, e) && d <= Math.max(s, e);
  };
  const isEdge = (day: number) => {
    const d = new Date(vy, vm, day).getTime();
    return (!!start && d === start.getTime()) || (!!end && d === end.getTime());
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow(vy, vm); i++) cells.push(null);
  for (let day = 1; day <= daysInMonth(vy, vm); day++) cells.push(day);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={cal.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={cal.sheet}>
          <View style={cal.handle} />
          <View style={cal.navRow}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={cal.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={cal.ymLabel}>{t('cutInfo.yearMonth', { y: vy, m: vm + 1 })}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={cal.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={cal.dowRow}>
            {DOW_KEYS.map((dk, i) => (
              <Text key={dk} style={[cal.dow, i === 0 && { color: '#FF6B6B' }, i === 6 && { color: '#6BA3FF' }]}>{t(dk)}</Text>
            ))}
          </View>
          <View style={cal.grid}>
            {cells.map((day, idx) => day === null ? (
              <View key={`b${idx}`} style={cal.cell} />
            ) : (
              <TouchableOpacity key={day} style={cal.cell} onPress={() => pick(day)} activeOpacity={0.7}>
                <View style={[cal.dayWrap, inRange(day) && cal.dayInRange, isEdge(day) && cal.dayEdge]}>
                  <Text style={[cal.dayTxt, isEdge(day) && cal.dayEdgeTxt]}>{day}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[cal.confirmBtn, !start && cal.confirmBtnDisabled]}
            disabled={!start}
            onPress={() => { if (start) { onConfirm(start, end ?? start); onClose(); } }}
            activeOpacity={0.85}
          >
            <Text style={cal.confirmTxt}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

type CutPhotoParam = { layout: CutLayout; frameId: string; frameColor?: string; photos: string[]; previewUri: string };

// ─── 비공개 친구 선택 모달 (블로그와 동일) ───
function PrivacyModal({
  visible,
  selectedFriends,
  allFriends,
  onToggle,
  onSetAll,
  onClose,
}: {
  visible: boolean;
  selectedFriends: string[];
  allFriends: string[];
  onToggle: (friend: string) => void;
  onSetAll: (friends: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start();
    } else {
      Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={pm.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[pm.sheet, { transform: [{ translateY }] }]}>
          <View style={pm.handle} />

          {/* 헤더 */}
          <View style={pm.header}>
            <View style={pm.headerLeft}>
              <LockClosedIcon size={24} color="#A1A1B0" />
              <View>
                <Text style={pm.headerTitle}>{t('cutInfo.privacyTitle')}</Text>
                <Text style={pm.headerDesc}>{t('cutInfo.privacyDesc')}</Text>
              </View>
            </View>
          </View>

          {/* 전체 비공개 — 모든 친구에게 비공개 (맨 위 옵션) */}
          {allFriends.length > 0 && (() => {
            const allPrivate = selectedFriends.length === allFriends.length;
            return (
              <TouchableOpacity
                style={[pm.allPrivateRow, allPrivate && pm.friendRowActive]}
                onPress={() => onSetAll(allPrivate ? [] : [...allFriends])}
                activeOpacity={0.7}
              >
                <View style={[pm.avatar, allPrivate && pm.avatarActive]}>
                  <LockClosedIcon size={18} color={allPrivate ? '#FFFFFF' : '#A1A1B0'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pm.allPrivateLabel, allPrivate && pm.friendNameActive]}>{t('cutInfo.allPrivate')}</Text>
                  <Text style={pm.allPrivateDesc}>{t('cutInfo.allPrivateDesc')}</Text>
                </View>
                <View style={[pm.checkbox, allPrivate && pm.checkboxActive]}>
                  {allPrivate && <Text style={pm.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* 전체 해제 버튼 */}
          {selectedFriends.length > 0 && (
            <TouchableOpacity style={pm.clearAllBtn} onPress={() => selectedFriends.forEach(f => onToggle(f))} activeOpacity={0.7}>
              <Text style={pm.clearAllTxt}>{t('cutInfo.clearAll')}</Text>
            </TouchableOpacity>
          )}

          {/* 친구 목록 */}
          <ScrollView style={pm.listScroll} showsVerticalScrollIndicator={false}>
            {allFriends.map(friend => {
              const isSelected = selectedFriends.includes(friend);
              return (
                <TouchableOpacity
                  key={friend}
                  style={[pm.friendRow, isSelected && pm.friendRowActive]}
                  onPress={() => onToggle(friend)}
                  activeOpacity={0.7}
                >
                  <View style={[pm.avatar, isSelected && pm.avatarActive]}>
                    <Text style={pm.avatarTxt}>{friend[0]}</Text>
                  </View>
                  <Text style={[pm.friendName, isSelected && pm.friendNameActive]}>{friend}</Text>
                  <View style={[pm.checkbox, isSelected && pm.checkboxActive]}>
                    {isSelected && <Text style={pm.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 완료 버튼 */}
          <TouchableOpacity style={pm.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={pm.doneTxt}>
              {selectedFriends.length > 0
                ? t('cutInfo.privacyDoneN', { count: selectedFriends.length })
                : t('cutInfo.setPublic')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function CutTravelInfoScreen({ navigation, route }: RootStackScreenProps<'CutTravelInfo'>) {
  const { t } = useTranslation();
  const { addRecord, followingUsers } = useRecords();
  // 함께한 친구·비공개 대상 목록은 실제 팔로우한 친구에서 가져온다 (데모 친구 제거)
  const friendNames = followingUsers.map((f) => f.username);
  const cutPhoto: CutPhotoParam | undefined = route?.params?.cutPhoto;
  const initialCountry = route?.params?.selectedCountry as { flag?: string; name?: string; region?: string; regionEn?: string } | undefined;
  // 여행 카드에서 추가 시 받은 기간을 기본 날짜로 적용 ('YYYY.MM.DD' → Date)
  const tripPeriod = route?.params?.tripPeriod;
  const parseTripDate = (s?: string): Date | null => {
    if (!s) return null;
    const t = new Date(s.replace(/\./g, '-'));
    return Number.isFinite(t.getTime()) ? t : null;
  };

  // ─── 국가 선택 ───
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(
    initialCountry?.name ? (COUNTRIES.find(c => c.name === initialCountry.name!.split(' - ')[0]) ?? null) : null
  );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(
    initialCountry?.region ? { name: initialCountry.region, nameEn: initialCountry.regionEn || '' } : null
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // ─── 메타 상태 (피드와 동일) ───
  const [startDate, setStartDate] = useState<Date | null>(() => parseTripDate(tripPeriod?.startDate));
  const [endDate, setEndDate] = useState<Date | null>(() => parseTripDate(tripPeriod?.endDate));
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [memo, setMemo] = useState('');
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionFriends, setCompanionFriends] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [privateFriends, setPrivateFriends] = useState<string[]>([]);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('KRW');
  // 사용자가 통화를 직접 고르면 국가 기반 자동 추천을 멈춘다
  const currencyTouchedRef = useRef(false);
  const chooseCurrency = (code: string) => { currencyTouchedRef.current = true; setCurrency(code); };
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather, setWeather] = useState('');
  const [flightType, setFlightType] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordQuery, setKeywordQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // 대표(선택) 국가에 맞춰 기본 통화 자동 추천 — 사용자가 직접 고르기 전까지
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    const cur = currencyForCountryName(selectedCountry?.name);
    if (cur) setCurrency(cur);
     
  }, [selectedCountry?.name]);

  // 위치(국가·도시) 자동 채움 — 국가 지정 없이 들어왔을 때, 현재 위치로 1회 프리필
  useEffect(() => {
    if (initialCountry?.name) return;
    let cancelled = false;
    (async () => {
      const { countryCode, countryName, city } = await detectCurrentCountry();
      if (cancelled || (!countryCode && !countryName)) return;
      const found =
        (countryCode && COUNTRIES.find(c => c.term.split(' ')[0].toUpperCase() === countryCode.toUpperCase())) ||
        (countryName && COUNTRIES.find(c => c.name === countryName || c.term.toLowerCase().includes(countryName.toLowerCase()))) ||
        null;
      if (!found) return;
      setSelectedCountry(prev => prev ?? found);
      if (city) setSelectedRegion(prev => prev ?? { name: city, nameEn: city });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCompanion = (c: string) =>
    setCompanions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const toggleCompanionFriend = (f: string) =>
    setCompanionFriends(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  const togglePrivateFriend = (f: string) =>
    setPrivateFriends(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  const removeCompanionFriend = (f: string) =>
    setCompanionFriends(prev => prev.filter(x => x !== f));
  const addKeyword = (raw: string) => {
    const KEYWORD_MAX = 10, KEYWORD_MAXLEN = 20;
    const base = raw.trim().replace(/^#+/, '').trim().slice(0, KEYWORD_MAXLEN);
    if (!base) return;
    const kw = `#${base}`;
    setKeywords(prev => {
      if (prev.includes(kw)) return prev;
      if (prev.length >= KEYWORD_MAX) { Alert.alert(t('cutInfo.noticeTitle'), t('cutInfo.keywordMax', { max: KEYWORD_MAX })); return prev; }
      return [...prev, kw];
    });
  };

  // ─── 별점 (0.5 단위 드래그) ───
  const STAR_SIZE = 32;
  const STAR_GAP = 6;
  const ratingRowRef = useRef<View>(null);
  const ratingRowPageX = useRef(0);
  const getRatingFromX = (x: number) => {
    let r = 0;
    for (let i = 0; i < 5; i++) {
      const starStart = i * (STAR_SIZE + STAR_GAP);
      if (x < starStart) break;
      r = x <= starStart + STAR_SIZE / 2 ? i + 0.5 : i + 1;
    }
    return Math.max(0, Math.min(5, r));
  };
  const ratingPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        ratingRowRef.current?.measure((_fx, _fy, _w, _h, px) => {
          ratingRowPageX.current = px;
          setRating(getRatingFromX(evt.nativeEvent.pageX - px));
        });
      },
      onPanResponderMove: (evt) => {
        setRating(getRatingFromX(evt.nativeEvent.pageX - ratingRowPageX.current));
      },
    })
  ).current;
  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const isFull = rating >= i;
      const isHalf = rating >= i - 0.5 && rating < i;
      stars.push(
        <View key={i} style={{ width: STAR_SIZE, height: STAR_SIZE }}>
          <Text style={[st.starChar, st.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[st.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[st.starChar, st.starCharActive, st.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={st.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  // ─── 국가 필터 ───
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;
  const groupedCountries = CONTINENT_ORDER.map(cont => ({
    continent: cont, countries: filteredCountries.filter(c => c.continent === cont),
  })).filter(g => g.countries.length > 0);

  // ─── 저장 ───
  const handleSave = () => {
    if (savingRef.current) return; // 저장 중복 클릭 방지
    if (!selectedCountry) { Alert.alert(t('cutInfo.selectCountryTitle'), t('cutInfo.selectCountryMsg')); return; }
    if (!startDate) { Alert.alert(t('cutInfo.dateInputTitle'), t('cutInfo.dateInputMsg')); return; }
    if (!memo.trim()) { Alert.alert(t('cutInfo.contentTitle'), t('cutInfo.contentMsg')); return; }
    if (companions.length === 0) { Alert.alert(t('cutInfo.companionTitle'), t('cutInfo.companionMsg')); return; }
    if (rating <= 0) { Alert.alert(t('cutInfo.ratingTitle'), t('cutInfo.ratingMsg')); return; }
    if (!cutPhoto) { Alert.alert(t('cutInfo.errorTitle'), t('cutInfo.noCutInfo')); return; }

    savingRef.current = true;
    setSaving(true);
    const sStr = fmtDate(startDate, t);
    const eStr = fmtDate(endDate ?? startDate, t);
    addRecord({
      user: { name: '', emoji: '✈️', handle: '' }, // 작성자 정보는 addRecord가 로그인 사용자로 채움
      country: selectedCountry ? `${selectedCountry.flag ?? ''} ${selectedCountry.name ?? ''}`.trim() : '',
      countryName: selectedCountry?.name || '',
      countryFlag: selectedCountry?.flag || '',
      countries: selectedCountry?.flag && selectedCountry?.name
        ? [{ flag: selectedCountry.flag, name: selectedCountry.name }] : [],
      regionName: selectedRegion?.name || undefined,
      regionNameEn: selectedRegion?.nameEn || undefined,
      date: sStr,
      content: memo.trim(),
      visibility,
      memo: memo.trim() || undefined,
      rating: rating || undefined,
      companions: companions,
      companionFriends: companionFriends.length > 0 ? companionFriends : undefined,
      medias: [cutPhoto.previewUri],
      mediaPrivacy: privateFriends.length > 0 ? { 0: privateFriends } : undefined,
      startDate: sStr,
      endDate: eStr,
      weather: weather || undefined,
      budget: budget ? { amount: Number(budget), currency } : undefined,
      flightType: flightType || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      viewType: 'cut',
      cutPhoto,
    });
    navigation.navigate('Main'); // 스택 루트가 항상 Main이 아닐 수 있어 명시적으로 Main으로 복귀
  };

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={st.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('cutInfo.travelInfo')}</Text>
        <View style={st.headerRight}>
          <TouchableOpacity
            onPress={() => setPrivacyVisible(true)}
            style={[st.lockBtn, privateFriends.length > 0 && st.lockBtnActive]}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {privateFriends.length > 0 ? (
              <LockClosedIcon size={13} color={C.white} />
            ) : (
              <LockOpenIcon size={13} color={C.textDim} />
            )}
            {privateFriends.length > 0 && (
              <View style={st.lockBadge}>
                <Text style={st.lockBadgeText}>{privateFriends.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[st.save, saving && { opacity: 0.5 }]}>{saving ? t('cutInfo.saving') : t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.scroll} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* 네컷 미리보기 */}
          {cutPhoto?.previewUri ? (
            <View style={st.previewWrap}>
              <Image source={{ uri: cutPhoto.previewUri }} style={st.previewImg} resizeMode="contain" />
            </View>
          ) : null}

          {/* 국가 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.country')}</Text><Text style={st.req}>✱</Text></View>
            <TouchableOpacity style={st.countryChip} onPress={() => setCountryModalVisible(true)} activeOpacity={0.8}>
              <Text style={selectedCountry ? st.countryChipTxt : st.countryChipPlaceholder}>
                {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.name}` : '+ 여행지 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 날짜 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.date')}</Text><Text style={st.req}>✱</Text></View>
            <TouchableOpacity style={st.dateBtn} onPress={() => setCalendarVisible(true)} activeOpacity={0.85}>
              <View style={st.dateCol}>
                <Text style={st.dateColLabel}>{t('cutInfo.departDate')}</Text>
                <Text style={st.dateColVal}>{fmtDate(startDate, t)}</Text>
              </View>
              <Text style={st.dateArrow}>→</Text>
              <View style={st.dateCol}>
                <Text style={st.dateColLabel}>{t('cutInfo.arriveDate')}</Text>
                <Text style={st.dateColVal}>{fmtDate(endDate ?? startDate, t)}</Text>
              </View>
              <View style={{ marginLeft: 8 }}><CalendarIcon size={18} color={C.purpleNeon} /></View>
            </TouchableOpacity>
          </View>

          {/* 글 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.text')}</Text><Text style={st.req}>✱</Text></View>
            <TextInput
              style={st.memoInput}
              placeholder={t('cutInfo.textPlaceholder')}
              placeholderTextColor={C.textMuted}
              value={memo} onChangeText={setMemo}
              multiline textAlignVertical="top"
            />
          </View>

          {/* 동행자 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.companionSelect')}</Text><Text style={st.req}>✱</Text></View>
            <View style={st.chipWrap}>
              {COMPANIONS.map(comp => {
                const active = companions.includes(comp);
                return (
                  <TouchableOpacity
                    key={comp}
                    style={[st.compChip, active && st.compChipActive]}
                    onPress={() => toggleCompanion(comp)}
                    activeOpacity={0.75}
                  >
                    <View style={st.compChipIcon}>{companionIcon(comp, active ? C.purpleNeon : C.textDim)}</View>
                    <Text style={[st.compChipTxt, active && st.compChipTxtActive]}>{companionLabel(comp, t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {companionFriends.length > 0 && (
              <View style={st.friendChipRow}>
                {companionFriends.map(friend => (
                  <View key={friend} style={st.friendChip}>
                    <View style={st.friendChipAvatar}><Text style={st.friendChipAvatarTxt}>{friend[0]}</Text></View>
                    <Text style={st.friendChipName}>{friend}</Text>
                    <TouchableOpacity onPress={() => removeCompanionFriend(friend)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={st.friendChipX}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={st.addFriendBtn} onPress={() => setFriendPickerVisible(true)} activeOpacity={0.75}>
              <FriendIcon size={16} color={C.purpleNeon} />
              <Text style={st.addFriendTxt}>{t('cutInfo.addAppFriend')}</Text>
              {companionFriends.length > 0 && (
                <View style={st.addFriendBadge}><Text style={st.addFriendBadgeTxt}>{companionFriends.length}</Text></View>
              )}
            </TouchableOpacity>
          </View>

          {/* 별점 */}
          <View style={st.fieldBlock}>
            <View style={st.ratingLabelRow}>
              <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.rating')}</Text><Text style={st.req}>✱</Text></View>
              {rating > 0
                ? <Text style={st.ratingScore}>{rating.toFixed(1)} / 5.0</Text>
                : <Text style={st.ratingScoreEmpty}>{t('cutInfo.ratingEmpty')}</Text>}
            </View>
            <View style={st.ratingCard}>{renderStars()}</View>
          </View>

          {/* 공개 범위 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.visibility')}</Text></View>
            <View style={st.chipRow}>
              {VISIBILITY_OPTIONS.map(opt => {
                const isActive = visibility === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[st.smallBtn, isActive && st.smallBtnActive]}
                    onPress={() => setVisibility(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[st.smallTxt, isActive && st.smallTxtActive]}>{visibilityLabel(opt.value, t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 선택 항목 구분선 */}
          <View style={st.divider} />
          <Text style={st.optNotice}>{t('cutInfo.optionalNotice')}</Text>

          {/* 예산 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <CoinIcon size={18} color={IC} />
              <Text style={st.optTitle}>{t('cutInfo.budget')}</Text>
              {budget ? <Text style={st.optValue}>{Number(budget).toLocaleString()} {currency}</Text> : null}
            </View>
            <View style={st.budgetRow}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[st.curChip, currency === c && st.curChipActive]} onPress={() => chooseCurrency(c)} activeOpacity={0.75}>
                  <Text style={[st.curTxt, currency === c && st.curTxtActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[st.curChip, !CURRENCIES.includes(currency) && st.curChipActive]}
                onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                activeOpacity={0.75}
              >
                <Text style={[st.curTxt, !CURRENCIES.includes(currency) && st.curTxtActive]}>
                  {CURRENCIES.includes(currency) ? t('cutInfo.otherCurrency') : currency}
                </Text>
              </TouchableOpacity>
              <TextInput
                style={st.budgetInput}
                placeholder={t('cutInfo.amountPlaceholder')} placeholderTextColor={C.textMuted}
                value={budget} onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* 날씨 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <PartlyCloudyIcon size={18} />
              <Text style={st.optTitle}>{t('cutInfo.weather')}</Text>
              {weather ? <Text style={st.optValue}>{weatherLabel(weather, t)}</Text> : null}
            </View>
            <View style={st.chipRow}>
              {WEATHER_OPTIONS.map(w => (
                <TouchableOpacity
                  key={w.value}
                  style={[st.smallBtn, weather === w.value && st.smallBtnActive]}
                  onPress={() => setWeather(weather === w.value ? '' : w.value)}
                  activeOpacity={0.75}
                >
                  {WEATHER_ICON_MAP[w.value]}
                  <Text style={[st.smallTxt, weather === w.value && st.smallTxtActive]}>{weatherLabel(w.value, t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 직항 / 경유 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <PlaneIcon size={18} color={IC} />
              <Text style={st.optTitle}>{t('cutInfo.flightTitle')}</Text>
              {flightType ? <Text style={st.optValue}>{flightLabel(flightType, t)}</Text> : null}
            </View>
            <View style={st.chipRow}>
              {FLIGHT_OPTIONS.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[st.flightBtn, flightType === f && st.flightBtnActive]}
                  onPress={() => setFlightType(flightType === f ? '' : f)}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {f === '직항'
                      ? <TakeoffIcon size={14} color={flightType === f ? C.purpleNeon : C.textDim} />
                      : <TransferIcon size={14} color={flightType === f ? C.purpleNeon : C.textDim} />}
                    <Text style={[st.flightTxt, flightType === f && st.flightTxtActive]}>{flightLabel(f, t)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 키워드 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <TagIcon size={18} color={IC} />
              <Text style={st.optTitle}>{t('cutInfo.keyword')}</Text>
              {keywords.length > 0 && <Text style={st.optValue}>{keywords.length}개</Text>}
            </View>
            <View style={st.kwBox}>
              {keywords.map(kw => (
                <TouchableOpacity key={kw} style={st.kwTag} onPress={() => setKeywords(prev => prev.filter(k => k !== kw))} activeOpacity={0.75}>
                  <Text style={st.kwTagTxt}>{kw}</Text>
                  <Text style={st.kwTagDel}> ✕</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={st.kwInput}
                value={keywordQuery}
                onChangeText={v => {
                  if (v.endsWith(' ')) { addKeyword(v); setKeywordQuery(''); }
                  else setKeywordQuery(v);
                }}
                placeholder={keywords.length === 0 ? '#키워드 추가' : '#'}
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => { addKeyword(keywordQuery); setKeywordQuery(''); }}
              />
            </View>
            <Text style={st.kwHint}>{t('cutInfo.keywordHint')}</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 캘린더 */}
      <RangeCalendar
        visible={calendarVisible}
        initialStart={startDate}
        initialEnd={endDate}
        onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
        onClose={() => setCalendarVisible(false)}
      />

      {/* 앱 친구 선택 모달 */}
      <Modal visible={friendPickerVisible} transparent animationType="slide" onRequestClose={() => setFriendPickerVisible(false)} statusBarTranslucent>
        <View style={fp.overlay} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setFriendPickerVisible(false)} />
          <View style={fp.sheet}>
            <View style={fp.handle} />
            <View style={fp.header}>
              <FriendIcon size={16} color={C.purpleNeon} />
              <Text style={fp.headerTitle}>{t('cutInfo.friendPickerTitle')}</Text>
            </View>
            <ScrollView style={fp.list} showsVerticalScrollIndicator={false}>
              {friendNames.length === 0 ? (
                <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
                  아직 팔로우한 친구가 없어요
                </Text>
              ) : friendNames.map(friend => {
                const selected = companionFriends.includes(friend);
                return (
                  <TouchableOpacity key={friend} style={[fp.row, selected && fp.rowActive]} onPress={() => toggleCompanionFriend(friend)} activeOpacity={0.7}>
                    <View style={[fp.avatar, selected && fp.avatarActive]}><Text style={fp.avatarTxt}>{friend[0]}</Text></View>
                    <Text style={[fp.name, selected && fp.nameActive]}>{friend}</Text>
                    <View style={[fp.check, selected && fp.checkActive]}>{selected && <Text style={fp.checkMark}>✓</Text>}</View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={fp.doneBtn} onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85}>
              <Text style={fp.doneTxt}>{companionFriends.length > 0 ? t('cutInfo.friendDoneN', { count: companionFriends.length }) : t('cutInfo.closeWithoutSelect')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 비공개 대상 선택 모달 (블로그와 동일) */}
      <PrivacyModal
        visible={privacyVisible}
        selectedFriends={privateFriends}
        allFriends={friendNames}
        onToggle={togglePrivateFriend}
        onSetAll={setPrivateFriends}
        onClose={() => setPrivacyVisible(false)}
      />

      {/* 기타 통화 선택 모달 */}
      <Modal visible={currencyModalVisible} transparent animationType="slide" onRequestClose={() => setCurrencyModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCurrencyModalVisible(false)} />
          <View style={cur.sheet}>
            <View style={cur.handle} />
            <Text style={cur.title}>{t('cutInfo.currencySelect')}</Text>
            <View style={cur.searchWrap}>
              <SearchIcon size={14} color={C.textDim} />
              <TextInput
                style={cur.searchInput}
                value={currencySearch} onChangeText={setCurrencySearch}
                placeholder={t('cutInfo.currencySearchPlaceholder')} placeholderTextColor={C.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {OTHER_CURRENCIES
                .filter(c => {
                  const q = currencySearch.trim().toLowerCase();
                  return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                })
                .map((c, idx, arr) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[cur.item, idx < arr.length - 1 && cur.itemBorder]}
                    onPress={() => { chooseCurrency(c.code); setCurrencyModalVisible(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={cur.code}>{c.code}</Text>
                    <Text style={cur.name}>{c.name}</Text>
                    {currency === c.code && <Text style={cur.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 국가 선택 모달 */}
      <Modal visible={countryModalVisible} transparent animationType="slide" onRequestClose={() => setCountryModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCountryModalVisible(false)} />
          <View style={ct.sheet}>
            <View style={ct.handle} />
            <Text style={ct.title}>{t('cutInfo.destSelect')}</Text>
            <View style={ct.searchWrap}>
              <SearchIcon size={14} color={C.textDim} />
              <TextInput
                style={ct.searchInput}
                value={countrySearch} onChangeText={setCountrySearch}
                placeholder={t('cutInfo.countrySearchPlaceholder')} placeholderTextColor={C.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {groupedCountries.map(g => (
                <View key={g.continent}>
                  <Text style={ct.continent}>{g.continent}</Text>
                  {g.countries.map(c => (
                    <TouchableOpacity
                      key={c.name}
                      style={ct.item}
                      onPress={() => { setSelectedCountry(c); setCountryModalVisible(false); setCountrySearch(''); }}
                      activeOpacity={0.75}
                    >
                      <Text style={ct.flag}>{c.flag}</Text>
                      <Text style={ct.name}>{c.name}</Text>
                      {selectedCountry?.name === c.name && <Text style={ct.check}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              {groupedCountries.length === 0 && (
                <Text style={ct.empty}>{t('cutInfo.noResult')}</Text>
              )}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  cancel: { fontSize: 16, color: C.textDim },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: C.white },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  lockBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  lockBtnActive: { backgroundColor: 'rgba(107,33,168,0.4)', borderWidth: 1, borderColor: C.purpleNeon },
  lockBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF3B30', borderRadius: 8, width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  lockBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  save: { fontSize: 16, fontWeight: '700', color: C.purpleNeon },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },

  previewWrap: { alignItems: 'center', marginBottom: 22 },
  previewImg: { width: '70%', height: 150, borderRadius: 10 },
  previewCountry: { color: C.textDim, fontSize: 13, marginTop: 8 },

  fieldBlock: { marginBottom: 20 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  label: { color: C.white, fontSize: 14, fontWeight: '700' },
  req: { color: C.purpleNeon, fontSize: 11 },

  countryChip: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.purpleBorder },
  countryChipTxt: { color: C.white, fontSize: 14, fontWeight: '600' },
  countryChipPlaceholder: { color: C.textDim, fontSize: 14 },

  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dateCol: { flex: 1 },
  dateColLabel: { color: C.textDim, fontSize: 11, marginBottom: 3 },
  dateColVal: { color: C.white, fontSize: 14, fontWeight: '600' },
  dateArrow: { color: C.textDim, fontSize: 16, marginHorizontal: 8 },

  memoInput: { backgroundColor: C.card, borderRadius: 12, padding: 14, color: C.white, fontSize: 14, minHeight: 96 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent',
  },
  compChipActive: { backgroundColor: C.purpleBg, borderColor: C.purpleBorder },
  compChipIcon: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  compChipTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  compChipTxtActive: { color: C.purpleNeon },

  friendChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  friendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 18, paddingLeft: 4, paddingRight: 10, paddingVertical: 4 },
  friendChipAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.purpleDeep, alignItems: 'center', justifyContent: 'center' },
  friendChipAvatarTxt: { color: C.white, fontSize: 11, fontWeight: '700' },
  friendChipName: { color: C.white, fontSize: 13 },
  friendChipX: { color: C.textDim, fontSize: 12 },

  addFriendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.purpleBorder, backgroundColor: 'rgba(191,133,252,0.06)' },
  addFriendTxt: { color: C.purpleNeon, fontSize: 13, fontWeight: '600' },
  addFriendBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.purpleDeep, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  addFriendBadgeTxt: { color: C.white, fontSize: 11, fontWeight: '700' },

  ratingLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ratingScore: { color: C.gold, fontSize: 13, fontWeight: '700' },
  ratingScoreEmpty: { color: C.textMuted, fontSize: 12 },
  ratingCard: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  ratingRow: { flexDirection: 'row', gap: 6 },
  starChar: { fontSize: 32, color: C.textMuted, lineHeight: 34 },
  starCharActive: { color: C.gold },
  starAbsolute: { position: 'absolute', left: 0, top: 0 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },

  divider: { height: 1, backgroundColor: C.divider, marginTop: 4, marginBottom: 16 },
  optNotice: { color: C.textDim, fontSize: 12, marginBottom: 16 },

  optRow: { marginBottom: 20 },
  optHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  optTitle: { color: C.white, fontSize: 14, fontWeight: '700' },
  optValue: { color: C.purpleNeon, fontSize: 12, marginLeft: 4 },

  budgetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  curChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent' },
  curChipActive: { backgroundColor: C.purpleBg, borderColor: C.purpleBorder },
  curTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  curTxtActive: { color: C.purpleNeon },
  budgetInput: { flex: 1, minWidth: 90, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: C.white, fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent' },
  smallBtnActive: { backgroundColor: C.purpleBg, borderColor: C.purpleBorder },
  smallTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  smallTxtActive: { color: C.purpleNeon },

  flightBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent' },
  flightBtnActive: { backgroundColor: C.purpleBg, borderColor: C.purpleBorder },
  flightTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  flightTxtActive: { color: C.purpleNeon },

  kwBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  kwTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  kwTagTxt: { color: C.purpleNeon, fontSize: 13 },
  kwTagDel: { color: C.purpleNeon, fontSize: 11 },
  kwInput: { flexGrow: 1, minWidth: 80, color: C.white, fontSize: 14, paddingVertical: 2 },
  kwHint: { color: C.textMuted, fontSize: 11, marginTop: 6 },
});

const cal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.textMuted, alignSelf: 'center', marginBottom: 14 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 12 },
  navArrow: { color: C.purpleNeon, fontSize: 26, fontWeight: '700', paddingHorizontal: 10 },
  ymLabel: { color: C.white, fontSize: 16, fontWeight: '700' },
  dowRow: { flexDirection: 'row', marginBottom: 6 },
  dow: { flex: 1, textAlign: 'center', color: C.textDim, fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayInRange: { backgroundColor: 'rgba(191,133,252,0.18)', borderRadius: 8 },
  dayEdge: { backgroundColor: C.purpleDeep, borderRadius: 18 },
  dayTxt: { color: C.white, fontSize: 14 },
  dayEdgeTxt: { color: C.white, fontWeight: '700' },
  confirmBtn: { marginTop: 14, backgroundColor: C.purpleDeep, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmTxt: { color: C.white, fontSize: 15, fontWeight: '700' },
});

const fp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.textMuted, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  list: { },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  rowActive: { },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.divider, alignItems: 'center', justifyContent: 'center' },
  avatarActive: { backgroundColor: C.purpleDeep },
  avatarTxt: { color: C.white, fontSize: 14, fontWeight: '700' },
  name: { flex: 1, color: C.textDim, fontSize: 15 },
  nameActive: { color: C.white, fontWeight: '600' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: C.purpleDeep, borderColor: C.purpleDeep },
  checkMark: { color: C.white, fontSize: 13, fontWeight: '700' },
  doneBtn: { marginTop: 14, backgroundColor: C.purpleDeep, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneTxt: { color: C.white, fontSize: 15, fontWeight: '700' },
});

const cur = StyleSheet.create({
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.textMuted, alignSelf: 'center', marginBottom: 14 },
  title: { color: C.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: C.divider },
  code: { color: C.white, fontSize: 14, fontWeight: '700', width: 54 },
  name: { flex: 1, color: C.textDim, fontSize: 14 },
  check: { color: C.purpleNeon, fontSize: 15, fontWeight: '700' },
});

const ct = StyleSheet.create({
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.textMuted, alignSelf: 'center', marginBottom: 14 },
  title: { color: C.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  continent: { color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingTop: 14, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  flag: { fontSize: 20 },
  name: { flex: 1, color: C.white, fontSize: 15 },
  check: { color: C.purpleNeon, fontSize: 15, fontWeight: '700' },
  empty: { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
});

// ─── 비공개 모달 스타일 (블로그 BlogRecordScreen의 pm과 동일) ───
const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1A1A28', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, maxHeight: '80%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  headerDesc: { fontSize: 12, color: '#A1A1B0', marginTop: 2 },
  clearAllBtn: { alignSelf: 'flex-end', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(191,133,252,0.12)' },
  clearAllTxt: { fontSize: 12, color: '#BF85FC', fontWeight: '600' },
  listScroll: { maxHeight: 320 },
  allPrivateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderRadius: 12, gap: 14, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  allPrivateLabel: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  allPrivateDesc: { fontSize: 12, color: '#8A8A99', marginTop: 2 },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderRadius: 12, gap: 14, marginBottom: 2 },
  friendRowActive: { backgroundColor: 'rgba(107,33,168,0.15)' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  avatarActive: { backgroundColor: 'rgba(107,33,168,0.4)' },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  friendName: { flex: 1, fontSize: 15, color: '#A1A1B0', fontWeight: '500' },
  friendNameActive: { color: '#FFFFFF', fontWeight: '600' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#4A4A59', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  checkMark: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
  doneBtn: { backgroundColor: '#6B21A8', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  doneTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
