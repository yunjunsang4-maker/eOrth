// 배치 파리티 정적 가드 — 코드모드로 대량 치환한 규칙이 조용히 원상복귀되는 것을 막는다.
// 이 저장소는 76곳 코드모드 주입 이력이 있고(8/3 파리티 감사), 그때 오주입 여부를
// 사람 눈으로만 확인했다. 같은 일을 반복하지 않기 위한 자동 검사다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

// ── 규칙 5: Stage 폭을 쓰는 파일이 <Modal>도 갖고 있으면 STAGE_MAX_W도 있어야 한다 ──
// RN Modal은 App.tsx의 루트 클램프 바깥(네이티브 풀스크린)에 그려진다. Stage 폭을 그대로
// Modal 안 콘텐츠 크기에 쓰면 폴드·태블릿에서 클램프가 빠진 채 렌더되어 중앙 정렬이 깨진다.
// Task 3에서 같은 모양의 회귀가 2건 있었고 사람 눈으로만 잡혔다 — 이 규칙은 그 재발 방지용
// 휴리스틱이다(증명이 아니다: STAGE_MAX_W가 있다고 반드시 옳다는 보장도, 없다고 반드시
// 틀렸다는 보장도 아니다). 걸리면 사람이 Modal 콘텐츠가 실제로 Stage 폭을 쓰는지 확인할 것.
// useStageWidth()(훅)뿐 아니라 stageWidthNow()(모듈 최상위 상수)도 같은 값을 주므로 함께 본다
// — Task 4 산출물은 전부 stageWidthNow()라, useStageWidth()만 보면 이 규칙이 한 번도 안 걸린다.
const ALLOW_MODAL_STAGE = new Set([
  // PostDetailScreen.tsx: useStageWidth()는 본문(cutImage·albumGridImg·SnapStoryViewer
  // 페이징)에만 쓰이고, 이 파일의 <Modal> 4곳(메뉴·공유시트·좋아요목록·SnapViewerModal 내부)은
  // 전부 SCREEN_W를 받지 않는 별도 스타일셋(menuCard 고정폭 180 등)이라 Stage 폭이
  // Modal로 새지 않는다 — 확인 완료된 오탐. (Modal 시트 자체의 폭 클램프는 별도 과제였던
  // "바텀시트 클램프"에서 처리됨 — likersSheet·shareS.sheet에 STAGE_MAX_W 적용 완료.
  // 그래서 이 파일은 지금 allowlist 없이도 규칙 5를 통과하지만, 위 오탐 분석을 남겨 둔다.)
  'src/screens/PostDetailScreen.tsx',
  // 아래 7개는 <Modal>·Stage 상수(stageWidthNow())가 규칙 5로 확대된 뒤 실제로 걸려서
  // 파일 안 모든 <Modal>...</Modal> 블록과 그 안 파생 상수(예: CARD_W, GRID_W)까지
  // 직접 대조해 확인한 결과다(스크립트: 각 Modal 구간 텍스트에서 해당 상수 참조 여부 검색).
  //
  // CutRecordScreen.tsx: SCREEN_W/maxW는 화면 본문에만 쓰이고 <Modal> 2곳(474·514행)
  // 안에는 참조가 전혀 없다.
  'src/screens/CutRecordScreen.tsx',
  // DMScreen.tsx: SW·SW 파생값(msgImage, CARD_W)은 채팅 리스트 아이템 스타일에만 쓰이고
  // <Modal> 4곳(890·935·948·994행) 안에는 참조가 전혀 없다.
  'src/screens/DMScreen.tsx',
  // MainScreen.tsx: width가 "영토 표시 설정" Modal(2340~2675행) 안으로 흘러드는 파생값이
  // 최소 2개 있다 — ① DS_CARD_W = Math.min(325, width - 24): 실제 기기 폭(≥349dp에서
  // 이미 325로 고정) 범위에서는 항상 325로 캡돼 Stage/창 폭 차이가 결과값에 영향을 못
  // 준다. ② maxW = width - 88(972행, puzzlePreview.w로 2521·2529행 Svg에 쓰임): 이건
  // 캡이 작은 값이 아니라 width에 거의 선형으로 비례하지만, 그래서 오히려 Stage(≤480)
  // 기준이 창 폭 기준보다 정답에 더 가깝다 — 창 폭(폴드·태블릿에서 900dp+)을 그대로 썼다면
  // 실루엣 미리보기가 시트보다 훨씬 넓게 그려져 더 크게 잘렸을 것이다. 두 파생값 모두
  // 재클램프가 필요한 방향(Stage보다 커짐)이 아니라 이미 Stage 쪽이 안전한 값이라
  // 회귀가 아니다. 이 모달의 오버레이(fmOverlay)도 alignItems:'center'로 '창' 중앙
  // 정렬인데, 클램프된 컬럼 자체가 창 중앙에 있어 두 중앙이 같은 좌표라 폴드·태블릿에서도
  // 카드가 쏠리지 않는다 — 재클램프가 필요 없는 걸로 확인됨.
  'src/screens/MainScreen.tsx',
  // NewRecordScreen.tsx: 실제 <Modal> JSX가 없다. 1934행의 "<Modal>"은 '여기서 RN
  // <Modal>을 쓰면 안 된다'는 설명 주석 안 문자열이라 정규식이 오검출한 것뿐이다
  // (Modal은 import만 되고 미사용 — lint no-unused-vars 경고로도 확인됨).
  'src/screens/NewRecordScreen.tsx',
  // ProfileScreen.tsx: SCREEN_WIDTH/THUMB_WIDTH는 프로필 그리드·스탯 카드에만 쓰이고
  // <Modal> 6곳(358·502·636·771·832·1278행) 안에는 참조가 전혀 없다.
  'src/screens/ProfileScreen.tsx',
  // SocialScreen.tsx: SCREEN_W/SCREEN_W_SOCIAL/파생값 GRID_W는 피드 카드 그리드에만
  // 쓰이고 <Modal> 9곳 안에는 참조가 전혀 없다.
  'src/screens/SocialScreen.tsx',
  // TravelImportScreen.tsx: SCREEN_W/ORB_W/ORB_H/ORB_PT는 화면 본문 오브 비주얼에만
  // 쓰이고 <Modal>(1188행) 안에는 참조가 전혀 없다.
  'src/screens/TravelImportScreen.tsx',
]);
for (const f of collect('src', '.tsx')) {
  const p = rel(f);
  if (ALLOW_MODAL_STAGE.has(p)) continue;
  const src = readFileSync(f, 'utf8');
  if (/useStageWidth\(|stageWidthNow\(/.test(src) && /<Modal/.test(src)) {
    check(src.includes('STAGE_MAX_W'), `${p} useStageWidth()/stageWidthNow()+<Modal>이면 STAGE_MAX_W로 재클램프해야 함(휴리스틱 — 오탐이면 ALLOW_MODAL_STAGE에 근거와 함께 등록)`);
  }
}

// ── 규칙 6: 딤 배경(backdrop)에 Stage 클램프가 섞이지 않았다 ──
// 바텀시트 클램프는 '시트 본체'에만 넣는다. 딤 배경(flex:1 + rgba 배경)까지 클램프하면
// 폴드·태블릿에서 시트 양옆 레터박스가 어두워지지 않아 시트가 공중에 뜬 것처럼 보인다.
// 판별은 휴리스틱이다 — flex:1과 maxWidth: STAGE_MAX_W가 한 스타일 객체에 같이 있으면
// 그 객체는 '화면을 채우는 컨테이너'인데 폭만 잘린 것이므로 배경을 클램프한 것으로 본다.
// (중첩 없는 { … } 단위로만 훑으므로 스타일 객체 하나가 검사 단위가 된다.)
for (const f of collect('src', '.tsx')) {
  const src = readFileSync(f, 'utf8');
  const objs = src.match(/\{[^{}]*\}/g) || [];
  const bad = objs.filter((o) => /flex:\s*1/.test(o) && /maxWidth:\s*STAGE_MAX_W/.test(o));
  check(bad.length === 0, `${rel(f)} 딤 배경 클램프 없음`);
}

// ── 규칙 7: react-native에서 Text/TextInput을 직접 import하지 않는다 ──
// React 19에서 함수형 컴포넌트의 defaultProps가 제거돼 전역 주입 트릭(Text.defaultProps =
// { maxFontSizeMultiplier })을 쓸 수 없다. 그래서 src/ui/Text.tsx 래퍼로 출처를 강제한다.
// 래퍼를 우회해 직접 import하면 그 화면만 글꼴 배율 상한이 빠져, 사용자가 시스템 글꼴을
// 키웠을 때 Task 1~5에서 맞춰 놓은 배치가 그 화면에서만 무너진다.
// (eslint no-restricted-imports가 1차 방어선이지만, expo lint는 src/app/components만
//  훑고 lint를 건너뛴 커밋도 있을 수 있어 npm test에서도 같은 규칙을 본다.)
// [^}]*는 개행도 매치하므로 여러 줄로 쓴 import도 함께 잡힌다 — 코드모드가 놓친 파일을
// 이 규칙이 이름으로 짚어 주는 것이 설계 의도다.
for (const f of collect('src', '.tsx').concat(collect('src', '.ts'))) {
  const p = rel(f);
  if (p === 'src/ui/Text.tsx') continue; // 래퍼 자신은 예외
  const src = readFileSync(f, 'utf8');
  // 따옴표는 둘 다 받는다 — 이 저장소에 실제로 큰따옴표 import가 있다
  // (StarFieldBackground.tsx). 작은따옴표만 보면 lint를 건너뛴 커밋에서 조용히 뚫린다.
  const rnImports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g)];
  const direct = rnImports.filter((m) => /\b(Text|TextInput)\b/.test(m[1]));
  check(direct.length === 0, `${p} react-native에서 Text 직접 import 없음`);
}

