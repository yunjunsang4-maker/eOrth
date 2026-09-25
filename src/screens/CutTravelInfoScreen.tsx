import { success, warn } from '../utils/haptics';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Modal,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { countryLabel, continentLabel } from '../utils/countryLabel';
import { useSkinAccent } from '../constants/skinTheme';
import { TRAVEL_MOMENTS_ENABLED } from '../constants/featureFlags';
import type { TFunction } from 'i18next';
import { useRecords, type Visibility } from '../store/recordStore';
import { collectRecordedDateKeys, collectRecordedRanges } from '../utils/recordedDates';
import { CalendarBottomSheet, PillRing } from '../components/record/CalendarBottomSheet';
import { PrivacyModal } from '../components/record/PrivacyModal';
import { andFitText } from '../utils/fitText';
import { detectCurrentCountry } from '../services/snapService';
import { currencyForCountryName } from '../constants/countryCurrency';
import type { CutLayout } from '../constants/cutFrames';
import { COUNTRIES, Country, CONTINENT_ORDER } from '../constants/countries';
import type { RootStackScreenProps } from '../navigation/types';
import { useMoments } from '../store/momentStore';
import { matchMoments, countryNameToCode } from '../utils/momentMatch';
import MomentListSheet from '../components/moments/MomentListSheet';
import { STAGE_MAX_W } from '../utils/stage';
import {
  CoinIcon, TagIcon, TakeoffIcon, TransferIcon,
  PartlyCloudyIcon, PlaneIcon, SearchIcon,
  SoloIcon, FriendIcon, CoupleIcon, FamilyIcon, ParentIcon, SiblingIcon,
  SunIcon, CloudyIcon, RainIcon, SnowIcon, WindIcon,
  LockClosedIcon, LockOpenIcon, OutlineCalendarIcon,
  BackChevronIcon,
} from '../components/icons';

// 디자인 토큰 — BlogRecordScreen의 C와 같은 표(2026-09-24 기록 화면 UI 통일).
// 강조색(구 보라 고정색 4종 — 네온/딥/바탕/테두리)은 여기서 제거했다 —
// 스킨 연동을 위해 makeStyles(a, ad, tint) 인자로 넘어간다. 보라가 박혀 있으면
// 스킨을 cyan/mint로 바꿔도 이 화면만 보라로 남는다(블로그가 겪은 문제 그대로).
const C = {
  bg: '#0A0A0F', editorBg: '#111118', card: '#2E2E3B', cardLight: '#1E1B33',
  white: '#FFFFFF', dim: '#A1A1B0', muted: '#4A4A59', divider: '#1A1A26',
  gold: '#FFD700',
};

/** 헤더 저장 알약 치수 — 테두리는 AutoPillRing이 실측하므로, 이 값은 st.saveBtn 스타일 전용이다
 *  (BlogRecordScreen의 SAVE_BTN_H/R과 같은 값) */
const SAVE_BTN_H = 30;
const SAVE_BTN_R = SAVE_BTN_H / 2;

/** 부모 알약을 꽉 채우는 투명 층이 자기 크기를 실측해 PillRing(좌상단·우하단 흰색 대각 그라데이션 테두리)을 얹는다.
 *  BlogRecordScreen·CutRecordScreen의 같은 이름 함수를 그대로 옮긴 로컬 사본이다 —
 *  PillRing은 Rect width를 **숫자**로 받아야 하고(안드로이드는 width="100%"가 폭 변경 뒤 갱신되지 않는다),
 *  absoluteFill 층의 레이아웃이 곧 부모 알약의 크기다. 반경은 높이/2(완전 알약).
 *  ⚠️ 부모에 borderWidth·overflow:'hidden'을 주지 말 것 — 링이 잘리거나 실측이 안쪽으로 밀린다.
 *  이 층을 감싼 View의 pointerEvents="none"이 규칙 12(오버레이 Svg는 View로 감쌀 것)를 만족시킨다. */
function AutoPillRing() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        // Math.round는 달력 호출부와 같다 — 서브픽셀 폭이 들어오면 테두리가 반 픽셀 흐려진다
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h })); // 같은 값 setState로 도는 루프 방지
      }}
    >
      {/* 첫 렌더에는 size.w가 0이라 PillRing이 스스로 null을 반환한다.
          diagonal: 좌상단·우하단이 흰색, 가운데로 갈수록 투명한 대각 대칭(블로그 알약과 동일) */}
      <PillRing width={size.w} height={size.h} radius={size.h / 2} diagonal />
    </View>
  );
}

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
// 표시 문구는 visibilityLabel(), 아이콘은 visibilityIcon()이 담당한다 (동행자 칩과 동일 구조)
const VISIBILITY_OPTIONS: { value: Visibility }[] = [
  { value: 'neighbors' },
  { value: 'private' },
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
    case 'neighbors': return tr('newRecord.visNeighbors');
    case 'private':   return tr('newRecord.visPrivate');
    default: return '';
  }
};

// 공개 범위 아이콘 — 기본 이모지(🏡/🔒)는 기기 폰트마다 모양·크기가 달라
// 옆의 동행자 칩과 톤이 어긋났다. 제작 SVG 세트로 통일한다.
const visibilityIcon = (v: Visibility, color: string): React.ReactNode => {
  switch (v) {
    case 'neighbors': return <FriendIcon size={16} color={color} />;
    case 'private':   return <LockClosedIcon size={16} color={color} />;
    default: return null;
  }
};


type CutPhotoParam = { layout: CutLayout; frameId: string; frameColor?: string; photos: string[]; previewUri: string };

