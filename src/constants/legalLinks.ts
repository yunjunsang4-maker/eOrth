/**
 * legalLinks.ts — 약관·개인정보처리방침 공개 URL (단일 출처)
 *
 * 설정 화면과 로그인(가입) 화면 두 곳에서 쓰므로 상수를 여기로 모은다.
 * 각 화면이 따로 들고 있으면 주소가 바뀔 때 한쪽만 고쳐지는 사고가 난다.
 *
 * 게시는 gh-pages 브랜치다 — docs/ 에 커밋하는 것만으로는 반영되지 않고
 * `npm run pages:publish` 를 거쳐야 이 URL이 갱신된다.
 */
import { isKoreanLang } from '../utils/langKind';

export const PRIVACY_POLICY_URL = 'https://yunjunsang4-maker.github.io/eOrth/privacy-policy.html';
export const TERMS_URL = 'https://yunjunsang4-maker.github.io/eOrth/terms.html';

/**
 * 영문 번역본. 한국어판이 정본이며 영문판은 편의 제공용이다(각 문서 본문에 명시).
 * 상수를 지우지 않고 나란히 두는 이유는 위 주석과 같다 — 주소가 바뀔 때 네 개를 한자리에서 본다.
 */
export const PRIVACY_POLICY_URL_EN = 'https://yunjunsang4-maker.github.io/eOrth/privacy-policy-en.html';
export const TERMS_URL_EN = 'https://yunjunsang4-maker.github.io/eOrth/terms-en.html';

/**
 * 앱 언어에 맞는 문서 주소를 고른다. 인자는 i18n.language.
 *
 * ⚠️ 법적 문서는 **ko 정본 + en 편의본 2종뿐**이다. 일본어판은 없다(만들면 번역본도
 * 법적 고지가 되어 검수 대상이 된다). 따라서 한국어가 아닌 모든 언어는 영문을 본다 —
 * 판정을 "en인가"가 아니라 "ko인가"로 뒤집은 이유다(ja 사용자에게 한국어 약관이 가면
 * 아예 못 읽는다). 새 언어가 붙어도 여기는 자동으로 영문 쪽이다.
 * (초기화 전 undefined 는 isKoreanLang 규약대로 ko → 정본이 나간다.)
 */

export const privacyPolicyUrl = (language?: string) =>
  isKoreanLang(language) ? PRIVACY_POLICY_URL : PRIVACY_POLICY_URL_EN;

export const termsUrl = (language?: string) => (isKoreanLang(language) ? TERMS_URL : TERMS_URL_EN);

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
