import React, { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import { timeAgo } from '../utils/timeAgo';
import { createMinuteTick } from '../store/minuteTick';

// 앱 전체가 공유하는 분 단위 시계 1개 — 시간 텍스트가 몇 개든 타이머·AppState 리스너는 1개다
// (첫 구독에 켜지고 마지막 해제에 꺼진다 — store/minuteTick.ts).
const minuteTick = createMinuteTick({
  now: Date.now,
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onForeground: (cb) => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') cb(); });
    return () => sub.remove();
  },
});

interface Props extends Omit<TextProps, 'children'> {
  /** 기준 시각(ms) — utils/timeAgo의 첫 인자 그대로 */
  ts: number;
}

/**
 * 상대 시간("방금 전"·"n분 전"…) 텍스트 — 분이 바뀔 때마다 자기만 다시 그린다.
 *
 * 예전엔 카드 렌더 시점에 timeAgo()를 한 번 계산하고 타이머가 없어, 스토어 슬라이스 분리 뒤엔
 * 새로고침·포커스 재조회 전까지 "방금 전"이 몇 분째 그대로였다(03_session_audit.md F2).
 * 이 컴포넌트는 공용 분 시계를 구독해 부모와 무관하게 분당 1번 다시 그린다 — 피드에 카드가 많아도
 * 다시 그려지는 건 시간 텍스트뿐이다.
 *
 * 'use no memo' 이유: timeAgo()는 전역 i18n과 Date.now()를 읽는다. 컴파일되면 인자(ts)에만 메모돼
 * 분 시계·언어가 바뀌어 다시 렌더돼도 옛 문구를 재사용한다(SocialScreen CutMeta에 있던 지시어를 여기로
 * 옮겼다). 본문이 Text 하나라 메모로 얻을 것도 없다.
 * useTranslation()은 언어 변경 때 다시 렌더되게 하는 구독이다 — timeAgo가 쓰는 전역 i18n과 같은 인스턴스라
 * 다시 그리면 새 언어 문구가 나온다(timeAgo 시그니처·문구는 utils/timeAgo.ts 그대로).
 */
export default function TimeAgoText({ ts, ...rest }: Props) {
  'use no memo';
  useTranslation();
  useSyncExternalStore(minuteTick.subscribe, minuteTick.getSnapshot, minuteTick.getSnapshot);
  return <Text {...rest}>{timeAgo(ts)}</Text>;
}
