import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Platform,
  View,
  AccessibilityInfo,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * 리퀴드 글래스 표면 (iOS 26) — 플랫폼별 폴백.
 *  1) iOS 26 + API 가용        → expo-glass-effect <GlassView> (네이티브 backdrop blur + tintColor)
 *  2) 구형 iOS                 → <BlurView> + 보라 틴트 (+ edgeHighlight면 유리 장식층)
 *  3) Android + androidBlur    → <BlurView experimentalBlurMethod> 실제 블러 + 틴트 (탭 바 등 소면적 전용)
 *  4) Android (기본)           → '매트' 고불투명 보라 View — 반투명(0.3)이었을 땐 블러 없이
 *     뒤 콘텐츠가 선명하게 뚫고 비쳐 iOS와 완전히 다르게(깨진 것처럼) 보였다.
 *  + "투명도 줄이기"(Reduce Transparency) 켜지면 반투명 단색으로 폴백.
 *
 * ⚠️ opacity<1 을 주지 말 것(유리가 안 보임). 보라색은 tintColor 로만 표현.
 * ⚠️ androidBlur 는 소면적(탭 바·버튼)에만 — dimezisBlurView 는 실험 기능이라
 *    대면적/스크롤 위에서는 성능 저하 가능(대면적은 기본 매트 폴백 사용).
 * 배경 재질 전용이라 보통 자식 없이 absoluteFill 로 깔고, 그 위에 콘텐츠를 형제로 올린다.
 */

// ── 폴백 유리 장식 상수 ────────────────────────────────────────────────────
// 참고: liquid-glass-react(rdev) / AndroidLiquidGlass(Kyant0) 의 시각 언어를 차용했다.
//  · liquid-glass-react — 얇은 상단 specular, 테두리 안쪽 굴절 림(edge refraction rim),
//    둥근 모서리.
//  · AndroidLiquidGlass(backdrop) — 상단-좌측에서 오는 하이라이트, 하단-우측 어두운
//    inner shadow, 유리 두께감을 주는 이중 테두리.
// 두 구현 모두 셰이더로 굴절을 계산하지만 RN에는 셰이더가 없으므로, 여기서는
// 그라데이션 + 테두리를 겹쳐 "두께가 있는 판유리"만 근사한다.
// (채도 상승·색수차는 픽셀 셰이더 없이는 불가능 — 흉내 내지 않는다.)

/** 유리 두께 그라데이션: 위쪽 흰색 알파 → 아래는 0(원 틴트 그대로) */
const THICKNESS_TOP_A = 0.07;
/** 굴절 림 — 안쪽 밴드(더 밝다). 테두리에서 3px 들어간 자리에 3px 폭 */
const RIM_INNER_INSET = 3;
const RIM_INNER_W = 3;
const RIM_INNER_A = 0.1;
/** 굴절 림 — 바깥 밴드(바깥으로 갈수록 옅어진다 = 페이드 근사). 1px 들어간 자리에 2px 폭 */
const RIM_OUTER_INSET = 1;
const RIM_OUTER_W = 2;
const RIM_OUTER_A = 0.05;
/** specular / 하단 그림자 링의 실제 보이는 두께(px) — 테두리 바로 안쪽 1px */
const EDGE_W = 1;
/** specular 상단 엣지 — 좌상단이 가장 밝고 우하단으로 0 */
const SPECULAR_A = 0.4;
const SPECULAR_MID_A = 0.1;
/** 하단 림 그림자 — 우하단이 가장 어둡고 좌상단으로 0 */
const RIM_SHADOW_A = 0.18;
const RIM_SHADOW_MID_A = 0.04;

interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  /** 네이티브 GlassView tintColor (8자리 hex 권장, 예: #751AAD4D) */
  tintColor?: string;
  /** 구형 iOS·Android 블러 경로의 BlurView 위 보라 틴트 */
  fallbackTint?: string;
  /** Android 매트 폴백(블러 미사용 시) 배경색 — 뒤가 비치지 않게 고불투명 권장 */
  androidTint?: string;
  /** Android에서 실제 블러 사용 (소면적 전용 — 탭 바·버튼) */
  androidBlur?: boolean;
  /**
   * 폴백 경로의 유리 장식층 전체 스위치 — 두께 그라데이션·굴절 림·specular·하단 그림자.
   * false면 장식층을 **하나도** 렌더하지 않고 onLayout 측정도 붙이지 않는다
   * (= 블러/매트 + 틴트만. 이 컴포넌트에 장식이 없던 시절과 같은 렌더 트리).
   */
  edgeHighlight?: boolean;
  children?: React.ReactNode;
}

