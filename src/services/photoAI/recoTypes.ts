/**
 * 기록 형식 추천 — 공용 타입 + 순수 유틸
 *
 * 추천 카드의 생명주기:
 *  앨범 저장 → recoEngine이 RecoState(status:'pending') 저장 → 분석 완료 시 'ready'+cards
 *  → TripDetail 렌더 시 mediasFingerprint로 앨범 변경 감지(불일치 = 재분석)
 */

export type RecoViewType = 'feed' | 'blog' | 'cut';

/** 컨셉(무드) 5종 — 설계 문서 §4 */
export type RecoConcept = 'emotional' | 'hip' | 'fun' | 'food' | 'info';

export type ConceptScores = Record<RecoConcept, number>;

export const RECO_CONCEPTS: RecoConcept[] = ['emotional', 'hip', 'fun', 'food', 'info'];

/** 블로그 프리필 씨앗 — 화면에서 createHeadingBlock/createImagesBlock으로 변환 */
export type RecoBlogSeed =
  | { kind: 'heading'; dayIndex: number }
  | { kind: 'images'; uris: string[]; layout: 'single' | 'grid2' | 'grid3' };

export interface RecoCandidate {
  id: string;                 // `${viewType}_${concept}_${순번}` — 결정론적
  viewType: RecoViewType;
  concept: RecoConcept;
  photoUris: string[];        // 앨범 medias 부분집합, 프리필 순서
  blogSeeds?: RecoBlogSeed[]; // viewType==='blog' 전용
  score: number;              // 0~1+, 재순위 입력
  reasonKey: string;          // i18n 키: `reco.reason.${viewType}_${concept}`
  reasonParams?: Record<string, string | number>;
}

export interface RecoCard extends RecoCandidate {
  createdAt: number;
}

export interface RecoState {
  albumRecordId: string;
  mediasFingerprint: string;
  status: 'pending' | 'ready' | 'unavailable';
  cards: RecoCard[];
  dismissedIds: string[];
  updatedAt: number;
}

export interface RecoLogEvent {
  event: 'impression' | 'accept' | 'dismiss' | 'edit_after_accept';
  cardId: string;
  viewType: RecoViewType;
  concept: RecoConcept;
  photoCountSuggested: number;
  photoCountUsed?: number;
  ts: number;
}

/**
 * medias 배열의 지문 (djb2). 앨범 사진 추가/삭제/순서변경 감지용.
 * 순서까지 포함해야 "이어 담기"도 무효화된다.
 */
export function mediasFingerprint(medias: string[]): string {
  let h = 5381;
  const joined = medias.join('|');
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return `${medias.length}:${(h >>> 0).toString(36)}`;
}

/** dHash 16진수 문자열 두 개의 해밍 거리. 파싱 불가 시 최대값 64 */
export function dhashHamming(a?: string, b?: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const xa = parseInt(a[i], 16);
    const xb = parseInt(b[i], 16);
    if (Number.isNaN(xa) || Number.isNaN(xb)) return 64;
    let x = xa ^ xb;
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}
