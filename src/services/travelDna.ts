/**
 * 여행 DNA 서비스 — 서버가 진실이다.
 *
 * 점수·라벨은 클라이언트가 계산해 함께 올린다. 서버가 응답 원본(answers)도 보관하므로
 * 문항이나 가중치가 바뀌면 재검사 없이 재계산해 덮어쓸 수 있다.
 */
import { supabase } from './supabase';
import { scoreAxes, makeTypeLabel, answeredCount, type DnaAnswers, type DnaScores } from '../utils/travelDnaScore';
import { DNA_AXES } from '../constants/travelDna';

export interface MyDna {
  answers: DnaAnswers;
  scores: DnaScores;
  typeKey: string | null;
  answered: number;
}

/** 실패·미설정·미응답은 전부 null (호출부가 '아직 안 함'으로 처리) */
export async function fetchMyDna(): Promise<MyDna | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('travel_dna')
      .select('answers, scores, type_key, answered')
      .maybeSingle();
    if (error || !data) return null;
    const answers = (data.answers ?? {}) as DnaAnswers;
    return {
      answers,
      // 서버 배열을 그대로 믿지 않고 로컬에서 다시 계산한다 — 문항이 바뀌었을 수 있다
      scores: scoreAxes(answers),
      typeKey: (data.type_key as string) ?? null,
      answered: (data.answered as number) ?? answeredCount(answers),
    };
  } catch {
    return null;
  }
}

export async function saveMyDna(answers: DnaAnswers): Promise<boolean> {
  if (!supabase) return false;
  try {
    const scores = scoreAxes(answers);
    const { error } = await supabase.rpc('save_travel_dna', {
      p_answers: answers,
      // ⚠️ 순서는 DNA_AXES 기준 — 서버 scores 배열과 1:1이어야 한다
      p_scores: DNA_AXES.map((a) => scores[a]),
      p_type_key: makeTypeLabel(scores).key,
      p_answered: answeredCount(answers),
    });
    return !error;
  } catch {
    return false;
  }
}
