/**
 * 업로드 미디어 판정의 순수 로직 — 확장자 · Content-Type · 위치 메타데이터 제거 계획.
 *
 * 네이티브 재인코딩은 utils/imageCompress.ts(stripImageMetadata), 실제 업로드는
 * services/media.ts에 있고, 여기에는 RN·expo 의존이 없는 판정만 둔다
 * (mediaUploadPlan.verify.ts가 node로 검증한다).
 *
 * 왜 생겼나 — 업로드되는 사진 파일 안의 EXIF GPS가 서버에 그대로 영속됐다.
 * 좌표를 DB 컬럼에 넣는 코드는 0건이지만 `media` 버킷이 public이라(supabase/schema.sql의
 * `values ('media','media', true)`) URL만 알면 비인증으로 원본을 받아 촬영 위치를 읽을 수 있었다.
 * EXIF는 ImageManipulator 재인코딩의 부수 효과로만 벗겨지는데,
 *   - imageCompress.compressImage는 장변 1600px 이하면 재인코딩 없이 원본 uri를 그대로 돌려주고
 *   - 앨범 '원본' 모드 · DM 사진 · 모먼트 사진은 압축 경로를 아예 타지 않았다
 * 그래서 "업로드 직전"에서 한 번 막는다. 화면마다 흩뿌리면 새 화면이 생길 때 또 뚫린다.
 */

/** uri의 확장자(소문자). 없거나 판독 불가면 'jpg' — 기존 업로더의 기본값과 같다. */
export function fileExt(uri: string): string {
  const m = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] || 'jpg').toLowerCase();
}

/** Storage에 실어 보낼 Content-Type. 확장자 기준이며 알 수 없으면 image/jpeg. */
export function guessContentType(uri: string): string {
  switch (fileExt(uri)) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic':
    case 'heif': return 'image/heic';
    case 'gif': return 'image/gif';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'm4v': return 'video/x-m4v';
    case 'webm': return 'video/webm';
    default: return 'image/jpeg';
  }
}

/** 재인코딩 대상 확장자가 아닌 것들 */
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm']);

/** 저장 가능한 포맷 — expo-image-manipulator의 SaveFormat과 문자열 값이 같다(jpeg/png/webp). */
export type StripFormat = 'jpeg' | 'png' | 'webp';

export type StripPlan =
  | { action: 'strip'; format: StripFormat }
  | { action: 'skip'; reason: 'empty' | 'remote' | 'video' | 'already-stripped' | 'no-exif-format' };

// ── 이미 메타데이터가 없다고 확정된 uri 장부 ──
// ImageManipulator가 만든 파일은 비트맵을 새로 인코딩한 결과라 EXIF가 없다.
// 압축 경로(compressImage)를 이미 지난 사진을 업로드 시점에 또 굽으면
// 0.75 → 0.92 이중 압축이 되어 화질만 잃고 용량은 늘어난다. 그래서 장부로 걸러낸다.
const stripped = new Set<string>();
// 장부가 무한히 자라지 않게 상한을 둔다. 사진첩 1건이 최대 100장이고 축소본까지 200개라
// 1024면 한 발행을 통째로 덮는다. 넘치면 오래된 것부터 버리며, 잘못 버려도 손해는
// '한 번 더 재인코딩' 뿐이라 안전 방향으로 실패한다(유출 방향이 아니다).
const STRIPPED_MAX = 1024;

/** 메타데이터가 없음이 확정된 결과 파일을 장부에 올린다(ImageManipulator 출력 전용). */
export function markMetadataStripped(uri: string): void {
  if (!uri) return;
  if (stripped.size >= STRIPPED_MAX) {
    // Set은 삽입 순서를 지킨다 — 앞쪽(오래된 것)부터 절반을 비운다.
    let drop = Math.floor(STRIPPED_MAX / 2);
    for (const k of stripped) {
      stripped.delete(k);
      if (--drop <= 0) break;
    }
  }
  stripped.add(uri);
}

export function isMetadataStripped(uri: string): boolean {
  return !!uri && stripped.has(uri);
}

/** 검증 전용 — 장부 초기화 */
export function resetMetadataStripped(): void {
  stripped.clear();
}

/**
 * 업로드 직전 이 uri를 어떻게 다룰지 판정한다. 판정 순서가 곧 이유(reason)를 정한다.
 *
 * - remote: 이미 서버에 있는 URL(재업로드 아님)
 * - video: 동영상은 이 앱의 의존성으로 재인코딩할 수단이 없다 → 남은 갭(문서에 명시)
 * - already-stripped: ImageManipulator 출력 → 이중 압축 방지
 * - no-exif-format: GIF는 EXIF GPS를 담는 규격이 아니고, 재인코딩하면 애니메이션이 죽는다
 * - strip: 그 외 전부. 리사이즈 없이 포맷을 지켜 다시 인코딩한다
 *   (PNG를 JPEG로 바꾸면 투명도가 깨지므로 png/webp는 그대로, HEIC·확장자 불명은 jpeg)
 */
export function planMetadataStrip(uri: string): StripPlan {
  if (!uri) return { action: 'skip', reason: 'empty' };
  if (/^https?:\/\//.test(uri)) return { action: 'skip', reason: 'remote' };
  const ext = fileExt(uri);
  if (VIDEO_EXTS.has(ext)) return { action: 'skip', reason: 'video' };
  if (isMetadataStripped(uri)) return { action: 'skip', reason: 'already-stripped' };
  if (ext === 'gif') return { action: 'skip', reason: 'no-exif-format' };
  if (ext === 'png') return { action: 'strip', format: 'png' };
  if (ext === 'webp') return { action: 'strip', format: 'webp' };
  return { action: 'strip', format: 'jpeg' };
}
