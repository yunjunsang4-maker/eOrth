// src/utils/exifFromBytes.verify.ts — 실행: node node_modules/tsx/dist/cli.mjs src/utils/exifFromBytes.verify.ts
// 손으로 조립한 최소 JPEG/TIFF 바이트로 exifTakenAtFromBytes를 검증한다.
import { exifTakenAtFromBytes } from './exifFromBytes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type Tag = { tag: number; str?: string; ptr?: boolean };

/**
 * TIFF 블록 조립: IFD0(ifd0 태그들 + ExifIFD 포인터) → ExifIFD(exif 태그들) → 문자열 값 영역.
 * 문자열은 전부 NUL 포함 20바이트라 4바이트를 넘어 항상 오프셋 참조가 된다.
 */
function tiff(le: boolean, ifd0: Tag[], exif: Tag[]): number[] {
  const out: number[] = [];
  const w16 = (v: number) => (le ? out.push(v & 255, v >> 8) : out.push(v >> 8, v & 255));
  const w32 = (v: number) => (le ? out.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24) : out.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255));
  const hasExif = exif.length > 0;
  const ifd0Tags: Tag[] = [...ifd0, ...(hasExif ? [{ tag: 0x8769, ptr: true }] : [])];
  const ifd0Size = 2 + ifd0Tags.length * 12 + 4;
  const exifOff = 8 + ifd0Size;
  const exifSize = hasExif ? 2 + exif.length * 12 + 4 : 0;
  let strOff = exifOff + exifSize;
  const strs: string[] = [];
  const writeIfd = (tags: Tag[]) => {
    w16(tags.length);
    for (const t of tags) {
      w16(t.tag);
      if (t.ptr) { w16(4); w32(1); w32(exifOff); continue; }
      const s = t.str! + '\0';
      w16(2); w32(s.length); w32(strOff);
      strOff += s.length;
      strs.push(s);
    }
    w32(0); // 다음 IFD 없음
  };
  out.push(...(le ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a]));
  w32(8);
  writeIfd(ifd0Tags);
  if (hasExif) writeIfd(exif);
  for (const s of strs) for (const c of s) out.push(c.charCodeAt(0));
  return out;
}

/** JPEG: SOI + APP1('Exif\0\0' + TIFF) + 뒤에 아무 바이트 */
function jpeg(t: number[]): Uint8Array {
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  const len = app1.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 1, 2, 3]);
}

const DTO = { tag: 0x9003, str: '2024:03:02 14:20:05' };
const DT0 = { tag: 0x0132, str: '2023:01:01 08:00:00' };

// 정상: 리틀엔디언(II) — ExifIFD의 DateTimeOriginal을 읽는다(IFD0 DateTime보다 우선)
eq(exifTakenAtFromBytes(jpeg(tiff(true, [DT0], [DTO]))), new Date(2024, 2, 2, 14, 20, 5).getTime(), 'II: ExifIFD DateTimeOriginal 우선');
// 정상: 빅엔디언(MM) — 같은 값이 나와야 한다
eq(exifTakenAtFromBytes(jpeg(tiff(false, [DT0], [DTO]))), new Date(2024, 2, 2, 14, 20, 5).getTime(), 'MM: ExifIFD DateTimeOriginal');
// 폴백: ExifIFD가 없으면 IFD0 DateTime
eq(exifTakenAtFromBytes(jpeg(tiff(true, [DT0], []))), new Date(2023, 0, 1, 8, 0, 0).getTime(), 'ExifIFD 없음 → IFD0 DateTime');
eq(exifTakenAtFromBytes(jpeg(tiff(false, [DT0], [{ tag: 0x9011, str: '+09:00' }]))), Date.UTC(2023, 0, 1, 8, 0, 0) - 9 * 3600000, 'MM: ExifIFD에 DateTimeOriginal 없음 → IFD0 DateTime(+오프셋)');
// 공백으로 채운 DateTimeOriginal → IFD0 DateTime 폴백(exifTakenAt이 빈·공백 값을 없는 값으로 본다)
eq(exifTakenAtFromBytes(jpeg(tiff(true, [DT0], [{ tag: 0x9003, str: ' '.repeat(19) }]))), new Date(2023, 0, 1, 8, 0, 0).getTime(), '공백 DateTimeOriginal → IFD0 DateTime 폴백');
// 오프셋: '+09:00'이면 절대시각(UTC 05:20:05)
eq(exifTakenAtFromBytes(jpeg(tiff(true, [], [DTO, { tag: 0x9011, str: '+09:00' }]))), Date.UTC(2024, 2, 2, 5, 20, 5), 'OffsetTimeOriginal +09:00 반영');
eq(exifTakenAtFromBytes(jpeg(tiff(false, [], [DTO, { tag: 0x9011, str: '-05:00' }]))), Date.UTC(2024, 2, 2, 19, 20, 5), 'MM: OffsetTimeOriginal -05:00 반영');
// HEIC Exif 항목 모양: 앞에 4바이트 tiff 헤더 오프셋 + 'Exif\0\0' + TIFF, 앞쪽에 ftyp 같은 잡바이트
const heic = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 6, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff(false, [], [DTO])]);
eq(exifTakenAtFromBytes(heic), new Date(2024, 2, 2, 14, 20, 5).getTime(), 'HEIC Exif 항목(마커 스캔)');
// 가짜 마커 뒤 TIFF 헤더가 아니면 다음 마커로 넘어간다
const fake = Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, ...jpeg(tiff(true, [], [DTO]))]);
eq(exifTakenAtFromBytes(fake), new Date(2024, 2, 2, 14, 20, 5).getTime(), '가짜 마커 건너뛰고 진짜 TIFF 사용');

// 없음 계열 — 전부 throw 없이 undefined
eq(exifTakenAtFromBytes(new Uint8Array(0)), undefined, '빈 바이트');
eq(exifTakenAtFromBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xd9])), undefined, 'Exif 마커 없음');
eq(exifTakenAtFromBytes(jpeg(tiff(true, [], []))), undefined, 'TIFF는 있지만 날짜 태그 없음');
eq(exifTakenAtFromBytes(jpeg(tiff(true, [{ tag: 0x0132, str: '0000:00:00 00:00:00' }], []))), undefined, '빈 날짜 값(0000:00:00) → 무효');
// 잘린 바이트: 문자열 값 영역이 잘려 나감
const full = jpeg(tiff(true, [], [DTO]));
eq(exifTakenAtFromBytes(full.slice(0, full.length - 20)), undefined, '값 영역이 잘린 바이트');
eq(exifTakenAtFromBytes(full.slice(0, 20)), undefined, 'IFD 중간에서 잘린 바이트');
// 잘못된 오프셋: IFD0 오프셋(TIFF+4)을 0xFFFFFF00으로 망가뜨림
const badIfd = jpeg(tiff(true, [DT0], [DTO]));
badIfd.set([0x00, 0xff, 0xff, 0xff], 6 + 6 + 4);
eq(exifTakenAtFromBytes(badIfd), undefined, 'IFD0 오프셋이 범위 밖');
// 잘못된 오프셋: ExifIFD 포인터 값을 범위 밖으로 → IFD0 DateTime으로 폴백
const t = tiff(true, [DT0], [DTO]);
const ptrEntry = 8 + 2 + 12; // IFD0 두 번째 항목 = 0x8769
t.splice(ptrEntry + 8, 4, 0xf0, 0xff, 0xff, 0x7f);
eq(exifTakenAtFromBytes(jpeg(t)), new Date(2023, 0, 1, 8, 0, 0).getTime(), 'ExifIFD 포인터 범위 밖 → IFD0 DateTime 폴백');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
