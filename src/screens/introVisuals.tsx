import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Path as SvgPath,
  Circle as SvgCircle,
  Line as SvgLine,
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop as SvgStop,
} from 'react-native-svg';
import { EorthLogo } from '../components/EorthLogo';
import { PersonIcon } from '../components/icons';
import {
  INTRO_ARC_1,
  INTRO_ARC_2,
  INTRO_ARC_3,
  INTRO_CONTINENTS_A,
  INTRO_CONTINENTS_B,
  INTRO_WIREFRAME,
  INTRO4_ARC_1,
  INTRO4_ARC_2,
  INTRO5_CONTINENTS_A,
  INTRO5_CONTINENTS_B,
  INTRO5_GLOBE_RING,
  INTRO5_ARC_OUTER,
  INTRO5_ARC_INNER,
  INTRO5_GRID_LINES,
} from '../data/introGlobePaths';

const { width: SW } = Dimensions.get('window');
export const DS = SW / 402; // 시안(402×874) 배율

// 온보딩 시안 공통 앰비언트 — 파란 대기광 + 하단 좌우 보라 글로우(시안 블러 타원 근사)
export function IntroAmbient() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 402 874" preserveAspectRatio="xMidYMid slice">
        <SvgDefs>
          <SvgRadialGradient id="ambBlue1" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#0000FF" stopOpacity={0.15} />
            <SvgStop offset="1" stopColor="#0000FF" stopOpacity={0} />
          </SvgRadialGradient>
          <SvgRadialGradient id="ambBlue2" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#0000FF" stopOpacity={0.05} />
            <SvgStop offset="1" stopColor="#0000FF" stopOpacity={0} />
          </SvgRadialGradient>
          <SvgRadialGradient id="ambPurR" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#CA82FF" stopOpacity={0.2} />
            <SvgStop offset="1" stopColor="#CA82FF" stopOpacity={0} />
          </SvgRadialGradient>
          <SvgRadialGradient id="ambPurL" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#CA82FF" stopOpacity={0.1} />
            <SvgStop offset="1" stopColor="#CA82FF" stopOpacity={0} />
          </SvgRadialGradient>
        </SvgDefs>
        <SvgCircle cx={554.8} cy={-398.4} r={450} fill="url(#ambBlue1)" />
        <SvgCircle cx={273} cy={373.7} r={450} fill="url(#ambBlue2)" />
        <SvgCircle cx={378.6} cy={642.3} r={110} fill="url(#ambPurR)" />
        <SvgCircle cx={5.7} cy={657.1} r={110} fill="url(#ambPurL)" />
      </Svg>
    </View>
  );
}

// 좌상단 보라 글로우 + 좌우 흰 스팟 — 2·3·5페이지 공통 장식 (시안 블러 근사)
function SideGlows({ purpleCx = 6.5, purpleCy = 247 }: { purpleCx?: number; purpleCy?: number }) {
  return (
    <>
      <SvgDefs>
        <SvgRadialGradient id="sgPurple" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0" stopColor="#CA82FF" stopOpacity={0.2} />
          <SvgStop offset="1" stopColor="#CA82FF" stopOpacity={0} />
        </SvgRadialGradient>
        <SvgRadialGradient id="sgWhiteL" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
          <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgRadialGradient>
        <SvgRadialGradient id="sgWhiteR" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0.1} />
          <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgRadialGradient>
      </SvgDefs>
      <SvgCircle cx={purpleCx} cy={purpleCy} r={140} fill="url(#sgPurple)" />
      <SvgCircle cx={-4.3} cy={259.7} r={42} fill="url(#sgWhiteL)" />
      <SvgCircle cx={319} cy={255.8} r={42} fill="url(#sgWhiteR)" />
    </>
  );
}

