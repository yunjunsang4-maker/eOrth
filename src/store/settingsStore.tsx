import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { usePersistence, STORE_KEYS } from './persist';

// 소셜 다이어리 카드 모드: full = 상호작용 표시(B, 기본), minimal = 미니멀(A)
export type DiaryCardMode = 'full' | 'minimal';
export type SignUpMethod = 'email' | 'google' | 'apple';
// 지도(지구본/대륙) 영토 표시 방식
export type MapDisplayMode = 'flag' | 'color' | 'photo';
// 지구본 형태: aurora = 보라 발광 행성(디폴트, 색상 표시), classic = 현재 지구본(사진 표시)
export type GlobeVariant = 'aurora' | 'classic';
// 성별: '' = 미설정
export type Gender = 'male' | 'female' | '';
// 앱 언어: 한국어 / 영어
export type AppLanguage = 'ko' | 'en';

// 기본 아이디(handle) 생성. 충돌 확률을 낮추기 위해 엔트로피를 늘린다(랜덤 2회 결합).
// DB엔 handle UNIQUE 제약이 있어, 드문 충돌 시 ProfileSync가 재생성·재시도한다.
export function genHandle(): string {
  const r = () => Math.random().toString(36).slice(2, 8);
  return `user_${r()}${r()}`;
}
// 알림 설정 토글 키 (영속)
export type NotifPrefKey =
  | 'master' | 'friendTrip' | 'likes' | 'newFollower'
  | 'returnDetect' | 'memoryRemind' | 'marketing';
const DEFAULT_NOTIF_PREFS: Record<NotifPrefKey, boolean> = {
  master: true, friendTrip: true, likes: true, newFollower: true,
  returnDetect: false, memoryRemind: true, marketing: false,
};

interface SettingsContextType {
  showCounts: boolean;
  setShowCounts: (v: boolean) => void;
  homeCountryCode: string;
  setHomeCountryCode: (v: string) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  diaryCardMode: DiaryCardMode;
  setDiaryCardMode: (v: DiaryCardMode) => void;
  birthday: string; // YYYY-MM-DD
  setBirthday: (v: string) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
  language: AppLanguage;
  setLanguage: (v: AppLanguage) => void;
  handle: string;
  setHandle: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  profilePhoto: string | null;
  setProfilePhoto: (v: string | null) => void;
  handleLastChanged: number | null;
  setHandleLastChanged: (v: number | null) => void;
  // 사용자가 아이디(handle)를 직접 확정했는지 여부. true면 충돌 시에도 임의 값으로 재생성하지 않는다.
  handleChosen: boolean;
  setHandleChosen: (v: boolean) => void;
  signUpMethod: SignUpMethod;
  setSignUpMethod: (v: SignUpMethod) => void;
  signUpEmail: string;
  setSignUpEmail: (v: string) => void;
  arrivalDetect: boolean;
  setArrivalDetect: (v: boolean) => void;
  currentVisitedCountryCode: string;
  setCurrentVisitedCountryCode: (v: string) => void;
  // 소유권이 인증된 네이버 블로그 ID 목록(소문자) — 인증된 블로그 글만 가져오기 허용
  verifiedNaverBlogIds: string[];
  addVerifiedNaverBlogId: (blogId: string) => void;
  // ── 영토 표시 설정 (지구본/대륙) — 영속 저장 ──
  globeVariant: GlobeVariant;
  setGlobeVariant: React.Dispatch<React.SetStateAction<GlobeVariant>>;
  // 지구본 스킨 id (constants/globeSkins.ts) — aurora(색 활성화) 폼에만 적용
  globeSkin: string;
  setGlobeSkin: (v: string) => void;
  globeDisplayMode: MapDisplayMode;
  setGlobeDisplayMode: React.Dispatch<React.SetStateAction<MapDisplayMode>>;
  globeColor: string;
  setGlobeColor: React.Dispatch<React.SetStateAction<string>>;
  countryColors: Record<string, string>;
  setCountryColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  countryDisplayModes: Record<string, MapDisplayMode>;
  setCountryDisplayModes: React.Dispatch<React.SetStateAction<Record<string, MapDisplayMode>>>;
  regionGlobalMode: 'color' | 'photo';
  setRegionGlobalMode: React.Dispatch<React.SetStateAction<'color' | 'photo'>>;
  regionDisplayModes: Record<string, 'color' | 'photo'>;
  setRegionDisplayModes: React.Dispatch<React.SetStateAction<Record<string, 'color' | 'photo'>>>;
  // 지역별 색상 (키: `${ISO3}|${regionEn}` 복합 — 국가 간 동명 지역 충돌 방지)
  regionColors: Record<string, string>;
  setRegionColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  // 프로필에 표시할 대표 배지 id (사용자 선택, 영속)
  representativeBadgeIds: number[];
  setRepresentativeBadgeIds: React.Dispatch<React.SetStateAction<number[]>>;
  // 배지 획득 시점 맵 (배지 id → 최초 획득 timestamp). 한 번 획득하면 영구 유지.
  badgeEarnedAt: Record<number, number>;
  markBadgesEarned: (ids: number[]) => void; // 아직 기록 없는 id만 현재 시각으로 추가
  pendingBadgeToasts: number[];   // 신규 획득 토스트로 보여줄 배지 id 큐
  dismissBadgeToast: () => void;  // 큐 맨 앞 토스트 제거
  // 게시물 공유(보낸) 누적 횟수 — 배지 74용
  shareSentCount: number;
  incrementShareSent: () => void;
  // 앱 연속 접속 일수 — 배지 112·113·114용 (앱 시작 시 자동 갱신)
  loginStreak: number;
  // 앱 첫 설치(첫 실행) 시각 — 배지 115용
  installedAt: number | null;
  // 알림 설정 토글 — 영속
  notifPrefs: Record<NotifPrefKey, boolean>;
  setNotifPref: (key: NotifPrefKey, value: boolean) => void;
  // 계정 공개 여부 — 영속(현재는 UI 상태 저장; 실제 공개범위 강제는 백엔드 도입 후)
  accountPublic: boolean;
  // ── 프리미엄 구독 ──
  // 현재는 로컬 상태(베타 체험 토글). 결제(RevenueCat) 연동 시 구매 검증 결과로 갱신하도록 교체.
  isPremium: boolean;
  setIsPremium: (v: boolean) => void;
  // 아이디 표시 폰트(프리미엄) — HANDLE_FONTS의 id. 서버(profiles.handle_font)로 동기화돼 타인에게도 보임
  handleFont: string | null;
  setHandleFont: (v: string | null) => void;
  // 스트립 로고 제거(프리미엄) — 프리미엄 중에도 로고를 남기고 싶으면 끌 수 있는 선택 토글
  stripLogoRemoval: boolean;
  setStripLogoRemoval: (v: boolean) => void;
  setAccountPublic: (v: boolean) => void;
  resetSettings: () => void; // 모든 설정을 기본값으로 되돌림
}

