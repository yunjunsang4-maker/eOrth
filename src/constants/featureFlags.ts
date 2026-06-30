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