// ── 1페이지: 궤도 호 + 링 노드 + 지구본(대륙 도트) + eorth 워드마크 (시안 64) ──
export function IntroVisual1() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SvgDefs>
          <SvgLinearGradient id="introArc1" x1="201.5" y1="282.18" x2="200.93" y2="372.88" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FFFFFF" />
            <SvgStop offset="1" stopColor="#999999" stopOpacity={0} />
          </SvgLinearGradient>
          <SvgLinearGradient id="introArc2" x1="202.5" y1="201" x2="202.5" y2="398.86" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FFFFFF" />
            <SvgStop offset="1" stopColor="#999999" stopOpacity={0} />
          </SvgLinearGradient>
          <SvgLinearGradient id="introArc3" x1="197.5" y1="109" x2="197.5" y2="306.86" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FFFFFF" />
            <SvgStop offset="1" stopColor="#999999" stopOpacity={0} />
          </SvgLinearGradient>
          <SvgLinearGradient id="introRingTop" x1="177.58" y1="144" x2="231.75" y2="182.68" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FF14E4" />
            <SvgStop offset="1" stopColor="#00D8F3" />
          </SvgLinearGradient>
          <SvgLinearGradient id="introRingL" x1="80.03" y1="185" x2="122.24" y2="215.14" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FF14E4" />
            <SvgStop offset="1" stopColor="#00D8F3" />
          </SvgLinearGradient>
          <SvgLinearGradient id="introRingR" x1="286.03" y1="182" x2="328.24" y2="212.14" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FF14E4" />
            <SvgStop offset="1" stopColor="#00D8F3" />
          </SvgLinearGradient>
          <SvgLinearGradient id="introRingLL" x1="28.92" y1="266" x2="61.28" y2="289.11" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FF14E4" />
            <SvgStop offset="1" stopColor="#00D8F3" />
          </SvgLinearGradient>
          <SvgLinearGradient id="introRingRR" x1="341.92" y1="266" x2="374.28" y2="289.11" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#FF14E4" />
            <SvgStop offset="1" stopColor="#00D8F3" />
          </SvgLinearGradient>
          <SvgLinearGradient id="introGlobeRing" x1="179.85" y1="392" x2="246.38" y2="547.08" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#666666" stopOpacity={0} />
            <SvgStop offset="1" stopColor="#C982FF" />
          </SvgLinearGradient>
        </SvgDefs>

        <SvgPath d={INTRO_ARC_3} stroke="url(#introArc3)" strokeWidth={5} strokeOpacity={0.2} fill="none" />
        <SvgPath d={INTRO_ARC_2} stroke="url(#introArc2)" strokeWidth={5} strokeOpacity={0.15} fill="none" />
        <SvgPath d={INTRO_ARC_1} stroke="url(#introArc1)" strokeWidth={6} strokeOpacity={0.3} fill="none" />

        <SvgCircle cx={201} cy={387} r={135} fill="#FFFFFF" fillOpacity={0.03} />
        <SvgPath d={INTRO_CONTINENTS_A} fill="#FFFFFF" fillOpacity={0.08} />
        <SvgPath d={INTRO_CONTINENTS_B} fill="#FFFFFF" fillOpacity={0.08} />
        <SvgCircle cx={199.527} cy={391.527} r={147.402} stroke="url(#introGlobeRing)" strokeWidth={2.25} fill="none" />

        <SvgCircle cx={204.5} cy={182.5} r={37.5} fill="#D9D9D9" fillOpacity={0.03} stroke="url(#introRingTop)" strokeWidth={2} />
        <SvgCircle cx={101} cy={215} r={30} fill="#D9D9D9" fillOpacity={0.03} />
        <SvgCircle cx={101} cy={215} r={30} fill="#000000" fillOpacity={0.2} />
        <SvgCircle cx={101} cy={215} r={29} stroke="url(#introRingL)" strokeWidth={2} strokeOpacity={0.5} fill="none" />
        <SvgCircle cx={307} cy={212} r={30} fill="#D9D9D9" fillOpacity={0.03} />
        <SvgCircle cx={307} cy={212} r={29} stroke="url(#introRingR)" strokeWidth={2} strokeOpacity={0.5} fill="none" />
        <SvgCircle cx={45} cy={289} r={23} fill="#D9D9D9" fillOpacity={0.03} />
        <SvgCircle cx={45} cy={289} r={23} fill="#000000" fillOpacity={0.2} />
        <SvgCircle cx={45} cy={289} r={22.25} stroke="url(#introRingLL)" strokeWidth={1.5} strokeOpacity={0.2} fill="none" />
        <SvgCircle cx={358} cy={289} r={23} fill="#D9D9D9" fillOpacity={0.03} />
        <SvgCircle cx={358} cy={289} r={23} fill="#000000" fillOpacity={0.2} />
        <SvgCircle cx={358} cy={289} r={22.25} stroke="url(#introRingRR)" strokeWidth={1.5} strokeOpacity={0.2} fill="none" />
      </Svg>

      {/* eorth 워드마크 — 지구본 중앙 (시안: 글리프 원 중심 178.6, 405.2) */}
      <View style={{ position: 'absolute', left: 142 * DS, top: 384 * DS }}>
        <EorthLogo width={104 * DS} />
      </View>
    </View>
  );
}

