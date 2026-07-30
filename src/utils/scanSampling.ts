// 과거여행 스캔 — 시간 버킷 샘플링 (순수 로직, 테스트 대상)
//
// 왜 필요한가:
//   GPS 좌표는 PHAsset.location(로컬 DB 필드)이라 사실상 공짜인데, expo-media-library의
//   getAssetInfoAsync는 iOS에서 매번 requestContentEditingInput + CIImage(원본 파일 열기)로
//   EXIF까지 파싱한다(끌 수 없음). 그래서 "사진 1장 = 원본 파일 I/O 1회"가 되어
//   스캔 시간이 사진 개수에 비례해 늘어났다(2만 장이면 수십 초~수 분).
//
// 해결:
//   여행은 '며칠 단위 덩어리'라 사진 한 장 한 장의 좌표가 필요 없다.
//   ① 촬영시각(getAssetsAsync가 공짜로 주는 값)으로 사진을 시간 버킷에 나누고
//   ② 버킷마다 대표 몇 장만 좌표를 조회하고
//   ③ 국가가 바뀌는 경계에서만 이분 탐색으로 출입국 시점을 좁힌 뒤
//   ④ 확정된 구간(segment)의 국가를 그 구간 사진 전체에 채운다.
//   → 조회 횟수가 '사진 수'가 아니라 '기간'에 비례한다(3년이면 버킷 ~2,200개 상한).
//
// 부수 효과: GPS가 없는 사진(실내 등)도 구간 국가를 물려받아 여행에 포함된다.
//            (기존에는 좌표 있는 사진만 클러스터에 들어가 실내 사진이 통째로 누락됐다)

/** 버킷 크기 — 12시간. 하루 안의 출입국은 아래 경계 이분 탐색이 잡는다. */
export const BUCKET_MS = 12 * 60 * 60 * 1000;

/** 버킷 하나에서 좌표를 시도해 볼 최대 장수 (GPS 없는 사진이 뽑히면 다음 후보로) */
export const MAX_PROBES_PER_BUCKET = 3;

/** 경계(국가 전환) 이분 탐색 최대 깊이 — 2^6=64분할이면 하루를 20분 단위로 좁힌다 */
export const MAX_BOUNDARY_STEPS = 6;

export interface TimedAsset {
  creationTime: number;
}

/**
 * 촬영시각 오름차순으로 정렬된 자산을 buckerMs 구간으로 자른다.
 * 반환은 원본 배열의 [시작, 끝) 인덱스 구간 목록 — 자산 객체를 복사하지 않는다.
 * 사진이 없는 시간대는 버킷 자체가 생기지 않는다(빈 구간 순회 비용 0).
 */
export function bucketRanges(assets: TimedAsset[], bucketMs: number = BUCKET_MS): { start: number; end: number }[] {
  if (assets.length === 0) return [];
  const out: { start: number; end: number }[] = [];
  let start = 0;
  let bucketStartTime = assets[0].creationTime;
  for (let i = 1; i < assets.length; i++) {
    if (assets[i].creationTime - bucketStartTime >= bucketMs) {
      out.push({ start, end: i });
      start = i;
      bucketStartTime = assets[i].creationTime;
    }
  }
  out.push({ start, end: assets.length });
  return out;
}

/**
 * 버킷 안에서 좌표를 시도할 인덱스 순서.
 * 첫 장 → 마지막 장 → 가운데 순 — 실내에서 시작해 밖으로 나간 날에도 좌표를 얻을 확률을 높인다.
 * 버킷의 장수보다 많이 뽑지 않는다(중복 없음).
 */
