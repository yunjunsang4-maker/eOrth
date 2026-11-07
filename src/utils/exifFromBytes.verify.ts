// src/utils/exifFromBytes.verify.ts — 실행: node node_modules/tsx/dist/cli.mjs src/utils/exifFromBytes.verify.ts
// 손으로 조립한 최소 JPEG/TIFF/HEIF 바이트로 exifFromBytes(EXIF 파싱·HEIF Exif 위치·base64 디코드)를 검증한다.
import { exifTakenAtFromBytes, findHeifExifRange, exifTakenAtFromHeifExif, heifMetaEnd, isHeif, ftypBrand, base64ToBytes } from './exifFromBytes';

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
// 앨범 시간대(tz) — '날짜 다시 찾기'가 오프셋 없는 EXIF를 앨범 나라 벽시계로 읽는다(마드리드 3월 = UTC+1, 기기 시간대 무관)
eq(exifTakenAtFromBytes(jpeg(tiff(true, [], [DTO])), 'Europe/Madrid'), Date.UTC(2024, 2, 2, 13, 20, 5), 'tz: 오프셋 없음 + 마드리드 14:20:05 = 13:20:05Z');
// 오프셋 태그가 있으면 tz보다 우선
eq(exifTakenAtFromBytes(jpeg(tiff(true, [], [DTO, { tag: 0x9011, str: '+09:00' }])), 'Europe/Madrid'), Date.UTC(2024, 2, 2, 5, 20, 5), 'tz: OffsetTimeOriginal이 tz보다 우선');

// ─────────────────────────────────────────────
// HEIF: ftyp + meta(hdlr, iinf/infe, iloc) + mdat 를 손으로 조립해 Exif 항목 위치 찾기를 검증
// ─────────────────────────────────────────────
const s4 = (s: string) => [...s].map((c) => c.charCodeAt(0));
const n16 = (v: number) => [(v >> 8) & 255, v & 255];
const n32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
const box = (type: string, body: number[]) => [...n32(8 + body.length), ...s4(type), ...body];
const fullbox = (type: string, v: number, body: number[]) => box(type, [v, 0, 0, 0, ...body]);
const PAYLOAD = [...n32(6), 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff(false, [], [DTO])]; // HEIF Exif 항목: 4바이트 오프셋 + 'Exif\0\0' + TIFF

/**
 * opts.ilocV: iloc 버전(0/1/2), opts.infeV: infe 버전(2/3), opts.method: construction_method(v1/v2만),
 * opts.gap: meta와 Exif 페이로드 사이에 끼울 바이트 수(앞 256KB 밖에 두는 실기기 상황 재현)
 */
