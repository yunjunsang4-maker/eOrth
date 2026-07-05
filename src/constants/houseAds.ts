// 소셜 피드 광고 슬롯에 표시할 하우스 광고(앱 기능 홍보) 데이터.
//
// 광고 슬롯의 '소스'는 교체 가능하게 설계되어 있다:
//   현재(베타)   : 하우스 광고 (이 파일)
//   출시 이후    : 직판/제휴 캠페인 → AdMob 네이티브 → 하우스 광고 순 폴백
// AdMob 네이티브로 전환할 때도 렌더러(FeedAdCard)는 그대로 두고, 이 데이터 대신
// 광고 응답(headline·image·CTA)을 같은 모양으로 흘려 넣으면 된다.
// (AdMob 필수 요소: '광고' 표기 + headline 노출 — FeedAdCard가 이미 충족)
export interface HouseAd {
  id: string;
  emoji: string;                          // 이미지 대신 그라데이션+이모지 (하우스 광고용)
  titleKey: string;                       // 헤드라인 i18n 키
  bodyKey: string;
  ctaKey: string;
  route: 'FriendSearch' | 'NewRecord';    // 탭 시 이동할 화면
  gradient: readonly [string, string];    // 미디어 영역 배경
}

export const HOUSE_ADS: HouseAd[] = [
  {
    id: 'house-invite',
    emoji: '🤝',
    titleKey: 'social.adInviteTitle',
    bodyKey: 'social.adInviteBody',
    ctaKey: 'social.adInviteCta',
    route: 'FriendSearch',
    gradient: ['#6B21A8', '#BF85FC'],
  },
  {
    id: 'house-autoload',
    emoji: '🗂️',
    titleKey: 'social.adAutoloadTitle',
    bodyKey: 'social.adAutoloadBody',
    ctaKey: 'social.adAutoloadCta',
    route: 'NewRecord',
    gradient: ['#0E7490', '#22D3EE'],
  },
];

/** 슬롯 순번 → 하우스 광고 로테이션 */
export const getHouseAd = (slot: number): HouseAd => HOUSE_ADS[slot % HOUSE_ADS.length];
