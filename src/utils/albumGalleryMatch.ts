/**
 * albumGalleryMatch.ts — '날짜 다시 찾기'의 사진첩 매칭 판단(순수 함수)
 *
 * 옛 앨범(2026-11 이전) 사진은 copyTripOriginals가 MediaLibrary 원본 localUri를 copyAsync로 **바이트 그대로** 복사한 것이라
 * 원본과 파일 크기가 같다. 이후 앨범은 장변 2048 압축본으로 저장돼 크기가 달라 이 매칭은 옛 앨범 대상이다
 * (새 앨범은 생성 때 mediaTimes·mediaAssetIds를 기록하므로 보통 여기까지 오지 않는다). 그래서 앨범 기간의 기기 사진첩 자산 중 파일 크기(바이트)가 같은 자산의 creationTime을 쓴다
 * — 파일 EXIF에 기대지 않는다(albumReanalyze의 1.5단계).
 * 네이티브 호출(조회·크기 읽기)은 albumReanalyze가 하고, 여기는 어떤 순서로 볼지·무엇을 고를지만 정한다.
 *
 * ponytail: 크기 일치 = 같은 파일로 즉시 확정한다. 서로 다른 수 MB 원본의 바이트 크기가 우연히 같을 일은 사실상 없다는
 *   가정이다(기간 내 수백~천여 장 기준). 틀리면 틀린 날짜가 저장된다 — 오매칭 신고가 오면 가로·세로·촬영시각 근접까지 함께 볼 것.
 */

/** 앨범 사진 하나의 서명 — key는 사진첩 사진의 로컬 경로 키, size는 바이트, w·h는 못 얻었으면 없음 */
export interface AlbumPhotoSig { key: string; size: number; w?: number; h?: number }
/** 기기 사진첩 자산 — w·h는 MediaLibrary 메타(0이면 모름), uri는 getAssetsAsync가 준 값(안드로이드는 file://, iOS는 ph://) */
export interface GalleryCandidate { id: string; w: number; h: number; creationTime: number; uri?: string }
export type GalleryMatch =
  | { status: 'match'; assetId: string; ts: number }
  | { status: 'nomatch' | 'ambiguous' };

const DAY_RE = /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})/;
// AlbumCreateScreen.parseAlbumDate와 같은 규칙 — 'YYYY.MM.DD'/'YYYY-MM-DD'를 로컬 자정으로(new Date(문자열)은 UTC 자정이라 하루 밀림)
const parseDay = (s?: string): [number, number, number] | null => {
  const m = s?.match(DAY_RE);
  return m ? [+m[1], +m[2] - 1, +m[3]] : null;
};

/**
 * 앨범 기간 → 사진첩 조회 구간 [after, before)(ms). 앞뒤 padDays일 여유 — AlbumCreateScreen은 [시작 00:00, 끝 23:59:59]
 * 로컬 구간의 사진만 보여줬으므로 하루면 시간대 차이까지 덮는다. 한쪽만 있으면 그 하루로, 거꾸로면 뒤집는다.
 * 둘 다 없거나 못 읽으면 null(이 단계를 건너뛴다).
 */
export function albumDateWindow(startDate?: string, endDate?: string, padDays = 1): { after: number; before: number } | null {
  const s = parseDay(startDate) ?? parseDay(endDate);
  const e = parseDay(endDate) ?? s;
  if (!s || !e) return null;
  // new Date(y, m, d±n)은 월·연 넘김과 서머타임을 로컬 달력 기준으로 처리한다
  const a = new Date(s[0], s[1], s[2]).getTime();
  const b = new Date(e[0], e[1], e[2]).getTime();
  const [lo, hi] = a <= b ? [s, e] : [e, s];
  return {
    after: new Date(lo[0], lo[1], lo[2] - padDays).getTime(),
    before: new Date(hi[0], hi[1], hi[2] + 1 + padDays).getTime(),
  };
}

const known = (n?: number) => typeof n === 'number' && n > 0;
/** 가로·세로가 확실히 같은가(순서 무시 — 회전). 한쪽이라도 모르면 false. 조회 순서에만 쓴다(하드 필터 아님 —
 *  RN getSize는 HEIF 0번 이미지를 읽는데 0번이 주 이미지라는 보장이 없어, 걸러내면 진짜 원본을 놓칠 수 있다) */
export function sameDims(p: { w?: number; h?: number }, c: { w: number; h: number }): boolean {
  if (!known(p.w) || !known(p.h) || !known(c.w) || !known(c.h)) return false;
  return (p.w === c.w && p.h === c.h) || (p.w === c.h && p.h === c.w);
}

/**
 * 파일 크기를 읽어 볼 순서 — ① 어떤 사진과 가로·세로가 같은 자산 ② 나머지, 각 안에서 기간 중앙(mid)에 가까운 순.
 * creationTime이 없는 자산은 뺀다(날짜를 줄 수 없음). limit장까지만(크기 읽기는 장당 파일 열기라 비싸다).
 */
export function orderCandidates(
  photos: AlbumPhotoSig[], cands: GalleryCandidate[], mid: number, limit: number,
): { list: GalleryCandidate[]; truncated: boolean } {
  const scored = cands
    .filter((c) => known(c.creationTime))
    .map((c) => ({ c, tier: photos.some((p) => sameDims(p, c)) ? 0 : 1, dist: Math.abs(c.creationTime - mid) }));
  scored.sort((x, y) => x.tier - y.tier || x.dist - y.dist);
  return { list: scored.slice(0, limit).map((s) => s.c), truncated: scored.length > limit };
}

/**
 * 크기 일치 즉시 확정 매처. 후보를 하나씩 offer하고 done이면 조회를 멈춘다.
 * - 크기가 같은 앨범 사진이 여럿이면(옛 앨범에 같은 사진을 두 번 담은 경우 — 바이트가 같으니 같은 원본) 같은 자산으로 모두 확정.
 * - 이미 확정된 사진과 크기가 같은 **다른** 자산이 조회 범위 안에서 또 나오면 모호로 뒤집는다(틀린 날짜보다 포기).
 *   조기 종료 뒤의 자산은 보지 않는다 — 모호 판정은 이미 조회한 범위에서만.
 */
export function createSizeMatcher(photos: AlbumPhotoSig[]) {
  const result: Record<string, GalleryMatch> = {};
  const bySize = new Map<number, string[]>();
  for (const p of photos) if (known(p.size)) bySize.set(p.size, [...(bySize.get(p.size) ?? []), p.key]);
  let open = [...bySize.values()].reduce((n, ks) => n + ks.length, 0);
  return {
    offer(c: { id: string; size?: number; creationTime: number }) {
      if (!known(c.size) || !known(c.creationTime)) return;
      for (const k of bySize.get(c.size!) ?? []) {
        const r = result[k];
        if (!r) { result[k] = { status: 'match', assetId: c.id, ts: c.creationTime }; open--; }
        else if (r.status === 'match' && r.assetId !== c.id) result[k] = { status: 'ambiguous' };
      }
    },
    get done() { return open === 0; },
    finish(): Record<string, GalleryMatch> {
      const out: Record<string, GalleryMatch> = {};
      for (const p of photos) out[p.key] = result[p.key] ?? { status: 'nomatch' };
      return out;
    },
  };
}
