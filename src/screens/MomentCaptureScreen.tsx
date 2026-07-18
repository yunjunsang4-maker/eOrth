// 순간 캡처 시트 — 알림 탭으로만 진입(스펙: 알림 단독 진입점).
// 텍스트(필수) + 무드 이모지(선택) + 사진 1장(선택) + 자동 시간·위치. 2초 안에 입력 시작이 목표.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useMoments } from '../store/momentStore';
import { useToast } from '../store/toastStore';
import { locateCountry } from '../utils/countryLocate';

const MOMENT_MEDIA_DIR = 'moments/';

const MOODS = ['😊', '🥹', '😮', '😌', '🤩', '😭'];

export default function MomentCaptureScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { addMoment } = useMoments();
  const { pushToast } = useToast();

  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // 위치는 비동기로 채운다 — 실패해도 저장에 지장 없음(오프라인 필수 동작)
  const [geo, setGeo] = useState<{ code?: string; name?: string; region?: string }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 권한 확인만 — 미부여 시 OS 팝업 없이 조용히 종료(시간만 저장됨)
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' || cancelled) return;

        // lastKnown 우선(즉시 반환)
        const lastKnown = await Location.getLastKnownPositionAsync();
        const coords = lastKnown?.coords ?? null;

        if (coords) {
          // 1차: OS 역지오코딩
          try {
            const [rev] = await Location.reverseGeocodeAsync(
              { latitude: coords.latitude, longitude: coords.longitude }
            );
            if (!cancelled && (rev?.isoCountryCode || rev?.country)) {
              setGeo({
                code: rev.isoCountryCode ?? undefined,
                name: rev.country ?? undefined,
                region: rev.city ?? rev.district ?? undefined,
              });
              return;
            }
          } catch { /* 오프라인이면 아래 폴백으로 */ }
          // 2차: 오프라인 폴백 — GeoJSON 폴리곤 판정
          if (!cancelled) {
            const hit = locateCountry(coords.latitude, coords.longitude);
            if (hit) setGeo({ code: hit.code, name: hit.name });
          }
        } else {
          // lastKnown 없으면 실제 위치 요청(정확도 낮춰 빠르게)
          try {
            const fresh = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (cancelled) return;
            try {
              const [rev] = await Location.reverseGeocodeAsync({
                latitude: fresh.coords.latitude,
                longitude: fresh.coords.longitude,
              });
              if (!cancelled && (rev?.isoCountryCode || rev?.country)) {
                setGeo({
                  code: rev.isoCountryCode ?? undefined,
                  name: rev.country ?? undefined,
                  region: rev.city ?? rev.district ?? undefined,
                });
                return;
              }
            } catch { /* 오프라인 폴백 */ }
            if (!cancelled) {
              const hit = locateCountry(fresh.coords.latitude, fresh.coords.longitude);
              if (hit) setGeo({ code: hit.code, name: hit.name });
            }
          } catch { /* getCurrentPosition 실패 무시 — 시간만 저장 */ }
        }
      } catch { /* 위치 전체 실패 무시 — 시간만 저장 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const srcUri = result.assets[0].uri;
    // documentDirectory로 복사해 OS 캐시 정리 후에도 사진 유지(persistRecordPhotos 동일 패턴)
    try {
      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      const base = FileSystem.documentDirectory;
      if (base) {
        const dir = `${base}${MOMENT_MEDIA_DIR}`;
        try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* 이미 존재 */ }
        const ext = (srcUri.split('?')[0].match(/\.(jpg|jpeg|png|webp|heic)$/i)?.[1] || 'jpg').toLowerCase();
        const to = `${dir}moment-${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: srcUri, to });
        setPhotoUri(to);
        return;
      }
    } catch { /* 복사 실패 → 원본 URI 유지(기존 컨벤션) */ }
    setPhotoUri(srcUri);
  };

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMoment({
      text: trimmed,
      mood: mood ?? undefined,
      photoUri: photoUri ?? undefined,
      countryCode: geo.code,
      countryName: geo.name,
      regionName: geo.region,
    });
    pushToast(t('moments.saved'));
    navigation.goBack();
  };

  return (
    <View style={st.root}>
      {/* 배경 탭으로 닫기 */}
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.grab} />
          <Text style={st.title}>✨ {t('moments.captureTitle')}</Text>
          <TextInput
            style={st.input}
            placeholder={t('moments.placeholder')}
            placeholderTextColor="#5a5a68"
            value={text}
            onChangeText={setText}
            autoFocus
            multiline
            maxLength={200}
          />
          <View style={st.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity key={m} onPress={() => setMood(mood === m ? null : m)}>
                <Text style={[st.mood, mood === m && st.moodOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.bottomRow}>
            <TouchableOpacity style={st.chip} onPress={pickPhoto}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={st.thumb} />
                : <Text style={st.chipText}>📷 {t('moments.addPhoto')}</Text>}
            </TouchableOpacity>
            {geo.name ? (
              <View style={st.chip}>
                <Text style={st.chipText}>📍 {geo.region || geo.name}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[st.saveBtn, !text.trim() && { opacity: 0.4 }]}
              onPress={save}
              disabled={!text.trim()}
            >
              <Text style={st.saveText}>{t('moments.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#17131f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#2E2E3B', padding: 16,
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginBottom: 12 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  input: {
    backgroundColor: '#211b2e', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 64, textAlignVertical: 'top', fontSize: 15,
  },
  moodRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mood: { fontSize: 26, opacity: 0.45 },
  moodOn: { opacity: 1, transform: [{ scale: 1.15 }] },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  chip: {
    borderWidth: 1, borderColor: '#6B21A8', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { color: '#BF85FC', fontSize: 12 },
  thumb: { width: 28, height: 28, borderRadius: 6 },
  saveBtn: {
    marginLeft: 'auto', backgroundColor: '#BF85FC', borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  saveText: { color: '#12061f', fontWeight: '700', fontSize: 14 },
});
