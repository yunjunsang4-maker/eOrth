import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * 햅틱 피드백.
 * expo-haptics(네이티브 모듈)가 빌드에 포함돼 있으면 사용하고,
 * 아직 재빌드 전이면 RN 내장 Vibration으로 폴백한다. (이중 진동 방지)
 */
export function buzz(style: 'light' | 'medium' = 'medium') {
  const ms = style === 'light' ? 10 : 25;
  try {
    Haptics.impactAsync(
      style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    ).catch(() => Vibration.vibrate(ms));
  } catch {
    Vibration.vibrate(ms);
  }
}
