// 피드 사진 프레임 — 게시물 단위로 글쓴이가 고르는 비율·채움색.
// 상세(SlideImageViewerDetail)와 작성 미리보기(PhotoPagerSection)가 이 함수로 같은 높이를
// 계산해야 두 화면이 어긋나지 않는다. 원본('original')이면 프레임을 안 쓰고 기존
// 비율대로 렌더가 유지된다(옛 글 호환).
//
// v2(2026-09-06): 비율 8종·색 10종으로 확장. 폰 세로 사진은 대개 3:4라 4:5·1:1로는 좌우 띠만
// 생겼다 — 3:4보다 긴 2:3이 있어야 위아래 띠가 나온다(9:16은 미리보기가 너무 길어 9/7 제거,
// 저장돼 있던 '9:16'은 normalize에서 원본으로 떨어진다). v1이 저장한 '4:5'·'1:1'과
// 'black'·'white'는 목록에 그대로 남아 있어 옛 글이 계속 유효하다.

export type PhotoFrameRatio = 'original' | '1:1' | '4:5' | '3:4' | '2:3' | '4:3' | '16:9';
export type PhotoFrameFill =
  | 'black' | 'white' | 'cream' | 'gray' | 'charcoal'
  | 'navy' | 'lavender' | 'pink' | 'sky' | 'mint';
export type PhotoFrame = { ratio: PhotoFrameRatio; fill: PhotoFrameFill };

export const PHOTO_FRAME_RATIOS: readonly PhotoFrameRatio[] =
  ['original', '1:1', '4:5', '3:4', '2:3', '4:3', '16:9'];
export const PHOTO_FRAME_FILLS: readonly PhotoFrameFill[] =
  ['black', 'white', 'cream', 'gray', 'charcoal', 'navy', 'lavender', 'pink', 'sky', 'mint'];
export const DEFAULT_PHOTO_FRAME: PhotoFrame = { ratio: 'original', fill: 'black' };

type FramedRatio = Exclude<PhotoFrameRatio, 'original'>;

// 비율의 [폭, 높이]. 높이 배수와 아이콘 폭/높이 비를 여기 하나에서 파생시킨다 —
// 두 표를 따로 두면 비율을 추가할 때 한쪽만 고쳐 미리보기와 아이콘이 어긋난다.
const RATIO_WH: Record<FramedRatio, readonly [number, number]> = {
  '1:1': [1, 1],
  '4:5': [4, 5],
  '3:4': [3, 4],
  '2:3': [2, 3],
  '4:3': [4, 3],
  '16:9': [16, 9],
};

const FILL_HEX: Record<PhotoFrameFill, string> = {
  black: '#000000',
  white: '#FFFFFF',
  cream: '#F5EFE6',
  gray: '#D9D9DE',
  charcoal: '#2E2E3B',
  navy: '#1B2A4A',
  lavender: '#C9B8F0',
  pink: '#F4C7D4',
  sky: '#BFDCF2',
  mint: '#C4EBDD',
};

/** 프레임이 실제로 적용되는가. 원본·undefined·null은 false. */
export function isFramed(frame?: PhotoFrame | null): boolean {
  return !!frame && frame.ratio !== 'original';
}

/** 프레임 높이(px, 반올림). 원본이면 null — 호출자가 기존 비율 로직을 쓴다. */
export function frameHeight(frame: PhotoFrame | null | undefined, width: number): number | null {
  if (!frame || frame.ratio === 'original') return null;
  const [w, h] = RATIO_WH[frame.ratio];
  return Math.round((width * h) / w);
}

/** 채움색 hex. */
export function frameFillColor(fill: PhotoFrameFill): string {
  return FILL_HEX[fill];
}

/** 비율 칩의 모양 아이콘용 폭/높이 비. 원본은 아이콘 없이 라벨만 쓰므로 null. */
export function frameRatioAspect(ratio: PhotoFrameRatio): number | null {
  if (ratio === 'original') return null;
  const [w, h] = RATIO_WH[ratio];
  return w / h;
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
