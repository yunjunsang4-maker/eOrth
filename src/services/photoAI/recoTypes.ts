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
  /**
   * photoUris와 같은 순서·같은 길이의 자산 id. 없는 장은 빈 문자열.
   *
   * 왜 필요한가: pool 사진은 갤러리 참조라 iOS ph:// uri가 세션이 지나면 만료된다.
   * 카드가 저장된 뒤 앱을 다시 켜고 수락하면 uri만으로는 복사가 전부 실패한다.
   */
  photoAssetIds?: string[];
  blogSeeds?: RecoBlogSeed[]; // viewType==='blog' 전용
  score: number;              // 0~1+, 재순위 입력
  reasonKey: string;          // i18n 키: `reco.reason.${viewType}_${concept}`
  reasonParams?: Record<string, string | number>;
}

export interface RecoCard extends RecoCandidate {
  createdAt: number;
}

export interface RecoState {
  tripGroupId: string;
  /** recoSource.sourceFingerprint의 결과. 이 값이 그대로면 재분석하지 않는다 */
  sourceFingerprint: string;
  status: 'pending' | 'ready' | 'unavailable';
  cards: RecoCard[];
  dismissedIds: string[];
  /** 분석 진행 하트비트. 엔진이 배치마다 갱신한다(설계 §6) */
  progress?: { done: number; total: number };
  updatedAt: number;
}

/**
 * 마지막 진행 이후 이만큼 지나면 죽은 분석으로 본다.
 *
 * 예전에는 "분석 시작 후 3분"이었다. 분석 상한이 250장이 되면서 정상 분석이 3분을
 * 넘길 수 있게 됐고, 그러면 살아 있는 분석을 죽이고 재시작 → 다시 초과 →
 * 무한 재분석 루프가 된다. 엔진이 배치마다 updatedAt을 갱신하므로 판정 기준을
 * "마지막 진행 이후 무변화 시간"으로 바꿨다.
 */
export const STALE_PENDING_MS = 3 * 60_000;

/**
 * pending이 죽었는지 판정한다.
 * now < updatedAt(기기 시계가 뒤로 갔거나 저장 직후)은 고착이 아니다 — 음수 경과를
 * 고착으로 보면 시계 변경만으로 재분석이 돈다.
 */
export function isPendingStale(state: RecoState, now: number): boolean {
  if (state.status !== 'pending') return false;
  return now - state.updatedAt > STALE_PENDING_MS;
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
