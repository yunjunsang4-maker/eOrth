import { useEffect, useRef } from 'react';
import { useDM } from '../store/dmStore';
import { useToast } from '../store/toastStore';
import { navigationRef } from '../navigation/navigationRef';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import type { Message } from '../store/dmTypes';

// 메시지 종류별 미리보기 텍스트
const previewOf = (m: Message): string => {
  if (m.type === 'image') return '📷 사진';
  if (m.type === 'record') return '📍 여행 기록을 공유했어요';
  return m.text || '메시지';
};

// 새 DM 수신 → 공용 알림 큐(toastStore)로 발생 순서대로 넘기는 브리지. (자체 렌더 없음)
// 지금 보고 있는 대화/인증 전/시드 메시지는 알리지 않는다. 표시·순차 처리는 ToastHost가 담당.
export default function DMToastHost() {
  const { conversations, friends } = useDM();
  const { pushToast } = useToast();
  const entered = useIsAppEntered();
  const seenRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    // 첫 실행: 현재 메시지 수를 '읽음 기준선'으로 잡아 시드/기존 메시지는 알리지 않는다
    if (seenRef.current === null) {
      const init: Record<string, number> = {};
      for (const h of Object.keys(conversations)) init[h] = conversations[h].length;
      seenRef.current = init;
      return;
    }
    const seen = seenRef.current;
    const curRoute = navigationRef.current?.getCurrentRoute?.();
    const viewingHandle =
      curRoute?.name === 'DM' ? (curRoute.params as any)?.friend?.handle : undefined;

    for (const h of Object.keys(conversations)) {
      const msgs = conversations[h];
      const prev = seen[h] ?? 0;
      if (msgs.length > prev) {
        // 새로 추가된 구간의 '받은' 메시지를 발생 순서대로 큐에 넣는다 (지금 보고 있는 대화는 제외)
        if (entered && h !== viewingHandle) {
          for (let i = prev; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.isMine) continue;
            const friend = friends.find((f) => f.handle === h);
            const name = friend?.name ?? h;
            const emoji = friend?.emoji ?? '💬';
            pushToast(`${emoji} ${name}: ${previewOf(m)}`, () => {
              if (friend) {
                navigationRef.current?.navigate('DM', {
                  friend: { name: friend.name, handle: friend.handle, emoji: friend.emoji, online: friend.online },
                });
              }
            });
          }
        }
        seen[h] = msgs.length;
      }
    }
  }, [conversations, friends, entered, pushToast]);

  return null;
}
