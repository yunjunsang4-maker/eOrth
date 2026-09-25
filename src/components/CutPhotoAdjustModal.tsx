import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../ui/Text';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { PillRing } from './record/CalendarBottomSheet';
import { andFitText } from '../utils/fitText';

/** 알약 유리 테두리 — 블로그 기록 알약과 같은 좌상단·우하단 흰색 대각 그라데이션 링(PillRing diagonal).
 *  부모의 첫 자식으로 넣으면 absoluteFill 층이 제 크기를 실측해 링을 얹는다(문구·다국어로 폭이 달라도 됨).
 *  ⚠️ 부모에 borderWidth·overflow:'hidden'을 주지 말 것 — 링이 잘리거나 이중 테두리가 된다. */
function AutoPillRing() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
      }}
    >
      <PillRing width={size.w} height={size.h} radius={size.h / 2} diagonal />
    </View>
  );
}

// 슬롯에 들어간 사진의 조정값 — tx/ty는 프레임 크기 대비 비율, scale은 배율(≥1)
export type CutTransform = { scale: number; tx: number; ty: number };

interface Props {
  visible: boolean;
  uri: string | null;
  aspect: number;                  // 프레임 가로/세로 비율
  initial?: CutTransform | null;
  onConfirm: (t: CutTransform) => void;
  onCancel: () => void;
  onChangePhoto?: () => void; // 미지정 시 '사진 변경' 버튼 숨김(취소와 동작이 같은 화면에서)
  onRemove?: () => void; // 슬롯 비우기(빈 칸으로)
}

const MAX_SCALE = 5;

type Cfg = { imgAspect: number; aspect: number; frameW: number; frameH: number };

// cover-fit 렌더 크기 (프레임을 빈틈없이 덮는 비트맵 크기)
function coverSize(imgAspect: number, frameW: number, frameH: number) {
  const aspect = frameW / frameH;
  return imgAspect >= aspect
    ? { rW: frameH * imgAspect, rH: frameH }
    : { rW: frameW, rH: frameW / imgAspect };
}

/**
 * 조정값(CutTransform)이 적용된 커버 사진을 프레임(부모는 overflow:hidden) 안에 그린다.
 * 프레임 크기 cover 이미지에 transform을 걸면 cover가 이미 잘라낸 부분이 검게 비므로,
 * cover-fit 전체 크기(rW×rH)로 깔고 가운데 정렬한 뒤 이동/확대를 적용한다.
 */
export function AdjustedCoverImage({
  uri,
  transform,
  frameW,
  frameH,
}: {
  uri: string;
  transform?: CutTransform | null;
  frameW: number;
  frameH: number;
}) {
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (alive) setImgAspect(w && h ? w / h : 1); },
      () => { if (alive) setImgAspect(1); }
    );
    return () => { alive = false; };
  }, [uri]);

  if (!transform || imgAspect == null) {
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  const { rW, rH } = coverSize(imgAspect, frameW, frameH);
  return (
    <Image
      source={{ uri }}
      resizeMode="cover"
      style={{
        position: 'absolute',
        width: rW,
        height: rH,
        left: (frameW - rW) / 2,
        top: (frameH - rH) / 2,
        transform: [
          { translateX: transform.tx * frameW },
          { translateY: transform.ty * frameH },
          { scale: transform.scale },
        ],
      }}
    />
  );
}

// 사진이 항상 프레임을 덮도록 이동 범위를 제한
function clampT(tx: number, ty: number, s: number, cfg: Cfg) {
  const { imgAspect, aspect, frameW, frameH } = cfg;
  const rW = imgAspect >= aspect ? frameH * imgAspect : frameW;
  const rH = imgAspect >= aspect ? frameH : frameW / imgAspect;
  const maxTx = Math.max(0, (rW * s - frameW) / 2);
  const maxTy = Math.max(0, (rH * s - frameH) / 2);
  return {
    tx: Math.max(-maxTx, Math.min(maxTx, tx)),
    ty: Math.max(-maxTy, Math.min(maxTy, ty)),
  };
}

