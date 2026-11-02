/**
 * albumSections.ts — 사진첩(앨범) 순수 로직
 *
 * 사진첩은 촬영시각 기반 세로 타임라인으로 보여 준다(2026-11). 타임라인은 저장하지 않고
 * 렌더 시점에 medias + mediaTimes(uri → 촬영시각 ms)로 유도한다 — 저장 순서도, 옛 기록·서버에
 * 남아 있을 수 있는 albumSections(수동 섹션, 폐지) 필드도 건드리지 않고 무시한다.
 * 파일 이름은 import 경로 호환 때문에 그대로 둔다.
 */

export interface AlbumMoment {
  startMs: number;   // 이 순간 첫 사진의 촬영시각
  indexes: number[]; // medias 전역 인덱스(시각 오름차순)
}

export interface AlbumDay {
  key: string;       // 기기 로컬 날짜 'YYYY.MM.DD'
  startMs: number;   // 그날 첫 사진의 촬영시각
  dayN: number;      // 앨범 첫 날로부터 달력 일수 차 + 1 (사진 없는 날은 번호가 건너뛴다)
  moments: AlbumMoment[];
}

export interface AlbumTimeline {
  days: AlbumDay[];
  undated: number[]; // 촬영시각 없는 사진(medias 순서)
  order: number[];   // 표시 순서(날짜순 전부 → undated)의 전역 인덱스 — 뷰어 스와이프 순서
}

// ponytail: 하루 안에서 앞 사진과 2시간 이상 벌어지면 새 '순간'으로 본다는 단순 휴리스틱.
// 장소 이동(GPS)이나 사진 밀도를 보지 않는다 — 부정확하다는 피드백이 오면 그때 군집화로 바꾼다.
export const MOMENT_GAP_MS = 2 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function buildAlbumTimeline(medias: string[], mediaTimes?: Record<string, number>): AlbumTimeline {
  const timeOf = (i: number) => {
    const ts = mediaTimes?.[medias[i]];
    return typeof ts === 'number' && ts > 0 ? ts : 0;
  };
  const all = medias.map((_, i) => i);
  // 동률은 medias 순서 유지 — 엔진의 정렬 안정성에 기대지 않고 인덱스로 직접 끊는다
  const dated = all.filter((i) => timeOf(i) > 0).sort((a, b) => timeOf(a) - timeOf(b) || a - b);
  const undated = all.filter((i) => timeOf(i) === 0);

  const days: AlbumDay[] = [];
  let firstMidnight = 0;
  for (const i of dated) {
    const ts = timeOf(i);
    const d = new Date(ts);
    const key = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (days.length === 0) firstMidnight = midnight;
      // round: 서머타임 전환일은 하루가 23·25시간이라 나눗셈이 정수로 안 떨어진다
      day = { key, startMs: ts, dayN: Math.round((midnight - firstMidnight) / 86400000) + 1, moments: [] };
      days.push(day);
    }
    const moment = day.moments[day.moments.length - 1];
    const prev = moment ? timeOf(moment.indexes[moment.indexes.length - 1]) : 0;
    if (!moment || ts - prev >= MOMENT_GAP_MS) day.moments.push({ startMs: ts, indexes: [i] });
    else moment.indexes.push(i);
  }
  return { days, undated, order: [...dated, ...undated] };
}

/** 여러 사진 제거 (전역 인덱스 배열) — 범위 밖 인덱스는 무시 */
export function removePhotosAt(medias: string[], indexes: number[]): string[] {
  const rm = new Set(indexes);
  return medias.filter((_, i) => !rm.has(i));
}

/**
 * uri 키 맵(mediaTimes·mediaAssetIds)의 키를 from[i] → to[i] 대응으로 옮긴다(값 보존).
 * 서버 발행 사본 전용 — 작성 기기의 키는 로컬 file:// 경로라 그대로 올리면 다른 기기·재설치 후엔
 * medias(원격 URL)와 키가 안 맞아 타임라인·사진 AI가 촬영시각을 잃는다.
 * - 이미 http(s)인 키는 그대로 둔다(다른 기기에서 받아 온 기록을 다시 발행하는 경우).
 * - 대응이 없는 로컬 키는 버린다 — 삭제된 사진의 고아 항목이라 서버에 실을 이유가 없다.
 */