function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((r) => mounted && setReduce(!!r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * 폴백 경로의 유리 장식층 (아래 → 위)
 *   두께 그라데이션 → 하단 림 그림자 → 상단 specular → 굴절 림 2밴드
 *
 * ── 왜 이렇게 나눠 그리는가 ──
 * ⓐ 그라데이션이 꼭 필요한 층(두께·specular·하단 그림자)만 **Svg 하나**에 모은다.
 *    Svg 래퍼 건수는 `scripts/layout-parity.verify.mjs` 규칙 12가 이 파일에 1건으로
 *    못 박아 두었다 — 층마다 Svg를 따로 두면 그 규칙이 깨진다.
 * ⓑ 굴절 림은 단색이라 그라데이션이 필요 없다 → RN `View`의 borderWidth/borderRadius로
 *    그린다. RN 테두리는 뷰 경계에서 **안쪽으로** 그려지므로 치수를 몰라도 정확하다.
 *
 * ── 안드로이드 `%` 함정 ──
 * RNSVG는 `width="100%"` 를 레이아웃이 바뀐 뒤 갱신하지 않는다(CustomTabBar 실측 —
 * 바가 323dp→348dp 로 늘어도 323dp 짜리 윤곽이 하나 더 겹쳐 보였다). 그래서
 * **안드로이드에서만** onLayout 실측 숫자를 쓰고, iOS는 `%` 그대로 둔다.
 * iOS를 `%`로 두는 이유는 성능이다 — 탭 바는 탭 전환 때 컨테이너 width 를 323↔348dp 로
 * 애니메이션하는데, onLayout 을 붙이면 그 프레임마다 setState → 장식층 재생성이 돈다.
 * `%`는 네이티브가 알아서 늘어나므로 JS 재렌더가 0회다.
 *
 * ── 1px 링을 2px 스트로크로 그리는 이유 ──
 * 스트로크는 경로 **중심**에 그려진다. 링 경로를 컨테이너 경계에 정확히 두고 폭을 2배로
 * 주면, 바깥 절반은 컨테이너의 `overflow:'hidden'`(+borderRadius) 에 잘려 나가고 안쪽
 * 절반만 남아 정확히 EDGE_W 만큼의 안쪽 밴드가 된다. 치수를 몰라도 되므로 `%` 경로에서도
 * 성립한다(스트로크를 안쪽으로 밀려면 `width - 2*inset` 이 필요해 실측이 강제된다).
 *
 * ⚠️ 새 아키텍처의 RNSVG는 Svg에 직접 준 pointerEvents를 무시한다 —
 *    View(pointerEvents="none") 래퍼가 있어야 유리 위 버튼·스크롤 터치를 삼키지 않는다.
 */
function GlassDecor({
  width,
  height,
  radius,
  gid,
}: {
  width: number;
  height: number;
  radius: number;
  gid: string;
}) {
  const android = Platform.OS === 'android';
  // 안드로이드는 실측 전(0×0)이면 Svg를 아예 마운트하지 않는다. iOS는 측정이 없다.
  const svgW: number | string = android ? width : '100%';
  const svgH: number | string = android ? height : '100%';
  const drawSvg = !android || (width > 0 && height > 0);

  return (
    <>
      {drawSvg && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={svgW} height={svgH}>
            <Defs>
              {/* 두께: 위 → 아래 수직 */}
              <SvgLinearGradient id={`${gid}th`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={THICKNESS_TOP_A} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgLinearGradient>
              {/* specular: 좌상단 최대 → 우하단 0 */}
              <SvgLinearGradient id={`${gid}sp`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={SPECULAR_A} />
                <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={SPECULAR_MID_A} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgLinearGradient>
              {/* 하단 림 그림자: 우하단 최대 → 좌상단 0 (inner shadow 근사) */}
              <SvgLinearGradient id={`${gid}sh`} x1="1" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity={RIM_SHADOW_A} />
                <Stop offset="0.5" stopColor="#000000" stopOpacity={RIM_SHADOW_MID_A} />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>

            <Rect
              x={0}
              y={0}
              width={svgW}
              height={svgH}
              rx={radius}
              ry={radius}
              fill={`url(#${gid}th)`}
            />
            {/* 하단 그림자와 상단 specular 는 같은 링을 쓴다 — 그라데이션이 서로 반대라
                겹쳐도 위쪽은 밝게, 아래쪽은 어둡게만 남는다(유리 두께의 위·아래 면). */}
            <Rect
              x={0}
              y={0}
              width={svgW}
              height={svgH}
              rx={radius}
              ry={radius}
              fill="none"
              stroke={`url(#${gid}sh)`}
              strokeWidth={EDGE_W * 2}
            />
            <Rect
              x={0}
              y={0}
              width={svgW}
              height={svgH}
              rx={radius}
              ry={radius}
              fill="none"
              stroke={`url(#${gid}sp)`}
              strokeWidth={EDGE_W * 2}
            />
          </Svg>
        </View>
      )}

      {/* 굴절 림 — 단색이라 RN 테두리로 충분하다. 레이아웃이 알아서 늘어나므로 실측 불필요.
          안쪽 밴드가 더 밝고 바깥 밴드가 옅다 = "바깥쪽으로 페이드"의 2단 근사. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: RIM_INNER_INSET,
          left: RIM_INNER_INSET,
          right: RIM_INNER_INSET,
          bottom: RIM_INNER_INSET,
          borderRadius: Math.max(0, radius - RIM_INNER_INSET),
          borderWidth: RIM_INNER_W,
          borderColor: `rgba(255,255,255,${RIM_INNER_A})`,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: RIM_OUTER_INSET,
          left: RIM_OUTER_INSET,
          right: RIM_OUTER_INSET,
          bottom: RIM_OUTER_INSET,
          borderRadius: Math.max(0, radius - RIM_OUTER_INSET),
          borderWidth: RIM_OUTER_W,
          borderColor: `rgba(255,255,255,${RIM_OUTER_A})`,
        }}
      />
    </>
  );
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  style,
  borderRadius = 0,
  tintColor = '#751AAD4D',
  fallbackTint = 'rgba(117,26,173,0.18)',
  androidTint = 'rgba(40,18,60,0.92)',
  androidBlur = false,
  edgeHighlight = false,
  children,
}) => {
  const reduce = useReduceTransparency();
  // useId 는 ":r0:" 같은 값이라 그 자체로 충돌하지 않는다. 장식층이 그라데이션 3개를
  // 쓰므로 뒤에 짧은 접미사를 붙여 한 표면 안에서도 구분한다.
  const gid = useId();
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // 같은 값으로 setState 하면 렌더 루프가 돈다 — 소수점 흔들림은 무시.
    setSize((p) =>
      Math.abs(p.w - width) < 0.5 && Math.abs(p.h - height) < 0.5 ? p : { w: width, h: height },
    );
  }, []);

  // 접근성: 투명도 줄이기 → 고불투명 단색(블러/유리 없음).
  // ⚠️ 표면 고유 매트색(androidTint)을 써야 한다. 예전엔 보라를 하드코딩해서, 탭 바처럼
  //    어두운 틴트를 넘긴 표면도 이 설정을 켠 기기에서만 통째로 보라색으로 보였다
  //    (2026-09 행사 iOS 사용자 "탭 바가 그냥 보라색" 신고 — iOS 26 리퀴드 글래스를 끄려고
  //    투명도 줄이기를 켠 사용자가 늘었다). androidTint는 원래 "블러 없이 뒤가 안 비치는 색"이라
  //    이 폴백의 요구와 정확히 같다.
  if (reduce) {
    return (
      <View style={[style, { borderRadius, overflow: 'hidden', backgroundColor: androidTint }]}>
        {children}
      </View>
    );
  }

  // 1) iOS 26 네이티브 리퀴드 글래스
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tintColor}
        style={[style, { borderRadius }]}
      >
        {children}
      </GlassView>
    );
  }

  // 2) 구형 iOS: 블러 + 보라 틴트 / 3) Android+androidBlur: 실제 블러 / 4) Android: 매트 보라
  const blurred = Platform.OS === 'ios' || (Platform.OS === 'android' && androidBlur);
  // 측정은 "안드로이드 + 장식 켜짐"에서만 필요하다. iOS는 `%`로 그려 재렌더가 0회고,
  // edgeHighlight=false 면 장식 자체가 없으니 onLayout 을 붙이지 않는다.
  const measure = edgeHighlight && Platform.OS === 'android';
  return (
    <View
      style={[style, { borderRadius, overflow: 'hidden' }]}
      onLayout={measure ? onLayout : undefined}
    >
      {blurred && (
        <BlurView
          intensity={40}
          tint="dark"
          // Android BlurView는 이 옵션 없이는 아무것도 그리지 않는다(no-op)
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: blurred ? fallbackTint : androidTint },
        ]}
      />
      {/* 유리 장식 — edgeHighlight 가 꺼져 있으면 통째로 없다(호출처 계약 유지).
          콘텐츠(children)보다는 아래에 둔다. */}
      {edgeHighlight && (
        <GlassDecor width={size.w} height={size.h} radius={borderRadius} gid={gid} />
      )}
      {children}
    </View>
  );
};
