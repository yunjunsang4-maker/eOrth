// src/services/photoAI/formatCandidates.verify.ts
import { stripCandidates, feedCandidates, blogCandidates, dedupeByDhash } from './formatCandidates';
import type { ConceptScores } from './recoTypes';
import type { PhotoMeta, SpotGroup } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const HOUR = 3600_000;
const T0 = 1756600000000;
function photo(id: string, t: number, over: Partial<PhotoMeta> = {}): PhotoMeta {
  return {
    id, uri: `file:///${id}.jpg`, thumbnailUri: null, creationTime: t,
    width: 100, height: 100, location: null,
    quality: { aestheticsScore: 0.7, blurScore: 0.8, exposureScore: 0.8, passed: true },
    ...over,
  };
}
function scores(over: Partial<ConceptScores> = {}): ConceptScores {
  return { emotional: 0, hip: 0, fun: 0, food: 0, info: 0, ...over };
}

// ── dedupeByDhash: 연사컷 제거 ──
const dup1 = photo('d1', T0, { signal: { dhash: '0f0f0f0f0f0f0f0f' } });
const dup2 = photo('d2', T0 + 1000, {
  signal: { dhash: '0f0f0f0f0f0f0f0e' }, // 해밍 1 = 근접 중복
  quality: { aestheticsScore: 0.3, blurScore: 0.5, exposureScore: 0.5, passed: true },
});
const distinct = photo('d3', T0 + 2000, { signal: { dhash: 'f0f0f0f0f0f0f0f0' } });
const deduped = dedupeByDhash([dup1, dup2, distinct]);
eq(deduped.map((p) => p.id), ['d1', 'd3'], '근접 중복은 점수 높은 1장만');

// ── stripCandidates: 그룹 4장 → 슬롯 4 후보 ──
const g4: PhotoMeta[] = ['a', 'b', 'c', 'd'].map((id, i) => photo(id, T0 + i * 60_000));
const groups4: SpotGroup[] = [{
  id: 'spot1', photoIds: ['a', 'b', 'c', 'd'], startTime: T0, endTime: T0 + 180_000, center: null,
}];
const cmap4 = new Map(g4.map((p) => [p.id, scores({ fun: 0.8 })]));
const strips = stripCandidates(g4, groups4, cmap4, [2, 3, 4, 6, 9]);
eq(strips.length >= 1, true, '4장 그룹에서 스트립 후보 생성');
eq(strips[0].photoUris.length, 4, '슬롯 수 4 채택 (사진 수 이하 최대)');
eq(strips[0].viewType, 'cut', 'viewType=cut');
eq(strips[0].concept, 'fun', '그룹 우세 컨셉 채택');
eq(strips[0].reasonKey, 'reco.reason.cut_fun', 'reasonKey 규칙');

// ── stripCandidates: 1장 그룹은 후보 없음 ──
eq(stripCandidates([photo('x', T0)], [{ id: 's', photoIds: ['x'], startTime: T0, endTime: T0, center: null }], new Map([['x', scores()]]), [2, 3, 4]), [], '1장은 스트립 불가');

// ── feedCandidates: 컨셉 임계 통과분만, 20장 상한 ──
const many: PhotoMeta[] = Array.from({ length: 25 }, (_, i) => photo(`f${i}`, T0 + i * HOUR));
const cmapMany = new Map(many.map((p) => [p.id, scores({ emotional: 0.7 })]));
const feeds = feedCandidates(many, cmapMany);
const emoFeed = feeds.find((c) => c.concept === 'emotional');
eq(emoFeed !== undefined, true, 'emotional 피드 후보 생성');
eq(emoFeed!.photoUris.length, 20, '피드 20장 상한');
eq(emoFeed!.viewType, 'feed', 'viewType=feed');

// ── feedCandidates: 임계 미달 컨셉은 후보 없음 ──
const weak = new Map(many.map((p) => [p.id, scores({ hip: 0.2 })]));
eq(feedCandidates(many, weak), [], '임계(0.45) 미달은 후보 없음');

// ── blogCandidates: 스팟 2개 이상 → 타임라인 씨앗 ──
const day1 = ['b1', 'b2', 'b3'].map((id, i) => photo(id, T0 + i * 60_000));
const day2 = ['b4', 'b5'].map((id, i) => photo(id, T0 + 26 * HOUR + i * 60_000));
const blogGroups: SpotGroup[] = [
  { id: 's1', photoIds: ['b1', 'b2', 'b3'], startTime: T0, endTime: T0 + 120_000, center: null },
  { id: 's2', photoIds: ['b4', 'b5'], startTime: T0 + 26 * HOUR, endTime: T0 + 26 * HOUR + 60_000, center: null },
];
const blogPhotos = [...day1, ...day2];
const blogMap = new Map(blogPhotos.map((p) => [p.id, scores({ info: 0.6 })]));
const blogs = blogCandidates(blogPhotos, blogGroups, blogMap);
eq(blogs.length, 1, '블로그 후보 1개');
eq(blogs[0].viewType, 'blog', 'viewType=blog');
const seeds = blogs[0].blogSeeds!;
eq(seeds[0], { kind: 'heading', dayIndex: 1 }, '첫 씨앗 = DAY 1 헤딩');
eq(seeds.some((sd) => sd.kind === 'heading' && sd.dayIndex === 2), true, '둘째 날 헤딩 존재');
const imageSeeds = seeds.filter((sd) => sd.kind === 'images');
eq(imageSeeds.length, 2, '스팟당 images 씨앗 1개');
eq((imageSeeds[0] as { uris: string[] }).uris.length, 3, '스팟 대표 최대 3장');

