// 네컷/컷사진 — 레이아웃 사양 + 프레임 카탈로그 (정적 데이터)

export type CutLayout = 'two-h' | 'two-v' | 'three-v' | 'four' | 'nine' | 'four-v' | 'four-h' | 'six-v' | 'film' | 'film-h' | 'four-compact' | 'four-stagger';

export interface CutSlot { x: number; y: number; w: number; h: number } // 0~1 비율

export interface CutLayoutSpec {
  label: string;
  aspect: number; // width / height
  slots: CutSlot[];
  film?: 'v' | 'h'; // 필름 스트립 장식(천공) 방향 — 세로/가로
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

// 포토이즘 스타일 2컷 세로형 스트립 슬롯 배치 (실제 비율 1:2, 사진 비율 4:3, 간격 6% 균일 적용)
function twoSlotsV(): CutSlot[] {
  // aspect = 1 / 2 (H = 2 * W), 사진 가로세로 비율 = 4:3 (h_px = 3/4 * w_px)
  // 좌/우/상단 마진 및 사진 간 세로 간격은 물리적으로 가로 크기 W의 6%로 동일 (x = 0.06, gap_y = 0.06 => gy = 0.03 in 1:2 aspect)
  const w = 0.88;       // 사진 가로 비율 (1 - 2 * 0.06)
  const h = 0.33;       // 사진 세로 비율 (0.88 * 0.75 / 2)
  const x = 0.06;
  const y0 = 0.03;      // 상단 마진 (0.06 / 2)
  const y1 = y0 + h + 0.03; // y1 = 0.39 (0.03 + 0.33 + 0.03)
  return [
    { x, y: y0, w, h },
    { x, y: y1, w, h },
  ];
}

// 포토이즘 스타일 3컷 세로형 스트립 슬롯 배치 (실제 비율 2:5, 사진 비율 4:3, 간격 5% 균일 적용)
function threeSlotsV(): CutSlot[] {
  // aspect = 2 / 5 (H = 2.5 * W), 사진 가로세로 비율 = 4:3 (h_px = 3/4 * w_px)
  // 좌/우/상단 마진 및 사진 간 세로 간격은 물리적으로 가로 크기 W의 5%로 동일 (x = 0.05, gap_y = 0.05 => gy = 0.02 in 2:5 aspect)
  const w = 0.90;       // 사진 가로 비율 (1 - 2 * 0.05)
  const h = 0.27;       // 사진 세로 비율 (0.90 * 0.75 / 2.5)
  const x = 0.05;
  const y0 = 0.02;      // 상단 마진 (0.05 / 2.5)
  const y1 = y0 + h + 0.02; // y1 = 0.31 (0.02 + 0.27 + 0.02)
  const y2 = y1 + h + 0.02; // y2 = 0.60 (0.31 + 0.27 + 0.02)
  return [
    { x, y: y0, w, h },
    { x, y: y1, w, h },
    { x, y: y2, w, h },
  ];
}

// 포토이즘 스타일 4컷 정사각형(2x2 바둑판형) 슬롯 배치 (실제 비율 1:1, 사진 비율 4:3, 테두리 5%, 내부 간격 4% 균일 적용)
function fourSlotsSquare(): CutSlot[] {
  // aspect = 1.0, 사진 가로세로 비율 = 4:3 (h = w * 0.75)
  // 좌/우/상단 마진 = 5% (0.05), 내부 십자 간격 = 4% (0.04)
  const w = 0.43;
  const h = 0.3225;
  const mx = 0.05;
  const my = 0.05;
  const gx = 0.04;
  const gy = 0.04;
  return [
    { x: mx,          y: my,          w, h },
    { x: mx + w + gx, y: my,          w, h },
    { x: mx,          y: my + h + gy, w, h },
    { x: mx + w + gx, y: my + h + gy, w, h },
  ];
}

// 4컷 콤팩트 슬롯 배치 (아래 큰 빈공간 없이 상하좌우 마진 5% 동일 적용)
function fourSlotsCompact(): CutSlot[] {
  const w = 0.43;
  const mx = 0.05;
  const gx = 0.04;
  const h = 0.3225 / 0.785;
  const my = 0.05 / 0.785;
  const gy = 0.04 / 0.785;
  return [
    { x: mx,          y: my,          w, h },
    { x: mx + w + gx, y: my,          w, h },
    { x: mx,          y: my + h + gy, w, h },
    { x: mx + w + gx, y: my + h + gy, w, h },
  ];
}

// 콘택트시트(photoism류) 참고 4컷 엇갈림 — 좌 컬럼은 위에서, 우 컬럼은 한 칸 아래로 밀려 시작.
// aspect 2:3(세로), 사진 ≈4:5 세로 비율. 우측 상단 빈 칸은 여백(무드), 하단 ~12%는 로고·스탬프 밴드.
function fourSlotsStagger(): CutSlot[] {
  const mx = 0.045;          // 좌우 마진
  const w = (1 - mx * 2 - 0.04) / 2; // 컬럼 폭(~0.435), 컬럼 간격 0.04
  const h = 0.335;           // 사진 높이(H 기준) ≈4:5 — 하단 밴드(~17%)에 문구+날짜+로고 스택이 넘치지 않게 확보
  const gy = 0.025;          // 사진 세로 간격
  const topL = 0.03;         // 좌 컬럼 시작
  const topR = topL + 0.105; // 우 컬럼은 아래로 엇갈림
  const xR = mx + w + 0.04;
  return [
    { x: mx, y: topL,          w, h },
    { x: xR, y: topR,          w, h },
    { x: mx, y: topL + h + gy, w, h },
    { x: xR, y: topR + h + gy, w, h },
  ];
}

// 포토이즘 스타일 9컷 정사각형(3x3 바둑판형) 슬롯 배치 (실제 비율 1:1, 사진 비율 4:3, 테두리 4%, 내부 간격 3% 균일 적용)
function nineSlotsSquare(): CutSlot[] {
  // aspect = 1.0, 사진 가로세로 비율 = 4:3 (h = w * 0.75)
  // 좌/우/상단 마진 = 4% (0.04), 내부 격자 간격 = 3% (0.03)
  const w = 0.286667;
  const h = 0.215;
  const mx = 0.04;
  const my = 0.04;
  const gx = 0.03;
  const gy = 0.03;
  
  const slots: CutSlot[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      slots.push({
        x: mx + c * (w + gx),
        y: my + r * (h + gy),
        w,
        h,
      });
    }
  }
  return slots;
}

