import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, AppState, Animated, Easing, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle as SvgCircle,
  Defs as SvgDefs,
  RadialGradient as SvgRadialGradient,
  Stop as SvgStop,
} from 'react-native-svg';

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

// ── 1페이지: 다크 지구본 + eOrth 워드마크 (시안 iPhone 17 - 64, node 115:68) ──
// 지구본(구체+유리 대륙+워드마크, 문양 제거판)과 보라 림 크레센트를 시안에서 추출한 3x
// 스프라이트로 배치(assets/intro1/*). 하단 보라 글로우는 IntroAmbient가 담당.
// 애니메이션 3종: ①무중력 부유(사인 테이블 네이티브 루프, Y·X 비정수배 주기 리사주+0.5° 틸트)
// ②활성화 시 등장(스케일 0.94→1 + 페이드, 600ms ease-out) ③림 글로우 펄스(3.6s 숨쉬기).
const I1_GLOBE = require('../../assets/intro1/globe.png');
const I1_RIM = require('../../assets/intro1/rim.png');

export function IntroVisual1({ active = true }: { active?: boolean }) {
  const H = 700 * DS;
  const GW = 363 * DS, GH = 371 * DS;
  const enter = useRef(new Animated.Value(0)).current;
  const t = useRef(new Animated.Value(0)).current;   // 부유 Y·틸트 위상
  const tx = useRef(new Animated.Value(0)).current;  // 부유 X 위상(주기 ×1.37)
  const pt = useRef(new Animated.Value(0)).current;  // 림 펄스 위상
  useEffect(() => {
    const a1 = Animated.loop(Animated.timing(t, { toValue: 1, duration: 6400, easing: Easing.linear, useNativeDriver: true }));
    const a2 = Animated.loop(Animated.timing(tx, { toValue: 1, duration: 8800, easing: Easing.linear, useNativeDriver: true }));
    const a3 = Animated.loop(Animated.timing(pt, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true }));
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [t, tx, pt]);
  useEffect(() => {
    if (active) {
      Animated.timing(enter, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [active, enter]);
  const wy = sineWave(7 * DS, 0);
  const wx = sineWave(4.5 * DS, 0.25);
  const wr = sineWave(0.9, 0);
  const wp = sineWave(0.45, -0.25); // 0에서 시작해 0.9까지 차오르는 숨쉬기(+0.45 오프셋)
  const ty = t.interpolate({ inputRange: wy.input, outputRange: wy.output });
  const txv = tx.interpolate({ inputRange: wx.input, outputRange: wx.output });
  const rot = t.interpolate({ inputRange: wr.input, outputRange: wr.output.map((v) => `${v}deg`) });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const pulseOp = pt.interpolate({ inputRange: wp.input, outputRange: wp.output.map((v) => 0.45 + v) });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H, overflow: 'hidden' }} pointerEvents="none">
      {/* 시안 bbox (20,174,349.7×356.4) 중심 (194.9,352.2), 스프라이트는 이펙트 여백 포함 363×371pt.
          림은 같은 컨테이너 안에서 본편과 완전 동기화된 채 opacity만 펄스 */}
      <Animated.View
        style={{
          position: 'absolute',
          left: (194.9 - 363 / 2) * DS,
          top: (352.2 - 371 / 2) * DS,
          width: GW,
          height: GH,
          opacity: enter,
          transform: [{ scale }, { translateY: ty }, { translateX: txv }, { rotate: rot }],
        }}
      >
        <Image source={I1_GLOBE} style={{ width: GW, height: GH }} resizeMode="stretch" />
        <Animated.Image
          source={I1_RIM}
          style={{ position: 'absolute', left: 0, top: 0, width: GW, height: GH, opacity: pulseOp }}
          resizeMode="stretch"
        />
      </Animated.View>
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

// 둥둥 뜨는 스프라이트 — 세로 사인파 왕복 + 미세 회전, ampX>0이면 가로 왕복을 다른
// 주기(×1.37)로 겹쳐 리사주 궤적(불규칙 부유·입체감). cx/cy는 시안(402 기준) 중심 좌표.
// 구현: '선형 타이밍 1개의 네이티브 무한 루프' + 사인 보간 테이블 — sequence/loop 조합처럼
// 구간 경계마다 JS 왕복이 없어서(완전 네이티브) JS 스레드가 바빠도 끊김(툭툭)이 없다.
// delay는 위상(phase)으로 재해석 — 시작부터 이어지는 곡선 위에서 출발해 도입도 매끄럽다.
const WAVE_SAMPLES = 33;
function sineWave(amp: number, phase: number): { input: number[]; output: number[] } {
  const input: number[] = [], output: number[] = [];
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    const p = i / (WAVE_SAMPLES - 1);
    input.push(p);
    output.push(Math.sin(2 * Math.PI * (p + phase)) * amp);
  }
  return { input, output };
}
function FloatingSprite({ source, cx, cy, w, h, baseRotate = 0, amp = 6, ampX = 0, wobble = 1.2, duration = 4200, delay = 0, phase }: {
  source: any; cx: number; cy: number; w: number; h: number;
  baseRotate?: number; amp?: number; ampX?: number; wobble?: number; duration?: number; delay?: number;
  phase?: number; // 0~1 — 사인 곡선 시작 위상. 지정 시 delay보다 우선(요소 간 확실한 분산용)
}) {
  const t = useRef(new Animated.Value(0)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const cycleY = duration * 2;
  const cycleX = Math.round(duration * 2 * 1.37);
  useEffect(() => {
    const a1 = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: cycleY, easing: Easing.linear, useNativeDriver: true })
    );
    a1.start();
    let a2: Animated.CompositeAnimation | undefined;
    if (ampX > 0) {
      a2 = Animated.loop(
        Animated.timing(tx, { toValue: 1, duration: cycleX, easing: Easing.linear, useNativeDriver: true })
      );
      a2.start();
    }
    return () => { a1.stop(); a2?.stop(); };
  }, [t, tx, cycleY, cycleX, ampX]);
  const phaseY = phase ?? (delay % cycleY) / cycleY;
  const phaseX = phase != null ? phase * 1.7 : (delay % cycleX) / cycleX;
  const wy = sineWave(-amp * DS, phaseY);
  const wr = sineWave(wobble, phaseY);
  const wx = sineWave(ampX * DS, phaseX + 0.25); // X는 Y와 90° 어긋난 위상에서 출발
  const ty = t.interpolate({ inputRange: wy.input, outputRange: wy.output });
  const txv = tx.interpolate({ inputRange: wx.input, outputRange: wx.output });
  const rot = t.interpolate({ inputRange: wr.input, outputRange: wr.output.map((v) => `${baseRotate + v}deg`) });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: (cx - w / 2) * DS,
        top: (cy - h / 2) * DS,
        width: w * DS,
        height: h * DS,
        transform: [{ translateY: ty }, { translateX: txv }, { rotate: rot }],
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
      {/* z순서 = 시안 레이어 순서: 코인들 → 사람들 → 비행기 → 궤도 링 → 중앙 여권 배지.
          phase를 원둘레에 고르게 분산 — 서로 완전히 다른 시점에 오르내려 따로 노는 느낌 */}
      <FloatingSprite source={I3_COIN_LG} cx={132.5} cy={428.5} w={192} h={192} amp={4} wobble={0.8} duration={5200} phase={0.3} />
      <FloatingSprite source={I3_COIN_SM} cx={302.5} cy={243.5} w={110} h={110} amp={4} wobble={0.8} duration={4600} phase={0.45} />
      <FloatingSprite source={I3_PEOPLE} cx={317.6} cy={505.3} w={181} h={164.7} amp={6} wobble={1.4} duration={4400} phase={0.62} />
      <FloatingSprite source={I3_PLANE} cx={85} cy={170.5} w={181} h={143} amp={6} wobble={1.4} duration={3800} phase={0} />
      <FloatingSprite source={I3_RING} cx={203} cy={359.4} w={364} h={46.9} baseRotate={-36.9} amp={3} wobble={0.5} duration={4800} phase={0.15} />
      <FloatingSprite source={I3_PASSPORT} cx={209} cy={345.5} w={232} h={233} amp={7} wobble={1} duration={4200} phase={0.8} />
    </View>
  );
}

