import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// 앱내 알림 토스트 1건
export interface ToastItem {
  id: string;
  message: string;
  onPress?: () => void;
}

// ── React 외부(스토어 콜백 등)에서 토스트를 띄우기 위한 명령형 브리지 ──
// RecordProvider가 ToastProvider보다 바깥에 있어 useToast()를 쓸 수 없으므로,
// ToastProvider가 마운트되면 pushToast를 여기에 등록해 둔다.
let toastEmitter: ((message: string, onPress?: () => void) => void) | null = null;
export function emitToast(message: string, onPress?: () => void) {
  toastEmitter?.(message, onPress);
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

  // 명령형 브리지에 현재 pushToast를 등록 (언마운트 시 해제)
  useEffect(() => {
    toastEmitter = pushToast;
    return () => {
      if (toastEmitter === pushToast) toastEmitter = null;
    };
  }, [pushToast]);

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
