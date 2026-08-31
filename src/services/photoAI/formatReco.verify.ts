// src/services/photoAI/formatReco.verify.ts
// 골든셋 엔드투엔드: 판정기 → 생성기 → 재순위가 기대 최상위 카드를 내는지.
// 규칙 가중치를 바꿀 땐 이 파일이 회귀 기준이다 — 임계를 낮춰서 통과시키지 말 것.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleConceptClassifier } from './conceptClassifier';
import { stripCandidates, feedCandidates, blogCandidates } from './formatCandidates';
import { rankCandidates } from './personalRanker';
import type { ConceptScores } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'goldens');
const SLOT_COUNTS = [2, 3, 4, 6, 9]; // CUT_FRAMES 기본 카테고리 슬롯 수 스냅샷

interface Golden {
  name: string;
  expected: { topViewType: string; topConcept: string };
  photos: PhotoMeta[];
  groupsHint: SpotGroup[];
}

let failed = 0;
function check(cond: boolean, msg: string, detail?: string) {
  if (cond) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}${detail ? `\n   ${detail}` : ''}`); }
}

for (const file of ['golden-night-city.json', 'golden-food-landmark.json']) {
  const g = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Golden;
  const concepts = new Map<string, ConceptScores>(
    g.photos.map((p) => [p.id, ruleConceptClassifier(p)])
  );
  const cands = [
    ...stripCandidates(g.photos, g.groupsHint, concepts, SLOT_COUNTS),
    ...feedCandidates(g.photos, concepts),
    ...blogCandidates(g.photos, g.groupsHint, concepts),
  ];
  const ranked = rankCandidates(cands, { viewTypeCounts: {} });

  check(ranked.length >= 2, `[${g.name}] 카드 2개 이상 생성 (다양한 버전)`, `got ${ranked.length}`);
  check(
    ranked[0]?.viewType === g.expected.topViewType,
    `[${g.name}] 최상위 형식 = ${g.expected.topViewType}`,
    `got ${ranked[0]?.viewType} (${ranked[0]?.id})`
  );
  check(
    ranked[0]?.concept === g.expected.topConcept,
    `[${g.name}] 최상위 컨셉 = ${g.expected.topConcept}`,
    `got ${ranked[0]?.concept}`
  );
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