// 일반 4컷 세로/가로 슬롯 배치 (천공이 없는 기본 프레임용)
function fourSlotsV(n = 4): CutSlot[] {
  const g_factor = 0.04;    // 프레임과 사진 간격 4% (3~5% 사이)
  const side = g_factor;    // 일반 4컷이므로 천공 없이 좌우 마진도 g_factor 적용
  const w = 1 - side * 2;    // 사진 가로 비율
  const h = w / 4;           // 사진 세로 비율 (전체 H=3 기준 실제 사진비율 4:3)
  const gap = g_factor / 3;  // 사진 간 세로 간격 비율 (H=3 기준)
  const top = g_factor / 3;  // 상단 여백 비율 (H=3 기준)
  return Array.from({ length: n }, (_, i) => ({
    x: side, y: top + i * (h + gap), w, h,
  }));
}
function fourSlotsH(n = 4): CutSlot[] {
  const g_factor = 0.04;    // 프레임과 사진 간격 4% (3~5% 사이)
  const band = g_factor;    // 상하 마진도 g_factor 적용
  const h = 1 - band * 2;    // 사진 세로 비율
  const w = h / 4;           // 사진 가로 비율 (전체 W=3 기준 실제 사진비율 3:4)
  const gap = g_factor / 3;  // 사진 간 가로 간격 비율 (W=3 기준)
  
  // 좌우 여백을 정확히 동일하게 대칭 배분
  const left = (1.0 - n * w - (n - 1) * gap) / 2;
  
  return Array.from({ length: n }, (_, i) => ({
    x: left + i * (w + gap), y: band, w, h,
  }));
}

// 포토이즘 스타일 6컷 2x3 바둑판형 슬롯 배치 (실제 비율 2:3, 사진 비율 4:3, 테두리 5%, 내부 간격 4% 균일 적용)
function sixSlotsV(): CutSlot[] {
  // aspect = 2 / 3 (H = 1.5 * W), 사진 가로세로 비율 = 4:3 (h = w * 0.75)
  // 좌/우/상단 마진 = 5% (0.05), 내부 간격 = 4% (0.04)
  const w = 0.43;
  const h = 0.215;      // (0.43 * 0.75) / 1.5 = 0.215
  const mx = 0.05;
  const my = 0.033333;  // 0.05 / 1.5
  const gx = 0.04;
  const gy = 0.026667;  // 0.04 / 1.5
  
  const slots: CutSlot[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      slots.push({
        x: mx + c * (w + gx),
        y: my + r * (h + gy),
        w,
        h,
      });
    }
  }
  return slots;
}

