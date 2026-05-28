import React, { createContext, useContext, useState } from 'react';

interface SettingsContextType {
  showCounts: boolean;
  setShowCounts: (v: boolean) => void;
  homeCountryCode: string;
  setHomeCountryCode: (v: string) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showCounts, setShowCounts] = useState(true);
  const [homeCountryCode, setHomeCountryCode] = useState('KR'); // 기본 거주국: 한국
  const [snapEnabled, setSnapEnabled] = useState(true);          // 스냅 알림 활성화

  return (
    <SettingsContext.Provider value={{ showCounts, setShowCounts, homeCountryCode, setHomeCountryCode, snapEnabled, setSnapEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
