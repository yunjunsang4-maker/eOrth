// src/utils/stayMachine.ts
// 체류(Stay) 전환 판정 — 순수 로직. recordStore가 이 결과로 TripGroup/세션을 조작한다.
import { parseDotDate } from './momentMatch';

export type StayType = 'exchange' | 'language' | 'intern' | 'workingHoliday' | 'other';
export type StayStatus = 'active' | 'paused' | 'ended';

// 진행 중/일시정지 체류의 최소 상태 (판정에 필요한 것만)
export interface StaySnapshot {
  countryCode: string;   // 체류국 ISO 대문자 (예: 'JP')
  status: StayStatus;
  lastActiveAt: number;  // 마지막으로 체류국에 있던 시각(ms). paused면 일시정지 전환(떠남 감지) 시각의 근사 —
                         // recordStore가 pause 때 now로 갱신한다(QA M1)
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

// 기록 시작일(로컬 자정 ms)이 체류 기간 [startedAt, endedAt ?? 오늘] 안인가 — 양끝 포함.
// 회고 기록·다른 기기에서 받은 기록을 날짜만으로 체류 카드에 붙일 때 쓴다(recordStore.linkByDate).
// 날짜는 parseDotDate로 '로컬 자정'으로 읽는다 — 'YYYY.MM.DD'와 'YYYY-MM-DD'가 섞여도(endedAt은
// 기록 날짜에서 오므로) 문자열 사전순 비교가 깨지지 않게 하려고 숫자로 비교한다.
// 미종료면 상한은 nowMs — 오늘 날짜 기록(오늘 자정 ≤ now)은 들어가고 미래 날짜는 빠진다.
export function stayCoversDate(
  stay: { startedAt: string; endedAt?: string },
  recStartMs: number,
  nowMs: number,
): boolean {
  const start = parseDotDate(stay.startedAt);
  if (start == null) return false;
  const end = stay.endedAt ? parseDotDate(stay.endedAt) : nowMs;
  if (end == null) return false;
  return start <= recStartMs && recStartMs <= end;
}

// 일시정지 체류에 이 기록을 조용히 붙이면 안 되는가(사용자에게 물어야 하는가).
// 7월 귀국 후 종료 안 한 일본 체류가 11월에 쓴 "10월 오사카" 회고 여행을 흡수하던 문제(QA F1) —
// paused 체류는 기간 상한이 '지금'이라 stayCoversDate만으로는 체류 중 기록과 따로 다녀온 여행을 못 가른다.
// 기준: 기록 시작일이 lastActiveAt(마지막으로 체류국에 있던 시각 = 일시정지 시점 근사)의 '날짜'보다 뒤면 애매.
// 그래서 일시정지 전 체류 기간의 회고는 실시간 기록이 없었어도 애매하지 않고(QA M1), 떠난 날 당일 기록도 체류 쪽이다.
// lastActiveAt 당일·이전이거나 active 체류·기간 밖이면 애매하지 않다(호출부는 지금처럼 처리).
// 날짜는 둘 다 로컬 자정으로 내려 일 단위로 비교한다(recStartMs는 parseDotDate 값이라 이미 자정이지만
// ISO 폴백 값이 섞여도 어긋나지 않게 한 번 더 내린다). 나라 일치는 호출부가 카드 countryName으로 본다.
export function isAmbiguousForPausedStay(
  stay: { status: StayStatus; startedAt: string; endedAt?: string; lastActiveAt: number },
  recStartMs: number,
  nowMs: number,
): boolean {
  if (stay.status !== 'paused') return false;
  if (!stayCoversDate(stay, recStartMs, nowMs)) return false;
  const day = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  return day(recStartMs) > day(stay.lastActiveAt);
}
