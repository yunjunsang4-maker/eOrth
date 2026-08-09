// 앱 변형(APP_VARIANT) 동적 설정 — app.json(정식의 진실)을 받아 '변형에서만' 덮어쓴다.
// ⚠️ G1: APP_VARIANT 미설정이면 config를 그대로 반환해야 한다(정식 산출 바이트 동일).
//    scripts/snapshot-expo-config.mjs + 비교로 검증하기 전엔 이 파일을 커밋하지 말 것.
// ⚠️ 변형 경로에는 fail-loud 가드 2개가 있다: 허용되지 않은 APP_VARIANT 값, 운영 Supabase URL 혼입.
//    둘 다 scripts/assert-variant-config.mjs가 EXPO_PUBLIC_SUPABASE_URL을 빈 문자열로 덮어써 우회한다.
const VARIANTS = {
  beta:        { name: 'eOrth β',   suffix: '.beta', scheme: 'eorthbeta' },
  development: { name: 'eOrth Dev', suffix: '.dev',  scheme: 'eorthdev' },
};

// AdMob 데모 앱 ID(Google 공식 샘플) — 변형은 실계정 대신 데모+테스트 유닛을 쓴다
const DEMO_ADMOB_IOS = 'ca-app-pub-3940256099942544~1458002511';
const DEMO_ADMOB_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

module.exports = ({ config }) => {
  const rawVariant = process.env.APP_VARIANT;
  if (!rawVariant) return config; // G1: 정식(및 변수 미설정 로컬) — app.json 그대로, 추가 코드 실행 없음

  const variant = VARIANTS[rawVariant];
  if (!variant) {
    throw new Error(
      `알 수 없는 APP_VARIANT: '${rawVariant}'. 허용값: ${Object.keys(VARIANTS).join(', ')} ` +
        `(오타면 값을 고치고, 새 변형이면 VARIANTS에 추가하세요).`
    );
  }

  // C1ⓒ 가드: 변형 빌드에 운영 Supabase URL이 섞여 들어오면 즉시 실패시킨다.
  // (로컬 .env를 정리하지 않은 채 APP_VARIANT만 바꿔 실행하면 베타/dev 앱이 운영 DB를 가리키는 사고가 난다)
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.includes('blweolnunmsxgztmvzfd')) {
    throw new Error(
      `APP_VARIANT='${rawVariant}'인데 EXPO_PUBLIC_SUPABASE_URL이 운영 프로젝트(blweolnunmsxgztmvzfd)를 가리킵니다.\n` +
        `원인: 로컬 .env(또는 셸 환경변수)에 운영 Supabase URL이 남은 채로 변형 설정/빌드를 실행했습니다.\n` +
        `해결: .env의 EXPO_PUBLIC_SUPABASE_URL/ANON_KEY를 테스트 프로젝트 값으로 바꾸세요(docs/beta-environment-setup.md §1-2). ` +
        `EAS 클라우드 빌드·OTA는 로컬 .env를 쓰지 않고 --environment preview/development로 EAS 환경변수를 읽으므로 이 가드에 걸리지 않습니다.`
    );
  }

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
