import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, AppState, Animated, Easing, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path as SvgPath,
  Circle as SvgCircle,
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
  INTRO4_ARC_1,
  INTRO4_ARC_2,
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

// ── 2페이지: 여행 기록 카드 콜라주 밴드 (시안 iPhone 17 - 65 (1)) ──
// 밴드 PNG(1073×433)는 시안(402 기준) 좌표와 1:1 스케일. 시안 크롭은 밴드의 두 번째
// 필름 스트립(PNG x≈620)이 화면 x200에 오는 위치 — 이때 좌측 저널(-112)·좌측 폴라로이드(51)·
// 우측 폴라로이드(360)가 시안과 일치한다. 필름 스트립 상단 y113에서 테이프 여유(≈21)를 뺀
// y92가 밴드 상단. 같은 밴드 두 장을 이어붙여 한 장 폭만큼 왼쪽→오른쪽 등속 이동 후 리셋
// = 이음새 없는 무한 마퀴.
const INTRO2_BAND = require('../../assets/intro2-band.png');
const BAND_W = 1073;
const BAND_H = 433;
const BAND_LEFT = -420; // 시안 크롭 기준 초기 위치(시안 단위)
const BAND_TOP = 92;
const BAND_LOOP_MS = 55000; // 한 바퀴(밴드 한 장 폭) 시간 — 약 20pt/s로 '천천히'

export function IntroVisual2() {
  const H = 700 * DS;
  const W = BAND_W * DS;
  // 0→1 = 오른쪽으로 밴드 한 장 폭 이동. 두 장이 이어져 있어 리셋 순간에도 화면이 동일 → 무한 반복.
  const loop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(loop, { toValue: 1, duration: BAND_LOOP_MS, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [loop]);
  const tx = loop.interpolate({ inputRange: [0, 1], outputRange: [0, W] });
  return (
    // overflow hidden: 밴드가 슬라이드 폭을 좌우로 크게 넘으므로
    // 클리핑하지 않으면 FlatList의 1·3단계 슬라이드 위까지 밴드가 그려진다.
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H, overflow: 'hidden' }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SideGlows purpleCx={6.5} purpleCy={247} />
      </Svg>
      {/* 시작 위치가 시안 크롭이 되도록 한 장 폭만큼 왼쪽에서 출발(두 번째 장이 시안 위치) */}
      <Animated.View
        style={{
          position: 'absolute',
          left: (BAND_LEFT - BAND_W) * DS,
          top: BAND_TOP * DS,
          flexDirection: 'row',
          transform: [{ translateX: tx }],
        }}
      >
        <Image source={INTRO2_BAND} style={{ width: W, height: BAND_H * DS }} resizeMode="stretch" />
        <Image source={INTRO2_BAND} style={{ width: W, height: BAND_H * DS }} resizeMode="stretch" />
      </Animated.View>
    </View>
  );
}

// ── 3페이지: 업적 배지 콜라주 (시안 iPhone 17 - 66, node 91:31) ──
// 에나멜 핀 배지 3종 + 은은한 와이어프레임 코인 2종 + 궤도 링을 시안 절대좌표
// (absoluteBoundingBox, 402 기준)대로 배치하고, 각기 다른 주기·위상으로 둥둥 떠다니게 한다.
// 스프라이트 제작: 피그마 3x 렌더에서 추출 — 배지는 밝은 림 볼록껍질 마스크로 배경 제거,
// 코인·링은 벡터 SVG를 크롬 헤드리스로 투명 래스터화(assets/intro3/*).
const I3_PLANE = require('../../assets/intro3/badge-plane.png');
const I3_PASSPORT = require('../../assets/intro3/badge-passport.png');
const I3_PEOPLE = require('../../assets/intro3/badge-people.png');
const I3_COIN_LG = require('../../assets/intro3/coin-globe-lg.png');
const I3_COIN_SM = require('../../assets/intro3/coin-globe-sm.png');
const I3_RING = require('../../assets/intro3/orbit-ring.png');

// 둥둥 뜨는 스프라이트 — 세로 왕복 + 미세 회전 흔들림(sine ease). delay로 위상을 엇갈려
// 배지들이 서로 독립적으로 떠 있는 느낌을 낸다. cx/cy는 시안(402 기준) 중심 좌표.
function FloatingSprite({ source, cx, cy, w, h, baseRotate = 0, amp = 6, wobble = 1.2, duration = 4200, delay = 0 }: {
  source: any; cx: number; cy: number; w: number; h: number;
  baseRotate?: number; amp?: number; wobble?: number; duration?: number; delay?: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(t, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [t, delay, duration]);
  const ty = t.interpolate({ inputRange: [0, 1], outputRange: [amp * DS, -amp * DS] });
  const rot = t.interpolate({ inputRange: [0, 1], outputRange: [`${baseRotate - wobble}deg`, `${baseRotate + wobble}deg`] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: (cx - w / 2) * DS,
        top: (cy - h / 2) * DS,
        width: w * DS,
        height: h * DS,
        transform: [{ translateY: ty }, { rotate: rot }],
      }}
    >
      <Image source={source} style={{ width: w * DS, height: h * DS }} resizeMode="stretch" />
    </Animated.View>
  );
}

