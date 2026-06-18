import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// 앱내 알림 토스트 1건
export interface ToastItem {
  id: string;
  message: string;
  onPress?: () => void;
}

interface ToastContextType {
  queue: ToastItem[];
  pushToast: (message: string, onPress?: () => void) => void; // 발생 순서대로 큐 맨 뒤에 추가
  shiftToast: () => void;  // 맨 앞(표시 중) 토스트 제거 → 다음 토스트
  clearToasts: () => void; // 전체 비우기 (로그아웃 등)
}

const ToastContext = createContext<ToastContextType | null>(null);

// 배지·DM 등 모든 앱내 알림 토스트를 한 큐로 모아 발생 순서대로 순차 표시한다.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const pushToast = useCallback((message: string, onPress?: () => void) => {
    setQueue((q) => [...q, { id: `${Date.now()}-${seq.current++}`, message, onPress }]);
  }, []);
  const shiftToast = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clearToasts = useCallback(() => setQueue([]), []);

  return (
    <ToastContext.Provider value={{ queue, pushToast, shiftToast, clearToasts }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
