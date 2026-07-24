// 여행 기억(순간 메모) 저장소 — 새로운 기록 형식이 아니다.
// TravelRecord·피드·통계·배지와 완전 분리된 개인 메모 레이어. 로컬 우선 저장.
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { usePersistence, STORE_KEYS } from './persist';
import { remapDocUri } from '../utils/remapDocumentUris';
import { isSupabaseConfigured } from '../services/supabase';
import { uploadImage } from '../services/media';

export interface TravelMoment {
  id: string;
  text: string;          // 한 줄 메모 (무드만 있으면 빈 문자열 허용 — 텍스트·무드 중 하나는 필수)
  mood?: string;         // 이모지 1개 (선택)
  photoUri?: string;     // 로컬 사진 1장 (선택) — 백업엔 아래 photoUrl로만 실림
  photoUrl?: string;     // 사진의 서버 백업 URL(Storage) — 앱 삭제 후 재설치 복원용. 표시엔 로컬 우선
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

  // 사진 서버 백업 — 성공(원격 URL)일 때만 photoUrl 기록. 미로그인/실패면 uploadImage가
  // 로컬 URI를 그대로 돌려주므로 조용히 건너뛰고, 다음 실행의 소급 스윕에서 재시도된다.
  const backupMomentPhoto = useCallback((id: string, uri: string) => {
    if (!isSupabaseConfigured) return;
    uploadImage(uri)
      .then((url) => {
        if (!url || !/^https?:\/\//.test(url)) return;
        setMoments((prev) => prev.map((m) => (m.id === id ? { ...m, photoUrl: url } : m)));
      })
      .catch(() => {});
  }, []);

  const addMoment = useCallback((m: Omit<TravelMoment, 'id' | 'createdAt'>) => {
    const id = genMomentId();
    setMoments((prev) => [{ ...m, id, createdAt: Date.now() }, ...prev]);
    if (m.photoUri) backupMomentPhoto(id, m.photoUri); // 사진은 즉시 서버 백업 시도(비동기)
  }, [backupMomentPhoto]);

  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const resetMoments = useCallback(() => { setMoments([]); }, []);

  const hydrated = usePersistence<{ moments: TravelMoment[] }>(
    STORE_KEYS.moments,
    (p) =>
      setMoments(
        (Array.isArray(p.moments) ? p.moments : []).map((m) =>
          // iOS 재설치/재빌드로 컨테이너 경로(UUID)가 바뀐 사진 URI 복구 (recordStore와 동일)
          m.photoUri ? { ...m, photoUri: remapDocUri(m.photoUri) } : m
        )
      ),
    () => ({ moments }),
    [moments],
  );

  // 사진 백업 소급 스윕 — photoUri만 있고 photoUrl이 없는 항목(기존 데이터·업로드 실패분)을
  // 서버로 업로드. 앱 실행당 1회, 로그인 전에 돌면 전부 건너뛰고 다음 실행에서 재시도.
  const photoBackfillRanRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured || photoBackfillRanRef.current) return;
    photoBackfillRanRef.current = true;
    const targets = moments.filter((m) => m.photoUri && !m.photoUrl);
    if (targets.length === 0) return;
    (async () => {
      for (const m of targets) {
        const url = await uploadImage(m.photoUri!).catch(() => m.photoUri!);
        if (url && /^https?:\/\//.test(url)) {
          setMoments((prev) => prev.map((x) => (x.id === m.id ? { ...x, photoUrl: url } : x)));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── 앱 상태 통합 백업(user_app_state) 편승 ──
  // 직렬화: photoUri(로컬 경로)는 제거하고 텍스트/메타 + photoUrl(서버 사진 백업)을 포함
  const exportMomentsBackup = useCallback(
    (): Omit<TravelMoment, 'photoUri'>[] =>
      moments.map(({ photoUri: _photoUri, ...rest }) => rest),
    [moments],
  );

  // 복원: 서버본에는 photoUri가 없으므로 무조건 덮어쓰면 로컬 사진 연결이 소실된다.
  // → id 기준 병합(로컬 우선) 정책: 로컬에 같은 id가 있으면 로컬값을 유지하고,
  //   서버에만 있는 항목은 추가한다. (settingsStore/recordStore는 무조건 덮어쓰기이나
  //   moments는 photoUri 보존이 필요하므로 의도적으로 다른 정책을 적용)
  //   단 photoUrl(사진 서버 백업)은 로컬에 비어 있으면 서버값을 채운다(다른 기기 업로드분 수용).
  const applyMomentsBackup = useCallback((b: unknown) => {
    if (!Array.isArray(b)) return;
    const remote = b as unknown[];
    const validUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u);
    setMoments((local) => {
      const localById = new Map(local.map((m) => [m.id, m]));
      const remoteById = new Map<string, any>();
      for (const r of remote) {
        if (r && typeof r === 'object' && typeof (r as any).id === 'string') remoteById.set((r as any).id, r);
      }
      // 로컬 항목: photoUrl이 비어 있으면 서버 백업값으로 채움 (그 외 필드는 로컬 유지)
      const merged: TravelMoment[] = local.map((m) => {
        if (m.photoUrl) return m;
        const ru = remoteById.get(m.id)?.photoUrl;
        return validUrl(ru) ? { ...m, photoUrl: ru } : m;
      });
      const addedIds = new Set<string>(); // 서버본 자체에 중복 id가 있어도 1회만 추가
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
        if (!localById.has((r as any).id) && !addedIds.has((r as any).id)) {
          addedIds.add((r as any).id);
          // photoUri 없는 채로 추가 — photoUrl은 유효한 원격 URL일 때만 유지
          const item = r as TravelMoment;
          merged.push(validUrl(item.photoUrl) ? item : { ...item, photoUrl: undefined });
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
