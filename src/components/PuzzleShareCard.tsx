import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, ClipPath, Image as SvgImage } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { buildCountryShape, buildSilhouettePaths } from '../utils/countryShape';
import { useStageWidth } from '../utils/stage';

/**
 * 퍼즐 완성 공유 카드 — 완성 연출이 끝난 뒤 뜨는 오버레이.
 * 나라 실루엣으로 마스킹한 퍼즐 그림 + 국가명 + 완성 문구를 카드로 보여주고,
 * iOS는 공유 시트(Share.share url), 안드로이드는 갤러리 저장으로 내보낸다
 * (RN Share가 안드로이드에선 이미지 파일 첨부를 지원하지 않는다 — expo-sharing은
 *  네이티브 모듈이라 현 dev 빌드에 없어 도입하지 않는다).
 *
 * 지도 화면 안의 절대위치 오버레이로 렌더한다(Modal 금지 — 껍데기 잔존 전례).
 */
interface Props {
  countryCode: string;
  countryName: string;
  /** 퍼즐 그림(크롭본) — 비율이 나라 bbox와 같아 실루엣에 잘림 없이 맞는다 */
  image: string;
  total: number;
  onClose: () => void;
}

export default function PuzzleShareCard({ countryCode, countryName, image, total, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent();
  // 카드 폭은 Stage 폭에서 파생 — 박제하면 폴드 펼침 시 카드가 좁게 남는다.
  const SW = useStageWidth();

  const shape = useMemo(() => buildCountryShape(countryCode), [countryCode]);
  const cardW = Math.min(SW * 0.84, 340);
  const artW = cardW - 40;
  const artH = shape ? Math.min(artW * (shape.dy / shape.dx), artW * 1.1) : artW * 0.66;
  // 실루엣이 세로로 길어 높이가 잘린 경우엔 폭을 비율에 맞춰 줄인다(늘어짐 방지)
  const fitW = shape ? Math.min(artW, artH * (shape.dx / shape.dy)) : artW;
  const { linePath } = useMemo(() => {
    if (!shape) return { linePath: '' };
    return buildSilhouettePaths(shape, fitW, fitW * (shape.dy / shape.dx), 3000);
  }, [shape, fitW]);

  // 등장 애니메이션 — 완성 연출의 여운을 받아 살짝 떠오르는 정도로만
  const appearA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(appearA, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [appearA]);

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (Platform.OS === 'ios') {
        await Share.share({ url: shot });
      } else {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) throw new Error('permission');
        await MediaLibrary.saveToLibraryAsync(shot);
        setNotice(t('main.puzzleShareSaved'));
      }
    } catch (e: any) {
      // iOS 공유 시트 취소는 실패가 아니다 — 조용히 무시
      if (!(Platform.OS === 'ios' && e?.message?.includes('cancel'))) {
        setNotice(t('main.puzzleShareFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  return (
    <View style={s.overlay} accessibilityViewIsModal>
      <Animated.View
        style={{
          opacity: appearA,
          transform: [{ scale: appearA.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}
      >
        {/* 캡처 대상 — 버튼 제외, 카드 본체만 (collapsable=false: 안드로이드 캡처 필수) */}
        <View ref={cardRef} collapsable={false} style={[s.card, { width: cardW }]}>
          <Text style={[s.title, { color: skinAccent.accent }]}>{t('main.puzzleShareTitle')}</Text>
          <View style={{ alignItems: 'center', width: artW }}>
            {shape && !!linePath ? (
              <Svg width={fitW} height={fitW * (shape.dy / shape.dx)}>
                <Defs>
                  <ClipPath id="pz-share-clip">
                    <Path d={linePath} clipRule="evenodd" />
                  </ClipPath>
                </Defs>
                <SvgImage
                  href={{ uri: image }}
                  width={fitW}
                  height={fitW * (shape.dy / shape.dx)}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath="url(#pz-share-clip)"
                />
                <Path d={linePath} fill="none" stroke={skinAccent.accent} strokeWidth={1} strokeOpacity={0.55} />
              </Svg>
            ) : null}
          </View>
          <Text style={s.country}>{countryName}</Text>
          <Text style={s.sub}>{t('main.puzzleShareCount', { total })}</Text>
          <View style={s.footRow}>
            <Text style={[s.foot, { color: skinAccent.accent }]}>eOrth</Text>
            <Text style={s.foot}>{dateStr}</Text>
          </View>
        </View>
        {notice && <Text style={s.notice}>{notice}</Text>}
        <View style={s.btnRow}>
          <TouchableOpacity onPress={onClose} style={s.btnGlass} activeOpacity={0.85} disabled={busy}>
            <Text style={s.btnGlassTxt}>{t('common.close')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={share}
            style={[s.btnPrimaryWrap, { shadowColor: skinAccent.accent, opacity: busy ? 0.6 : 1 }]}
            activeOpacity={0.85}
            disabled={busy}
          >
            <LinearGradient
              colors={skinAccent.btnGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.btnPrimaryGrad}
            >
              <Text style={s.btnPrimaryTxt}>{t('main.puzzleShareAction')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  card: {
    backgroundColor: '#15151F',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  country: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 2 },
  sub: { color: '#A1A1B0', fontSize: 13 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 6 },
  foot: { color: '#A1A1B0', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  notice: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: 12 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' },
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
