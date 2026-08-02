import { useMemo, useEffect } from 'react';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { computeEarnedBadgeIds, BadgeCatalogEntry } from '../utils/badgeRules';
import { COUNTRIES } from '../constants/countries';

// 배지 자동 판정 + 영구 저장(+신규 획득 토스트 트리거)을 전역에서 처리하는 평가 전용 훅.
// 표시(earnedBadgeIds·통계)는 ProfileScreen이 자체 계산하므로 이 훅은 '평가'만 한다.
// enabled=false(인증 전 등)면 판정·저장을 하지 않는다.
export function useBadgeEarning(badges: BadgeCatalogEntry[], enabled: boolean = true): void {
  const { records, neighbors } = useRecords();
  const { birthday, badgeEarnedAt, markBadgesEarned, loginStreak, installedAt, homeCountryCode } = useSettings();

  // 거주국 코드 → 한글 이름 변환 (방문국 집계 제외용)
  const homeCountryName = useMemo(
    () => COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? undefined,
    [homeCountryCode]
  );

  // 데이터 자동 판정 (외부 옵션: 생일·메이트·접속·설치 등)
  // 보관(archived) 기록도 포함 — 보관해도 배지 진행 유지.
  const dataEarnedBadgeIds = useMemo(
    () => computeEarnedBadgeIds(records, badges, {
      birthday,
      homeCountryName,
      alreadyEarnedIds: Object.keys(badgeEarnedAt).map(Number),
      neighborCount: neighbors.length,
      loginStreak,
      daysSinceInstall: installedAt ? Math.floor((Date.now() - installedAt) / 86400000) : 0,
      installedAt,
    }),
    [records, badges, birthday, homeCountryName, badgeEarnedAt, neighbors, loginStreak, installedAt]
  );

  // 새로 획득한 배지는 영구 기록(획득 시점 저장). 인증 전(enabled=false)이면 건너뛴다.
  useEffect(() => {
    if (!enabled) return;
    markBadgesEarned([...dataEarnedBadgeIds]);
  }, [enabled, dataEarnedBadgeIds, markBadgesEarned]);
}
