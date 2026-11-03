/**
 * exifFromBytes.ts — 파일 앞부분 바이트에서 EXIF 촬영시각(ms)을 꺼내는 순수 함수
 *
 * 쓰임: 촬영시각(mediaTimes)이 없는 옛 사진첩 사진의 '날짜 다시 찾기'(utils/albumReanalyze).
 * 옛 앨범(2026-11 이전) 사진은 copyTripOriginals가 원본을 그대로 복사한 것이라 EXIF가 살아 있다.
 * 이후 앨범은 장변 2048 JPEG 압축본으로 저장돼 EXIF가 없다 — 이 경로는 옛 앨범 대상이다.
 *
 * 방식: 'Exif\0\0' 마커를 찾아 그 뒤 TIFF 헤더(II*\0 / MM\0*)부터 읽는다.
 *   IFD0 → ExifIFD 포인터(0x8769) → DateTimeOriginal(0x9003)·OffsetTimeOriginal(0x9011)·OffsetTime(0x9010),
 *   DateTimeOriginal이 없으면 IFD0 DateTime(0x0132).
 * 마커 스캔이라 JPEG APP1과 HEIC Exif 항목(앞에 4바이트 오프셋 + 'Exif\0\0' + TIFF)을 함께 다룬다.
 * HEIC는 Exif 항목이 파일 뒤쪽에 있을 수 있어 findHeifExifRange(meta/iinf/iloc)로 위치를 먼저 구한다.
 * base64ToBytes는 readAsStringAsync(base64) 결과를 atob 없이 디코드한다.
 * 문자열 → ms 변환은 albumSections.exifTakenAt을 그대로 쓴다(picker exif와 같은 규칙·같은 오프셋 처리).
 *
 * ⚠️ RN·Expo import 금지 — verify가 tsx로 돌린다.
 * 잘린 바이트·엉뚱한 오프셋은 throw 없이 undefined.
 */
import { exifTakenAt } from './albumSections';

const MARKER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // 'Exif\0\0'

export function exifTakenAtFromBytes(bytes: Uint8Array): number | undefined {
  // 마커가 우연히 여러 번 나올 수 있어(썸네일·메이커노트) TIFF 헤더가 맞는 첫 후보를 쓴다
  // 첫 바이트('E')는 네이티브 indexOf로 건너뛴다 — EXIF 없는 사진은 버퍼 전체를 훑으므로,
  // Hermes(무JIT)에서 바이트마다 JS 비교를 도는 것보다 훨씬 싸다
  for (let i = bytes.indexOf(MARKER[0]); i >= 0 && i + MARKER.length + 8 <= bytes.length; i = bytes.indexOf(MARKER[0], i + 1)) {
    if (!MARKER.every((b, k) => bytes[i + k] === b)) continue;
    const ts = readTiff(bytes, i + MARKER.length);
    if (ts !== null) return ts;
  }
  return undefined;
}

/** TIFF 헤더가 아니면 null(다음 마커 후보로), 헤더는 맞지만 날짜를 못 찾으면 undefined */
function readTiff(b: Uint8Array, base: number): number | undefined | null {
  const le = b[base] === 0x49 && b[base + 1] === 0x49 && b[base + 2] === 0x2a && b[base + 3] === 0x00;
  const be = b[base] === 0x4d && b[base + 1] === 0x4d && b[base + 2] === 0x00 && b[base + 3] === 0x2a;
  if (!le && !be) return null;

  const u16 = (o: number) => (o < 0 || o + 2 > b.length ? -1 : le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > b.length) return -1;
    const v = le ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24) : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    return v >>> 0;
  };

  // IFD 하나 → { tag: 항목 시작 위치 }. 개수·범위가 바이트 밖이면 읽을 수 있는 만큼만.
  const readIfd = (rel: number): Map<number, number> => {
    const out = new Map<number, number>();
    const at = base + rel;
    const n = u16(at);
    if (rel <= 0 || n < 0) return out;
    for (let k = 0; k < n; k++) {
      const e = at + 2 + k * 12;
      if (e + 12 > b.length) break;
      out.set(u16(e), e);
    }
    return out;
  };

  // ASCII(type 2) 값 — 4바이트 이하면 항목 안, 넘으면 TIFF 기준 오프셋
  const ascii = (e: number | undefined): string | undefined => {
    if (e === undefined || u16(e + 2) !== 2) return undefined;
    const count = u32(e + 4);
    const off = count <= 4 ? 0 : u32(e + 8);
    const start = count <= 4 ? e + 8 : base + off;
    if (count <= 0 || off < 0 || start + count > b.length) return undefined;
    let s = '';
    for (let k = start; k < start + count && b[k] !== 0; k++) s += String.fromCharCode(b[k]);
    return s;
  };

  const ifd0 = readIfd(u32(base + 4));
  const exifPtr = ifd0.get(0x8769);
  const exifIfd = exifPtr !== undefined ? readIfd(u32(exifPtr + 8)) : new Map<number, number>();
  return exifTakenAt({
    DateTimeOriginal: ascii(exifIfd.get(0x9003)),
    DateTime: ascii(ifd0.get(0x0132)),
    OffsetTimeOriginal: ascii(exifIfd.get(0x9011)),
    OffsetTime: ascii(exifIfd.get(0x9010)),
  });
}

