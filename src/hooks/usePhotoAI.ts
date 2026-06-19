/**
 * usePhotoAI — 온디바이스 베스트컷 추천 상태 훅
 *
 * 화면에서 쓰기 쉬운 형태로 파이프라인/스케줄러를 감싼다.
 *  - 최초 마운트 시 저장된(캐시) 그룹을 즉시 로드 (분석 대기 없이 표시)
 *  - runNow(): 사용자가 직접 '지금 분석' 트리거
 *  - enableBackground()/disableBackground(): 백그라운드 배치 on/off
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getPhotoMetaCache,
  getSpotGroups,
} from '../services/photoAI/photoAIStorage';
import {
  registerPhotoAITask,
  runNow,
  unregisterPhotoAITask,
} from '../services/photoAI/backgroundScheduler';
import type { PhotoMeta, SpotGroup } from '../services/photoAI/types';

export interface UsePhotoAIState {
  loading: boolean;
  analyzing: boolean;
  groups: SpotGroup[];
  photosById: Record<string, PhotoMeta>;
  error: string | null;
  lastMessage: string | null;
}

export function usePhotoAI() {
  const [state, setState] = useState<UsePhotoAIState>({
    loading: true,
    analyzing: false,
    groups: [],
    photosById: {},
    error: null,
    lastMessage: null,
  });

  // ─── 캐시 로드 ───
  const loadFromCache = useCallback(async () => {
    const [groups, cache] = await Promise.all([
      getSpotGroups(),
      getPhotoMetaCache(),
    ]);
    setState((s) => ({
      ...s,
      loading: false,
      groups: groups ?? [],
      photosById: cache ?? {},
    }));
  }, []);

  useEffect(() => {
    loadFromCache();
  }, [loadFromCache]);

  // ─── 지금 분석 ───
  const analyzeNow = useCallback(async () => {
    setState((s) => ({ ...s, analyzing: true, error: null }));
    const result = await runNow();
    if (!result.ok) {
      setState((s) => ({
        ...s,
        analyzing: false,
        error: result.errorMessage ?? '분석을 시작할 수 없습니다.',
      }));
      return;
    }
    const cache = (await getPhotoMetaCache()) ?? {};
    setState((s) => ({
      ...s,
      analyzing: false,
      groups: result.data?.groups ?? [],
      photosById: cache,
      lastMessage: `신규 ${result.data?.newPhotos ?? 0}장 분석 · 그룹 ${
        result.data?.groups.length ?? 0
      }개`,
    }));
  }, []);

  // ─── 백그라운드 스케줄러 ───
  const enableBackground = useCallback(() => registerPhotoAITask(), []);
  const disableBackground = useCallback(() => unregisterPhotoAITask(), []);

  return {
    ...state,
    refresh: loadFromCache,
    analyzeNow,
    enableBackground,
    disableBackground,
  };
}
