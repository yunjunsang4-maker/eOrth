/**
 * AppRefreshControl — 스킨 강조색 당겨서 새로고침 (전 화면 공용)
 *
 * RN 0.81 Fabric(iOS) 버그 회피: RefreshControl의 tintColor가 '첫 마운트'에는 적용되지
 * 않아 다크 배경에서 기본(어두운) 스피너가 보이지 않는다(facebook/react-native#56343 —
 * updateProps가 초기 마운트에 oldProps 비교를 잘못해 스킵). 마운트 직후 tint 값을 한 번
 * 바꿔 업데이트 경로를 태우면 색이 정상 적용된다.
 *
 * ⚠️ children·style 전달은 장식이 아니라 안드로이드 생존 조건이다.
 * RN ScrollView는 안드로이드에서 refreshControl 엘리먼트를
 * `cloneElement(refreshControl, { style }, 스크롤뷰 본체)` 로 감싼다 — 즉 화면 본문
 * 전체가 이 컴포넌트의 children으로 들어온다. children을 렌더하지 않으면 그 화면의
 * 스크롤 내용이 통째로 사라진다(2026-08-11 소셜·프로필 탭 전멸 원인 — S21+ 실기기와
 * 에뮬레이터에서 동일 재현, refreshControl 제거로 격리 확인). iOS는 이 래핑을 쓰지
 * 않아 증상이 없었다. 커스텀 refreshControl 래퍼는 반드시 children·style을 통과시킬 것.
 */
import React, { useEffect, useState } from 'react';
import { RefreshControl, StyleProp, ViewStyle } from 'react-native';
import { useSkinAccent } from '../constants/skinTheme';

export default function AppRefreshControl({
  refreshing,
  onRefresh,
  progressViewOffset,
  children,
  style,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  // 스크롤이 화면 최상단(노치 뒤)까지 차지하는 화면은 안전영역만큼 내려줘야 스피너가 보인다
  progressViewOffset?: number;
  // 안드로이드에서 ScrollView가 cloneElement로 주입한다(위 주석 참고) — 직접 넘길 일은 없다
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
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
      progressViewOffset={progressViewOffset}
      style={style}
    >
      {children}
    </RefreshControl>
  );
}
