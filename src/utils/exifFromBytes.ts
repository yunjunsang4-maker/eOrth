/**
 * exifFromBytes.ts — 파일 앞부분 바이트에서 EXIF 촬영시각(ms)을 꺼내는 순수 함수
 *
 * 쓰임: 촬영시각(mediaTimes)이 없는 옛 사진첩 사진의 '날짜 다시 찾기'(utils/albumReanalyze).
 * 앨범 사진은 copyTripOriginals가 원본을 그대로 복사한 것이라 EXIF가 살아 있다.
 *
 * 방식: 'Exif\0\0' 마커를 찾아 그 뒤 TIFF 헤더(II*\0 / MM\0*)부터 읽는다.
 *   IFD0 → ExifIFD 포인터(0x8769) → DateTimeOriginal(0x9003)·OffsetTimeOriginal(0x9011)·OffsetTime(0x9010),
 *   DateTimeOriginal이 없으면 IFD0 DateTime(0x0132).
 * 마커 스캔이라 JPEG APP1과 HEIC Exif 항목(앞에 4바이트 오프셋 + 'Exif\0\0' + TIFF)을 함께 다룬다.
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
