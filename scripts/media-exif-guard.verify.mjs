// 업로드 EXIF 제거 정적 가드 — 위치 메타데이터가 다시 서버로 새는 것을 막는다.
//
// 배경: `media` 버킷이 public이라 업로드된 파일은 URL만 알면 비인증으로 내려받힌다.
// 사진 안의 EXIF GPS가 그대로 올라가면 촬영 위치가 사실상 공개된다. 이 문제를
// 화면별로 막으면 새 화면이 생길 때마다 다시 뚫리므로, Storage에 쓰는 유일한 지점
// (src/services/media.ts의 uploadImage)에서 한 번만 처리하기로 했다.
//
// 이 스크립트가 지키는 것은 그 **초크포인트 가정**이다. 타입 검사도 lint도
// "두 번째 업로드 경로가 생겼다"를 잡지 못한다 — 컴파일도 되고 동작도 하기 때문이다.
// Google Play 데이터 안전 양식의 '정확한 위치' 답이 여기에 달려 있다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const rel = (p) => p.split(sep).join('/');
const readSafe = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

let fail = 0;
const check = (ok, msg) => {
  if (ok) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fail++; }
};

console.log('업로드 EXIF 제거 가드');

const CHOKEPOINT = 'src/services/media.ts';
const files = collect('src');

// ── 규칙 1: Storage 업로드는 초크포인트 한 곳뿐이다 ──
// 여기가 깨지면 새 경로는 EXIF 제거를 통과하지 않는다.
const uploaders = files.filter((p) => /storage\s*\.\s*from\s*\([^)]*\)\s*\.\s*upload\s*\(/.test(readFileSync(p, 'utf8')));
check(
  uploaders.length === 1 && rel(uploaders[0]) === CHOKEPOINT,
  `Storage 업로드 호출은 ${CHOKEPOINT} 한 곳뿐 (실제: ${uploaders.map(rel).join(', ') || '없음'})`,
);

// ── 규칙 2: 초크포인트가 실제로 메타데이터를 벗긴다 ──
const media = readSafe(CHOKEPOINT);
if (media === null) {
  check(false, `${CHOKEPOINT} 파일이 없다 (이름이 바뀌었으면 이 가드도 함께 고칠 것)`);
} else {
  check(/planMetadataStrip\s*\(/.test(media), `${CHOKEPOINT}가 planMetadataStrip()으로 판정한다`);
  check(/stripImageMetadata\s*\(/.test(media), `${CHOKEPOINT}가 stripImageMetadata()로 재인코딩한다`);
  // fail-closed — 제거에 실패했는데 업로드를 계속하면 그게 곧 위치 유출이다.
  check(
    /if\s*\(\s*!\s*cleaned\s*\)\s*return\s+uri\s*;/.test(media),
    `${CHOKEPOINT}가 제거 실패 시 업로드를 포기한다(fail-closed)`,
  );
  // Content-Type/확장자는 재인코딩 결과 기준이어야 한다(HEIC→jpeg 라벨 불일치 방지).
  check(
    /guessContentType\s*\(\s*src\s*\)/.test(media) && /fileExt\s*\(\s*src\s*\)/.test(media),
    `${CHOKEPOINT}가 Content-Type·확장자를 재인코딩 결과(src) 기준으로 잡는다`,
  );
}

// ── 규칙 3: 제거기가 리사이즈를 하지 않는다 ──
// 해상도를 건드리면 '원본 화질 백업'(프리미엄 혜택) 약속이 깨진다.
const compress = readSafe('src/utils/imageCompress.ts');
if (compress === null) {
  check(false, 'src/utils/imageCompress.ts 파일이 없다');
} else {
  // 함수 본문만 잘라 본다 — 파일 끝까지 보면 뒤에 있는 imageToDataUri의 resize에 걸린다.
  const start = compress.indexOf('export async function stripImageMetadata');
  const after = compress.indexOf('\nexport ', start + 1);
  const body = start < 0 ? '' : compress.slice(start, after < 0 ? undefined : after);
  check(body.length > 0, 'stripImageMetadata가 src/utils/imageCompress.ts에 있다');
  check(!/\.resize\s*\(/.test(body), 'stripImageMetadata는 resize를 걸지 않는다(해상도 보존)');
  check(/markMetadataStripped\s*\(/.test(compress), 'compressImage 결과가 장부에 등록된다(이중 압축 방지)');
}

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