// ─────────────────────────────────────────────
// HEIF(HEIC) — Exif 항목의 정확한 위치 찾기
// iPhone 24/48MP HEIC는 Exif 항목이 파일 앞 256KB 밖 mdat에 있을 수 있어, 앞부분 마커 스캔으로는 못 찾는다.
// 앞부분의 meta 박스(iinf → Exif 항목 id, iloc → 그 항목의 파일 내 위치)만 읽으면 위치를 정확히 알 수 있다.
// ISO/IEC 14496-12(ISOBMFF)·23008-12(HEIF) 박스 구조. 범위 밖·모르는 버전은 throw 없이 undefined.
// ─────────────────────────────────────────────

const be16 = (b: Uint8Array, o: number) => (o < 0 || o + 2 > b.length ? -1 : (b[o] << 8) | b[o + 1]);
const be32 = (b: Uint8Array, o: number) =>
  o < 0 || o + 4 > b.length ? -1 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const fourcc = (b: Uint8Array, o: number) =>
  o < 0 || o + 4 > b.length ? '' : String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** 맨 앞 ftyp 박스의 major brand. ftyp가 아니면 undefined (진단 로그용) */
export function ftypBrand(b: Uint8Array): string | undefined {
  return fourcc(b, 4) === 'ftyp' ? fourcc(b, 8) : undefined;
}

/** ftyp의 major 또는 compatible brand가 HEIF 계열이면 true */
export function isHeif(b: Uint8Array): boolean {
  if (fourcc(b, 4) !== 'ftyp') return false;
  const end = Math.min(be32(b, 0), b.length);
  if (HEIF_BRANDS.has(fourcc(b, 8))) return true;
  for (let o = 16; o + 4 <= end; o += 4) if (HEIF_BRANDS.has(fourcc(b, o))) return true;
  return false;
}

/** [start, end) 안의 형제 박스 목록. body는 헤더 다음 위치, end는 버퍼 길이로 잘린다 */
function childBoxes(b: Uint8Array, start: number, end: number): { type: string; body: number; end: number }[] {
  const out: { type: string; body: number; end: number }[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = be32(b, o);
    let body = o + 8;
    if (size === 1) {
      // 64비트 largesize
      const hi = be32(b, o + 8), lo = be32(b, o + 12);
      if (hi < 0 || lo < 0) break;
      size = hi * 2 ** 32 + lo;
      body = o + 16;
    } else if (size === 0) {
      size = end - o; // 끝까지
    }
    if (size < body - o) break; // 망가진 크기 — 무한 루프 방지
    out.push({ type: fourcc(b, o + 4), body, end: Math.min(o + size, end) });
    o += size;
  }
  return out;
}

/**
 * HEIF면 최상위 meta 박스가 끝나는 파일 위치(선언 크기 기준 — 버퍼보다 클 수 있다). 아니면 undefined.
 * 앞부분만 읽었는데 meta가 그보다 길면(애플식으로 iloc이 meta 맨 끝에 있을 때) 이만큼 다시 읽어야 iloc이 보인다.
 */
export function heifMetaEnd(b: Uint8Array): number | undefined {
  if (!isHeif(b)) return undefined;
  let o = 0;
  while (o + 8 <= b.length) {
    let size = be32(b, o);
    let hdr = 8;
    if (size === 1) {
      const hi = be32(b, o + 8), lo = be32(b, o + 12);
      if (hi < 0 || lo < 0) return undefined;
      size = hi * 2 ** 32 + lo;
      hdr = 16;
    } else if (size === 0) {
      return undefined; // '끝까지' — 크기를 알 수 없다
    }
    if (size < hdr) return undefined;
    if (fourcc(b, o + 4) === 'meta') return o + size;
    o += size;
  }
  return undefined;
}

/**
 * HEIF 앞부분 바이트(meta 박스가 들어 있을 만큼) → Exif 항목의 파일 내 {offset, length}.
 * - iinf: infe v2(id 16비트)·v3(id 32비트)에서 item_type 'Exif'인 항목 id
 * - iloc: version 0/1/2, 필드 크기 0/4/8, construction_method 0(파일 오프셋)만. 첫 extent만 쓴다.
 * length 0은 'extent가 파일 끝까지'라는 뜻이다 — 호출부가 상한으로 자른다.
 */
