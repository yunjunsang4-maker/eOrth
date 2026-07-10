/**
 * AppRefreshControl — 스킨 강조색 당겨서 새로고침 (전 화면 공용)
 *
 * RN 0.81 Fabric(iOS) 버그 회피: RefreshControl의 tintColor가 '첫 마운트'에는 적용되지
 * 않아 다크 배경에서 기본(어두운) 스피너가 보이지 않는다(facebook/react-native#56343 —
 * updateProps가 초기 마운트에 oldProps 비교를 잘못해 스킵). 마운트 직후 tint 값을 한 번
 * 바꿔 업데이트 경로를 태우면 색이 정상 적용된다.
 */
import React, { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useSkinAccent } from '../constants/skinTheme';

export default function AppRefreshControl({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const skinAccent = useSkinAccent();
  // 첫 프레임은 흰색 → 다음 틱에 스킨색으로 갱신(버그 회피용 강제 prop 업데이트).
  // 흰색은 갱신이 실패해도 다크 배경에서 보이는 안전값이다.
  const [tint, setTint] = useState('#FFFFFF');
  useEffect(() => {
    const t = setTimeout(() => setTint(skinAccent.accent), 50);
    return () => clearTimeout(t);
  }, [skinAccent.accent]);
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tint}
      colors={[skinAccent.accent]}
      progressBackgroundColor="#1F1F22"
    />
  );
}
