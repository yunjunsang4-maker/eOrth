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

/**
 * 지문이 같은 채로 'unavailable'이 된 여행을 재시도하지 않는 최소 간격.
 *
 * unavailable(권한 철회·전량 iCloud 오프로드)은 이 쿨다운이 없으면 TripDetail을
 * 여닫을 때마다 GPS 250회 + 자산 재조회 250회를 처음부터 다시 돈다 — 해외 로밍 중
 * 오프로드 사용자가 카드를 열 때마다 그 비용을 낸다(실제 리뷰 지적 사항).
 *
 * 30분으로 잡은 이유: "권한을 다시 허용한 사용자가 너무 오래 기다리지 않을 것"과
 * "여닫을 때마다 수백 회 네이티브 호출을 하지 않을 것" 사이의 절충이다. 사진을
 * 추가/삭제해 지문이 바뀌면 이 쿨다운과 무관하게 즉시 재분석된다.
 *
 * 원래 recoEngine에만 있었는데 여기로 옮겼다 — RecoSection(호출할지 결정)과
 * recoEngine(호출돼도 돌지 결정)이 같은 값을 봐야 하기 때문이다. 이 파일은 순수
 * 구역이라 verify로도 덮을 수 있다.
 */
export const UNAVAILABLE_RETRY_MS = 30 * 60_000;

/**
 * 지문이 같은 unavailable 상태를 지금 재시도해도 되는지 판정한다.
 *
 * ⚠️ RecoSection(재분석 트리거)과 recoEngine(조기 반환)이 **반드시 이 한 함수를 함께**
 *    써야 한다. 판정이 두 벌로 갈라지면 "섹션은 엔진을 부르는데 엔진이 막아 아무 일도
 *    안 일어나는" 조합이 생긴다 — 실제로 엔진에만 쿨다운이 있고 섹션이 unavailable에서
 *    엔진을 아예 안 불러, 권한을 다시 허용해도 추천이 영영 안 뜨던 결함이 있었다(2026-09).
 *
 * isPendingStale과 같은 이유로 음수 경과(now < updatedAt, 시계 변경)는 "아직 아님"으로
 * 본다 — 시계가 뒤로 갔다고 수백 회 네이티브 호출을 다시 돌 이유가 없다.
 */
export function isUnavailableRetryDue(state: RecoState, now: number): boolean {
  if (state.status !== 'unavailable') return false;
  return now - state.updatedAt >= UNAVAILABLE_RETRY_MS;
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
