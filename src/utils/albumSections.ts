/**
 * albumSections.ts — 사진첩 섹션(세분화) 파티션 모델
 *
 * 섹션은 medias 배열의 '연속 구간 분할'로 표현한다: { id, title, count }[].
 * URI를 직접 참조하지 않으므로 서버 업로드(로컬 URI → 공개 URL 치환, 순서 보존)와
 * 재설치 복원에 안전하다. medias 총합과 counts 합이 어긋난 저장본은 normalize로 보정.
 */

export interface AlbumSection {
  id: string;
  title: string;
  count: number;
}

export interface SectionSlice extends AlbumSection {
  start: number; // medias 시작 인덱스(포함)
  end: number;   // 끝 인덱스(미포함)
}

export const newSectionId = () =>
  `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** counts 합이 medias 길이와 다르면 마지막 섹션이 차이를 흡수(음수는 0으로) */
export function normalizeSections(sections: AlbumSection[], mediasLen: number): AlbumSection[] {
  if (sections.length === 0) return sections;
  const sum = sections.reduce((a, s) => a + Math.max(0, s.count), 0);
  const fixed = sections.map((s) => ({ ...s, count: Math.max(0, s.count) }));
  const diff = mediasLen - sum;
  if (diff !== 0) {
    const last = fixed[fixed.length - 1];
    fixed[fixed.length - 1] = { ...last, count: Math.max(0, last.count + diff) };
  }
  return fixed;
}

/** 섹션별 medias 구간 계산 */
export function sectionSlices(sections: AlbumSection[], mediasLen: number): SectionSlice[] {
  const norm = normalizeSections(sections, mediasLen);
  const out: SectionSlice[] = [];
  let cursor = 0;
  for (const s of norm) {
    out.push({ ...s, start: cursor, end: cursor + s.count });
    cursor += s.count;
  }
  return out;
}

/** 전역 인덱스가 속한 섹션 인덱스 (-1 = 없음) */
export function sectionIndexOf(sections: AlbumSection[], mediasLen: number, globalIndex: number): number {
  const slices = sectionSlices(sections, mediasLen);
  return slices.findIndex((s) => globalIndex >= s.start && globalIndex < s.end);
}

/** 특정 섹션 끝에 사진 추가 (sectionIndex가 범위 밖이면 맨 끝 섹션) */
export function addPhotosToSection(
  medias: string[],
  sections: AlbumSection[],
  sectionIndex: number,
  uris: string[],
): { medias: string[]; sections: AlbumSection[] } {
  const slices = sectionSlices(sections, medias.length);
  const idx = Math.min(Math.max(sectionIndex, 0), slices.length - 1);
  const at = slices[idx].end;
  const nextMedias = [...medias.slice(0, at), ...uris, ...medias.slice(at)];
  const nextSections = slices.map((s, i) =>
    i === idx ? { id: s.id, title: s.title, count: s.count + uris.length } : { id: s.id, title: s.title, count: s.count },
  );
  return { medias: nextMedias, sections: nextSections };
}

/** 전역 인덱스의 사진 제거 (소속 섹션 count 감소, 빈 섹션은 유지) */
export function removePhotoAt(
  medias: string[],
  sections: AlbumSection[],
  globalIndex: number,
): { medias: string[]; sections: AlbumSection[] } {
  if (globalIndex < 0 || globalIndex >= medias.length) return { medias, sections };
  const owner = sectionIndexOf(sections, medias.length, globalIndex);
  const nextMedias = medias.filter((_, i) => i !== globalIndex);
  const norm = normalizeSections(sections, medias.length);
  const nextSections = norm.map((s, i) => (i === owner ? { ...s, count: s.count - 1 } : s));
  return { medias: nextMedias, sections: nextSections };
}

/** 사진을 다른 섹션 끝으로 이동 */
export function movePhotoToSection(
  medias: string[],
  sections: AlbumSection[],
  globalIndex: number,
  targetSection: number,
): { medias: string[]; sections: AlbumSection[] } {
  if (globalIndex < 0 || globalIndex >= medias.length) return { medias, sections };
  const uri = medias[globalIndex];
  const removed = removePhotoAt(medias, sections, globalIndex);
  return addPhotosToSection(removed.medias, removed.sections, targetSection, [uri]);
}

/** 섹션 삭제 — 사진은 이전 섹션(첫 섹션이면 다음 섹션)에 합쳐진다. 마지막 하나면 null(평면 복귀). */
export function deleteSection(
  sections: AlbumSection[],
  mediasLen: number,
  sectionIndex: number,
): AlbumSection[] | null {
  const norm = normalizeSections(sections, mediasLen);
  if (norm.length <= 1) return null;
  const absorbInto = sectionIndex === 0 ? 1 : sectionIndex - 1;
  return norm
    .map((s, i) => (i === absorbInto ? { ...s, count: s.count + norm[sectionIndex].count } : s))
    .filter((_, i) => i !== sectionIndex);
}

/**
 * 촬영일 기준 그룹핑 — 날짜순(오름차순) 정렬 후 같은 날(로컬 기준)끼리 묶는다.
 * time이 없는 사진은 맨 뒤 '기타'(key=null) 그룹 하나로 모은다.
 * 호출부는 그룹 순서대로 medias를 재배열하고 제목(n일차 등)을 붙여 섹션을 만든다.
 */
export function groupUrisByDay(
  photos: { uri: string; time?: number }[],
): { key: string | null; uris: string[] }[] {
  const dayKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const dated = photos.filter((p) => typeof p.time === 'number' && p.time! > 0)
    .sort((a, b) => a.time! - b.time!);
  const undated = photos.filter((p) => !(typeof p.time === 'number' && p.time! > 0));
  const out: { key: string | null; uris: string[] }[] = [];
  for (const p of dated) {
    const key = dayKey(p.time!);
    const last = out[out.length - 1];
    if (last && last.key === key) last.uris.push(p.uri);
    else out.push({ key, uris: [p.uri] });
  }
  if (undated.length > 0) out.push({ key: null, uris: undated.map((p) => p.uri) });
  return out;
}

/** 한 섹션(또는 평면 전체) 안에서 사진 순서 변경 — 섹션 counts는 변하지 않는다 */
export function reorderWithinRange(
  medias: string[],
  start: number,
  localFrom: number,
  localTo: number,
): string[] {
  const from = start + localFrom;
  const to = start + localTo;
  if (from === to || from < 0 || from >= medias.length || to < 0 || to >= medias.length) return medias;
  const next = [...medias];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 섹션 자체의 순서 이동 — medias의 해당 구간 블록도 함께 이동한다 */
export function moveSection(
  medias: string[],
  sections: AlbumSection[],
  from: number,
  to: number,
): { medias: string[]; sections: AlbumSection[] } {
  const slices = sectionSlices(sections, medias.length);
  if (from === to || from < 0 || from >= slices.length || to < 0 || to >= slices.length) {
    return { medias, sections: normalizeSections(sections, medias.length) };
  }
  const blocks = slices.map((sl) => ({
    section: { id: sl.id, title: sl.title, count: sl.count },
    uris: medias.slice(sl.start, sl.end),
  }));
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return {
    medias: blocks.flatMap((b) => b.uris),
    sections: blocks.map((b) => b.section),
  };
}

/** 여러 사진 제거 (전역 인덱스 배열) — 각 소속 섹션 count 감소. sections가 null이면 평면 */
export function removePhotosAt(
  medias: string[],
  sections: AlbumSection[] | null,
  indexes: number[],
): { medias: string[]; sections: AlbumSection[] | null } {
  const rm = new Set(indexes.filter((i) => i >= 0 && i < medias.length));
  if (rm.size === 0) return { medias, sections };
  const nextMedias = medias.filter((_, i) => !rm.has(i));
  if (!sections) return { medias: nextMedias, sections: null };
  const slices = sectionSlices(sections, medias.length);
  const nextSections = slices.map((sl) => {
    let removed = 0;
    rm.forEach((i) => { if (i >= sl.start && i < sl.end) removed += 1; });
    return { id: sl.id, title: sl.title, count: sl.count - removed };
  });
  return { medias: nextMedias, sections: nextSections };
}

/** 여러 사진을 대상 섹션 끝으로 이동 (상대 순서 유지) */
export function movePhotosToSection(
  medias: string[],
  sections: AlbumSection[],
  indexes: number[],
  targetSection: number,
): { medias: string[]; sections: AlbumSection[] } {
  const pick = new Set(indexes.filter((i) => i >= 0 && i < medias.length));
  if (pick.size === 0) return { medias, sections: normalizeSections(sections, medias.length) };
  const movedUris = medias.filter((_, i) => pick.has(i)); // 원본 순서 유지
  const removed = removePhotosAt(medias, sections, [...pick]);
  return addPhotosToSection(removed.medias, removed.sections as AlbumSection[], targetSection, movedUris);
}
