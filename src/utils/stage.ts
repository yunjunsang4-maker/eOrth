import { Dimensions, useWindowDimensions } from 'react-native';
import { clampStageWidth } from './stageMath';

export { STAGE_MAX_W, clampStageWidth } from './stageMath';

/**
 * 렌더 중 Stage 폭. 창 크기가 바뀌면(폴드 펼침·분할화면) 즉시 반영된다.
 * 폭이 스크롤 계산에 들어가는 곳에 쓴다 — stale 값이면 페이저가 엉뚱한 항목을 가리킨다.
 */
export function useStageWidth(): number {
  return clampStageWidth(useWindowDimensions().width);
}

/**
 * 훅이 아니다. 모듈 최상위 상수를 초기화할 때만 쓴다.
 * 값은 여전히 앱 시작 시점에 박제되지만 clamp된 값이라, 폴드 펼침 시 폭 변화가
 * 360→763(2.1배)에서 360→480(1.3배)로 줄어 어긋남이 눈에 띄지 않는다.
 * 새 코드에서는 useStageWidth()를 쓸 것.
 */
export function stageWidthNow(): number {
  return clampStageWidth(Dimensions.get('window').width);
}
