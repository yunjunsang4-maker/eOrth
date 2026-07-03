import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  PanResponder,
  ActivityIndicator,
  Linking,
  Alert,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useRecords, type Visibility } from '../store/recordStore';
import { COUNTRIES, CONTINENT_ORDER } from '../constants/countries';
import { DraggableCountryList, DraggablePhotoGrid } from '../components/record/DraggableLists';
import { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';
import { PrivacyModal } from '../components/record/PrivacyModal';
import { MediaPickerModal } from '../components/record/MediaPickerModal';
import { FriendPickerModal } from '../components/record/FriendPickerModal';
import { CurrencyPickerModal } from '../components/record/CurrencyPickerModal';
import { compressImage, compressImages } from '../utils/imageCompress';
import { detectCurrentCountry } from '../services/snapService';
import { currencyForCountryName } from '../constants/countryCurrency';
import type { RootStackScreenProps } from '../navigation/types';
import {
  PlaneIcon as DesignerPlaneIcon,
  CameraIcon as DesignerCameraIcon,
  SearchIcon as SvgSearchIcon,
  CalendarIcon as SvgCalendarIcon,
  GalleryIcon as SvgGalleryIcon,
  LockClosedIcon as SvgLockClosedIcon,
  LockOpenIcon as SvgLockOpenIcon,
  CoinIcon as SvgCoinIcon,
  TagIcon as SvgTagIcon,
  TakeoffIcon as SvgTakeoffIcon,
  TransferIcon as SvgTransferIcon,
  PartlyCloudyIcon as SvgWeatherIcon,
  SoloIcon as SvgSoloIcon,
  FriendIcon as SvgFriendIcon,
  CoupleIcon as SvgCoupleIcon,
  FamilyIcon as SvgFamilyIcon,
  ParentIcon as SvgParentIcon,
  SiblingIcon as SvgSiblingIcon,
  SunIcon as SvgSunIcon,
  CloudyIcon as SvgCloudyIcon,
  RainIcon as SvgRainIcon,
  SnowIcon as SvgSnowIcon,
  PartlyCloudyIcon as SvgPartlyCloudyIcon,
  WindIcon as SvgWindIcon,
} from '../components/icons';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
// AlbumCreateScreen 등이 './NewRecordScreen' 경로로 import 하므로 재export 유지
export { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';

const { width: SCREEN_W } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  gold: '#FFD700',
  error: '#FF3B30',
};

// ─── 커스텀 아이콘 (SVG 래퍼) ───
const IC = COLORS.purpleNeon;

const SearchIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSearchIcon size={size} color={color} />
);

const CalendarIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCalendarIcon size={size} color={color} />
);

const GalleryIcon = ({ size = 20, color = IC }: { size?: number; color?: string }) => (
  <SvgGalleryIcon size={size} color={color} />
);

const CameraIcon = ({ size = 32, color = IC }: { size?: number; color?: string }) => (
  <DesignerCameraIcon size={size} color={color} />
);

const LockClosedIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockClosedIcon size={size} color={color} />
);

const LockOpenIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockOpenIcon size={size} color={color} />
);

const CoinIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgCoinIcon size={size} color={color} />
);

const WeatherIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgWeatherIcon size={size} />
);

const PlaneIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <DesignerPlaneIcon size={size} color={color} />
);

const TagIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgTagIcon size={size} color={color} />
);

const TakeoffIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTakeoffIcon size={size} color={color} />
);

const TransferIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTransferIcon size={size} color={color} />
);

// ─── 동행자 아이콘 ───

const SoloIcon = ({ color = IC }: { color?: string }) => (
  <SvgSoloIcon size={16} color={color} />
);

const FriendIcon = ({ color = IC }: { color?: string }) => (
  <SvgFriendIcon size={16} color={color} />
);

const CoupleIcon = ({ color = IC }: { color?: string }) => (
  <SvgCoupleIcon size={16} color={color} />
);

const FamilyIcon = ({ color = IC }: { color?: string }) => (
  <SvgFamilyIcon size={16} color={color} />
);

const ParentIcon = ({ color = IC }: { color?: string }) => (
  <SvgParentIcon size={16} color={color} />
);

const SiblingIcon = ({ color = IC }: { color?: string }) => (
  <SvgSiblingIcon size={16} color={color} />
);

const COMPANION_ICONS: Record<string, React.ReactNode> = {
  '혼자': <SoloIcon />,
  '친구': <FriendIcon />,
  '연인': <CoupleIcon />,
  '가족': <FamilyIcon />,
  '부모님': <ParentIcon />,
  '형제': <SiblingIcon />,
};

// ─── 날씨 개별 아이콘 ───
const SunIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSunIcon size={size} color={color} />
);
const CloudyIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCloudyIcon size={size} color={color} />
);
const RainIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgRainIcon size={size} color={color} />
);
const SnowIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSnowIcon size={size} color={color} />
);
const PartlyCloudyIcon = ({ size = 16 }: { size?: number; color?: string }) => (
  <SvgPartlyCloudyIcon size={size} />
);
const WindIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgWindIcon size={size} color={color} />
);

const WEATHER_ICON_MAP: Record<string, React.ReactNode> = {
  '맑음':     <SunIcon size={16} />,
  '부분흐림': <PartlyCloudyIcon size={16} />,
  '흐림':     <CloudyIcon size={16} />,
  '비':       <RainIcon size={16} />,
  '눈':       <SnowIcon size={16} />,
  '바람':     <WindIcon size={16} />,
};

