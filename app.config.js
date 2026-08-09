// 앱 변형(APP_VARIANT) 동적 설정 — app.json(정식의 진실)을 받아 '변형에서만' 덮어쓴다.
// ⚠️ G1: APP_VARIANT 미설정이면 config를 그대로 반환해야 한다(정식 산출 바이트 동일).
//    scripts/snapshot-expo-config.mjs + 비교로 검증하기 전엔 이 파일을 커밋하지 말 것.
const VARIANTS = {
  beta:        { name: 'eOrth β',   suffix: '.beta', scheme: 'eorthbeta' },
  development: { name: 'eOrth Dev', suffix: '.dev',  scheme: 'eorthdev' },
};

// AdMob 데모 앱 ID(Google 공식 샘플) — 변형은 실계정 대신 데모+테스트 유닛을 쓴다
const DEMO_ADMOB_IOS = 'ca-app-pub-3940256099942544~1458002511';
const DEMO_ADMOB_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT];
  if (!variant) return config; // 정식(및 변수 미설정 로컬) — app.json 그대로

  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: config.ios.bundleIdentifier + variant.suffix },
    android: { ...config.android, package: config.android.package + variant.suffix },
    // appVariant는 변형에만 주입 — 정식 config에 필드를 추가하면 G1이 깨진다
    extra: { ...config.extra, appVariant: process.env.APP_VARIANT },
    plugins: config.plugins.map((p) => {
      if (!Array.isArray(p)) return p;
      const [name, opts] = p;
      if (name === 'react-native-google-mobile-ads') {
        return [name, { ...opts, iosAppId: DEMO_ADMOB_IOS, androidAppId: DEMO_ADMOB_ANDROID }];
      }
      // 베타 번들용 iOS 구글 클라이언트 발급 후 EAS env로 주입 — 미주입이면 정식 값 유지(무해:
      // 번들 불일치로 네이티브 로그인은 실패하고 auth.ts가 웹 OAuth로 폴백한다)
      if (name === '@react-native-google-signin/google-signin' && process.env.GOOGLE_SIGNIN_IOS_URL_SCHEME) {
        return [name, { ...opts, iosUrlScheme: process.env.GOOGLE_SIGNIN_IOS_URL_SCHEME }];
      }
      return p;
    }),
  };
};
