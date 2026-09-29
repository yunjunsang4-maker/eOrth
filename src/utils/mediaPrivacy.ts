// 미디어 비공개(mediaPrivacy)를 뷰어 기준으로 해석하는 순수 함수.
// mediaPrivacy: 미디어 원본 index → 그 사진을 비공개할 메이트 이름 목록.
// viewer=null = 작성자/전체공개 시점(가림 없음).

export interface PrivacyRecord {
  medias?: string[];
  mediaPrivacy?: Record<number, string[]>;
  representativePhoto?: string;
}

// 보이는 미디어의 원본 index 목록. 인덱스는 항상 원본 medias 기준으로 평가한다.
export function visibleMediaIndices(record: PrivacyRecord, viewer: string | null): number[] {
  const medias = record.medias ?? [];
  if (viewer === null) return medias.map((_, i) => i);
  const priv = record.mediaPrivacy ?? {};
  const out: number[] = [];
  for (let i = 0; i < medias.length; i++) {
    const hidden = priv[i]?.includes(viewer) ?? false;
    if (!hidden) out.push(i);
  }
  return out;
}

export function visibleMedias(record: PrivacyRecord, viewer: string | null): string[] {
  const medias = record.medias ?? [];
  return visibleMediaIndices(record, viewer).map((i) => medias[i]);
}

// 대표사진: medias에 속하고 가려졌으면 첫 보이는 사진으로 폴백.
// 외부 대표(크롭본 등 medias에 없는 URI)는 가림 평가가 불가하므로 그대로 유지.
export function visibleRepresentative(record: PrivacyRecord, viewer: string | null): string | undefined {
  const medias = record.medias ?? [];
  const vis = visibleMedias(record, viewer);
  const rep = record.representativePhoto;
  if (!rep) return vis[0];
  if (!medias.includes(rep)) return rep;
  if (vis.includes(rep)) return rep;
  return vis[0];
}

// 블로그·스트립(cut)은 사진/블록 개별이 아니라 '기록 전체' 비공개다(mediaPrivacy[0]=대상 메이트).
// 현재 뷰어가 그 대상에 포함되면 기록 전체를 숨겨야 한다(피드에서 제외). 피드(feed)는 사진 단위
// 비공개라 여기서 숨기지 않는다. viewer=null(작성자/전체공개)은 숨김 없음.
export function isPostHiddenForViewer(
  record: PrivacyRecord & { viewType?: string },
  viewer: string | null
): boolean {
  if (viewer === null) return false;
  if (record.viewType !== 'blog' && record.viewType !== 'cut') return false;
  return record.mediaPrivacy?.[0]?.includes(viewer) ?? false;
}

// 피드/상세에 넘기기 좋게 medias/representativePhoto만 뷰어 기준으로 교체한 얕은 복사본.
// viewer=null이면 원본 객체를 그대로 반환(불필요한 재생성 방지).
// photoTexts(사진별 글)는 medias와 index가 짝인 병렬 배열이라 같은 index로 함께 거른다 —
// 안 거르면 가린 사진의 글이 다음 사진 밑에 붙어 비공개 내용이 샌다(2026-09-29 소셜 탭 점검 5번).
// memo도 같이 본다 — 사진별 글 형식에서 memo는 대표 사진 글의 복사본(NewRecordScreen `photoTexts[repIndex]`)이라,
// 대표 사진이 가려지면 memo로 그 글이 샌다(피드 카드 본문·상세 본문 폴백). 그땐 뷰어 기준 대표 사진의 글로 바꾼다.
export function applyViewer<T extends PrivacyRecord & { photoTexts?: string[]; memo?: string; representativePhotoSource?: string }>(
  record: T,
  viewer: string | null,
): T {
  if (viewer === null) return record;
  const texts = record.photoTexts;
  const medias = record.medias ?? [];
  const visIdx = visibleMediaIndices(record, viewer);
  const nextMedias = visIdx.map((i) => medias[i]);
  const nextRep = visibleRepresentative(record, viewer);
  const out: T = { ...record, medias: nextMedias, representativePhoto: nextRep };
  // mediaPrivacy도 걸러진 medias의 index로 다시 매긴다 — 원본 index 그대로 두면 사본에 applyViewer가
  // 한 번 더 걸릴 때(FriendProfile → TripDetail → PostDetail) 엉뚱한(보여야 할) 사진이 가려졌다.
  // 재매김 후엔 같은 뷰어로 몇 번을 적용해도 결과가 같다(멱등).
  const priv = record.mediaPrivacy;
  if (priv) {
    const nextPriv: Record<number, string[]> = {};
    visIdx.forEach((i, j) => { if (priv[i]) nextPriv[j] = priv[i]; });
    out.mediaPrivacy = nextPriv;
  }
  if (!texts) return out;
  const nextTexts = visIdx.map((i) => texts[i] ?? '');
  out.photoTexts = nextTexts;
  const memo = record.memo;
  if (memo) {
    // memo의 출처 = 원래 대표 사진. 출처를 모르면(대표가 medias 밖) 가린 사진의 글과 같은지로 판정
    const src = record.representativePhotoSource ?? record.representativePhoto;
    const oi = src ? medias.indexOf(src) : -1;
    const leaks = oi >= 0
      ? !visIdx.includes(oi)
      : texts.some((x, i) => x === memo && !visIdx.includes(i)) && !nextTexts.includes(memo);
    if (leaks) out.memo = (nextRep ? nextTexts[nextMedias.indexOf(nextRep)] : undefined) ?? '';
  }
  return out;
}
