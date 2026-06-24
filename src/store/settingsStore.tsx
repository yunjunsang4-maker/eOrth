import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { usePersistence, STORE_KEYS } from './persist';

// 소셜 다이어리 카드 모드: full = 상호작용 표시(B, 기본), minimal = 미니멀(A)
export type DiaryCardMode = 'full' | 'minimal';
export type SignUpMethod = 'email' | 'google' | 'apple';
// 성별: '' = 미설정
export type Gender = 'male' | 'female' | '';

interface SettingsContextType {
  showCounts: boolean;
  setShowCounts: (v: boolean) => void;
  homeCountryCode: string;
  setHomeCountryCode: (v: string) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  diaryCardMode: DiaryCardMode;
  setDiaryCardMode: (v: DiaryCardMode) => void;
  nickname: string;
  setNickname: (v: string) => void;
  birthday: string; // YYYY-MM-DD
  setBirthday: (v: string) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
  handle: string;
  setHandle: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  profilePhoto: string | null;
  setProfilePhoto: (v: string | null) => void;
  handleLastChanged: number | null;
  setHandleLastChanged: (v: number | null) => void;
  signUpMethod: SignUpMethod;
  setSignUpMethod: (v: SignUpMethod) => void;
  signUpEmail: string;
  setSignUpEmail: (v: string) => void;
  arrivalDetect: boolean;
  setArrivalDetect: (v: boolean) => void;
  currentVisitedCountryCode: string;
  setCurrentVisitedCountryCode: (v: string) => void;
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
  resetSettings: () => void; // 모든 설정을 기본값으로 되돌림
}

// AsyncStorage에 저장되는 설정 스냅샷
interface SettingsPersistPayload {
  showCounts: boolean;
  homeCountryCode: string;
  snapEnabled: boolean;
  diaryCardMode: DiaryCardMode;
  nickname: string;
  birthday?: string; // 과거 저장본엔 없을 수 있어 optional
  gender?: Gender;   // 과거 저장본엔 없을 수 있어 optional
  handle: string;
  bio: string;
  profilePhoto: string | null;
  handleLastChanged: number | null;
  signUpMethod: SignUpMethod;
  signUpEmail: string;
  arrivalDetect: boolean;
  currentVisitedCountryCode: string;
  representativeBadgeIds?: number[]; // 과거 저장본엔 없을 수 있어 optional
  badgeEarnedAt?: Record<number, number>; // 과거 저장본엔 없을 수 있어 optional
  shareSentCount?: number; // 과거 저장본엔 없을 수 있어 optional
  loginStreak?: number;    // 과거 저장본엔 없을 수 있어 optional
  lastVisitDay?: number | null; // 마지막 접속일(로컬 자정 timestamp)
  installedAt?: number | null;  // 앱 첫 실행 시각
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showCounts, setShowCounts] = useState(true);
  const [homeCountryCode, setHomeCountryCode] = useState('KR'); // 기본 거주국: 한국
  const [snapEnabled, setSnapEnabled] = useState(true);          // 스냅 알림 활성화
  const [diaryCardMode, setDiaryCardMode] = useState<DiaryCardMode>('full'); // 기본 B
  const [nickname, setNickname] = useState(''); // 온보딩(BasicInfo)에서 입력
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState<Gender>('');
  // 기본 핸들은 설치마다 고유 생성(개발자 핸들 하드코딩 제거) — 사용자가 EditProfile에서 변경 가능
  const [handle, setHandle] = useState(() => `user_${Math.random().toString(36).slice(2, 8)}`);
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [handleLastChanged, setHandleLastChanged] = useState<number | null>(null);
  const [signUpMethod, setSignUpMethod] = useState<SignUpMethod>('email');
  const [signUpEmail, setSignUpEmail] = useState('user@eorth.app');
  const [arrivalDetect, setArrivalDetect] = useState(true);
  const [currentVisitedCountryCode, setCurrentVisitedCountryCode] = useState('KR'); // 여행국가: 기본값은 거주국가(KR)와 동일 → 실제 여행 감지 전엔 거주국가 표시
  const [representativeBadgeIds, setRepresentativeBadgeIds] = useState<number[]>([]);
  const [badgeEarnedAt, setBadgeEarnedAt] = useState<Record<number, number>>({});
  const [pendingBadgeToasts, setPendingBadgeToasts] = useState<number[]>([]); // 신규 획득 토스트 큐(비영속)
  const [shareSentCount, setShareSentCount] = useState(0);
  const [loginStreak, setLoginStreak] = useState(0);
  const [lastVisitDay, setLastVisitDay] = useState<number | null>(null);
  const [installedAt, setInstalledAt] = useState<number | null>(null);

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
      setNickname(p.nickname);
      setBirthday(p.birthday ?? '');
      setGender(p.gender ?? '');
      setHandle(p.handle);
      setBio(p.bio);
      setProfilePhoto(p.profilePhoto);
      setHandleLastChanged(p.handleLastChanged);
      setSignUpMethod(p.signUpMethod);
      setSignUpEmail(p.signUpEmail);
      setArrivalDetect(p.arrivalDetect);
      setCurrentVisitedCountryCode(p.currentVisitedCountryCode);
      setRepresentativeBadgeIds(p.representativeBadgeIds ?? []);
      setBadgeEarnedAt(p.badgeEarnedAt ?? {});
      setShareSentCount(p.shareSentCount ?? 0);
      setLoginStreak(p.loginStreak ?? 0);
      setLastVisitDay(p.lastVisitDay ?? null);
      setInstalledAt(p.installedAt ?? null);
    },
    () => ({
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      nickname,
      birthday,
      gender,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
      representativeBadgeIds,
      badgeEarnedAt,
      shareSentCount,
      loginStreak,
      lastVisitDay,
      installedAt,
    }),
    [
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      nickname,
      birthday,
      gender,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
      representativeBadgeIds,
      badgeEarnedAt,
      shareSentCount,
      loginStreak,
      lastVisitDay,
      installedAt,
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
    setNickname('');
    setBirthday('');
    setGender('');
    setHandle(`user_${Math.random().toString(36).slice(2, 8)}`);
    setBio('');
    setProfilePhoto(null);
    setHandleLastChanged(null);
    setSignUpMethod('email');
    setSignUpEmail('user@eorth.app');
    setArrivalDetect(true);
    setCurrentVisitedCountryCode('JP');
    setRepresentativeBadgeIds([]);
    setBadgeEarnedAt({});
    setPendingBadgeToasts([]);
    setShareSentCount(0);
    setLoginStreak(0);
    setLastVisitDay(null);
    setInstalledAt(null);
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
        nickname,
        setNickname,
        birthday,
        setBirthday,
        gender,
        setGender,
        handle,
        setHandle,
        bio,
        setBio,
        profilePhoto,
        setProfilePhoto,
        handleLastChanged,
        setHandleLastChanged,
        signUpMethod,
        setSignUpMethod,
        signUpEmail,
        setSignUpEmail,
        arrivalDetect,
        setArrivalDetect,
        currentVisitedCountryCode,
        setCurrentVisitedCountryCode,
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
