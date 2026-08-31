/**
 * 형식별 후보 생성기 — 순수 함수 (설계 §5)
 *
 * 각 생성기는 (사진, 스팟 그룹, 컨셉 점수)를 받아 RecoCandidate를 낸다.
 * 공통 제외: isDocument(영수증/스크린샷), quality.passed === false.
 * 후보 id는 결정론적(입력이 같으면 같음) — dismissedIds가 재분석 후에도 유효하도록.
 */
import { scorePhoto } from './bestCutSelector';
import { topConcept } from './conceptClassifier';
import type { ConceptScores, RecoBlogSeed, RecoCandidate } from './recoTypes';
import { dhashHamming } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

const FEED_CONCEPT_THRESHOLD = 0.45; // 이 점수 이상 사진만 피드 후보에 포함
const FEED_MAX = 20;                 // MAX_RECORD_PHOTOS와 동일 (피드 상한)
const FEED_MIN = 3;                  // 3장 미만이면 후보로 안 만듦
const BLOG_SPOT_TOP = 3;             // 스팟당 대표 사진 수
const DHash_DUP_MAX = 6;             // 해밍 거리 이하 = 근접 중복

/** 후보에 넣을 수 있는 사진만 (문서·불량 제외) */
function usable(photos: PhotoMeta[]): PhotoMeta[] {
  return photos.filter((p) => !p.semantic?.isDocument && p.quality?.passed !== false);
}

/** dHash 근접 중복 제거 — scorePhoto 높은 쪽 유지, 순서 보존 */
export function dedupeByDhash(photos: PhotoMeta[], maxDistance: number = DHash_DUP_MAX): PhotoMeta[] {
  const kept: PhotoMeta[] = [];
  for (const p of photos) {
    const dupIdx = kept.findIndex(
      (k) => dhashHamming(k.signal?.dhash, p.signal?.dhash) <= maxDistance
    );
    if (dupIdx === -1) { kept.push(p); continue; }
    if (scorePhoto(p) > scorePhoto(kept[dupIdx])) kept[dupIdx] = p;
  }
  return kept;
}

/** 그룹의 우세 컨셉 (사진 평균) */
function groupConcept(photoIds: string[], concepts: Map<string, ConceptScores>) {
  const sum: ConceptScores = { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 };
  let n = 0;
  for (const id of photoIds) {
    const c = concepts.get(id);
    if (!c) continue;
    n++;
    for (const k of Object.keys(sum) as (keyof ConceptScores)[]) sum[k] += c[k];
  }
  if (n > 0) for (const k of Object.keys(sum) as (keyof ConceptScores)[]) sum[k] /= n;
  return topConcept(sum);
}

/**
 * 스트립 후보 — 스팟 그룹별 베스트컷을 슬롯 수(2~9)에 맞춰 조합.
 * slotCounts는 호출부가 CUT_FRAMES 기본 카테고리에서 뽑아 넘긴다(순수성 유지).
 */
