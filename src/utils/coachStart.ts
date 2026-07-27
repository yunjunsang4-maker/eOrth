import type { MutableRefObject } from 'react';
import { InteractionManager } from 'react-native';
import { isValidRect } from './coachRect';
import type { CoachRect } from '../components/MainCoachmark';

// 튜토리얼(코치마크) 시작 시 강조 요소를 측정하는 공용 유틸.
// 메인·통계·프로필 세 화면이 각자 복붙해 쓰던 로직을 하나로 합쳤다.

export { isValidRect };

/**
 * 화면 전환 애니메이션이 끝난 뒤로 미룬다.
 *
 * 기존 코드의 setTimeout(450ms)가 하려던 일이 바로 이것이다 — 전환 중에 측정하면
 * 이동 중인 좌표가 잡힌다. 고정 시간 대신 실제 신호를 기다리면 빠른 기기에서는
 * 수십 ms로 끝나고, 느린 기기에서도 필요한 만큼만 기다린다.
 */
export function whenReadyToMeasure(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

// 재시도 상한. 60fps 기준 약 330ms — 이보다 오래 0×0이면 그 요소는 화면에 없다고 본다.
const MAX_FRAMES = 20;

/**
 * 유효한 값이 나올 때까지 프레임마다 measureInWindow를 다시 시도한다.
 * 유효해지는 즉시 반환하고, 상한까지 얻지 못하면 null을 반환한다.
 *
 * null이어도 호출부는 진행해야 한다 — 해당 단계의 스포트라이트만 생략되고
 * 튜토리얼 자체는 뜬다.
 */
export function measureWithRetry(
  ref: MutableRefObject<any>,
  maxFrames: number = MAX_FRAMES,
): Promise<CoachRect | null> {
  return new Promise((resolve) => {
    let left = maxFrames;
    const attempt = () => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') {
        // 노드가 아직 안 붙었을 수 있으니 남은 프레임 동안은 기다려 본다
        if (left-- > 0) requestAnimationFrame(attempt);
        else resolve(null);
        return;
      }
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        const r = { x, y, width, height };
        if (isValidRect(r)) resolve(r);
        else if (left-- > 0) requestAnimationFrame(attempt);
        else resolve(null);
      });
    };
    attempt();
  });
}
