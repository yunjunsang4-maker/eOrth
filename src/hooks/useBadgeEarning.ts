import { useMemo, useEffect } from 'react';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { computeEarnedBadgeIds, BadgeCatalogEntry } from '../utils/badgeRules';

// 배지 자동 판정 + 영구 저장(+신규 획득 토스트 트리거)을 전역에서 처리하는 평가 전용 훅.
// 표시(earnedBadgeIds·통계)는 ProfileScreen이 자체 계산하므로 이 훅은 '평가'만 한다.
// enabled=false(인증 전 등)면 판정·저장을 하지 않는다.
export function useBadgeEarning(badges: BadgeCatalogEntry[], enabled: boolean = true): void {
  const { records, commentsByPost, neighbors } = useRecords();
  const { handle, birthday, badgeEarnedAt, markBadgesEarned, shareSentCount, loginStreak, installedAt } = useSettings();

  // 내가 작성한 댓글 수 (대댓글 포함) — 75 댓글 요정용
  const myCommentCount = useMemo(() => {
    const me = handle || '나';
    let n = 0;
    for (const list of Object.values(commentsByPost)) {
      for (const c of list) {
        if (c.name === me) n += 1;
        if (c.replies) for (const rep of c.replies) if (rep.name === me) n += 1;
      }
    }
    return n;
  }, [commentsByPost, handle]);

  // 데이터 자동 판정 (외부 옵션: 생일·이웃·댓글·공유·접속·설치 등)
  // 보관(archived) 기록도 포함 — 보관해도 배지 진행 유지.
  const dataEarnedBadgeIds = useMemo(
    () => computeEarnedBadgeIds(records, badges, {
      birthday,
      alreadyEarnedIds: Object.keys(badgeEarnedAt).map(Number),
      commentsWritten: myCommentCount,
      neighborCount: neighbors.length,
      sharesSent: shareSentCount,
      loginStreak,
      daysSinceInstall: installedAt ? Math.floor((Date.now() - installedAt) / 86400000) : 0,
      installedAt,
    }),
    [records, badges, birthday, badgeEarnedAt, myCommentCount, neighbors, shareSentCount, loginStreak, installedAt]
  );

  // 새로 획득한 배지는 영구 기록(획득 시점 저장). 인증 전(enabled=false)이면 건너뛴다.
  useEffect(() => {
    if (!enabled) return;
    markBadgesEarned([...dataEarnedBadgeIds]);
  }, [enabled, dataEarnedBadgeIds, markBadgesEarned]);
}
