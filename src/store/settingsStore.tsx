import React, { createContext, useContext, useState } from 'react';

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
