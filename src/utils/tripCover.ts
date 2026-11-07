/**
 * 여행기록카드 커버(썸네일) 사진 고르기 — 순수 함수(React·RN 의존 없음, tripCover.verify.ts가 node로 검증).
 *
 * 왜 생겼나 — 카드 커버가 화면마다 복붙된 한 줄
 *   `group.coverUri ?? coverRec.representativePhoto ?? coverRec.medias[0]`
 * 로만 정해져서, 사진이 있는데도 기본 이모지(🗼)+보라 글로우 '목업' 카드로 떨어졌다(2026-11-07).
 *   A. 대표 기록이 스냅·네컷 — 사진이 medias가 아니라 snapBackUri/snapFrontUri/cutPhoto.previewUri에 있다
 *   B. 대표 기록(coverRecordId 또는 첫 기록)엔 사진이 없고 같은 카드의 다른 기록엔 있다
 *      (예: 불러오기 표지 사진 확보가 실패한 카드에 나중에 사진 있는 기록을 더함)
 * 프로필 카드·메인 지역 태그 카드·여행 상세(히어로·썸네일 변경 시트)가 모두 이 함수를 써야
 * 카드와 상세가 같은 사진을 보여 준다. 표시 계산만 한다 — group.coverUri에 값을 저장하지 않는다.
 */

/** 커버 판정에 필요한 필드만 — TravelRecord·perCountryData 항목·서버 게시물 모두 구조적으로 맞는다 */
export type CoverSource = {
  representativePhoto?: string;
  medias?: string[];
  snapBackUri?: string;
  snapFrontUri?: string;
  cutPhoto?: { previewUri?: string };
};

/**
 * 기록 하나의 커버 사진. 빈 문자열은 없는 것으로 친다.
 * 순서: 대표 사진(크롭본) → medias 첫 값 → 스냅 후면 → 스냅 전면 → 네컷 합성본.
 * medias가 있는 기록은 예전 `representativePhoto ?? medias[0]`과 결과가 같다.
 */
export function recordCoverUri(r?: CoverSource | null): string | undefined {
  if (!r) return undefined;
  const medias = (r.medias ?? []).filter(Boolean);
  return r.representativePhoto
    || medias[0]
    || r.snapBackUri
    || r.snapFrontUri
    || r.cutPhoto?.previewUri
    || undefined;
}

/**
 * 여행 카드의 커버 사진. 카드 오버라이드(group.coverUri) → 대표 기록 → 멤버 순서대로 사진 있는 첫 기록.
 * members는 화면이 카드에 실제로 보여 주는 기록 목록(프로필은 보관 제외)을 그대로 넘긴다.
 */
export function tripCoverUri(
  groupCoverUri: string | null | undefined,
  coverRec: CoverSource | null | undefined,
  members: readonly CoverSource[],
): string | undefined {
  if (groupCoverUri) return groupCoverUri;
  const own = recordCoverUri(coverRec);
  if (own) return own;
  for (const m of members) {
    const u = recordCoverUri(m);
    if (u) return u;
  }
  return undefined;
}

/** 썸네일 변경 시트 판정용 — 대표 사진 크롭본의 원본 필드까지(TravelRecord가 구조적으로 맞는다) */
export type ThumbSource = CoverSource & { representativePhotoSource?: string };

/**
 * 여행 상세 '썸네일 변경' 시트(TripDetailScreen)의 선택 판정. 가로 줄 = 멤버 medias 전부(화면 thumbCandidates와 같다).
 * - cardUri: 지금 카드에 보이는 사진(tripCoverUri)
 * - matched: 그 사진의 원본이 가로 줄에 있으면 그 값. 오버라이드 → (대표 사진이 있으면) 원본·대표 사진,
 *   (없으면) medias 첫 값 — recordCoverUri와 같은 규칙.
 *   줄에 없으면(스냅·네컷·medias 밖 대표 사진·줄 밖 오버라이드) undefined. 첫 장 같은 폴백을 '현재'로 치면
 *   그 사진을 눌러도 '그대로'로 판정돼 고를 수 없었다(2026-11-07 QA M1).
 * - highlight: 줄에서 선택 표시할 사진(고른 것 → matched). 없으면 표시 없음.
 * - unchanged: '확인'이 아무것도 안 할 상태 — 열 때 그대로(sel null)이거나 원본을 조정 없이 다시 고름.
 *   지금 카드가 크롭본이면 원본을 조정 없이 다시 적용하는 순간 크롭이 사라지므로 적용하지 않는다(a6dff96).
 * - preview: 미리보기 사진 — 그대로면 카드 사진(크롭본 포함), 아니면 고른 사진.
 */
export function thumbSheetPick<T>(
  groupCoverUri: string | null | undefined,
  coverRec: ThumbSource | null | undefined,
  members: readonly ThumbSource[],
  sel: { uri: string; t: T | null } | null,
): { cardUri?: string; matched?: string; highlight?: string; unchanged: boolean; preview?: string } {
  const candidates = members.flatMap((m) => m.medias ?? []);
  const cardUri = tripCoverUri(groupCoverUri, coverRec, members);
  // 카드 사진을 실제로 내준 기록 — 대표 기록에 사진이 없으면 tripCoverUri처럼 멤버 중 사진 있는 첫 기록
  const src = recordCoverUri(coverRec) ? coverRec : members.find((m) => !!recordCoverUri(m));
  const medias = (src?.medias ?? []).filter(Boolean);
  const order = groupCoverUri
    ? [groupCoverUri]
    : src?.representativePhoto
      ? [src.representativePhotoSource, src.representativePhoto]
      : [medias[0]];
  const matched = order.find((u): u is string => !!u && candidates.includes(u));
  const highlight = sel?.uri ?? matched;
  const unchanged = !sel?.t && (!sel || sel.uri === matched);
  return { cardUri, matched, highlight, unchanged, preview: unchanged ? cardUri ?? highlight : highlight };
}
