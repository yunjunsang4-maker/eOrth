// 배치 파리티 정적 가드 — 코드모드로 대량 치환한 규칙이 조용히 원상복귀되는 것을 막는다.
// 이 저장소는 76곳 코드모드 주입 이력이 있고(8/3 파리티 감사), 그때 오주입 여부를
// 사람 눈으로만 확인했다. 같은 일을 반복하지 않기 위한 자동 검사다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);

function collect(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (p) => p.split(sep).join('/');
let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('배치 파리티');

// ── 규칙 1: 루트 클램프가 살아 있다 ──
// 이게 빠지면 폴드·태블릿에서 전 화면이 늘어난다. 값은 stageMath와 같아야 한다.
const stageMath = readFileSync('src/utils/stageMath.ts', 'utf8');
const maxW = Number(stageMath.match(/STAGE_MAX_W = (\d+)/)?.[1]);
const app = readFileSync('App.tsx', 'utf8');
check(maxW === 480, `STAGE_MAX_W === 480 (실제 ${maxW})`);
check(
  app.includes('STAGE_MAX_W') && /maxWidth:\s*STAGE_MAX_W/.test(app),
  'App.tsx가 maxWidth: STAGE_MAX_W로 루트를 클램프한다',
);
check(
  /alignSelf:\s*'center'/.test(app),
  'App.tsx 루트 컨테이너가 중앙 정렬된다',
);

// ── 규칙 2: 실시간 대상 파일에 모듈 최상위 Dimensions 상수가 남아 있지 않다 ──
// 이 파일들은 폭이 스크롤 오프셋 계산에 들어간다. 박제된 값이면 폴드를 펼쳤을 때
// 페이저가 엉뚱한 사진을 가리키고 getItemLayout 스크롤 위치가 어긋난다.
const REALTIME = [
  'src/components/PhotoViewerModal.tsx',
  'src/components/CutPhotoAdjustModal.tsx',
  'src/components/PuzzlePhotoAdjustOverlay.tsx',
  'src/components/QuickShareOverlay.tsx',
  'src/components/record/PhotoPagerSection.tsx',
  'src/components/record/MediaPickerModal.tsx',
  'src/screens/PostDetailScreen.tsx',
  'src/screens/BlogRecordScreen.tsx',
  'src/screens/AppIntroScreen.tsx',
  'src/screens/TripDetailScreen.tsx',
  'src/components/PuzzleShareCard.tsx',
];
for (const f of REALTIME) {
  const src = readFileSync(f, 'utf8');
  // 모듈 최상위 = 줄 맨 앞에서 시작하는 const/let 선언
  const frozen = src.split('\n').filter((l) => /^(const|let)\s.*Dimensions\.get\(/.test(l));
  check(frozen.length === 0, `${f} 모듈 최상위 Dimensions 상수 없음 (${frozen.length}건)`);
}

// ── 규칙 3: src 전역에 모듈 최상위 Dimensions 폭 상수가 없다 ──
// 새 화면을 만들 때 Dimensions.get('window').width를 다시 쓰면 폴드에서 어긋난다.
// 세로(.height)는 clamp 대상이 아니므로 허용한다.
const ALLOW_FROZEN = new Set([
  'src/components/MainCoachmark.tsx', // 초기값일 뿐, onLayout으로 갱신됨(136행)
]);
for (const f of collect('src', '.tsx').concat(collect('src', '.ts'))) {
  const p = rel(f);
  if (ALLOW_FROZEN.has(p)) continue;
  const bad = readFileSync(f, 'utf8').split('\n').filter(
    (l) => /^(const|let)\s.*Dimensions\.get\(/.test(l) && /width/.test(l),
  );
  check(bad.length === 0, `${p} 모듈 최상위 폭 상수 없음`);
}

// ── 규칙 4: 320dp를 넘는 고정 폭이 없다 ──
// 360dp 기기에서 가로로 넘친다. maxWidth: 는 이미 캡이라 제외한다((?<!max) lookbehind).
// 이 휴리스틱은 값이 '고정 레이아웃 폭'인지 모른다 — DS 같은 반응형 배율과 곱해지는
// 디자인 캔버스 상수도 문자 그대로는 잡힌다. 그런 경우만 근거 주석과 함께 허용한다.
const ALLOW_WIDE = new Set([
  // introVisuals.tsx:301 IntroVisual4 오브 스프라이트 — width: 367 * DS.
  // DS = stageWidthNow()/402(디자인 캔버스 402pt 대비 배율)라 실제 렌더 폭은 항상
  // 화면폭의 약 91%(367/402)로, 기기 폭을 절대 넘지 않는다(360dp에서 약 329px).
  // left 오프셋도 같은 367*DS로 중심을 잡으므로, width만 '100%'+maxWidth로 바꾸면
  // 오프셋과 크기가 어긋나 장식 스프라이트가 중심에서 벗어난다 — 진짜 오버플로우가
  // 아니라 휴리스틱의 오탐으로 판단해 유지한다.
  'src/screens/introVisuals.tsx',
]);
for (const f of collect('src', '.tsx')) {
  const p = rel(f);
  if (ALLOW_WIDE.has(p)) continue;
  const over = [...readFileSync(f, 'utf8').matchAll(/(?<!max)[Ww]idth:\s*(\d{3,})/g)]
    .filter((m) => Number(m[1]) > 320);
  check(over.length === 0, `${p} 320dp 초과 고정 폭 없음`);
}

// ── 규칙 5: useStageWidth()를 쓰는 파일이 <Modal>도 갖고 있으면 STAGE_MAX_W도 있어야 한다 ──
// RN Modal은 App.tsx의 루트 클램프 바깥(네이티브 풀스크린)에 그려진다. Stage 폭을 그대로
// Modal 안 콘텐츠 크기에 쓰면 폴드·태블릿에서 클램프가 빠진 채 렌더되어 중앙 정렬이 깨진다.
// Task 3에서 같은 모양의 회귀가 2건 있었고 사람 눈으로만 잡혔다 — 이 규칙은 그 재발 방지용
// 휴리스틱이다(증명이 아니다: STAGE_MAX_W가 있다고 반드시 옳다는 보장도, 없다고 반드시
// 틀렸다는 보장도 아니다). 걸리면 사람이 Modal 콘텐츠가 실제로 Stage 폭을 쓰는지 확인할 것.
const ALLOW_MODAL_STAGE = new Set([
  // PostDetailScreen.tsx: useStageWidth()는 본문(cutImage·albumGridImg·SnapStoryViewer
  // 페이징)에만 쓰이고, 이 파일의 <Modal> 4곳(메뉴·공유시트·좋아요목록·SnapViewerModal 내부)은
  // 전부 SCREEN_W를 받지 않는 별도 스타일셋(menuCard 고정폭 180 등)이라 Stage 폭이
  // Modal로 새지 않는다 — 확인 완료된 오탐. (Modal 시트 자체의 폭 클램프는 별도 과제인
  // "바텀시트 클램프"에서 다룬다.)
  'src/screens/PostDetailScreen.tsx',
]);
for (const f of collect('src', '.tsx')) {
  const p = rel(f);
  if (ALLOW_MODAL_STAGE.has(p)) continue;
  const src = readFileSync(f, 'utf8');
  if (src.includes('useStageWidth(') && /<Modal/.test(src)) {
    check(src.includes('STAGE_MAX_W'), `${p} useStageWidth()+<Modal>이면 STAGE_MAX_W로 재클램프해야 함(휴리스틱 — 오탐이면 ALLOW_MODAL_STAGE에 근거와 함께 등록)`);
  }
}

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
