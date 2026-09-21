/**
 * 기간 사진 격자(components/record/DateRangePhotoSheet)의 순수 판정 —
 * 날짜 경계 ms, 날짜 키, 상한 안에서의 선택.
 *
 * 화면에서 떼어낸 이유는 이 세 가지가 실제로 사고를 냈던 자리라서다.
 *  - 하루 경계를 00:00~24:00(다음날 자정)으로 잡으면 종료일에 찍은 사진이 통째로 빠진다.
 *    갤러리 조회는 `createdBefore`가 배타적이라 23:59:59.999까지 잡아야 그 날이 들어온다.
 *  - 날짜 키를 `new Date('YYYY-MM-DD')`로 만들면 UTC 자정으로 읽혀 미주에서 하루 밀린다.
 *    → 여기서는 로컬 필드(getFullYear/getMonth/getDate)만 쓴다.
 *  - '전체 선택'이 상한을 넘기면 담기 단계의 slice에서 조용히 잘려
 *    "고른 사진이 왜 안 들어오지"가 된다 → 자를 때는 잘렸다는 사실을 같이 돌려준다.
 */

export interface DayRangeMs {
  /** 시작일 로컬 00:00:00.000 */
  startMs: number;
  /** 종료일 로컬 23:59:59.999 */
  endMs: number;
}

/**
 * 기간 → 갤러리 조회 경계(ms).
 * 시작·종료가 뒤집혀 들어와도 바로잡는다(수정 모드에서 저장된 값이 역순인 글이 실제로 있다).
 * 둘 중 하나라도 유효한 Date가 아니면 null — 호출부가 시트를 안 열면 된다.
 * NaN을 그대로 흘리면 getAssetsAsync가 조건 없이 전체 사진첩을 돌려준다.
 */
export function dayRangeMs(start: Date | null | undefined, end: Date | null | undefined): DayRangeMs | null {
  const a = start instanceof Date ? start.getTime() : NaN;
  const b = end instanceof Date ? end.getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = new Date(Math.min(a, b));
  const hi = new Date(Math.max(a, b));
  lo.setHours(0, 0, 0, 0);
  hi.setHours(23, 59, 59, 999);
  return { startMs: lo.getTime(), endMs: hi.getTime() };
}

/**
 * 촬영시각(ms) → 로컬 'YYYY.MM.DD' 날짜 키. 날짜별 칩의 그룹 키다.
 * 시각이 없거나(갤러리가 안 주는 사진이 있다) 값이 깨졌으면 null → '기타'로 빠지지 않고 칩에서 제외된다.
 */
export function dayKey(ts?: number | null): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 격자에 보일 사진만 남긴다 — 이미 이 기록에 담긴 사진은 뺀다.
 * uri와 assetId 두 기준을 같이 보는 이유:
 *  - 시트로 담은 사진은 사진첩 원본 uri로 되돌아오므로 uri가 맞는다.
 *  - 수정 모드로 연 기록의 사진은 앱 저장소(document dir) 경로라 사진첩 uri와 절대 겹치지 않는다.
 *    그쪽은 기록이 들고 있는 assetId(mediaAssetIds)로만 걸러진다.
 * (시스템 선택기로 담은 사진은 ImagePicker 캐시 복사본이라 어느 쪽으로도 못 맞춘다 — 알려진 한계.)
 */
export function pickablePhotos<T extends { uri: string; id?: string }>(
  photos: T[],
  excludeUris: Iterable<string> = [],
  excludeAssetIds: Iterable<string> = [],
): T[] {
  const uris = new Set(excludeUris);
  const ids = new Set(excludeAssetIds);
  if (uris.size === 0 && ids.size === 0) return photos;
  return photos.filter((p) => !uris.has(p.uri) && !(p.id && ids.has(p.id)));
}

/** 한 장 토글. 상한에 걸려 못 담으면 `atLimit`이 true(호출부가 안내를 띄운다). */
export function toggleWithin(
  selected: string[],
  uri: string,
  max: number,
): { next: string[]; atLimit: boolean } {
  if (selected.includes(uri)) return { next: selected.filter((u) => u !== uri), atLimit: false };
  if (selected.length >= max) return { next: selected, atLimit: true };
  return { next: [...selected, uri], atLimit: false };
}

/**
 * 보이는 사진 전체 선택 — 상한까지만 담고, 못 담은 게 있으면 `truncated`로 알린다.
 * 이미 고른 것의 순서는 유지한다 — 담기는 순서가 곧 기록의 사진 순서다.
 */
export function selectAllWithin(
  selected: string[],
  candidates: string[],
  max: number,
): { next: string[]; truncated: boolean } {
  const next = [...selected];
  const have = new Set(selected);
  let truncated = false;
  for (const uri of candidates) {
    if (have.has(uri)) continue;
    if (next.length >= max) { truncated = true; break; }
    next.push(uri);
    have.add(uri);
  }
  return { next, truncated };
}

/** 보이는 사진 전체 해제 — 다른 날짜에서 고른 것은 남긴다(날짜 칩을 오가며 고르는 흐름). */
export function deselectAllWithin(selected: string[], candidates: string[]): string[] {
  const drop = new Set(candidates);
  return selected.filter((u) => !drop.has(u));
}
