import { useBadgeEarning } from '../hooks/useBadgeEarning';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { BADGES } from '../constants/badges';

// 화면과 무관하게 배지를 전역에서 평가·저장한다.
// (프로필을 열지 않아도 기록 작성·맞팔·스트릭 등으로 배지가 즉시 획득·토스트되도록 App 최상단에 마운트)
// 단, 인증 전(로그인/온보딩)에는 평가하지 않는다 — 가입·로그인 전 배지 획득/토스트 방지.
export default function BadgeEvaluator() {
  const entered = useIsAppEntered();
  useBadgeEarning(BADGES, entered);
  return null;
}
