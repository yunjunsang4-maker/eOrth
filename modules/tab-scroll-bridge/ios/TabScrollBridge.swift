import ExpoModulesCore
import UIKit

// iOS 26 탭바 "스크롤 시 제자리 축소" 브리지 (인스타그램식).
//
// 배경: 시스템 minimize(minimizeBehavior="onScrollDown")는 바를 **왼쪽 작은 알약으로 모은다**.
//      사용자가 원한 건 바 전체가 가로 가운데 제자리에서 작아지는 동작이라(2026-10-09),
//      TabNavigator.tsx 는 minimizeBehavior="never" 로 시스템 축소를 끄고 이 모듈이 직접 줄인다.
//      공개 UIKit API 에 "제자리 축소"가 없어서 tabBar.transform 으로 한다.
//
// 구성 (셋 다 앱 시작 시 AppDelegate 구독자가 한 번 설치):
//  1) UIViewController.contentScrollView(for:) 스위즐 — 탭 VC 가 nil 을 돌려줄 때 RN 화면 트리에서
//     세로 주 스크롤뷰를 찾아 준다. 원래는 시스템 minimize 를 구동하려고 넣은 것인데
//     (기본 자동 탐색이 RCTScrollView 내부 UIScrollView 를 못 찾음 —
//      https://github.com/callstack/react-native-bottom-tabs/issues/496 ,
//      https://github.com/software-mansion/react-native-screens/issues/4145),
//     minimize 를 끈 지금도 UIKit 의 하단 scroll-edge(바 배경 전환) 처리가 같은 질문을 하므로 남겨 둔다.
//  2) UIScrollView.didMoveToWindow 스위즐 — 창에 붙는 모든 스크롤뷰의 팬 제스처에 축소기(TabBarShrinker)를
//     타깃으로 건다. 축소기가 런타임에 "탭 화면의 주 스크롤뷰"인지 판정해, 드래그 중에는 손가락을 따라
//     연속으로 줄이고(진행도 p), 손을 떼면 속도·진행도로 펴짐/축소 중 하나에 스냅한다. 캡슐(탭 버튼들)의
//     바닥을 고정점으로 삼아 인스타그램처럼 바닥에 붙은 채 작아진다.
//  3) UITabBar.setFrame: 스위즐 — 줄어든 바에 UIKit 이 frame 을 다시 넣어도 bounds 가 부풀지 않게 막는다.
//     (2026-10-09 실기기 "위만 내려오고 좌우는 안 줄어든다" — 아래 UITabBar 확장 주석 참고.)
public class TabScrollBridgeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    TabScrollSwizzle.install()
    return true
  }
}

// ── 조정 knob — 실기기에서 맞출 값은 여기 넷뿐이다 ──
// 최대 축소 배율(p=1, 가로세로 같은 비율). 캡슐 바닥을 고정한 채 가운데로 작아진다.
private let TSB_SHRINK_SCALE: CGFloat = 0.85
// 손가락이 이만큼(pt) 움직이면 원래 크기 ↔ 최대 축소를 다 오간다. 작을수록 민감하다.
private let TSB_TRACK_DISTANCE: CGFloat = 100
// 손을 뗄 때 세로 속도(pt/s)가 이보다 빠르면 진행도와 상관없이 그 방향으로 스냅(플릭).
private let TSB_SNAP_VELOCITY: CGFloat = 300
// 맨 위에서 이만큼(pt) 안이면 무조건 원래 크기.
private let TSB_TOP_SLACK: CGFloat = 8