// ── 4페이지: 보라 행성 + 프사 아바타 + DM 말풍선 (시안 iPhone 17 - 67, node 97:49) ──
// 행성 동심 링은 시안 좌표가 기존 렌더와 동일해 유지. 아바타 5종·말풍선 3종은
// 피그마 SVG(사진 임베디드)를 크롬 헤드리스로 3x 투명 래스터화한 스프라이트(assets/intro4/*)를
// 시안 절대좌표에 배치하고, 각기 다른 주기·위상·진폭으로 불규칙하게 떠다니게 해 입체감을 준다.
const I4_ORB = require('../../assets/intro4/orb-bg.png');
const I4_SPOT = require('../../assets/intro4/spot.png');
const I4_BUBBLE1 = require('../../assets/intro4/bubble1.png');
const I4_BUBBLE2 = require('../../assets/intro4/bubble2.png');
const I4_BUBBLE3 = require('../../assets/intro4/bubble3.png');
const I4_AVA_LG = require('../../assets/intro4/avatar-lg.png');
const I4_AVA_R = require('../../assets/intro4/avatar-r.png');
const I4_AVA_L = require('../../assets/intro4/avatar-l.png');
const I4_AVA_PR = require('../../assets/intro4/avatar-plain-r.png');
const I4_AVA_PL = require('../../assets/intro4/avatar-plain-l.png');

