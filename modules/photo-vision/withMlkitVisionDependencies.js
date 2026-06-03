const { withAndroidManifest } = require('expo/config-plugins');

//
// ML Kit 의존성 메타데이터(com.google.mlkit.vision.DEPENDENCIES)를
// 메인 AndroidManifest.xml 의 <application> 에 주입한다.
//
// 왜 라이브러리 매니페스트가 아니라 여기서?
//   expo-dev-launcher(개발 빌드 전용)도 같은 meta-data 키를 다른 값(barcode_ui)으로
//   선언한다. 라이브러리끼리는 우선순위가 같아 tools:replace 로도 충돌을 못 막는다.
//   메인 매니페스트(최상위 우선순위)에서 tools:replace 로 선언해야 모든 라이브러리
//   선언을 덮어쓸 수 있다. (release 빌드에도 동일하게 적용되어 predownload 의도 유지)
//

const META_NAME = 'com.google.mlkit.vision.DEPENDENCIES';
const META_VALUE = 'ocr,face,ica'; // 문서/스크린샷(ocr) · 얼굴(face) · 이미지라벨(ica)

module.exports = function withMlkitVisionDependencies(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    application['meta-data'] = application['meta-data'] || [];
    // 동일 키가 이미 있으면 제거 후 재추가 (중복/잔여 선언 방지)
    application['meta-data'] = application['meta-data'].filter(
      (item) => item?.$?.['android:name'] !== META_NAME
    );
    application['meta-data'].push({
      $: {
        'android:name': META_NAME,
        'android:value': META_VALUE,
        'tools:replace': 'android:value',
      },
    });

    return cfg;
  });
};