// AsyncStorage에 저장되는 설정 스냅샷
interface SettingsPersistPayload {
  showCounts: boolean;
  homeCountryCode: string;
  snapEnabled: boolean;
  diaryCardMode: DiaryCardMode;
  birthday?: string; // 과거 저장본엔 없을 수 있어 optional
  gender?: Gender;   // 과거 저장본엔 없을 수 있어 optional
  language?: AppLanguage; // 과거 저장본엔 없을 수 있어 optional
  handle: string;
  bio: string;
  profilePhoto: string | null;
  handleLastChanged: number | null;
  handleChosen?: boolean; // 과거 저장본엔 없을 수 있어 optional
  signUpMethod: SignUpMethod;
  signUpEmail: string;
  arrivalDetect: boolean;
  currentVisitedCountryCode: string;
  verifiedNaverBlogIds?: string[]; // 과거 저장본엔 없을 수 있어 optional
  // 영토 표시 설정 (과거 저장본엔 없을 수 있어 optional)
  globeVariant?: GlobeVariant;
  globeSkin?: string; // 지구본 스킨 id
  globeDisplayMode?: MapDisplayMode;
  globeColor?: string;
  countryColors?: Record<string, string>;
  countryDisplayModes?: Record<string, MapDisplayMode>;
  regionGlobalMode?: 'color' | 'photo';
  regionDisplayModes?: Record<string, 'color' | 'photo'>;
  regionColors?: Record<string, string>;
  representativeBadgeIds?: number[]; // 과거 저장본엔 없을 수 있어 optional
  badgeEarnedAt?: Record<number, number>; // 과거 저장본엔 없을 수 있어 optional
  shareSentCount?: number; // 과거 저장본엔 없을 수 있어 optional
  loginStreak?: number;    // 과거 저장본엔 없을 수 있어 optional
  lastVisitDay?: number | null; // 마지막 접속일(로컬 자정 timestamp)
  installedAt?: number | null;  // 앱 첫 실행 시각
  notifPrefs?: Partial<Record<NotifPrefKey, boolean>>; // 알림 설정 토글
  accountPublic?: boolean; // 계정 공개 여부
  isPremium?: boolean;     // 프리미엄 구독 (베타: 로컬 토글)
  handleFont?: string | null; // 아이디 표시 폰트 id
  stripLogoRemoval?: boolean; // 스트립 로고 제거 토글 (프리미엄)
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showCounts, setShowCounts] = useState(true);
  const [homeCountryCode, setHomeCountryCode] = useState('KR'); // 기본 거주국: 한국
  const [snapEnabled, setSnapEnabled] = useState(true);          // 스냅 알림 활성화
  const [diaryCardMode, setDiaryCardMode] = useState<DiaryCardMode>('full'); // 기본 B
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [language, setLanguage] = useState<AppLanguage>('ko'); // 기본 언어: 한국어
  // 기본 핸들은 설치마다 고유 생성(개발자 핸들 하드코딩 제거) — 사용자가 EditProfile에서 변경 가능
  const [handle, setHandle] = useState(() => genHandle());
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [handleLastChanged, setHandleLastChanged] = useState<number | null>(null);
  const [handleChosen, setHandleChosen] = useState(false);
  const [signUpMethod, setSignUpMethod] = useState<SignUpMethod>('email');
  const [signUpEmail, setSignUpEmail] = useState('user@eorth.app');
  const [arrivalDetect, setArrivalDetect] = useState(true);
  const [currentVisitedCountryCode, setCurrentVisitedCountryCode] = useState('KR'); // 여행국가: 기본값은 거주국가(KR)와 동일 → 실제 여행 감지 전엔 거주국가 표시
  const [verifiedNaverBlogIds, setVerifiedNaverBlogIds] = useState<string[]>([]); // 소유권 인증된 네이버 블로그 ID
  const addVerifiedNaverBlogId = useCallback((blogId: string) => {
    const id = blogId.trim().toLowerCase();
    if (!id) return;
    setVerifiedNaverBlogIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  // ── 영토 표시 설정 (영속) ──
  const [globeVariant, setGlobeVariant] = useState<GlobeVariant>('aurora'); // 디폴트: 보라 발광 행성
  const [globeSkin, setGlobeSkin] = useState('aurora'); // 지구본 스킨 — 기본(오로라)
  const [globeDisplayMode, setGlobeDisplayMode] = useState<MapDisplayMode>('flag');
  const [globeColor, setGlobeColor] = useState('#BF85FC');
  const [countryColors, setCountryColors] = useState<Record<string, string>>({});
  const [countryDisplayModes, setCountryDisplayModes] = useState<Record<string, MapDisplayMode>>({});
  const [regionGlobalMode, setRegionGlobalMode] = useState<'color' | 'photo'>('color');
  const [regionDisplayModes, setRegionDisplayModes] = useState<Record<string, 'color' | 'photo'>>({});
  const [regionColors, setRegionColors] = useState<Record<string, string>>({});
  const [representativeBadgeIds, setRepresentativeBadgeIds] = useState<number[]>([]);
  const [badgeEarnedAt, setBadgeEarnedAt] = useState<Record<number, number>>({});
  const [pendingBadgeToasts, setPendingBadgeToasts] = useState<number[]>([]); // 신규 획득 토스트 큐(비영속)
  const [shareSentCount, setShareSentCount] = useState(0);
  const [loginStreak, setLoginStreak] = useState(0);
  const [lastVisitDay, setLastVisitDay] = useState<number | null>(null);
  const [installedAt, setInstalledAt] = useState<number | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<NotifPrefKey, boolean>>(DEFAULT_NOTIF_PREFS);
  const setNotifPref = useCallback((key: NotifPrefKey, value: boolean) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);
  const [accountPublic, setAccountPublic] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [handleFont, setHandleFont] = useState<string | null>(null);
  const [stripLogoRemoval, setStripLogoRemoval] = useState(true); // 기본: 프리미엄이면 로고 제거

  const incrementShareSent = useCallback(() => setShareSentCount((c) => c + 1), []);

  // 앱 시작(복원 완료) 시 1회: 오늘 접속을 반영해 연속 접속일을 갱신한다.
  const visitRecordedRef = useRef(false);

  // 토스트 판정을 위해 현재 badgeEarnedAt을 ref로 추적(콜백을 안정적으로 유지)
  const badgeEarnedAtRef = useRef(badgeEarnedAt);
  badgeEarnedAtRef.current = badgeEarnedAt;

  const markBadgesEarned = useCallback((ids: number[]) => {
    const prev = badgeEarnedAtRef.current;
    const newly = ids.filter((id) => prev[id] == null);
    if (newly.length === 0) return; // 새로 획득한 게 없음
    const now = Date.now();
    const next = { ...prev };
    for (const id of newly) next[id] = now;
    badgeEarnedAtRef.current = next;
    setBadgeEarnedAt(next);
    // 첫 시드(prev 비어있음)는 토스트 억제 — 실제 '신규 획득'만 알린다(앱 시작 시 시드 폭주 방지)
    if (Object.keys(prev).length > 0) {
      setPendingBadgeToasts((q) => [...q, ...newly]);
    }
  }, []);

  const dismissBadgeToast = useCallback(() => {
    setPendingBadgeToasts((q) => q.slice(1));
  }, []);

  const hydrated = usePersistence<SettingsPersistPayload>(
    STORE_KEYS.settings,
    (p) => {
      setShowCounts(p.showCounts);
      setHomeCountryCode(p.homeCountryCode);
      setSnapEnabled(p.snapEnabled);
      setDiaryCardMode(p.diaryCardMode);
      setBirthday(p.birthday ?? '');
      setGender(p.gender ?? '');
      setLanguage(p.language ?? 'ko');
      setHandle(p.handle);
      setBio(p.bio);
      setProfilePhoto(p.profilePhoto);
      setHandleLastChanged(p.handleLastChanged);
      setHandleChosen(p.handleChosen ?? false);
      setSignUpMethod(p.signUpMethod);
      setSignUpEmail(p.signUpEmail);
      setArrivalDetect(p.arrivalDetect);
      setCurrentVisitedCountryCode(p.currentVisitedCountryCode);
      setVerifiedNaverBlogIds(p.verifiedNaverBlogIds ?? []);
      setGlobeVariant(p.globeVariant ?? 'aurora');
      setGlobeSkin(p.globeSkin ?? 'aurora');
      setGlobeDisplayMode(p.globeDisplayMode ?? 'flag');
      setGlobeColor(p.globeColor ?? '#BF85FC');
      setCountryColors(p.countryColors ?? {});
      setCountryDisplayModes(p.countryDisplayModes ?? {});
      setRegionGlobalMode(p.regionGlobalMode ?? 'color');
      setRegionDisplayModes(p.regionDisplayModes ?? {});
      setRegionColors(p.regionColors ?? {});
      setRepresentativeBadgeIds(p.representativeBadgeIds ?? []);
      setBadgeEarnedAt(p.badgeEarnedAt ?? {});
      setShareSentCount(p.shareSentCount ?? 0);
      setLoginStreak(p.loginStreak ?? 0);
      setLastVisitDay(p.lastVisitDay ?? null);
      setInstalledAt(p.installedAt ?? null);
      setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...(p.notifPrefs ?? {}) });
      setAccountPublic(p.accountPublic ?? true);
      setIsPremium(p.isPremium ?? false);
      setHandleFont(p.handleFont ?? null);
      setStripLogoRemoval(p.stripLogoRemoval ?? true);
    },
    () => ({
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      birthday,
      gender,
      language,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      handleChosen,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
      verifiedNaverBlogIds,
      globeVariant,
      globeSkin,
      globeDisplayMode,
      globeColor,
      countryColors,
      countryDisplayModes,
      regionGlobalMode,
      regionDisplayModes,
      regionColors,
      representativeBadgeIds,
      badgeEarnedAt,
      shareSentCount,
      loginStreak,
      lastVisitDay,
      installedAt,
      notifPrefs,
      accountPublic,
      isPremium,
      handleFont,
      stripLogoRemoval,
    }),
    [
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      birthday,
      gender,
      language,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      handleChosen,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
      verifiedNaverBlogIds,
      globeVariant,
      globeSkin,
      globeDisplayMode,
      globeColor,
      countryColors,
      countryDisplayModes,
      regionGlobalMode,
      regionDisplayModes,
      regionColors,
      representativeBadgeIds,
      badgeEarnedAt,
      shareSentCount,
      loginStreak,
      lastVisitDay,
      installedAt,
      notifPrefs,
      accountPublic,
      isPremium,
      handleFont,
      stripLogoRemoval,
    ],
  );

  // ── 앱 연속 접속일 갱신 (복원 완료 후 1회) ──
  useEffect(() => {
    if (!hydrated || visitRecordedRef.current) return;
    visitRecordedRef.current = true;
    if (installedAt == null) setInstalledAt(Date.now()); // 첫 실행 시각 기록(배지 115)
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const today = d.getTime(); // 로컬 자정 기준 '오늘'
    if (lastVisitDay === today) return; // 오늘 이미 반영됨
    const DAY = 24 * 60 * 60 * 1000;
    const diff = lastVisitDay != null ? Math.round((today - lastVisitDay) / DAY) : null;
    setLoginStreak((prev) => (diff === 1 ? prev + 1 : 1)); // 어제 접속이면 +1, 아니면(공백/최초) 1
    setLastVisitDay(today);
  }, [hydrated, lastVisitDay]);

  const resetSettings = () => {
    setShowCounts(true);
    setHomeCountryCode('KR');
    setSnapEnabled(true);
    setDiaryCardMode('full');
    setBirthday('');
    setGender('');
    setLanguage('ko');
    setHandle(genHandle());
    setBio('');
    setProfilePhoto(null);
    setHandleLastChanged(null);
    setHandleChosen(false);
    setSignUpMethod('email');
    setSignUpEmail('user@eorth.app');
    setArrivalDetect(true);
    setCurrentVisitedCountryCode('KR');
    setVerifiedNaverBlogIds([]);
    setGlobeVariant('aurora');
    setGlobeSkin('aurora');
    setGlobeDisplayMode('flag');
    setGlobeColor('#BF85FC');
    setCountryColors({});
    setCountryDisplayModes({});
    setRegionGlobalMode('color');
    setRegionDisplayModes({});
    setRegionColors({});
    setRepresentativeBadgeIds([]);
    setBadgeEarnedAt({});
    setPendingBadgeToasts([]);
    setShareSentCount(0);
    setLoginStreak(0);
    setLastVisitDay(null);
    setInstalledAt(null);
    setNotifPrefs(DEFAULT_NOTIF_PREFS);
    setAccountPublic(true);
    setIsPremium(false);
    setHandleFont(null);
    setStripLogoRemoval(true);
    visitRecordedRef.current = false;
  };

  // 복원 전에는 기본값이 잠깐 보이지 않도록 렌더를 막는다
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0A0118' }} />;
  }

  return (
    <SettingsContext.Provider
      value={{
        showCounts,
        setShowCounts,
        homeCountryCode,
        setHomeCountryCode,
        snapEnabled,
        setSnapEnabled,
        diaryCardMode,
        setDiaryCardMode,
        birthday,
        setBirthday,
        gender,
        setGender,
        language,
        setLanguage,
        handle,
        setHandle,
        bio,
        setBio,
        profilePhoto,
        setProfilePhoto,
        handleLastChanged,
        setHandleLastChanged,
        handleChosen,
        setHandleChosen,
        signUpMethod,
        setSignUpMethod,
        signUpEmail,
        setSignUpEmail,
        arrivalDetect,
        setArrivalDetect,
        currentVisitedCountryCode,
        setCurrentVisitedCountryCode,
        verifiedNaverBlogIds,
        addVerifiedNaverBlogId,
        globeVariant,
        setGlobeVariant,
        globeSkin,
        setGlobeSkin,
        globeDisplayMode,
        setGlobeDisplayMode,
        globeColor,
        setGlobeColor,
        countryColors,
        setCountryColors,
        countryDisplayModes,
        setCountryDisplayModes,
        regionGlobalMode,
        setRegionGlobalMode,
        regionDisplayModes,
        setRegionDisplayModes,
        regionColors,
        setRegionColors,
        representativeBadgeIds,
        setRepresentativeBadgeIds,
        badgeEarnedAt,
        markBadgesEarned,
        pendingBadgeToasts,
        dismissBadgeToast,
        shareSentCount,
        incrementShareSent,
        loginStreak,
        installedAt,
        notifPrefs,
        setNotifPref,
        accountPublic,
        setAccountPublic,
        isPremium,
        setIsPremium,
        handleFont,
        setHandleFont,
        stripLogoRemoval,
        setStripLogoRemoval,
        resetSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