export function findHeifExifRange(b: Uint8Array): { offset: number; length: number } | undefined {
  if (!isHeif(b)) return undefined;
  const meta = childBoxes(b, 0, b.length).find((x) => x.type === 'meta');
  if (!meta) return undefined;
  const kids = childBoxes(b, meta.body + 4, meta.end); // meta는 FullBox(버전·플래그 4바이트)
  const iinf = kids.find((x) => x.type === 'iinf');
  const iloc = kids.find((x) => x.type === 'iloc');
  if (!iinf || !iloc) return undefined;

  // ── iinf → Exif 항목 id
  const infeStart = iinf.body + 4 + (b[iinf.body] === 0 ? 2 : 4); // entry_count: v0 16비트, 그 외 32비트
  let exifId = -1;
  for (const e of childBoxes(b, infeStart, iinf.end)) {
    if (e.type !== 'infe' || e.end - e.body < 12) continue;
    const v = b[e.body];
    if (v !== 2 && v !== 3) continue; // v0/v1에는 item_type이 없다
    const idSize = v === 2 ? 2 : 4;
    const id = v === 2 ? be16(b, e.body + 4) : be32(b, e.body + 4);
    if (id >= 0 && fourcc(b, e.body + 4 + idSize + 2) === 'Exif') { exifId = id; break; }
  }
  if (exifId < 0) return undefined;

  // ── iloc → 그 항목의 첫 extent
  const v = b[iloc.body];
  if (v > 2) return undefined;
  let o = iloc.body + 4;
  if (o + 2 > iloc.end) return undefined;
  const offSize = b[o] >> 4, lenSize = b[o] & 15, baseSize = b[o + 1] >> 4;
  const idxSize = v === 1 || v === 2 ? b[o + 1] & 15 : 0;
  o += 2;
  if (![offSize, lenSize, baseSize, idxSize].every((n) => n === 0 || n === 4 || n === 8)) return undefined;
  // n바이트 빅엔디언 정수. 8바이트도 곱셈으로 쌓아 2^53까지 정확(파일 크기로 충분). 범위 밖이면 -1
  const readN = (n: number): number => {
    if (o + n > iloc.end) return -1;
    let val = 0;
    for (let k = 0; k < n; k++) val = val * 256 + b[o + k];
    o += n;
    return val;
  };
  const itemCount = readN(v < 2 ? 2 : 4);
  for (let i = 0; i < itemCount; i++) {
    const id = readN(v < 2 ? 2 : 4);
    const method = v === 1 || v === 2 ? readN(2) : 0;
    const dataRef = readN(2);
    const base = readN(baseSize);
    const extCount = readN(2);
    if (id < 0 || method < 0 || dataRef < 0 || base < 0 || extCount < 0) return undefined;
    let first: { offset: number; length: number } | undefined;
    for (let j = 0; j < extCount; j++) {
      if (readN(idxSize) < 0) return undefined;
      const eo = readN(offSize), el = readN(lenSize);
      if (eo < 0 || el < 0) return undefined;
      if (j === 0) first = { offset: base + eo, length: el };
    }
    // construction_method 1(idat)·2(item) 은 파일 오프셋이 아니라 지원하지 않는다
    if (id === exifId) return (method & 15) === 0 && dataRef === 0 && first ? first : undefined;
  }
  return undefined;
}

/**
 * HEIF Exif 항목 페이로드 → 촬영시각. 페이로드 앞 4바이트(빅엔디언)는 TIFF 헤더까지의 오프셋이다
 * (보통 6 = 'Exif\0\0' 다음). 그 값이 이상하면 마커 스캔으로 폴백한다.
 */
export function exifTakenAtFromHeifExif(p: Uint8Array): number | undefined {
  const off = be32(p, 0);
  if (off >= 0) {
    const ts = readTiff(p, 4 + off);
    if (ts !== null) return ts;
  }
  return exifTakenAtFromBytes(p);
}

// ─────────────────────────────────────────────
// base64 → 바이트 — 전역 atob에 기대지 않는다(Hermes에서 있는지·동작하는지 보장할 근거가 없다).
// 룩업 테이블로 한 번에 디코드. 줄바꿈·공백은 무시, '='에서 끝, 그 밖의 문자는 undefined.
// ─────────────────────────────────────────────
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256).fill(255);
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < s.length; i++) t[s.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(s: string): Uint8Array | undefined {
  const out = new Uint8Array(Math.ceil((s.length * 3) / 4));
  let acc = 0, bits = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 61) break; // '=' 패딩 — 여기서 끝
    if (c === 10 || c === 13 || c === 32 || c === 9) continue;
    const v = c < 256 ? B64_LOOKUP[c] : 255;
    if (v === 255) return undefined;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, n);
}
