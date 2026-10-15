const { withAppBuildGradle } = require('expo/config-plugins');

//
// 안드로이드 릴리스 빌드에서 R8 최적화를 실제로 켠다.
//
// 왜 필요한가?
//   app.json 의 expo-build-properties 로 minify·shrinkResources 는 이미 켜져 있지만,
//   Expo 프리빌드 템플릿 app/build.gradle 이
//   getDefaultProguardFile("proguard-android.txt") 를 쓰고, 이 기본 파일에
//   -dontoptimize 가 들어 있어 R8 은 축소·난독화만 하고 최적화는 건너뛴다.
//   플레이 콘솔이 "R8 최적화 사용" 을 권고한 원인이 이것이다(2026-10-16).
//   -optimize 판 기본 파일로 바꾸면 -dontoptimize 가 빠진다.
//
// 위험: 최적화는 리플렉션·JNI 로 클래스를 찾는 네이티브 모듈을 깨뜨릴 수 있다.
//   디버그(development) 빌드에서는 R8 이 돌지 않아 드러나지 않으므로,
//   release(preview/production) 빌드를 실기기에서 반드시 확인할 것.
//

const FROM = 'getDefaultProguardFile("proguard-android.txt")';
const TO = 'getDefaultProguardFile("proguard-android-optimize.txt")';

module.exports = function withR8Optimize(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(`withR8Optimize: groovy build.gradle 만 지원 (현재: ${cfg.modResults.language})`);
    }
    // 이미 치환돼 있으면 그대로 둔다 (prebuild 반복 실행 대비)
    if (cfg.modResults.contents.includes(TO)) return cfg;

    // 조용히 지나가면 최적화가 꺼진 채로 빌드가 나간다 → 못 찾으면 즉시 실패시킨다.
    if (!cfg.modResults.contents.includes(FROM)) {
      throw new Error(`withR8Optimize: app/build.gradle 에서 '${FROM}' 를 찾지 못함`);
    }

    cfg.modResults.contents = cfg.modResults.contents.split(FROM).join(TO);
    return cfg;
  });
};