// ─── 진행 바 ───
function StepProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pb.wrap}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const active  = stepNum <= current;
        return (
          <React.Fragment key={stepNum}>
            <View style={[pb.circle, active ? pb.circleActive : pb.circleInactive]}>
              {active
                ? <View style={pb.dot} />
                : <View style={pb.dotEmpty} />}
            </View>
            {i < total - 1 && (
              <View style={[pb.line, stepNum < current ? pb.lineActive : pb.lineInactive]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: COLORS.purpleNeon,
  },
  circleInactive: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  dotEmpty: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  lineActive: {
    backgroundColor: COLORS.purpleNeon,
  },
  lineInactive: {
    backgroundColor: COLORS.card,
  },
});

// ─── 하단 내비게이션 버튼 ───
function StepNavBar({
  step,
  totalSteps,
  canNext,
  onPrev,
  onNext,
  onSave,
  saving = false,
}: {
  step: number;
  totalSteps: number;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={nav.wrap}>
      {step > 1 ? (
        <TouchableOpacity style={nav.prevBtn} onPress={onPrev} activeOpacity={0.8}>
          <Text style={nav.prevTxt}>{t('newRecord.prev')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={nav.prevPlaceholder} />
      )}
      {step < totalSteps ? (
        <TouchableOpacity
          style={[nav.nextBtn, !canNext && nav.nextBtnDisabled]}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={nav.nextTxt}>{t('newRecord.next')}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[nav.saveBtn, (!canNext || saving) && nav.nextBtnDisabled]}
          onPress={onSave}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Text style={nav.saveTxt}>{saving ? t('newRecord.saving') : t('newRecord.save')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const nav = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  prevPlaceholder: { flex: 1 },
  prevBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  prevTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  nextBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

// 캘린더/비공개 모달은 components/record/ 로 분리

// 국가 데이터: 공용 모듈(../constants/countries)에서 가져옴

const ISO_TO_COUNTRY = COUNTRIES.reduce<Record<string, { flag: string; name: string }>>((acc, c) => {
  const code = c.term.split(' ')[0].toUpperCase();
  acc[code] = { flag: c.flag, name: c.name };
  return acc;
}, {});

function geoJsonToCountry(name: string, code?: string) {
  const cleanName = name.split(' - ')[0].toLowerCase();
  if (code) {
    const codeUpper = code.toUpperCase();
    // Try code matching (either direct 2-letter match, or convert 3-letter match)
    const byCode = ISO_TO_COUNTRY[codeUpper];
    if (byCode) return byCode;
    
    // Convert common 3-letter codes to 2-letter codes
    const iso3ToIso2: Record<string, string> = {
      JPN: 'JP', CHN: 'CN', USA: 'US', DEU: 'DE', ESP: 'ES',
      GBR: 'GB', FRA: 'FR', ITA: 'IT', KOR: 'KR'
    };
    const converted = iso3ToIso2[codeUpper];
    if (converted && ISO_TO_COUNTRY[converted]) {
      return ISO_TO_COUNTRY[converted];
    }
  }
  const found = COUNTRIES.find(c => c.name === cleanName || c.term.includes(cleanName));
  return found ? { flag: found.flag, name: found.name } : null;
}

const DEFAULT_COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];
const THUMB_SIZE = Math.floor((SCREEN_W - 40 - 16) / 3); // 3열 그리드

// ─── 메인 컴포넌트 ───
export default function NewRecordScreen({ navigation, route }: RootStackScreenProps<'NewRecord'>) {
  const { t } = useTranslation();
  const { addRecord, updateRecord, addTripGroup, followingUsers } = useRecords();
  // 동행자 값(혼자/친구…)은 저장 키라 유지하고 표시만 번역
  const companionLabel = (c: string) => {
    switch (c) {
      case '혼자': return t('newRecord.compSolo');
      case '친구': return t('newRecord.compFriend');
      case '연인': return t('newRecord.compCouple');
      case '가족': return t('newRecord.compFamily');
      case '부모님': return t('newRecord.compParents');
      case '형제': return t('newRecord.compSibling');
      default: return c;
    }
  };
  // 함께한 친구·비공개 대상 목록은 실제 팔로우한 친구에서 가져온다 (데모 친구 제거)
  const friendNames = followingUsers.map((f) => f.username);
  const TOTAL_STEPS = 3;

  // ─── 편집 모드 ───
  // 소셜 피드 '편집'(editRecord) 또는 게시물 상세 '수정'(record)에서 기존 기록을 받아 미리 채운다
  const editRecord = route.params?.editRecord ?? route.params?.record;
  const isEdit = !!editRecord;
  // 여행 카드에서 추가하면 그 여행 기간을 받아 신규 작성 시 날짜에 자동 적용한다
  const tripPeriod = route.params?.tripPeriod;
  const parseDotDate = (s?: string): Date => {
    if (s) {
      // "2025.04.13" / "2025-4-5" 등 구분자(. - /)·비패딩 모두 직접 파싱.
      // new Date(문자열)은 Hermes에서 비패딩 날짜에 Invalid Date가 될 수 있어 쓰지 않는다.
      const [y, m, d] = s.split(/[.\-/]/).map(p => parseInt(p, 10));
      if (
        Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) &&
        m >= 1 && m <= 12 && d >= 1 && d <= 31
      ) {
        const dt = new Date(y, m - 1, d);
        dt.setHours(0, 0, 0, 0);
        // 월/일 롤오버(예: 2월 31일 → 3월 3일) 방지: 파싱값과 동일해야 유효
        if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0); return today;
  };
  // 다국가 기록이면 대표 국가의 데이터로 활성 상태를 채운다 (top-level medias는 전체 합본이므로)
  const editFirstCountryData = editRecord?.perCountryData?.[editRecord.countryName];

  const [step, setStep] = useState(1);
  const [hintMsg, setHintMsg] = useState(''); // 필수 미충족 안내 토스트
  const savedRef = useRef(false);             // 저장 후 이탈은 확인 다이얼로그 건너뜀
  const scrollRef = useRef<ScrollView>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Step 1 - 국가 (복수 선택)
  const MAX_COUNTRIES = 10;
  const [countrySearch,     setCountrySearch]     = useState('');
  const [selectedCountries, setSelectedCountries] = useState<{ flag: string; name: string }[]>(
    editRecord
      ? editRecord.countries ?? [{ flag: editRecord.countryFlag, name: editRecord.countryName }]
      : []
  );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(
    editRecord?.regionName ? { name: editRecord.regionName, nameEn: editRecord.regionNameEn ?? '' } : null
  );

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const rawName = params.selectedCountry.name;
      const countryNameOnly = rawName.split(' - ')[0];
      const mapped = geoJsonToCountry(countryNameOnly, params.selectedCountry.code);
      if (mapped && !selectedCountries.some(c => c.name === mapped.name)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedCountries(prev => [...prev, mapped]);
      }
      if (params.selectedCountry.region) {
        setSelectedRegion({
          name: params.selectedCountry.region,
          nameEn: params.selectedCountry.regionEn || '',
        });
      }
    }
  }, [route?.params]);

  // 위치(국가·도시) 자동 채움 — 신규 작성이고 지정 국가 없이 들어왔을 때, 현재 위치로 1회 프리필
  useEffect(() => {
    if (isEdit) return;
    if (route?.params?.selectedCountry) return; // 글로브 등에서 국가 지정해 들어온 경우는 패스
    let cancelled = false;
    (async () => {
      const { countryCode, countryName, city } = await detectCurrentCountry();
      if (cancelled || (!countryCode && !countryName)) return;
      const mapped = geoJsonToCountry(countryName ?? '', countryCode ?? undefined);
      if (!mapped) return;
      setSelectedCountries(prev => (prev.length === 0 ? [mapped] : prev)); // 비어있을 때만
      if (city) setSelectedRegion(prev => prev ?? { name: city, nameEn: city });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedCountries = useMemo(() => {
    const filtered = COUNTRIES.filter(c => c.term.toLowerCase().includes(countrySearch.toLowerCase()));
    const sorted   = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return CONTINENT_ORDER.map(continent => ({
      continent,
      countries: sorted.filter(c => c.continent === continent),
    })).filter(g => g.countries.length > 0);
  }, [countrySearch]);

  // Step 2 - 미디어
  const [medias,            setMedias]           = useState<string[]>(
    editFirstCountryData?.medias ?? editRecord?.medias ?? []
  );
  const [mediaPrivacy,      setMediaPrivacy]      = useState<Record<number, string[]>>(
    editFirstCountryData?.mediaPrivacy ?? editRecord?.mediaPrivacy ?? {}
  );
  const [privacyModalIndex, setPrivacyModalIndex] = useState<number | null>(null);
  const [representativePhoto, setRepresentativePhoto] = useState<string | null>(
    editFirstCountryData?.representativePhoto ?? editRecord?.representativePhoto ?? null
  );

  // 압축본 uri → 원본 uri 매핑. "지도 대표" 사진은 저장 시 이 원본에서 고해상도로 다시 생성한다.
  const originalUriMapRef = useRef<Record<string, string>>({});
  // 지도 대표용 고해상도(장변 2560 / 품질 0.9) — 일반 미디어(1600/0.75)보다 선명
  const REP_HIRES_EDGE = 2560;
  const REP_HIRES_QUALITY = 0.9;
  // 대표 사진을 원본 기반 고해상도로 변환. 원본을 모르면(편집 등) 기존 uri 그대로 사용.
  const toRepHiRes = async (uri?: string): Promise<string | undefined> => {
    if (!uri) return uri;
    const original = originalUriMapRef.current[uri];
    if (!original) return uri;
    return compressImage(original, REP_HIRES_EDGE, REP_HIRES_QUALITY);
  };

  // 저장 중복 클릭 방지
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // 원본 uri 배열 → 이미 추가된 것·중복을 제거한 뒤 압축본 반환 + (압축본→원본) 매핑 기록.
  // 압축본 URI는 매번 달라 중복 비교가 안 되므로 반드시 '원본' 기준으로 dedup 한다.
  const addNewOriginals = async (originals: string[], currentMedias: string[]): Promise<string[]> => {
    const addedOriginals = new Set(currentMedias.map(u => originalUriMapRef.current[u] ?? u));
    const uniqueFresh = Array.from(new Set(originals.filter(o => !addedOriginals.has(o))))
      .slice(0, 30 - currentMedias.length);
    const compressed = await compressImages(uniqueFresh);
    compressed.forEach((u, i) => { if (u !== uniqueFresh[i]) originalUriMapRef.current[u] = uniqueFresh[i]; });
    return compressed;
  };

  const selectMedia = async () => {
    const slots = 30 - medias.length;
    if (slots <= 0) {
      Alert.alert(t('newRecord.noticeTitle'), t('newRecord.maxPhotos30'));
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: slots, // slots>=1 보장 (0이면 무제한이 되어 30장 초과 위험)
        quality: 0.8,
      });
      if (!result.canceled && result.assets) {
        setLoadingMedia(true);
        const compressed = await addNewOriginals(result.assets.map(a => a.uri), medias);
        setMedias(prev => [...prev, ...compressed].slice(0, 30));
      }
    } catch (e: any) {
      Alert.alert(t('newRecord.loadFailTitle'), e?.message ?? t('newRecord.loadPhotoFailMsg'));
    } finally {
      setLoadingMedia(false);
    }
  };

  const removeMedia = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const removedUri = medias[index];
    if (removedUri && removedUri === representativePhoto) {
      setRepresentativePhoto(null);
    }
    setMedias(prev => prev.filter((_, i) => i !== index));
    // Realign mediaPrivacy indices after deletion
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key > index) {
          updatedPrivacy[key - 1] = val;
        } else if (key < index) {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  const handleReorderMedias = (fromIdx: number, toIdx: number) => {
    // 1. Reorder medias array
    let updatedMedias = [...medias];
    const [movedMedia] = updatedMedias.splice(fromIdx, 1);
    updatedMedias.splice(toIdx, 0, movedMedia);
    setMedias(updatedMedias);

    // 2. Reorder mediaPrivacy object to align with new indices
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key === fromIdx) {
          updatedPrivacy[toIdx] = val;
        } else if (fromIdx < toIdx && key > fromIdx && key <= toIdx) {
          updatedPrivacy[key - 1] = val;
        } else if (fromIdx > toIdx && key < fromIdx && key >= toIdx) {
          updatedPrivacy[key + 1] = val;
        } else {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  const toggleMediaPrivacyFriend = (mediaIdx: number, friend: string) => {
    setMediaPrivacy(prev => {
      const current = prev[mediaIdx] || [];
      const updated = current.includes(friend)
        ? current.filter(f => f !== friend)
        : [...current, friend];
      return { ...prev, [mediaIdx]: updated };
    });
  };

  // 비공개 대상 전체 설정(전체 비공개) / 전체 해제 — 한 번에 목록을 통째로 교체해
  // 개별 친구 체크 상태까지 즉시 동기화한다.
  const setMediaPrivacyAll = (mediaIdx: number, friends: string[]) => {
    setMediaPrivacy(prev => ({ ...prev, [mediaIdx]: friends }));
  };

  // Step 3 - 제목 · 날짜 · 글 · 별점
  const todayInit = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  // 신규 작성이면 여행 카드에서 넘어온 기간(tripPeriod)을 기본 날짜로, 없으면 오늘
  const newStartInit = tripPeriod?.startDate ? parseDotDate(tripPeriod.startDate) : todayInit;
  const newEndInit = tripPeriod?.endDate ? parseDotDate(tripPeriod.endDate) : newStartInit;
  const [title,           setTitle]           = useState(editRecord?.content ?? '');
  const [startDate,       setStartDate]       = useState(
    editRecord ? parseDotDate(editFirstCountryData?.startDate ?? editRecord.startDate ?? editRecord.date) : newStartInit
  );
  const [endDate,         setEndDate]         = useState(
    editRecord ? parseDotDate(editFirstCountryData?.endDate ?? editRecord.endDate ?? editRecord.date) : newEndInit
  );
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [memo,            setMemo]            = useState(editRecord?.memo ?? '');
  const [rating,          setRating]          = useState(editFirstCountryData?.rating ?? editRecord?.rating ?? 0);
  // 공개 범위 (공통) — 편집 시 기존 값 유지, 신규는 친구만 기본
  const [visibility,      setVisibility]      = useState<Visibility>(editRecord?.visibility ?? 'friends');

  // ── 국가별 데이터 관리 (2개국 이상 선택 시) ──
  const isMultiCountry = selectedCountries.length > 1;
  const [activeCountryIdx, setActiveCountryIdx] = useState(0);

  const handleReorder = (newCountries: { flag: string; name: string }[]) => {
    const activeCountryName = selectedCountries[activeCountryIdx]?.name;
    setSelectedCountries(newCountries);
    if (activeCountryName) {
      const newIdx = newCountries.findIndex(c => c.name === activeCountryName);
      if (newIdx !== -1) {
        setActiveCountryIdx(newIdx);
      } else {
        setActiveCountryIdx(0);
      }
    } else {
      setActiveCountryIdx(0);
    }
  };

  const handleRemoveCountry = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCountries(prev => {
      const filtered = prev.filter(p => p.name !== name);
      const activeCountryName = selectedCountries[activeCountryIdx]?.name;
      if (activeCountryName === name) {
        setActiveCountryIdx(0);
      } else if (activeCountryName) {
        const newIdx = filtered.findIndex(c => c.name === activeCountryName);
        setActiveCountryIdx(newIdx !== -1 ? newIdx : 0);
      } else {
        setActiveCountryIdx(0);
      }
      return filtered;
    });
  };

  const perCountryStore = useRef<Record<string, {
    medias: string[];
    mediaPrivacy: Record<number, string[]>;
    startDate: Date;
    endDate: Date;
    rating: number;
    representativePhoto?: string;
  }>>(
    // 편집 모드: 기존 국가별 데이터를 시딩해서 국가 전환 시 그대로 표시
    (() => {
      const store: Record<string, {
        medias: string[]; mediaPrivacy: Record<number, string[]>;
        startDate: Date; endDate: Date; rating: number; representativePhoto?: string;
      }> = {};
      if (editRecord?.perCountryData) {
        for (const [name, d] of Object.entries(editRecord.perCountryData)) {
          store[name] = {
            medias: d.medias ?? [],
            mediaPrivacy: d.mediaPrivacy ?? {},
            startDate: parseDotDate(d.startDate),
            endDate: parseDotDate(d.endDate),
            rating: d.rating ?? 0,
            representativePhoto: d.representativePhoto,
          };
        }
      }
      return store;
    })()
  );

  // 현재 국가 데이터 저장
  const saveCurrentCountryData = () => {
    const name = selectedCountries[activeCountryIdx]?.name;
    if (name) {
      perCountryStore.current[name] = {
        medias: [...medias],
        mediaPrivacy: { ...mediaPrivacy },
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        rating,
        representativePhoto: representativePhoto || undefined,
      };
    }
  };

  // 국가 전환
  const switchCountry = (newIdx: number) => {
    if (newIdx === activeCountryIdx) return;
    saveCurrentCountryData();
    const newName = selectedCountries[newIdx]?.name;
    const data = newName ? perCountryStore.current[newName] : null;
    if (data) {
      setMedias(data.medias);
      setMediaPrivacy(data.mediaPrivacy);
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setRating(data.rating);
      setRepresentativePhoto(data.representativePhoto || null);
    } else {
      setMedias([]);
      setMediaPrivacy({});
      setStartDate(todayInit);
      setEndDate(todayInit);
      setRating(0);
      setRepresentativePhoto(null);
    }
    setActiveCountryIdx(newIdx);
  };

  const STAR_SIZE = 32;
  const STAR_GAP  = 6;
  const ratingRowRef    = useRef<View>(null);
  const ratingRowPageX  = useRef(0);

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
      onMoveShouldSetPanResponder:  () => true,
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
        <View key={i} style={s.starWrap}>
          <Text style={[s.starChar, s.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[s.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[s.starChar, s.starCharActive, s.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={s.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  const formatDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  // 동행자 (step 3)
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>(editRecord?.companions ?? []);
  const [companionFriends,   setCompanionFriends]   = useState<string[]>(editRecord?.companionFriends ?? []);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);

  const toggleCompanion = (comp: string) => {
    setSelectedCompanions(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]);
  };
  const toggleCompanionFriend = (friend: string) => {
    setCompanionFriends(prev =>
      prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]
    );
  };
  const removeCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.filter(f => f !== friend));
  };

  // 선택 항목 (step 3)
  const [budget,     setBudget]     = useState(editRecord?.budget ? String(editRecord.budget.amount) : '');
  const [currency,   setCurrency]   = useState(editRecord?.budget?.currency ?? 'KRW');
  // 사용자가 통화를 직접 고르면 국가 기반 자동 추천을 멈춘다 (편집 모드는 처음부터 수동 취급)
  const currencyTouchedRef = useRef(isEdit);
  const chooseCurrency = (code: string) => { currencyTouchedRef.current = true; setCurrency(code); };
  // 대표(첫) 국가에 맞춰 기본 통화 자동 추천 — 사용자가 직접 고르기 전까지
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    const cur = currencyForCountryName(selectedCountries[0]?.name);
    if (cur) setCurrency(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountries[0]?.name]);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather,    setWeather]    = useState(editRecord?.weather ?? '');
  const [flightType, setFlightType] = useState(editRecord?.flightType ?? '');
  const [keywords,   setKeywords]   = useState<string[]>(editRecord?.keywords ?? []);
  const [keywordQuery, setKeywordQuery] = useState('');

  const CURRENCIES     = ['KRW', 'JPY', 'USD'];
  // OTHER_CURRENCIES 목록은 components/record/CurrencyPickerModal 로 이동
  const WEATHER_OPTIONS = [
    { label: `☀️ ${t('newRecord.wSunny')}`,     value: '맑음' },
    { label: `🌤️ ${t('newRecord.wPartly')}`, value: '부분흐림' },
    { label: `⛅ ${t('newRecord.wCloudy')}`,     value: '흐림' },
    { label: `🌧️ ${t('newRecord.wRain')}`,       value: '비' },
    { label: `❄️ ${t('newRecord.wSnow')}`,       value: '눈' },
    { label: `💨 ${t('newRecord.wWind')}`,     value: '바람' },
  ];
  const FLIGHT_OPTIONS  = ['직항', '경유'];
  const flightLabel = (f: string) => (f === '직항' ? t('newRecord.flightDirect') : t('newRecord.flightLayover'));
  const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
    { value: 'public',  label: `🌐 ${t('newRecord.visPublic')}` },
    { value: 'friends', label: `👥 ${t('newRecord.visFriends')}` },
    { value: 'private', label: `🔒 ${t('newRecord.visPrivate')}` },
  ];
  const KEYWORD_OPTIONS = ['#맛집','#쇼핑','#자연','#역사','#휴양','#액티비티','#도시','#힐링','#백패킹','#럭셔리'];

  const toggleKeyword = (kw: string) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  // ── 기간 자동 불러오기 ──
  const [autoLoadStart,           setAutoLoadStart]           = useState(todayInit);
  const [autoLoadEnd,             setAutoLoadEnd]             = useState(todayInit);
  const [loadingMedia,            setLoadingMedia]            = useState(false);
  const [autoLoadCalendarVisible, setAutoLoadCalendarVisible] = useState(false);

  // ── 미디어 선택 모달 (30개 초과 시) ──
  const [mediaPickerVisible,  setMediaPickerVisible]  = useState(false);
  const [mediaPickerAssets,   setMediaPickerAssets]   = useState<MediaLibrary.Asset[]>([]);
  const [mediaPickerSelected, setMediaPickerSelected] = useState<Set<string>>(new Set());
  const [mediaPickerMax,      setMediaPickerMax]      = useState(30);
  // 모달 열기 전 iCloud 사유로 제외된 장수 — 완료 메시지 안내에 사용
  const cloudSkippedRef = useRef(0);

  const toggleMediaPickerItem = (id: string) => {
    setMediaPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= mediaPickerMax) return prev;
        next.add(id);
      }
      return next;
    });
  };

  // ph:// 에셋을 표시·복사 가능한 로컬 file:// 로 변환해 {asset, uri} 쌍을 돌려준다.
  // iCloud로 오프로드된(원본이 기기에 없는) 사진은 Expo 관리형 API로 materialize가
  // 불가능하다 — getAssetInfoAsync/ImageManipulator/FileSystem.copyAsync 모두 실패하며
  // ph:// 그대로 두면 새 아키텍처에서 검은 타일로 뜬다. 따라서 가져올 수 없는 것으로
  // 보고 제외한다(검은 타일/조용한 실패 방지). 변환은 Promise.all로 병렬 처리.
  const resolveImportable = async (
    assets: MediaLibrary.Asset[]
  ): Promise<{ asset: MediaLibrary.Asset; uri: string }[]> => {
    const probed = await Promise.all(
      assets.map(async (asset) => {
        try {
          if (Platform.OS === 'ios' && asset.uri.startsWith('ph://')) {
            const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
            return info.localUri ? { asset, uri: info.localUri } : null; // localUri 없으면 iCloud → 제외
          }
          return { asset, uri: asset.uri };
        } catch {
          return null;
        }
      })
    );
    return probed.filter((p): p is { asset: MediaLibrary.Asset; uri: string } => p !== null);
  };

  // iCloud 제외분 안내 문구 (없으면 빈 문자열)
  const cloudNote = (skipped: number) =>
    skipped > 0 ? t('newRecord.cloudNote', { count: skipped }) : '';

  const confirmMediaPickerSelection = async () => {
    const selectedAssets = mediaPickerAssets.filter(a => mediaPickerSelected.has(a.id));
    setMediaPickerVisible(false);
    setLoadingMedia(true);

    try {
      const ok = await resolveImportable(selectedAssets);
      const resolvedUris = await addNewOriginals(ok.map((p) => p.uri), medias);

      setMedias((prev) => [...prev, ...resolvedUris].slice(0, 30));

      // 모달에는 이미 가져올 수 있는 사진만 담겼으므로, 제외 안내는 모달 열기 전 집계분을 쓴다
      Alert.alert(t('newRecord.loadDoneTitle'), t('newRecord.loadedNPhotos', { count: resolvedUris.length }) + cloudNote(cloudSkippedRef.current));
    } catch (e: any) {
      Alert.alert(t('newRecord.loadFailTitle'), e?.message ?? t('newRecord.galleryLoadFailMsg'));
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadMediaByDate = async (overrideStart?: Date, overrideEnd?: Date) => {
    const rangeStart = overrideStart ?? autoLoadStart;
    const rangeEnd   = overrideEnd   ?? autoLoadEnd;

    if (!rangeStart || !rangeEnd || isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      Alert.alert(t('newRecord.dateErrorTitle'), t('newRecord.dateErrorMsg'));
      return;
    }

    setLoadingMedia(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('newRecord.galleryPermTitle'),
          t('newRecord.galleryPermMsg'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('newRecord.allowInSettings'), onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const startOfDay = new Date(rangeStart);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(rangeEnd);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        createdAfter:  startOfDay.getTime(),
        createdBefore: endOfDay.getTime(),
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 500,
      });

      const allAssets = result?.assets ?? [];
      if (allAssets.length === 0) {
        Alert.alert(t('newRecord.noPhotoTitle'), t('newRecord.noPhotoMsg'));
        return;
      }

      // 가져올 수 있는(로컬) 사진만 추린다. iCloud 오프로드 사진은 materialize가 불가능하므로
      // 여기서 미리 걸러내 검은 타일/조용한 실패를 막고, 몇 장이 iCloud인지 안내한다.
      const ok = await resolveImportable(allAssets);
      const cloudCount = allAssets.length - ok.length;
      cloudSkippedRef.current = cloudCount;

      if (ok.length === 0) {
        Alert.alert(
          t('comp2.icloudTitle'),
          t('newRecord.iCloudOnlyMsg', { count: cloudCount })
        );
        return;
      }

      const total = ok.length;
      const slotsAvailable = 30 - medias.length;
      if (slotsAvailable <= 0) {
        Alert.alert(t('newRecord.noticeTitle'), t('newRecord.maxPhotos30'));
        return;
      }

      // 30개 초과 시 → 선택 모달 표시 (가져올 수 있는 사진만 전달 → 검은 타일 없음)
      if (total > slotsAvailable) {
        setMediaPickerAssets(ok.map((p) => p.asset));
        setMediaPickerMax(slotsAvailable);
        setMediaPickerSelected(new Set());
        setMediaPickerVisible(true);
        return;
      }

      // 30개 이하 → 전체 추가 (이미 변환된 localUri 사용)
      const resolvedUris = await addNewOriginals(ok.map((p) => p.uri), medias);

      setMedias((prev) => [...prev, ...resolvedUris].slice(0, 30));

      Alert.alert(t('newRecord.loadDoneTitle'), t('newRecord.loadedNPhotos', { count: resolvedUris.length }) + cloudNote(cloudCount));
    } catch (e: any) {
      Alert.alert(t('newRecord.loadFailTitle'), e?.message ?? t('newRecord.galleryLoadFailMsg'));
    } finally {
      setLoadingMedia(false);
    }
  };

  // ── 내비 ──
  const canGoNext = () => {
    if (step === 1) return selectedCountries.length > 0;
    if (step === 2) {
      // 사진 최소 1장 필수 — 다국가면 모든 국가에 1장 이상 (활성은 전역 medias, 나머지는 국가별 저장값)
      return selectedCountries.every((c, idx) =>
        idx === activeCountryIdx ? medias.length > 0 : (perCountryStore.current[c.name]?.medias?.length ?? 0) > 0
      );
    }
    if (step === TOTAL_STEPS) {
      if (!(memo.trim().length > 0 && selectedCompanions.length > 0)) return false;
      // 모든 선택 국가에 평점 필요 (활성 국가는 전역 rating, 나머지는 국가별 저장값)
      return selectedCountries.every((c, idx) =>
        idx === activeCountryIdx ? rating > 0 : (perCountryStore.current[c.name]?.rating ?? 0) > 0
      );
    }
    return true;
  };

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      if (isMultiCountry && step === 2) saveCurrentCountryData();
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };
  const goPrev = () => {
    if (step > 1) {
      if (isMultiCountry && step === 2) saveCurrentCountryData();
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const handleSave = async () => {
    if (selectedCountries.length === 0) {
      Alert.alert(t('newRecord.selectCountryTitle'), t('newRecord.selectCountryMsg'));
      return;
    }
    // 다국가 신규 작성: 하나의 여행으로 합칠지, 국가별로 나눌지 선택
    // (수정 모드는 기존 합본 구조 유지 — 분할하면 기존 게시물·댓글과의 연결이 깨짐)
    if (!isEdit && selectedCountries.length > 1) {
      Alert.alert(
        t('newRecord.splitAskTitle'),
        t('newRecord.splitAskMsg', { count: selectedCountries.length }),
        [
          { text: t('newRecord.splitAskCancel'), style: 'cancel' },
          { text: t('newRecord.splitAskSplit'), onPress: () => { doSave(true); } },
          { text: t('newRecord.splitAskMerge'), onPress: () => { doSave(false); } },
        ]
      );
      return;
    }
    await doSave(false);
  };

  const doSave = async (splitByCountry: boolean) => {
    {
      // 현재 활성 국가 데이터 저장
      saveCurrentCountryData();

      // 국가별로 나눠서 저장 — 국가마다 기록 1개 + 전체를 여행 묶음으로 자동 그룹화
      if (splitByCountry) {
        const createdIds: string[] = [];
        for (let i = 0; i < selectedCountries.length; i++) {
          const c = selectedCountries[i];
          const d = perCountryStore.current[c.name];
          if (!d || d.medias.length === 0) continue; // canGoNext가 보장 — 방어
          const rep = await toRepHiRes(d.representativePhoto || representativePhoto || undefined);
          const hasPrivacy = Object.values(d.mediaPrivacy).some(v => v && v.length > 0);
          const id = addRecord(
            {
              user: { name: '', emoji: '✈️', handle: '' }, // addRecord가 로그인 사용자로 채움
              viewType: 'feed',
              country: `${c.flag} ${c.name}`,
              countryName: c.name,
              countryFlag: c.flag,
              countries: [c],
              // 지역은 첫 국가 기준 선택값이므로 첫 기록에만
              regionName: i === 0 ? selectedRegion?.name || undefined : undefined,
              regionNameEn: i === 0 ? selectedRegion?.nameEn || undefined : undefined,
              representativePhoto: rep,
              date: formatDate(d.startDate),
              content: title || t('newRecord.defaultTitleOne', { country: c.name }),
              memo,
              rating: d.rating,
              companions: selectedCompanions,
              companionFriends,
              visibility,
              medias: d.medias,
              mediaPrivacy: hasPrivacy ? d.mediaPrivacy : undefined, // 단일 국가라 오프셋 보정 불필요
              startDate: formatDate(d.startDate),
              endDate: formatDate(d.endDate),
              // 예산은 여행 전체 총액이라 첫 기록에만 담아 통계 중복 합산 방지
              budget: i === 0 && budget ? { amount: Number(budget), currency } : undefined,
              weather: weather || undefined,
              flightType: flightType || undefined,
              keywords: keywords.length > 0 ? keywords : undefined,
            },
            { linkTrip: false } // 국가별 자동 그룹 대신 아래에서 하나의 묶음으로 생성
          );
          createdIds.push(id);
        }
        if (createdIds.length > 0) {
          addTripGroup({
            title: title || t('newRecord.defaultTitleMany', { country: selectedCountries[0].name, count: selectedCountries.length - 1 }),
            records: createdIds,
            coverRecordId: createdIds[0],
          });
        }
        savedRef.current = true;
        navigation.goBack();
        return;
      }

      const first = selectedCountries[0];

      // 국가별 데이터 수집
      const pcd: Record<string, { medias?: string[]; mediaPrivacy?: Record<number, string[]>; startDate?: string; endDate?: string; rating?: number; representativePhoto?: string }> = {};
      let allMedias: string[] = [];
      // 합본 medias(allMedias) 기준으로 국가별 비공개 인덱스를 오프셋 보정해 하나로 합친다
      const mergedPrivacy: Record<number, string[]> = {};
      let firstRating = 0;
      let firstStart = formatDate(todayInit);
      let firstEnd = formatDate(todayInit);

      selectedCountries.forEach((c, i) => {
        const d = perCountryStore.current[c.name];
        if (d) {
          const hasPrivacy = Object.values(d.mediaPrivacy).some(v => v && v.length > 0);
          pcd[c.name] = {
            medias: d.medias,
            mediaPrivacy: hasPrivacy ? d.mediaPrivacy : undefined,
            startDate: formatDate(d.startDate),
            endDate: formatDate(d.endDate),
            rating: d.rating,
            representativePhoto: d.representativePhoto,
          };
          // 이 국가 medias가 합본에서 시작하는 위치(offset)만큼 비공개 인덱스를 밀어 매핑
          const offset = allMedias.length;
          Object.entries(d.mediaPrivacy).forEach(([k, v]) => {
            if (v && v.length > 0) mergedPrivacy[offset + Number(k)] = v;
          });
          allMedias = [...allMedias, ...d.medias];
          if (i === 0) {
            firstRating = d.rating;
            firstStart = formatDate(d.startDate);
            firstEnd = formatDate(d.endDate);
          }
        }
      });

      const firstRepPhoto = perCountryStore.current[first.name]?.representativePhoto || representativePhoto || undefined;

      // 지도 대표 사진만 원본 기반 고해상도로 교체 (일반 미디어는 1600 유지)
      const firstRepHiRes = await toRepHiRes(firstRepPhoto);
      for (const name of Object.keys(pcd)) {
        pcd[name].representativePhoto = await toRepHiRes(pcd[name].representativePhoto);
      }

      const payload = {
        country: `${first.flag} ${first.name}`,
        countryName: first.name,
        countryFlag: first.flag,
        countries: selectedCountries,
        regionName: selectedRegion?.name || undefined,
        regionNameEn: selectedRegion?.nameEn || undefined,
        perCountryData: Object.keys(pcd).length > 0 ? pcd : undefined,
        representativePhoto: firstRepHiRes,
        date: firstStart,
        content: title || (selectedCountries.length === 1
          ? t('newRecord.defaultTitleOne', { country: first.name })
          : t('newRecord.defaultTitleMany', { country: first.name, count: selectedCountries.length - 1 })),
        memo,
        rating: firstRating,
        companions: selectedCompanions,
        companionFriends,
        visibility,
        medias: allMedias,
        mediaPrivacy: mergedPrivacy,
        startDate: firstStart,
        endDate: firstEnd,
        budget:     budget ? { amount: Number(budget), currency } : undefined,
        weather:    weather    || undefined,
        flightType: flightType || undefined,
        keywords:   keywords.length > 0 ? keywords : undefined,
      };

      if (isEdit && editRecord) {
        // 작성자·형식은 유지하고 내용(공개 범위 포함)만 갱신
        updateRecord(editRecord.id, payload);
      } else {
        addRecord({
          user: { name: '', emoji: '✈️', handle: '' }, // addRecord가 로그인 사용자로 채움
          viewType: 'feed',
          ...payload,
        });
      }
    }
    savedRef.current = true;
    navigation.goBack();
  };

  // 입력 중 이탈 방지 (취소/뒤로가기/제스처) — 저장 시엔 건너뜀
  // 최신 입력 여부는 ref로 참조 → 리스너는 1회만 등록 (키 입력마다 재구독 방지)
  const hasInput =
    selectedCountries.length > 0 || medias.length > 0 || memo.trim().length > 0 ||
    rating > 0 || selectedCompanions.length > 0 || keywords.length > 0 ||
    !!budget || !!weather || !!flightType;
  const hasInputRef = useRef(hasInput);
  hasInputRef.current = hasInput;

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current || !hasInputRef.current) return;
      e.preventDefault();
      Alert.alert(t('newRecord.cancelWriteTitle'), t('newRecord.cancelWriteMsg'), [
        { text: t('newRecord.continueWrite'), style: 'cancel' },
        { text: t('newRecord.exit'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation]);

  // 필수 미충족 시 빠진 항목 안내
  const showHint = (msg: string) => { setHintMsg(msg); setTimeout(() => setHintMsg(''), 2200); };
  const missingHint = (): string[] => {
    const m: string[] = [];
    if (step === 1) { if (selectedCountries.length === 0) m.push(t('newRecord.missCountry')); }
    else if (step === 2) {
      const noPhoto = selectedCountries.some((c, idx) =>
        idx === activeCountryIdx ? medias.length === 0 : (perCountryStore.current[c.name]?.medias?.length ?? 0) === 0);
      if (noPhoto) m.push(isMultiCountry ? t('newRecord.missAllCountryPhotos') : t('newRecord.missPhoto'));
    }
    else if (step === TOTAL_STEPS) {
      if (memo.trim().length === 0) m.push(t('newRecord.missText'));
      const noRating = selectedCountries.some((c, idx) =>
        idx === activeCountryIdx ? rating <= 0 : (perCountryStore.current[c.name]?.rating ?? 0) <= 0);
      if (noRating) m.push(isMultiCountry ? t('newRecord.missAllCountryRatings') : t('newRecord.missRating'));
      if (selectedCompanions.length === 0) m.push(t('newRecord.missCompanion'));
    }
    return m;
  };
  const handleNextPress = () => {
    if (canGoNext()) { goNext(); return; }
    const miss = missingHint();
    showHint(miss.length ? t('newRecord.missHint', { fields: miss.join(', ') }) : t('newRecord.requiredHint'));
  };
  const handleSavePress = async () => {
    if (savingRef.current) return; // 저장 중복 클릭 방지
    if (!canGoNext()) {
      const miss = missingHint();
      showHint(miss.length ? t('newRecord.missHint', { fields: miss.join(', ') }) : t('newRecord.requiredHint'));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await handleSave();
    } catch {
      // 저장 실패 시에만 재시도 허용 (성공 시 goBack 으로 화면 이탈)
      savingRef.current = false;
      setSaving(false);
    }
  };

  // 키워드 추가 (선행 # 정규화 + 중복 방지 + 빈값 무시 + 개수/길이 제한)
  const KEYWORD_MAX = 10;
  const KEYWORD_MAXLEN = 20;
  const addKeyword = (raw: string) => {
    const base = raw.trim().replace(/^#+/, '').trim().slice(0, KEYWORD_MAXLEN);
    if (!base) { setKeywordQuery(''); return; }
    const tag = `#${base}`;
    setKeywords(prev => {
      if (prev.includes(tag)) return prev;
      if (prev.length >= KEYWORD_MAX) { showHint(t('newRecord.keywordMax', { max: KEYWORD_MAX })); return prev; }
      return [...prev, tag];
    });
    setKeywordQuery('');
  };

  // ── 단계별 제목 ──
  const STEP_TITLES = [t('newRecord.step1'), t('newRecord.step2'), t('newRecord.step3')];

  // ─── 렌더 ───
  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? t('newRecord.editTitle') : t('newRecord.newTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* 진행 바 */}
      <StepProgressBar current={step} total={TOTAL_STEPS} />

      {/* 단계 타이틀 */}
      <View style={s.stepTitleWrap}>
        <Text style={s.stepTitleText}>{STEP_TITLES[step - 1]}</Text>
        <Text style={s.stepCountText}>{step} / {TOTAL_STEPS}</Text>
      </View>

      {/* Android: edge-to-edge(SDK54)에서 adjustResize가 무력화될 수 있어 'height'로 스크롤 영역을 직접 축소 */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >

          {/* ══════════════════ STEP 1 ══════════════════ */}
          {step === 1 && (
            <View style={s.step1Wrap}>
              {/* 선택된 국가 목록 */}
              {selectedCountries.length === 1 && (
                <View style={s.selectedChipsWrap}>
                  {selectedCountries.map((c) => (
                    <View key={c.name} style={s.countryChip}>
                      <Text style={s.countryChipText}>{c.flag} {c.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveCountry(c.name)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={s.countryChipRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {selectedCountries.length >= 2 && (
                <View style={{ marginBottom: 12 }}>
                  <DraggableCountryList
                    countries={selectedCountries}
                    onReorder={handleReorder}
                    onRemove={handleRemoveCountry}
                    onDragStateChange={(isDragging) => setScrollEnabled(!isDragging)}
                  />
                  <Text style={s.draggableHelperText}>
                    드래그하여 국가 순서를 변경할 수 있습니다. (첫 번째 국가가 대표 국가가 됩니다)
                  </Text>
                </View>
              )}

              {/* 검색창 — 항상 표시 */}
              <View style={[s.searchCard, selectedCountries.length > 0 ? s.searchCardSelected : null]}>
                <View style={s.searchRow}>
                  <SearchIcon size={16} color={COLORS.textDim} />
                  <TextInput
                    style={s.searchInput}
                    placeholder={selectedCountries.length > 0
                      ? t('newRecord.searchMore')
                      : t('newRecord.searchCountry')}
                    placeholderTextColor={COLORS.textMuted}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                  />
                  {countrySearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setCountrySearch('')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.clearBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 검색 결과 — 1글자 이상 */}
              {countrySearch.length >= 1 && (
                <View style={s.countryResultBox}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {groupedCountries.length === 0 ? (
                      <Text style={s.noResultText}>{t('newRecord.noResult')}</Text>
                    ) : (
                      groupedCountries.map(({ continent, countries }) => (
                        <View key={continent}>
                          <Text style={s.continentHeader}>{continent}</Text>
                          {countries.map(c => {
                            const isSelected = selectedCountries.some(sc => sc.name === c.name);
                            return (
                              <TouchableOpacity
                                key={c.name}
                                style={[s.countryItem, isSelected && s.countryItemSelected]}
                                onPress={() => {
                                  if (isSelected) {
                                    handleRemoveCountry(c.name);
                                  } else if (selectedCountries.length < MAX_COUNTRIES) {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setSelectedCountries(prev => [...prev, { flag: c.flag, name: c.name }]);
                                  }
                                }}
                              >
                                <Text style={s.countryIcon}>{c.flag}</Text>
                                <Text style={[s.countryName, isSelected && s.countryNameSelected]}>{c.name}</Text>
                                {isSelected && <Text style={s.countryCheckMark}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              {/* 안내 문구 */}
              {selectedCountries.length === 0 && countrySearch.length === 0 && (
                <Text style={s.stepHint}>{t('newRecord.countryHint')}</Text>
              )}

              {/* 선택 완료 확인 */}
              {selectedCountries.length > 0 && countrySearch.length === 0 && (
                <View style={s.selectedBadge}>
                  <Text style={s.selectedBadgeTxt}>✓ {t('newRecord.countrySelectedDone', { count: selectedCountries.length })}{selectedCountries.length < MAX_COUNTRIES ? t('newRecord.countryCanAdd') : t('newRecord.countryMax')}</Text>
                </View>
              )}
            </View>
          )}

          {/* ══════════════════ STEP 2 ══════════════════ */}
          {step === 2 && (
            <View>
              {/* 국가별 탭 (2개국 이상) */}
              {isMultiCountry && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.countryTabScroll} contentContainerStyle={s.countryTabContent}>
                  {selectedCountries.map((c, idx) => (
                    <TouchableOpacity
                      key={c.name}
                      style={[s.countryTab, idx === activeCountryIdx && s.countryTabActive]}
                      onPress={() => switchCountry(idx)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.countryTabText, idx === activeCountryIdx && s.countryTabTextActive]}>{c.flag} {c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {/* 기간으로 자동 불러오기 버튼 */}
              <TouchableOpacity
                style={s.autoLoadBtn}
                onPress={() => {
                  setAutoLoadStart(startDate);
                  setAutoLoadEnd(endDate);
                  setAutoLoadCalendarVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CalendarIcon size={16} color={COLORS.purpleNeon} />
                  <Text style={s.autoLoadBtnText}>{t('newRecord.autoLoadByPeriod')}</Text>
                </View>
              </TouchableOpacity>
              {loadingMedia && <ActivityIndicator color="#BF85FC" size="large" style={{ marginVertical: 12 }} />}

              {/* 갤러리 선택 버튼 */}
              <TouchableOpacity
                style={[s.addMediaBtn, medias.length >= 30 && s.addMediaBtnDisabled]}
                onPress={selectMedia}
                activeOpacity={0.8}
                disabled={medias.length >= 30}
              >
                <View style={s.addMediaLeft}>
                  <DesignerCameraIcon size={20} color={COLORS.purpleNeon} />
                  <View>
                    <Text style={s.addMediaText}>{t('newRecord.selectFromGallery')}</Text>
                    <Text style={s.addMediaSub}>{t('newRecord.maxPhotosSub')}</Text>
                  </View>
                </View>
                <View style={s.addMediaCountBadge}>
                  <Text style={s.addMediaCountTxt}>{medias.length}/30</Text>
                </View>
              </TouchableOpacity>

              {/* 썸네일 그리드 (드래그 앤 드롭 정렬 가능) */}
              {medias.length > 0 && (
                <DraggablePhotoGrid
                  medias={medias}
                  mediaPrivacy={mediaPrivacy}
                  onReorder={handleReorderMedias}
                  onRemove={removeMedia}
                  onOpenPrivacyModal={setPrivacyModalIndex}
                  onDragStateChange={(isDragging) => setScrollEnabled(!isDragging)}
                  THUMB_SIZE={THUMB_SIZE}
                  representativePhoto={representativePhoto}
                  onSetRepresentative={(uri) => {
                    setRepresentativePhoto(prev => prev === uri ? null : uri);
                  }}
                />
              )}

              {/* 빈 상태 */}
              {medias.length === 0 && (
                <View style={s.mediaEmptyBox}>
                  <DesignerCameraIcon size={32} color={COLORS.textMuted} />
                  <Text style={s.mediaEmptyTitle}>{t('newRecord.noPhotoSelectedTitle')}</Text>
                  <Text style={s.mediaEmptyDesc}>{t('newRecord.noPhotoSelectedDesc')}</Text>
                </View>
              )}

            </View>
          )}

          {step === 3 && (
            <View style={s.step3Wrap}>
              {/* 국가별 탭 (2개국 이상) */}
              {isMultiCountry && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.countryTabScroll} contentContainerStyle={s.countryTabContent}>
                  {selectedCountries.map((c, idx) => (
                    <TouchableOpacity
                      key={c.name}
                      style={[s.countryTab, idx === activeCountryIdx && s.countryTabActive]}
                      onPress={() => switchCountry(idx)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.countryTabText, idx === activeCountryIdx && s.countryTabTextActive]}>{c.flag} {c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* 날짜 (국가별) */}
              <View style={s.fieldBlock}>
                <View style={s.perCountryLabelRow}>
                  <Text style={s.fieldLabelReq}>{t('newRecord.date')}</Text>
                  <Text style={s.reqTag}>✱</Text>
                  {isMultiCountry && (
                    <Text style={s.perCountryHint}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={s.dateBtn}
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={s.dateBtnCol}>
                    <Text style={s.dateBtnLabel}>{t('newRecord.departDate')}</Text>
                    <Text style={s.dateBtnVal}>{formatDate(startDate)}</Text>
                  </View>
                  <Text style={s.dateBtnArrow}>→</Text>
                  <View style={s.dateBtnCol}>
                    <Text style={s.dateBtnLabel}>{t('newRecord.arriveDate')}</Text>
                    <Text style={s.dateBtnVal}>{formatDate(endDate)}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}><CalendarIcon size={18} color={COLORS.purpleNeon} /></View>
                </TouchableOpacity>
              </View>

              {/* 글 (공통) */}
              <View style={s.fieldBlock}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabelReq}>{t('newRecord.textLabel')}</Text>
                  <Text style={s.reqTag}>✱</Text>
                </View>
                <TextInput
                  style={[s.fieldInput, s.memoInput]}
                  placeholder={t('newRecord.textPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={memo}
                  onChangeText={setMemo}
                  multiline
                  textAlignVertical="top"
                  maxLength={1000}
                />
                <Text style={s.charCount}>{memo.length}/1000</Text>
              </View>

              {/* ── 동행자 선택 ── */}
              <View style={s.companionSection}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.companionSectionLabel}>{t('newRecord.companionSelect')}</Text>
                  <Text style={s.reqTag}>✱</Text>
                </View>
                {/* 컴팩트 칩 */}
                <View style={s.companionChipWrap}>
                  {DEFAULT_COMPANIONS.map(comp => {
                    const isActive = selectedCompanions.includes(comp);
                    const iconColor = isActive ? COLORS.purpleNeon : COLORS.textDim;
                    const COMP_ICONS: Record<string, React.ReactNode> = {
                      '혼자': <SoloIcon color={iconColor} />,
                      '친구': <FriendIcon color={iconColor} />,
                      '연인': <CoupleIcon color={iconColor} />,
                      '가족': <FamilyIcon color={iconColor} />,
                      '부모님': <ParentIcon color={iconColor} />,
                      '형제': <SiblingIcon color={iconColor} />,
                    };
                    return (
                      <TouchableOpacity
                        key={comp}
                        style={[s.companionChip, isActive && s.companionChipActive]}
                        onPress={() => toggleCompanion(comp)}
                        activeOpacity={0.75}
                      >
                        <View style={s.companionChipIconWrap}>{COMP_ICONS[comp]}</View>
                        <Text style={[s.companionChipTxt, isActive && s.companionChipTxtActive]}>{companionLabel(comp)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* 선택된 앱 친구 칩 */}
                {companionFriends.length > 0 && (
                  <View style={s.customChipRow}>
                    {companionFriends.map(friend => (
                      <View key={friend} style={s.friendChip}>
                        <View style={s.friendChipAvatar}>
                          <Text style={s.friendChipAvatarTxt}>{friend[0]}</Text>
                        </View>
                        <Text style={s.friendChipName}>{friend}</Text>
                        <TouchableOpacity
                          onPress={() => removeCompanionFriend(friend)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.customChipX}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* 앱 친구 추가 버튼 */}
                <TouchableOpacity
                  style={s.addFriendBtn}
                  onPress={() => setFriendPickerVisible(true)}
                  activeOpacity={0.75}
                >
                  <FriendIcon color={COLORS.purpleNeon} />
                  <Text style={s.addFriendTxt}>{t('newRecord.addAppFriend')}</Text>
                  {companionFriends.length > 0 && (
                    <View style={s.addFriendBadge}>
                      <Text style={s.addFriendBadgeTxt}>{companionFriends.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* 별점 (국가별) */}
              <View style={s.fieldBlock}>
                <View style={s.ratingLabelRow}>
                  <View style={s.perCountryLabelRow}>
                    <Text style={s.fieldLabelReq}>{t('newRecord.ratingLabel')}</Text>
                    <Text style={s.reqTag}>✱</Text>
                    {isMultiCountry && (
                      <Text style={s.perCountryHint}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                    )}
                  </View>
                  {rating > 0
                    ? <Text style={s.ratingScore}>{rating.toFixed(1)} / 5.0</Text>
                    : <Text style={s.ratingScoreEmpty}>{t('newRecord.ratingEmpty')}</Text>}
                </View>
                <View style={s.ratingCard}>
                  {renderStars()}
                </View>
              </View>

              {/* 공개 범위 (공통) */}
              <View style={s.fieldBlock}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabelReq}>{t('newRecord.visibility')}</Text>
                </View>
                <View style={s.companionChipWrap}>
                  {VISIBILITY_OPTIONS.map(opt => {
                    const isActive = visibility === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[s.companionChip, isActive && s.companionChipActive]}
                        onPress={() => setVisibility(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.companionChipTxt, isActive && s.companionChipTxtActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── 선택 항목 구분선 ── */}
              <View style={s.companionDivider} />

              {/* 안내 */}
              <Text style={s.optNoticeText}>{t('newRecord.optionalNotice')}</Text>

              {/* 예산 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <CoinIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>{t('newRecord.budget')}</Text>
                  {budget ? <Text style={s.optCardValue}>{Number(budget).toLocaleString()} {currency}</Text> : null}
                </View>
                <View style={s.optBudgetRow}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.optCurrencyChip, currency === c && s.optCurrencyChipActive]}
                      onPress={() => chooseCurrency(c)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.optCurrencyTxt, currency === c && s.optCurrencyTxtActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* 기타 통화 버튼 */}
                  <TouchableOpacity
                    style={[s.optCurrencyChip, !CURRENCIES.includes(currency) && s.optCurrencyChipActive]}
                    onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.optCurrencyTxt, !CURRENCIES.includes(currency) && s.optCurrencyTxtActive]}>
                      {CURRENCIES.includes(currency) ? t('newRecord.otherCurrency') : currency}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.optBudgetInput}
                    placeholder={t('newRecord.amountPlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={budget}
                    onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 날씨 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <WeatherIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>{t('newRecord.weather')}</Text>
                  {weather ? <Text style={s.optCardValue}>{WEATHER_OPTIONS.find(w => w.value === weather)?.label}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity
                      key={w.value}
                      style={[s.optSmallBtn, weather === w.value && s.optSmallBtnActive]}
                      onPress={() => setWeather(weather === w.value ? '' : w.value)}
                      activeOpacity={0.75}
                    >
                      {WEATHER_ICON_MAP[w.value]}
                      <Text style={[s.optSmallTxt, weather === w.value && s.optSmallTxtActive]}>
                        {w.value}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 직항/경유 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <DesignerPlaneIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>{t('newRecord.flightTitle')}</Text>
                  {flightType ? <Text style={s.optCardValue}>{flightLabel(flightType)}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {FLIGHT_OPTIONS.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[s.optFlightBtn, flightType === f && s.optFlightBtnActive]}
                      onPress={() => setFlightType(flightType === f ? '' : f)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {f === '직항' ? <TakeoffIcon size={14} color={flightType === f ? COLORS.purpleNeon : COLORS.textDim} /> : <TransferIcon size={14} color={flightType === f ? COLORS.purpleNeon : COLORS.textDim} />}
                        <Text style={[s.optFlightTxt, flightType === f && s.optFlightTxtActive]}>
                          {flightLabel(f)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 여행 키워드 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <TagIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>{t('newRecord.keyword')}</Text>
                  {keywords.length > 0 && <Text style={s.optCardValue}>{t('newRecord.keywordCountN', { count: keywords.length })}</Text>}
                </View>
                {/* 태그 + 입력창 인라인 */}
                <View style={s.kwInputBox}>
                  {keywords.map(kw => (
                    <TouchableOpacity
                      key={kw}
                      style={s.kwTag}
                      onPress={() => setKeywords(prev => prev.filter(k => k !== kw))}
                      activeOpacity={0.75}
                    >
                      <Text style={s.kwTagTxt}>{kw}</Text>
                      <Text style={s.kwTagDel}> ✕</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={s.kwInlineInput}
                    value={keywordQuery}
                    onChangeText={v => {
                      // 스페이스 입력 시 태그 추가
                      if (v.endsWith(' ')) addKeyword(v);
                      else setKeywordQuery(v);
                    }}
                    placeholder={keywords.length === 0 ? t('newRecord.keywordPlaceholder') : '#'}
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={() => addKeyword(keywordQuery)}
                  />
                </View>
                <Text style={s.kwHint}>{t('newRecord.keywordHint')}</Text>
              </View>

            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 필수 미충족 안내 토스트 */}
      {hintMsg !== '' && (
        <View style={s.hintToast} pointerEvents="none">
          <Text style={s.hintToastText}>{hintMsg}</Text>
        </View>
      )}

      {/* 이전 / 다음 / 저장 버튼 */}
      <StepNavBar
        step={step}
        totalSteps={TOTAL_STEPS}
        canNext={canGoNext()}
        onPrev={goPrev}
        onNext={handleNextPress}
        onSave={handleSavePress}
        saving={saving}
      />

      {/* 캘린더 바텀시트 */}
      <CalendarBottomSheet
        visible={calendarVisible}
        initialStart={startDate}
        initialEnd={endDate}
        onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
        onClose={() => setCalendarVisible(false)}
      />

      {/* 🔒 비공개 친구 선택 모달 */}
      <PrivacyModal
        visible={privacyModalIndex !== null}
        selectedFriends={privacyModalIndex !== null ? (mediaPrivacy[privacyModalIndex] || []) : []}
        allFriends={friendNames}
        onToggle={friend => privacyModalIndex !== null && toggleMediaPrivacyFriend(privacyModalIndex, friend)}
        onSetAll={friends => privacyModalIndex !== null && setMediaPrivacyAll(privacyModalIndex, friends)}
        onClose={() => setPrivacyModalIndex(null)}
      />

      {/* 앱 친구 선택 모달 */}
      <FriendPickerModal
        visible={friendPickerVisible}
        friends={friendNames}
        selected={companionFriends}
        onToggle={toggleCompanionFriend}
        onClose={() => setFriendPickerVisible(false)}
      />

      {/* 기타 통화 선택 모달 */}
      <CurrencyPickerModal
        visible={currencyModalVisible}
        search={currencySearch}
        onSearchChange={setCurrencySearch}
        selected={currency}
        onSelect={(code) => { chooseCurrency(code); setCurrencyModalVisible(false); }}
        onClose={() => setCurrencyModalVisible(false)}
      />

      {/* 자동 불러오기용 캘린더 */}
      <CalendarBottomSheet
        visible={autoLoadCalendarVisible}
        initialStart={autoLoadStart}
        initialEnd={autoLoadEnd}
        startLabel={t('newRecord.startLabel')}
        endLabel={t('newRecord.endLabel')}
        onConfirm={(s, e) => {
          setAutoLoadStart(s);
          setAutoLoadEnd(e);
          setAutoLoadCalendarVisible(false);
          loadMediaByDate(s, e);
        }}
        onClose={() => setAutoLoadCalendarVisible(false)}
      />

      {/* ── 미디어 선택 모달 (30개 초과 시) ── */}
      <MediaPickerModal
        visible={mediaPickerVisible}
        assets={mediaPickerAssets}
        selected={mediaPickerSelected}
        max={mediaPickerMax}
        onToggle={toggleMediaPickerItem}
        onConfirm={confirmMediaPickerSelection}
        onClose={() => setMediaPickerVisible(false)}
      />

    </SafeAreaView>
  );
}

// ─── 스타일 ───
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelBtn: { padding: 4 },
  cancelTxt: { fontSize: 16, color: COLORS.textMuted },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },

  stepTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  stepTitleText: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  stepCountText: { fontSize: 13, color: COLORS.textMuted },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  stepHint: {
    marginTop: 20,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // ── Step 1 ──
  step1Wrap: {
    flex: 1,
  },
  searchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchCardSelected: {
    borderColor: COLORS.purpleNeon,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    padding: 0,
  },
  clearBtnTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '600' },

  countryResultBox: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 320,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  continentHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    letterSpacing: 0.8,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  countryIcon: { fontSize: 22, marginRight: 14 },
  countryName: { fontSize: 15, color: COLORS.white },
  countryNameSelected: { color: COLORS.purpleNeon, fontWeight: '600' },
  countryItemSelected: {
    backgroundColor: 'rgba(191,133,252,0.08)',
  },
  countryCheckMark: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  noResultText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', marginVertical: 24 },

  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  countryChipText: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },
  countryChipRemove: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '700',
  },

  selectedBadge: {
    marginTop: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedBadgeTxt: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },

  // ── 국가별 탭 (Step 2, 3 공용) ──
  countryTabScroll: {
    marginBottom: 14,
  },
  countryTabContent: {
    gap: 8,
  },
  countryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  countryTabActive: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderColor: COLORS.purpleNeon,
  },
  countryTabText: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: '500',
  },
  countryTabTextActive: {
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  perCountryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perCountryHint: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    backgroundColor: 'rgba(191,133,252,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // ── Step 2 ──
  addMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(191,133,252,0.35)',
    borderStyle: 'dashed',
  },
  addMediaBtnDisabled: {
    opacity: 0.4,
  },
  addMediaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  addMediaText: { fontSize: 15, color: COLORS.white, fontWeight: '600' },
  addMediaSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  addMediaCountBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addMediaCountTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '700' },

  // 사진 썸네일/드래그 행 스타일은 components/record/DraggableLists 로 이동

  // 빈 상태
  mediaEmptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  mediaEmptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  mediaEmptyDesc:  { fontSize: 13, color: COLORS.textMuted },

  // ── Step 3 ──
  step3Wrap: {
    gap: 16,
  },
  fieldBlock: {
    gap: 8,
  },
  // 필수 항목 라벨 — 흰색
  fieldLabelReq: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 라벨 + 필수 태그 행
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 필수 표시 태그
  reqTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    lineHeight: 14,
  },
  // 선택 항목 라벨 — 회색 (Step 4·5용)
  fieldInput: {
    backgroundColor: COLORS.card,   // #2E2E3B
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  memoInput: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  charCount: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  hintToast: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  hintToastText: { color: COLORS.purpleNeon, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateBtnCol: { flex: 1 },
  dateBtnLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  dateBtnVal:   { fontSize: 15, fontWeight: '600', color: COLORS.white },
  dateBtnArrow: { fontSize: 18, color: COLORS.textMuted, marginHorizontal: 12 },

  ratingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingScore: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  ratingScoreEmpty: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  starWrap: { width: 32, height: 32 },
  starAbsolute: { position: 'absolute', left: 0, top: 0, width: 32 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },
  starChar: { fontSize: 28, color: '#3A3A4A', textAlign: 'center', lineHeight: 32, width: 32 },
  starCharActive: { color: COLORS.gold },

  // ── Step 4 ──
  companionSection: {
    gap: 12,
  },
  companionSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 컴팩트 칩 래퍼
  companionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // 컴팩트 칩 (작은 pill 형태)
  companionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    gap: 5,
  },
  companionChipActive: {
    backgroundColor: 'rgba(107,33,168,0.3)',
    borderColor: COLORS.purpleNeon,
  },
  companionChipIconWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  companionChipTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  companionChipTxtActive: { color: COLORS.white },

  // 직접입력으로 추가된 칩
  customChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  customChipX:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // 앱 친구 칩
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
  },
  friendChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendChipAvatarTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },
  friendChipName: { fontSize: 13, color: COLORS.white, fontWeight: '600' },

  // 앱 친구 추가 버튼
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderStyle: 'dashed' as any,
  },
  addFriendTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '500' },
  addFriendBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 'auto' as any,
  },
  addFriendBadgeTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },

  companionDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 20,
  },

  // Step 5에서도 쓰는 칩 (날씨·비행·키워드)

  // ── Step 5 ──

  // 안내 텍스트
  optNoticeText: {
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: 'center',
  },

  // 공통 옵션 행
  optRow: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optRowTitle: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  optCardValue: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    fontWeight: '600',
    backgroundColor: 'rgba(191,133,252,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // 예산 (compact)
  optBudgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  optCurrencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optCurrencyChipActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optCurrencyTxt:       { fontSize: 12, fontWeight: '700', color: COLORS.textDim },
  optCurrencyTxtActive: { color: COLORS.white },
  optBudgetInput: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // 날씨 / 직항 공통 칩 행
  optChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  optSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    gap: 4,
  },
  optSmallBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optSmallTxt:       { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  optSmallTxtActive: { color: COLORS.white, fontWeight: '600' },

  // 직항/경유 버튼
  optFlightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optFlightBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optFlightTxt:       { fontSize: 13, fontWeight: '600', color: COLORS.textDim },
  optFlightTxtActive: { color: COLORS.white },

  // 키워드 인풋 박스 (태그 + 입력 인라인)
  kwInputBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minHeight: 42,
  },
  kwHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  kwTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
  },
  kwTagTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '600' },
  kwTagDel: { fontSize: 11, color: 'rgba(191,133,252,0.6)' },
  kwInlineInput: {
    fontSize: 13,
    color: COLORS.white,
    padding: 0,
    minWidth: 80,
    flex: 1,
  },

  // (비공개 모달 스타일은 pm 객체로 분리됨)

  // 기타 통화 모달 스타일은 components/record/CurrencyPickerModal 로 이동

  // ── 기간 자동 불러오기 ──
  autoLoadBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  autoLoadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },

  // 모달 전체 배경

  // 로딩

  // 제목

  // 날짜 범위

  // 날짜 수정 버튼

  // 안내 문구

  // 버튼 행

  // 토스트
  draggableHelperText: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});

// 드래그 앤 드롭 리스트(국가/사진)는 components/record/DraggableLists 로 분리

// ─── 앱 친구 선택 모달 스타일 ───
// 앱 친구 선택 모달은 components/record/FriendPickerModal 로 분리
// 미디어 선택 모달은 components/record/MediaPickerModal 로 분리
