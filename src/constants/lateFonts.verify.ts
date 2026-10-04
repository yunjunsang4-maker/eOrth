// src/constants/lateFonts.verify.ts — 늦은 글꼴 등록 신호 저장소 + handleFontStyle 게이트
import { LATE_FONT_NAMES, LATE_BLOG_FONT_NAMES, LATE_HANDLE_FONT_NAMES, markLateFontsLoaded, getLoadedLateFonts, subscribeLateFonts, lateFontFamily } from './lateFonts';
import { handleFontStyle } from './handleFonts';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

let calls = 0;
const unsub = subscribeLateFonts(() => { calls++; });

// 목록은 App.tsx 백그라운드 로드 19종과 같다(App.tsx는 Record<LateFontName,…>라 tsc가 동기화를 보장)
eq(LATE_FONT_NAMES.length, 19, '늦은 글꼴 19종');

// 초기값 — 아무것도 등록 전. 모듈 첫 평가(앱 시작·Fast Refresh·node)에서 빈 집합이어야 등록 전 이름이 안 들어간다
eq(getLoadedLateFonts().size, 0, '초기: 등록된 늦은 글꼴 0');
eq(getLoadedLateFonts() === getLoadedLateFonts(), true, '연속 조회: 같은 참조(useSyncExternalStore 무한 리렌더 방지)');

// 등록 전 게이트 — 늦은 글꼴은 빠지고, 핵심 글꼴·'System'은 그대로
const s0 = getLoadedLateFonts();
eq(lateFontFamily('Pacifico', s0), undefined, '등록 전: Pacifico → undefined(시스템 폰트)');
eq(lateFontFamily('NanumGothic_400Regular', s0), undefined, '등록 전: 블로그 글꼴 → undefined');
eq(lateFontFamily('Montserrat-Black', s0), 'Montserrat-Black', '핵심 글꼴(useFonts 대기)은 등록 신호와 무관');
eq(lateFontFamily('System', s0), 'System', "'System'은 늦은 글꼴이 아니다 — 호출부가 따로 거른다");
eq(lateFontFamily(undefined, s0), undefined, '널 계열: undefined');
eq(lateFontFamily(null, s0), undefined, '널 계열: null');
eq(lateFontFamily('', s0), undefined, "널 계열: ''");

// handleFontStyle — 등록 전엔 fontWeight까지 통째로 null(기본 폰트 사용자와 같은 모양)
eq(handleFontStyle('pacifico', s0), null, '등록 전 아이디 폰트 pacifico → null');
eq(handleFontStyle('impact', s0), { fontFamily: 'Montserrat-Black', fontWeight: 'normal' }, 'impact(Montserrat-Black)는 등록 전에도 적용');
eq(handleFontStyle('default', s0), null, 'default → null');
eq(handleFontStyle('unknown-id', s0), null, '모르는 id → null');
eq(handleFontStyle(undefined, s0), null, 'id undefined → null');

// 일부만 등록(나머지 실패) → 알림 1회, 성공한 것만 들어간다
markLateFontsLoaded(['Pacifico', 'Caveat']);
eq(calls, 1, '일부 mark: 알림 1회');
const s1 = getLoadedLateFonts();
eq(s1 !== s0, true, 'mark 뒤 스냅샷 참조가 바뀜');
eq(handleFontStyle('pacifico', s1), { fontFamily: 'Pacifico', fontWeight: 'normal' }, '등록 후 pacifico 적용');
eq(handleFontStyle('yuyu', s1), null, '등록 안 된(실패한) yuyu는 계속 null');
eq(lateFontFamily('Pacifico', s0), undefined, '옛 스냅샷은 그대로(불변) — 컴파일러 메모 키가 참조로 갈린다');

// 중복 mark — 새 이름이 없으면 알림 없음(Fast Refresh로 App effect가 다시 돌 때)
markLateFontsLoaded(['Pacifico']);
eq(calls, 1, '같은 이름 재mark: 알림 없음');
eq(getLoadedLateFonts() === s1, true, '같은 이름 재mark: 스냅샷 참조 유지');

// 늦은 글꼴이 아닌 이름은 무시
markLateFontsLoaded(['Inter_400Regular', 'Nope']);
eq(calls, 1, '목록 밖 이름 mark: 무시·알림 없음');
eq(getLoadedLateFonts().has('Inter_400Regular'), false, '목록 밖 이름은 집합에 안 들어감');

// 빈 목록(전부 실패) → 알림 없음
markLateFontsLoaded([]);
eq(calls, 1, '빈 목록 mark: 알림 없음');

// 해제 후에는 알리지 않는다 — 언마운트된 컴포넌트에 setState가 가지 않게
unsub();
markLateFontsLoaded(['Yuyu']);
eq(calls, 1, '구독 해제 후 mark: 알림 없음');
eq(getLoadedLateFonts().has('Yuyu'), true, '구독 해제와 무관하게 값은 바뀜');

// ── 두 그룹 분할(App.tsx가 아이디 그룹 → 블로그 그룹 순으로 따로 mark) ──
// 겹치거나 빠진 이름이 있으면 그 글꼴은 두 번 올리거나 영영 mark되지 않는다
eq([...LATE_BLOG_FONT_NAMES, ...LATE_HANDLE_FONT_NAMES].sort(), [...LATE_FONT_NAMES].sort(), '두 그룹을 합치면 19종 전체');
eq(LATE_BLOG_FONT_NAMES.filter((n) => (LATE_HANDLE_FONT_NAMES as readonly string[]).includes(n)), [], '두 그룹은 겹치지 않는다');
eq([LATE_BLOG_FONT_NAMES.length, LATE_HANDLE_FONT_NAMES.length], [9, 10], '블로그 9종·아이디 10종');

// 누적 — 두 번째 그룹 mark가 첫 그룹 이름을 지우면 아이디 폰트가 블로그 글꼴 등록 순간 시스템 폰트로 되돌아간다
{
  let groupCalls = 0;
  const off = subscribeLateFonts(() => { groupCalls++; });
  markLateFontsLoaded(LATE_HANDLE_FONT_NAMES.filter((n) => n !== 'Orbitron')); // 아이디 그룹(Orbitron만 실패)
  const sHandle = getLoadedLateFonts();
  eq(groupCalls, 1, '아이디 그룹 mark: 알림 1회(이미 등록된 Pacifico 등이 섞여도 새 이름이 있으면 알림)');
  eq(lateFontFamily('BebasNeue', sHandle), 'BebasNeue', '아이디 그룹 뒤: 아이디 폰트 적용');
  eq(lateFontFamily('NanumBarunpen', sHandle), undefined, '아이디 그룹 뒤: 블로그 글꼴은 아직 시스템 폰트');
  markLateFontsLoaded(LATE_BLOG_FONT_NAMES); // 블로그 그룹
  const sBoth = getLoadedLateFonts();
  eq(groupCalls, 2, '블로그 그룹 mark: 알림 1회 더(총 2회)');
  eq(sBoth.has('BebasNeue') && sBoth.has('NanumBarunpen'), true, '블로그 그룹 뒤: 두 그룹 이름이 누적');
  eq(sBoth.has('Orbitron'), false, '실패한 Orbitron은 블로그 그룹 mark 뒤에도 빠져 있다');
  eq(sBoth.size, 18, '19종 중 실패 1종 제외 18종');
  eq(lateFontFamily('BebasNeue', sHandle), 'BebasNeue', '옛 스냅샷(아이디 그룹 시점)은 그대로');
  off();
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
