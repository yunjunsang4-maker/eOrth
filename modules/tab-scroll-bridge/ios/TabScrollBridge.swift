import ExpoModulesCore
import UIKit

// iOS 26 탭바 "스크롤 시 축소"(minimizeBehavior="onScrollDown") 브리지.
//
// 증상: TabNavigator.tsx 의 IosTabNavigator 에 minimizeBehavior="onScrollDown" 이 켜져 있는데도
//      iOS 26 실기기에서 아래로 스크롤해도 탭바가 전혀 줄어들지 않는다.
//
// 원인: UIKit 은 축소를 구동할 스크롤뷰를 선택된 탭의 view controller 에게
//      contentScrollView(for:) (ObjC contentScrollViewForEdge:) 로 묻는다. 기본 구현의 자동 탐색은
//      RN 화면 트리 깊숙이 중첩된 UIScrollView(RCTScrollView 내부 등)를 못 찾아 nil 을 돌려주고,
//      nil 이면 축소가 아예 일어나지 않는다.
//      - https://github.com/callstack/react-native-bottom-tabs/issues/496
//      - https://github.com/software-mansion/react-native-screens/issues/4145
//      - 참고 구현: https://gist.github.com/pugson/0ea6124c2590984793a8a6afbfcaa1f4
//        (react-native-bottom-tabs 를 패치해 같은 스위즐을 넣는 방식)
//
// 해법: node_modules 패치 대신 이 로컬 모듈의 AppDelegate 구독자가 앱 시작 시 한 번
//      UIViewController.contentScrollView(for:) 를 스위즐한다. 원래 구현이 무언가 돌려주면 그대로
//      쓰고, nil 일 때만 — 그리고 탭바 컨트롤러 소속 VC 일 때만 — 하위 뷰를 BFS 로 뒤져 세로
//      스크롤뷰를 돌려준다. 스택 화면 위에 present 된 모달·탭 밖 VC 는 tabBarController 가 nil 이라
//      원래 동작 그대로다.
public class TabScrollBridgeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    TabScrollSwizzle.install()
    return true
  }
}

// 타입 이름을 모듈 이름(TabScrollBridge)과 다르게 둔다 — 같으면 모듈 한정 이름 해석이 꼬이는 Swift 함정이 있다.
enum TabScrollSwizzle {
  // static let 초기화는 Swift 가 한 번만, 스레드 안전하게 실행한다.
  // method_exchangeImplementations 를 두 번 부르면 원상복구되므로 반드시 1회여야 한다.
  private static let installOnce: Void = {
    guard
      let original = class_getInstanceMethod(
        UIViewController.self,
        #selector(UIViewController.contentScrollView(for:))
      ),
      let swizzled = class_getInstanceMethod(
        UIViewController.self,
        #selector(UIViewController.tsb_contentScrollView(for:))
      )
    else { return }
    method_exchangeImplementations(original, swizzled)
  }()

  static func install() {
    _ = installOnce
  }
}

extension UIViewController {
  // 교환 후에는 이 메서드가 contentScrollView(for:) 자리에서 불리고,
  // 아래 tsb_contentScrollView(for:) 호출은 **원래 구현**으로 간다(재귀 아님).
  @objc func tsb_contentScrollView(for edge: NSDirectionalRectEdge) -> UIScrollView? {
    if let found = tsb_contentScrollView(for: edge) {
      return found
    }
    // 탭 소속 VC 만 대상. UITabBarController 자신은 제외(그 아래 자식이 따로 질문받는다).
    // 모달·탭 밖 VC 는 tabBarController 가 nil 이라 여기서 빠진다.
    // present 된 모달은 tabBarController 가 남아 있을 수 있어 presentingViewController 로 한 번 더 거른다.
    guard isViewLoaded, tabBarController != nil, !(self is UITabBarController),
          presentingViewController == nil else {
      return nil
    }
    return tsb_findMainScrollView(in: view)
  }

  // 하위 뷰를 BFS 로 훑어 "화면의 주 스크롤뷰"를 고른다.
  // 소셜 탭은 상단에 가로 스냅 링 리스트가, 프로필은 가로 ScrollView 가 본문보다 먼저(얕게) 있어서
  // 첫 UIScrollView 를 그냥 고르면 그 짧은 가로 리스트가 잡혀 세로 스크롤로 축소가 안 된다.
  // 그래서 VC view 높이의 절반 이상인 것만 받는다(가로 리스트는 화면 높이보다 한참 짧다).
  // 숨은 하위 트리(비활성 화면 등)는 통째로 건너뛴다.
  // ponytail: 높이 휴리스틱 — 화면 절반 이상인 가로 캐러셀이 본문보다 얕게 놓이면 그게 잡힌다.
  //           그런 화면이 생기면 RN 쪽에서 nativeID 등으로 표시해 고르는 방식으로 올릴 것.
  private func tsb_findMainScrollView(in root: UIView) -> UIScrollView? {
    // 레이아웃 전(높이 0)이면 절반 규칙이 무력화돼 아무 스크롤뷰나 잡히므로 고르지 않는다.
    guard root.bounds.height > 0 else { return nil }
    let minHeight = root.bounds.height / 2
    var queue: [UIView] = root.subviews
    var index = 0
    while index < queue.count {
      let candidate = queue[index]
      index += 1
      if candidate.isHidden { continue }
      // 스크롤 꺼진 것(지구본 WebView 내부 WKScrollView 등)은 본문이 아니다 — Main 탭이 엉뚱하게 잡히는 것 방지.
      if let scrollView = candidate as? UIScrollView, scrollView.isScrollEnabled,
         scrollView.bounds.height >= minHeight {
        return scrollView
      }
      queue.append(contentsOf: candidate.subviews)
    }
    return nil
  }
}
