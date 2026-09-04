#
# 로컬 Expo 모듈 photo-location 의 iOS 링크 명세.
#
# ⚠️ 이 파일이 없으면 모듈이 **조용히** 앱에서 빠진다.
#    expo-modules-autolinking 의 apple 해석기는 모듈 디렉터리에서 *.podspec 을 찾고, 없으면
#    그 모듈을 통째로 버린다(build/platforms/apple/apple.js 의 resolveModuleAsync:
#    `if (!podspecFiles.length) return null`). 경고도 오류도 남기지 않는다.
#
#    podspec 없이도 **빌드는 성공한다** — 네이티브에서 이 Swift 를 참조하는 곳이 없기 때문이다.
#    대신 런타임에 requireNativeModule('PhotoLocation') 이 throw 하고
#    isPhotoLocationAvailable 이 false 가 된다. 호출부(TravelImportScreen 의 사진 GPS 판정,
#    utils/recentPhotoCountryScan)는 그 플래그로 갈라 폴백하므로 **아무 오류 없이 기능만
#    빠진 채 동작한다** — 그래서 발견이 어렵다.
#
#    2026-07-30 모듈 생성 시점부터 2026-09-05 까지 iOS 에서 이 상태였다. 같은 결함이
#    photo-vision 에도 있었고(사진 AI 추천 전체가 iOS 에서 무음으로 꺼져 있었다) 같은 날
#    함께 고쳤다. Android 는 android/build.gradle 이 같은 역할을 해 정상이었다.
#
#    요약: 이 파일을 지우면 기능이 죽는데 빌드는 통과한다. 절대 지우지 말 것.
#
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  # 팟 이름이 곧 Swift 모듈 이름이 된다. autolinking 이 생성하는 코드가
  # expo-module.config.json 의 apple.modules 에 적힌 PhotoLocationModule 클래스를 찾으므로,
  # 이 이름을 바꾸면 그쪽도 같이 맞춰야 한다.
  s.name           = 'PhotoLocation'
  s.version        = package['version'] || '1.0.0'
  s.summary        = '사진 자산의 GPS 좌표 일괄 조회(PhotoKit)'
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
