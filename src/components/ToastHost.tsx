import React, { useEffect, useState } from 'react';
import Toast from './Toast';
import { useToast } from '../store/toastStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { navigationRef } from '../navigation/navigationRef';

// 토스트가 어색하게 겹치는 전체화면 캡처 화면 — 이 화면에선 알림 토스트를 잠시 보류한다.
const FULLSCREEN_ROUTES = ['SnapRecord', 'CutRecord'];

// 모든 앱내 알림 토스트(배지·DM 등)를 발생 순서대로 한 건씩 순차 표시하는 단일 호스트.
// 표시 위치는 상단(앱내 알림). 전체화면 캡처 화면에선 보류, 인증 전/로그아웃 시엔 비운다.
export default function ToastHost() {
  const { queue, shiftToast, clearToasts } = useToast();
  const entered = useIsAppEntered();
  const current = queue[0] ?? null;
  const [visible, setVisible] = useState(false);
  const [routeName, setRouteName] = useState<string | undefined>(undefined);

  // 현재 라우트 추적 (전체화면 캡처 화면 보류용)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const attach = (): boolean => {
      const nav = navigationRef.current;
      if (!nav) return false;
      const update = () => setRouteName(nav.getCurrentRoute()?.name);
      update();
      unsub = nav.addListener('state', update);
      return true;
    };
    if (attach()) return () => unsub?.();
    const t = setTimeout(attach, 300);
    return () => { clearTimeout(t); unsub?.(); };
  }, []);

  // 인증이 풀리면(로그아웃) 대기 중인 알림은 폐기
  useEffect(() => { if (!entered) clearToasts(); }, [entered, clearToasts]);

  const suppressed = !entered || (routeName != null && FULLSCREEN_ROUTES.includes(routeName));

  // 보류 상태가 아니면 현재 토스트를 표시하고 일정 시간 후 다음으로 넘긴다
  useEffect(() => {
    if (current == null || suppressed) { setVisible(false); return; }
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 2800);
    const next = setTimeout(() => shiftToast(), 3100);
    return () => { clearTimeout(hide); clearTimeout(next); };
  }, [current, suppressed, shiftToast]);

  if (current == null || suppressed) return null;
  return <Toast visible={visible} message={current.message} position="top" onPress={current.onPress} />;
}
