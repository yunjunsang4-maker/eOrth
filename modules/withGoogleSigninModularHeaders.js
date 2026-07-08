const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

//
// @react-native-google-signin 의 iOS SDK가 끌어오는 Swift 팟 AppCheckCore 는
// GoogleUtilities · RecaptchaInterop 을 모듈로 import 해야 하는데, 두 팟은
// 기본적으로 module map 을 만들지 않아 정적 라이브러리 빌드에서 pod install 이
// 실패한다("cannot yet be integrated as static libraries").
// → Podfile 에 :modular_headers => true 를 지정해 module map 생성을 켠다.
//   (react-native-google-signin 공식 문서의 표준 해법)
//
const MARKER = "pod 'GoogleUtilities', :modular_headers => true";
const PODS = [
  "pod 'GoogleUtilities', :modular_headers => true",
  "pod 'RecaptchaInterop', :modular_headers => true",
];

module.exports = function withGoogleSigninModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes(MARKER)) {
        // 앱 타깃 블록 안(use_expo_modules! 바로 뒤)에 삽입한다
        contents = contents.replace(
          /use_expo_modules!/,
          `use_expo_modules!\n  ${PODS.join('\n  ')}`
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