// opts.metaPad: meta 안 hdlr 뒤에 끼울 free 박스 크기 — iinf·iloc을 meta 맨 끝(애플식)으로 밀어 meta를 키운다
function heif(opts: { ilocV: number; infeV: number; brand?: string; method?: number; gap?: number; payload?: number[]; metaPad?: number }) {
  const payload = opts.payload ?? PAYLOAD;
  const ftyp = box('ftyp', [...s4(opts.brand ?? 'heic'), 0, 0, 0, 0, ...s4('mif1'), ...s4(opts.brand ?? 'heic')]);
  const infe = (id: number, type: string) =>
    fullbox('infe', opts.infeV, [...(opts.infeV === 2 ? n16(id) : n32(id)), 0, 0, ...s4(type), 0]);
  const iinf = fullbox('iinf', 0, [...n16(2), ...infe(1, 'hvc1'), ...infe(7, 'Exif')]);
  const v = opts.ilocV;
  const idN = (id: number) => (v < 2 ? n16(id) : n32(id));
  // offset_size 4, length_size 4, base_offset_size 4, index_size 0(v1/v2) — base_offset을 실제로 더하는지 보려고 0이 아닌 base를 쓴다
  const item = (id: number, base: number, off: number, len: number) => [
    ...idN(id),
    ...(v === 1 || v === 2 ? n16(opts.method ?? 0) : []),
    ...n16(0),
    ...n32(base),
    ...n16(1),
    ...n32(off),
    ...n32(len),
  ];
  const ilocOf = (exifAt: number) =>
    fullbox('iloc', v, [0x44, 0x40, ...idN(2), ...item(1, 0, 0, 0), ...item(7, 100, exifAt - 100, payload.length)]);
  const hdlr = [...fullbox('hdlr', 0, [0, 0, 0, 0, ...s4('pict'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...(opts.metaPad ? box('free', new Array(opts.metaPad).fill(0)) : [])];
  // iloc 크기는 값과 무관(고정 4바이트 필드)이라 한 번 만들어 길이를 잰 뒤 진짜 위치로 다시 만든다
  const metaLen = fullbox('meta', 0, [...hdlr, ...iinf, ...ilocOf(0)]).length;
  const exifAt = ftyp.length + metaLen + 8 + (opts.gap ?? 0);
  const meta = fullbox('meta', 0, [...hdlr, ...iinf, ...ilocOf(exifAt)]);
  heifMetaLen = meta.length;
  const mdatBody = [...new Array(opts.gap ?? 0).fill(0x11), ...payload];
  return { bytes: Uint8Array.from([...ftyp, ...meta, ...box('mdat', mdatBody)]), exifAt, len: payload.length };
}
let heifMetaLen = 0; // 마지막으로 만든 heif()의 meta 박스 길이
const WANT = new Date(2024, 2, 2, 14, 20, 5).getTime();

for (const [ilocV, infeV] of [[0, 2], [1, 2], [2, 3]]) {
  const h = heif({ ilocV, infeV });
  eq(findHeifExifRange(h.bytes), { offset: h.exifAt, length: h.len }, `HEIF iloc v${ilocV} + infe v${infeV}: Exif 항목 위치(base_offset 포함)`);
  const r = findHeifExifRange(h.bytes);
  eq(r ? exifTakenAtFromHeifExif(h.bytes.slice(r.offset, r.offset + r.length)) : 'no range', WANT, `HEIF iloc v${ilocV}: 그 위치의 페이로드에서 촬영시각`);
}
// 실기기 상황: Exif가 300KB 뒤 mdat에 있으면 앞 256KB 마커 스캔은 못 찾지만, meta만 있는 앞 64KB로 위치는 찾는다
{
  const h = heif({ ilocV: 1, infeV: 2, gap: 300 * 1024 });
  eq(exifTakenAtFromBytes(h.bytes.slice(0, 256 * 1024)), undefined, 'HEIF Exif가 256KB 밖: 앞부분 마커 스캔은 실패(재현)');
  eq(findHeifExifRange(h.bytes.slice(0, 64 * 1024)), { offset: h.exifAt, length: h.len }, 'HEIF Exif가 256KB 밖: 앞 64KB의 meta로 위치는 찾음');
}
// 페이로드 오프셋 0(TIFF가 바로 시작, 'Exif\0\0' 없음)도 앞 4바이트 오프셋으로 읽는다
{
  const p = [...n32(0), ...tiff(true, [], [DTO])];
  const h = heif({ ilocV: 0, infeV: 2, payload: p });
  eq(exifTakenAtFromHeifExif(h.bytes.slice(h.exifAt, h.exifAt + h.len)), WANT, 'HEIF 페이로드 오프셋 0(Exif 마커 없음)');
}
// 페이로드 앞 4바이트가 엉터리면 마커 스캔으로 폴백
eq(exifTakenAtFromHeifExif(Uint8Array.from([0xff, 0xff, 0xff, 0xf0, ...PAYLOAD.slice(4)])), WANT, 'HEIF 페이로드 오프셋 엉터리 → 마커 스캔 폴백');
// HEIF 경로도 tz를 끝까지 넘긴다(오프셋 경로·마커 스캔 폴백 둘 다)
eq(exifTakenAtFromHeifExif(Uint8Array.from(PAYLOAD), 'Europe/Madrid'), Date.UTC(2024, 2, 2, 13, 20, 5), 'tz: HEIF 페이로드 + 마드리드 = 13:20:05Z');
eq(exifTakenAtFromHeifExif(Uint8Array.from([0xff, 0xff, 0xff, 0xf0, ...PAYLOAD.slice(4)]), 'Europe/Madrid'), Date.UTC(2024, 2, 2, 13, 20, 5), 'tz: HEIF 마커 스캔 폴백도 tz 반영');
eq(exifTakenAtFromHeifExif(Uint8Array.from(PAYLOAD), 'Not/AZone'), WANT, 'tz: 잘못된 id → 기기 로컬(예전 그대로)');
// 지원하지 않는 것 → undefined
eq(findHeifExifRange(heif({ ilocV: 1, infeV: 2, method: 1 }).bytes), undefined, 'construction_method 1(idat) → 미지원 undefined');
eq(findHeifExifRange(heif({ ilocV: 0, infeV: 2, brand: 'isom' }).bytes.map((x, i) => (i >= 16 && i < 20 ? 0x78 : x))), undefined, 'ftyp가 HEIF 계열이 아님(isom) → undefined');
eq(isHeif(heif({ ilocV: 0, infeV: 2, brand: 'heix' }).bytes), true, 'ftyp heix → HEIF');
eq(ftypBrand(heif({ ilocV: 0, infeV: 2 }).bytes), 'heic', 'ftypBrand: major brand');
eq(ftypBrand(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])), undefined, 'ftypBrand: JPEG → undefined');
{
  const h = heif({ ilocV: 1, infeV: 2 });
  const ilocAt = [...h.bytes].findIndex((_, i) => fourccAt(h.bytes, i) === 'iloc');
  eq(findHeifExifRange(h.bytes.slice(0, ilocAt + 20)), undefined, 'iloc 중간에서 잘린 바이트 → undefined');
  eq(findHeifExifRange(h.bytes.slice(0, 40)), undefined, 'meta 중간에서 잘린 바이트 → undefined');
  const broken = h.bytes.slice();
  broken.set(n32(3), 24); // meta 크기를 헤더보다 작게(3) — 망가진 크기에서 무한 루프 없이 끝나야 한다
  eq(findHeifExifRange(broken), undefined, 'meta 크기 망가짐 → undefined(무한 루프 없음)');
}
eq(findHeifExifRange(new Uint8Array(0)), undefined, '빈 바이트 → undefined');
// meta가 64KB보다 크고 iloc이 맨 끝(애플식): 앞 64KB만으론 못 찾지만, heifMetaEnd만큼 다시 읽으면 찾는다
{
  const h = heif({ ilocV: 1, infeV: 2, metaPad: 90 * 1024 });
  const ftypLen = 24;
  const head = h.bytes.slice(0, 64 * 1024);
  eq(findHeifExifRange(head), undefined, 'meta 87KB+(iloc이 64KB 밖): 앞 64KB만으론 위치 못 찾음(재현)');
  eq(heifMetaEnd(head), ftypLen + heifMetaLen, 'heifMetaEnd: 잘린 앞부분에서도 meta 선언 크기로 끝 위치를 준다');
  const end = heifMetaEnd(head)!;
  eq(findHeifExifRange(h.bytes.slice(0, end)), { offset: h.exifAt, length: h.len }, 'meta 끝까지 다시 읽으면 위치 찾음');
}
eq(heifMetaEnd(heif({ ilocV: 0, infeV: 2 }).bytes), 24 + heifMetaLen, 'heifMetaEnd: 작은 meta');
eq(heifMetaEnd(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])), undefined, 'heifMetaEnd: JPEG → undefined');
eq(heifMetaEnd(heif({ ilocV: 0, infeV: 2 }).bytes.slice(0, 30)), undefined, 'heifMetaEnd: meta 헤더 전에서 잘림 → undefined');
function fourccAt(b: Uint8Array, i: number) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); }