export function stripCandidates(
  photos: PhotoMeta[],
  groups: SpotGroup[],
  concepts: Map<string, ConceptScores>,
  slotCounts: number[]
): RecoCandidate[] {
  const byId = new Map(usable(photos).map((p) => [p.id, p]));
  const sortedSlots = [...new Set(slotCounts)].sort((a, b) => b - a); // 큰 것부터
  const out: RecoCandidate[] = [];

  for (const g of groups) {
    const members = g.photoIds
      .map((id) => byId.get(id))
      .filter((p): p is PhotoMeta => p !== undefined);
    const deduped = dedupeByDhash(members)
      .map((p) => ({ p, score: scorePhoto(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (deduped.length < 2) continue;

    // 사진 수 이하의 최대 슬롯 수 채택
    const slot = sortedSlots.find((n) => n <= deduped.length);
    if (!slot || slot < 2) continue;

    const picked = deduped.slice(0, slot);
    // 스트립은 시간순으로 배열해야 이야기가 된다
    picked.sort((a, b) => a.p.creationTime - b.p.creationTime);
    const tc = groupConcept(g.photoIds, concepts);
    const avgScore = picked.reduce((s, x) => s + x.score, 0) / picked.length;

    out.push({
      id: `cut_${tc.concept}_${g.id}`,
      viewType: 'cut',
      concept: tc.concept,
      photoUris: picked.map((x) => x.p.uri),
      score: avgScore * 0.7 + tc.score * 0.3,
      reasonKey: `reco.reason.cut_${tc.concept}`,
      reasonParams: { n: slot },
    });
  }
  // 그룹이 여럿이면 점수 상위 2개까지만
  return out.sort((a, b) => b.score - a.score).slice(0, 2);
}

/** 피드 후보 — 컨셉별 하이라이트 ≤20장 */
export function feedCandidates(
  photos: PhotoMeta[],
  concepts: Map<string, ConceptScores>
): RecoCandidate[] {
  const pool = dedupeByDhash(usable(photos));
  const out: RecoCandidate[] = [];

  const conceptKeys = ['emotional', 'hip', 'fun', 'food', 'info'] as const;
  for (const concept of conceptKeys) {
    const scored = pool
      .map((p) => ({ p, c: concepts.get(p.id)?.[concept] ?? 0 }))
      .filter((x) => x.c >= FEED_CONCEPT_THRESHOLD)
      .sort((a, b) => b.c - a.c)
      .slice(0, FEED_MAX);
    if (scored.length < FEED_MIN) continue;

    // 표시 순서는 시간순 (여행 흐름)
    const ordered = [...scored].sort((a, b) => a.p.creationTime - b.p.creationTime);
    const avg = scored.reduce((s, x) => s + x.c, 0) / scored.length;
    out.push({
      id: `feed_${concept}`,
      viewType: 'feed',
      concept,
      photoUris: ordered.map((x) => x.p.uri),
      score: avg,
      reasonKey: `reco.reason.feed_${concept}`,
      reasonParams: { n: ordered.length },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 블로그 후보 — 날짜 헤딩 + 스팟별 이미지 블록 타임라인 (설계 §5) */
export function blogCandidates(
  photos: PhotoMeta[],
  groups: SpotGroup[],
  concepts: Map<string, ConceptScores>
): RecoCandidate[] {
  const byId = new Map(usable(photos).map((p) => [p.id, p]));
  const idByUri = new Map(usable(photos).map((p) => [p.uri, p.id])); // uri → id 역매핑 (O(1) 조회용)
  const validGroups = groups
    .map((g) => ({
      g,
      members: g.photoIds.map((id) => byId.get(id)).filter((p): p is PhotoMeta => p !== undefined),
    }))
    .filter((x) => x.members.length > 0)
    .sort((a, b) => a.g.startTime - b.g.startTime);
  if (validGroups.length < 2) return [];

  const dayMs = 24 * 3600_000;
  /** 로컬 타임존 자정 기준 일 번호 (UTC 경계로 계산하면 KST 등에서 DAY가 09:00에 바뀌는 결함이 생긴다) */
  const localDayNumber = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / dayMs);
  const firstDayNumber = localDayNumber(validGroups[0].g.startTime);
  const seeds: RecoBlogSeed[] = [];
  const allUris: string[] = [];
  let lastDayIndex = 0;

  for (const { g, members } of validGroups) {
    const dayIndex = localDayNumber(g.startTime) - firstDayNumber + 1;
    if (dayIndex !== lastDayIndex) {
      seeds.push({ kind: 'heading', dayIndex });
      lastDayIndex = dayIndex;
    }
    const top = dedupeByDhash(members)
      .map((p) => ({ p, score: scorePhoto(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, BLOG_SPOT_TOP)
      .sort((a, b) => a.p.creationTime - b.p.creationTime)
      .map((x) => x.p.uri);
    if (top.length === 0) continue;
    seeds.push({
      kind: 'images',
      uris: top,
      layout: top.length === 1 ? 'single' : top.length === 2 ? 'grid2' : 'grid3',
    });
    allUris.push(...top);
  }
  if (allUris.length === 0) return [];

  const tc = groupConcept(allUris.map((u) => idByUri.get(u) ?? u), concepts);

  return [{
    id: `blog_${tc.concept}`,
    viewType: 'blog',
    concept: tc.concept,
    photoUris: allUris,
    blogSeeds: seeds,
    score: 0.5 + tc.score * 0.3 + Math.min(0.2, validGroups.length * 0.03),
    reasonKey: `reco.reason.blog_${tc.concept}`,
    reasonParams: { spots: validGroups.length },
  }];
}
