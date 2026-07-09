import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/**
 * 화면이 보이고(포커스) 앱이 포그라운드일 때만 true.
 *
 * 장식용 무한 애니메이션(글로우·구이 서클 등)은 화면 밖(다른 탭)이나 백그라운드에서도
 * `Animated.loop`가 계속 돌아 GPU를 물고 있어 발열·배터리 소모의 주원인이 된다.
 * 이 훅으로 "보이지 않을 때만" 루프를 멈추면 보이는 화면은 완전히 동일하면서 발열이 줄어든다.
 *
 * 주의: `useIsFocused`는 네비게이터 화면 안에서만 유효하다(이 앱의 장식 컴포넌트는 모두 화면 내부).
 */
export function useAnimationsActive(): boolean {
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  return isFocused && appActive;
}