// 필름 스트립: 가장자리에 천공(스프로킷 홀) 자리를 비워둔 슬롯 배치
function filmSlotsV(n = 4): CutSlot[] {
  const g_factor = 0.04;    // 프레임과 사진 간격 4% (3~5% 사이)
  const side = 0.145;       // 좌우 천공 영역 (가로 비율)
  const w = 1 - side * 2;    // 사진 가로 비율
  const h = w / 4;           // 사진 세로 비율 (전체 H=3 기준 실제 사진비율 4:3)
  const gap = g_factor / 3;  // 사진 간 세로 간격 비율 (H=3 기준)
  const top = g_factor / 3;  // 상단 여백 비율 (H=3 기준)
  return Array.from({ length: n }, (_, i) => ({
    x: side, y: top + i * (h + gap), w, h,
  }));
}
function filmSlotsH(n = 4): CutSlot[] {
  const g_factor = 0.04;    // 프레임과 사진 간격 4% (3~5% 사이)
  const band = 0.145;       // 상하 천공 영역 (세로 비율)
  const h = 1 - band * 2;    // 사진 세로 비율
  const w = h / 4;           // 사진 가로 비율 (전체 W=3 기준 실제 사진비율 3:4)
  const gap = g_factor / 3;  // 사진 간 가로 간격 비율 (W=3 기준)
  const left = g_factor / 3; // 좌측 여백 비율 (W=3 기준)
  return Array.from({ length: n }, (_, i) => ({
    x: left + i * (w + gap), y: band, w, h,
  }));
}

export const CUT_LAYOUTS: Record<CutLayout, CutLayoutSpec> = {
  'two-h':   { label: '2컷 가로', aspect: 4 / 3,  slots: grid(2, 1) },
  'two-v':   { label: '2컷 세로', aspect: 1 / 2,  slots: twoSlotsV() },
  'three-v': { label: '3컷 세로',  aspect: 2 / 5,  slots: threeSlotsV() },
  'four-v':  { label: '4컷 세로',  aspect: 1 / 3,  slots: fourSlotsV(4) },
  'four-h':  { label: '4컷 가로',  aspect: 3 / 1,  slots: fourSlotsH(4) },
  'four':    { label: '4컷',       aspect: 1,      slots: fourSlotsSquare() },
  'six-v':   { label: '6컷 세로',  aspect: 2 / 3,  slots: sixSlotsV() },
  'nine':    { label: '9컷',       aspect: 1,      slots: nineSlotsSquare() },
  'film':    { label: '필름 세로', aspect: 1 / 3,  slots: filmSlotsV(4), film: 'v' },
  'film-h':  { label: '필름 가로', aspect: 3 / 1,  slots: filmSlotsH(4), film: 'h' },
  'four-compact': { label: '4컷 콤팩트', aspect: 1 / 0.785, slots: fourSlotsCompact() },
  // 콘택트시트(photoism류) 참고 — 좌우 컬럼이 엇갈리는 4컷. 하단 12%는 로고·스탬프 밴드
  'four-stagger': { label: '4컷 엇갈림', aspect: 2 / 3, slots: fourSlotsStagger() },
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
  backgroundStyle?: any;
}

// 기본 프레임: 레이아웃마다 흰색 1종 (색은 사용자가 RGB로 자유 설정 → 캔버스에서 오버라이드)
// 필름 레이아웃은 테마에만 두고 기본에서는 제외
// React Native 환경(Hermes 엔진 등)에서 일관성 있는 순서 보장을 위해 명시적 순서 배열 정의
const BASIC_LAYOUT_ORDER: CutLayout[] = [
  'two-h',
  'two-v',
  'three-v',
  'four-v',
  'four-h',
  'four',
  'six-v',
  'nine',
];

const BASIC: CutFrame[] = BASIC_LAYOUT_ORDER.map((l): CutFrame => ({
  id: `basic-${l}`, name: CUT_LAYOUTS[l].label, category: '기본', layout: l,
  background: { type: 'color', value: '#FFFFFF' }, border: { color: '#FFFFFF', width: 0, radius: 6 },
}));

// 테마 프레임: 초기 소수(색 기반). 배경 이미지 테마는 assets 추가 후 확장.
// (브루클린 벽돌·스카이·선셋은 2026-07-10 제거 — 기존 기록의 해당 frameId는 getCutFrame이 undefined를 반환하고
//  렌더러들이 폴백 처리한다: CutPhotoCanvas는 미렌더, 피드 카드는 기본 레이아웃/색으로)
const THEME: CutFrame[] = [
  {
    id: 'theme-film-mono', name: '모노 필름 (세로)', category: '테마', layout: 'film',
    background: { type: 'color', value: '#0A0A0F' }, border: { color: '#2E2E3B', width: 1, radius: 4 },
  },
  // eOrth 오리지널 테마 — 나이트 콘택트: 새까만 시트 + 엇갈린 4컷 (photoism류 콘택트시트 '참고'만, 자체 디자인)
  {
    id: 'theme-contact-night', name: '나이트 콘택트', category: '테마', layout: 'four-stagger',
    background: { type: 'color', value: '#101014' }, border: { color: '#26262E', width: 1.5, radius: 6 },
  },
];

export const CUT_FRAMES: CutFrame[] = [...BASIC, ...THEME];

export const getCutFrame = (id: string): CutFrame | undefined =>
  CUT_FRAMES.find((f) => f.id === id);
