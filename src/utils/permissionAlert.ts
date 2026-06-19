/**
 * 권한 거부 공용 안내
 *
 * 권한이 거부되면 OS는 한 번 거부 후(특히 Android "다시 묻지 않음", iOS 최초 거부 이후)
 * 요청 다이얼로그를 다시 띄우지 않으므로, 사용자가 직접 설정에서 허용할 수 있도록
 * "설정으로 이동" 동선을 항상 함께 제공한다.
 */

import { Alert, Linking } from 'react-native';

/** @param target 권한 대상 이름 (예: '갤러리', '카메라', '연락처') */
export function showPermissionDeniedAlert(target: string): void {
  Alert.alert(
    `${target} 권한이 필요해요`,
    `설정에서 ${target} 접근을 허용해주세요.`,
    [
      { text: '취소', style: 'cancel' },
      { text: '설정으로 이동', onPress: () => Linking.openSettings() },
    ],
  );
}