export function IntroVisual3() {
  const H = 700 * DS;
  return (
    // overflow hidden: 링·비행기 배지가 화면 밖으로 걸치므로 이웃 슬라이드 침범 방지
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H, overflow: 'hidden' }} pointerEvents="none">
      <Svg width={SW} height={H} viewBox="0 0 402 700">
        <SideGlows purpleCx={65.5} purpleCy={225} />
      </Svg>
      {/* z순서 = 시안 레이어 순서: 코인들 → 사람들 → 비행기 → 궤도 링 → 중앙 여권 배지 */}
      <FloatingSprite source={I3_COIN_LG} cx={132.5} cy={428.5} w={192} h={192} amp={4} wobble={0.8} duration={5200} delay={600} />
      <FloatingSprite source={I3_COIN_SM} cx={302.5} cy={243.5} w={110} h={110} amp={4} wobble={0.8} duration={4600} delay={1400} />
      <FloatingSprite source={I3_PEOPLE} cx={317.6} cy={505.3} w={181} h={164.7} amp={6} wobble={1.4} duration={4400} delay={900} />
      <FloatingSprite source={I3_PLANE} cx={85} cy={170.5} w={181} h={143} amp={6} wobble={1.4} duration={3800} delay={0} />
      <FloatingSprite source={I3_RING} cx={203} cy={359.4} w={364} h={46.9} baseRotate={-36.9} amp={3} wobble={0.5} duration={4800} delay={300} />
      <FloatingSprite source={I3_PASSPORT} cx={209} cy={345.5} w={232} h={233} amp={7} wobble={1} duration={4200} delay={1100} />
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

// ── 5페이지: 지구본 애니메이션 영상 (kling 시안) — 기존 SVG 지구본을 영상으로 교체 ──
// 영상은 expo-video 사용 (expo-av Video는 새 아키텍처에서 크래시 — eorth-expo-av-to-expo-video)
const INTRO5_VIDEO = require('../../assets/intro5.mp4');
const INTRO5_SCALE = 0.92; // 영상 크기 소폭 축소 — 중앙 기준
const INTRO5_VOID = '#000000'; // 영상 자체 배경(우주 검정)과 같은 백드롭 — 축소돼도 경계가 안 보이게
const INTRO5_VOID_0 = 'rgba(0,0,0,0)';

export function IntroVisual5({ active = true }: { active?: boolean }) {
  const H = 700 * DS; // 영상 배치 기준 높이 (시안)
  const HB = 800 * DS; // 백드롭 전체 높이 — 하단이 투명으로 사그라들 여유 포함
  const vw = SW * INTRO5_SCALE;
  const vh = H * INTRO5_SCALE;
  const fadeV = 70 * DS; // 상·하 가장자리 페이드 폭
  const fadeH = 44 * DS; // 좌·우 가장자리 페이드 폭
  const player = useVideoPlayer(INTRO5_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
  });
  // FlatList가 슬라이드를 미리 마운트하므로 여기서 재생하지 않고,
  // 5페이지가 실제 활성화되는 순간 처음부터 재생 (미리 재생돼 중간부터 보이는 문제 방지)
  useEffect(() => {
    try {
      if (active) player.replay();
      else player.pause();
    } catch {
      // 플레이어가 이미 해제된 경우 무시
    }
  }, [active, player]);
  // 앱이 백그라운드로 갔다 돌아오면 플레이어가 일시정지 상태로 남음 — 복귀 시 재생 재개
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) {
        try {
          player.play();
        } catch {
          // 플레이어가 이미 해제된 경우 무시
        }
      }
    });
    return () => sub.remove();
  }, [player, active]);
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, width: SW, height: HB }}
      pointerEvents="none"
    >
      {/* 백드롭: 검정 풀블리드(좌·우·상단 경계는 화면 밖) → 하단은 서서히 투명해져
          실제 화면 배경(별·앰비언트)이 그대로 드러남 — 불투명 색으로 끝나며 생기던 하단 단차 제거 */}
      <LinearGradient
        colors={[INTRO5_VOID, INTRO5_VOID, INTRO5_VOID_0]}
        locations={[0, 0.84, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          position: 'absolute',
          top: (H - vh) / 2,
          left: (SW - vw) / 2,
          width: vw,
          height: vh,
          overflow: 'hidden',
        }}
      >
        <VideoView
          player={player}
          style={{ width: vw, height: vh }}
          contentFit="cover"
          nativeControls={false}
        />
        {/* 영상 가장자리를 백드롭과 같은 검정으로 페이드 — 축소된 사각형 경계 제거 */}
        <LinearGradient
          colors={[INTRO5_VOID, INTRO5_VOID_0]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fadeV }}
        />
        <LinearGradient
          colors={[INTRO5_VOID_0, INTRO5_VOID]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: fadeV }}
        />
        <LinearGradient
          colors={[INTRO5_VOID, INTRO5_VOID_0]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: fadeH }}
        />
        <LinearGradient
          colors={[INTRO5_VOID_0, INTRO5_VOID]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: fadeH }}
        />
      </View>
    </View>
  );
}
