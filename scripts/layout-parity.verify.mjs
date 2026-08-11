// 배치 파리티 정적 가드 — 코드모드로 대량 치환한 규칙이 조용히 원상복귀되는 것을 막는다.
// 이 저장소는 76곳 코드모드 주입 이력이 있고(8/3 파리티 감사), 그때 오주입 여부를
// 사람 눈으로만 확인했다. 같은 일을 반복하지 않기 위한 자동 검사다.
//
// 출력 정책: 기본은 조용하다 — 규칙당 한 줄 요약 + 실패 항목만. 예전엔 성공 ✓만
// 1337줄을 찍어서 진짜 실패가 그 안에 묻혔다. 전체 항목을 보려면 `--verbose`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const VERBOSE = process.argv.includes('--verbose');
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
const allSrc = () => collect('src', '.tsx').concat(collect('src', '.ts'));

/**
 * 파일을 읽되, 없으면 null. 규칙 2와 아래 몇 곳이 예전엔 존재 확인 없이 readFileSync를
 * 호출해서, 파일 이름만 바뀌어도 ENOENT로 스크립트가 통째로 죽었다(가드가 '실패'가
 * 아니라 '크래시'로 끝나면 CI 로그를 안 보는 순간 통과처럼 읽힌다).
 */
function readSafe(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// ── 실행/집계 ──
let fail = 0;
let cur = null; // { title, pass, fails: [] }

function flush() {
  if (!cur) return;
  const n = cur.pass + cur.fails.length;
  const mark = cur.fails.length ? '✗' : '✓';
  const tail = cur.fails.length ? `, ${cur.fails.length}건 실패` : '';
  console.log(`  ${mark} ${cur.title} — ${n}건 검사${tail}`);
  for (const m of cur.fails) console.log(`      ✗ ${m}`);
  cur = null;
}

/** 새 규칙 구간 시작. 이전 구간 요약을 먼저 내보낸다. */
function rule(title) {
  flush();
  cur = { title, pass: 0, fails: [] };
}

const check = (ok, msg) => {
  if (ok) {
    cur.pass++;
    if (VERBOSE) console.log(`      ✓ ${msg}`);
  } else {
    cur.fails.push(msg);
    fail++;
  }
};

console.log('배치 파리티');

// ── 규칙 1: 루트 클램프가 살아 있다 ──
// 이게 빠지면 폴드·태블릿에서 전 화면이 늘어난다. 값은 stageMath와 같아야 한다.
rule('규칙 1 루트 클램프');
const stageMath = readSafe('src/utils/stageMath.ts');
check(stageMath !== null, 'src/utils/stageMath.ts가 존재한다');
const maxW = Number(stageMath?.match(/STAGE_MAX_W = (\d+)/)?.[1]);
const app = readSafe('App.tsx');
check(app !== null, 'App.tsx가 존재한다');
check(maxW === 480, `STAGE_MAX_W === 480 (실제 ${maxW})`);
check(
  Boolean(app) && app.includes('STAGE_MAX_W') && /maxWidth:\s*STAGE_MAX_W/.test(app),
  'App.tsx가 maxWidth: STAGE_MAX_W로 루트를 클램프한다',
);
check(
  Boolean(app) && /alignSelf:\s*'center'/.test(app),
  'App.tsx 루트 컨테이너가 중앙 정렬된다',
);

// ── 규칙 2: 실시간 대상 파일에 모듈 최상위 Dimensions 상수가 남아 있지 않다 ──
// 이 파일들은 폭이 스크롤 오프셋 계산에 들어간다. 박제된 값이면 폴드를 펼쳤을 때
// 페이저가 엉뚱한 사진을 가리키고 getItemLayout 스크롤 위치가 어긋난다.
//
// 줄 맨 앞 앵커(^)는 '모듈 최상위'라는 이 규칙의 정의 그대로다 — 들여쓴 선언은
// 애초에 박제가 아니라 호출마다 다시 읽는 값이라 이 규칙의 대상이 아니다.
// 들여쓴 곳에서 창 폭을 읽는 위험은 규칙 9가 들여쓰기와 무관하게 전수로 잡는다.
// 단, 규칙 9는 **한 줄 안에** 창 읽기와 width가 같이 있는 형태만 본다 — 정확한
// 잔여 갭 목록은 규칙 9 주석에 적어 뒀다(현재 위반 0건).
rule('규칙 2 실시간 파일의 모듈 최상위 Dimensions');
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
  const src = readSafe(f);
  if (src === null) {
    check(false, `${f} 파일이 없다 (이름이 바뀌었으면 REALTIME 목록도 함께 고칠 것)`);
    continue;
  }
  // 모듈 최상위 = 줄 맨 앞에서 시작하는 const/let 선언
  const frozen = src.split('\n').filter((l) => /^(const|let)\s.*Dimensions\.get\(/.test(l));
  check(frozen.length === 0, `${f} 모듈 최상위 Dimensions 상수 없음 (${frozen.length}건)`);
}

// ── 규칙 3: src 전역에 모듈 최상위 Dimensions 폭 상수가 없다 ──
// 새 화면을 만들 때 Dimensions.get('window').width를 다시 쓰면 폴드에서 어긋난다.
// 세로(.height)는 clamp 대상이 아니므로 허용한다.
// (규칙 2와 같은 이유로 ^ 앵커는 의도된 정의다 — 규칙 9 주석 참고.)
rule('규칙 3 모듈 최상위 폭 상수');
const ALLOW_FROZEN = new Set([
  'src/components/MainCoachmark.tsx', // 초기값일 뿐, onLayout으로 갱신됨(136행)
]);
for (const f of allSrc()) {
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
rule('규칙 4 320dp 초과 고정 폭');
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

// ── 규칙 5: Stage 값을 쓰는 파일이 <Modal>도 갖고 있으면 STAGE_MAX_W도 있어야 한다 ──
// RN Modal은 App.tsx의 루트 클램프 바깥(네이티브 풀스크린)에 그려진다. Stage 폭을 그대로
// Modal 안 콘텐츠 크기에 쓰면 폴드·태블릿에서 클램프가 빠진 채 렌더되어 중앙 정렬이 깨진다.
// Task 3에서 같은 모양의 회귀가 2건 있었고 사람 눈으로만 잡혔다 — 이 규칙은 그 재발 방지용
// 휴리스틱이다(증명이 아니다: STAGE_MAX_W가 있다고 반드시 옳다는 보장도, 없다고 반드시
// 틀렸다는 보장도 아니다). 걸리면 사람이 Modal 콘텐츠가 실제로 Stage 값을 쓰는지 확인할 것.
// 세 형태를 모두 본다 — useStageWidth()(훅) · stageWidthNow()(모듈 최상위 상수) ·
// useStageGutter()(창↔컬럼 오프셋). gutter가 빠져 있었는데, gutter를 쓴다는 건 이미
// "Modal 안에서 컬럼 기준으로 되돌리는 중"이라는 뜻이라 오히려 이 규칙의 핵심 신호다.
rule('규칙 5 Stage 값 + Modal이면 재클램프');
const ALLOW_MODAL_STAGE = new Set([
  // PostDetailScreen.tsx는 예외 목록에서 뺐다 — 아래 오탐 분석은 남기되, 이 파일은
  // 지금 STAGE_MAX_W를 실제로 쓰고 있어 예외 없이 통과한다. 예외로 남겨 두면 나중에
  // 누가 STAGE_MAX_W를 걷어내도 조용히 가려진다.
  //   (분석: useStageWidth()는 본문(cutImage·albumGridImg·SnapStoryViewer 페이징)에만
  //    쓰이고, 이 파일의 <Modal> 5곳은 별도 스타일셋(menuCard 고정폭 180 등)이라
  //    Stage 폭이 Modal로 새지 않았다. 시트 자체의 폭 클램프는 "바텀시트 클램프"
  //    과제에서 likersSheet·shareS.sheet·viewerS에 적용 완료.)
  //
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
  // (배지 앨범·프로필 편집 Modal은 별도로 STAGE_MAX_W 클램프를 적용해 뒀다.)
  'src/screens/ProfileScreen.tsx',
  // SocialScreen.tsx: SCREEN_W/SCREEN_W_SOCIAL/파생값 GRID_W는 피드 카드 그리드에만
  // 쓰이고 <Modal> 9곳 안에는 참조가 전혀 없다. useStageGutter()는 Modal 안 팝오버를
  // 컬럼 기준으로 되돌리는 용도라 이미 의도된 사용이다.
  'src/screens/SocialScreen.tsx',
  // TravelImportScreen.tsx: SCREEN_W/ORB_W/ORB_H/ORB_PT는 화면 본문 오브 비주얼에만
  // 쓰이고 <Modal>(1188행) 안에는 참조가 전혀 없다.
  'src/screens/TravelImportScreen.tsx',
]);
for (const f of collect('src', '.tsx')) {
  const p = rel(f);
  if (ALLOW_MODAL_STAGE.has(p)) continue;
  const src = readFileSync(f, 'utf8');
  if (/useStageWidth\(|stageWidthNow\(|useStageGutter\(/.test(src) && /<Modal/.test(src)) {
    check(src.includes('STAGE_MAX_W'), `${p} useStageWidth()/stageWidthNow()/useStageGutter()+<Modal>이면 STAGE_MAX_W로 재클램프해야 함(휴리스틱 — 오탐이면 ALLOW_MODAL_STAGE에 근거와 함께 등록)`);
  }
}

// ── 규칙 6: 딤 배경(backdrop)에 Stage 클램프가 섞이지 않았다 ──
// 바텀시트 클램프는 '시트 본체'에만 넣는다. 딤 배경(flex:1 + 반투명 배경)까지 클램프하면
// 폴드·태블릿에서 시트 양옆 레터박스가 어두워지지 않아 시트가 공중에 뜬 것처럼 보인다.
//
// 예전 구현은 /\{[^{}]*\}/ 였다 — 중첩이 없는 객체만 봐서, shadowOffset:{...} 하나만
// 들어 있어도 그 스타일 객체 전체가 검사 대상 밖이었다(DMScreen.ctxMenu,
// PostDetailScreen.menuCard 등). 지금은 중괄호 균형을 맞춰 모든 블록을 본다.
//
// ── '배경색으로 딤을 판별'하는 조건은 폐기했다 (한 번 넣었다가 되돌린 자리다) ──
// 균형 매칭으로 시야가 넓어졌을 때 오탐 35건(25파일)이 났고, 그걸 배경색 조건
// (backgroundColor가 rgba/알파hex 리터럴인지)으로 막으려 했다. 두 가지가 틀렸다.
//   ① 오탐을 없앤 건 배경색 조건이 아니라 아래 ownLevel이었다. 실측:
//      균형매칭만 35블록 → +ownLevel 2블록 → +배경색조건 0블록.
//      즉 배경색 조건이 실제로 걸러 낸 건 정당한 폭-제한 래퍼 2개뿐이었다.
//   ② 배경색이 상수로 빠진 딤을 통째로 못 봤다 — 이 저장소에 실제로 3곳 있다:
//      MainCoachmark.DIM('rgba(0,0,0,0.78)', 385~388·422행에서 사용),
//      RecordFab.COACH_DIM, ProfileTicketScreen.BACKDROP('#0A0B0F' + opacity 애니메이션).
//      MainCoachmark 422행 전체화면 딤에 클램프를 주입하면 예전 규칙은 잡았는데
//      배경색 조건을 넣은 뒤로는 통과했다 — 즉 탐지력이 후퇴했다.
// 그래서 '딤인지'를 색으로 추측하지 않는다. **화면을 채우면서 Stage 폭으로 잘린 블록**은
// 전부 잡고, 딤이 아닌 정당한 케이스만 아래 ALLOW_FULL_CLAMP에 사유와 함께 등록한다.
// (규칙 4·5·8·9와 같은 '예외 + 사유' 방식. 색 추측과 달리 사각지대가 생기지 않는다.)
//
// '화면을 채운다'의 판별은 세 형태를 본다 — flex:1 · 자기 층의 absoluteFill(스프레드) ·
// 바로 앞 80자 안의 absoluteFill(`style={[StyleSheet.absoluteFill, { … }]}` 형태).
// absoluteFill을 넣은 이유: 화면을 채우는 반투명 블록 62개 중 18개(29%)가 flex:1 없이
// absoluteFillObject 스프레드만 쓰고 있어 예전 구현부터 계속 시야 밖이었다.
// 앞 80자 창은 실측으로 오탐 0건이다(160자로 늘리면 BlogRecordScreen.travelPanel이
// 오탐으로 걸린다 — 그래서 80자로 못 박는다).
rule('규칙 6 딤 배경 클램프 금지');
const FILLS_SCREEN = /flex:\s*1\b|absoluteFill/;
const SIBLING_FILL_WINDOW = 80;
// 딤이 아니라고 확인된 '폭 제한 전용' 컨테이너. 파일별 건수까지 못 박는다 —
// 같은 파일에 두 번째 블록이 몰래 늘어나는 것도 잡아야 한다(규칙 9와 같은 이유).
const ALLOW_FULL_CLAMP = new Map([
  ['src/screens/BasicInfoScreen.tsx', {
    count: 1,
    why: 'modalClamp — 국가 선택 Modal 콘텐츠의 폭 제한 전용 래퍼다. backgroundColor가 없어 '
       + '아무것도 가리지 않으므로 딤이 아니다(딤은 같은 파일의 불투명 modalRoot 뒤에 없다). '
       + 'binder/closeBtn처럼 margin과 width:100%가 충돌하는 걸 피하려고 래퍼로 분리한 것이라 '
       + 'flex:1 + 클램프가 한 객체에 함께 있는 게 정상이다.',
  }],
  ['src/screens/ProfileScreen.tsx', {
    count: 1,
    why: 'binderClamp — 배지 앨범 보드(binderWrapper, marginHorizontal:16)의 폭 제한 전용 래퍼. '
       + 'backgroundColor가 없어 딤이 아니다. 보드 자체는 불투명 콘텐츠 패널이고, 클램프를 '
       + 'binderWrapper에 직접 주면 폰에서 32dp 넘치기 때문에 래퍼로 분리했다.',
  }],
]);

/** 문자열·주석 안의 중괄호를 무시하고, 균형 잡힌 모든 { … } 블록을 돌려준다. */
function balancedBlocks(src) {
  const out = [];
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    // 문자열/템플릿 리터럴 건너뛰기
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    // 주석 건너뛰기
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === '{') stack.push(i);
    else if (c === '}' && stack.length) {
      const s = stack.pop();
      out.push({ s, e: i + 1, text: src.slice(s, i + 1) });
    }
  }
  return out;
}

/**
 * 블록에서 '자기 층'의 텍스트만 남긴다 — 한 단계 안쪽 { … }는 전부 지운다.
 * 이게 있어야 "같은 스타일 객체 안에 있는가"를 볼 수 있다. StyleSheet.create({…})
 * 처럼 여러 스타일을 품은 껍데기 블록은, 안쪽을 지우고 나면 flex:1도 maxWidth도
 * 남지 않아 자연히 걸러진다 — 균형 매칭을 켰을 때 난 오탐 35건을 실제로 없앤 게 이거다.
 */
function ownLevel(block, all) {
  const children = all.filter((o) => o.s > block.s && o.e < block.e
    && !all.some((m) => m !== o && m !== block && m.s > block.s && m.e < block.e && o.s > m.s && o.e < m.e));
  let out = '';
  let cursor = block.s;
  for (const c of children.sort((a, b) => a.s - b.s)) {
    out += block.text.slice(cursor - block.s, c.s - block.s);
    cursor = c.e;
  }
  out += block.text.slice(cursor - block.s);
  return out;
}

{
  const seen = new Set();
  for (const f of collect('src', '.tsx')) {
    const p = rel(f);
    const src = readFileSync(f, 'utf8');
    const blocks = balancedBlocks(src);
    const hits = blocks.filter((b) => {
      const own = ownLevel(b, blocks);
      if (!/maxWidth:\s*STAGE_MAX_W/.test(own)) return false;
      if (FILLS_SCREEN.test(own)) return true;
      // style={[StyleSheet.absoluteFill, { … }]} — 채움이 배열 형제라 객체 안에는 없다.
      const before = src.slice(Math.max(0, b.s - SIBLING_FILL_WINDOW), b.s);
      return /absoluteFill/.test(before);
    });
    if (hits.length === 0) continue;
    seen.add(p);
    const allow = ALLOW_FULL_CLAMP.get(p);
    if (!allow) {
      check(false, `${p} 화면을 채우는 블록에 Stage 클램프가 ${hits.length}건 섞였다 — 딤 배경이면 클램프를 시트 본체로 옮기고, `
        + '배경 없는 폭 제한 래퍼처럼 딤이 아니라면 ALLOW_FULL_CLAMP에 건수와 사유를 함께 등록할 것');
      continue;
    }
    check(Boolean(allow.why && allow.why.trim()), `${p} 전체폭 클램프 예외에 사유가 적혀 있다`);
    check(
      allow.count === hits.length,
      `${p} 전체폭 클램프 ${allow.count}건 등록 ↔ 실제 ${hits.length}건 — 새로 늘어난 블록이 정말 딤이 아닌지 확인하고 건수를 갱신할 것`,
    );
  }
  for (const p of ALLOW_FULL_CLAMP.keys()) {
    check(seen.has(p), `${p} 전체폭 클램프 예외가 아직 유효하다 (해당 블록이 사라졌으면 ALLOW_FULL_CLAMP에서 제거할 것)`);
  }
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
rule('규칙 7 Text/TextInput 직접 import 금지');
for (const f of allSrc()) {
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
rule('규칙 8 글꼴 배율 상한 단일 출처');
const UI_TEXT = 'src/ui/Text.tsx';
const uiText = readSafe(UI_TEXT);
check(uiText !== null, `${UI_TEXT} 래퍼가 존재한다`);
if (uiText) {
  check(/MAX_FONT_SCALE = 1\.2/.test(uiText), 'MAX_FONT_SCALE === 1.2');
}
// maxFontSizeMultiplier에 넘기는 값은 src 어디서나 FONT_SCALE_CAP이어야 한다.
//
// ① 숫자 하드코딩 방지: fitText.ts만 보던 초기 버전은 FeatureShowcaseCard.tsx의 세 번째
//    하드코딩(fitOneLine)을 놓쳤다 — 값이 우연히 같아 런타임 영향은 없었지만, 상한을
//    올리는 순간 그 카드만 옛 값으로 남아 조용히 갈라진다. 특정 값(1.2)이 아니라 숫자
//    리터럴 전체를 막아 1.3으로 올려도 재발하지 않게 한다.
// ② iOS 무제한 보장: 상한은 android 전용이고 iOS는 undefined(상한 없음)여야 한다.
//    래퍼가 props를 뒤로 펼치므로 화면이 maxFontSizeMultiplier를 다시 주면 덮어쓰는데,
//    이때 MAX_FONT_SCALE(플랫폼 분기가 없는 raw 값)을 주면 iOS까지 잘린다. 숫자가 아니라
//    잡히지 않으므로, 값이 FONT_SCALE_CAP인지까지 본다.
//
// 객체 리터럴(`: FONT_SCALE_CAP`)과 JSX(`={FONT_SCALE_CAP}`) 두 형태를 함께 본다.
// \b가 앞에 있어 `_maxFontSizeMultiplier`(RN 네이티브 소스를 인용한 주석) 는 안 걸린다.
// 래퍼는 props를 뒤로 펼쳐 "화면이 필요하면 상한을 덮어쓸 수 있게" 설계돼 있다.
// 이 규칙이 그 탈출구까지 막아 버리면 런타임 설계와 게이트가 어긋난다. 그래서 막는 게
// 아니라 **사유를 적게** 한다 — 아래 CAP_OVERRIDE에 파일별로 허용 식별자와 사유를
// 등록하면 통과한다. why가 비면 아래 check가 실패하므로 사유 없이 예외를 늘릴 수 없다.
const DEFAULT_ALLOW = 'FONT_SCALE_CAP';
const CAP_OVERRIDE = new Map([
  ['src/utils/fitText.ts', {
    allow: 'MAX_FONT_SCALE',
    why: 'andFitText 객체 자체가 Platform.OS === \'android\' 삼항 안에서만 만들어져 이미 android 전용이다. '
       + 'iOS에선 빈 객체({})라 이 값이 존재하지 않는다. (그 전제는 바로 아래에서 실제로 검사한다)',
  }],
  ['src/components/social/FeatureShowcaseCard.tsx', {
    allow: 'MAX_FONT_SCALE',
    why: '고정 높이 밴드(card: aspectRatio 0.713 + overflow:hidden, band: flex:1)라 플랫폼 무관 상한이 필요하다. '
       + 'adjustsFontSizeToFit은 폭만 맞추고 minimumFontScale 0.82가 하한이라, 상한을 풀면 iOS 최대 배율에서 '
       + '세로로 잘린다. 이 상한은 글꼴 배율 작업 이전부터 있던 컴포넌트 로컬 상한이라(8269b13) '
       + '"iOS 렌더링은 절대 변경하지 않는다" 원칙상 걷어낼 대상이 아니다.',
  }],
]);
for (const [p, o] of CAP_OVERRIDE) {
  check(Boolean(o.why && o.why.trim()), `${p} 배율 상한 예외에 사유가 적혀 있다`);
}
for (const f of allSrc()) {
  const p = rel(f);
  const allow = CAP_OVERRIDE.get(p)?.allow ?? DEFAULT_ALLOW;
  const uses = [...readFileSync(f, 'utf8')
    .matchAll(/\bmaxFontSizeMultiplier\s*[:=]\s*\{?\s*([A-Za-z_$][\w$]*|[\d.]+)/g)];
  const bad = uses.filter((m) => m[1] !== allow);
  check(bad.length === 0, `${p} maxFontSizeMultiplier는 ${allow}만 쓴다 (다른 값이 필요하면 CAP_OVERRIDE에 사유와 함께 등록할 것)`);
}
// CAP_OVERRIDE에서 fitText.ts를 면제한 근거("android 전용")를 실제로 강제한다.
// 이 삼항이 사라지면 15개 호출부의 iOS가 조용히 1.2로 잘리는데, 면제 때문에 값 검사는
// 통과해 버린다 — 전제 자체를 검사해야 면제가 안전하다.
const fitText = readSafe('src/utils/fitText.ts');
check(fitText !== null, 'src/utils/fitText.ts가 존재한다');
check(
  Boolean(fitText) && /Platform\.OS === 'android'/.test(fitText),
  'fitText.ts가 android 전용 분기를 유지한다 (CAP_OVERRIDE 면제의 전제)',
);

// ── 규칙 9: 클램프된 컬럼 안에서 '창 폭'으로 자기 위치를 잡지 않는다 ──
//
// 루트를 클램프한 순간 좌표계가 둘로 갈라졌다.
//   · 창 절대 좌표 — measureInWindow, 제스처 absoluteX, Dimensions.get('window'),
//                    useWindowDimensions(), 그리고 RN Modal 안(모달은 창 루트에 그려진다)
//   · 컬럼 로컬 좌표 — App.tsx의 클램프된 컬럼 안에서 렌더되는 모든 것
// 컬럼 안에 살면서 창 폭으로 자기 위치·크기를 정하는 코드는 정확히 gutter
// ((창폭 - Stage폭)/2)만큼 틀린다. 763dp 창에서 141.5dp다.
//
// 규칙 1~8은 이 부류를 하나도 잡지 못했다. 규칙 2·3은 '모듈 최상위'(줄 맨 앞 const)만
// 보고, 규칙 3은 Dimensions.get만 봐서 useWindowDimensions()는 아예 시야 밖이었다 —
// 그런데 이 브랜치가 실제로 만들어 낸 형태가 바로 그 useWindowDimensions()였다.
// (CustomTabBar가 탭 바 전체를 gutter만큼 밀어낸 채 병합 직전까지 갔다.)
//
// 그래서 이 규칙은 들여쓰기·선언형태와 무관하게 '창 폭을 읽는 줄'을 전수로 세고,
// 파일별 허용 건수를 사유와 함께 못 박는다. 건수까지 보는 이유: 예전에 파일 단위로만
// 거른 스윕이 이미 한 건 있는 파일의 두 번째 사례를 통째로 놓친 적이 있다.
//
// ── 잔여 갭 (정직하게 적어 둔다) ──
// 이 규칙은 창 읽기와 width가 **같은 줄**에 있는 형태만 본다. 아래 세 형태는 규칙 3과
// 규칙 9를 동시에 통과한다 — 규칙 2·3의 ^ 앵커를 넓히지 않기로 한 결정이 이 갭 위에
// 서 있으므로, "규칙 9가 앵커 확장을 완전히 대체한다"고 말하면 사실이 아니다.
// (2026-08-11 실측: 세 형태 모두 저장소에 0건이라 살아 있는 결함은 없다.)
//   ① 두 줄 분리 — `const d = Dimensions.get('window');` 다음 줄에 `const w = d.width;`
//   ② 여러 줄 구조분해 — `const {` / `  width: W,` / `} = useWindowDimensions();`
//   ③ 'screen' 좌표계 — Dimensions.get('screen').width (들여쓰면 규칙 3도 놓친다)
// 셋 중 하나라도 실제로 등장하면 그때는 여러 줄을 보는 판정으로 넓혀야 한다.
rule('규칙 9 컬럼 안에서 창 폭 사용 금지');
const WINDOW_W_READ = /(?:Dimensions\.get\(\s*['"]window['"]\s*\)|useWindowDimensions\(\))/;
const ALLOW_WINDOW_W = new Map([
  ['src/utils/stage.ts', {
    count: 3,
    why: 'Stage API 자신. 창 폭을 읽어 clamp/gutter로 바꿔 주는 단일 출처라 여기서만 창 폭을 읽는 게 맞다.',
  }],
  ['src/components/CutPhotoAdjustModal.tsx', {
    count: 1,
    why: 'RN <Modal transparent>(186행) 안에서만 쓰인다 — 모달은 루트 클램프 밖 창 루트에 그려지므로 '
       + 'SW*0.82 프레임의 기준은 창 폭이 맞다.',
  }],
  ['src/components/PhotoViewerModal.tsx', {
    count: 1,
    why: 'RN <Modal transparent>(72행) 안 전체화면 사진 뷰어. pagingEnabled ScrollView의 페이지 폭이라 '
       + '창 폭이 아니면 페이징 오프셋 자체가 어긋난다.',
  }],
  ['src/components/PuzzlePhotoAdjustOverlay.tsx', {
    count: 1,
    why: 'MainScreen "영토 표시 설정" <Modal> 안의 absoluteFill 오버레이로만 렌더된다(중첩 Modal 금지 전례 때문에 '
       + 'Modal 안 절대위치로 구현). 즉 창 루트 좌표계라 SW*0.86 프레임 기준은 창 폭이 맞다.',
  }],
  ['src/screens/BlogRecordScreen.tsx', {
    count: 1,
    why: 'RN <Modal transparent>(218행) 안 전체화면 사진 뷰어. 딤 위에 사진만 띄우는 화면이라 화면 가득이 의도이고, '
       + 'Stage 폭으로 두면 pagingEnabled ScrollView(창 폭)와 페이지 폭이 어긋나 페이징이 깨진다.',
  }],
  ['src/screens/ProfileScreen.tsx', {
    count: 1,
    why: 'RN <Modal transparent>(774행) 안 전체화면 프로필 사진 뷰어(핀치 줌). 이미지 크기가 창 전체여야 한다.',
  }],
  ['src/screens/MainScreen.tsx', {
    count: 1,
    why: '코치마크 폴백 rect 계산(511행). CoachRect는 measureInWindow 결과와 같은 창 절대 좌표라는 계약이라 '
       + '창 폭이 필요하다 — 컬럼 기준인 스냅 버튼은 그 자리에서 gutter를 더해 창 좌표로 환산한다.',
  }],
  ['src/screens/SocialScreen.tsx', {
    count: 2,
    why: '둘 다 창 절대 좌표끼리의 비교다. ① 2070행: measureInWindow가 준 x의 유효 범위 검사(창 폭과 비교해야 '
       + '정상 좌표를 무효로 오판하지 않는다). ② 2718행: cardRect.x(창 좌표)가 화면 좌/우 어느 쪽인지 판정 — '
       + '창 폭의 절반과 비교해야 맞다. 실제 배치 계산(gutter)은 useStageGutter()로만 한다.',
  }],
  ['src/components/MainCoachmark.tsx', {
    count: 1,
    why: 'rootSize의 초기값(21·136행)일 뿐이고, 루트 View의 onLayout이 즉시 실제 크기(컬럼 로컬)로 덮어쓴다. '
       + '규칙 3에서도 같은 근거로 예외다.',
  }],
]);
{
  const seen = new Set();
  for (const f of allSrc()) {
    const p = rel(f);
    const hits = readFileSync(f, 'utf8').split('\n')
      .filter((l) => WINDOW_W_READ.test(l) && /\bwidth\b/.test(l));
    if (hits.length === 0) continue;
    seen.add(p);
    const allow = ALLOW_WINDOW_W.get(p);
    if (!allow) {
      check(false, `${p} 컬럼 안에서 창 폭을 ${hits.length}건 읽는다 — useStageWidth()/useStageGutter()를 쓰거나, `
        + '창 좌표계가 맞다면 ALLOW_WINDOW_W에 건수와 사유를 함께 등록할 것');
      continue;
    }
    check(Boolean(allow.why && allow.why.trim()), `${p} 창 폭 예외에 사유가 적혀 있다`);
    check(
      allow.count === hits.length,
      `${p} 창 폭 사용 ${allow.count}건 등록 ↔ 실제 ${hits.length}건 — 새로 늘어난 줄이 정말 창 좌표계인지 확인하고 건수를 갱신할 것`,
    );
  }
  // 등록만 남고 실제로는 사라진 예외는 지운다 — 썩은 예외는 다음 사람에게 거짓 근거가 된다.
  for (const p of ALLOW_WINDOW_W.keys()) {
    check(seen.has(p), `${p} 창 폭 예외가 아직 유효하다 (해당 줄이 사라졌으면 ALLOW_WINDOW_W에서 제거할 것)`);
  }
}

// ── 규칙 10: 버튼 라벨 Text는 안드로이드 자동 축소(andFitText)를 갖는다 ──
//
// 앱 글꼴에 한글이 없어 시스템 폰트로 폴백되는데, 안드로이드(Noto Sans KR)는 iOS보다
// 글리프가 넓다. 그래서 iOS 폭 기준으로 만든 버튼의 한글 라벨이 안드로이드에서만
// 겹치거나 밖으로 밀린다 (2026-08-11 '과거 여행 불러오기' 버튼에서 실기기 확인).
// andFitText는 18개 파일에 손으로 붙어 있었을 뿐 강제 장치가 없어, 전수 스윕(87곳)
// 이후에도 새 버튼이 다시 구멍이 되는 것을 이 규칙이 막는다.
//
// 판정(스윕 때 쓴 것과 동일한 두 계층 — 831건 원시 후보에서 아이콘·본문을 거른 형태):
//   대상 = 터치러블(TouchableOpacity/TouchableHighlight/Pressable) 안의 <Text> 중
//     ① 내용이 순수 라벨({t('…')} 단독 또는 삼항 t())이고
//     ② 버튼류 스타일 이름(…btnText/…buttonText/…ctaText/…actionText/…)을 쓰거나
//        스타일 이름 없이 인라인 style={{ fontSize/fontWeight … }} 만 있는 것
//   요구 = 열림 태그에 andFitText / adjustsFontSizeToFit / numberOfLines 중 하나
//
// ── 잔여 갭 (정직하게 적어 둔다) ──
//   · 라벨이 {label} 같은 prop이면 ①에 안 걸린다 — 공용 컴포넌트는 아래에서 이름을
//     짚어 별도로 검사한다(ui.tsx 4종). 새 공용 버튼을 만들면 그 목록에 추가할 것.
//   · numberOfLines={2} 같은 다줄 명시도 '판단이 있었다'로 보고 통과시킨다.
//     자동 축소를 일부러 빼려면 그 판단을 태그에 남기라는 뜻이다.
rule('규칙 10 버튼 라벨 자동 축소');
const FIT_BTN_STYLE = /\b\w*\.(?:\w*[bB]tnText\w*|\w*[bB]uttonText\w*|\w*[cC]taText\w*|\w*[aA]ctionText\w*|\w*[sS]ubmitText\w*|\w*[cC]onfirmText\w*|\w*[bB]tnLabel\w*|\w*[bB]uttonLabel\w*)\b/;
// 여러 줄이 의도인 라벨 등 예외는 여기 등록 (2026-08-11 스윕 시점 기준 0건 — 87개 라벨
// 전부 번역문에 \n 없는 한 줄 문구임을 ko/en 로케일 대조로 확인했다)
const ALLOW_NO_FIT = new Map([]);

/** 태그 시작 위치부터 중괄호 깊이 0의 '>' 위치 — 화살표함수의 >는 깊이>0에서 나와 안 걸린다 */
function fitTagEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

{
  const seen = new Set();
  for (const f of collect('src', '.tsx')) {
    const p = rel(f);
    const src = readFileSync(f, 'utf8');

    // 터치러블 열림/닫힘으로 범위 구성 (자기닫힘은 라벨이 없으니 무시)
    const ranges = [];
    const stack = [];
    for (const m of src.matchAll(/<\/?(TouchableOpacity|TouchableHighlight|Pressable)\b/g)) {
      if (m[0][1] === '/') {
        const s = stack.pop();
        if (s !== undefined) ranges.push([s, m.index]);
      } else {
        const e = fitTagEnd(src, m.index);
        if (e !== -1 && src[e - 1] === '/') continue;
        stack.push(m.index);
      }
    }

    let bad = 0;
    const badLines = [];
    for (const t of src.matchAll(/<Text\b/g)) {
      if (!ranges.some(([s, e]) => t.index > s && t.index < e)) continue;
      const end = fitTagEnd(src, t.index);
      if (end === -1) continue;
      const tag = src.slice(t.index, end + 1);
      if (tag.endsWith('/>')) continue;
      if (/andFitText|adjustsFontSizeToFit|numberOfLines/.test(tag)) continue;
      const close = src.indexOf('</Text>', end);
      if (close === -1) continue;
      const content = src.slice(end + 1, close).trim();
      const pureLabel = /^\{t\('[^']+'\)\}$/.test(content)
        || /^\{[^{}]*\?\s*t\('[^']+'\)\s*:\s*t\('[^']+'\)\}$/.test(content);
      if (!pureLabel) continue;
      const named = FIT_BTN_STYLE.test(tag);
      const inline = /style=\{\{[^<]*?(fontSize|fontWeight)/s.test(tag)
        && !/style=\{\[?\s*\w+\.\w+/.test(tag);
      if (!named && !inline) continue;
      bad++;
      badLines.push(src.slice(0, t.index).split('\n').length);
    }
    if (bad === 0) continue;
    seen.add(p);
    const allow = ALLOW_NO_FIT.get(p);
    if (!allow) {
      check(false, `${p} 버튼 라벨 ${bad}건(줄 ${badLines.join(', ')})에 자동 축소가 없다 — `
        + '<Text …>에 {...andFitText}를 넣거나(utils/fitText), 여러 줄이 의도면 numberOfLines를 명시하거나, '
        + 'ALLOW_NO_FIT에 건수와 사유를 등록할 것');
      continue;
    }
    check(Boolean(allow.why && allow.why.trim()), `${p} 자동 축소 예외에 사유가 적혀 있다`);
    check(
      allow.count === bad,
      `${p} 자동 축소 예외 ${allow.count}건 등록 ↔ 실제 ${bad}건 — 새로 늘어난 라벨을 확인하고 건수를 갱신할 것`,
    );
  }
  for (const p of ALLOW_NO_FIT.keys()) {
    check(seen.has(p), `${p} 자동 축소 예외가 아직 유효하다 (해당 라벨이 사라졌으면 ALLOW_NO_FIT에서 제거할 것)`);
  }

  // 공용 버튼 컴포넌트 — 라벨이 {label} prop이라 위 판정에 안 걸리므로 이름을 짚어 검사한다.
  // 새 공용 버튼(라벨 prop을 받는)을 만들면 이 목록에 추가할 것.
  const uiSrc = readSafe('src/components/ui.tsx');
  check(uiSrc !== null, 'src/components/ui.tsx 공용 버튼 파일이 존재한다');
  if (uiSrc) {
    for (const styleName of ['primaryBtnText', 'glassBtnText', 'socialBtnText', 'pillText']) {
      const tagStart = uiSrc.search(new RegExp(`<Text[^>]*${styleName}`));
      const ok = tagStart !== -1
        && /andFitText/.test(uiSrc.slice(tagStart, fitTagEnd(uiSrc, tagStart) + 1));
      check(ok, `ui.tsx ${styleName} 라벨에 andFitText가 있다`);
    }
  }
}

flush();
console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
