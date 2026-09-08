/**
 * 사진 AI 추천 워크벤치 — 골든셋을 돌려 "왜 그 카드가 1등인지"를 숫자로 보여준다.
 *
 * 실행: node node_modules/tsx/dist/cli.mjs scripts/reco-lab.ts
 *      node node_modules/tsx/dist/cli.mjs scripts/reco-lab.ts --labels   (라벨 해석 상세)
 *
 * ⚠️ 이 파일은 `*.verify.ts`가 아니다 — 일부러 그렇게 지었다.
 *    npm test(run-verify)는 src의 *.verify.ts와 scripts의 *.verify.mjs만 모으므로
 *    이 도구는 자동 실행되지 않는다. 통과/실패를 판정하는 게이트가 아니라,
 *    가중치를 만질 때 "얼마나 가까워졌는지"를 보는 눈금이기 때문이다.
 *    회귀 게이트는 formatReco.verify.ts가 계속 맡는다.
 *
 * ⚠️ 골든셋이 2건이고 둘 다 손으로 지어낸 합성 신호인 동안에는 **이 숫자로 튜닝하지 말 것.**
 *    도구가 생겼다고 근거가 생기는 게 아니다. 실사진에서 뽑은 골든셋이 10~15건 쌓인 뒤에
 *    비로소 이 표가 의미를 갖는다(메모리 eorth-photo-ai-upgrade-roadmap).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleConceptClassifier } from '../src/services/photoAI/conceptClassifier';
import { conceptAffinityFromLabels } from '../src/services/photoAI/labelTaxonomy';
import {
  stripCandidates,
  feedCandidates,
  blogCandidates,
} from '../src/services/photoAI/formatCandidates';
import { rankCandidates } from '../src/services/photoAI/personalRanker';
import { RECO_CONCEPTS } from '../src/services/photoAI/recoTypes';
import type { ConceptScores, RecoCandidate } from '../src/services/photoAI/recoTypes';
import type { PhotoMeta, SpotGroup } from '../src/services/photoAI/types';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'photoAI', 'goldens');
/** CUT_FRAMES 기본 카테고리 슬롯 수 스냅샷 — formatReco.verify.ts와 같은 값을 쓴다 */
const SLOT_COUNTS = [2, 3, 4, 6, 9];

const SHOW_LABELS = process.argv.includes('--labels');

interface Golden {
  name: string;
  expected: { topViewType: string; topConcept: string };
  photos: PhotoMeta[];
  groupsHint: SpotGroup[];
}

const f3 = (n: number) => n.toFixed(3);
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

/**
 * 라벨 하나가 해석되는지 판정한다.
 * KEYWORD_AFFINITY 테이블은 labelTaxonomy 내부에만 있어 밖에서 못 읽는다. 대신
 * 그 라벨 하나만 신뢰도 1로 넣어 보고 점수가 하나라도 붙는지로 역판정한다.
 */
function isLabelInterpreted(label: string): boolean {
  const s = conceptAffinityFromLabels([{ label, confidence: 1 }]);
  return RECO_CONCEPTS.some((c) => s[c] > 0);
}

// ─────────────────────────────────────────────
// 골든 1건 리포트
// ─────────────────────────────────────────────

