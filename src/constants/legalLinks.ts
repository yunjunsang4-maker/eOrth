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
