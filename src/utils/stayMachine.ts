// src/utils/stayMachine.ts
// 체류(Stay) 전환 판정 — 순수 로직. recordStore가 이 결과로 TripGroup/세션을 조작한다.

export type StayType = 'exchange' | 'language' | 'intern' | 'workingHoliday' | 'other';
export type StayStatus = 'active' | 'paused' | 'ended';

// 진행 중/일시정지 체류의 최소 상태 (판정에 필요한 것만)
export interface StaySnapshot {
  countryCode: string;   // 체류국 ISO 대문자 (예: 'JP')
  status: StayStatus;
  lastActiveAt: number;  // 마지막으로 체류국에 있던 시각(ms)
}

// 현위치 국가 전환 시 결정
export interface VisitedDecision {
  pauseStay: boolean;        // 진행 중 체류를 일시정지
  resumeStay: boolean;       // 일시정지 체류국으로 복귀 → 재개
  isNewAbroadCountry: boolean; // 거주국도 체류국도 아닌 새 해외국 (프롬프트 후보)
}

export const STAY_NUDGE_MS = 60 * 24 * 60 * 60 * 1000; // 60일 무복귀 넛지

export function decideOnVisitedChange(p: {
  visitedCountryCode: string;
  homeCountryCode: string;
  stay: StaySnapshot | null;
}): VisitedDecision {
  const visited = (p.visitedCountryCode || '').toUpperCase();
  const home = (p.homeCountryCode || '').toUpperCase();
  const stay = p.stay;

  if (!visited || visited === home) {
    return { pauseStay: !!stay && stay.status === 'active', resumeStay: false, isNewAbroadCountry: false };
  }

  // 해외
  if (stay && stay.countryCode.toUpperCase() === visited) {
    return { pauseStay: false, resumeStay: stay.status === 'paused', isNewAbroadCountry: false };
  }

  // 체류국이 아닌 새 해외국
  return { pauseStay: !!stay && stay.status === 'active', resumeStay: false, isNewAbroadCountry: true };
}

export function shouldNudgeEnd(stay: StaySnapshot | null, now: number): boolean {
  return !!stay && stay.status === 'paused' && now - stay.lastActiveAt >= STAY_NUDGE_MS;
}
