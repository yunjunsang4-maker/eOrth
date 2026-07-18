// 여행 기억(순간 메모) 저장소 — 새로운 기록 형식이 아니다.
// TravelRecord·피드·통계·배지와 완전 분리된 개인 메모 레이어. 로컬 우선 저장.
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { usePersistence, STORE_KEYS } from './persist';

export interface TravelMoment {
  id: string;
  text: string;          // 한 줄 메모 (필수)
  mood?: string;         // 이모지 1개 (선택)
  photoUri?: string;     // 로컬 사진 1장 (선택) — 서버 백업 제외
  countryCode?: string;  // ISO2 대문자 (매칭용, 역지오코딩 실패 시 없음)
  countryName?: string;  // 표시용 국가명 (기기 언어 기준)
  regionName?: string;   // 도시/지역 (가능할 때만)
  createdAt: number;     // epoch ms
}

interface MomentContextValue {
  moments: TravelMoment[]; // 최신순
  addMoment: (m: Omit<TravelMoment, 'id' | 'createdAt'>) => void;
  removeMoment: (id: string) => void;
  hydrated: boolean;
}

const MomentContext = createContext<MomentContextValue | null>(null);

// recordStore와 같은 난수 기반 id (uuid 미설치 레포 컨벤션)
const genMomentId = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function MomentProvider({ children }: { children: React.ReactNode }) {
  const [moments, setMoments] = useState<TravelMoment[]>([]);

  const addMoment = useCallback((m: Omit<TravelMoment, 'id' | 'createdAt'>) => {
    setMoments((prev) => [{ ...m, id: genMomentId(), createdAt: Date.now() }, ...prev]);
  }, []);

  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const hydrated = usePersistence<{ moments: TravelMoment[] }>(
    STORE_KEYS.moments,
    (p) => setMoments(Array.isArray(p.moments) ? p.moments : []),
    () => ({ moments }),
    [moments],
  );

  const value = useMemo(
    () => ({ moments, addMoment, removeMoment, hydrated }),
    [moments, addMoment, removeMoment, hydrated],
  );
  return <MomentContext.Provider value={value}>{children}</MomentContext.Provider>;
}

export function useMoments(): MomentContextValue {
  const ctx = useContext(MomentContext);
  if (!ctx) throw new Error('useMoments must be used within MomentProvider');
  return ctx;
}
