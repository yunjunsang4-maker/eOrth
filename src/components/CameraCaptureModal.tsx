import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';

/**
 * 인앱 카메라 촬영 모달 — expo-camera CameraView 기반.
 *
 * expo-image-picker의 launchCameraAsync가 SDK54/새 아키텍처에서 카메라 미리보기만 뜨고
 * 셔터가 먹지 않는 문제가 있어, 스냅 화면과 동일한 검증된 CameraView 방식으로 촬영한다.
 * 한 장 찍으면 onCapture(uri) 후 닫힌다. visible=false면 CameraView를 언마운트해 카메라를 반납한다.
 */
export default function CameraCaptureModal({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // 닫힐 때 상태 초기화 — 다음 열림에서 '준비됨' 잔상으로 셔터가 오작동하지 않게
  useEffect(() => {
    if (!visible) {
      setReady(false);
      setShooting(false);
    }
  }, [visible]);

  const shoot = async () => {
    if (!cameraRef.current || shooting || !ready) return;
    setShooting(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        onCapture(photo.uri);
        onClose();
      }
    } catch {
      // 촬영 실패 — 모달 유지, 사용자가 재시도/닫기
    } finally {
      setShooting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.bg}>
        {!permission ? (
          <View style={s.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : !permission.granted ? (
          // 권한 없음 — 요청 또는 설정 유도
          <SafeAreaView style={s.center}>
            <Text style={s.permText}>{t('dm.cameraPermMsg')}</Text>
            <TouchableOpacity
              style={s.permBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const res = await requestPermission();
                if (!res.granted && !res.canAskAgain) Linking.openSettings().catch(() => {});
              }}
            >
              <Text style={s.permBtnText}>{t('dm.cameraAllow')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.permClose} activeOpacity={0.7} onPress={onClose}>
              <Text style={s.permCloseText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        ) : (
          <>
            {visible && (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                onCameraReady={() => setReady(true)}
              />
            )}
            {/* 상단 — 닫기 */}
            <SafeAreaView style={s.topBar}>
              <TouchableOpacity style={s.iconBtn} activeOpacity={0.7} onPress={onClose} accessibilityRole="button">
                <Text style={s.iconTxt}>✕</Text>
              </TouchableOpacity>
            </SafeAreaView>
            {/* 하단 — 셔터 + 전/후면 전환 */}
            <SafeAreaView style={s.bottomBar}>
              <View style={s.side} />
              <TouchableOpacity
                style={[s.shutter, (!ready || shooting) && s.shutterDim]}
                activeOpacity={0.8}
                onPress={shoot}
                disabled={!ready || shooting}
                accessibilityRole="button"
                accessibilityLabel={t('dm.camera')}
              >
                {shooting ? <ActivityIndicator color="#0A0A0F" /> : <View style={s.shutterInner} />}
              </TouchableOpacity>
              <View style={s.side}>
                <TouchableOpacity
                  style={s.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  accessibilityRole="button"
                >
                  <Text style={s.flipTxt}>⟲</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0A0A0F' },
  permText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  permBtn: { backgroundColor: '#6B21A8', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  permBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  permClose: { marginTop: 14, paddingVertical: 8 },
  permCloseText: { color: '#A1A1B0', fontSize: 14 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { width: 56, alignItems: 'center', justifyContent: 'center' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  flipTxt: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterDim: { opacity: 0.5 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
});
