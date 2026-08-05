/**
 * 안드로이드 하드웨어(제스처) 뒤로가기를 막는 훅.
 *
 * 쓰는 곳: 중간에 빠져나가면 상태가 어정쩡해지는 다단계 흐름(과거여행 불러오기 등).
 * 그런 화면은 스와이프 뒤로가기도 함께 끄고(AppNavigator의 gestureEnabled: false),
 * 이탈은 화면 안의 버튼 하나로만 하도록 통일한다 — 그래야 확인창·정리 로직을 우회하지 못한다.
 *
 * ⚠️ 이 훅을 쓰는 화면에는 반드시 화면 안에 나가는 수단이 있어야 한다. 없으면 갇힌다.
 *
 * 동작 메모:
 *  - 리스너는 '포커스된 동안만' 등록한다. 화면을 벗어난 뒤에도 남아 있으면 다른 화면의
 *    뒤로가기까지 먹어버린다(BackHandler는 전역 스택이고 나중에 등록된 것이 먼저 처리된다).
 *  - true를 반환 = "이 뒤로가기는 내가 처리했다" → 기본 동작(화면 pop, 앱 종료)이 일어나지 않는다.
 *  - iOS에서는 hardwareBackPress 이벤트 자체가 발생하지 않아 아무 일도 하지 않는다.
 *  - RN Modal이 열려 있는 동안의 뒤로가기는 Modal이 먼저 가져가므로(onRequestClose)
 *    이 훅이 모달 닫기를 막지는 않는다.
 */
import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function useBlockHardwareBack(enabled: boolean = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [enabled])
  );
}

export default useBlockHardwareBack;
