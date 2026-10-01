#
# 로컬 Expo 모듈 tab-scroll-bridge 의 iOS 링크 명세.
#
# ⚠️ 이 파일이 없으면 모듈이 **조용히** 앱에서 빠진다.
#    expo-modules-autolinking 의 apple 해석기는 모듈 디렉터리에서 *.podspec 을 찾고, 없으면
#    그 모듈을 통째로 버린다(build/platforms/apple/apple.js 의 resolveModuleAsync:
#    `if (!podspecFiles.length) return null`). 경고도 오류도 남기지 않는다.
#
#    이 모듈은 JS 진입점이 없고 AppDelegate 구독자만 있으므로, 빠져도 **빌드도 런타임도
#    아무 오류가 없다** — iOS 26 탭바가 스크롤에 축소되지 않는 증상만 돌아온다.
#    (photo-location·photo-vision 이 2026-07-30~09-05 iOS 에서 이렇게 무음으로 빠져 있었다.)
#
#    요약: 이 파일을 지우면 기능이 죽는데 빌드는 통과한다. 절대 지우지 말 것.
#
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  # 팟 이름이 곧 Swift 모듈 이름이 된다. autolinking 이 생성하는 ExpoModulesProvider 가
  # `import TabScrollBridge` 후 expo-module.config.json 의
  # apple.appDelegateSubscribers 에 적힌 TabScrollBridgeAppDelegateSubscriber 를 참조한다.
  s.name           = 'TabScrollBridge'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'iOS 26 탭바 스크롤 축소용 contentScrollView(for:) 브리지'
  s.description    = s.summary
  s.license        = { :type => 'MIT' }
  s.author         = { 'eOrth' => 'yunjunsang4@gmail.com' }
  s.homepage       = 'https://github.com/yunjunsang4-maker/eOrth'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C 상호운용 — Expo 로컬 모듈 표준 설정
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