export function IntroVisual4() {
  const H = 700 * DS;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: H }} pointerEvents="none">
      {/* 행성 오브 배경 — 시안 배경 타원 7종(링·코어·글로우·입자 아크)을 통째로 추출한 스프라이트.
          시안 bbox (24,200,355×355) 중심 (201.5,377.5), 스프라이트는 블러 여백 포함 367pt. */}
      <Image
        source={I4_ORB}
        style={{ position: 'absolute', left: (201.5 - 367 / 2) * DS, top: (377.5 - 367 / 2) * DS, width: 367 * DS, height: 367 * DS }}
        resizeMode="stretch"
      />

      {/* 프사 아바타·말풍선 — 시안 절대좌표 중심 배치, z순서 = 시안 레이어 순서.
          amp/ampX/주기/지연을 요소마다 다르게 = 불규칙 부유(입체감). 스프라이트 자연 크기는
          이펙트 여백 포함이라 bbox보다 약간 큼 → bbox 중심에 중심 정렬. */}
      <FloatingSprite source={I4_BUBBLE1} cx={121.9} cy={133.1} w={209} h={53} amp={5} ampX={3} wobble={0} duration={5000} phase={0.55} />
      <FloatingSprite source={I4_AVA_PR} cx={308.9} cy={444.2} w={79} h={79} amp={4} ampX={2} wobble={0.8} duration={4400} phase={0.12} />
      <FloatingSprite source={I4_AVA_PL} cx={97.1} cy={445.2} w={79} h={79} amp={4} ampX={2} wobble={0.8} duration={5800} phase={0.68} />
      <FloatingSprite source={I4_AVA_LG} cx={198.2} cy={496.7} w={134} h={134} amp={6} ampX={3} wobble={0.9} duration={4600} phase={0.35} />
      <FloatingSprite source={I4_AVA_R} cx={341.3} cy={370.7} w={65} h={65} amp={5} ampX={4} wobble={1} duration={3900} phase={0.85} />
      <FloatingSprite source={I4_AVA_L} cx={62.7} cy={371.7} w={65} h={65} amp={5} ampX={4} wobble={1} duration={5200} phase={0.25} />
      {/* 흰 스팟 글로우 — 시안 z순서상 아바타 위, 말풍선 아래 (bbox 중심 141.2,463.3) */}
      <Image
        source={I4_SPOT}
        style={{ position: 'absolute', left: (141.2 - 44) * DS, top: (463.3 - 44.5) * DS, width: 88 * DS, height: 89 * DS }}
        resizeMode="stretch"
      />
      <FloatingSprite source={I4_BUBBLE3} cx={117} cy={308.4} w={189} h={50} amp={4} ampX={3} wobble={0} duration={5600} phase={0.42} />
      <FloatingSprite source={I4_BUBBLE2} cx={229.6} cy={217.8} w={306} h={76} amp={7} ampX={4} wobble={0} duration={4200} phase={0} />
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
    p.loop = false; // 반복 없이 마지막(완성된 로고) 프레임에서 멈춘다
    p.muted = true;
    // 기본 'auto'는 초기화 시점에 오디오 세션(포커스)을 가져가 백그라운드 음악·영상을
    // 멈추게 한다 — 무음 인트로 영상은 다른 앱 오디오와 섞여도 되므로 포커스를 잡지 않는다.
    // (SplashScreen과 동일한 조치)
    p.audioMixingMode = 'mixWithOthers';
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
          // 이미 끝까지 재생돼 마지막 프레임에 멈춘 상태면 재개하지 않는다(처음부터 다시 도는 것 방지)
          if (player.duration > 0 && player.currentTime >= player.duration - 0.05) return;
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
