// src/utils/albumGalleryMatch.verify.ts
import { albumDateWindow, sameDims, orderCandidates, createSizeMatcher, type GalleryCandidate, type AlbumPhotoSig } from './albumGalleryMatch';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

// ── albumDateWindow (기본 여유 ±1일) ──
// 정상: 점 표기. before는 끝날 다음 자정 + 1일(배타)
eq(albumDateWindow('2025.08.10', '2025.08.12'), { after: local(2025, 8, 9), before: local(2025, 8, 14) }, '점 표기 08.10~08.12 → 08.09 자정 ~ 08.14 자정');
// 하이픈 표기도 같은 규칙(AlbumCreateScreen.parseAlbumDate) — UTC 자정으로 읽으면 미주에서 하루 밀린다
eq(albumDateWindow('2025-08-10', '2025-08-12'), { after: local(2025, 8, 9), before: local(2025, 8, 14) }, '하이픈 표기 → 로컬 자정');
// 월·연 넘김
eq(albumDateWindow('2025.01.01', '2025.12.31'), { after: local(2024, 12, 31), before: local(2026, 1, 2) }, '연 넘김 여유');
// 한쪽만
eq(albumDateWindow('2025.08.10', undefined), { after: local(2025, 8, 9), before: local(2025, 8, 12) }, '끝날 없음 → 시작일 하루');
eq(albumDateWindow('', '2025.08.10'), { after: local(2025, 8, 9), before: local(2025, 8, 12) }, '시작일 빈 문자열 → 끝날 하루');
// 거꾸로 입력
eq(albumDateWindow('2025.08.12', '2025.08.10'), { after: local(2025, 8, 9), before: local(2025, 8, 14) }, '시작>끝이면 뒤집음');
// 널 계열·모르는 값 → null(단계 건너뜀)
eq(albumDateWindow(undefined, undefined), null, '둘 다 undefined → null');
eq(albumDateWindow('', ''), null, '둘 다 빈 문자열 → null');
eq(albumDateWindow('8월 10일', 'abc'), null, '못 읽는 표기 → null');
eq(albumDateWindow('2025.08.10', '2025.08.10', 0), { after: local(2025, 8, 10), before: local(2025, 8, 11) }, 'padDays 0 → 그날 하루');

// ── sameDims (조회 순서용 — 모르면 false) ──
eq(sameDims({ w: 4032, h: 3024 }, { w: 4032, h: 3024 }), true, '같은 가로·세로');
eq(sameDims({ w: 3024, h: 4032 }, { w: 4032, h: 3024 }), true, '회전으로 뒤바뀐 가로·세로도 같음');
eq(sameDims({ w: 4032, h: 3024 }, { w: 4000, h: 3000 }), false, '다른 가로·세로');
eq(sameDims({}, { w: 4032, h: 3024 }), false, '사진 가로·세로 모름(getSize 실패) → 우선순위 없음');
eq(sameDims({ w: 4032, h: 3024 }, { w: 0, h: 0 }), false, '자산 가로·세로 0 → 우선순위 없음');

// ── orderCandidates ──
const C = (id: string, w: number, h: number, creationTime: number): GalleryCandidate => ({ id, w, h, creationTime });
const mid = local(2025, 8, 11);
const H = 3600e3;
// 가로·세로 같은 자산이 먼저, 각 묶음 안에서는 기간 중앙에 가까운 순. creationTime 0은 제외
eq(
  orderCandidates([{ key: 'a', size: 1, w: 4032, h: 3024 }], [
    C('far-dim', 4032, 3024, mid + 30 * H), C('near-other', 1170, 2532, mid + H), C('near-dim', 3024, 4032, mid - 2 * H),
    C('mid-other', 1170, 2532, mid), C('no-time', 4032, 3024, 0),
  ], mid, 10).list.map((c) => c.id),
  ['near-dim', 'far-dim', 'mid-other', 'near-other'],
  '순서: 가로·세로 같은 것(중앙 근접순) → 나머지(중앙 근접순), creationTime 0 제외',
);
// 하드 필터 아님 — 가로·세로가 다른 자산도 목록에 남는다(HEIF 0번 이미지 함정 대비)
eq(orderCandidates([{ key: 'a', size: 1, w: 10, h: 20 }], [C('x', 99, 99, mid)], mid, 10).list.length, 1, '가로·세로 다른 자산도 후보에 남음(순서만 뒤로)');
// 상한 — limit장만, truncated 표시
const many = Array.from({ length: 1600 }, (_, i) => C(`c${i}`, 4032, 3024, mid + i * 60e3));
const capped = orderCandidates([{ key: 'a', size: 1 }], many, mid, 1500);
eq([capped.list.length, capped.truncated, capped.list[0].id, capped.list[1499].id], [1500, true, 'c0', 'c1499'], '상한 1500: 중앙에 가까운 1500장만, truncated=true');
eq(orderCandidates([{ key: 'a', size: 1 }], many.slice(0, 3), mid, 1500).truncated, false, '상한 미만 → truncated=false');
eq(orderCandidates([], [], mid, 1500), { list: [], truncated: false }, '빈 입력');