private func tsbClamp01(_ value: CGFloat) -> CGFloat {
  return min(max(value, 0), 1)
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

  // UIView 에서 상속받은 메서드(didMoveToWindow·setFrame:)를 하위 클래스 하나에만 거는 안전 스위즐.
  // 그 클래스가 직접 구현하는지는 보장이 없어서, 상속 메서드에 그냥 exchange 하면 **UIView 의 구현**이 바뀌어
  // 앱의 모든 뷰가 이 훅을 탄다. 그래서 먼저 대상 클래스에 class_addMethod 를 시도한다:
  //  - 성공(= 자체 구현이 없었음): 새 구현을 그 클래스에만 얹고, tsb_ 셀렉터 자리에 원래(상속) 구현을
  //    넣는다 → UIView 는 그대로.
  //  - 실패(= 자체 구현이 있음): 그 클래스의 두 메서드를 교환해도 그 클래스 안에서 끝난다.
  private static func swizzleInClassOnly(_ cls: AnyClass, _ originalSelector: Selector, _ swizzledSelector: Selector) {
    guard
      let original = class_getInstanceMethod(cls, originalSelector),
      let swizzled = class_getInstanceMethod(cls, swizzledSelector)
    else { return }
    if class_addMethod(
      cls, originalSelector,
      method_getImplementation(swizzled), method_getTypeEncoding(swizzled)
    ) {
      class_replaceMethod(
        cls, swizzledSelector,
        method_getImplementation(original), method_getTypeEncoding(original)
      )
    } else {
      method_exchangeImplementations(original, swizzled)
    }
  }

  private static let installScrollHookOnce: Void = {
    TabScrollSwizzle.swizzleInClassOnly(UIScrollView.self, #selector(UIView.didMoveToWindow), #selector(UIScrollView.tsb_didMoveToWindow))
  }()

  private static let installTabBarFrameHookOnce: Void = {
    TabScrollSwizzle.swizzleInClassOnly(UITabBar.self, #selector(setter: UIView.frame), #selector(UITabBar.tsb_setFrame(_:)))
  }()

  static func install() {
    _ = installOnce
    _ = installScrollHookOnce
    _ = installTabBarFrameHookOnce
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

extension UIScrollView {
  // 교환 후에는 이 메서드가 didMoveToWindow 자리에서 불리고,
  // 아래 tsb_didMoveToWindow() 호출은 **원래 구현**으로 간다(재귀 아님).
  @objc func tsb_didMoveToWindow() {
    tsb_didMoveToWindow()
    guard window != nil else { return }
    // 같은 스크롤뷰가 창에 여러 번 붙어도(탭 전환·스택 복귀) 타깃이 쌓이지 않게 지우고 다시 건다.
    panGestureRecognizer.removeTarget(TabBarShrinker.shared, action: #selector(TabBarShrinker.handlePan(_:)))
    panGestureRecognizer.addTarget(TabBarShrinker.shared, action: #selector(TabBarShrinker.handlePan(_:)))
    TabBarShrinker.shared.scrollViewDidAttach(self)
  }
}

extension UITabBar {
  // 증상(2026-10-09 실기기): 줄이면 위만 내려오고 좌우 폭은 그대로였다.
  // 원인(가설 — 실기기 증상과 UIKit 동작에서 역추론): UITabBarController 가 레이아웃 패스마다(스크롤 중에도
  //   자주) tabBar.frame 을 다시 넣는다. transform 이 걸린 뷰에 frame 세터가 불리면 UIKit/CALayer 는 "변환된
  //   외접 사각형 = 그 frame" 이 되도록 bounds 를 1/s 배로 부풀린다 → 캡슐 폭(bounds 폭 − 좌우 여백)은 화면에서
  //   원래 폭으로 돌아오고, 고유 높이가 고정인 캡슐은 높이만 s 배로 보인다 = "위만 내려옴".
  // 해법: frame 을 넣는 순간만 transform 을 identity 로 풀었다가 원래 세터를 부르고 되돌린다 → bounds 는 언제나
  //   레이아웃이 의도한 크기, 축소는 transform 만이 담당한다.
  // - transform 대입만 performWithoutAnimation 으로 감싼다. 숨김 애니메이션 같은 바깥 애니메이션 블록 안에서
  //   불려도 frame 변경 자체의 애니메이션은 그대로 산다.
  // - 진행 중인 스냅 애니메이션(UIView 가산 애니메이션)은 끊기지 않는다: performWithoutAnimation 대입은 새 애니메이션을
  //   만들지도 기존 것을 지우지도 않고 모델 값만 바꾸며, 같은 런루프 안에서 원래 값으로 되돌리므로 렌더 시점의
  //   모델 값 + 가산 델타가 전과 같다.
  // - 이제 bounds 부풂(QA M1)의 근본 방어는 이 스위즐이다. TabBarShrinker 의 resetNow·isHidden KVO·펼 때
  //   setNeedsLayout 은 보조로 남겨 둔다. 단 frame **게터**는 여전히 외접 사각형(줄어든 높이)을 돌려주므로
  //   onTabBarMeasured 쪽 대응(탭 전환 복원)은 그대로 필요하다.
  // - setBounds:/setCenter: 로 직접 배치하는 경로는 여기서 못 막는다. react-native-bottom-tabs 는 탭바의
  //   frame·bounds·center 를 직접 쓰지 않는다(node_modules 확인). UIKit 내부 경로는 확인 불가.
  // 교환 후에는 이 메서드가 setFrame: 자리에서 불리고, 안의 tsb_setFrame(_:) 호출은 **원래 구현**으로 간다.
  @objc func tsb_setFrame(_ newFrame: CGRect) {
    let saved = transform
    guard saved != .identity else {
      tsb_setFrame(newFrame)
      return
    }
    UIView.performWithoutAnimation { self.transform = .identity }
    tsb_setFrame(newFrame)
    UIView.performWithoutAnimation { self.transform = saved }
  }
}

// 팬 제스처를 받아 탭바를 손가락에 따라 줄이고 편다.
// 진행도 p∈[0,1](0=원래, 1=최대 축소)는 따로 저장하지 않고 tabBar.transform 의 배율에서 역산한다 —
// resetNow·탭 전환 복원 등 어디서 바꿔도 어긋날 상태가 없다. 제스처 하나 동안만 쓰는 값(기준점 등)만 둔다.
final class TabBarShrinker: NSObject {
  // 제스처 인식기는 타깃을 붙잡지 않으므로(weak) 앱 수명 동안 살아 있는 싱글턴이어야 한다.
  static let shared = TabBarShrinker()

  // 처음 줄인 탭바와 그 isHidden 관찰. 앱에 탭바는 하나라 하나만 둔다(다른 바가 오면 갈아 끼움).
  private weak var observedTabBar: UITabBar?
  private var hiddenObservation: NSKeyValueObservation?

  // 추종 중인 제스처(.began 에서 대상 판정을 통과한 것 하나). 제스처마다 1회 계산해 둔다.
  private weak var activePan: UIPanGestureRecognizer?
  private weak var activeTabBar: UITabBar?
  private var anchorY: CGFloat = 0      // 고정점(탭바 bounds 좌표의 y) — 캡슐 바닥
  private var baseProgress: CGFloat = 0 // p = baseProgress − (dy − baseDy) / TSB_TRACK_DISTANCE
  private var baseDy: CGFloat = 0

  // shared(static let)로만 만들어지므로 알림 등록도 1회다.
  private override init() {
    super.init()
    // 줄어든 채로 백그라운드로 가면 스냅샷·트레잇 변경(다크모드·글자 크기·제어 센터 포함 — 전부 비활성을
    // 거친다) 레이아웃 패스에서 UIKit 이 frame 을 다시 지정한다(QA M1). 근본 방어는 UITabBar.tsb_setFrame
    // 스위즐이고, 이건 보조 — 앱 스냅샷에 줄어든 바가 찍히지 않게 미리 편다.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  @objc private func appWillResignActive() {
    activePan = nil
    if let tabBar = observedTabBar { resetNow(tabBar) }
  }

  @objc func handlePan(_ pan: UIPanGestureRecognizer) {
    guard let scrollView = pan.view as? UIScrollView else { return }
    // 스크롤뷰 자신의 좌표계는 contentOffset 만큼 움직이므로 부모 기준으로 잰다.
    let reference: UIView = scrollView.superview ?? scrollView

    switch pan.state {
    case .began:
      // activePan 은 대상 판정을 통과했을 때만 갈아 끼운다 — 무관한 두 번째 팬(가로 캐러셀 등)이 진행 중인
      // 추종을 끊으면 원래 팬의 .ended 가 동일성 가드에 걸려 바가 중간 크기로 남는다(QA m6).
      guard scrollView.isScrollEnabled,
            let tabBar = Self.tabBar(forMain: scrollView) else { return }
      let inset = scrollView.adjustedContentInset
      // 내용이 화면보다 짧으면(바운스만 되는 화면) 줄일 이유가 없다 — 위로 끌면 바가 줄어 버린다.
      // 가로 캐러셀도 여기서 빠진다(세로로 스크롤할 내용이 없음).
      guard scrollView.contentSize.height + inset.top + inset.bottom > scrollView.bounds.height else { return }
      observeHidden(of: tabBar)
      // 스냅 애니메이션 도중에 다시 잡으면 화면에 보이는 크기에서 이어 가야 한다. UIView 애니메이션은
      // 가산(additive)이라 모델 값만 바꾸면 남은 애니메이션이 겹쳐 손가락보다 늦게 따라온다 → 보이는 값으로
      // 고정하고 transform 애니메이션을 걷어 낸다.
      freezeAtPresentation(tabBar)
      activePan = pan
      activeTabBar = tabBar
      anchorY = Self.capsuleBottom(in: tabBar)
      baseProgress = Self.progress(of: tabBar)
      baseDy = pan.translation(in: reference).y

    case .changed:
      guard pan === activePan, let tabBar = activeTabBar, !tabBar.isHidden else { return }
      // 탭 전환 등으로 이 스크롤뷰가 창에서 빠졌으면 추종만 끊는다(QA m5).
      guard scrollView.window != nil else { activePan = nil; return }
      let dy = pan.translation(in: reference).y
      if Self.isNearTop(scrollView) {
        // 맨 위에 닿으면 펴고, 여기서부터 다시 잰다(위에서 다시 끌어올리면 0부터 줄어든다).
        baseProgress = 0
        baseDy = dy
        animate(tabBar, to: 0)
        return
      }
      // 펴는 애니메이션(맨 위 분기·탭 전환 복원)이 아직 돌고 있으면 보이는 값에서 다시 잰다 —
      // 기준을 0으로 둔 채 이어 가면 보이는 p≈0.5 에서 0.05 로 한 프레임 튄다(QA m7).
      if freezeAtPresentation(tabBar) {
        baseProgress = Self.progress(of: tabBar)
        baseDy = dy
      }
      // dy<0 = 손가락 위로 = 내용 아래로 스크롤 = 축소.
      let raw = baseProgress - (dy - baseDy) / TSB_TRACK_DISTANCE
      let p = tsbClamp01(raw)
      // 끝(0·1)에 닿은 뒤 더 끌면 기준을 끝으로 옮긴다 — 방향을 바꾸는 즉시 바가 반응한다.
      if p != raw {
        baseProgress = p
        baseDy = dy
      }
      setNow(tabBar, progress: p)

    case .ended, .cancelled, .failed:
      guard pan === activePan, let tabBar = activeTabBar else { return }
      activePan = nil
      // 창에서 빠진 스크롤뷰(탭 전환과 플릭이 겹쳐 .cancelled)면 스냅하지 않는다 — 새 탭에서 이미 펴진 바를
      // 다시 줄여 버린다(QA m5).
      guard !tabBar.isHidden, scrollView.window != nil else { return }
      // 손을 뗄 때의 속도로 방향을 정한다. 관성으로 맨 위까지 가는 플릭(손가락 아래로 빠르게)은 여기서
      // 이미 펴지므로, "팬 없이 맨 위 도달"(QA m2)은 대부분 사라진다. 남는 것: 상태바 탭(scrollsToTop),
      // 느리게 놓았는데 관성이 맨 위까지 가는 드문 경우.
      let velocity = pan.velocity(in: reference).y
      let target: CGFloat
      if Self.isNearTop(scrollView) || velocity > TSB_SNAP_VELOCITY {
        target = 0
      } else if velocity < -TSB_SNAP_VELOCITY {
        target = 1
      } else {
        target = Self.progress(of: tabBar) >= 0.5 ? 1 : 0
      }
      animate(tabBar, to: target)

    default:
      break
    }
  }

  // 탭 전환(새 탭 화면이 창에 붙음)·스택/모달에서 복귀하면 원래 크기로.
  // 이게 없으면 ① 스크롤이 없는 지구본 탭으로 옮긴 뒤 줄어든 바를 되돌릴 방법이 없고,
  // ② react-native-bottom-tabs 가 탭 전환 때 tabBar.frame.size.height 를 다시 재서 JS 로 올리는데
  //    (TabViewImpl.swift onTabBarMeasured) transform 이 걸린 뷰의 frame 은 줄어든 높이가 나와
  //    FAB(useRecordFabBottom) 가 그만큼 내려앉는다. 탭을 누르면 UIKit 이 새 탭 뷰를 먼저 창에 붙이고,
  //    JS 왕복 뒤의 SwiftUI 갱신에서 재측정되므로 여기서 되돌리면 측정값이 원래 높이가 된다.
  // 피드의 사진 캐러셀처럼 다른 스크롤뷰 안에 든 것은 스크롤 도중 붙으므로 제외한다(바가 들썩임).
  // 스크롤 꺼진 것(지구본 WKScrollView)도 받는다 — 지구본 탭 진입 신호로 쓴다.
  func scrollViewDidAttach(_ scrollView: UIScrollView) {
    guard let tabBar = Self.tabBar(forMain: scrollView) else { return }
    var ancestor = scrollView.superview
    while let view = ancestor {
      if view is UIScrollView { return }
      ancestor = view.superview
    }
    animate(tabBar, to: 0)
  }

  // 탭 화면의 주 스크롤뷰면 그 탭바를 돌려준다(아니면 nil). contentScrollView 스위즐과 같은 규칙:
  // 가장 가까운 VC 가 탭 소속이고 모달이 아니며, 스크롤뷰가 그 VC 화면 높이의 절반 이상.
  // 탭바가 숨김(빠른공유·병합 모드·튜토리얼 — tabBarHidden)이면 손대지 않는다. 숨겨지는 순간에는
  // isHidden KVO(observeHidden 참고)가 바를 펴 두므로, 다시 보일 때 재측정되는 높이(FAB·useTabBarClearance)도 원래 값이다.
  private static func tabBar(forMain scrollView: UIScrollView) -> UITabBar? {
    var responder: UIResponder? = scrollView.next
    while let current = responder, !(current is UIViewController) {
      responder = current.next
    }
    guard let vc = responder as? UIViewController,
          vc.presentingViewController == nil,
          let tabBar = vc.tabBarController?.tabBar,
          !tabBar.isHidden,
          vc.view.bounds.height > 0,
          scrollView.bounds.height >= vc.view.bounds.height / 2 else { return nil }
    return tabBar
  }

  private static func isNearTop(_ scrollView: UIScrollView) -> Bool {
    return scrollView.contentOffset.y <= -scrollView.adjustedContentInset.top + TSB_TOP_SLACK
  }

  // 고정점 = 탭 버튼들(UIControl)의 합집합 바닥. iOS 26 탭바는 bounds 아래쪽에 홈 인디케이터 여백이 있고
  // 플로팅 캡슐은 그 위에 떠 있어서, bounds 바닥을 고정하면 캡슐 바닥이 (여백)×(1−s) 만큼 내려가 보인다.
  // convert(_:to: tabBar) 는 tabBar 자신의 transform 을 거치지 않는다(목적지가 tabBar 자기 bounds 좌표계라
  // 하위 뷰 → tabBar 사이의 변환만 적용) — 줄어든 상태에서 재도 같은 값이 나온다.
  // ponytail: "UIControl = 탭 버튼" 휴리스틱 — 바 전체를 덮는 UIControl 이 생기면 바닥이 bounds 바닥으로 밀린다.
  //           그때는 탭 아이템 뷰를 더 좁게 고르는 쪽으로 올릴 것.
  private static func capsuleBottom(in tabBar: UITabBar) -> CGFloat {
    var union = CGRect.null
    var queue: [UIView] = tabBar.subviews
    var index = 0
    while index < queue.count {
      let view = queue[index]
      index += 1
      if view.isHidden { continue }
      if view is UIControl {
        if view.bounds.width > 0, view.bounds.height > 0 {
          union = union.union(view.convert(view.bounds, to: tabBar))
        }
        continue
      }
      queue.append(contentsOf: view.subviews)
    }
    // bounds 밖으로 나간 컨트롤이 있으면 고정점이 h 를 넘어 바가 줄며 아래로 밀린다 — h 로 묶는다(QA m8).
    if !union.isNull, union.maxY > 0 { return min(union.maxY, tabBar.bounds.height) }
    let aboveHomeIndicator = tabBar.bounds.height - tabBar.safeAreaInsets.bottom
    return aboveHomeIndicator > 0 ? aboveHomeIndicator : tabBar.bounds.height
  }

  // 진행도 p → transform. 뷰 transform 은 bounds 중심(anchorPoint 0.5) 기준이다.
  //   s  = 1 − (1 − S)·p
  //   ty = (anchorY − h/2)·(1 − s)
  //   T  = CGAffineTransform(translationX: 0, y: ty).scaledBy(x: s, y: s) — 점을 먼저 s 배, 그다음 ty 이동.
  // 검산: 고정점은 중심에서 d = anchorY − h/2 아래. 변환 후 s·d + ty = s·d + d(1 − s) = d → 제자리.
  //       p=0 이면 s=1, ty=0 → identity.
  private static func transform(progress p: CGFloat, height h: CGFloat, anchorY: CGFloat) -> CGAffineTransform {
    if p <= 0 { return .identity }
    let s = 1 - (1 - TSB_SHRINK_SCALE) * p
    let ty = (anchorY - h / 2) * (1 - s)
    return CGAffineTransform(translationX: 0, y: ty).scaledBy(x: s, y: s)
  }

  // transform 의 배율(a)에서 p 를 역산한다: a = 1 − (1 − S)·p → p = (1 − a) / (1 − S).
  private static func progress(of tabBar: UITabBar) -> CGFloat {
    let range = 1 - TSB_SHRINK_SCALE
    guard range > 0 else { return 0 }
    return tsbClamp01((1 - tabBar.transform.a) / range)
  }

  // 드래그 중: 애니메이션 없이 즉시(진행 중인 애니메이션은 .changed 가 먼저 freeze 로 걷어 낸다).
  private func setNow(_ tabBar: UITabBar, progress p: CGFloat) {
    let target = Self.transform(progress: p, height: tabBar.bounds.height, anchorY: anchorY)
    guard tabBar.transform != target else { return }
    UIView.performWithoutAnimation { tabBar.transform = target }
  }

  // 스냅·복원: 바운스 없는(감쇠 1.0) 스프링. 손 속도를 initialSpringVelocity 로 넘기지 않는다 —
  // 감쇠 1.0 이어도 초기 속도가 크면 목표를 지나쳐, p=0 쪽에선 바가 원래보다 커졌다 돌아온다.
  // p=0 이면 anchorY 와 무관하게 identity 라 제스처 밖(탭 전환 복원)에서 불러도 된다.
  private func animate(_ tabBar: UITabBar, to p: CGFloat) {
    let target = Self.transform(progress: p, height: tabBar.bounds.height, anchorY: anchorY)
    guard tabBar.transform != target else { return }
    UIView.animate(
      withDuration: 0.45,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0,
      options: [.beginFromCurrentState, .allowUserInteraction]
    ) {
      tabBar.transform = target
    }
    // 보조 방어: 혹시 setFrame: 스위즐을 비켜 간 경로(setBounds: 등)로 bounds 가 부풀었다면 다음 레이아웃
    // 패스에서 탭바 컨트롤러가 frame 을 다시 넣어 바로잡게 한다(부풀지 않았으면 같은 값이라 무해).
    if p <= 0 { tabBar.superview?.setNeedsLayout() }
  }

  // 화면에 보이는(presentation) transform 을 모델 값으로 고정하고 진행 중인 transform 애니메이션을 걷어 낸다.
  // UIView 가산 애니메이션의 키는 "transform", "transform-1"… 식이라 접두어로 고른다.
  // 걷어 낸 게 있으면 true(호출부가 그 값으로 기준을 다시 잡는다).
  @discardableResult
  private func freezeAtPresentation(_ tabBar: UITabBar) -> Bool {
    let layer = tabBar.layer
    let keys = (layer.animationKeys() ?? []).filter { $0.hasPrefix("transform") }
    guard !keys.isEmpty else { return false }
    let visible = layer.presentation()?.affineTransform() ?? tabBar.transform
    keys.forEach { layer.removeAnimation(forKey: $0) }
    UIView.performWithoutAnimation { tabBar.transform = visible }
    return true
  }

  // 숨김·비활성 전환용: 애니메이션 없이 즉시 원래 크기로.
  private func resetNow(_ tabBar: UITabBar) {
    guard tabBar.transform != .identity else { return }
    UIView.performWithoutAnimation { tabBar.transform = .identity }
    tabBar.superview?.setNeedsLayout()
  }

  // 탭바가 숨겨지는 순간 편다 — 다시 보일 때 onTabBarMeasured 가 줄어든 높이(frame 게터 = 외접 사각형)를
  // 재는 것(QA m1)을 막는다. 숨김 토글의 frame 재지정(QA M1)은 이제 tsb_setFrame 이 근본 방어하고 이건 보조.
  // 신호: react-native-bottom-tabs 가 tabBarHidden 을 바꿀 때 `.toolbar(.hidden)` 과 별도로
  // `tabBar.isHidden = …` 를 직접 쓴다(TabViewImpl.swift 의 updateTabBarAppearance·onChange(of: tabBarHidden)).
  // ponytail: UIKit 프로퍼티 KVO 는 문서상 보장이 없다 — setHidden: 이 KVO 알림을 안 내면 이 경로는 조용히
  //           죽고, 숨김 토글 뒤 FAB·하단 여백이 ≈12pt 어긋난 채 다음 탭 전환까지 남는다. 그때는
  //           RN 쪽 tabBarHidden 변경을 이벤트로 받아 펴는 방식으로 올릴 것.
  private func observeHidden(of tabBar: UITabBar) {
    guard observedTabBar !== tabBar else { return }
    observedTabBar = tabBar
    hiddenObservation = tabBar.observe(\.isHidden, options: [.new]) { [weak self] bar, _ in
      guard bar.isHidden else { return }
      self?.activePan = nil
      self?.resetNow(bar)
    }
  }
}