// ── blogCandidates: 스팟 1개면 후보 없음 ──
eq(blogCandidates(day1, [blogGroups[0]], blogMap), [], '스팟 1개는 블로그 후보 없음');

// ── blogCandidates: 대표 사진이 0장인 스팟은 DAY 헤딩도 남기지 않는다 (F2 회귀) ──
// scorePhoto()는 isDocument/passed===false 외에 "품질 가중합이 정확히 0"일 때도 0을 반환한다.
// 그런 사진만 있는 스팟은 usable()은 통과하지만(passed:true) top이 비어 이미지 씨앗이 생기지
// 않는다. 헤딩을 먼저 push하던 구조에서는 이때 이미지 없는 헤딩만 씨앗에 남아, 프리필된
// 블로그에 빈 소제목이 생겼다.
function zeroScorePhoto(id: string, t: number): PhotoMeta {
  return photo(id, t, { quality: { aestheticsScore: 0, blurScore: 0, exposureScore: 0, passed: true } });
}
const tailEmptyPhotos = [
  ...day1,
  zeroScorePhoto('te1', T0 + 26 * HOUR),
  zeroScorePhoto('te2', T0 + 26 * HOUR + 30_000),
];
const tailEmptyGroups: SpotGroup[] = [
  blogGroups[0],
  { id: 'tailEmpty', photoIds: ['te1', 'te2'], startTime: T0 + 26 * HOUR, endTime: T0 + 26 * HOUR + 30_000, center: null },
];
const tailEmptySeeds = blogCandidates(
  tailEmptyPhotos, tailEmptyGroups, new Map(tailEmptyPhotos.map((p) => [p.id, scores({ info: 0.6 })]))
)[0]?.blogSeeds ?? [];
eq(
  tailEmptySeeds.some((sd) => sd.kind === 'heading' && sd.dayIndex === 2),
  false,
  '대표 사진 0장인 스팟은 DAY 헤딩도 push하지 않는다'
);
// 꼬리 검사까지 두는 이유: 전멸 스팟이 마지막이면 결함이 "배열 끝에 헤딩만 매달림"으로
// 나타난다. some() 검사와 형태가 달라 한쪽만으로는 회귀를 놓칠 수 있다.
eq(
  tailEmptySeeds[tailEmptySeeds.length - 1]?.kind,
  'images',
  '전멸 스팟이 마지막이면 씨앗 꼬리는 헤딩이 아니라 이미지다'
);

// ── blogCandidates: 같은 날 앞 스팟이 전멸해도 뒤 스팟은 그 날 헤딩을 잃지 않는다 (F2 회귀) ──
// 위 케이스와 짝을 이루는 반대 방향 불변식이다. 헤딩 push만 continue 아래로 내리고
// lastDayIndex 갱신을 continue 위에 남겨두면, 사진 없는 앞 스팟이 lastDayIndex를 선점해
// 같은 날 다음 스팟이 헤딩 없이 시작된다. 위 케이스는 그 실수를 그대로 통과시키므로
// (빈 헤딩이 안 생기는 건 매한가지라) 이 케이스가 있어야 잡힌다.
const sameDayPhotos = [
  zeroScorePhoto('sde1', T0),
  zeroScorePhoto('sde2', T0 + 60_000),
  ...['sg1', 'sg2', 'sg3'].map((id, i) => photo(id, T0 + 2 * HOUR + i * 60_000)),
];
const sameDayGroups: SpotGroup[] = [
  { id: 'sdEmpty', photoIds: ['sde1', 'sde2'], startTime: T0, endTime: T0 + 60_000, center: null },
  { id: 'sdGood', photoIds: ['sg1', 'sg2', 'sg3'], startTime: T0 + 2 * HOUR, endTime: T0 + 2 * HOUR + 120_000, center: null },
];
const sameDaySeeds = blogCandidates(
  sameDayPhotos, sameDayGroups, new Map(sameDayPhotos.map((p) => [p.id, scores({ info: 0.6 })]))
)[0]?.blogSeeds ?? [];
eq(sameDaySeeds[0], { kind: 'heading', dayIndex: 1 }, '같은 날 앞 스팟이 전멸해도 뒤 스팟이 DAY 1 헤딩을 획득');
// seeds[0]만 보면 "헤딩이 있다"까지만 확인되고 그 헤딩이 고아인지는 못 본다
eq(sameDaySeeds[1]?.kind, 'images', '그 DAY 헤딩 바로 뒤에 이미지 씨앗이 온다');

// ── 문서 사진 제외 ──
const doc = photo('doc', T0, { semantic: { isDocument: true } });
const docFeeds = feedCandidates([doc, ...many], new Map([[doc.id, scores({ emotional: 0.9 })], ...cmapMany]));
eq(docFeeds.every((c) => !c.photoUris.includes('file:///doc.jpg')), true, '문서/영수증은 모든 후보에서 제외');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