// ── 2페이지: 별하늘 + 보라/흰 글로우만 (시안 65) ──
export function IntroVisual2() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SideGlows purpleCx={6.5} purpleCy={247} />
      </Svg>
    </View>
  );
}

// ── 3페이지: 와이어프레임 구체 (시안 66, 중심 ≈201.8, 389) ──
export function IntroVisual3() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SvgDefs>
          <SvgLinearGradient id="wire1" x1="201.81" y1="260.01" x2="201.81" y2="518.34" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#E0C9FF" />
            <SvgStop offset="1" stopColor="#7C3AED" stopOpacity={0} />
          </SvgLinearGradient>
          <SvgLinearGradient id="wire2" x1="201.81" y1="260.01" x2="201.77" y2="491.89" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#666666" />
            <SvgStop offset="1" stopColor="#000000" />
          </SvgLinearGradient>
        </SvgDefs>
        <SideGlows purpleCx={65.5} purpleCy={225} />
        <SvgCircle cx={200.5} cy={389.5} r={148.5} fill="#FFFFFF" fillOpacity={0.03} />
        <SvgPath d={INTRO_WIREFRAME} fill="url(#wire2)" fillOpacity={0.2} />
        <SvgPath d={INTRO_WIREFRAME} fill="url(#wire1)" fillOpacity={0.2} />
      </Svg>
    </View>
  );
}

