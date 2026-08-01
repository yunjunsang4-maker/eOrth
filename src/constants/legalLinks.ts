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
