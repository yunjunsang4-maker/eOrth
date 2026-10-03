/**
 * feedMasonry 검증 — node node_modules/tsx/dist/cli.mjs src/components/social/feedMasonry.verify.ts
 *
 * 배치는 손으로 복제한 함수가 아니라 **@shopify/flash-list dist의 진짜 클래스**로 본다
 * (RVMasonryLayoutManagerImpl·RVEngagedIndicesTrackerImpl). FlashList를 올렸는데 masonry 순번 배치나
 * 렌더 범위 계산이 바뀌면 여기서 깨진다. dist가 'react-native'에서 쓰는 것은 PixelRatio뿐이라 그것만 흉내 낸다.
 *
 * 핵심 불변식:
 *  1) buildMasonryCells 결과를 FlashList 순번 교대(optimizeItemArrangement=false)로 놓으면 각 셀이 cell.col 열에,
 *     열마다 피드 순서대로 쌓인다(gap 셀 높이 0) — 실측 높이가 추정과 달라도.
 *  2) 실제 스타일에서 유도한 추정(estimateFeedCellHeight) + FEED_DRAW_DISTANCE면 게시물 200개 피드를 위아래로
 *     훑을 때 화면 안 카드가 렌더 범위 밖으로 빠지지 않는다(QA M1 회귀). 실측 높이는 QA qa5 높이 모델.
 */
import Module, { createRequire } from 'node:module';
import { buildMasonryCells, estimateFeedCellHeight, FEED_CARD_GAP, FEED_DRAW_DISTANCE, type FeedCell } from './feedMasonry';
import { CUT_LAYOUTS } from '../../constants/cutFrames';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── flash-list dist 로드('react-native'만 대체) ──
const M: any = Module;
const origLoad = M._load;
M._load = function (r: string, ...rest: any[]) {
  if (r === 'react-native') {
    return { PixelRatio: { getPixelSizeForLayoutSize: (v: number) => v * 3, roundToNearestPixel: (v: number) => Math.round(v * 3) / 3 } };
  }
  return origLoad.call(this, r, ...rest);
};
const req = createRequire(import.meta.url);
const { RVMasonryLayoutManagerImpl } = req('@shopify/flash-list/dist/recyclerview/layout-managers/MasonryLayoutManager');
const { RVEngagedIndicesTrackerImpl } = req('@shopify/flash-list/dist/recyclerview/helpers/EngagedIndicesTracker');

// 결정적 난수(검증이 매번 같은 입력을 보게)
let seed = 20261003;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const SCREEN_W = 393;
const CELL_W = SCREEN_W / 2;
const CARD_W = (SCREEN_W - 42) / 2;
const VIEW_H = 750;
const LAYOUTS = Object.keys(CUT_LAYOUTS);
const cutAspect = (it: any) => (CUT_LAYOUTS as any)[it.cutPhoto.layout].aspect as number;

/** 진짜 FlashList masonry 매니저로 배치. real = 셀 실측 높이(카드 간격 포함, gap은 0) */
function layoutWithFlash(cells: FeedCell<any>[], real: (c: FeedCell<any>, i: number) => number) {
  const lm = new RVMasonryLayoutManagerImpl({
    windowSize: { width: SCREEN_W, height: VIEW_H }, maxColumns: 2, horizontal: false,
    optimizeItemArrangement: false, overrideItemLayout: () => {},
    getItemType: (i: number) => (cells[i].kind === 'gap' ? 'gap' : 'x'),
  });
  lm.modifyLayout([], cells.length); // 미측정(추정) 배치
  lm.modifyLayout(cells.map((c, index) => ({ index, dimensions: { width: CELL_W, height: real(c, index) } })), cells.length);
  return lm;
}
const colOf = (l: any) => Math.round(l.x / CELL_W);

