import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Text } from '../ui/Text';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useSkinAccent } from '../constants/skinTheme';
import { buildCountryShape, buildSilhouettePaths } from '../utils/countryShape';

// 자유 조정 — 확대(5배)뿐 아니라 축소(0.25배)도 허용한다. 사진이 프레임을 다 못 덮으면
// 빈 영역은 검게 남고, 그 상태 그대로(캡처) 퍼즐 그림이 된다.
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
// 사진이 프레임 밖으로 완전히 사라지지 않게 남겨 둘 최소 겹침(px)
const MIN_OVERLAP = 24;

/**
 * 퍼즐 그림 범위 조정 오버레이 — 사진 위에 그 나라 실루엣(지역 경계 포함)을 대고
 * 드래그·핀치로 지도에 담길 부분을 고른다. 확정하면 프레임에 보이는 모습 그대로를
 * 캡처(view-shot)해 돌려준다 — 크롭 좌표 환산 방식과 달리 축소·여백(검은 영역)까지
 * 표현할 수 있어 조정이 자유롭다(WYSIWYG).
 *
 * 프레임 비율은 지도(WebView)의 d3.geoMercator 투영 bbox 비율과 정확히 같게 계산한다 —
 * 지도는 퍼즐 그림을 그룹 bbox에 cover-fit(xMidYMid slice)으로 까는데, 캡처 결과의
 * 비율이 bbox와 같으면 잘리는 부분 없이 여기서 본 그대로 지도에 나온다.
 *
 * 표시 설정 Modal "안에" 절대위치로 렌더한다(중첩 Modal 금지 — 모달 껍데기 잔존으로
 * 터치 먹통이 난 전례가 있다). 제스처는 Modal 네이티브 윈도우 안이라 자체
 * GestureHandlerRootView가 필요하다(CutPhotoAdjustModal과 같은 이유).
 */

// 실루엣 투영·패스 생성은 countryShape.ts 공용 유틸 사용 — 시트 미리보기·공유 카드와 동일 수식

// cover-fit 렌더 크기 — CutPhotoAdjustModal과 같은 규칙 (scale=1 기준 크기)
function coverSize(imgAspect: number, frameW: number, frameH: number) {
  const aspect = frameW / frameH;
  return imgAspect >= aspect
    ? { rW: frameH * imgAspect, rH: frameH }
    : { rW: frameW, rH: frameW / imgAspect };
}

// 자유 이동 — 단, 사진이 프레임에서 완전히 벗어나 길을 잃지 않게 최소 겹침만 강제
function clampT(tx: number, ty: number, s: number, imgAspect: number, frameW: number, frameH: number) {
  const { rW, rH } = coverSize(imgAspect, frameW, frameH);
  const maxTx = (rW * s + frameW) / 2 - MIN_OVERLAP;
  const maxTy = (rH * s + frameH) / 2 - MIN_OVERLAP;
  return {
    tx: Math.max(-maxTx, Math.min(maxTx, tx)),
    ty: Math.max(-maxTy, Math.min(maxTy, ty)),
  };
}

interface Props {
  countryCode: string;
  uri: string;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
}

