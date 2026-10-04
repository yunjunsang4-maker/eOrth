// 피드 AdMob 광고 보관소(hooks/useFeedAdSource.ts)의 수명 규칙 — 만료·재요청 쿨다운·안전한 destroy.
// RN·광고 SDK 의존이 없는 순수 로직이라 feedAdLifetime.verify.ts가 node에서 돈다.

/**
 * 네이티브 광고 만료 — 받은 지 1시간.
 * Google AdMob 네이티브 광고 문서(developers.google.com/admob/android/native):
 * "Because ads expire after an hour, you should clear this cache and reload with new ads every hour."
 * 판정은 '새로 마운트되는 셀'에서만 한다(이미 그리고 있는 셀은 언마운트까지 그대로).
 */
export const AD_TTL_MS = 60 * 60 * 1000;

/**
 * 실패(미필·오프라인) 뒤 같은 슬롯 재요청까지 최소 간격.
 * 30초인 이유: 가상화된 피드는 위아래로 오갈 때 같은 광고 칸이 몇 초 간격으로 다시 마운트된다 — 그때마다
 * 재요청하면 미필 지역에서 요청 수만 늘어 match rate가 깎인다(QA R2). 한 번의 스크롤 왕복은 막고, 오프라인에서
 * 돌아온 뒤에는 반 분 안에 다시 시도하는 정도로 잡았다. Google 공식 수치는 아니다 — 필률 지표를 보고 조정할 값.
 */
export const AD_RETRY_COOLDOWN_MS = 30 * 1000;

/** 받은 시각 loadedAt의 광고가 now에 만료됐는가. 시계가 뒤로 간 경우(now < loadedAt)는 만료 아님 */
export const isAdExpired = (loadedAt: number, now: number): boolean => now - loadedAt >= AD_TTL_MS;

/** 마지막 실패 시각 failedAt 기준으로 아직 재요청을 쉬어야 하는가. 실패 기록이 없으면 false */
export const inAdRetryCooldown = (failedAt: number | undefined, now: number): boolean =>
  failedAt !== undefined && now - failedAt >= 0 && now - failedAt < AD_RETRY_COOLDOWN_MS;

/**
 * 보관소에서 빠진(만료로 교체된) 광고를 '아무 셀도 그리지 않을 때' destroy한다.
 *
 * 왜 즉시 destroy하지 않는가: react-native-google-mobile-ads 16.3.4의 NativeAd.destroy()는 네이티브
 * adHolders에서 그 광고를 지우고 SDK NativeAd.destroy()를 부른다(ReactNativeGoogleMobileAdsNativeModule.kt
 * destroy). 아직 마운트된 NativeAdView가 그 광고를 그리는 중이면 해제된 광고를 그리게 된다. Google은 반대로
 * "destroy() must be called on all ads"라 보관소에서 뺀 광고를 그냥 버리면 누수다.
 * 그래서 셀이 광고를 그리는 동안 retain, 그만 그리면 release 하고, retire된 광고는 마지막 release에서 destroy.
 */
export function createAdRetirement<T>(destroy: (ad: T) => void) {
  const mounts = new Map<T, number>();
  const retired = new Set<T>();
  return {
    /** 셀이 이 광고를 그리기 시작했다 */
    retain(ad: T) {
      mounts.set(ad, (mounts.get(ad) ?? 0) + 1);
    },
    /** 셀이 이 광고를 그만 그린다(언마운트·다른 광고로 교체). retire된 광고면 마지막 셀에서 destroy */
    release(ad: T) {
      const n = (mounts.get(ad) ?? 0) - 1;
      if (n > 0) { mounts.set(ad, n); return; }
      mounts.delete(ad);
      if (retired.delete(ad)) destroy(ad);
    },
    /** 보관소에서 뺐다 — 그리는 셀이 없으면 바로, 있으면 마지막 release에서 destroy */
    retire(ad: T) {
      if (mounts.has(ad)) retired.add(ad);
      else destroy(ad);
    },
  };
}
