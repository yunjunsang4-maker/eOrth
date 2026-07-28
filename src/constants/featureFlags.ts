// eOrth - 빌드 환경 기반 피처 플래그
//
// eas.json 채널: development / preview / production
// 로컬 실행·Expo Go 등 채널 미설정 시 Updates.channel 은 null → '테스트'로 간주한다.
import * as Updates from 'expo-updates';

function getChannel(): string | null {
  try {
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

const channel = getChannel();

/**
 * SNS(인스타그램·틱톡 등) 외부 공유 기능 활성화 여부.
 * - 테스트/베타 빌드(development·preview)와 로컬 실행: 비활성 → '준비 중' 안내만 표시
 * - 프로덕션 빌드: 활성 → OS 공유 시트로 외부 앱 공유
 *
 * 프로덕션에서 막고 싶거나 베타에서 열고 싶을 때 이 조건만 바꾸면 된다.
 */
export const SNS_SHARE_ENABLED = channel === 'production';

/**
 * 소셜 피드 광고 슬롯(게시물 7개당 1개) 활성화 여부.
 * 현재는 하우스 광고(앱 기능 홍보)만 표시하므로 전 채널 활성.
 * AdMob 등 외부 네트워크 연결 시 채널 조건(production)과 ATT/동의 처리를 함께 붙일 것.
 */
export const FEED_ADS_ENABLED = true;

/**
 * 제휴(어필리에이트) 캠페인 광고 활성화 여부.
 * 캠페인이 0건이면 자동으로 하우스 광고로 떨어지므로 전 채널 활성으로 둔다.
 */
export const AFFILIATE_ADS_ENABLED = true;

/**
 * AdMob 네이티브 광고 활성화 여부.
 * 실제 단위 ID 발급 완료(2026-07-27)로 활성화. 단, 실제 광고가 나가는 것은
 * production 채널뿐이고 개발·베타 빌드는 adUnits.ts가 테스트 ID로 분기한다.
 */
export const ADMOB_ENABLED = true;

/**
 * 출시 기념 프리미엄 전체 무료 개방.
 *
 * 수익 구조를 구독에서 앱내 재화로 바꾸는 중인데 재화 종류·가격이 아직 없다.
 * 그동안 프리미엄 구조는 그대로 두고 혜택만 전원 개방한다.
 *
 * true인 동안 settingsStore가 내보내는 isPremium이 항상 true가 되므로
 * 게이트 코드(18개 파일)를 건드리지 않아도 된다.
 * 재화 시스템이 준비되면 이 값을 false로 내리고 게이트를 재화 보유 여부로 바꾼다.
 */
export const LAUNCH_FREE_PREMIUM = true;

/**
 * 대륙(국가 지역) 지도 모드 활성화 여부.
 *
 * 지역 경계 데이터가 GADM 4.1이었는데, GADM 라이선스는 학술·비영리 이용만
 * 무료이고 재배포·상업적 이용은 사전 허가를 요구한다. 광고 수익이 있는 앱에
 * 데이터를 넣어 배포하는 것은 양쪽 모두에 해당해서, 출시 전에 데이터를 빼고
 * 이 모드를 껐다(2026-07-28).
 *
 * 재개 방법: OpenStreetMap(ODbL — 상업 이용 허용, 출처 표기 필수)으로 839개
 * 지역을 다시 받아 src/data/geo/*를 복원하고 이 값을 true로 올린다. 절차와
 * 검증된 Overpass 질의는 Important2/gadm-backup-2026-07-28/README.txt 참고.
 *
 * 주의: 기존 사용자의 regionColors·taggedRegions·거주 지역은 GADM 표기를
 * 저장 키로 쓰고 있다("NewYork" 등 공백 제거형). OSM은 "New York"이므로
 * 구→신 별칭 매핑 없이 켜면 사용자 데이터가 유실된다.
 *
 * 한국 시/도 프리셋(koreaRegions)은 GADM과 무관하므로 이 플래그와 상관없이
 * 계속 동작한다 — 거주 지역 칩은 한국 사용자에게 그대로 제공된다.
 */
export const REGION_MAP_ENABLED = false;