// ── createSizeMatcher ──
const run = (photos: AlbumPhotoSig[], offers: { id: string; size?: number; creationTime: number }[]) => {
  const m = createSizeMatcher(photos);
  const doneAt: number[] = [];
  offers.forEach((o, i) => { if (m.done) return; m.offer(o); if (m.done) doneAt.push(i); });
  return { res: m.finish(), done: m.done, doneAt: doneAt[0] ?? -1 };
};
// 정상: 3장 — 크기 일치 즉시 확정, 3번째 확정 시점에 done → 남은 후보 안 봄(조기 종료)
{
  const r = run(
    [{ key: 'p1', size: 100 }, { key: 'p2', size: 200 }, { key: 'p3', size: 300 }],
    [{ id: 'x', size: 999, creationTime: 1 }, { id: 'a', size: 100, creationTime: 11 }, { id: 'b', size: 200, creationTime: 22 },
      { id: 'c', size: 300, creationTime: 33 }, { id: 'late', size: 100, creationTime: 44 }],
  );
  eq(r.res, { p1: { status: 'match', assetId: 'a', ts: 11 }, p2: { status: 'match', assetId: 'b', ts: 22 }, p3: { status: 'match', assetId: 'c', ts: 33 } }, '크기 일치 즉시 확정 3장');
  eq([r.done, r.doneAt], [true, 3], '전부 찾으면 done — 4번째 offer에서 조기 종료(뒤의 같은 크기 자산은 안 봄)');
}
// 가로·세로가 달라도 크기만 같으면 확정(하드 필터 제거)
eq(run([{ key: 'p', size: 100, w: 4032, h: 3024 }], [{ id: 'a', size: 100, creationTime: 11 }]).res, { p: { status: 'match', assetId: 'a', ts: 11 } }, '가로·세로 정보와 무관하게 크기로 확정');
// 조회 범위 안에서 같은 크기의 다른 자산이 또 나오면 모호(아직 다른 사진을 찾는 중이라 조회가 계속될 때)
eq(
  run([{ key: 'p', size: 100 }, { key: 'q', size: 500 }], [{ id: 'a', size: 100, creationTime: 11 }, { id: 'b', size: 100, creationTime: 22 }]).res,
  { p: { status: 'ambiguous' }, q: { status: 'nomatch' } },
  '조회한 범위에서 크기 동률 → ambiguous, 못 본 사진은 nomatch',
);
// 같은 자산을 다시 offer해도 모호가 아님(같은 id)
eq(run([{ key: 'p', size: 100 }, { key: 'q', size: 500 }], [{ id: 'a', size: 100, creationTime: 11 }, { id: 'a', size: 100, creationTime: 11 }]).res.p, { status: 'match', assetId: 'a', ts: 11 }, '같은 자산 중복 offer는 모호 아님');
// 크기가 같은 앨범 사진 둘(옛 앨범 중복 담기) → 같은 자산으로 둘 다 확정
eq(
  run([{ key: 'p1', size: 100 }, { key: 'p2', size: 100 }], [{ id: 'a', size: 100, creationTime: 11 }]),
  { res: { p1: { status: 'match', assetId: 'a', ts: 11 }, p2: { status: 'match', assetId: 'a', ts: 11 } }, done: true, doneAt: 0 },
  '같은 크기 앨범 사진 2장 → 같은 원본으로 둘 다 확정',
);
// 경계·널 계열
eq(run([{ key: 'p', size: 100 }], []).res, { p: { status: 'nomatch' } }, '후보 0개 → nomatch');
eq(run([{ key: 'p', size: 0 }], [{ id: 'a', size: 0, creationTime: 11 }]), { res: { p: { status: 'nomatch' } }, done: true, doneAt: -1 }, '사진 크기 0(모름) → 매칭 대상 아님, 처음부터 done');
eq(run([{ key: 'p', size: 100 }], [{ id: 'a', size: undefined, creationTime: 11 }]).res, { p: { status: 'nomatch' } }, '자산 크기 미상(오프로드) → nomatch');
eq(run([{ key: 'p', size: 100 }], [{ id: 'a', size: 100, creationTime: 0 }]).res, { p: { status: 'nomatch' } }, 'creationTime 0 자산은 쓰지 않음');
eq(run([], [{ id: 'a', size: 100, creationTime: 11 }]), { res: {}, done: true, doneAt: -1 }, '사진 0장 → 빈 결과, done');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
