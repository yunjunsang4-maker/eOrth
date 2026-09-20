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

// ⚠️ iOS는 2026-09-20부터 하단 바가 네이티브 UITabBar다(TabNavigator가 플랫폼으로 갈린다).
//    네이티브 바는 여기 상수(63 + 24)와 아무 상관 없는 높이를 갖고, iOS 26에서는 스크롤에
//    따라 축소되기까지 한다 — 그래서 iOS에서는 계산값 대신 **실측 높이**를 쓴다.
//    Android(CustomTabBar)는 아래 식 그대로다.

import { useContext } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';

/** 탭 바 컨테이너 높이. CustomTabBar의 SVG 시안 기준 고정값이다. */
export const TAB_BAR_H = 63;

/** 탭 바 컨테이너를 안전영역 위로 띄우는 간격(`bottom: insets.bottom + 이 값`). */
export const TAB_BAR_GAP = 24;

/** 네이티브 바 윗면과 콘텐츠 사이에 두는 최소 숨구멍. 플로팅 바(24)만큼 띄울 필요는 없다. */
const NATIVE_TAB_BAR_GAP = 8;

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
  const nativeH = useNativeTabBarHeight();
  // 훅은 플랫폼과 무관하게 **둘 다 항상** 부른다 — 조건부 호출은 훅 순서를 깨뜨린다.
  return Platform.OS === 'ios' && nativeH > 0
    ? nativeH + NATIVE_TAB_BAR_GAP + extra
    : insets.bottom + TAB_BAR_GAP + TAB_BAR_H + extra;
}

/**
 * iOS 네이티브 탭 바(UITabBar)의 실측 높이. 탭 씬 밖이거나 아직 측정 전이면 0.
 *
 * 값의 출처는 react-native-bottom-tabs의 `onTabBarMeasured` —
 * Swift 쪽이 `tabController.tabBar.frame.size.height`를 그대로 올린다(TabViewImpl.swift).
 * UITabBar의 frame은 홈 인디케이터 안전영역을 **포함한** 높이라(≈83 / 홈버튼 기기 ≈49),
 * insets.bottom을 따로 더하면 안 된다.
 *
 * ⚠️ 같은 라이브러리의 `useBottomTabBarHeight()`를 쓰지 않는다 — 그 훅은 컨텍스트가
 *    없으면 **throw** 한다. 이 함수는 Android(CustomTabBar 경로)와 탭 밖 스택 화면에서도
 *    같은 코드로 불리므로 컨텍스트를 직접 읽어 0으로 떨어뜨린다.
 *    (라이브러리 초기값도 0이라 "측정 전"과 "컨텍스트 밖"이 같은 폴백을 탄다.)
 */
/** 스냅 버튼은 FAB보다 이만큼 위 (옛 129 - 73). RecordFab과 MainScreen 앵커가 같이 쓴다.
 *  iOS는 FAB가 스냅 **바로 아래** 같은 세로선에 놓이므로(2026-09-20) FAB 높이 56 + 틈 10 = 66.
 *  Android는 FAB가 중앙·스냅이 우측이라 겹칠 일이 없어 옛 값 그대로. */
export const SNAP_ABOVE_FAB = Platform.OS === 'ios' ? 66 : 56;
/** iOS 전용: FAB(+)의 right — 스냅(right 46, 지름 60) 중심선에 FAB(지름 56)를 맞춘 값 = 46 + (60−56)/2.
 *  RecordFab(그리는 쪽)과 MainScreen(코치마크 FAB 사각형)이 같이 읽는다. Android는 FAB가 컬럼 중앙이라 안 쓴다. */
export const IOS_FAB_RIGHT = 48;
/** iOS 네이티브 바 프레임 윗면 기준 FAB 바닥 오프셋(음수 = 프레임 안으로 파묻힘).
 *  씬 안에 그리므로 바 캡슐과 겹치는 부분은 유리 뒤로 들어간다 — 프레임 위쪽의 캡슐 밖 투명 여백만큼은
 *  내려도 보이므로, "캡슐 윗선에 닿아 보이는" 정도를 실기기로 맞춘다. 창 최상위 레이어로 올려 진짜로
 *  얹는 방법은 탭 전환 시 JS가 지울 때까지 남아 폐기(2026-09-20). 이 값 하나만 조정한다. */
const FAB_GAP = 16; // 2026-09-20: FAB가 우측 세로선으로 가며 바 캡슐 위에 얹을 이유가 없어져 바 윗면에서 16 띄운다(옛 −6)

/**
 * 기록 추가 FAB(+)의 bottom — 안전영역을 **포함한** 절대값이라 그대로 style.bottom에 쓴다.
 * · Android(JS 플로팅 바): insets.bottom + 73 (원래 값 그대로).
 * · iOS(네이티브 UITabBar): 실측 바 높이 + FAB_GAP(프레임 윗면 기준, 음수면 살짝 파묻힘). 옛 좌표(+73)를 그대로 두면 바가
 *   낮아진 만큼(≈24pt) FAB가 허공에 떠서 "동떨어져" 보였다(2026-09-20 실기기). 측정 전엔 옛 값.
 * ⚠️ RecordFab(그리는 쪽)과 MainScreen(코치마크 앵커·대륙 모드 스택)이 반드시 같은 값을 읽어야
 *    한다 — 한쪽만 바꾸면 튜토리얼 링이 버튼에서 빗나간다(실제로 12pt 어긋난 적 있음).
 */
export function useRecordFabBottom(): number {
  const insets = useSafeAreaInsets();
  const nativeH = useNativeTabBarHeight();
  return Platform.OS === 'ios' && nativeH > 0 ? nativeH + FAB_GAP : insets.bottom + 73;
}

export function useNativeTabBarHeight(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
