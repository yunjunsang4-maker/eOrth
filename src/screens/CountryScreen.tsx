import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { CameraIcon } from '../components/icons';

const { width } = Dimensions.get('window');

const SAMPLE_RECORDS = [
  { id: '1', date: '2025.03.01 ~ 03.07', duration: '7일', rating: 5, memo: '벚꽃 시즌의 도쿄는 정말 환상적이었어. 신주쿠 어원에서의 피크닉이 최고.', photos: 16 },
  { id: '2', date: '2024.08.01 ~ 08.05', duration: '5일', rating: 4, memo: '오사카 도톤보리에서 타코야키를 실컷 먹었다.', photos: 24 },
  { id: '3', date: '2023.11.10 ~ 11.15', duration: '5일', rating: 5, memo: '교토의 단풍은 평생 잊지 못할 것 같다.', photos: 32 },
];

interface Props {
  navigation: any;
  route: any;
}

export default function CountryScreen({ navigation, route }: Props) {
  const country = route.params ?? { name: '일본', flag: '🇯🇵' };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.countryFlag}>{country.flag}</Text>
          <Text style={styles.countryName}>{country.name}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>회 방문</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>17</Text>
            <Text style={styles.statLabel}>전체 일수</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.gold }]}>4.7</Text>
            <Text style={styles.statLabel}>평균 별점</Text>
          </View>
        </View>

        {/* Globe mini display */}
        <View style={styles.miniGlobeSection}>
          <View style={styles.miniGlowRing} />
          <LinearGradient
            colors={['#3B1E8E', '#7B61FF', '#C084FC']}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.8, y: 0.9 }}
            style={styles.miniGlobe}
          >
            <View style={styles.latLine} />
            <View style={[styles.latLine, { top: '55%' }]} />
            <View style={styles.lonLine} />
          </LinearGradient>
          {/* Glowing dot */}
          <View style={styles.activeDot}>
            <Text style={{ fontSize: 18 }}>{country.flag}</Text>
          </View>
        </View>

        {/* Records */}
        <View style={styles.recordsSection}>
          <Text style={styles.sectionTitle}>여행 기록</Text>
          {SAMPLE_RECORDS.map((rec) => (
            <View key={rec.id} style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <Text style={styles.recordDate}>{rec.date} · {rec.duration}</Text>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>{'★'.repeat(rec.rating)}</Text>
                </View>
              </View>
              <Text style={styles.recordMemo} numberOfLines={2}>{rec.memo}</Text>
              <View style={styles.recordFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><CameraIcon size={12} color="#A1A1B0" /><Text style={styles.photoCount}>사진 {rec.photos}장 발견</Text></View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add record button */}
      <View style={styles.bottomBtn}>
        <TouchableOpacity style={styles.addRecordBtn} activeOpacity={0.85}>
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.addRecordGrad}>
            <Text style={styles.addRecordText}>+ 새 기록 추가</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[4],
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backIcon: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  countryFlag: { fontSize: 28 },
  countryName: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[6],
    gap: Spacing[3],
    marginBottom: Spacing[6],
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },

  miniGlobeSection: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: Spacing[6],
  },
  miniGlowRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(123,97,255,0.08)',
  },
  miniGlobe: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 15,
  },
  latLine: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  lonLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activeDot: {
    position: 'absolute',
    top: '25%',
    right: '25%',
  },

  recordsSection: {
    paddingHorizontal: Spacing[6],
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[4],
  },
  recordCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing[5],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  recordDate: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ratingText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gold,
  },
  recordMemo: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: Spacing[3],
  },
  recordFooter: {},
  photoCount: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },

  bottomBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 40,
    paddingTop: Spacing[3],
    backgroundColor: 'rgba(10,1,24,0.9)',
  },
  addRecordBtn: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  addRecordGrad: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  addRecordText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
  },
});