function report(file: string): { name: string; ok: boolean; margin: number | null } {
  const g = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Golden;

  console.log('');
  console.log('═'.repeat(78));
  console.log(`골든: ${g.name}   (사진 ${g.photos.length}장, 스팟 그룹 ${g.groupsHint.length}개)`);
  console.log(`기대: 최상위 = ${g.expected.topViewType} × ${g.expected.topConcept}`);
  console.log('═'.repeat(78));

  // ── 1) 사진별 컨셉 점수 ──
  const concepts = new Map<string, ConceptScores>(
    g.photos.map((p) => [p.id, ruleConceptClassifier(p)])
  );

  console.log('\n[사진별 컨셉 점수]  판정기가 각 사진을 어떻게 봤는가');
  console.log(pad('id', 6) + RECO_CONCEPTS.map((c) => padL(c, 10)).join('') + '   최고');
  for (const p of g.photos) {
    const s = concepts.get(p.id)!;
    let best = RECO_CONCEPTS[0];
    for (const c of RECO_CONCEPTS) if (s[c] > s[best]) best = c;
    const allZero = RECO_CONCEPTS.every((c) => s[c] === 0);
    console.log(
      pad(p.id, 6) +
        RECO_CONCEPTS.map((c) => padL(f3(s[c]), 10)).join('') +
        `   ${allZero ? '— (신호 없음)' : best}`
    );
  }

  // ── 2) 라벨 해석률 — 로드맵이 지목한 병목의 계기판 ──
  const allLabels: string[] = [];
  for (const p of g.photos) for (const l of p.signal?.sceneLabels ?? []) allLabels.push(l.label);
  const uniq = [...new Set(allLabels)];
  const interpreted = uniq.filter(isLabelInterpreted);
  const ignored = uniq.filter((l) => !isLabelInterpreted(l));
  const pct = uniq.length ? Math.round((interpreted.length / uniq.length) * 100) : 0;
  console.log(
    `\n[라벨 해석률] 고유 라벨 ${uniq.length}개 중 ${interpreted.length}개 해석 (${pct}%)` +
      (ignored.length ? `  ← 버려진 라벨이 ${ignored.length}개` : '')
  );
  if (ignored.length) console.log(`  버려짐: ${ignored.join(', ')}`);
  if (SHOW_LABELS && interpreted.length) console.log(`  해석됨: ${interpreted.join(', ')}`);

  // ── 3) 후보 전체 점수 ──
  const cands: RecoCandidate[] = [
    ...stripCandidates(g.photos, g.groupsHint, concepts, SLOT_COUNTS),
    ...feedCandidates(g.photos, concepts),
    ...blogCandidates(g.photos, g.groupsHint, concepts),
  ];
  const sorted = [...cands].sort((a, b) => b.score - a.score);

  console.log(`\n[후보 전체]  생성기 3종이 만든 ${cands.length}개, 원점수 순`);
  console.log(pad('#', 4) + pad('형식×컨셉', 20) + padL('점수', 8) + padL('사진', 6) + '  id');
  sorted.forEach((c, i) => {
    console.log(
      pad(String(i + 1), 4) +
        pad(`${c.viewType} × ${c.concept}`, 20) +
        padL(f3(c.score), 8) +
        padL(String(c.photoUris.length), 6) +
        `  ${c.id}`
    );
  });

  // ── 4) 1·2등 마진 — 가중치를 만질 때 가장 먼저 깨지는 지점 ──
  const margin = sorted.length >= 2 ? sorted[0].score - sorted[1].score : null;
  if (margin !== null) {
    const warn = margin < 0.05 ? '  ⚠️ 얇다 — 가중치를 조금만 만져도 순위가 뒤집힌다' : '';
    console.log(
      `\n[마진] 1등(${sorted[0].viewType}×${sorted[0].concept}) − 2등(${sorted[1].viewType}×${sorted[1].concept}) = ${f3(margin)}${warn}`
    );
  }

  // ── 5) 재순위 후 실제 카드 ──
  const ranked = rankCandidates(cands, { viewTypeCounts: {} });
  console.log('\n[최종 카드]  개인화 무가중 + 형식 다양성 강제 후');
  ranked.forEach((c, i) => {
    console.log(`  ${i + 1}. ${pad(`${c.viewType} × ${c.concept}`, 20)} ${f3(c.score)}   ${c.id}`);
  });

  // ── 6) 기대 대조 ──
  const top = ranked[0];
  const okType = top?.viewType === g.expected.topViewType;
  const okConcept = top?.concept === g.expected.topConcept;
  const ok = okType && okConcept;
  console.log(
    `\n[판정] ${ok ? '✅ 기대 일치' : '❌ 불일치'}` +
      (ok ? '' : `  기대 ${g.expected.topViewType}×${g.expected.topConcept} / 실제 ${top?.viewType}×${top?.concept}`)
  );

  return { name: g.name, ok, margin };
}

// ─────────────────────────────────────────────

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`골든셋이 없습니다: ${DIR}`);
  process.exit(1);
}

const results = files.map(report);

console.log('');
console.log('═'.repeat(78));
console.log('요약');
console.log('═'.repeat(78));
for (const r of results) {
  console.log(
    `  ${r.ok ? '✅' : '❌'} ${pad(r.name, 20)} 마진 ${r.margin === null ? '—' : f3(r.margin)}`
  );
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n  ${passed}/${results.length} 일치`);
if (results.length < 10) {
  console.log(
    `\n  ⚠️ 골든셋이 ${results.length}건뿐이다. 이 숫자로 가중치를 튜닝하기엔 근거가 부족하다 —` +
      `\n     실사진에서 뽑은 골든을 10~15건 확보한 뒤에 만질 것.`
  );
}
console.log('');
