import { useEffect, useState } from 'react';
import { navigationRef } from '../navigation/navigationRef';

// 사용자가 인증 후 앱 본화면(Main)에 진입했는지 여부.
// 인증 전(Splash·AppIntro·Login·BasicInfo 등 온보딩)에선 false → 배지 평가·토스트를 막는다.
// 판정: 루트 네비게이션 스택에 'Main'이 존재하면 진입한 것(로그인/스플래시가 Main으로 이동).
export function useIsAppEntered(): boolean {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const attach = (): boolean => {
      const nav = navigationRef.current;
      if (!nav) return false;
      const update = () => {
        const state = nav.getRootState?.();
        setEntered(!!state?.routes?.some((r) => r.name === 'Main'));
      };
      update();
      unsub = nav.addListener('state', update);
      return true;
    };
    if (attach()) return () => unsub?.();
    const t = setTimeout(attach, 300); // 컨테이너 마운트 전이면 잠시 후 재시도
    return () => { clearTimeout(t); unsub?.(); };
  }, []);

  return entered;
}
