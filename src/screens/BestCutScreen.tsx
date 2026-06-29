/**
 * BestCutScreen — 온디바이스 AI 베스트컷 추천 화면 (Step 4 UI)
 *
 * 스팟 그룹별로 AI가 고른 베스트컷(1~3장)을 보여준다.
 * - '지금 분석' 버튼: 포그라운드 수동 트리거
 * - 백그라운드 자동 분석 토글: 충전/배터리60%↑/Wi-Fi 유휴 시 배치 실행
 *
 * 표시는 thumbnailUri(file://) 우선 → 없으면 원본 uri.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { usePhotoAI } from '../hooks/usePhotoAI';
import type { PhotoMeta, SpotGroup } from '../services/photoAI/types';

function formatSpan(start: number, end: number): string {
  const d = new Date(start);
  const date = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const t = (ms: number) => {
    const x = new Date(ms);
    return `${String(x.getHours()).padStart(2, '0')}:${String(
      x.getMinutes()
    ).padStart(2, '0')}`;
  };
  return start === end ? `${date} ${t(start)}` : `${date} ${t(start)}~${t(end)}`;
}

function SpotCard({
  group,
  photosById,
}: {
  group: SpotGroup;
  photosById: Record<string, PhotoMeta>;
}) {
  const bestIds = group.bestCutIds ?? [];
  if (bestIds.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{formatSpan(group.startTime, group.endTime)}</Text>
        <Text style={styles.cardMeta}>
          {group.photoIds.length}장 중 {bestIds.length}장 추천
        </Text>
      </View>
      <View style={styles.thumbRow}>
        {bestIds.map((id) => {
          const p = photosById[id];
          const src = p?.thumbnailUri ?? p?.uri;
          if (!src) return null;
          return (
            <Image key={id} source={{ uri: src }} style={styles.thumb} resizeMode="cover" />
          );
        })}
      </View>
    </View>
  );
}

export default function BestCutScreen() {
  const {
    loading,
    analyzing,
    groups,
    photosById,
    error,
    lastMessage,
    analyzeNow,
    enableBackground,
    disableBackground,
  } = usePhotoAI();

  const [bgOn, setBgOn] = useState(false);

  const toggleBackground = async (next: boolean) => {
    setBgOn(next);
    const ok = next ? await enableBackground() : (await disableBackground(), true);
    if (!ok) setBgOn(false); // 등록 실패(권한/제한) 시 롤백
  };

  const recommendedGroups = groups.filter((g) => (g.bestCutIds?.length ?? 0) > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>AI 베스트컷</Text>
        <Text style={styles.subtitle}>여행 사진 중 가장 잘 나온 순간을 골라드려요</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.analyzeBtn, analyzing && styles.analyzeBtnDisabled]}
          onPress={analyzeNow}
          disabled={analyzing}
        >
          {analyzing ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.analyzeBtnText}>지금 분석</Text>
          )}
        </Pressable>

        <View style={styles.bgToggle}>
          <Text style={styles.bgToggleLabel}>백그라운드 자동 분석</Text>
          <Switch
            value={bgOn}
            onValueChange={toggleBackground}
            trackColor={{ false: Colors.dotInactive, true: Colors.primary }}
            thumbColor={Colors.white}
          />
        </View>
      </View>

      {lastMessage && <Text style={styles.notice}>{lastMessage}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : recommendedGroups.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            아직 추천이 없어요.{'\n'}'지금 분석'을 눌러 갤러리를 분석해 보세요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recommendedGroups}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => <SpotCard group={item} photosById={photosById} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgDeep },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '700' },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  analyzeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeBtnDisabled: { opacity: 0.6 },
  analyzeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  bgToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bgToggleLabel: { color: Colors.textSecondary, fontSize: 13 },
  notice: { color: Colors.primaryLight, fontSize: 13, paddingHorizontal: 20, paddingBottom: 4 },
  errorText: { color: '#FF6B6B', fontSize: 13, paddingHorizontal: 20, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardMeta: { color: Colors.textMuted, fontSize: 12 },
  thumbRow: { flexDirection: 'row', gap: 8 },
  thumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: Colors.bgCardAlt,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
