/**
 * albumSections 검증 — npx tsx src/utils/albumSections.verify.ts
 */
import { buildAlbumTimeline, MOMENT_GAP_MS, removePhotosAt, remapUriKeys, exifTakenAt, effectiveMediaTimes } from './albumSections';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `
  want=${JSON.stringify(want)}
  got =${JSON.stringify(got)}`}`);
};

// ── 타임라인 ──
// 시각은 전부 new Date(y,m,d,h) 로컬 생성 — 기기 시간대가 달라도 같은 날로 묶여 TZ 무관하게 돈다
const at = (d: number, h: number, mi = 0) => new Date(2026, 2, d, h, mi).getTime(); // 2026-03-d
const shape = (tl: ReturnType<typeof buildAlbumTimeline>) =>
  tl.days.map((d) => [d.key, d.dayN, d.moments.map((m) => m.indexes)]);

// 정렬 + 일 묶음 + 순간 분리 + 미상: medias 순서와 무관하게 시각순, 3/2 오전·오후는 두 순간
{
  const M = ['p0', 'p1', 'p2', 'p3', 'p4', 'px'];
  const T = { p0: at(3, 9), p1: at(2, 14, 20), p2: at(2, 10), p3: at(2, 10, 30), p4: at(3, 9, 10) };
  const tl = buildAlbumTimeline(M, T);
  eq('timeline days/moments', shape(tl), [
    ['2026.03.02', 1, [[2, 3], [1]]],
    ['2026.03.03', 2, [[0, 4]]],
  ]);
  eq('timeline undated', tl.undated, [5]);
  // 뷰어 스와이프 순서 = 화면 순서(날짜순 전부 → 미상)
  eq('timeline order', tl.order, [2, 3, 1, 0, 4, 5]);
  eq('moment startMs = 첫 사진 시각', tl.days[0].moments.map((m) => m.startMs), [at(2, 10), at(2, 14, 20)]);
  eq('day startMs = 그날 첫 사진', tl.days.map((d) => d.startMs), [at(2, 10), at(3, 9)]);
}

// 순간 경계: 정확히 2시간이면 새 순간, 1ms 모자라면 같은 순간
{
  const base = at(5, 10);
  eq('gap exactly 2h → split', shape(buildAlbumTimeline(['a', 'b'], { a: base, b: base + MOMENT_GAP_MS })), [['2026.03.05', 1, [[0], [1]]]]);
  eq('gap 2h-1ms → same moment', shape(buildAlbumTimeline(['a', 'b'], { a: base, b: base + MOMENT_GAP_MS - 1 })), [['2026.03.05', 1, [[0, 1]]]]);
  // 간격은 '순간 시작'이 아니라 '바로 앞 사진' 기준 — 1시간 간격으로 3시간 이어 찍으면 한 순간
  eq('gap measured from previous photo', shape(buildAlbumTimeline(['a', 'b', 'c'], { a: at(5, 10), b: at(5, 11), c: at(5, 12) })), [['2026.03.05', 1, [[0, 1, 2]]]]);
}

// 자정을 넘기면 2시간 안이어도 다른 날(일 묶음이 순간보다 우선)
eq('midnight splits day', shape(buildAlbumTimeline(['a', 'b'], { a: at(5, 23, 30), b: at(6, 0, 10) })), [
  ['2026.03.05', 1, [[0]]],
  ['2026.03.06', 2, [[1]]],
]);

// dayN은 달력 일수 차 — 사진 없는 3/2는 건너뛰어 Day 1, Day 3
eq('dayN skips empty day', buildAlbumTimeline(['a', 'b'], { a: at(1, 12), b: at(3, 12) }).days.map((d) => d.dayN), [1, 3]);
// 서머타임이 있는 시간대에서도 반올림으로 정수 — 3/1 → 3/31은 Day 31
eq('dayN across month (DST-safe)', buildAlbumTimeline(['a', 'b'], { a: at(1, 12), b: at(31, 12) }).days.map((d) => d.dayN), [1, 31]);

// 동률(같은 시각)은 medias 순서 유지
eq('tie keeps medias order', buildAlbumTimeline(['a', 'b', 'c'], { c: at(4, 8), a: at(4, 8), b: at(4, 8) }).order, [0, 1, 2]);

// 무효 시각(0·음수)은 미상 — exifTakenAt이 음수를 걸러도 옛 데이터엔 남아 있을 수 있다
{
  const tl = buildAlbumTimeline(['a', 'b', 'c'], { a: 0, b: -5, c: at(4, 8) });
  eq('zero/negative → undated', [tl.undated, tl.order], [[0, 1], [2, 0, 1]]);
}

// mediaTimes 자체가 없는 옛 기록 — 전부 미상, days 비어 있음(화면은 평면 격자로 그린다)
{
  const tl = buildAlbumTimeline(['a', 'b'], undefined);
  eq('mediaTimes undefined', [tl.days.length, tl.undated, tl.order], [0, [0, 1], [0, 1]]);
}
// 빈 사진첩
eq('empty medias', buildAlbumTimeline([], {}), { days: [], undated: [], order: [] });

// ── 다중 제거 ──
eq('remove multi', removePhotosAt(['a', 'b', 'c', 'd', 'e'], [1, 4]), ['a', 'c', 'd']);
// 범위 밖·음수 인덱스는 무시
eq('remove out of range', removePhotosAt(['a', 'b'], [-1, 2, 9]), ['a', 'b']);

// ── uri 키 리맵(서버 발행 사본의 mediaTimes·mediaAssetIds) ──
const FROM = ['file:///a.jpg', 'file:///b.jpg', 'https://x/c.jpg'];
const TO = ['https://s/A.jpg', 'https://s/B.jpg', 'https://x/c.jpg'];
// 로컬 키가 업로드 URL로 옮겨지고 값은 그대로
eq('remap local→remote', remapUriKeys({ 'file:///a.jpg': 1, 'file:///b.jpg': 2 }, FROM, TO), { 'https://s/A.jpg': 1, 'https://s/B.jpg': 2 });
// 다른 기기에서 받아 온 기록 — 이미 http 키는 손대지 않는다
eq('remap keeps http key', remapUriKeys({ 'https://x/c.jpg': 3 }, FROM, TO), { 'https://x/c.jpg': 3 });
// 삭제된 사진의 고아 로컬 키는 서버로 안 간다
eq('remap drops orphan', remapUriKeys({ 'file:///gone.jpg': 9, 'file:///a.jpg': 1 }, FROM, TO), { 'https://s/A.jpg': 1 });
// 맵 자체가 없는 옛 기록 — undefined 그대로(빈 객체를 새로 싣지 않는다)
eq('remap undefined map', remapUriKeys(undefined, FROM, TO), undefined);
// assetId 값은 보존(같은 기기 재설치 후 불러오기 중복 판정에 values만 쓰인다)
eq('remap keeps assetId value', remapUriKeys({ 'file:///b.jpg': 'PH-123' }, FROM, TO), { 'https://s/B.jpg': 'PH-123' });

// ── EXIF 촬영시각 ──
const T0 = new Date(2026, 4, 6, 14, 30, 5).getTime(); // 로컬 2026-05-06 14:30:05
// 두 플랫폼 모두 최상위 키(iOS도 picker가 {Exif}·{TIFF}를 최상위로 펼친다)
eq('exif top-level', exifTakenAt({ DateTimeOriginal: '2026:05:06 14:30:05' }), T0);
// 원본 시각이 없으면 DateTime 폴백
eq('exif DateTime fallback', exifTakenAt({ DateTime: '2026:05:06 14:30:05' }), T0);
// 원본 시각이 있으면 수정 시각(DateTime)보다 우선 — 편집 앱이 DateTime만 갱신하는 경우
eq('exif original wins', exifTakenAt({ DateTime: '2027:01:01 00:00:00', DateTimeOriginal: '2026:05:06 14:30:05' }), T0);
// 오프셋이 있으면 절대시각 — 도쿄 +09:00 20:00 = UTC 11:00 (기기 시간대와 무관)
eq('exif offset +09:00', exifTakenAt({ DateTimeOriginal: '2026:05:06 20:00:00', OffsetTimeOriginal: '+09:00' }), Date.UTC(2026, 4, 6, 11, 0, 0));
// 음수 오프셋 — 뉴욕 -05:00 20:00 = 다음날 UTC 01:00
eq('exif offset -05:00', exifTakenAt({ DateTimeOriginal: '2026:05:06 20:00:00', OffsetTimeOriginal: '-05:00' }), Date.UTC(2026, 4, 7, 1, 0, 0));
// OffsetTimeOriginal이 없으면 OffsetTime 사용
eq('exif OffsetTime fallback', exifTakenAt({ DateTimeOriginal: '2026:05:06 20:00:00', OffsetTime: '+02:00' }), Date.UTC(2026, 4, 6, 18, 0, 0));
// 형식이 틀린 오프셋은 무시하고 기기 로컬로 해석
eq('exif bad offset → local', exifTakenAt({ DateTimeOriginal: '2026:05:06 14:30:05', OffsetTimeOriginal: '+9' }), T0);
// 형식이 깨진 문자열·빈 값(0000:00:00)은 기록 안 함 → '기타'
eq('exif bad string', exifTakenAt({ DateTimeOriginal: '2026-05-06' }), undefined);
eq('exif zero date', exifTakenAt({ DateTimeOriginal: '0000:00:00 00:00:00' }), undefined);
// EXIF 없음 — null/undefined/빈 객체 각각
// 빈·공백 DateTimeOriginal은 없는 값 → DateTime 폴백 (일부 카메라가 공백 19자로 채운다)
eq('exif blank original → DateTime', exifTakenAt({ DateTimeOriginal: ' '.repeat(19), DateTime: '2026:05:06 14:30:05' }), T0);
eq('exif empty original → DateTime', exifTakenAt({ DateTimeOriginal: '', DateTime: '2026:05:06 14:30:05' }), T0);
// 빈 OffsetTimeOriginal도 없는 값 → OffsetTime 폴백
eq('exif blank OTO → OffsetTime', exifTakenAt({ DateTimeOriginal: '2026:05:06 20:00:00', OffsetTimeOriginal: '', OffsetTime: '+02:00' }), Date.UTC(2026, 4, 6, 18, 0, 0));
eq('exif undefined', exifTakenAt(undefined), undefined);
eq('exif null', exifTakenAt(null), undefined);
eq('exif empty', exifTakenAt({}), undefined);

// ── effectiveMediaTimes — medias가 서버 URL로 바뀌고 mediaTimes는 로컬 키로 남은 기록 복구 ──
{
  const up = { 'file:///d/0.jpg': 'https://cdn/0.jpg', 'file:///d/1.jpg': 'https://cdn/1.jpg' };
  const t = { 'file:///d/0.jpg': T0, 'file:///d/1.jpg': T0 + 60000 };
  const eff = effectiveMediaTimes({ mediaTimes: t, uploadedMediaUrls: up });
  eq('effective: 로컬 키 시각을 원격 키로도', eff, { ...t, 'https://cdn/0.jpg': T0, 'https://cdn/1.jpg': T0 + 60000 });
  eq('effective: 입력 변형 없음', Object.keys(t).length, 2);
  // 실제 증상 재현: medias=원격, mediaTimes=로컬 키 → 그대로면 전부 날짜 미상, effective면 날짜로 묶임
  const medias = ['https://cdn/0.jpg', 'https://cdn/1.jpg'];
  eq('증상 재현: mediaTimes 그대로면 전부 미상', buildAlbumTimeline(medias, t).undated, [0, 1]);
  eq('복구: effective면 미상 0장', buildAlbumTimeline(medias, eff).undated, []);
  eq('복구: 같은 날 한 그룹', buildAlbumTimeline(medias, eff).days.length, 1);
}
// 원격 키에 유효한 시각이 이미 있으면 덮지 않는다(서버 사본이 가진 값 우선)
eq('effective: 원격 키 기존 값 유지',
  effectiveMediaTimes({ mediaTimes: { 'file:///a': T0, 'https://cdn/a': T0 + 5 }, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } })?.['https://cdn/a'],
  T0 + 5);
// 원격 키 값이 무효(0)면 로컬 값으로 채운다
eq('effective: 원격 키 무효값(0)은 채움',
  effectiveMediaTimes({ mediaTimes: { 'file:///a': T0, 'https://cdn/a': 0 }, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } })?.['https://cdn/a'],
  T0);
// 더할 게 없으면 같은 객체(참조 동일) — useMemo 의존값 안정
{
  const t = { 'https://cdn/a': T0 };
  eq('effective: 더할 것 없으면 같은 객체', effectiveMediaTimes({ mediaTimes: t, uploadedMediaUrls: { 'file:///x': 'https://cdn/x' } }) === t, true);
  eq('effective: 업로드 캐시 없으면 같은 객체', effectiveMediaTimes({ mediaTimes: t }) === t, true);
}
eq('effective: mediaTimes 없음 → undefined', effectiveMediaTimes({ uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } }), undefined);
eq('effective: 로컬 시각이 무효면 옮기지 않음',
  effectiveMediaTimes({ mediaTimes: { 'file:///a': 0 }, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } }), { 'file:///a': 0 });

// ── 역방향(원격 → 로컬) — 다른 기기·개발 빌드가 찾은 시각이 서버 사본에 원격 키로 들어와 합쳐진 작성 기기 기록 ──
{
  const up = { 'file:///d/0.jpg': 'https://cdn/0.jpg', 'file:///d/1.jpg': 'https://cdn/1.jpg' };
  const t = { 'https://cdn/0.jpg': T0, 'https://cdn/1.jpg': T0 + 60000 };
  const eff = effectiveMediaTimes({ mediaTimes: t, uploadedMediaUrls: up });
  eq('역방향: 원격 키 시각을 로컬 키로도', eff, { ...t, 'file:///d/0.jpg': T0, 'file:///d/1.jpg': T0 + 60000 });
  eq('역방향: 입력 변형 없음', Object.keys(t).length, 2);
  // 실제 증상 재현: medias=로컬(작성 기기), mediaTimes=원격 키만 → 그대로면 전부 미상
  const medias = ['file:///d/0.jpg', 'file:///d/1.jpg'];
  eq('역방향 증상 재현: 그대로면 전부 미상', buildAlbumTimeline(medias, t).undated, [0, 1]);
  eq('역방향 복구: effective면 미상 0장', buildAlbumTimeline(medias, eff).undated, []);
}
// 로컬 키 값이 무효(0)이고 원격이 유효하면 로컬을 채운다
eq('역방향: 로컬 무효값(0)은 원격으로 채움',
  effectiveMediaTimes({ mediaTimes: { 'file:///a': 0, 'https://cdn/a': T0 }, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } }),
  { 'file:///a': T0, 'https://cdn/a': T0 });
// 양쪽 다 유효하면(값이 달라도) 손대지 않고 같은 객체
{
  const t = { 'file:///a': T0, 'https://cdn/a': T0 + 5 };
  eq('양쪽 유효: 같은 객체 그대로', effectiveMediaTimes({ mediaTimes: t, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } }) === t, true);
}
// 양쪽 다 무효면 채울 근거가 없다 — 같은 객체
{
  const t = { 'file:///a': 0, 'https://cdn/a': -1 };
  eq('양쪽 무효: 같은 객체 그대로', effectiveMediaTimes({ mediaTimes: t, uploadedMediaUrls: { 'file:///a': 'https://cdn/a' } }) === t, true);
}
// 한 기록 안에 정방향·역방향이 섞여도 각각 채운다
eq('정·역방향 혼합',
  effectiveMediaTimes({
    mediaTimes: { 'file:///a': T0, 'https://cdn/b': T0 + 1 },
    uploadedMediaUrls: { 'file:///a': 'https://cdn/a', 'file:///b': 'https://cdn/b' },
  }),
  { 'file:///a': T0, 'https://cdn/b': T0 + 1, 'https://cdn/a': T0, 'file:///b': T0 + 1 });

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
if (fail > 0) process.exit(1);
