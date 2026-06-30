import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { CameraIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import type { RootStackScreenProps } from '../navigation/types';

type Props = RootStackScreenProps<'Country'>;

// 'YYYY.MM.DD' → Date (실패 시 null)
const parseDmy = (s?: string): Date | null => {
  if (!s) return null;
  const m = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
// 여행 일수 (start~end, 양끝 포함)
const tripDays = (start?: string, end?: string): number => {
  const a = parseDmy(start), b = parseDmy(end);
  if (a && b) return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return start || end ? 1 : 0;
};

export default function CountryScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const country = route.params ?? { name: '일본', flag: '🇯🇵' };

  // 이 국가의 내 실제 여행 기록으로 통계·목록 구성 (데모 시드 제거)
  const { records } = useRecords();
  const countryRecords = records.filter(
    (r) => r.isMyPost !== false && r.countryName === country.name
  );
  const visitCount = countryRecords.length;
  const ratings = countryRecords
    .map((r) => r.rating)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '-';
  const totalDays = countryRecords.reduce((sum, r) => sum + tripDays(r.startDate, r.endDate), 0);

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
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
            <Text style={styles.statValue}>{visitCount}</Text>
            <Text style={styles.statLabel}>{t('misc.countryVisitCount')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalDays}</Text>
            <Text style={styles.statLabel}>{t('misc.countryTotalDays')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.gold }]}>{avgRating}</Text>
            <Text style={styles.statLabel}>{t('misc.countryAvgRating')}</Text>
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
          <Text style={styles.sectionTitle}>{t('friends.travelRecords')}</Text>
          {countryRecords.length === 0 ? (
            <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 28 }}>
              이 국가의 여행 기록이 아직 없어요
            </Text>
          ) : countryRecords.map((rec) => {
            const days = tripDays(rec.startDate, rec.endDate);
            const dateText = rec.startDate && rec.endDate ? `${rec.startDate} ~ ${rec.endDate}` : (rec.date ?? '');
            const photoCount = rec.medias?.length ?? 0;
            return (
              <View key={rec.id} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordDate}>{dateText}{days > 0 ? ` · ${days}일` : ''}</Text>
                  {!!rec.rating && rec.rating > 0 && (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingText}>{'★'.repeat(rec.rating)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.recordMemo} numberOfLines={2}>{rec.content}</Text>
                {photoCount > 0 && (
                  <View style={styles.recordFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><CameraIcon size={12} color="#A1A1B0" /><Text style={styles.photoCount}>{t('misc.photoCountN', { count: photoCount })}</Text></View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add record button */}
      <View style={styles.bottomBtn}>
        <TouchableOpacity style={styles.addRecordBtn} activeOpacity={0.85}>
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.addRecordGrad}>
            <Text style={styles.addRecordText}>+ {t('comp2.addNewRecord')}</Text>
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
