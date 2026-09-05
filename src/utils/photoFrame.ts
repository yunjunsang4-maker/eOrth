// 피드 사진 프레임 — 게시물 단위로 글쓴이가 고르는 비율·채움색.
// 상세(SlideImageViewerDetail)와 작성 미리보기(PhotoPagerSection)가 이 함수로 같은 높이를
// 계산해야 두 화면이 어긋나지 않는다. 원본('original')이면 프레임을 안 쓰고 기존
// 비율대로 렌더가 유지된다(옛 글 호환).

export type PhotoFrameRatio = 'original' | '4:5' | '1:1';
export type PhotoFrameFill = 'black' | 'white';
export type PhotoFrame = { ratio: PhotoFrameRatio; fill: PhotoFrameFill };

export const PHOTO_FRAME_RATIOS: readonly PhotoFrameRatio[] = ['original', '4:5', '1:1'];
export const PHOTO_FRAME_FILLS: readonly PhotoFrameFill[] = ['black', 'white'];
export const DEFAULT_PHOTO_FRAME: PhotoFrame = { ratio: 'original', fill: 'black' };

// 높이/폭 배수. 원본은 없음.
const RATIO_MULT: Record<Exclude<PhotoFrameRatio, 'original'>, number> = { '4:5': 5 / 4, '1:1': 1 };
const FILL_HEX: Record<PhotoFrameFill, string> = { black: '#000000', white: '#FFFFFF' };

/** 프레임이 실제로 적용되는가. 원본·undefined·null은 false. */
export function isFramed(frame?: PhotoFrame | null): boolean {
  return !!frame && frame.ratio !== 'original';
}

/** 프레임 높이(px, 반올림). 원본이면 null — 호출자가 기존 비율 로직을 쓴다. */
export function frameHeight(frame: PhotoFrame | null | undefined, width: number): number | null {
  if (!frame || frame.ratio === 'original') return null;
  return Math.round(width * RATIO_MULT[frame.ratio]);
}

/** 채움색 hex. */
export function frameFillColor(fill: PhotoFrameFill): string {
  return FILL_HEX[fill];
}

/** 저장된 값 정규화 — 옛 글(필드 없음)·서버에서 온 깨진 값을 항목별 기본값으로 떨어뜨린다. */
export function normalizePhotoFrame(raw: unknown): PhotoFrame {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHOTO_FRAME };
  const r = (raw as { ratio?: unknown }).ratio;
  const f = (raw as { fill?: unknown }).fill;
  return {
    ratio: PHOTO_FRAME_RATIOS.includes(r as PhotoFrameRatio) ? (r as PhotoFrameRatio) : DEFAULT_PHOTO_FRAME.ratio,
    fill: PHOTO_FRAME_FILLS.includes(f as PhotoFrameFill) ? (f as PhotoFrameFill) : DEFAULT_PHOTO_FRAME.fill,
  };
}

/** 저장용 — 원본이면 필드를 생략해 옛 글과 저장 형태를 같게 한다(불필요한 diff 방지). */
export function serializePhotoFrame(frame: PhotoFrame): PhotoFrame | undefined {
  return isFramed(frame) ? { ratio: frame.ratio, fill: frame.fill } : undefined;
}