export default function CutPhotoAdjustModal({ visible, uri, aspect, initial, onConfirm, onCancel, onChangePhoto, onRemove }: Props) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  // 블로그 국가·날짜 칩과 같은 색 판정 — aurora만 시안 보라, 나머지 스킨은 스킨색(ringGradient 유무로 판정)
  const customSkin = !!skinAccent.ringGradient;
  const chipBg = customSkin ? skinAccent.tint(0.2) : 'rgba(117,26,173,0.2)';
  const chipFg = customSkin ? skinAccent.accent : '#E0C9FF';
  // 창 크기는 실시간으로 받는다 — 박제하면 폴드 펼침 시 프레임이 어긋난다.
  const { width: SW, height: SH } = useWindowDimensions();
  // 프레임 크기 — aspect에 맞춰 화면에 fit
  const maxW = SW * 0.82;
  const maxH = SH * 0.52;
  let frameW = maxW;
  let frameH = frameW / aspect;
  if (frameH > maxH) { frameH = maxH; frameW = frameH * aspect; }

  const [imgAspect, setImgAspect] = useState(1);

  const scaleA = useRef(new Animated.Value(1)).current;
  const txA = useRef(new Animated.Value(0)).current;
  const tyA = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, tx: 0, ty: 0 });
  const panBase = useRef({ tx: 0, ty: 0 });
  const pinchBase = useRef(1);
  const cfgRef = useRef<Cfg>({ imgAspect: 1, aspect, frameW, frameH });
  cfgRef.current = { imgAspect, aspect, frameW, frameH };

  // 사진 실제 비율 측정
  useEffect(() => {
    if (!visible || !uri) return;
    Image.getSize(uri, (w, h) => setImgAspect(w / h), () => setImgAspect(1));
  }, [visible, uri]);

  // 모달 열릴 때 초기값 반영
  useEffect(() => {
    if (!visible) return;
    const init = initial ?? { scale: 1, tx: 0, ty: 0 };
    const c = clampT(init.tx * frameW, init.ty * frameH, init.scale, cfgRef.current);
    cur.current = { scale: init.scale, tx: c.tx, ty: c.ty };
    scaleA.setValue(init.scale);
    txA.setValue(c.tx);
    tyA.setValue(c.ty);
  }, [visible, imgAspect]);

  const apply = (scale: number, tx: number, ty: number) => {
    const c = clampT(tx, ty, scale, cfgRef.current);
    cur.current = { scale, tx: c.tx, ty: c.ty };
    scaleA.setValue(scale);
    txA.setValue(c.tx);
    tyA.setValue(c.ty);
  };

  // 핀치(확대/축소)
  // runOnJS(true): 콜백이 worklet이 아닌 일반 JS 함수(Animated.setValue, ref 갱신)라서
  // UI 스레드(worklet)에서 실행되면 "[Worklets] non-worklet function" 크래시가 난다
  const pinchG = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => { pinchBase.current = cur.current.scale; })
    .onUpdate((e) => {
      const s = Math.max(1, Math.min(MAX_SCALE, pinchBase.current * e.scale));
      apply(s, cur.current.tx, cur.current.ty);
    });

  // 드래그(이동)
  const panG = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => { panBase.current = { tx: cur.current.tx, ty: cur.current.ty }; })
    .onUpdate((e) => {
      apply(cur.current.scale, panBase.current.tx + e.translationX, panBase.current.ty + e.translationY);
    });

  const composed = Gesture.Simultaneous(pinchG, panG);

  const confirm = () => {
    onConfirm({
      scale: cur.current.scale,
      tx: frameW ? cur.current.tx / frameW : 0,
      ty: frameH ? cur.current.ty / frameH : 0,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={s.overlay} accessibilityViewIsModal>
          <Text style={s.title}>{t('comp.cutAdjustTitle')}</Text>
          <GestureDetector gesture={composed}>
            <View style={[s.frame, { width: frameW, height: frameH }]}>
              {uri ? (
                // 프레임 크기가 아니라 cover-fit 전체 크기로 깔아야 이동 시 잘린 영역(검은 띠)이 안 생긴다
                <Animated.Image
                  source={{ uri }}
                  style={(() => {
                    const { rW, rH } = coverSize(imgAspect, frameW, frameH);
                    return {
                      position: 'absolute' as const,
                      width: rW,
                      height: rH,
                      left: (frameW - rW) / 2,
                      top: (frameH - rH) / 2,
                      transform: [{ translateX: txA }, { translateY: tyA }, { scale: scaleA }],
                    };
                  })()}
                  resizeMode="cover"
                />
              ) : null}
              {/* 3분할 가이드 */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={[s.gridLineV, { left: '33.33%' }]} />
                <View style={[s.gridLineV, { left: '66.66%' }]} />
                <View style={[s.gridLineH, { top: '33.33%' }]} />
                <View style={[s.gridLineH, { top: '66.66%' }]} />
              </View>
            </View>
          </GestureDetector>
          <Text style={s.hint}>{t('comp.cutAdjustHint')}</Text>
          {/* 하단 4버튼 — 블로그 기록 알약과 동일 규격(30h·r15·링 → 콘텐츠 순, 2026-09-24 기록 화면 UI 통일).
              사진 변경·취소 = 흰 10% + #C3C3C3, 삭제 = 같은 알약에 빨강 글자, 확인 = 선택 칩(스킨 틴트 20% + 스킨색 글자) */}
          <View style={s.btnRow}>
            {onChangePhoto && (
              <TouchableOpacity onPress={onChangePhoto} style={s.pill} activeOpacity={0.85}>
                <AutoPillRing />
                <Text style={s.pillTxt} {...andFitText}>{t('comp.changePhoto')}</Text>
              </TouchableOpacity>
            )}
            {onRemove && (
              <TouchableOpacity onPress={onRemove} style={s.pill} activeOpacity={0.85}>
                <AutoPillRing />
                <Text style={[s.pillTxt, s.pillTxtDanger]} {...andFitText}>{t('comp.delete')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onCancel} style={s.pill} activeOpacity={0.85}>
              <AutoPillRing />
              <Text style={s.pillTxt} {...andFitText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} style={[s.pill, { backgroundColor: chipBg }]} activeOpacity={0.85}>
              <AutoPillRing />
              <Text style={[s.pillTxt, { color: chipFg }]} {...andFitText}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  frame: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.25)' },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.25)' },
  hint: { color: '#A1A1B0', fontSize: 12 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  // 블로그 헤더 저장 알약(saveBtn)과 동일 — 바탕 흰 10%, 30h·r15, padH 16. 테두리는 AutoPillRing(borderWidth 금지)
  pill: { height: 30, borderRadius: 15, minWidth: 70, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  pillTxt: { color: '#C3C3C3', fontSize: 14, fontWeight: '600' },
  pillTxtDanger: { color: '#FF3B30' },
});
