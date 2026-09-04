#
# 로컬 Expo 모듈 photo-vision 의 iOS 링크 명세.
#
# ⚠️ 이 파일이 없으면 모듈이 **조용히** 앱에서 빠진다.
#    expo-modules-autolinking 의 apple 플랫폼 해석기는 모듈 디렉터리에서 *.podspec 을 찾고,
#    하나도 없으면 그 모듈을 통째로 버린다(build/platforms/apple/apple.js 의 resolveModuleAsync:
#    `if (!podspecFiles.length) return null`). 경고도 오류도 남기지 않는다.
#
#    그래서 podspec 없이도 **빌드는 성공한다** — 네이티브 쪽에서 이 Swift 파일들을 참조하는
#    곳이 없으니 실패할 이유가 없다. 대신 런타임에 requireNativeModule('PhotoVision') 이
#    throw 하고 isPhotoVisionAvailable 이 false 가 되어, 사진 AI 기능 전체가 무음으로 꺼진다.
#    2026-06-03 모듈 생성 시점부터 2026-09-05 까지 iOS 에서 이 상태였고, 실기기 검증을
#    한 적이 없어 아무도 눈치채지 못했다. Android 는 android/build.gradle 이 같은 역할을
#    하고 있어 정상이었다.
#
#    요약: 이 파일을 지우면 기능이 죽는데 빌드는 통과한다. 절대 지우지 말 것.
#
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  # 팟 이름이 곧 Swift 모듈 이름이 된다. autolinking 이 생성하는 코드가
  # `import PhotoVision` 후 expo-module.config.json 의 apple.modules 에 적힌
  # PhotoVisionModule 클래스를 찾으므로, 이 이름을 바꾸면 그쪽도 같이 맞춰야 한다.
  s.name           = 'PhotoVision'
  s.version        = package['version'] || '1.0.0'
  s.summary        = '온디바이스 사진 분석(Vision) — 품질·장면 라벨·색감·지각 해시'
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
