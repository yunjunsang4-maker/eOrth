/**
 * photo-lab 리포트 — signals.json을 앱 JS 층에 그대로 통과시켜 HTML 한 장으로 만든다.
 *
 *   node --import tsx --import file:///<abs>/tools/photo-lab/register.mjs tools/photo-lab/report.ts <outDir> [--golden <name>]
 *   node --import tsx --import file:///<abs>/tools/photo-lab/register.mjs tools/photo-lab/report.ts --golden-check
 *
 * 여기서 import하는 것은 전부 앱 파일이다(src/services/photoAI/*). 이 도구는 그 파일들을
 * 복제하지 않는다 — 리포트를 보고 고칠 파일이 곧 앱 파일이다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { groupPhotosBySpot } from '../../src/services/photoAI/photoGrouping';
import { filterByQuality } from '../../src/services/photoAI/qualityAssessment';
import { attachBestCuts, scorePhoto } from '../../src/services/photoAI/bestCutSelector';
import { ruleConceptClassifier } from '../../src/services/photoAI/conceptClassifier';
import { conceptAffinityFromLabels } from '../../src/services/photoAI/labelTaxonomy';
import { stripCandidates, feedCandidates, blogCandidates } from '../../src/services/photoAI/formatCandidates';
import { rankCandidates } from '../../src/services/photoAI/personalRanker';
import { RECO_CONCEPTS } from '../../src/services/photoAI/recoTypes';
import type { ConceptScores, RecoCandidate, RecoConcept } from '../../src/services/photoAI/recoTypes';
import type { PhotoMeta, SpotGroup } from '../../src/services/photoAI/types';

const ROOT = join(__dirname, '..', '..');
const GOLDEN_DIR = join(ROOT, 'src', 'services', 'photoAI', 'goldens');
/** CUT_FRAMES 기본 카테고리 슬롯 수 — reco-lab.ts·formatReco.verify.ts와 같은 값 */
const SLOT_COUNTS = [2, 3, 4, 6, 9];

export interface LabResult {
  photos: PhotoMeta[];
  usable: PhotoMeta[];
  groups: SpotGroup[];
  concepts: Record<string, ConceptScores>;
  interpreted: Record<string, boolean>;
  candidates: RecoCandidate[];
  cards: RecoCandidate[];
  bestScore: Record<string, number>;
}

/** KEYWORD_AFFINITY는 labelTaxonomy 내부라 밖에서 못 읽는다 — 라벨 하나만 넣어 역판정 */
function isLabelInterpreted(label: string): boolean {
  const s = conceptAffinityFromLabels([{ label, confidence: 1 }]);
  return RECO_CONCEPTS.some((c) => s[c] > 0);
}

export function runPipeline(photos: PhotoMeta[], groupsHint?: SpotGroup[]): LabResult {
  const usable = filterByQuality(photos);
  const groups = attachBestCuts(groupsHint ?? groupPhotosBySpot(usable), usable);
  const conceptMap = new Map(photos.map((p) => [p.id, ruleConceptClassifier(p)]));
  const candidates = [
    ...stripCandidates(photos, groups, conceptMap, SLOT_COUNTS),
    ...feedCandidates(photos, conceptMap),
    ...blogCandidates(photos, groups, conceptMap),
  ].sort((a, b) => b.score - a.score);
  const cards = rankCandidates(candidates, { viewTypeCounts: {} });
  const interpreted: Record<string, boolean> = {};
  for (const p of photos) {
    for (const l of p.signal?.sceneLabels ?? []) interpreted[l.label] ??= isLabelInterpreted(l.label);
  }
  const bestScore = Object.fromEntries(photos.map((p) => [p.id, scorePhoto(p)]));
  return { photos, usable, groups, concepts: Object.fromEntries(conceptMap), interpreted, candidates, cards, bestScore };
}

// ─────────────────────────────────────────────
// 골든
// ─────────────────────────────────────────────

function goldenCheck(): void {
  let bad = 0;
  for (const f of readdirSync(GOLDEN_DIR).filter((x) => x.endsWith('.json')).sort()) {
    const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), 'utf8'));
    const r = runPipeline(g.photos, g.groupsHint);
    const top = r.cards[0];
    const ok = top?.viewType === g.expected.topViewType && top?.concept === g.expected.topConcept;
    console.log(`${ok ? '✅' : '❌'} ${g.name}: ${top?.viewType}×${top?.concept}` +
      (ok ? '' : `  (기대 ${g.expected.topViewType}×${g.expected.topConcept})`));
    if (!ok) bad++;
  }
  if (bad) process.exit(1);
  console.log('golden-check ok');
}

