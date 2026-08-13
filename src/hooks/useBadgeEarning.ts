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
  const { badgeEarnedAt, markBadgesEarned, loginStreak, installedAt, homeCountryCode } = useSettings();

  // 거주국 코드 → 한글 이름 변환 (방문국 집계 제외용)
  const homeCountryName = useMemo(
    () => COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? undefined,
    [homeCountryCode]
  );

  // 데이터 자동 판정 (외부 옵션: 메이트·접속·설치 등)
  // 보관(archived) 기록도 포함 — 보관해도 배지 진행 유지.
  // 생일(birthday)은 App Store 5.1.1(v) 대응으로 더는 수집하지 않는다. 그 결과 영구
  // 획득 불가가 된 배지 13(생일 여행)은 카탈로그·판정 로직에서 완전히 제거했다(2026-08-13,
  // 운영 기보유자 0명 확인). 이미 badgeEarnedAt을 가진 사용자가 있었더라도 카탈로그에
  // 정의가 없으면 화면에서 자연히 안 그려질 뿐 크래시하지 않는다(BADGES.find로 조회).
  const dataEarnedBadgeIds = useMemo(
    () => computeEarnedBadgeIds(records, badges, {
      homeCountryName,
      alreadyEarnedIds: Object.keys(badgeEarnedAt).map(Number),
      neighborCount: neighbors.length,
      loginStreak,
      daysSinceInstall: installedAt ? Math.floor((Date.now() - installedAt) / 86400000) : 0,
      installedAt,
    }),
    [records, badges, homeCountryName, badgeEarnedAt, neighbors, loginStreak, installedAt]
  );

  // 새로 획득한 배지는 영구 기록(획득 시점 저장). 인증 전(enabled=false)이면 건너뛴다.
  useEffect(() => {
    if (!enabled) return;
    markBadgesEarned([...dataEarnedBadgeIds]);
  }, [enabled, dataEarnedBadgeIds, markBadgesEarned]);
}