export default function CutTravelInfoScreen({ navigation, route }: RootStackScreenProps<'CutTravelInfo'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const skinAccent = useSkinAccent(); // 스킨 변경 구독 + 강조색 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const st = useSt(); // 스킨색이 박힌 스타일시트 (블로그 기록 화면과 같은 패턴)
  // 국가·날짜 칩 색 — BlogRecordScreen과 같은 판정. 시안 값(rgba(117,26,173,0.2) / #E0C9FF)은
  // aurora(보라) 전용이라 그대로 박으면 cyan·mint 스킨에서 보라가 남는다.
  // ringGradient 유무로 커스텀 스킨을 판정해 갈라 쓴다 (aurora만 ringGradient가 null).
  const customSkin = !!skinAccent.ringGradient;
  const chipBg = customSkin ? skinAccent.tint(0.2) : 'rgba(117,26,173,0.2)'; // 시안 rgba(117,26,173,0.2)
  const chipFg = customSkin ? skinAccent.accent : '#E0C9FF';
  const { addRecord, addTripGroup, neighbors, records } = useRecords();
  // 함께한 메이트·비공개 대상 목록은 실제 팔로우한 메이트에서 가져온다 (데모 메이트 제거)
  const friendNames = neighbors.map((f) => f.username);
  const cutPhoto: CutPhotoParam | undefined = route?.params?.cutPhoto;
  const initialCountry = route?.params?.selectedCountry as { flag?: string; name?: string; region?: string; regionEn?: string } | undefined;
  // 여행 카드에서 추가 시 받은 여행 정보(기간·동행자·별점·상세)를 기본값으로 적용
  const tripPrefill = route?.params?.tripPrefill;
  // "YYYY.MM.DD"를 로컬 자정으로 직접 파싱 — new Date('YYYY-MM-DD')는 UTC 자정 해석이라
  // 미주 등 UTC 음수 시간대에서 표시·저장 날짜가 하루 밀린다 (NewRecordScreen과 동일 파서).
  const parseTripDate = (s?: string): Date | null => {
    if (!s) return null;
    const [y, m, d] = s.split(/[.\-/]/).map(p => parseInt(p, 10));
    if (
      Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) &&
      m >= 1 && m <= 12 && d >= 1 && d <= 31
    ) {
      const dt = new Date(y, m - 1, d);
      dt.setHours(0, 0, 0, 0);
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
    }
    return null;
  };

  // ─── 국가 선택 (복수 가능 — 첫 번째가 대표 국가) ───
  const MAX_COUNTRIES = 10;
  const [selectedCountries, setSelectedCountries] = useState<Country[]>(() => {
    const found = initialCountry?.name ? COUNTRIES.find(c => c.name === initialCountry.name!.split(' - ')[0]) : null;
    return found ? [found] : [];
  });
  const selectedCountry = selectedCountries[0] ?? null; // 대표 국가 — 통화 추천·유효성 등 기존 로직 호환
  const toggleCountry = (c: Country) =>
    setSelectedCountries(prev =>
      prev.some(p => p.name === c.name)
        ? prev.filter(p => p.name !== c.name)
        : prev.length >= MAX_COUNTRIES ? prev : [...prev, c]
    );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(
    initialCountry?.region ? { name: initialCountry.region, nameEn: initialCountry.regionEn || '' } : null
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  // 검색어는 모달을 닫을 때 비운다 — 남겨두면 다음에 열었을 때 목록이 필터된 채로 떠서
  // "국가가 몇 개 없다"고 오해하게 된다. 배경 탭·완료·뒤로가기 세 경로 모두 이걸 거친다.
  const closeCountryModal = () => { setCountryModalVisible(false); setCountrySearch(''); };

  // 선택 국가에 이미 기록된 날짜 — 기간 캘린더에 점으로 표시해 같은 여행에 기록을 추가하기 쉽게
  const recordedDates = useMemo(
    () => collectRecordedDateKeys(records, selectedCountries.map(c => c.name)),
    [records, selectedCountries]
  );

  // 기존 여행 기간 — 국가 구별 없이 전체를 캡슐 밴드로 표시 (피드 기록과 동일 규칙)
  const recordedRanges = useMemo(() => collectRecordedRanges(records), [records]);

  // ─── 메타 상태 (피드와 동일 — 여행 카드 프리필을 기본값으로) ───
  const [startDate, setStartDate] = useState<Date | null>(() => parseTripDate(tripPrefill?.startDate));
  const [endDate, setEndDate] = useState<Date | null>(() => parseTripDate(tripPrefill?.endDate));
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [momentSheetVisible, setMomentSheetVisible] = useState(false); // ✨ 여행 기억 시트 (헤더 버튼)
  const [memo, setMemo] = useState('');
  const [companions, setCompanions] = useState<string[]>(tripPrefill?.companions ?? []);
  const [companionFriends, setCompanionFriends] = useState<string[]>(tripPrefill?.companionFriends ?? []);
  const [visibility, setVisibility] = useState<Visibility>('neighbors');
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [privateFriends, setPrivateFriends] = useState<string[]>([]);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [rating, setRating] = useState(tripPrefill?.rating ?? 0);
  const [budget, setBudget] = useState(tripPrefill?.budget ? String(tripPrefill.budget.amount) : '');
  const [currency, setCurrency] = useState(tripPrefill?.budget?.currency ?? 'KRW');
  // 사용자가 통화를 직접 고르면 국가 기반 자동 추천을 멈춘다
  // (여행 카드 프리필로 통화가 이미 정해진 경우도 수동 취급)
  const currencyTouchedRef = useRef(!!tripPrefill?.budget);
  const chooseCurrency = (code: string) => { currencyTouchedRef.current = true; setCurrency(code); };
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather, setWeather] = useState(tripPrefill?.weather ?? '');
  const [flightType, setFlightType] = useState(tripPrefill?.flightType ?? '');
  const [keywords, setKeywords] = useState<string[]>(tripPrefill?.keywords ?? []);
  const [keywordQuery, setKeywordQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // ── 작성 화면 참고용 서랍: 선택 국가+날짜로 순간 매칭 ──
  // startDate/endDate는 Date | null 타입
  const { moments: allMoments } = useMoments();
  const matchedMoments = useMemo(() => {
    const first = selectedCountries[0] ?? null;
    const startMs = startDate instanceof Date ? startDate.getTime() : null;
    const endMs = endDate instanceof Date ? endDate.getTime() : (startMs ?? null);
    return matchMoments(allMoments, {
      countryCode: countryNameToCode(first?.name),
      startMs,
      endMs,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMoments, selectedCountries, startDate, endDate]);

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
      const { countryCode, countryName, city } = await detectCurrentCountry({ allowPrompt: true });
      if (cancelled || (!countryCode && !countryName)) return;
      const found =
        (countryCode && COUNTRIES.find(c => c.term.split(' ')[0].toUpperCase() === countryCode.toUpperCase())) ||
        (countryName && COUNTRIES.find(c => c.name === countryName || c.term.toLowerCase().includes(countryName.toLowerCase()))) ||
        null;
      if (!found) return;
      setSelectedCountries(prev => (prev.length ? prev : [found]));
      if (city) setSelectedRegion(prev => prev ?? { name: city, nameEn: city });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 캘린더에서 기존 여행 밴드를 탭하면 그 여행 정보를 폼에 채운다.
  // 사진(cutPhoto)·글(memo)은 콘텐츠 필드이므로 건드리지 않는다.
  const applySourceRecord = (recordId: string, start: Date, end: Date) => {
    const src = records.find(r => r.id === recordId);
    if (!src) return;
    // 국가 — 다국가 배열 우선, 없으면 대표 국가 1개
    const matched = (src.countries ?? [{ flag: src.countryFlag, name: src.countryName }])
      .map(c => COUNTRIES.find(k => k.name === c.name))
      .filter((c): c is Country => !!c);
    if (matched.length) setSelectedCountries(matched);
    // 지역
    setSelectedRegion(src.regionName ? { name: src.regionName, nameEn: src.regionNameEn ?? '' } : null);
    // 기간 — 탭한 밴드 기간으로 동기화
    setStartDate(start);
    setEndDate(end);
    // 별점
    setRating(src.rating ?? 0);
    // 동행자
    setCompanions(src.companions ?? []);
    setCompanionFriends(src.companionFriends ?? []);
    // 공개범위
    setVisibility(src.visibility ?? 'neighbors');
    // 예산·통화 — 소스에 예산이 있을 때만 통화까지 복사(자동추천 차단), 없으면 국가 기반 자동추천 유지
    if (src.budget) {
      setBudget(String(src.budget.amount));
      setCurrency(src.budget.currency);
      currencyTouchedRef.current = true;
    } else {
      setBudget('');
      currencyTouchedRef.current = false;
    }
    // 날씨·항공·태그
    setWeather(src.weather ?? '');
    setFlightType(src.flightType ?? '');
    setKeywords(src.keywords ?? []);
    // 캘린더 닫고 폼 복귀
    setCalendarVisible(false);
  };

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
  // STAR_GAP은 st.ratingRow의 gap과 **반드시 같아야** 한다 — 드래그 히트테스트가
  // i * (STAR_SIZE + STAR_GAP)로 별 위치를 역산하기 때문(블로그 기록 화면과 같은 불변식).
  const STAR_GAP = 8;
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
    // 글(memo)은 선택 항목
    if (companions.length === 0) { Alert.alert(t('cutInfo.companionTitle'), t('cutInfo.companionMsg')); return; }
    if (rating <= 0) { Alert.alert(t('cutInfo.ratingTitle'), t('cutInfo.ratingMsg')); return; }
    if (!cutPhoto) { Alert.alert(t('cutInfo.errorTitle'), t('cutInfo.noCutInfo')); return; }

    // 다국가 선택: 게시물은 하나, 프로필 여행 카드를 하나로 할지 국가별로 나눌지 선택 (피드와 동일)
    if (selectedCountries.length > 1) {
      Alert.alert(
        t('newRecord.splitAskTitle'),
        t('newRecord.splitAskMsg', { count: selectedCountries.length }),
        [
          { text: t('newRecord.splitAskCancel'), style: 'cancel' },
          { text: t('newRecord.splitAskSplit'), onPress: () => doSave(true) },
          { text: t('newRecord.splitAskMerge'), onPress: () => doSave(false) },
        ]
      );
      return;
    }
    doSave(false);
  };

  const doSave = (splitByCountry: boolean) => {
    if (savingRef.current || !selectedCountry || !startDate || !cutPhoto) return;
    savingRef.current = true;
    setSaving(true);
    // ⚠️ 아래 전체를 try/catch 로 감싼다 — 예외가 나면 저장 상태가 영영 안 풀려 버튼이
    // '저장 중…' 으로 고정되고, savingRef 가 true 라 이탈 확인(beforeRemove)까지 건너뛰어
    // 사용자가 경고 없이 화면을 떠나며 작성 내용을 통째로 잃는다.
    try {
    const sStr = fmtDate(startDate, t);
    const eStr = fmtDate(endDate ?? startDate, t);
    const recId = addRecord({
      user: { name: '', emoji: '✈️', handle: '' }, // 작성자 정보는 addRecord가 로그인 사용자로 채움
      country: `${selectedCountry.flag ?? ''} ${selectedCountry.name ?? ''}`.trim(),
      countryName: selectedCountry.name || '',
      countryFlag: selectedCountry.flag || '',
      countries: selectedCountries.map(c => ({ flag: c.flag, name: c.name })),
      splitByCountry: splitByCountry || undefined,
      regionName: selectedRegion?.name || undefined,
      regionNameEn: selectedRegion?.nameEn || undefined,
      date: sStr,
      // 글 미입력 시 피드와 동일한 기본 제목 (카드/목록 표시용 텍스트)
      content: memo.trim() || (selectedCountries.length === 1
        ? t('newRecord.defaultTitleOne', { country: selectedCountry.name })
        : t('newRecord.defaultTitleMany', { country: selectedCountry.name, count: selectedCountries.length - 1 })),
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
    }, { linkTrip: !splitByCountry }); // 나누기 모드는 아래에서 국가별 카드를 직접 만든다
    if (splitByCountry) {
      // 같은 기록 하나를 국가별 여행 카드로 (피드 기록과 동일한 패턴).
      // session: 여행 중 작성(실시간)이면 카드가 세션에 등록돼 이후 그 국가의 스냅이 합류한다
      selectedCountries.forEach((c) => {
        addTripGroup(
          {
            title: `${c.name} 여행`,
            records: [recId],
            coverRecordId: recId,
            countryName: c.name,
            countryFlag: c.flag,
          },
          { session: { startDate: sStr, endDate: eStr, date: sStr } }
        );
      });
    }
    success(); // 스트립 발행 완료
    navigation.navigate('Main'); // 스택 루트가 항상 Main이 아닐 수 있어 명시적으로 Main으로 복귀
    } catch (e) {
      savingRef.current = false;
      setSaving(false);
      Alert.alert(t('cutInfo.saveFailTitle'), t('cutInfo.saveFailMsg'));
    }
  };

  // ─── 이탈 확인 ───
  // 헤더 '취소'뿐 아니라 Android 하드웨어 뒤로가기·iOS 스와이프백까지 beforeRemove 한 경로로 방어.
  // 여행 카드에서 받은 프리필만 들어 있는 상태(사용자가 아무것도 안 건드림)는 '입력 없음'으로 봐
  // 들어오자마자 뒤로 갈 때 불필요한 확인창이 뜨지 않게 한다 → 첫 렌더 스냅샷과 비교.
  // 국가·지역·통화는 위치/국가 기반으로 자동 채워지므로 비교 대상에서 제외한다.
  const formSig = JSON.stringify({
    s: startDate ? startDate.getTime() : null,
    e: endDate ? endDate.getTime() : null,
    memo: memo.trim(),
    companions, companionFriends, rating,
    budget: budget.trim(), weather, flightType, keywords, privateFriends, visibility,
  });
  const initialSigRef = useRef(formSig); // 첫 렌더 값으로 고정
  const dirtyRef = useRef(false);
  dirtyRef.current = formSig !== initialSigRef.current;

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (savingRef.current) return; // 저장 완료(Main 복귀)로 인한 정상 이탈은 통과
      if (!dirtyRef.current) return;
      e.preventDefault();
      warn(); // 되돌릴 수 없는 동작을 묻는 중
      Alert.alert(t('newRecord.cancelWriteTitle'), t('newRecord.cancelWriteMsg'), [
        { text: t('newRecord.continueWrite'), style: 'cancel' },
        { text: t('newRecord.exit'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
        {/* 뒤로가기 — 앱 전 화면 공통 chevron(박스 없음) */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
          <BackChevronIcon />
        </TouchableOpacity>
        {/*
          제목은 헤더 가로 전체를 덮는 절대배치라, 방어가 없으면 좌우 버튼의 세로 중앙 띠를 삼킨다.
          그 방어를 <Text>가 아니라 래퍼 <View>의 pointerEvents **prop**으로 건다 —
          RN 0.81.5의 Text는 pointerEvents가 타입 선언(Libraries/Text/Text.d.ts:211-213)만 있고
          안드로이드 네이티브 구현이 0건(ReactAndroid/.../views/text/)이라, style이든 prop이든
          안드로이드에선 아무 일도 일어나지 않는다. tsc도 lint도 못 잡고 iOS는 지키기 때문에
          "안드로이드에서만 취소 버튼이 안 눌린다"로 나타났다. 반면 View는 ReactViewGroup에
          구현이 있어 히트테스트 진입 전에 서브트리가 통째로 빠진다(레포 선례 42곳과 같은 형태).

          래퍼에 top/bottom을 주지 않는 이유: 세로 중앙을 지금과 똑같이 재현하려는 것.
          헤더의 alignItems:'center'가 절대배치 자식을 세로 중앙에 놓는데, 래퍼 높이가
          제목 한 줄(= 예전 Text 높이)과 같으므로 픽셀 위치가 그대로 유지된다.
          top:0/bottom:0으로 늘리면 borderBottomWidth:1 때문에 중심이 0.5px 어긋난다.
        */}
        <View style={st.headerTitleWrap} pointerEvents="none">
          <Text style={st.headerTitle}>{t('cutInfo.travelInfo')}</Text>
        </View>
        <View style={st.headerRight}>
          {/* ✨ 여행 기억 버튼은 국가 필드로 이동(중앙정렬 제목과 겹침 방지) */}
          <TouchableOpacity
            onPress={() => setPrivacyVisible(true)}
            style={[st.lockBtn, privateFriends.length > 0 && [st.lockBtnActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]]}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {privateFriends.length > 0 ? (
              <LockClosedIcon size={17} color={C.white} />
            ) : (
              <LockOpenIcon size={17} color={C.dim} />
            )}
            {privateFriends.length > 0 && (
              <View style={st.lockBadge}>
                <Text style={st.lockBadgeText}>{privateFriends.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* 링(AutoPillRing 흰색 대각 그라데이션) → 콘텐츠 순. 링 층은 absoluteFill이라 Text 가운데 정렬도
              탭도 건드리지 않고, 폭은 문구('저장'/'저장 중…'/다국어)마다 달라져 AutoPillRing이 스스로 실측한다 */}
          <TouchableOpacity onPress={handleSave} disabled={saving} style={st.saveBtnWrap} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={[st.saveBtn, saving && { opacity: 0.5 }]}>
              <AutoPillRing />
              <Text style={st.saveBtnText} {...andFitText}>{saving ? t('cutInfo.saving') : t('common.save')}</Text>
            </View>
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

          {/* 국가 — 아래 여백만 0이다. 블로그는 국가 행(topChipRow)에 bottom 여백이 없고
              날짜 칩의 marginTop 16 하나가 둘 사이를 띄운다. 여기서 18을 남기면 18+16=34가 된다. */}
          {/* 블로그 topChipRow와 같은 구조 — 라벨·✱ 없이 칩이 라벨을 겸한다(블로그는 ✱을 어디서도 안 쓴다).
              ✨ 여행 기억 버튼은 블로그처럼 칩과 같은 행(플래그 OFF) */}
          <View style={st.topChipRow}>
            {/* 링(AutoPillRing) → 콘텐츠 순. 바탕색은 스킨별 인라인(chipBg) */}
            <TouchableOpacity style={[st.countryChip, { backgroundColor: chipBg }]} onPress={() => setCountryModalVisible(true)} activeOpacity={0.8}>
              <AutoPillRing />
              <Text style={selectedCountry ? [st.countryChipText, { color: chipFg }] : st.countryChipPlaceholder} numberOfLines={1}>
                {selectedCountries.length > 0
                  ? selectedCountries.map(c => `${c.flag} ${countryLabel(c.name, i18n.language)}`).join(', ')
                  : t('blog.selectDestination')}
              </Text>
            </TouchableOpacity>
            {TRAVEL_MOMENTS_ENABLED && (
              <TouchableOpacity
                onPress={() => setMomentSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('moments.sheetTitle')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 18 }}>✨</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 여행 기억(✨)은 헤더 우측 버튼 → MomentListSheet로 이동(사용자 결정) */}

          {/* 날짜 칩 — 국가 칩과 같은 알약(링 → 콘텐츠 순), 누르면 달력.
              블로그처럼 칩 자체가 라벨을 겸하므로 라벨 행(라벨 + ✱)은 두지 않는다
              — 블로그도 국가·날짜 칩에 ✱을 붙이지 않는다(PanelRow required는 어디서도 안 쓴다). */}
          {/* 블로그는 칩 아래 여백을 제목 입력(marginTop 16)이 갖지만 이 화면은 아래가 fieldBlock
              연속이라, 래퍼를 둬 아래쪽만 같은 리듬(marginBottom 18)으로 맞춘다.
              위쪽 16은 st.dateChip의 marginTop이 그대로 만든다(= 블로그와 동일). */}
          <View style={st.fieldBlock}>
            <TouchableOpacity style={[st.countryChip, st.dateChip, { backgroundColor: chipBg }]} onPress={() => setCalendarVisible(true)} activeOpacity={0.8}>
              <AutoPillRing />
              <OutlineCalendarIcon size={12} color={startDate ? chipFg : C.muted} />
              <Text style={startDate ? [st.countryChipText, { color: chipFg }] : st.countryChipPlaceholder} numberOfLines={1}>
                {startDate
                  ? (endDate && endDate.getTime() !== startDate.getTime()
                      ? `${fmtDate(startDate, t)} ~ ${fmtDate(endDate, t)}`
                      : fmtDate(startDate, t))
                  : t('cutInfo.date')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 글 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.text')}</Text></View>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
              style={st.memoInput}
              placeholder={t('cutInfo.textPlaceholder')}
              placeholderTextColor={C.muted}
              value={memo} onChangeText={setMemo}
              multiline textAlignVertical="top"
            />
          </View>

          {/* 동행자 */}
          <View style={st.fieldBlock}>
            <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.companionSelect')}</Text></View>
            <View style={st.chipRow}>
              {COMPANIONS.map(comp => {
                const active = companions.includes(comp);
                return (
                  <TouchableOpacity
                    key={comp}
                    style={[st.chip, active && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]}
                    onPress={() => toggleCompanion(comp)}
                    activeOpacity={0.75}
                  >
                    {/* st.chip은 블로그와 같이 방향이 없는 상자다 — 아이콘+글자는 반드시 이 행 래퍼 안에 둔다
                        (빼면 세로로 쌓인다). 블로그의 아이콘 달린 칩이 전부 같은 형태다. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={st.compChipIcon}>{companionIcon(comp, active ? skinAccent.accent : C.dim)}</View>
                      <Text style={[st.chipText, active && [st.chipTextActive, { color: skinAccent.accent }]]}>{companionLabel(comp, t)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {companionFriends.length > 0 && (
              <View style={[st.chipRow, { marginTop: 8 }]}>
                {companionFriends.map(friend => (
                  <View key={friend} style={[st.friendChip, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]}>
                    <View style={[st.friendChipAvatar, { backgroundColor: skinAccent.tint(0.3) }]}><Text style={st.friendChipAvatarTxt}>{friend[0]}</Text></View>
                    <Text style={[st.friendChipName, { color: skinAccent.accent }]}>{friend}</Text>
                    <TouchableOpacity onPress={() => removeCompanionFriend(friend)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={{ color: C.muted, fontSize: 10 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={[st.addFriendBtn, { borderColor: skinAccent.tint(0.3) }]} onPress={() => setFriendPickerVisible(true)} activeOpacity={0.75}>
              <FriendIcon size={16} color={skinAccent.accent} />
              <Text style={[st.addFriendTxt, { color: skinAccent.accent }]}>{t('cutInfo.addAppFriend')}</Text>
              {companionFriends.length > 0 && (
                <View style={[st.addFriendBadge, { backgroundColor: skinAccent.accentDeep }]}><Text style={st.addFriendBadgeTxt}>{companionFriends.length}</Text></View>
              )}
            </TouchableOpacity>
          </View>

          {/* 별점 */}
          <View style={st.fieldBlock}>
            <View style={st.ratingLabelRow}>
              <View style={st.labelRow}><Text style={st.label}>{t('cutInfo.rating')}</Text></View>
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
                    style={[st.chip, isActive && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]}
                    onPress={() => setVisibility(opt.value)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={st.compChipIcon}>{visibilityIcon(opt.value, isActive ? skinAccent.accent : C.dim)}</View>
                      <Text style={[st.chipText, isActive && [st.chipTextActive, { color: skinAccent.accent }]]}>{visibilityLabel(opt.value, t)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* 칩 라벨('메이트만')과 실제 처리 범위가 어긋나지 않게 붙이는 안내 — i18n 주석 참조 */}
            <Text style={st.visNotice}>
              {visibility === 'private' ? t('newRecord.visNoticePrivate') : t('newRecord.visNoticeNeighbors')}
            </Text>
          </View>

          {/* 선택 항목 구분선 */}
          <View style={st.divider} />
          <Text style={st.optNotice}>{t('cutInfo.optionalNotice')}</Text>

          {/* 예산 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <CoinIcon size={18} color={skinAccent.accent} />
              <Text style={st.optTitle}>{t('cutInfo.budget')}</Text>
              {budget ? <Text style={[st.optValue, { color: skinAccent.accent }]}>{Number(budget).toLocaleString()} {currency}</Text> : null}
            </View>
            <View style={st.budgetRow}>
              {/* 통화만 전용 칩(currencyChip) — 블로그도 선택 칩과 따로 쓴다.
                  활성 바탕이 틴트가 아니라 accentDeep이라 다른 칩보다 진하다(블로그 호출부와 동일) */}
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[st.currencyChip, currency === c && [st.currencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]} onPress={() => chooseCurrency(c)} activeOpacity={0.75}>
                  <Text style={[st.currencyTxt, currency === c && [st.currencyTxtActive, { color: skinAccent.accent }]]}>{c}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[st.currencyChip, !CURRENCIES.includes(currency) && [st.currencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                activeOpacity={0.75}
              >
                <Text style={[st.currencyTxt, !CURRENCIES.includes(currency) && [st.currencyTxtActive, { color: skinAccent.accent }]]}>
                  {CURRENCIES.includes(currency) ? t('cutInfo.otherCurrency') : currency}
                </Text>
              </TouchableOpacity>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={st.budgetInput}
                placeholder={t('cutInfo.amountPlaceholder')} placeholderTextColor={C.muted}
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
              {weather ? <Text style={[st.optValue, { color: skinAccent.accent }]}>{weatherLabel(weather, t)}</Text> : null}
            </View>
            <View style={st.chipRow}>
              {WEATHER_OPTIONS.map(w => (
                <TouchableOpacity
                  key={w.value}
                  style={[st.chip, weather === w.value && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]}
                  onPress={() => setWeather(weather === w.value ? '' : w.value)}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {WEATHER_ICON_MAP[w.value]}
                    <Text style={[st.chipText, weather === w.value && [st.chipTextActive, { color: skinAccent.accent }]]}>{weatherLabel(w.value, t)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 직항 / 경유 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <PlaneIcon size={18} color={skinAccent.accent} />
              <Text style={st.optTitle}>{t('cutInfo.flightTitle')}</Text>
              {flightType ? <Text style={[st.optValue, { color: skinAccent.accent }]}>{flightLabel(flightType, t)}</Text> : null}
            </View>
            <View style={st.chipRow}>
              {FLIGHT_OPTIONS.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[st.chip, flightType === f && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]}
                  onPress={() => setFlightType(flightType === f ? '' : f)}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {f === '직항'
                      ? <TakeoffIcon size={14} color={flightType === f ? skinAccent.accent : C.dim} />
                      : <TransferIcon size={14} color={flightType === f ? skinAccent.accent : C.dim} />}
                    <Text style={[st.chipText, flightType === f && [st.chipTextActive, { color: skinAccent.accent }]]}>{flightLabel(f, t)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 키워드 */}
          <View style={st.optRow}>
            <View style={st.optHeader}>
              <TagIcon size={18} color={skinAccent.accent} />
              <Text style={st.optTitle}>{t('cutInfo.keyword')}</Text>
              {keywords.length > 0 && <Text style={[st.optValue, { color: skinAccent.accent }]}>{t('newRecord.keywordCountN', { count: keywords.length })}</Text>}
            </View>
            {/* 블로그와 같은 구조 — 태그 줄(kwTagRow)과 입력칸(kwInput)이 형제다.
                예전엔 한 상자(kwBox) 안에 태그와 입력이 섞여 있어 블로그와 모양이 달랐다. */}
            <View style={st.kwWrap}>
              {keywords.length > 0 && (
                <View style={st.kwTagRow}>
                  {keywords.map(kw => (
                    <TouchableOpacity key={kw} style={[st.kwTag, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.35) }]} onPress={() => setKeywords(prev => prev.filter(k => k !== kw))} activeOpacity={0.75}>
                      <Text style={[st.kwTagText, { color: skinAccent.accent }]}>{kw}</Text>
                      <Text style={st.kwTagDel}> ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={st.kwInput}
                value={keywordQuery}
                onChangeText={v => {
                  if (v.endsWith(' ')) { addKeyword(v); setKeywordQuery(''); }
                  else setKeywordQuery(v);
                }}
                placeholder={keywords.length === 0 ? t('newRecord.keywordPlaceholder') : '#'}
                placeholderTextColor={C.muted}
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
      {(() => {
        const todayInit = new Date(); todayInit.setHours(0, 0, 0, 0);
        return (
          <CalendarBottomSheet
            visible={calendarVisible}
            initialStart={startDate ?? todayInit}
            initialEnd={endDate ?? startDate ?? todayInit}
            onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
            onClose={() => setCalendarVisible(false)}
            recordedDates={recordedDates}
            recordedRanges={recordedRanges}
            onSelectRecordedTrip={applySourceRecord}
          />
        );
      })()}

      {/* 앱 메이트 선택 모달 */}
      <Modal visible={friendPickerVisible} transparent animationType="slide" onRequestClose={() => setFriendPickerVisible(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={fp.overlay} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setFriendPickerVisible(false)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[fp.sheet, { paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 16 }]}>
            <View style={fp.handle} />
            <View style={fp.header}>
              <FriendIcon size={16} color={skinAccent.accent} />
              <Text style={fp.headerTitle}>{t('cutInfo.friendPickerTitle')}</Text>
            </View>
            <ScrollView style={fp.list} showsVerticalScrollIndicator={false}>
              {friendNames.length === 0 ? (
                <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
                  {t('friends.noFollowing')}
                </Text>
              ) : friendNames.map(friend => {
                const selected = companionFriends.includes(friend);
                return (
                  <TouchableOpacity key={friend} style={[fp.row, selected && fp.rowActive]} onPress={() => toggleCompanionFriend(friend)} activeOpacity={0.7}>
                    <View style={[fp.avatar, selected && [fp.avatarActive, { backgroundColor: skinAccent.accentDeep }]]}><Text style={fp.avatarTxt}>{friend[0]}</Text></View>
                    <Text style={[fp.name, selected && fp.nameActive]}>{friend}</Text>
                    <View style={[fp.check, selected && [fp.checkActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accentDeep }]]}>{selected && <Text style={fp.checkMark}>✓</Text>}</View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[fp.doneBtn, { backgroundColor: skinAccent.accentDeep }]} onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85}>
              <Text style={fp.doneTxt}>{companionFriends.length > 0 ? t('cutInfo.friendDoneN', { count: companionFriends.length }) : t('cutInfo.closeWithoutSelect')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 비공개 대상 선택 — 피드·블로그와 같은 공용 시트, 설명 문구만 스트립용으로 */}
      <PrivacyModal
        visible={privacyVisible}
        selectedFriends={privateFriends}
        allFriends={friendNames}
        onToggle={togglePrivateFriend}
        onSetAll={setPrivateFriends}
        onClose={() => setPrivacyVisible(false)}
        desc={t('cutInfo.privacyDesc')}
        allPrivateDesc={t('cutInfo.allPrivateDesc')}
      />

      {/* ✨ 여행 기억 — 선택 국가·날짜에 매칭되는 순간 목록 (헤더 버튼으로 열림) */}
      <MomentListSheet
        visible={momentSheetVisible}
        onClose={() => setMomentSheetVisible(false)}
        moments={matchedMoments}
        tripTitle={
          selectedCountries.length > 0
            ? `${selectedCountries[0].flag} ${selectedCountries[0].name}`
            : ''
        }
      />

      {/* 기타 통화 선택 모달 */}
      <Modal visible={currencyModalVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setCurrencyModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCurrencyModalVisible(false)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) — iOS는 기존 외형 유지 */}
          <View style={[cur.sheet, Platform.OS === 'android' && { paddingBottom: insets.bottom + 16 }]}>
            <View style={cur.handle} />
            <View style={cur.titleRow}>
              <Text style={cur.title}>{t('cutInfo.currencySelect')}</Text>
              <TouchableOpacity
                onPress={() => setCurrencyModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={[cur.doneBtn, { color: skinAccent.accent }]}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            <View style={cur.searchWrap}>
              <SearchIcon size={14} color={C.dim} />
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={cur.searchInput}
                value={currencySearch} onChangeText={setCurrencySearch}
                placeholder={t('cutInfo.currencySearchPlaceholder')} placeholderTextColor={C.muted}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 320, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
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
                    {currency === c.code && <Text style={[cur.check, { color: skinAccent.accent }]}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 국가 선택 모달 */}
      <Modal visible={countryModalVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={closeCountryModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeCountryModal} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) — iOS는 기존 외형 유지 */}
          <View style={[ct.sheet, Platform.OS === 'android' && { paddingBottom: insets.bottom + 16 }]}>
            <View style={ct.handle} />
            <View style={ct.titleRow}>
              <Text style={ct.title}>{t('cutInfo.destSelect')}</Text>
              <TouchableOpacity
                onPress={closeCountryModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={[ct.doneBtn, { color: skinAccent.accent }]}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            <View style={ct.searchWrap}>
              <SearchIcon size={14} color={C.dim} />
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={ct.searchInput}
                value={countrySearch} onChangeText={setCountrySearch}
                placeholder={t('cutInfo.countrySearchPlaceholder')} placeholderTextColor={C.muted}
                returnKeyType="search"
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={ct.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 몇 개 골랐는지 · 더 고를 수 있는지 — 목록만 보고는 알 수 없었다 */}
            {selectedCountries.length > 0 && (
              <Text style={ct.pickedCount}>
                {t('newRecord.countrySelectedDone', { count: selectedCountries.length })}
                {selectedCountries.length < MAX_COUNTRIES ? t('newRecord.countryCanAdd') : t('newRecord.countryMax')}
              </Text>
            )}

            <ScrollView style={{ maxHeight: 420, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {groupedCountries.map(g => (
                <View key={g.continent}>
                  <Text style={ct.continent}>{continentLabel(g.continent, i18n.language)}</Text>
                  {g.countries.map(c => {
                    const picked = selectedCountries.some(p => p.name === c.name);
                    // 최대치에 도달하면 미선택 국가는 탭해도 아무 일이 없었다 — 눌리지 않음을 눈으로 보여준다
                    const blocked = !picked && selectedCountries.length >= MAX_COUNTRIES;
                    return (
                      <TouchableOpacity
                        key={c.name}
                        style={[ct.item, blocked && ct.itemBlocked]}
                        disabled={blocked}
                        onPress={() => toggleCountry(c)} // 복수 선택 — 모달은 배경 탭으로 닫는다
                        activeOpacity={0.75}
                      >
                        <Text style={ct.flag}>{c.flag}</Text>
                        <Text style={ct.name}>{countryLabel(c.name, i18n.language)}</Text>
                        {picked && <Text style={[ct.check, { color: skinAccent.accent }]}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
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

/**
 * 스킨 강조색이 박힌 스타일시트 — BlogRecordScreen의 makeStyles와 같은 패턴(2026-09-24 기록 화면 UI 통일).
 *
 * 색을 모듈 최상위 StyleSheet에 박아두면 스킨을 cyan/mint로 바꿔도 이 화면만 보라로 남는다
 * (블로그가 실제로 겪은 문제). 호출부를 하나하나 인라인으로 덮는 대신 스타일시트 자체를 스킨의
 * 함수로 만든다 — 색을 쓰는 모든 지점이 자동으로 따라오고, 새 스타일을 추가할 때도 빠뜨릴 일이 없다.
 *
 * a=accent(밝은 강조), ad=accentDeep(진한 강조), tint=밝은 강조의 알파 틴트.
 */
const makeStyles = (a: string, ad: string, tint: (alpha: number) => string) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.divider, zIndex: 10, elevation: 10 },
  // 뒤로가기 — 박스 없이 38×38 터치 영역 가운데 chevron만(앱 전 화면 공통)
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  // 절대배치는 래퍼 View가 갖는다(Text의 pointerEvents는 안드로이드 구현이 없어 무효 — 호출부 주석 참조).
  // top/bottom을 비워 둬야 header의 alignItems:'center'가 예전 Text와 같은 자리에 놓는다.
  headerTitleWrap: { position: 'absolute', left: 0, right: 0 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  lockBtnActive: { backgroundColor: tint(0.4), borderWidth: 1, borderColor: a },
  lockBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF3B30', borderRadius: 8, width: 15, height: 15, alignItems: 'center', justifyContent: 'center' },
  lockBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  // 사용자 시안: 70×30 알약(radius 15) — 바탕 흰 10%, 좌상단·우하단 흰색 대각 그라데이션 테두리(PillRing diagonal), 글자 #C3C3C3
  saveBtnWrap: { marginRight: 0 }, // 화면 끝 여백 = 헤더 paddingHorizontal 16 (앱 공통 gutter, 블로그 saveBtnWrap과 동일)
  // width가 아니라 minWidth인 이유: 저장 중 문구나 다국어 문구는 70을 넘어 고정 width면 잘린다.
  // 테두리는 AutoPillRing이 그리므로 borderWidth·overflow:'hidden' 금지(링이 잘리고 실측이 밀린다).
  saveBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: SAVE_BTN_R, minWidth: 70, height: SAVE_BTN_H, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#C3C3C3', fontSize: 14, fontWeight: '600' },

  scroll: { flex: 1, backgroundColor: C.editorBg },
  content: { paddingHorizontal: 16, paddingTop: 13 }, // 좌우 16 = 앱 공통 gutter

  // 네컷 미리보기 — 블로그에 대응 요소가 없어 기존 값을 유지한다
  previewWrap: { alignItems: 'center', marginBottom: 22 },
  previewImg: { width: '70%', height: 150, borderRadius: 10 },

  // 블로그 PanelRow(panelRow/panelLabelRow/panelLabel/reqTag)의 값. 구조는 그대로 두고 값만 옮겼다.
  // labelRow의 gap을 없앤 것은 req가 marginLeft 4를 스스로 갖기 때문(남겨두면 8이 된다).
  fieldBlock: { marginBottom: 18, gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  label: { color: C.dim, fontSize: 13, fontWeight: '600' },

  // 국가·날짜 칩 — 바탕색은 스킨별 인라인(chipBg). 테두리는 AutoPillRing이 그리므로 borderWidth 0
  topChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20, elevation: 20 }, // 블로그 2903행과 동일
  countryChip: { alignSelf: 'flex-start', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, borderRadius: 15, paddingHorizontal: 22 },
  dateChip: { marginTop: 16, gap: 13 }, // 시안: 아이콘→글자 간격 13(countryChip의 gap 4를 덮는다)
  // 시안 AppleSDGothicNeoEB00(ExtraBold) = weight 800. iOS는 PostScript 이름을 직접 지정해 숫자·영문(날짜)도
  // SF Pro가 아니라 Apple SD Gothic Neo 글리프로 그린다. 안드로이드는 이 폰트가 없어 undefined(기본 한글 폰트 + 800).
  countryChipText: { flexShrink: 1, color: a, fontSize: 14, fontWeight: '800', lineHeight: 18, letterSpacing: -0.14, fontFamily: Platform.select({ ios: 'AppleSDGothicNeo-ExtraBold', default: undefined }) },
  countryChipPlaceholder: { color: C.muted, fontSize: 14 },

  memoInput: { color: C.white, fontSize: 13, lineHeight: 20, minHeight: 56, backgroundColor: C.cardLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.divider },

  // 선택 칩 4종(동행자·공개범위·날씨·항공편) 공통 — 블로그 chip/chipActive/chipText/chipTextActive.
  // 통화는 블로그가 전용 currencyChip을 쓰므로 아래에 따로 있다.
  // 방향이 없는 상자라 아이콘+글자는 호출부의 행 래퍼 안에 둔다(빼면 세로로 쌓인다).
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.cardLight, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: tint(0.25), borderColor: tint(0.3) },
  chipText: { color: C.dim, fontSize: 13 },
  chipTextActive: { color: a },
  compChipIcon: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },

  friendChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: tint(0.25), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  friendChipAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: ad, alignItems: 'center', justifyContent: 'center' },
  friendChipAvatarTxt: { color: C.white, fontSize: 10, fontWeight: '700' },
  friendChipName: { color: a, fontSize: 12, fontWeight: '500' },

  addFriendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.cardLight, borderRadius: 10, borderWidth: 1, borderColor: tint(0.3), alignSelf: 'flex-start' },
  addFriendTxt: { color: a, fontSize: 13, fontWeight: '600' },
  addFriendBadge: { backgroundColor: ad, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  addFriendBadgeTxt: { color: C.white, fontSize: 10, fontWeight: '700' },

  // 별점 — 컨테이너만 블로그 값(ratingWrap/ratingRow). 별 드래그·반별 클립은 그대로다.
  ratingLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingScore: { color: C.gold, fontSize: 13, fontWeight: '700' },
  ratingScoreEmpty: { color: C.muted, fontSize: 12 },
  ratingCard: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  ratingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, // gap = STAR_GAP (드래그 히트테스트가 이 값을 역산한다)
  // 타이트 행간은 안드로이드에서 글리프 상하가 잘림 → 안드로이드만 fontSize*1.2로 완화
  starChar: { fontSize: 32, color: C.muted, lineHeight: Platform.OS === 'ios' ? 34 : 38 },
  starCharActive: { color: C.gold },
  starAbsolute: { position: 'absolute', left: 0, top: 0 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },

  divider: { height: 1, backgroundColor: C.divider, marginVertical: 8 }, // 블로그 optDivider
  optNotice: { color: C.muted, fontSize: 11, textAlign: 'center', marginBottom: 14 },
  visNotice: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 2 },

  // 선택 항목 행 — 블로그 PanelRow(아이콘 + 라벨)와 같은 값.
  // 블로그는 아이콘 래퍼에 marginRight 6을 주는데 여기선 행의 gap 6이 같은 6을 만든다.
  optRow: { marginBottom: 18, gap: 8 },
  optHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optTitle: { color: C.dim, fontSize: 13, fontWeight: '600' },
  optValue: { color: a, fontSize: 12, marginLeft: 4 }, // 블로그 PanelRow엔 없는 값 표시 — 이 화면 고유라 유지

  budgetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  // 통화 칩 — 선택 칩(chip)보다 살짝 작다(padV 7·r8). 활성 색은 호출부가 accentDeep/accent로 덮는다
  currencyChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.cardLight, borderWidth: 1, borderColor: 'transparent' },
  currencyChipActive: { backgroundColor: tint(0.25), borderColor: tint(0.3) },
  currencyTxt: { color: C.dim, fontSize: 12, fontWeight: '600' },
  currencyTxtActive: { color: a },
  budgetInput: { flex: 1, minWidth: 80, height: 36, backgroundColor: C.cardLight, borderRadius: 8, paddingHorizontal: 10, color: C.white, fontSize: 13, borderWidth: 1, borderColor: C.divider },

  kwWrap: { gap: 8 },
  kwTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kwTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: tint(0.25), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  kwTagText: { color: a, fontSize: 12, fontWeight: '500' },
  kwTagDel: { color: C.muted, fontSize: 9 },
  kwInput: { height: 36, backgroundColor: C.cardLight, borderRadius: 8, paddingHorizontal: 10, color: C.white, fontSize: 13, borderWidth: 1, borderColor: C.divider },
  kwHint: { color: C.muted, fontSize: 11, marginTop: 6 }, // 블로그에 없는 안내문 — 이 화면 고유라 유지
});

/** 현재 스킨색으로 만든 스타일시트 — 스킨이 바뀔 때만 다시 만든다 */
function useSt() {
  const { accent, accentDeep, tint } = useSkinAccent();
  return useMemo(() => makeStyles(accent, accentDeep, tint), [accent, accentDeep, tint]);
}


const fp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 overlay는 전체 폭 유지)
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  list: { },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  rowActive: { },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.divider, alignItems: 'center', justifyContent: 'center' },
  // 색은 호출부가 skinAccent로 인라인 지정한다(예전 보라 고정색은 그 인라인에 늘 덮여 죽은 값이었다)
  avatarActive: { },
  avatarTxt: { color: C.white, fontSize: 14, fontWeight: '700' },
  name: { flex: 1, color: C.dim, fontSize: 15 },
  nameActive: { color: C.white, fontWeight: '600' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  checkActive: { },
  checkMark: { color: C.white, fontSize: 13, fontWeight: '700' },
  doneBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneTxt: { color: C.white, fontSize: 15, fontWeight: '700' },
});

const cur = StyleSheet.create({
  // maxHeight + flexShrink — 키보드가 올라와도 시트가 화면(가용 영역)을 넘지 않게 목록만 줄어든다
  // width/maxWidth/alignSelf — Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, maxHeight: '80%', flexShrink: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted, alignSelf: 'center', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: C.white, fontSize: 16, fontWeight: '700' },
  doneBtn: { fontSize: 14, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: C.divider },
  code: { color: C.white, fontSize: 14, fontWeight: '700', width: 54 },
  name: { flex: 1, color: C.dim, fontSize: 14 },
  check: { fontSize: 15, fontWeight: '700' },
});

const ct = StyleSheet.create({
  // maxHeight + flexShrink — 키보드가 올라와도 시트가 화면(가용 영역)을 넘지 않게 목록만 줄어든다
  // width/maxWidth/alignSelf — Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, maxHeight: '80%', flexShrink: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted, alignSelf: 'center', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: C.white, fontSize: 16, fontWeight: '700' },
  doneBtn: { fontSize: 14, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  searchClear: { color: C.dim, fontSize: 13, fontWeight: '700' },
  pickedCount: { color: C.dim, fontSize: 11, paddingBottom: 6 },
  continent: { color: C.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingTop: 14, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  itemBlocked: { opacity: 0.35 },
  flag: { fontSize: 20 },
  name: { flex: 1, color: C.white, fontSize: 15 },
  check: { fontSize: 15, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
});