// ── buildMasonryCells 경계 ──
type It = { id: string; est: number };
const est = (i: It) => i.est;
eq(buildMasonryCells<It>([], est), [], '빈 입력 → 빈 배열(gap 없음)');
eq(buildMasonryCells<It>([{ id: 'a', est: 200 }], est).map((c) => [c.kind, c.col]), [['item', 0]], '1개 → 왼쪽 열, gap 없음');
eq(buildMasonryCells<It>([{ id: 'a', est: 200 }, { id: 'b', est: 200 }], est).map((c) => c.kind), ['item', 'item'], '같은 높이 2개(동률→왼쪽 다음 오른쪽) → gap 없이 교대');
// 같은 열 연속 — 오른쪽이 높으면 왼쪽에 연달아: 사이에 오른쪽 순번을 gap으로 소모
const seqCells = buildMasonryCells<It>([{ id: 'a', est: 100 }, { id: 'b', est: 500 }, { id: 'c', est: 100 }, { id: 'd', est: 100 }], est);
eq(seqCells.map((c) => c.key), ['a', 'b', 'c', 'gap:d', 'd'], '같은 열 연속 → 사이에 gap 1개(키는 뒤 항목 id)');
eq(seqCells.filter((c) => c.kind === 'gap').map((c) => c.col), [1], 'gap은 건너뛸 열(오른쪽)에 놓인다');
eq(seqCells.map((c) => (c.kind === 'item' ? c.first : null)), [true, true, false, null, false], 'first는 열마다 첫 카드만(gap 무관)');

// ── 불변식 1: 진짜 FlashList 배치에서 열·순서 ──
const mixed: It[] = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, est: ri(120, 420) }));
const mixedCells = buildMasonryCells(mixed, est);
// 실측은 추정과 무관한 난수(추정이 틀려도 열은 그대로여야 한다)
const realRand = mixedCells.map((c) => (c.kind === 'gap' ? 0 : ri(80, 600)));
const lm1 = layoutWithFlash(mixedCells, (_c, i) => realRand[i]);
const L1 = lm1.layouts;
eq(mixedCells.every((c, i) => colOf(L1[i]) === c.col), true, 'FlashList가 놓은 열 == cell.col (gap 포함 전 셀, 실측≠추정)');
const expectCols: string[][] = [[], []];
mixedCells.forEach((c) => { if (c.kind === 'item') expectCols[c.col].push(c.key); });
const gotCols: string[][] = [[], []];
mixedCells.map((c, i) => ({ c, l: L1[i] })).filter((x) => x.c.kind === 'item').sort((a, b) => a.l.y - b.l.y)
  .forEach((x) => gotCols[colOf(x.l)].push(x.c.key));
eq(gotCols, expectCols, '열마다 y순 = 피드 순서(gap이 끼어도 순서 유지)');
eq(mixedCells.every((c, i) => c.kind !== 'gap' || L1[i].height === 0), true, 'gap 셀 실측 높이 0 → 열 높이에 기여 없음');

// 이어붙이기 — 앞 셀 키·열 불변이어야 FlashList가 기존 실측을 그대로 쓴다
const more = [...mixed, ...[244, 190, 234].map((h, i) => ({ id: `q${i}`, est: h }))];
const moreCells = buildMasonryCells(more, est);
eq(moreCells.slice(0, mixedCells.length).map((c) => [c.key, c.col]), mixedCells.map((c) => [c.key, c.col]), '뒤에 이어붙여도 앞 셀 키·열 불변');
const keys = moreCells.map((c) => c.key);
eq(new Set(keys).size, keys.length, '셀 키 중복 없음(keyExtractor 중복은 FlashList 재활용 오류)');

// ── 추정 함수(estimateFeedCellHeight) ──
const ctx = { cardW: CARD_W, full: true, mates: 2, cutAspect };
eq(estimateFeedCellHeight({ viewType: 'blog', medias: ['x'] }, ctx), estimateFeedCellHeight({ viewType: 'blog', medias: [] }, ctx),
  '블로그는 사진이 있어도 글로만 그린다 → 사진 가산 없음(예전 +40 과대 추정 제거)');
eq(estimateFeedCellHeight({ viewType: 'blog' }, ctx), 172 + FEED_CARD_GAP, '블로그 = 저널 실측 범위 126~218의 중앙 172 + 간격 12');
eq(estimateFeedCellHeight({ viewType: 'feed' }, ctx), CARD_W + 66 + FEED_CARD_GAP, '폴라로이드 = 카드폭+66(캡션 있음) + 간격 12');
eq(estimateFeedCellHeight({ id: 'x' }, ctx), estimateFeedCellHeight({ viewType: 'feed' }, ctx), 'viewType 없음 → 폴라로이드');
eq(estimateFeedCellHeight({ viewType: 'feed' }, { ...ctx, full: false }), estimateFeedCellHeight({ viewType: 'feed' }, ctx), '폴라로이드는 메타가 카드 안이라 모드와 무관');
eq(estimateFeedCellHeight({ viewType: 'cut', cutPhoto: { layout: LAYOUTS[0] } }, ctx) - estimateFeedCellHeight({ viewType: 'cut', cutPhoto: { layout: LAYOUTS[0] } }, { ...ctx, full: false }),
  48, '네컷 full 메타 48(compact엔 없음)');
