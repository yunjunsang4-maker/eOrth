/**
 * legalLinks.ts — 약관·개인정보처리방침 공개 URL (단일 출처)
 *
 * 설정 화면과 로그인(가입) 화면 두 곳에서 쓰므로 상수를 여기로 모은다.
 * 각 화면이 따로 들고 있으면 주소가 바뀔 때 한쪽만 고쳐지는 사고가 난다.
 *
 * 게시는 gh-pages 브랜치다 — docs/ 에 커밋하는 것만으로는 반영되지 않고
 * `npm run pages:publish` 를 거쳐야 이 URL이 갱신된다.
 */
export const PRIVACY_POLICY_URL = 'https://yunjunsang4-maker.github.io/eOrth/privacy-policy.html';
export const TERMS_URL = 'https://yunjunsang4-maker.github.io/eOrth/terms.html';

/**
 * 영문 번역본. 한국어판이 정본이며 영문판은 편의 제공용이다(각 문서 본문에 명시).
 * 상수를 지우지 않고 나란히 두는 이유는 위 주석과 같다 — 주소가 바뀔 때 네 개를 한자리에서 본다.
 */
export const PRIVACY_POLICY_URL_EN = 'https://yunjunsang4-maker.github.io/eOrth/privacy-policy-en.html';
export const TERMS_URL_EN = 'https://yunjunsang4-maker.github.io/eOrth/terms-en.html';

/**
 * 앱 언어에 맞는 문서 주소를 고른다. 인자는 i18n.language('ko' | 'en').
 *
 * 영어로 판정되는 경우에만 번역본을 주고, 그 외에는 한국어 정본으로 떨어뜨린다.
 * (i18n이 'en-US' 같은 지역 태그를 주더라도 영문이 나가도록 접두 비교를 쓴다.
 *  반대로 알 수 없는 값이 오면 정본이 나가는 편이 법적으로 안전하다.)
 */
const isEnglish = (language?: string) => String(language ?? '').toLowerCase().startsWith('en');

export const privacyPolicyUrl = (language?: string) =>
  isEnglish(language) ? PRIVACY_POLICY_URL_EN : PRIVACY_POLICY_URL;

export const termsUrl = (language?: string) => (isEnglish(language) ? TERMS_URL_EN : TERMS_URL);

/**
 * 외부(카카오톡·인스타 등)로 내보내는 공유 링크 — 앱 스토어 페이지.
 *
 * 게시물별 웹 주소(eorth.app/post/<id>)를 쓰려면 ① 도메인 확보 ② 게시물을 웹으로
 * 렌더하는 페이지 ③ Universal Links(ios.associatedDomains + apple-app-site-association)
 * 세 가지가 모두 필요하다. 그 전까지는 **살아 있는 링크**인 스토어 주소를 내보낸다.
 *
 * 앱이 설치된 사람끼리의 이동은 utils/appLinks.ts 의 eorth:// 딥링크가 담당한다
 * (메이트에게 보내기 경로). 외부 공유는 미설치자도 열 수 있어야 하므로 스킴 링크를 쓰지 않는다.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6778678243';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.yunjunsang.eorth';