function saveGolden(name: string, r: LabResult, sourceDir: string): void {
  const top = r.cards[0];
  if (!top) throw new Error('추천 카드가 없어 골든을 만들 수 없습니다');
  const golden = {
    name,
    sourceDir,
    note: '기대값은 report.html을 보고 사람이 확정한다 — 필요하면 expected를 고칠 것',
    expected: { topViewType: top.viewType, topConcept: top.concept },
    photos: r.photos.map((p) => ({ ...p, thumbnailUri: null })),
    groupsHint: r.groups.map(({ bestCutIds: _b, ...g }) => g),
  };
  const path = join(GOLDEN_DIR, `golden-${name}.json`);
  writeFileSync(path, JSON.stringify(golden, null, 1), 'utf8');
  console.log(`골든 저장: ${path}`);
}

// ─────────────────────────────────────────────
// HTML — 서버 측에서 전부 그린다. 클라이언트 JS는 정렬·필터만.
// ─────────────────────────────────────────────

const CONCEPT_KO: Record<RecoConcept, string> = {
  emotional: '감성', hip: '힙', fun: '유쾌', food: '음식', info: '정보',
};
const VIEW_KO: Record<string, string> = { feed: '피드', blog: '블로그', cut: '컷' };

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (n: number | undefined): string => (n === undefined ? '—' : n.toFixed(2));
const when = (ms: number): string =>
  new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function topOf(s: ConceptScores): { concept: RecoConcept; score: number } {
  let best: RecoConcept = RECO_CONCEPTS[0];
  for (const c of RECO_CONCEPTS) if (s[c] > s[best]) best = c;
  return { concept: best, score: s[best] };
}

function photoCard(p: PhotoMeta, r: LabResult): string {
  const s = r.concepts[p.id];
  const top = topOf(s);
  const allZero = RECO_CONCEPTS.every((c) => s[c] === 0);
  const sem = p.semantic ?? {};
  const sig = p.signal ?? {};
  const q = p.quality ?? {};
  const badges: string[] = [];
  if ((sig.faceCount ?? 0) > 0) badges.push(`얼굴 ${sig.faceCount}`);
  if (sem.isSmiling) badges.push('웃음');
  if (sem.isFood) badges.push('음식');
  if (sem.isLandscape) badges.push('풍경');
  if (sem.isLandmark) badges.push('랜드마크');
  if (sem.isDocument) badges.push('문서');
  if (sig.hasText) badges.push('텍스트');
  const labels = (sig.sceneLabels ?? [])
    .map((l) => `<span class="chip ${r.interpreted[l.label] ? 'on' : 'off'}" data-label="${esc(l.label)}" title="신뢰도 ${l.confidence.toFixed(2)}">${esc(l.label)}</span>`)
    .join('');
  const bars = RECO_CONCEPTS.map((c) =>
    `<div class="bar"><span class="bl">${CONCEPT_KO[c]}</span><span class="bt"><i class="${c === top.concept && !allZero ? 'top' : ''}" style="width:${Math.round(s[c] * 100)}%"></i></span><span class="bv">${s[c].toFixed(2)}</span></div>`
  ).join('');
  const failed = q.passed === false;
  const labelSet = (sig.sceneLabels ?? []).map((l) => l.label).join('|');
  return `<div class="photo${failed ? ' failed' : ''}" data-t="${p.creationTime}" data-c="${allZero ? 0 : top.score}" data-b="${r.bestScore[p.id] ?? 0}" data-labels="${esc(labelSet)}">
  <img src="${esc(p.thumbnailUri ?? '')}" loading="lazy" alt="">
  <div class="body">
    <div class="head"><b>${esc(p.id)}</b><span class="dim">${when(p.creationTime)}</span></div>
    <div class="topc">${allZero ? '<span class="dim">신호 없음</span>' : `최고 <b class="purple">${CONCEPT_KO[top.concept]}</b> ${top.score.toFixed(2)}`}${failed ? ' <span class="red">탈락</span>' : ''}</div>
    ${bars}
    <div class="chips">${labels || '<span class="dim">라벨 없음</span>'}</div>
    <div class="badges">${badges.map((b) => `<span class="badge">${b}</span>`).join('') || '<span class="dim">판정 없음</span>'}</div>
    <div class="q dim">블러 ${f2(q.blurScore)} · 노출 ${f2(q.exposureScore)} · 미학 ${f2(q.aestheticsScore)} · 베스트컷 ${f2(r.bestScore[p.id])}</div>
  </div>
</div>`;
}

function thumbOf(uri: string, r: LabResult): string {
  const p = r.photos.find((x) => x.uri === uri);
  return p?.thumbnailUri ? `<img src="${esc(p.thumbnailUri)}" title="${esc(p.id)}" loading="lazy" alt="">` : `<span class="miss">?</span>`;
}

