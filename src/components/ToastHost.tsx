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

  // 표시 시간 — 글자 수에 비례(2.8s 고정이면 댓글 내용처럼 긴 문구를 다 못 읽는다).
  // 읽기 속도 대략 12자/초 + 인지 여유 1.6초, 2.8~5.5초로 제한.
  const holdMs = Math.min(5500, Math.max(2800, 1600 + (current?.message.length ?? 0) * 80));

  // 보류 상태가 아니면 현재 토스트를 표시하고 일정 시간 후 다음으로 넘긴다
  useEffect(() => {
    if (current == null || suppressed) { setVisible(false); return; }
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), holdMs);
    const next = setTimeout(() => shiftToast(), holdMs + 300);
    return () => { clearTimeout(hide); clearTimeout(next); };
  }, [current, suppressed, shiftToast, holdMs]);

  // 밀어서 닫기 — 사라지는 모션을 보여준 뒤 큐에서 제거
  const dismiss = () => {
    setVisible(false);
    setTimeout(() => shiftToast(), 180);
  };

  if (current == null || suppressed) return null;
  return (
    <Toast
      visible={visible}
      message={current.message}
      position="top"
      onPress={current.onPress}
      visual={current.visual}
      onDismiss={dismiss}
    />
  );
}
