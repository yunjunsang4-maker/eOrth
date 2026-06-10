import React, { createContext, useContext, useState } from 'react';
import { View } from 'react-native';
import { usePersistence, STORE_KEYS } from './persist';

// 소셜 다이어리 카드 모드: full = 상호작용 표시(B, 기본), minimal = 미니멀(A)
export type DiaryCardMode = 'full' | 'minimal';
export type SignUpMethod = 'email' | 'google' | 'apple';

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
  resetSettings: () => void; // 모든 설정을 기본값으로 되돌림
}

// AsyncStorage에 저장되는 설정 스냅샷
interface SettingsPersistPayload {
  showCounts: boolean;
  homeCountryCode: string;
  snapEnabled: boolean;
  diaryCardMode: DiaryCardMode;
  nickname: string;
  handle: string;
  bio: string;
  profilePhoto: string | null;
  handleLastChanged: number | null;
  signUpMethod: SignUpMethod;
  signUpEmail: string;
  arrivalDetect: boolean;
  currentVisitedCountryCode: string;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showCounts, setShowCounts] = useState(true);
  const [homeCountryCode, setHomeCountryCode] = useState('KR'); // 기본 거주국: 한국
  const [snapEnabled, setSnapEnabled] = useState(true);          // 스냅 알림 활성화
  const [diaryCardMode, setDiaryCardMode] = useState<DiaryCardMode>('full'); // 기본 B
  const [nickname, setNickname] = useState('윤준상');
  const [handle, setHandle] = useState('yunjunsung');
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [handleLastChanged, setHandleLastChanged] = useState<number | null>(null);
  const [signUpMethod, setSignUpMethod] = useState<SignUpMethod>('email');
  const [signUpEmail, setSignUpEmail] = useState('user@eorth.app');
  const [arrivalDetect, setArrivalDetect] = useState(true);
  const [currentVisitedCountryCode, setCurrentVisitedCountryCode] = useState('JP'); // 여행국가: 기본값 일본(JP)

  const hydrated = usePersistence<SettingsPersistPayload>(
    STORE_KEYS.settings,
    (p) => {
      setShowCounts(p.showCounts);
      setHomeCountryCode(p.homeCountryCode);
      setSnapEnabled(p.snapEnabled);
      setDiaryCardMode(p.diaryCardMode);
      setNickname(p.nickname);
      setHandle(p.handle);
      setBio(p.bio);
      setProfilePhoto(p.profilePhoto);
      setHandleLastChanged(p.handleLastChanged);
      setSignUpMethod(p.signUpMethod);
      setSignUpEmail(p.signUpEmail);
      setArrivalDetect(p.arrivalDetect);
      setCurrentVisitedCountryCode(p.currentVisitedCountryCode);
    },
    () => ({
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      nickname,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
    }),
    [
      showCounts,
      homeCountryCode,
      snapEnabled,
      diaryCardMode,
      nickname,
      handle,
      bio,
      profilePhoto,
      handleLastChanged,
      signUpMethod,
      signUpEmail,
      arrivalDetect,
      currentVisitedCountryCode,
    ],
  );

  const resetSettings = () => {
    setShowCounts(true);
    setHomeCountryCode('KR');
    setSnapEnabled(true);
    setDiaryCardMode('full');
    setNickname('윤준상');
    setHandle('yunjunsung');
    setBio('');
    setProfilePhoto(null);
    setHandleLastChanged(null);
    setSignUpMethod('email');
    setSignUpEmail('user@eorth.app');
    setArrivalDetect(true);
    setCurrentVisitedCountryCode('JP');
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
