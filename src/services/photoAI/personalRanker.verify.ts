// src/services/photoAI/personalRanker.verify.ts
import { buildStylePrior, rankCandidates } from './personalRanker';
import type { RecoCandidate } from './recoTypes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const cand = (id: string, viewType: RecoCandidate['viewType'], score: number): RecoCandidate => ({
  id, viewType, concept: 'emotional', photoUris: ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg'],
  score, reasonKey: `reco.reason.${viewType}_emotional`,
});

// ── buildStylePrior ──
eq(buildStylePrior([]), { viewTypeCounts: {} }, '기록 없음 = 빈 prior');
eq(
  buildStylePrior([{ viewType: 'blog' }, { viewType: 'blog' }, { viewType: 'feed' }, { viewType: undefined }]),
  { viewTypeCounts: { blog: 2, feed: 1 } },
  '형식 빈도 집계 (undefined 무시)'
);

// ── 다양성 보장: 상위 3개는 서로 다른 형식 ──
const cands = [
  cand('c1', 'cut', 0.9), cand('c2', 'cut', 0.85), cand('c3', 'cut', 0.8),
  cand('f1', 'feed', 0.6), cand('b1', 'blog', 0.5),
];
const ranked = rankCandidates(cands, { viewTypeCounts: {} });
eq(ranked.map((c) => c.viewType), ['cut', 'feed', 'blog'], '형식 다양성: cut 3개여도 3형식 노출');
eq(ranked[0].id, 'c1', '같은 형식 안에선 점수 최고 채택');

// ── 개인화: 블로그 애용자는 블로그가 앞으로 ──
const close = [cand('f1', 'feed', 0.55), cand('b1', 'blog', 0.5), cand('c1', 'cut', 0.45)];
const blogLover = buildStylePrior(Array.from({ length: 10 }, () => ({ viewType: 'blog' })));
const rankedPersonal = rankCandidates(close, blogLover);
eq(rankedPersonal[0].viewType, 'blog', '블로그 애용자는 블로그 우선');

// ── 기록 없으면 원점수 순서 ──
const rankedNeutral = rankCandidates(close, { viewTypeCounts: {} });
eq(rankedNeutral[0].viewType, 'feed', '무기록 = 원점수 순');

// ── maxCards 상한 ──
eq(rankCandidates(cands, { viewTypeCounts: {} }, 2).length, 2, 'maxCards=2');
eq(rankCandidates([], { viewTypeCounts: {} }), [], '빈 후보 안전');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
