import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../store/toastStore';
import { useRecords } from '../store/recordStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { navigationRef } from '../navigation/navigationRef';
import { saveEnvelope, loadEnvelope, STORE_KEYS } from '../store/persist';
import { EXAMPLE_BANNER_KEY } from '../constants/exampleContent';

// 예시 알림 배너 — 앱을 처음 쓰는 사용자에게 "알림이 이렇게 온다"를 한 번만 보여준다.
// 자체 렌더는 없다(공용 토스트 큐에 넣기만) — 표시·순차 처리는 ToastHost가 담당.
//
// 노출 조건 (하나라도 어긋나면 안 띄운다)
//  · 온보딩을 마치고 앱에 들어온 상태          — 로그인·인트로 중에 뜨면 흐름을 끊는다
//  · 아직 기록이 하나도 없는 신규 사용자        — 이미 쓰는 사용자에겐 안내가 불필요
//  · 이 기기에서 한 번도 보여준 적 없음        — 영속 플래그로 1회 보장
const SHOW_DELAY_MS = 2500; // 진입 직후 화면이 자리잡은 뒤 뜨도록

export default function ExampleNotiBanner() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const { records } = useRecords();
  const entered = useIsAppEntered();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !entered) return;
    if (records.length > 0) return; // 이미 기록이 있는 사용자에겐 띄우지 않는다
    firedRef.current = true; // 조건 재평가로 중복 발사되지 않게 즉시 잠근다

    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    loadEnvelope<boolean>(STORE_KEYS.exampleBannerShown).then((shown) => {
      if (!alive || shown) return;
      timer = setTimeout(() => {
        if (!alive) return;
        pushToast(t(EXAMPLE_BANNER_KEY), () => {
          navigationRef.current?.navigate('Notifications');
        });
        saveEnvelope(STORE_KEYS.exampleBannerShown, true);
      }, SHOW_DELAY_MS);
    });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [entered, records.length, pushToast, t]);

  return null;
}
