/**
 * 기본 아바타(프로필 사진 없음) — 앱 전역 공용.
 * 시안(2026-10 남의 프로필) 측정값: 110 원 기준 채움 #121316 + 회색 그라데이션 림,
 * 가운데 사람 실루엣 #89898B(폭 = 지름 × 0.29, 뷰박스 32×37).
 *
 * 림은 ProfileVisuals `pvAvatarInnerGrad`(검정0→흰색, 오른쪽 아래)와 같은 계열 —
 * 왼쪽 위(#323337 은은) → 대각 중간(투명, 오른쪽 위·왼쪽 아래 30~60°/210~240°가 거의 안 보임)
 * → 오른쪽 아래(#6F6F72 가장 밝음)로 가는 대각 선형 그라데이션.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';

// SVG 그라데이션 id 충돌 방지 — 한 화면에 아바타가 여러 개 뜨므로 인스턴스별 고유 id
// (ProfileVisuals pvBadgeRingSeq와 같은 방식. useId는 ':'가 섞여 url(#…) 참조가 깨질 수 있어 쓰지 않는다)
let defaultAvatarSeq = 0;

// 실루엣 원본 뷰박스(32×37): 머리 원 + 위쪽 반타원 몸통(바닥 평평), 사이 약 4pt 틈
const SIL_W = 32;
const SIL_H = 37;

export default function DefaultAvatar({ size }: { size: number }) {
  const gradId = React.useMemo(() => 'defaultAvatarRim' + (defaultAvatarSeq++), []);
  // 림 두께 — 시안 110에서 1pt. 작은 아바타(리스트·댓글)는 0.5로 줄여 테두리가 굵어 보이지 않게
  const stroke = size >= 60 ? 1 : 0.5;
  const r = size / 2;
  const silW = size * 0.29;
  const silH = silW * (SIL_H / SIL_W);
  return (
    // 새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다
    // (아바타가 TouchableOpacity·Pressable 안에 들어가는 곳이 대부분이다)
    <View pointerEvents="none" style={{ width: size, height: size, borderRadius: r }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#323337" />
            <Stop offset="0.5" stopColor="#323337" stopOpacity="0" />
            <Stop offset="0.85" stopColor="#6F6F72" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r - stroke / 2} fill="#121316" stroke={`url(#${gradId})`} strokeWidth={stroke} />
        <G transform={`translate(${(size - silW) / 2} ${(size - silH) / 2}) scale(${silW / SIL_W})`} fill="#89898B">
          <Circle cx="16" cy="9.5" r="9.25" />
          <Path d="M0 33 A16 10 0 0 1 32 33 V37 H0 Z" />
        </G>
      </Svg>
    </View>
  );
}