eq(estimateFeedCellHeight({ _mateSlot: true }, ctx), 102 + 2 * 48 + FEED_CARD_GAP, '추천 메이트 = 102 + 행 48×n + 간격');
eq(estimateFeedCellHeight({ _adSlot: true }, { ...ctx, cardW: 200 }) - estimateFeedCellHeight({ _adSlot: true }, ctx), 200 - CARD_W, '광고 높이는 카드 폭을 따라간다(정사각 사진)');

// ── 불변식 2: 빈칸 회귀(QA M1) — 진짜 렌더 범위 계산(EngagedIndicesTracker) ──
// 실측 높이 모델(QA qa5/blank.ts, SocialScreen 스타일에서 손으로 유도한 가정)
function realHeight(it: any): number {
  if (it._adSlot) return CARD_W + 21 + ri(0, 15);
  if (it._mateSlot) return 102 + it._mates * 48 + ri(-15, 15);
  const vt = it.viewType;
  if (vt === 'cut') return (CARD_W - 14) / cutAspect(it) + 14 + 48;
  if (vt === 'blog') return 3 + 24 + 21 + 20 * ri(1, 2) + 4 + (rnd() < 0.5 ? 21 : 0) + 17 * ri(0, 3) + 10 + 8 + 1 + 17 + 18;
  return CARD_W + 47 + (rnd() < 0.9 ? 19 : 0); // 폴라로이드
}
// timelineWithAds 규칙(i%5==0 게시물 뒤 광고, 마지막 제외) + index 2 추천 메이트. 앨범은 피드에서 빠진다.
function makeFeed(nPosts: number, mates: number) {
  const out: any[] = [];
  for (let i = 0; i < nPosts; i++) {
    const r = rnd();
    const vt = r < 0.6 ? 'feed' : r < 0.85 ? 'blog' : 'cut';
    out.push({ id: `p${i}`, viewType: vt, medias: rnd() < 0.5 ? ['x'] : [], cutPhoto: vt === 'cut' ? { layout: LAYOUTS[ri(0, LAYOUTS.length - 1)] } : undefined });
    if (i % 5 === 0 && i !== nPosts - 1) out.push({ id: `ad-slot-${i}`, _adSlot: true });
  }
  if (mates > 0) out.splice(2, 0, { id: 'mate', _mateSlot: true, _mates: mates });
  return out;
}
function hasBlank(nPosts: number): boolean {
  const mates = ri(0, 3);
  const feed = makeFeed(nPosts, mates);
  const cells = buildMasonryCells<any>(feed, (it) => estimateFeedCellHeight(it, { cardW: CARD_W, full: true, mates, cutAspect }));
  const lm = layoutWithFlash(cells, (c) => (c.kind === 'gap' ? 0 : realHeight(c.item) + (c.first ? 0 : FEED_CARD_GAP)));
  const L = lm.layouts;
  const total = lm.getLayoutSize().height;
  for (const dir of [1, -1]) {
    const tr = new RVEngagedIndicesTrackerImpl();
    tr.drawDistance = FEED_DRAW_DISTANCE;
    tr.enableOffsetProjection = false;
    const offsets: number[] = [];
    for (let o = 0; o <= Math.max(0, total - VIEW_H); o += 37) offsets.push(o);
    if (dir < 0) offsets.reverse();
    for (const off of offsets) {
      for (let k = 0; k < 5; k++) tr.updateScrollOffset(off, { x: 0, y: dir * 2 }, lm); // 방향 이력을 채워 버퍼 비대칭 반영
      const eng = tr.getEngagedIndices();
      for (let i = 0; i < L.length; i++) {
        if (cells[i].kind === 'gap') continue;
        const visible = L[i].y < off + VIEW_H && L[i].y + L[i].height > off;
        if (visible && !(i >= eng.startIndex && i <= eng.endIndex)) return true;
      }
    }
  }
  return false;
}
const blanks = Array.from({ length: 8 }, () => hasBlank(200)).filter(Boolean).length;
eq(blanks, 0, `게시물 200개 피드 8개를 위아래로 훑어도 화면 안 카드가 렌더 범위 밖으로 빠지지 않음(drawDistance ${FEED_DRAW_DISTANCE})`);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
