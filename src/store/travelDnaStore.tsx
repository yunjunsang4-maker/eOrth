/**
 * 여행 DNA 상태 — 서버 우선. 로컬은 읽기 캐시일 뿐이다.
 *
 * settingsStore에 얹지 않는다: settingsStore는 로컬 우선(local-first) 전제인데
 * 여행 DNA는 정반대로 서버가 진실이다. 한 파일에 두면 두 원칙이 뒤엉킨다.
 *
 * 계정 전환·데이터 초기화 시 캐시를 지운다(일반 로그아웃은 로컬을 지우지 않는 게 이 저장소
 * 원칙이라 여기 해당 없음) — 계정 귀속 데이터라 남기면 다음 계정에 남의 유형이 보인다.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadEnvelope, saveEnvelope, STORE_KEYS } from './persist';
import { fetchMyDna, saveMyDna } from '../services/travelDna';
import { scoreAxes, makeTypeLabel, isValidDna, answeredCount, type DnaAnswers, type DnaScores, type DnaTypeLabel } from '../utils/travelDnaScore';
import { DNA_QUESTIONS } from '../constants/travelDna';

interface TravelDnaValue {
  answers: DnaAnswers;
  scores: DnaScores;
  label: DnaTypeLabel;
  answered: number;
  /** 모든 축에 답이 1개 이상 — 매칭에 반영되는 기준 */
  isComplete: boolean;
  /** 36문항 전부 답함 */
  isFull: boolean;
  submit: (answers: DnaAnswers) => Promise<boolean>;
  refresh: () => Promise<void>;
  clear: () => void;
}

const Ctx = createContext<TravelDnaValue | null>(null);

export function TravelDnaProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<DnaAnswers>({});

  // 마운트 시 로컬 캐시 → 서버 순으로 채운다(오프라인에서도 내 유형은 보여야 한다)
  useEffect(() => {
    (async () => {
      const cached = await loadEnvelope<DnaAnswers>(STORE_KEYS.travelDna);
      if (cached && typeof cached === 'object') setAnswers(cached);
      const remote = await fetchMyDna();
      if (remote) {
        setAnswers(remote.answers);
        saveEnvelope(STORE_KEYS.travelDna, remote.answers);
      }
    })();
  }, []);

  const submit = useCallback(async (next: DnaAnswers) => {
    setAnswers(next);                              // 낙관 반영 — 결과 화면이 바로 그려진다
    saveEnvelope(STORE_KEYS.travelDna, next);
    return saveMyDna(next);                        // 실패해도 낙관 반영은 남는다 — 자동 재시도는 없고, 서버와 어긋난 채 있다가 다음 제출 때 덮인다
  }, []);

  const refresh = useCallback(async () => {
    const remote = await fetchMyDna();
    if (remote) { setAnswers(remote.answers); saveEnvelope(STORE_KEYS.travelDna, remote.answers); }
  }, []);

  const clear = useCallback(() => { setAnswers({}); saveEnvelope(STORE_KEYS.travelDna, {}); }, []);

  const value = useMemo<TravelDnaValue>(() => {
    const scores = scoreAxes(answers);
    return {
      answers, scores,
      label: makeTypeLabel(scores),
      answered: answeredCount(answers),
      isComplete: isValidDna(answers),
      isFull: answeredCount(answers) >= DNA_QUESTIONS.length,
      submit, refresh, clear,
    };
  }, [answers, submit, refresh, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTravelDna(): TravelDnaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTravelDna must be used within TravelDnaProvider');
  return v;
}
