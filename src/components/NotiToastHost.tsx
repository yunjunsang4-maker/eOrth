import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast, type ToastVisual } from '../store/toastStore';
import { useRecords } from '../store/recordStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { navigationRef } from '../navigation/navigationRef';
import { fetchAppNotifications, subscribeNotifications, type AppNotification } from '../services/social';
import { getMyUserId } from '../services/profile';
import { isSupabaseConfigured } from '../services/supabase';

// 서버 알림(좋아요·댓글·답글·메이트·이웃 새 기록) → 앱내 배너 브리지. (자체 렌더 없음)
// 예전엔 배너 호스트가 DM·배지뿐이라, 앱을 켜둔 채로 좋아요·댓글이 달려도
// 배지 숫자만 조용히 오르고 배너는 뜨지 않았다.
//
// 표시·순차 처리는 ToastHost가 담당하고, 여기서는 큐에 넣기만 한다.

const TYPE_MAP: Record<
  AppNotification['type'],
  { key: string; icon?: ToastVisual['icon']; toPost?: boolean }
> = {
  like:             { key: 'misc.likeText',            icon: 'like',    toPost: true },
  comment:          { key: 'misc.commentText',         icon: 'comment', toPost: true },
  reply:            { key: 'misc.replyText',           icon: 'comment', toPost: true },
  friend_post:      { key: 'misc.friendPostText',      icon: 'record',  toPost: true },
  neighbor_request: { key: 'misc.neighborRequestText', icon: 'follow' },
  neighbor_accept:  { key: 'misc.neighborAcceptText',  icon: 'follow' },
};

export default function NotiToastHost() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const { records, feedPosts, isMuted, isBlocked } = useRecords();
  const entered = useIsAppEntered();

  // 최신 값을 콜백에서 쓰기 위한 ref — 구독은 마운트 시 1회만 걸고 재구독하지 않는다
  const ctxRef = useRef({ t, pushToast, records, feedPosts, isMuted, isBlocked });
  ctxRef.current = { t, pushToast, records, feedPosts, isMuted, isBlocked };
  // 이미 배너로 띄운 알림 id — 구독 재연결·중복 이벤트로 같은 알림이 두 번 뜨지 않게
  const shownRef = useRef<Set<string>>(new Set());
  // 첫 조회로 '기준선'을 잡기 전에는 배너를 띄우지 않는다
  // (앱을 열자마자 기존 미읽음 알림이 배너로 쏟아지는 것 방지)
  const baselineRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !entered) return;
    let alive = true;
    let unsub: (() => void) | null = null;

    // 기준선: 지금 존재하는 알림은 '이미 있던 것'으로 표시만 해두고 배너는 띄우지 않는다
    fetchAppNotifications().then((rows) => {
      if (!alive) return;
      rows.forEach((r) => shownRef.current.add(r.id));
      baselineRef.current = true;
    });

    getMyUserId().then((uid) => {
      if (!alive || !uid) return;
      unsub = subscribeNotifications(uid, async () => {
        if (!baselineRef.current) return; // 기준선 전 도착분은 무시(다음 조회에 포함됨)
        const rows = await fetchAppNotifications();
        if (!alive) return;
        const { t: tr, pushToast: push, records: recs, feedPosts: feed, isMuted: muted, isBlocked: blocked } = ctxRef.current;
        // 새로 생긴 것만, 오래된 순으로 큐에 넣어 도착 순서를 지킨다
        const fresh = rows.filter((r) => !shownRef.current.has(r.id)).reverse();
        fresh.forEach((r) => {
          shownRef.current.add(r.id);
          // 뮤트/차단한 사용자의 알림은 배너도 띄우지 않는다(알림 화면 필터와 동일 규칙)
          if (r.actorHandle && (muted(r.actorHandle) || blocked({ handle: r.actorHandle }))) return;
          const m = TYPE_MAP[r.type];
          if (!m) return;
          const name = r.actorHandle || tr('friends.travelerDefault');
          // 대상 게시물 — 내 기록은 remoteId(서버 id)로, 이웃 글은 피드 캐시에서
          const post = r.postId
            ? recs.find((x) => x.remoteId === r.postId || x.id === r.postId) ?? feed.find((x) => x.id === r.postId)
            : undefined;
          const visual: ToastVisual = {
            photo: r.actorPhoto || undefined,
            icon: m.icon,
            thumb: post?.representativePhoto || post?.medias?.[0] || post?.cutPhoto?.previewUri,
          };
          push(tr(m.key, { name }), () => {
            const nav = navigationRef.current;
            if (!nav?.isReady()) return;
            // 게시물이 로컬에 있으면 상세로, 없으면 알림 목록으로 (엉뚱한 화면 대신)
            if (m.toPost && post) nav.navigate('PostDetail', { postId: post.id });
            else nav.navigate('Notifications');
          }, visual);
        });
      });
    });

    return () => { alive = false; unsub?.(); };
  }, [entered]);

  return null;
}
