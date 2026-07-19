// 여행 기억(순간 메모) 저장소 — 새로운 기록 형식이 아니다.
// TravelRecord·피드·통계·배지와 완전 분리된 개인 메모 레이어. 로컬 우선 저장.
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { usePersistence, STORE_KEYS } from './persist';

export interface TravelMoment {
  id: string;
  text: string;          // 한 줄 메모 (무드만 있으면 빈 문자열 허용 — 텍스트·무드 중 하나는 필수)
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
  resetMoments: () => void;
  hydrated: boolean;
  // 앱 상태 통합 백업(user_app_state) 편승 — 텍스트/메타만, photoUri 제외
  exportMomentsBackup: () => Omit<TravelMoment, 'photoUri'>[];
  applyMomentsBackup: (b: unknown) => void;
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

  const resetMoments = useCallback(() => { setMoments([]); }, []);

  const hydrated = usePersistence<{ moments: TravelMoment[] }>(
    STORE_KEYS.moments,
    (p) => setMoments(Array.isArray(p.moments) ? p.moments : []),
    () => ({ moments }),
    [moments],
  );

  // ── 앱 상태 통합 백업(user_app_state) 편승 ──
  // 직렬화: photoUri는 로컬 전용이므로 제거하고 텍스트/메타만 포함
  const exportMomentsBackup = useCallback(
    (): Omit<TravelMoment, 'photoUri'>[] =>
      moments.map(({ photoUri: _photoUri, ...rest }) => rest),
    [moments],
  );

  // 복원: 서버본에는 photoUri가 없으므로 무조건 덮어쓰면 로컬 사진 연결이 소실된다.
  // → id 기준 병합(로컬 우선) 정책: 로컬에 같은 id가 있으면 로컬값을 유지하고,
  //   서버에만 있는 항목은 추가한다. (settingsStore/recordStore는 무조건 덮어쓰기이나
  //   moments는 photoUri 보존이 필요하므로 의도적으로 다른 정책을 적용)
  const applyMomentsBackup = useCallback((b: unknown) => {
    if (!Array.isArray(b)) return;
    const remote = b as unknown[];
    setMoments((local) => {
      const localById = new Map(local.map((m) => [m.id, m]));
      // 서버에만 있는 항목을 추가, 로컬에 있는 항목은 로컬값 그대로 유지
      const merged = [...local];
      for (const r of remote) {
        // 서버 데이터 방어: id·createdAt 타입 + 내용(텍스트 또는 무드) 존재 검증 후 추가
        if (
          !r ||
          typeof r !== 'object' ||
          typeof (r as any).id !== 'string' ||
          !(r as any).id ||
          typeof (r as any).text !== 'string' ||
          typeof (r as any).createdAt !== 'number' ||
          (!(r as any).text && !(r as any).mood)
        ) continue;
        if (!localById.has((r as any).id)) {
          merged.push(r as TravelMoment); // photoUri 없는 채로 추가
        }
      }
      // 최신순 정렬 유지
      merged.sort((a, b) => b.createdAt - a.createdAt);
      return merged;
    });
  }, []);

  const value = useMemo(
    () => ({ moments, addMoment, removeMoment, resetMoments, hydrated, exportMomentsBackup, applyMomentsBackup }),
    [moments, addMoment, removeMoment, resetMoments, hydrated, exportMomentsBackup, applyMomentsBackup],
  );
  return <MomentContext.Provider value={value}>{children}</MomentContext.Provider>;
}

export function useMoments(): MomentContextValue {
  const ctx = useContext(MomentContext);
  if (!ctx) throw new Error('useMoments must be used within MomentProvider');
  return ctx;
}
