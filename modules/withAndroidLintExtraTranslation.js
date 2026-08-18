const { withAppBuildGradle } = require('expo/config-plugins');

//
// 안드로이드 릴리스 빌드의 lint 검사에서 ExtraTranslation 규칙을 끈다.
//
// 왜 필요한가?
//   app.json 의 expo.locales(locales/ko.json · en.json)에는 iOS 전용 권한 문구인
//   NS*UsageDescription 5개만 들어 있는데, prebuild 가 이를 안드로이드
//   values-b+ko/strings.xml · values-b+en/strings.xml 로도 복사한다.
//   기본 로케일(values/strings.xml)에는 같은 키가 없으므로 lint 가
//   "번역본에만 있고 기본 로케일에 없다"(ExtraTranslation)를 오류로 판정하고,
//   :app:lintVitalRelease 가 릴리스 빌드를 중단시킨다(2026-08-18 preview 빌드 실패).
//
//   안드로이드는 이 문자열들을 참조하지 않으므로 lint 지적은 무해하다.
//   런타임 동작에는 영향이 없고, 릴리스(lintVital) 에서만 도는 검사라
//   development 프로필(디버그) 빌드에서는 드러나지 않았다.
//
// 주의: 규칙 하나만 끈다. checkReleaseBuilds 자체를 끄면 실제 릴리스 결함까지 놓친다.
//

const MARKER = "disable 'ExtraTranslation'";
const LINT_BLOCK = ['', '    lint {', `        ${MARKER}`, '    }'].join('\n');
const ANCHOR = /^android \{$/m;

module.exports = function withAndroidLintExtraTranslation(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withAndroidLintExtraTranslation: groovy build.gradle 만 지원 (현재: ${cfg.modResults.language})`
      );
    }
    // 이미 주입돼 있으면 그대로 둔다 (prebuild 반복 실행 대비)
    if (cfg.modResults.contents.includes(MARKER)) return cfg;

    // 조용히 지나가면 25분짜리 빌드가 같은 자리에서 다시 죽는다 → 못 찾으면 즉시 실패시킨다.
    if (!ANCHOR.test(cfg.modResults.contents)) {
      throw new Error("withAndroidLintExtraTranslation: app/build.gradle 에서 'android {' 블록을 찾지 못함");
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(ANCHOR, (m) => m + LINT_BLOCK);
    return cfg;
  });
};