// ── 4페이지: 동심 보라 링 + 아바타 노드 + DM 말풍선 (시안 67) ──
// 시안의 아바타 사진은 샘플 이미지라 PersonIcon 플레이스홀더로 대체.
function AvatarNode({ cx, cy, glowR, innerR, ringW, iconSize }: { cx: number; cy: number; glowR: number; innerR: number; ringW: number; iconSize: number }) {
  const size = glowR * 2 * DS;
  return (
    <View style={{ position: 'absolute', left: cx * DS - size / 2, top: cy * DS - size / 2, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <SvgDefs>
          <SvgLinearGradient id="avatarRing" x1="50%" y1="0%" x2="66%" y2="100%">
            <SvgStop offset="0" stopColor="#00D8F3" />
            <SvgStop offset="1" stopColor="#EC34F7" />
          </SvgLinearGradient>
        </SvgDefs>
        <SvgCircle cx={size / 2} cy={size / 2} r={glowR * DS} fill="#E7AFFF" fillOpacity={0.2} />
        <SvgCircle cx={size / 2} cy={size / 2} r={glowR * DS - 0.5} stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={1} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={innerR * DS} fill="#17121F" />
        <SvgCircle cx={size / 2} cy={size / 2} r={innerR * DS} stroke="url(#avatarRing)" strokeWidth={ringW} fill="none" />
      </Svg>
      <View style={{ position: 'absolute' }}>
        <PersonIcon size={iconSize} color="#A0A0B0" />
      </View>
    </View>
  );
}

// DM 말풍선 — 시안 샘플 문구(장식용) 그대로
function ChatBubble({ x, y, w, handle, msg, time, dot }: { x: number; y: number; w: number; handle: string; msg: string; time: string; dot?: boolean }) {
  return (
    <View style={[bubbleStyles.wrap, { left: x * DS, top: y * DS, width: w * DS }]}>
      <View style={bubbleStyles.avatar}>
        <Svg width={26} height={26}>
          <SvgDefs>
            <SvgLinearGradient id="bubbleRing" x1="50%" y1="0%" x2="66%" y2="100%">
              <SvgStop offset="0" stopColor="#00D8F3" />
              <SvgStop offset="1" stopColor="#EC34F7" />
            </SvgLinearGradient>
          </SvgDefs>
          <SvgCircle cx={13} cy={13} r={12} fill="#17121F" stroke="url(#bubbleRing)" strokeWidth={1.3} />
        </Svg>
        <View style={{ position: 'absolute', left: 6, top: 6 }}>
          <PersonIcon size={14} color="#A0A0B0" />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={bubbleStyles.handle} numberOfLines={1}>{handle}</Text>
        <Text style={bubbleStyles.msg} numberOfLines={1}>{msg}</Text>
      </View>
      <View style={bubbleStyles.right}>
        {dot && <View style={bubbleStyles.unreadDot} />}
        <Text style={bubbleStyles.time}>{time}</Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(217,217,217,0.06)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  avatar: { width: 26, height: 26 },
  handle: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  msg: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  right: { alignItems: 'flex-end', gap: 4 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00D8F3' },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 8 },
});

export function IntroVisual4() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SvgDefs>
          {/* 중앙 보라 코어 — 시안 블러 원 근사 */}
          <SvgRadialGradient id="core1" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#9E39B9" stopOpacity={0.48} />
            <SvgStop offset="0.65" stopColor="#9E39B9" stopOpacity={0.35} />
            <SvgStop offset="1" stopColor="#9E39B9" stopOpacity={0} />
          </SvgRadialGradient>
          <SvgRadialGradient id="core2" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0" stopColor="#C321EF" stopOpacity={0.62} />
            <SvgStop offset="0.6" stopColor="#C321EF" stopOpacity={0.5} />
            <SvgStop offset="1" stopColor="#C321EF" stopOpacity={0} />
          </SvgRadialGradient>
        </SvgDefs>
        {/* 동심 링 — 바깥→안 (시안 위치·색 그대로, 블러는 근사) */}
        <SvgCircle cx={201.5} cy={377.5} r={177.5} fill="#E7AFFF" fillOpacity={0.1} />
        <SvgPath d={INTRO4_ARC_1} stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={1} fill="none" />
        <SvgCircle cx={202.5} cy={343.5} r={113.5} fill="#E7AFFF" fillOpacity={0.1} />
        <SvgPath d={INTRO4_ARC_2} stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={1} fill="none" />
        <SvgCircle cx={205.5} cy={322.5} r={76.5} fill="#E7AFFF" fillOpacity={0.1} />
        <SvgCircle cx={205.5} cy={322.5} r={76.18} stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={0.65} fill="none" />
        <SvgCircle cx={205} cy={322} r={62.72} fill="#512072" />
        <SvgCircle cx={205} cy={322} r={62.61} stroke="#D981FF" strokeOpacity={0.1} strokeWidth={0.22} fill="none" />
        <SvgCircle cx={206} cy={311.6} r={52} fill="url(#core1)" />
        <SvgCircle cx={205.9} cy={308.7} r={38} fill="url(#core2)" />
      </Svg>

      {/* 아바타 노드 — 중앙 대형 + 좌우 중형/소형 (시안 좌표) */}
      <AvatarNode cx={197} cy={497} glowR={60} innerR={37} ringW={3.6} iconSize={34} />
      <AvatarNode cx={56} cy={373} glowR={28} innerR={20.5} ringW={2.3} iconSize={20} />
      <AvatarNode cx={348} cy={372} glowR={28} innerR={20.5} ringW={2.3} iconSize={20} />
      <AvatarNode cx={92} cy={450} glowR={34} innerR={24.8} ringW={3} iconSize={24} />
      <AvatarNode cx={314} cy={449} glowR={34} innerR={24.8} ringW={3} iconSize={24} />

      {/* DM 말풍선 — 시안 샘플 */}
      <ChatBubble x={19} y={108} w={206} handle="@wwaveran.kr" msg="청도는 뭐가 아쉬웠어?" time="36초전" />
      <ChatBubble x={68} y={152} w={297} handle="@sangminjang" msg="그때 거기 어디야?" time="36초전" dot />
    </View>
  );
}

// ── 5페이지: 보라 지구본 + 원근 격자 (시안 68, 지구본 중심 ≈204, 313.7) ──
export function IntroVisual5() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SvgDefs>
          {/* 시안 paint2~9 그대로 */}
          <SvgLinearGradient id="g5a" x1="220.73" y1="194.16" x2="110.81" y2="377.15" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#1D0930" />
            <SvgStop offset="1" stopColor="#5B1C96" />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5b" x1="205.14" y1="432.71" x2="175.69" y2="274.57" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#000000" />
            <SvgStop offset="1" stopColor="#666666" stopOpacity={0} />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5c" x1="204.12" y1="327.52" x2="105.04" y2="382.95" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#1D0930" />
            <SvgStop offset="1" stopColor="#7519AE" />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5d" x1="252.13" y1="413.07" x2="176.17" y2="276.8" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#000000" />
            <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity={0.2} />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5e" x1="166.15" y1="191.78" x2="217.65" y2="286.93" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#000000" />
            <SvgStop offset="1" stopColor="#761AAD" />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5ring" x1="182.54" y1="317.82" x2="252.25" y2="479.89" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#666666" stopOpacity={0} />
            <SvgStop offset="1" stopColor="#C982FF" />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5arcO" x1="200" y1="105" x2="200" y2="285" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#824D99" stopOpacity={0} />
            <SvgStop offset="0.48" stopColor="#AC66CA" stopOpacity={0.48} />
            <SvgStop offset="1" stopColor="#E9B5FF" />
          </SvgLinearGradient>
          <SvgLinearGradient id="g5arcI" x1="201.5" y1="211" x2="201.05" y2="355.01" gradientUnits="userSpaceOnUse">
            <SvgStop offset="0" stopColor="#824D99" stopOpacity={0} />
            <SvgStop offset="1" stopColor="#EDC5FF" />
          </SvgLinearGradient>
          <SvgRadialGradient id="g5glow" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0.7" stopColor="#6B21A8" stopOpacity={0.2} />
            <SvgStop offset="1" stopColor="#6B21A8" stopOpacity={0} />
          </SvgRadialGradient>
        </SvgDefs>

        <SideGlows purpleCx={6.5} purpleCy={247} />

        {/* 상단 호 2개 (지구본 뒤) */}
        <SvgPath d={INTRO5_ARC_OUTER} stroke="url(#g5arcO)" strokeOpacity={0.7} strokeWidth={1} fill="none" />
        <SvgPath d={INTRO5_ARC_INNER} stroke="url(#g5arcI)" strokeWidth={1} fill="none" />

        {/* 원근 격자 (지구본 뒤) */}
        {INTRO5_GRID_LINES.map(([x1, y1, x2, y2], i) => (
          <SvgLine key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth={1} />
        ))}

        {/* 보라 지구본 — 시안 레이어 순서 그대로 */}
        <SvgCircle cx={201.5} cy={314.5} r={175} fill="url(#g5glow)" />
        <SvgCircle cx={204.64} cy={312.93} r={160.44} fill="#751AAD" fillOpacity={0.2} />
        <SvgCircle cx={204.64} cy={312.93} r={160.44} fill="url(#g5a)" fillOpacity={0.7} />
        <SvgCircle cx={204.64} cy={312.93} r={160.44} fill="url(#g5b)" fillOpacity={0.4} />
        <SvgCircle cx={203.85} cy={313.72} r={154.95} fill="#FF14E4" />
        <SvgCircle cx={203.85} cy={313.72} r={154.95} fill="url(#g5c)" fillOpacity={0.5} />
        <SvgCircle cx={203.85} cy={313.72} r={154.95} fill="url(#g5d)" fillOpacity={0.3} />
        <SvgCircle cx={203.85} cy={313.72} r={154.95} fill="url(#g5e)" fillOpacity={0.1} />
        <SvgPath d={INTRO5_CONTINENTS_A} fill="#FFFFFF" fillOpacity={0.2} />
        <SvgPath d={INTRO5_CONTINENTS_B} fill="#FFFFFF" fillOpacity={0.2} />
        <SvgPath d={INTRO5_GLOBE_RING} stroke="url(#g5ring)" strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}