// ── 규칙 8: 글꼴 배율 상한이 한 곳에서만 정의된다 ──
// 1.2가 두 군데(래퍼와 fitText)에 각각 박혀 있으면 한쪽만 바뀌어 조용히 갈라진다.
const UI_TEXT = 'src/ui/Text.tsx';
const hasWrapper = existsSync(UI_TEXT);
check(hasWrapper, `${UI_TEXT} 래퍼가 존재한다`);
if (hasWrapper) {
  check(/MAX_FONT_SCALE = 1\.2/.test(readFileSync(UI_TEXT, 'utf8')), 'MAX_FONT_SCALE === 1.2');
}
// 상한 숫자를 직접 적은 곳이 src 어디에도 없어야 한다. fitText.ts만 보던 초기 버전은
// FeatureShowcaseCard.tsx의 세 번째 하드코딩(fitOneLine)을 놓쳤다 — 값이 우연히 같아
// 런타임 영향은 없었지만, 상한을 올리는 순간 그 카드만 1.2로 남아 조용히 갈라진다.
// 숫자 리터럴 전체를 막으므로(1.2뿐 아니라) 나중에 1.3으로 올려도 재발하지 않는다.
// 객체 리터럴(`maxFontSizeMultiplier: 1.2`)과 JSX(`maxFontSizeMultiplier={1.2}`) 둘 다 본다.
// 래퍼는 `={MAX_FONT_SCALE}` 형태라 걸리지 않으므로 예외 목록이 필요 없다.
for (const f of collect('src', '.tsx').concat(collect('src', '.ts'))) {
  const hard = readFileSync(f, 'utf8').match(/maxFontSizeMultiplier\s*[:=]\s*\{?\s*\d/g) || [];
  check(hard.length === 0, `${rel(f)} 배율 상한 숫자 하드코딩 없음 (MAX_FONT_SCALE을 쓸 것)`);
}

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
