// 플로팅 탭 바가 화면 하단에서 잡아먹는 높이 — 탭 바와 탭 화면 여백의 단일 출처.
//
// 왜 파일로 뺐나: 치수(높이 63 · 띄움 24)가 CustomTabBar 안에만 있었고, 탭 화면들은
// 그 값을 모른 채 각자 리터럴을 들고 있었다(Stats 70 / Social 110 / Profile 110).
// 셋 다 요구치 미달이었고, 값이 똑같이 110인 두 곳은 한 번에 주입된 흔적이다.
// 화면 쪽 값만 고치면 네 번째가 또 생기므로, 치수를 여기로 올리고 CustomTabBar도
// 여기서 읽게 했다. 바와 화면이 같은 출처를 봐야 값이 다시 갈라지지 않는다.
//
// ⚠️ 화면이 CustomTabBar를 직접 import하면 안 된다(컴포넌트 → 화면 → 컴포넌트 순환).
//    그래서 상수만 utils로 내리고 컴포넌트가 utils를 import하는 방향으로 고정한다.
//    utils/stage.ts(STAGE_MAX_W)와 같은 구성이다.

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 탭 바 컨테이너 높이. CustomTabBar의 SVG 시안 기준 고정값이다. */
export const TAB_BAR_H = 63;

/** 탭 바 컨테이너를 안전영역 위로 띄우는 간격(`bottom: insets.bottom + 이 값`). */
export const TAB_BAR_GAP = 24;

/**
 * 탭 바가 깔리는 화면(TabNavigator의 4개)에서 하단 콘텐츠가 바에 가리지 않도록
 * 비워야 하는 높이. ScrollView의 `contentContainerStyle.paddingBottom`에 그대로 쓴다.
 *
 * 바의 윗면 = 화면 하단에서 `insets.bottom + TAB_BAR_GAP + TAB_BAR_H`이므로
 * 실제 요구치는 내비 모드마다 다르다 — 안드로이드 3버튼(insets.bottom 48) 135,
 * 제스처(24) 111, iOS 홈 인디케이터(34) 121, iOS 홈 버튼(0) 87.
 *
 * ⚠️ 플랫폼 분기를 넣지 마라. 리터럴 70/110은 안드로이드뿐 아니라 iOS 홈 인디케이터
 *    기기에서도 미달이었다(Stats는 51dp 부족). 이건 "안드로이드 전용 결함"이 아니라
 *    "인셋을 안 읽은 결함"이라, 양 플랫폼 공통으로 인셋에서 계산해야 맞는다.
 *
 * `extra`는 바를 지나서 **추가로** 띄우고 싶은 만큼이다. 기본 0 — 스크롤 끝이 바
 * 윗면에 딱 닿는다(기존 ProfileScreen의 110이 제스처 기준 111과 사실상 같았던,
 * "탭 바를 겨우 지나가게" 하는 원래 설계 의도를 그대로 유지한 것).
 *
 * 탭 바가 없는 스택 화면(AppNavigator에 push되는 47개)에서는 쓰지 마라 —
 * 거기서는 이만큼 비워도 가려지는 것이 없어 빈 공간만 남는다.
 */
export function useTabBarClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_GAP + TAB_BAR_H + extra;
}
