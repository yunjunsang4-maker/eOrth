// 업로드 미디어 판정(확장자·Content-Type·메타데이터 제거 계획) 검증 (jest 미사용).
//
// 실제 EXIF가 벗겨지는지는 네이티브(expo-image-manipulator) 동작이라 node로 확인할 수 없다.
// 여기서 지키는 것은 그 앞단의 결정 규칙 — 무엇을 굽고 무엇을 건너뛰며 어떤 포맷으로
// 저장할지다. 이게 틀리면 (a) 사진이 안 구워져 위치가 새거나 (b) PNG 투명도가 깨지거나
// (c) 동영상이 이미지로 취급돼 업로드가 통째로 실패한다.
import {
  fileExt,
  guessContentType,
  planMetadataStrip,
  markMetadataStripped,
  isMetadataStripped,
  resetMetadataStripped,
} from './mediaUploadPlan';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── fileExt ──
eq(fileExt('file:///a/b/photo.JPG'), 'jpg', 'fileExt: 대문자 확장자는 소문자로');
eq(fileExt('file:///a/b/photo.heic'), 'heic', 'fileExt: heic');
eq(fileExt('https://x/y.png?token=abc'), 'png', 'fileExt: 쿼리스트링 뒤는 무시');
eq(fileExt('file:///a/b/no-extension'), 'jpg', 'fileExt: 확장자 없으면 jpg 기본값');
eq(fileExt(''), 'jpg', 'fileExt: 빈 문자열도 jpg 기본값(호출부가 죽지 않게)');
eq(fileExt('file:///a.b.c/photo.webp'), 'webp', 'fileExt: 경로 중간의 점에 속지 않는다');

// ── guessContentType ──
eq(guessContentType('a.png'), 'image/png', 'contentType: png');
eq(guessContentType('a.webp'), 'image/webp', 'contentType: webp');
eq(guessContentType('a.heif'), 'image/heic', 'contentType: heif도 image/heic');
eq(guessContentType('a.gif'), 'image/gif', 'contentType: gif');
eq(guessContentType('a.mp4'), 'video/mp4', 'contentType: mp4');
eq(guessContentType('a.mov'), 'video/quicktime', 'contentType: mov');
eq(guessContentType('a.m4v'), 'video/x-m4v', 'contentType: m4v');
eq(guessContentType('a.webm'), 'video/webm', 'contentType: webm');
eq(guessContentType('a.xyz'), 'image/jpeg', 'contentType: 모르는 확장자는 image/jpeg');

// ── planMetadataStrip: 널 계열 ──
resetMetadataStripped();
eq(planMetadataStrip(''), { action: 'skip', reason: 'empty' }, 'plan: 빈 문자열은 empty');

// ── planMetadataStrip: 이미 원격이면 손대지 않는다 ──
// (수정 발행에서 서버 URL이 다시 들어온다. 여기서 굽겠다고 하면 네트워크 파일을 굽는 꼴)
eq(planMetadataStrip('https://x.supabase.co/storage/v1/object/public/media/u/1.jpg'),
  { action: 'skip', reason: 'remote' }, 'plan: https URL은 remote로 건너뜀');
eq(planMetadataStrip('http://x/y.jpg'), { action: 'skip', reason: 'remote' }, 'plan: http도 remote');

// ── planMetadataStrip: 동영상은 남은 갭(재인코딩 수단 없음) ──
// 이미지로 잘못 태우면 디코딩이 실패하고, fail-closed 정책 때문에 블로그 영상 발행이 전부 막힌다.
for (const ext of ['mp4', 'mov', 'm4v', 'webm']) {
  eq(planMetadataStrip(`file:///v/clip.${ext}`), { action: 'skip', reason: 'video' }, `plan: ${ext}는 video로 건너뜀`);
}
eq(planMetadataStrip('file:///v/clip.MOV'), { action: 'skip', reason: 'video' }, 'plan: 대문자 .MOV도 video');

// ── planMetadataStrip: 포맷 보존 ──
eq(planMetadataStrip('file:///p/a.png'), { action: 'strip', format: 'png' },
  'plan: PNG는 PNG로 저장 (JPEG로 바꾸면 투명도가 깨진다)');
eq(planMetadataStrip('file:///p/a.webp'), { action: 'strip', format: 'webp' }, 'plan: WEBP는 WEBP 유지');
eq(planMetadataStrip('file:///p/a.jpg'), { action: 'strip', format: 'jpeg' }, 'plan: jpg → jpeg');
eq(planMetadataStrip('file:///p/a.jpeg'), { action: 'strip', format: 'jpeg' }, 'plan: jpeg → jpeg');
eq(planMetadataStrip('file:///p/a.heic'), { action: 'strip', format: 'jpeg' },
  'plan: HEIC는 저장 포맷이 없어 jpeg (GPS를 담는 규격이라 반드시 구워야 한다)');
eq(planMetadataStrip('file:///p/a.heif'), { action: 'strip', format: 'jpeg' }, 'plan: HEIF도 jpeg');
eq(planMetadataStrip('file:///p/no-extension'), { action: 'strip', format: 'jpeg' },
  'plan: 확장자 불명은 건너뛰지 않고 jpeg로 굽는다 (모르면 안전한 쪽)');

// ── planMetadataStrip: GIF는 굽지 않는다 ──
// GIF 규격에는 EXIF GPS가 없고, 재인코딩하면 첫 프레임만 남아 애니메이션이 죽는다.
eq(planMetadataStrip('file:///p/a.gif'), { action: 'skip', reason: 'no-exif-format' }, 'plan: gif는 재인코딩 안 함');

// ── 장부: 이중 압축 방지 ──
resetMetadataStripped();
const out = 'file:///cache/ImageManipulator/abc.jpg';
eq(isMetadataStripped(out), false, '장부: 등록 전에는 false');
eq(planMetadataStrip(out), { action: 'strip', format: 'jpeg' }, '장부: 등록 전이면 굽는다');
markMetadataStripped(out);
eq(isMetadataStripped(out), true, '장부: 등록 후 true');
eq(planMetadataStrip(out), { action: 'skip', reason: 'already-stripped' },
  '장부: 압축 경로를 이미 지난 파일은 다시 굽지 않는다(0.75→0.92 이중 압축 방지)');
eq(isMetadataStripped('file:///cache/other.jpg'), false, '장부: 다른 uri는 영향 없음');
eq(isMetadataStripped(''), false, '장부: 빈 문자열은 항상 false');
markMetadataStripped('');
eq(isMetadataStripped(''), false, '장부: 빈 문자열은 등록되지 않는다');

// 동영상 판정이 장부보다 앞선다 — 영상 uri가 어쩌다 장부에 들어가도 video로 나와야 한다
resetMetadataStripped();
markMetadataStripped('file:///v/clip.mp4');
eq(planMetadataStrip('file:///v/clip.mp4'), { action: 'skip', reason: 'video' }, '장부: 동영상 판정이 우선');

// ── 장부 상한: 넘쳐도 죽지 않고, 최근 것은 남는다 ──
resetMetadataStripped();
for (let i = 0; i < 1200; i++) markMetadataStripped(`file:///cache/${i}.jpg`);
eq(isMetadataStripped('file:///cache/1199.jpg'), true, '장부 상한: 최근 항목은 남아 있다');
eq(isMetadataStripped('file:///cache/0.jpg'), false, '장부 상한: 오래된 항목은 버려진다(재인코딩 1회 손해뿐)');
resetMetadataStripped();
eq(isMetadataStripped('file:///cache/1199.jpg'), false, '장부: reset이 비운다');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
