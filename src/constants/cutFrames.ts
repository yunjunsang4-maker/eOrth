// 네컷/컷사진 — 레이아웃 사양 + 프레임 카탈로그 (정적 데이터)

export type CutLayout = 'two-h' | 'two-v' | 'three-v' | 'four' | 'nine' | 'film';

export interface CutSlot { x: number; y: number; w: number; h: number } // 0~1 비율

export interface CutLayoutSpec {
  label: string;
  aspect: number; // width / height
  slots: CutSlot[];
}

// gap(슬롯 사이/바깥 여백) 비율을 반영한 격자 슬롯 생성
function grid(cols: number, rows: number, gap = 0.03): CutSlot[] {
  const out: CutSlot[] = [];
  const cw = (1 - gap * (cols + 1)) / cols;
  const ch = (1 - gap * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: gap + c * (cw + gap), y: gap + r * (ch + gap), w: cw, h: ch });
    }
  }
  return out;
}

export const CUT_LAYOUTS: Record<CutLayout, CutLayoutSpec> = {
  'two-h':   { label: '투컷 가로', aspect: 4 / 3,  slots: grid(2, 1) },
  'two-v':   { label: '투컷 세로', aspect: 3 / 4,  slots: grid(1, 2) },
  'three-v': { label: '3컷 세로',  aspect: 9 / 16, slots: grid(1, 3) },
  'four':    { label: '4컷',       aspect: 1,      slots: grid(2, 2) },
  'nine':    { label: '9컷',       aspect: 1,      slots: grid(3, 3) },
  'film':    { label: '필름',      aspect: 1 / 3,  slots: grid(1, 4, 0.04) },
};

export const cutSlotCount = (l: CutLayout): number => CUT_LAYOUTS[l].slots.length;

export type CutBg =
  | { type: 'color'; value: string }
  | { type: 'image'; source: any };

export interface CutFrame {
  id: string;
  name: string;
  category: '기본' | '테마';
  layout: CutLayout;
  background: CutBg;
  border?: { color: string; width: number; radius: number };
}

// 기본 프레임: 레이아웃마다 화이트/블랙 2종
const BASIC: CutFrame[] = (Object.keys(CUT_LAYOUTS) as CutLayout[]).flatMap((l): CutFrame[] => [
  {
    id: `basic-white-${l}`, name: `${CUT_LAYOUTS[l].label} · 화이트`, category: '기본', layout: l,
    background: { type: 'color', value: '#FFFFFF' }, border: { color: '#FFFFFF', width: 0, radius: 6 },
  },
  {
    id: `basic-black-${l}`, name: `${CUT_LAYOUTS[l].label} · 블랙`, category: '기본', layout: l,
    background: { type: 'color', value: '#111114' }, border: { color: '#111114', width: 0, radius: 6 },
  },
]);

// 테마 프레임: 초기 소수(색 기반). 배경 이미지 테마는 assets 추가 후 확장.
const THEME: CutFrame[] = [
  {
    id: 'theme-neon-four', name: '네온 퍼플', category: '테마', layout: 'four',
    background: { type: 'color', value: '#1A0A2E' }, border: { color: '#BF85FC', width: 2, radius: 10 },
  },
  {
    id: 'theme-film-mono', name: '모노 필름', category: '테마', layout: 'film',
    background: { type: 'color', value: '#0A0A0F' }, border: { color: '#2E2E3B', width: 1, radius: 4 },
  },
  {
    id: 'theme-sunset-two-v', name: '선셋', category: '테마', layout: 'two-v',
    background: { type: 'color', value: '#2E0A1A' }, border: { color: '#FF6B9D', width: 2, radius: 12 },
  },
];

export const CUT_FRAMES: CutFrame[] = [...BASIC, ...THEME];

export const getCutFrame = (id: string): CutFrame | undefined =>
  CUT_FRAMES.find((f) => f.id === id);