export function remapUriKeys<T>(
  map: Record<string, T> | undefined,
  from: string[],
  to: string[],
): Record<string, T> | undefined {
  if (!map) return map;
  const pair = new Map<string, string>();
  from.forEach((u, i) => { if (to[i]) pair.set(u, to[i]); });
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    if (/^https?:\/\//.test(k)) out[k] = v;
    else if (pair.has(k)) out[pair.get(k)!] = v;
  }
  return out;
}

/**
 * 화면·재분석이 함께 쓰는 '실효' 촬영시각 맵 — mediaTimes + 업로드 캐시 역매핑.
 * 작성 기기에서도 medias가 서버 URL로 통째 바뀌는 경로가 있다(mergeMyRecords.pickUriList: 서버본과 장수가
 * 다를 때). 그때 mediaTimes 키는 로컬 file:// 경로로 남아 하나도 안 맞는다. uploadedMediaUrls(로컬 → 업로드 URL)
 * 쌍으로 mediaTimes[로컬]을 원격 키로도 보여 준다.
 * - 원격 키에 유효한 시각이 이미 있으면 덮지 않는다(0·음수 같은 무효 값만 채운다).
 * - 더할 것이 없으면 입력 객체를 그대로 돌려준다 — useMemo 의존값이 매 렌더 바뀌지 않게.
 * 내 타임라인(TripRecordRenderer)·버튼 노출(AlbumTimeline undated)·재분석 대상(albumReanalyze)이 모두
 * 이 함수를 거쳐야 셋이 어긋나지 않는다.
 */
export function effectiveMediaTimes(rec: {
  mediaTimes?: Record<string, number>;
  uploadedMediaUrls?: Record<string, string>;
}): Record<string, number> | undefined {
  const t = rec.mediaTimes;
  const up = rec.uploadedMediaUrls;
  if (!t || !up) return t;
  const valid = (v: unknown) => typeof v === 'number' && v > 0;
  let out: Record<string, number> | undefined;
  for (const [local, remote] of Object.entries(up)) {
    if (!remote || !valid(t[local]) || valid((out ?? t)[remote])) continue;
    out ??= { ...t };
    out[remote] = t[local];
  }
  return out ?? t;
}

/**
 * expo-image-picker asset.exif → 촬영시각(ms). 없거나 못 읽으면 undefined(타임라인 '날짜 미상'으로 간다).
 * 두 플랫폼 모두 최상위 키로 온다: iOS는 picker가 {Exif}를 최상위로 펼치고 {TIFF}도 병합한다
 * (expo-image-picker ImageUtils.swift readExifFrom), Android는 DateTime 3종 태그만 최상위로 준다.
 * 값은 'YYYY:MM:DD HH:MM:SS' 벽시계 시각이다.
 * - OffsetTimeOriginal(없으면 OffsetTime) '+09:00'이 있으면 그 오프셋으로 절대시각을 낸다 —
 *   사진첩 생성 때 담는 MediaLibrary creationTime(절대시각)과 기준을 맞추기 위해서다.
 *   iOS는 이 태그가 있으면 함께 온다. Android picker는 OFFSET 태그를 주지 않는다.
 * - 오프셋이 없으면 기기 로컬 시각으로 조립한다(new Date(문자열)은 UTC·엔진별 해석이라 쓰지 않는다).
 *   ponytail: 시차 있는 여행지 사진을 오프셋 없이 읽으면 시차만큼 어긋난다 — Android에서 고치려면
 *   MediaLibrary assetId로 creationTime을 다시 조회해야 한다.
 */
export function exifTakenAt(exif: Record<string, any> | null | undefined): number | undefined {
  if (!exif) return undefined;
  // 빈·공백 문자열은 없는 값 — 일부 카메라·편집기가 DateTimeOriginal을 공백으로 채워, ??만으로는 DateTime 폴백이 막힌다
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const raw = str(exif.DateTimeOriginal) ?? str(exif.DateTime);
  const m = typeof raw === 'string' ? raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/) : null;
  if (!m) return undefined;
  const [y, mo, d, h, mi, sec] = m.slice(1).map(Number);
  const off = String(str(exif.OffsetTimeOriginal) ?? str(exif.OffsetTime) ?? '').match(/^([+-])(\d{2}):(\d{2})$/);
  const ts = off
    ? Date.UTC(y, mo - 1, d, h, mi, sec) - (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) * 60000
    : new Date(y, mo - 1, d, h, mi, sec).getTime();
  // '0000:00:00 00:00:00' 같은 빈 값은 1899년대 음수 시각이 된다 — 무효로 본다
  return ts > 0 ? ts : undefined;
}