export function probeOrder(start: number, end: number, max: number = MAX_PROBES_PER_BUCKET): number[] {
  const n = end - start;
  if (n <= 0) return [];
  const cands = [start, end - 1, start + Math.floor(n / 2)];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const c of cands) {
    if (c < start || c >= end || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** 좌표 조회 결과가 확정된 지점 — index는 원본 자산 배열의 위치 */
export interface ProbePoint {
  index: number;
  code: string | null; // null = 좌표를 못 얻음(미상)
}

/** 국가가 확정된 구간 — [start, end) (원본 자산 배열 인덱스) */
export interface CountrySegment {
  start: number;
  end: number;
  code: string;
}

/**
 * 확정된 탐침 지점들 → 국가 구간 목록.
 *
 * 규칙:
 *  - 좌표 미상(code=null) 지점은 무시한다(앞 구간이 이어진 것으로 본다).
 *  - 같은 국가가 연속되면 하나의 구간으로 합친다.
 *  - 국가가 바뀌는 경계는 두 탐침의 '중간'을 잠정 경계로 둔다.
 *    (실제 출입국 지점은 refineBoundaries가 이분 탐색으로 좁힌 탐침을 넣어주면 정확해진다)
 *  - 첫 탐침 앞·마지막 탐침 뒤는 각각 그 탐침의 국가로 채운다.
 */
export function segmentsFromProbes(probes: ProbePoint[], total: number): CountrySegment[] {
  const known = probes.filter((p) => p.code != null).sort((a, b) => a.index - b.index) as { index: number; code: string }[];
  if (known.length === 0 || total <= 0) return [];

  const segs: CountrySegment[] = [];
  let curCode = known[0].code;
  let curStart = 0; // 첫 탐침 앞쪽도 같은 국가로 채운다

  for (let i = 1; i < known.length; i++) {
    if (known[i].code === curCode) continue;
    // 국가 전환 — 두 탐침 사이의 중간을 경계로 (이분 탐색으로 좁혀졌으면 이미 거의 붙어 있다)
    const boundary = Math.ceil((known[i - 1].index + known[i].index) / 2);
    segs.push({ start: curStart, end: boundary, code: curCode });
    curStart = boundary;
    curCode = known[i].code;
  }
  segs.push({ start: curStart, end: total, code: curCode });
  return segs.filter((s) => s.end > s.start);
}

/** 구간 목록 → 자산 인덱스별 국가코드 (구간 밖은 null) */
export function fillCountries(total: number, segments: CountrySegment[]): (string | null)[] {
  const out: (string | null)[] = new Array(total).fill(null);
  for (const s of segments) {
    const end = Math.min(s.end, total);
    for (let i = Math.max(0, s.start); i < end; i++) out[i] = s.code;
  }
  return out;
}

/**
 * 이분 탐색으로 경계를 좁힐 때 다음에 조사할 인덱스.
 * 두 탐침(lo: 국가 A 확정, hi: 국가 B 확정) 사이의 중간을 돌려준다.
 * 사이에 조사할 자산이 없으면 null(경계 확정).
 */
export function nextBoundaryProbe(lo: number, hi: number): number | null {
  if (hi - lo <= 1) return null;
  return lo + Math.floor((hi - lo) / 2);
}

/**
 * 탐침 예산 산정 — 이 스캔에서 좌표 조회를 몇 번 할지 미리 어림잡는다(진행률 표시용).
 * 버킷당 1회를 기본으로 보고, 경계 탐색분을 여유로 얹는다.
 */
export function estimateProbeCount(bucketCount: number): number {
  return bucketCount + Math.ceil(bucketCount * 0.15) + 1;
}

/** 지오코딩 레이트리밋 간격(ms) — 호출 사이에 이만큼은 벌린다 */
export const GEOCODE_MIN_GAP_MS = 250;

/**
 * 지오코딩 호출 전에 기다려야 할 시간(ms). 마지막 호출로부터 간격이 이미 벌어졌으면 0.
 *
 * 왜 필요한가: 기존 코드는 폴백 1회마다 무조건 250ms를 잤다. 실측(1.4만 장)에서
 * 폴백은 30초 동안 7회뿐이라 이미 충분히 벌어져 있었는데도 7×250=1.75초를 그냥
 * 버렸다(구간 총 2.0초 중). 실제 네트워크 왕복은 회당 41ms였다.
 * 경과 시간을 기준으로 바꾸면 연속 호출은 여전히 막고, 드문 호출은 안 기다린다.
 */
export function geocodeWaitMs(
  lastCallAt: number,
  now: number,
  minGapMs: number = GEOCODE_MIN_GAP_MS
): number {
  if (lastCallAt <= 0) return 0; // 첫 호출은 기다릴 이유가 없다
  const elapsed = now - lastCallAt;
  if (elapsed >= minGapMs) return 0;
  // 시계가 뒤로 갔거나(수동 변경) 음수 경과면 간격 전체를 기다린다 — 과소 대기보다 안전
  return elapsed < 0 ? minGapMs : minGapMs - elapsed;
}

// -- 중복 방지 --
// 과거여행 불러오기는 원래 온보딩 1회용이라 재실행을 전제하지 않았다. 앱 내에서 다시
// 스캔할 수 있게 되면서, 이미 가져온 사진이 또 여행 카드로 만들어지는 것을 막아야 한다.
// 가져올 때 기록에 남긴 mediaAssetIds(복사본 uri -> 갤러리 자산 id)가 그 근거다.

/** 기록 목록에서 '이미 가져온 갤러리 자산 id' 집합을 모은다 */
export function collectImportedAssetIds(
  records: { mediaAssetIds?: Record<string, string> }[]
): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (!r.mediaAssetIds) continue;
    for (const id of Object.values(r.mediaAssetIds)) {
      if (id) out.add(id);
    }
  }
  return out;
}

/**
 * 스캔 대상에서 이미 가져온 자산을 제외한다.
 * 재스캔이 빨라지고(조회 대상 감소), 이미 만들어진 여행이 다시 후보로 뜨지 않는다.
 * 일부만 가져온 여행은 남은 사진으로 다시 잡히는데, 이는 '더 담기'로 의도된 동작이다
 * (호출부가 기존 카드와 겹치는지 별도로 표시한다).
 */
export function excludeImported<T extends { id: string }>(assets: T[], importedIds: Set<string>): T[] {
  if (importedIds.size === 0) return assets;
  return assets.filter((a) => !importedIds.has(a.id));
}

/** 'YYYY.MM.DD' -> ms (비교용). 형식이 아니면 null */
function parseYmd(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * 스캔된 여행이 이미 가져온 기록과 겹치는지 - 같은 국가 + 기간 겹침.
 * 자산 id로 못 거른 경우(다른 기기에서 가져옴, 사진 삭제 후 재추가 등)의 2차 방어선으로,
 * 호출부는 이 여행을 기본 선택에서 빼고 '이미 가져옴' 표시를 한다.
 */
export function overlapsImportedTrip(
  trip: { countryName: string; startDate: string; endDate: string },
  imported: { countryName?: string; startDate?: string; endDate?: string }[]
): boolean {
  const s = parseYmd(trip.startDate);
  const e = parseYmd(trip.endDate);
  if (s == null || e == null) return false;
  return imported.some((r) => {
    if (!r.countryName || r.countryName !== trip.countryName) return false;
    const rs = parseYmd(r.startDate);
    const re = parseYmd(r.endDate) ?? rs;
    if (rs == null || re == null) return false;
    return s <= re && e >= rs; // 기간이 하루라도 겹치면 같은 여행으로 본다
  });
}
