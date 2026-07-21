// 표시 전용 짧은 국가명 — 데이터 키(countryColors·지도 매칭용 KO_TO_EN 영문명)는 그대로 두고
// 화면 표기만 축약한다. 긴 영문명이 그리드/티켓/카드 박스를 밀지 않도록.
// 의존성 없는 순수 상수라 어느 모듈에서든 순환 걱정 없이 import 가능.
export const SHORT_COUNTRY_EN: Record<string, string> = {
  '미국': 'U.S.A',
  '영국': 'U.K',
  '아랍에미리트': 'UAE',
};
