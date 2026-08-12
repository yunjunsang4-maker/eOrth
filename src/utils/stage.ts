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
 * 클램프된 컬럼 바깥에 남는 레터박스 한쪽 폭. 창이 480dp 이하면 0이다.
 *
 * RN Modal은 App.tsx 루트 클램프 밖(창 루트)에 그려진다. 그래서 Modal 안에서
 * `right: 16`처럼 창 가장자리 기준으로 붙인 팝오버·드롭다운은 폴드·태블릿에서
 * 컬럼이 아니라 창 가장자리에 붙어, 그 메뉴를 연 버튼과 100~180dp 어긋난다.
 * 그런 오프셋에 이 값을 더하면 컬럼 가장자리 기준으로 되돌아온다.
 * (시트처럼 '폭'이 문제인 곳은 이 값이 아니라 STAGE_MAX_W로 클램프한다.)
 */
export function useStageGutter(): number {
  const w = useWindowDimensions().width;
  return Math.max(0, (w - clampStageWidth(w)) / 2);
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