export function renderHtml(r: LabResult, meta: { sourceDir: string; skipped: { file: string; reason: string }[] }): string {
  const byId = new Map(r.photos.map((p) => [p.id, p]));
  const uniq = Object.keys(r.interpreted);
  const onCount = uniq.filter((l) => r.interpreted[l]).length;
  const dropped = uniq.filter((l) => !r.interpreted[l]).sort();
  const pct = uniq.length ? Math.round((onCount / uniq.length) * 100) : 0;
  const margin = r.candidates.length >= 2 ? r.candidates[0].score - r.candidates[1].score : null;

  const groups = r.groups.map((g, i) => `<div class="group">
  <div class="head"><b>스팟 ${i + 1}</b><span class="dim">${when(g.startTime)} ~ ${when(g.endTime)} · ${g.photoIds.length}장${g.center ? ` · ${g.center.latitude.toFixed(4)}, ${g.center.longitude.toFixed(4)}` : ''}</span></div>
  <div class="row">${(g.bestCutIds ?? []).map((id) => { const p = byId.get(id); return p ? `<div class="best">${p.thumbnailUri ? `<img src="${esc(p.thumbnailUri)}" alt="">` : ''}<span>${f2(r.bestScore[id])}</span></div>` : ''; }).join('') || '<span class="dim">베스트컷 없음</span>'}</div>
</div>`).join('');

  const cards = r.cards.map((c, i) => `<div class="card">
  <div class="head"><b>${i + 1}. ${VIEW_KO[c.viewType] ?? c.viewType} × ${CONCEPT_KO[c.concept]}</b><span class="dim">${c.score.toFixed(3)} · ${c.photoUris.length}장 · ${esc(c.id)}</span></div>
  <div class="row">${c.photoUris.map((u) => thumbOf(u, r)).join('')}</div>
</div>`).join('');

  const table = r.candidates.map((c, i) =>
    `<tr><td>${i + 1}</td><td>${VIEW_KO[c.viewType] ?? c.viewType} × ${CONCEPT_KO[c.concept]}</td><td>${c.score.toFixed(3)}</td><td>${c.photoUris.length}</td><td class="dim">${esc(c.id)}</td></tr>`
  ).join('');

  const data = JSON.stringify(r).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>photo-lab · ${esc(basename(meta.sourceDir))}</title>
<style>
:root{--bg:#0A0A0F;--card:#2E2E3B;--purple:#BF85FC;--deep:#6B21A8;--dim:#A1A1B0;--line:#1A1A26;--red:#FF3B30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#fff;font:14px/1.45 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1500px;margin:0 auto;padding:20px}
h1{font-size:20px;margin:0 0 6px}h2{font-size:16px;margin:28px 0 10px;padding-top:16px;border-top:1px solid var(--line)}
.dim{color:var(--dim)}.purple{color:var(--purple)}.red{color:var(--red);font-weight:700}
.warn{background:#1c1330;border:1px solid var(--deep);border-radius:8px;padding:8px 12px;margin:10px 0;color:#e8d7ff}
.stats{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.chip{font-size:12px;padding:1px 7px;border-radius:10px;border:1px solid var(--line);color:var(--dim);cursor:pointer}
.chip.on{border-color:var(--purple);color:#fff}.chip.off{opacity:.65}.chip.sel{background:var(--deep);color:#fff}
.toolbar{display:flex;gap:10px;align-items:center;margin:10px 0}select,button{background:var(--card);color:#fff;border:1px solid var(--line);border-radius:6px;padding:4px 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.photo{background:var(--card);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.photo.failed{outline:1px solid var(--red)}.photo.hide{display:none}
.photo img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#000}
.body{padding:10px}.head{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.head b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topc{margin:4px 0 6px}
.bar{display:grid;grid-template-columns:34px 1fr 36px;gap:6px;align-items:center;font-size:12px}
.bt{height:8px;background:var(--line);border-radius:4px;overflow:hidden}.bt i{display:block;height:100%;background:#6f6f85}.bt i.top{background:var(--purple)}
.bv{text-align:right;color:var(--dim)}
.badges{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.badge{font-size:11px;background:var(--deep);border-radius:4px;padding:1px 6px}
.q{font-size:12px}
.group,.card{background:var(--card);border-radius:10px;padding:10px 12px;margin:8px 0}
.row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.row img{height:96px;border-radius:6px}
.best{position:relative}.best span{position:absolute;right:4px;bottom:4px;font-size:11px;background:#000a;padding:0 4px;border-radius:3px}
.miss{display:inline-flex;width:96px;height:96px;align-items:center;justify-content:center;background:#000;border-radius:6px;color:var(--red)}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:4px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--dim);font-weight:500}
</style></head><body><main>
<h1>photo-lab · ${esc(basename(meta.sourceDir))}</h1>
<div class="dim">${esc(meta.sourceDir)}</div>
<div class="warn">데스크탑 CLIP 대체 모델의 결과입니다. 라벨 어휘가 iOS Vision과 달라 앱 이식 시 taxonomy를 다시 확인하세요.</div>
<div class="stats">
  <span>사진 <b>${r.photos.length}</b> · 통과 <b>${r.usable.length}</b> · 탈락 <b class="${r.photos.length - r.usable.length ? 'red' : ''}">${r.photos.length - r.usable.length}</b>${meta.skipped.length ? ` · 못 연 파일 <b class="red">${meta.skipped.length}</b>` : ''}</span>
  <span>스팟 그룹 <b>${r.groups.length}</b></span>
  <span>라벨 해석률 <b class="purple">${pct}%</b> <span class="dim">(고유 ${uniq.length}개 중 ${onCount}개 해석)</span></span>
</div>
${dropped.length ? `<div><span class="dim">버려진 라벨 ${dropped.length}개 — 클릭하면 그 라벨을 가진 사진만 남습니다:</span><div class="chips" id="dropped">${dropped.map((l) => `<span class="chip off" data-label="${esc(l)}">${esc(l)}</span>`).join('')}</div></div>` : ''}
${meta.skipped.length ? `<div class="dim">못 연 파일: ${meta.skipped.map((s) => `${esc(s.file)} (${esc(s.reason)})`).join(', ')}</div>` : ''}

<h2>사진별 분류</h2>
<div class="toolbar"><label>정렬 <select id="sort"><option value="t">촬영순</option><option value="c">컨셉 점수</option><option value="b">베스트컷 점수</option></select></label><button id="clear" hidden>필터 해제</button><span class="dim" id="count"></span></div>
<div class="grid" id="grid">${r.photos.map((p) => photoCard(p, r)).join('')}</div>

<h2>스팟 그룹 · 베스트컷</h2>
${groups || '<div class="dim">그룹 없음</div>'}

<h2>추천 카드 (앱에 보이는 최종 결과)</h2>
${cards || '<div class="dim">카드 없음 — 통과한 사진이 없거나 후보가 없음</div>'}
${margin !== null ? `<div style="margin:8px 0">1등 − 2등 마진 <b class="${margin < 0.05 ? 'red' : 'purple'}">${margin.toFixed(3)}</b>${margin < 0.05 ? ' <span class="red">얇다 — 가중치를 조금만 만져도 순위가 뒤집힌다</span>' : ''}</div>` : ''}
<details><summary class="dim">후보 전체 ${r.candidates.length}개</summary>
<table><thead><tr><th>#</th><th>형식 × 컨셉</th><th>점수</th><th>사진</th><th>id</th></tr></thead><tbody>${table}</tbody></table></details>

<script type="application/json" id="data">${data}</script>
<script>
(function(){
  var grid=document.getElementById('grid'),sort=document.getElementById('sort'),clear=document.getElementById('clear'),count=document.getElementById('count');
  var cards=Array.prototype.slice.call(grid.children),filter=null;
  function apply(){
    var k=sort.value,desc=k!=='t';
    cards.sort(function(a,b){var x=+a.dataset[k],y=+b.dataset[k];return desc?y-x:x-y;});
    var shown=0;
    cards.forEach(function(c){var ok=!filter||('|'+c.dataset.labels+'|').indexOf('|'+filter+'|')>=0;c.classList.toggle('hide',!ok);if(ok)shown++;grid.appendChild(c);});
    count.textContent=filter?('라벨 "'+filter+'" '+shown+'장'):'';
    clear.hidden=!filter;
    document.querySelectorAll('.chip').forEach(function(ch){ch.classList.toggle('sel',!!filter&&ch.dataset.label===filter);});
  }
  document.addEventListener('click',function(e){var ch=e.target.closest('.chip');if(!ch)return;filter=filter===ch.dataset.label?null:ch.dataset.label;apply();});
  clear.onclick=function(){filter=null;apply();};
  sort.onchange=apply;
  apply();
})();
</script>
</main></body></html>`;
}

// ─────────────────────────────────────────────
// main
// ─────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--golden-check')) {
  goldenCheck();
} else {
  const outDir = args[0];
  if (!outDir) {
    console.error('사용법: report.ts <outDir> [--golden <name>] | --golden-check');
    process.exit(1);
  }
  const sig = JSON.parse(readFileSync(join(outDir, 'signals.json'), 'utf8'));
  const r = runPipeline(sig.photos);
  const html = renderHtml(r, { sourceDir: sig.sourceDir, skipped: sig.skipped ?? [] });
  writeFileSync(join(outDir, 'report.html'), html, 'utf8');
  console.log(`리포트: ${join(outDir, 'report.html')}  (사진 ${r.photos.length}, 그룹 ${r.groups.length}, 카드 ${r.cards.length})`);
  const gi = args.indexOf('--golden');
  if (gi !== -1) saveGolden(args[gi + 1] ?? basename(outDir), r, sig.sourceDir);
}
