import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SponsoredPackage } from '../constants/sponsoredPackages';

interface Props {
  pkg: SponsoredPackage | null;
  onClose: () => void;
}

/**
 * 광고(스폰서) 패키지 카드 — 지구본 광고 마커를 탭하면 떠오르는 팝업.
 * "AD" 표기(표시광고법) 필수. CTA 탭 시 제휴 링크를 외부 브라우저로 연다.
 */
export default function SponsoredPackageCard({ pkg, onClose }: Props) {
  if (!pkg) return null;

  const openLink = async () => {
    try {
      await Linking.openURL(pkg.affiliateUrl);
    } catch (e) {
      // 링크 열기 실패는 조용히 무시 (사용자 흐름 방해 X)
    }
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        {/* 카드 내부 탭은 닫힘 방지 */}
        <Pressable style={st.card} onPress={() => {}}>
          {/* 닫기 */}
          <TouchableOpacity style={st.closeBtn} onPress={onClose} hitSlop={10} activeOpacity={0.7}>
            <Text style={st.closeTxt}>✕</Text>
          </TouchableOpacity>

          {/* 이미지 + AD 배지 */}
          <View style={st.imageWrap}>
            {pkg.imageUrl ? (
              <Image source={{ uri: pkg.imageUrl }} style={st.image} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#6B21A8', '#BF85FC']} style={st.image} />
            )}
            <View style={st.adBadge}>
              <Text style={st.adTxt}>AD</Text>
            </View>
          </View>

          {/* 본문 */}
          <View style={st.body}>
            <Text style={st.partner}>
              {pkg.countryNameKo} · {pkg.partner}
            </Text>
            <Text style={st.title}>{pkg.title}</Text>
            {!!pkg.priceText && <Text style={st.price}>{pkg.priceText}</Text>}

            <TouchableOpacity style={st.cta} onPress={openLink} activeOpacity={0.85}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.ctaGrad}>
                <Text style={st.ctaTxt}>패키지 보러가기 →</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={st.disclaimer}>제휴 링크 · 구매 시 일정 수수료를 받을 수 있어요</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#2E2E3B',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  imageWrap: { width: '100%', height: 160, backgroundColor: '#1A1A26' },
  image: { width: '100%', height: '100%' },
  adBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  adTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  body: { padding: 20 },
  partner: { color: '#A1A1B0', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 25, marginBottom: 10 },
  price: { color: '#BF85FC', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  cta: { borderRadius: 999, overflow: 'hidden' },
  ctaGrad: { paddingVertical: 15, alignItems: 'center' },
  ctaTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disclaimer: { color: '#6E6E80', fontSize: 11, textAlign: 'center', marginTop: 12 },
});
