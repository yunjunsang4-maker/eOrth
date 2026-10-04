import { useSyncExternalStore } from 'react';

/**
 * 늦게 로드되는 글꼴 19종 — 등록 완료 신호.
 *
 * App.tsx는 첫 화면이 쓰는 핵심 6종(Inter 5종·Montserrat-Black)만 useFonts로 기다리고, 이 19종
 * (블로그 글꼴 types/blogBlocks.ts FONT_OPTIONS, 프리미엄 아이디 폰트 constants/handleFonts.ts)은
 * 그 뒤 백그라운드 loadAsync로 올린다(7a61eb0).
 *
 * 함정 — 등록 전에 이 이름으로 그려진 텍스트는 iOS에서 세션 내내 시스템 폰트로 남는다.
 * RN Fabric의 RCTTextLayoutManager가 NSAttributedString을 LRU 캐시하는데, 캐시 키(AttributedString)에
 * fontFamily '문자열'만 들어가고 해석된 UIFont는 안 들어간다. 그래서 폰트가 나중에 등록돼도 같은
 * Text·같은 props·같은 레이아웃이면 시스템 폰트로 만든 결과를 그대로 재사용한다. expo-font의
 * loadAsync는 등록만 하고 RN에 알리지 않으며, 그 캐시를 비우는 코드도 없다
 * (근거: _workspace/feature/stage3/03_session_audit.md F1).
 *
 * 그래서 등록이 끝나기 전에는 이 19종의 fontFamily를 스타일에 '아예 넣지 않는다'(lateFontFamily).
 * 등록이 끝나 이 저장소가 알리면 구독한 컴포넌트가 다시 렌더되며 fontFamily가 들어가고, 캐시 키가
 * 바뀌어 올바른 폰트로 새로 해석된다. 렌더에서 모듈 값을 직접 읽으면 React Compiler가 그 읽기를
 * 캐시에 굳히므로(아이콘 팔레트 고착과 같은 함정 — icons/palette.ts) 반드시 useLateFontsLoaded()로 받아
 * 인자로 넘길 것.
 *
 * 스냅샷은 '등록에 성공한 이름' 집합이다. 실패한 이름은 끝내 넣지 않는다 — 넣어 봐야 시스템 폰트로
 * 폴백되니 모양은 같고, 나중에 재시도 경로가 생겼을 때 그 이름만 mark하면 캐시 키가 바뀌어 바로 반영된다.
 * react 외 의존이 없는 별도 파일인 이유: lateFonts.verify.ts가 node에서 돌아야 해서(App.tsx의 ttf require를 못 읽는다).
 */

// ⚠️ App.tsx의 백그라운드 로드 목록과 같은 이름이어야 한다 — App.tsx가 `Record<LateFontName, …>`로
// 받으므로 한쪽만 고치면 tsc가 잡는다. 이름은 기록·서버(user.font 등)에 저장된 값이라 바꾸지 말 것.
// 두 그룹으로 나눠 따로 등록·알린다(App.tsx) — 영문 아이디 폰트 10종(합 ~1.5MB)이 10MB짜리
// NanumBarunpen 등 블로그 글꼴(합 ~31MB)을 기다리지 않게. 순서·근거는 App.tsx 늦은 글꼴 effect 주석.
// 블로그 글꼴 (FONT_OPTIONS) — 아이디 폰트 pen·brush·serif·maru(handleFonts.ts)도 이 그룹이라 이쪽을 기다린다
export const LATE_BLOG_FONT_NAMES = [
  'NanumGothic_400Regular',
  'NanumMyeongjo_400Regular',
  'NanumBrushScript_400Regular',
  'NanumPenScript_400Regular',
  'NanumSquare',
  'NanumSquareRound',
  'NanumBarunGothic',
  'NanumBarunpen',
  'MaruBuri',
] as const;
// 아이디 표시 폰트(프리미엄) — 영어 전용, 블로그 그룹과 겹치지 않는 10종
export const LATE_HANDLE_FONT_NAMES = [
  'Pacifico',
  'Caveat',
  'BebasNeue',
  'CourierPrime',
  'Righteous',
  'AmaticSC',
  'PermanentMarker',
  'PlayfairDisplay',
  'Orbitron',
  'Yuyu',
] as const;
export const LATE_FONT_NAMES = [...LATE_BLOG_FONT_NAMES, ...LATE_HANDLE_FONT_NAMES] as const;

export type LateFontName = (typeof LATE_FONT_NAMES)[number];

const LATE = new Set<string>(LATE_FONT_NAMES);

let loaded: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();

// 호출부는 App.tsx 백그라운드 loadAsync의 then 둘(아이디 그룹 → 블로그 그룹)뿐이다 — 비동기 완료라 렌더 중에
// 알릴 일이 없다(렌더 중에 알리면 "다른 컴포넌트 렌더 중 setState" 경고가 난다).
// 여러 번 불려도 누적된다(앞선 그룹의 이름이 빠지지 않는다) — 구독 화면은 그룹마다 1회씩, 최대 2회 다시 렌더된다.
// 새 이름이 하나도 없으면 알리지 않는다(Fast Refresh로 App의 effect가 다시 돌아 같은 목록을 또 mark하는 경우).
export function markLateFontsLoaded(names: readonly string[]) {
  const fresh = names.filter((n) => LATE.has(n) && !loaded.has(n));
  if (fresh.length === 0) return;
  loaded = new Set([...loaded, ...fresh]); // 새 참조여야 구독자가 바뀐 걸 안다
  listeners.forEach((l) => l());
}

/** 비훅 조회 — 렌더 밖(콜백·effect)에서만 쓸 것. 렌더에서는 useLateFontsLoaded() */
export const getLoadedLateFonts = (): ReadonlySet<string> => loaded;

export const subscribeLateFonts = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** 등록이 끝난 늦은 글꼴 이름 집합. 등록이 끝나면 새 집합으로 바뀌어 구독한 컴포넌트가 다시 렌더된다 */
export const useLateFontsLoaded = () => useSyncExternalStore(subscribeLateFonts, getLoadedLateFonts, getLoadedLateFonts);

/**
 * 스타일에 넣을 fontFamily — 늦은 글꼴인데 아직 등록 전이면 undefined(시스템 폰트).
 * 늦은 글꼴이 아닌 이름('Montserrat-Black'·'System' 등)은 그대로 돌려준다.
 */
export const lateFontFamily = (fam: string | undefined | null, loadedSet: ReadonlySet<string>): string | undefined => {
  if (!fam) return undefined;
  return LATE.has(fam) && !loadedSet.has(fam) ? undefined : fam;
};
