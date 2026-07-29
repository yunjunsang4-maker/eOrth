/**
 * 날씨 표기 정규화 — 렌더와 분리한 순수 로직(RN 의존 없음, weatherKey.verify.ts로 검증).
 *
 * 저장값은 한글 canonical 6종이지만, 과거 기록·가져오기 데이터에는 별칭이 남아 있다.
 * 이 표가 별칭을 canonical로 접어, 기록 화면과 게시물 상세가 같은 아이콘을 그리게 한다.
 */
export type WeatherKey = '맑음' | '부분흐림' | '흐림' | '비' | '눈' | '바람';

const ALIAS: Record<string, WeatherKey> = {
  맑음: '맑음', 화창: '맑음', 더움: '맑음',
  부분흐림: '부분흐림', 구름조금: '부분흐림', 소나기: '부분흐림',
  흐림: '흐림', 구름많음: '흐림', 안개: '흐림',
  비: '비', 천둥: '비', 번개: '비', 뇌우: '비',
  눈: '눈', 폭설: '눈', 추움: '눈',
  바람: '바람',
};

/** 별칭·구버전 표기를 canonical 6종으로. 모르는 값은 null (호출부는 자리를 감춘다) */
export function normalizeWeather(raw?: string | null): WeatherKey | null {
  if (!raw) return null;
  return ALIAS[String(raw).replace(/\s+/g, '')] ?? null;
}