// ─────────────────────────────────────────────
// base64 → 바이트 (atob 없이)
// ─────────────────────────────────────────────
const bytesOf = (s: string) => { const r = base64ToBytes(s); return r ? [...r] : r; };
eq(bytesOf('TWFu'), [77, 97, 110], 'base64 패딩 0개: Man');
eq(bytesOf('TWE='), [77, 97], 'base64 패딩 1개: Ma');
eq(bytesOf('TQ=='), [77], 'base64 패딩 2개: M');
eq(bytesOf('TWE'), [77, 97], 'base64 패딩 생략도 허용');
eq(bytesOf(''), [], 'base64 빈 문자열 → 빈 배열');
eq(bytesOf('TW\nFu\r\n \t'), [77, 97, 110], 'base64 줄바꿈·공백·탭 무시');
eq(bytesOf('TW*u'), undefined, 'base64 잘못된 문자(*) → undefined');
eq(bytesOf('TWé='), undefined, 'base64 비ASCII 문자 → undefined');
// 모든 바이트 값 왕복 — Node Buffer로 만든 기준 문자열과 비교
{
  const all = Uint8Array.from({ length: 256 * 3 + 2 }, (_, i) => (i * 7) & 255);
  const enc = Buffer.from(all).toString('base64');
  eq(bytesOf(enc), [...all], 'base64 0~255 전 바이트 왕복(770바이트)');
  eq(bytesOf(enc.replace(/(.{76})/g, '$1\n')), [...all], 'base64 76자마다 줄바꿈(MIME)도 왕복');
}
{
  // 성능 참고: 256KB 디코드 시간(Node). Hermes는 더 느리다 — 기록용 출력일 뿐 판정하지 않는다
  const big = Buffer.alloc(256 * 1024, 7).toString('base64');
  const t0 = performance.now();
  const r = base64ToBytes(big);
  console.log(`  · 256KB base64 디코드 ${(performance.now() - t0).toFixed(1)}ms (Node), 길이 ${r?.length}`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