export default function PuzzlePhotoAdjustOverlay({ countryCode, uri, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  // 창 크기는 실시간으로 받는다 — 박제하면 폴드 펼침 시 프레임이 어긋난다.
  const { width: SW, height: SH } = useWindowDimensions();

  const shape = useMemo(() => buildCountryShape(countryCode), [countryCode]);
  // 프레임 = 나라 투영 bbox 비율로 화면에 fit
  const aspect = shape ? shape.dx / shape.dy : 4 / 3;
  const maxW = SW * 0.86;
  const maxH = SH * 0.5;
  let frameW = maxW;
  let frameH = frameW / aspect;
  if (frameH > maxH) { frameH = maxH; frameW = frameH * aspect; }

  // 실루엣 패스 — 오버레이는 가이드라 ~4천 점으로 감량(원본 수만 점을 그대로 그리면 무겁다)
  // evenodd: 바깥 사각형 + 나라 링들 → 나라 밖만 어둡게(안은 홀수-짝수로 뚫린다)
  const { dimPath, linePath } = useMemo(() => {
    if (!shape) return { dimPath: '', linePath: '' };
    return buildSilhouettePaths(shape, frameW, frameH, 4000);
  }, [shape, frameW, frameH]);

  // 사진 비율 (cover 기준 크기 계산용)
  const [imgAspect, setImgAspect] = useState(1);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (alive && w && h) setImgAspect(w / h); },
      () => { if (alive) setImgAspect(1); },
    );
    return () => { alive = false; };
  }, [uri]);

  // 제스처 상태 — CutPhotoAdjustModal과 같은 패턴
  const scaleA = useRef(new Animated.Value(1)).current;
  const txA = useRef(new Animated.Value(0)).current;
  const tyA = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, tx: 0, ty: 0 });
  const panBase = useRef({ tx: 0, ty: 0 });
  const pinchBase = useRef(1);

  // 사진이 바뀌면 초기화 (기본 = 지도 cover-fit 기본과 동일한 중앙)
  useEffect(() => {
    cur.current = { scale: 1, tx: 0, ty: 0 };
    scaleA.setValue(1);
    txA.setValue(0);
    tyA.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const apply = (scale: number, tx: number, ty: number) => {
    const c = clampT(tx, ty, scale, imgAspect, frameW, frameH);
    cur.current = { scale, tx: c.tx, ty: c.ty };
    scaleA.setValue(scale);
    txA.setValue(c.tx);
    tyA.setValue(c.ty);
  };

  // runOnJS(true): 콜백이 일반 JS 함수(Animated.setValue, ref 갱신)라 worklet 실행이면 크래시
  const pinchG = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => { pinchBase.current = cur.current.scale; })
    .onUpdate((e) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchBase.current * e.scale));
      apply(s, cur.current.tx, cur.current.ty);
    })
    .onEnd(() => {
      // 기본 배율(1.0 = 지도 cover-fit 그대로) 근처에서 놓으면 스냅 + 셀렉션 햅틱 틱 —
      // 제스처 중에 당기면 조작감이 끈적해지므로 스냅은 손을 뗀 순간에만 건다.
      const s = cur.current.scale;
      if (s !== 1 && Math.abs(s - 1) < 0.06) {
        apply(1, cur.current.tx, cur.current.ty);
        Haptics.selectionAsync().catch(() => {});
      }
    });
  const panG = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => { panBase.current = { tx: cur.current.tx, ty: cur.current.ty }; })
    .onUpdate((e) => {
      apply(cur.current.scale, panBase.current.tx + e.translationX, panBase.current.ty + e.translationY);
    });
  // 더블탭 — 초기 상태(중앙 cover-fit)로 리셋. 조정이 꼬였을 때의 탈출구.
  const doubleTapG = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      apply(1, 0, 0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    });
  const composed = Gesture.Simultaneous(pinchG, panG, doubleTapG);

  // 확정 — 프레임에 보이는 모습 그대로 캡처(실루엣 오버레이는 형제 뷰라 캡처에 안 담긴다)
  const canvasRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 출력 해상도: 장변 1280px — 지도 쪽 변환(imageToDataUri 1024px)보다 넉넉하게
      const outW = aspect >= 1 ? 1280 : Math.round(1280 * aspect);
      const outH = Math.round(outW / aspect);
      const shot = await captureRef(canvasRef, {
        format: 'jpg',
        quality: 0.9,
        width: outW,
        height: outH,
        result: 'tmpfile',
      });
      onConfirm(shot || uri);
    } catch {
      // 캡처 실패 — 원본 그대로 확정(지도 cover-fit이 중앙을 쓴다)
      onConfirm(uri);
    } finally {
      setBusy(false);
    }
  };

  const { rW, rH } = coverSize(imgAspect, frameW, frameH);
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <View style={s.overlay} accessibilityViewIsModal>
        <Text style={s.title}>{t('main.puzzleAdjustTitle')}</Text>
        <GestureDetector gesture={composed}>
          <View style={[s.frame, { width: frameW, height: frameH }]}>
            {/* 캡처 대상 — 검은 바탕 + 사진만(collapsable=false: 안드로이드 캡처 필수).
                cover-fit 전체 크기로 깔아 이동 시에도 비트맵이 잘리지 않게 한다 */}
            <View ref={canvasRef} collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
              <Animated.Image
                source={{ uri }}
                resizeMode="cover"
                style={{
                  position: 'absolute',
                  width: rW,
                  height: rH,
                  left: (frameW - rW) / 2,
                  top: (frameH - rH) / 2,
                  transform: [{ translateX: txA }, { translateY: tyA }, { scale: scaleA }],
                }}
              />
            </View>
            {/* 나라 실루엣 — 새 아키텍처서 Svg가 pointerEvents=none을 무시하므로 View로 감싼다 */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width={frameW} height={frameH}>
                <Path d={dimPath} fill="rgba(6,7,10,0.68)" fillRule="evenodd" />
                {/* 실루엣 선은 스킨 강조색 — 시트 미리보기·공유 카드의 실루엣 선과 같은 언어 */}
                <Path d={linePath} fill="none" stroke={skinAccent.accent} strokeOpacity={0.6} strokeWidth={0.8} />
              </Svg>
            </View>
          </View>
        </GestureDetector>
        <Text style={s.hint}>{t('main.puzzleAdjustHint')}</Text>
        <View style={s.btnRow}>
          <TouchableOpacity onPress={onCancel} style={s.btnGlass} activeOpacity={0.85} disabled={busy}>
            <Text style={s.btnGlassTxt}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirm}
            style={[s.btnPrimaryWrap, { shadowColor: skinAccent.accent, opacity: busy ? 0.6 : 1 }]}
            activeOpacity={0.85}
            disabled={busy}
          >
            <LinearGradient
              colors={skinAccent.btnGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.btnPrimaryGrad}
            >
              <Text style={s.btnPrimaryTxt}>{t('common.confirm')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  frame: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  hint: { color: '#A1A1B0', fontSize: 12, paddingHorizontal: 32, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnGlass: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnGlassTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  btnPrimaryWrap: {
    borderRadius: 999,
    // 컬러 글로우는 iOS 전용 — 안드로이드 elevation은 색 지정 불가(회색 사각 그림자)
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 12 },
      default: {},
    }),
  },
  btnPrimaryGrad: {
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
