import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { TravelRecord, RecordViewType } from '../store/recordStore';
import { CameraIcon } from '../components/icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  record: TravelRecord;
  viewType: RecordViewType;
  onClose?: () => void;
}

// ─────────────────────────────────────────────
// 별점 표시
// ─────────────────────────────────────────────
function StarRow({ rating, size = 14 }: { rating?: number; size?: number }) {
  if (!rating) return null;
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={[styles.star, { fontSize: size, color: s <= rating ? '#FBBF24' : '#3A3A55' }]}>
          ★
        </Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
// 1. Feed
// ─────────────────────────────────────────────
function FeedView({ record }: { record: TravelRecord }) {
  const firstMedia = record.medias?.[0];

  return (
    <View style={styles.feedCard}>
      {/* 사진 영역 (16:9) */}
      {firstMedia ? (
        <Image source={{ uri: firstMedia }} style={styles.feedImage} resizeMode="cover" />
      ) : (
        <View style={styles.feedImagePlaceholder}>
          <Text style={styles.placeholderIcon}>🏔️</Text>
        </View>
      )}

      {/* 본문 */}
      <View style={styles.feedBody}>
        {/* 국가 + 날짜 */}
        <View style={styles.feedMeta}>
          <Text style={styles.feedCountry}>{record.countryFlag} {record.countryName}</Text>
          <Text style={styles.feedDate}>{record.date}</Text>
        </View>

        {/* 제목 */}
        <Text style={styles.feedTitle} numberOfLines={2}>{record.content}</Text>

        {/* 메모 */}
        {record.memo ? (
          <Text style={styles.feedMemo} numberOfLines={3}>{record.memo}</Text>
        ) : null}

        {/* 하단: 별점 + 동행자 */}
        <View style={styles.feedFooter}>
          <StarRow rating={record.rating} size={14} />
          {record.companions && record.companions.length > 0 && (
            <Text style={styles.feedCompanions}>
              👥 {record.companions.slice(0, 2).join(', ')}
              {record.companions.length > 2 ? ` 외 ${record.companions.length - 2}명` : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// 2. Blog
// ─────────────────────────────────────────────
function BlogView({ record }: { record: TravelRecord }) {
  return (
    <View style={styles.blogWrap}>
      {/* 국가 + 날짜 헤더 */}
      <View style={styles.blogHeader}>
        <Text style={styles.blogCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.blogDate}>{record.date}</Text>
      </View>

      {/* 별점 */}
      <StarRow rating={record.rating} size={16} />

      {/* 본문 */}
      <Text style={styles.blogContent}>{record.content}</Text>

      {/* 메모 */}
      {record.memo ? (
        <View style={styles.blogMemoCard}>
          <Text style={styles.blogMemoLabel}>메모</Text>
          <Text style={styles.blogMemoText}>{record.memo}</Text>
        </View>
      ) : null}

      {/* 키워드 */}
      {record.keywords && record.keywords.length > 0 && (
        <View style={styles.blogKeywords}>
          {record.keywords.map((kw, i) => (
            <View key={i} style={styles.blogKeywordTag}>
              <Text style={styles.blogKeywordText}>#{kw}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 동행자 */}
      {record.companions && record.companions.length > 0 && (
        <Text style={styles.blogCompanions}>
          👥 {record.companions.join(', ')}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// 3. Album
// ─────────────────────────────────────────────
const ALBUM_CELL = (SCREEN_W - 4) / 3;

function AlbumView({ record }: { record: TravelRecord }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const medias = record.medias ?? [];

  return (
    <View style={styles.albumWrap}>
      {/* 헤더 카드 */}
      <View style={styles.albumHeader}>
        <View style={styles.albumHeaderLeft}>
          <Text style={styles.albumFlag}>{record.countryFlag}</Text>
          <View>
            <Text style={styles.albumCountry}>{record.countryName}</Text>
            <Text style={styles.albumDate}>{record.date}</Text>
          </View>
        </View>
        <StarRow rating={record.rating} size={14} />
      </View>

      {/* 3열 그리드 */}
      <View style={styles.albumGrid}>
        {medias.length > 0 ? (
          medias.map((uri, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setLightboxIdx(i)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri }}
                style={{ width: ALBUM_CELL, height: ALBUM_CELL, backgroundColor: '#1A0A2E' }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.albumEmpty}>
            <CameraIcon size={48} color="#A1A1B0" />
            <Text style={styles.albumEmptyText}>사진이 없어요</Text>
          </View>
        )}
      </View>

      {/* 라이트박스 */}
      <Modal visible={lightboxIdx !== null} transparent animationType="fade">
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxIdx(null)}>
            <Text style={styles.lightboxCloseText}>✕</Text>
          </TouchableOpacity>
          {lightboxIdx !== null && medias[lightboxIdx] && (
            <Image
              source={{ uri: medias[lightboxIdx] }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          {/* 이전 / 다음 */}
          <View style={styles.lightboxNav}>
            <TouchableOpacity
              onPress={() => setLightboxIdx((p) => (p !== null && p > 0 ? p - 1 : p))}
              style={styles.lightboxNavBtn}
            >
              <Text style={styles.lightboxNavText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.lightboxNavCount}>
              {(lightboxIdx ?? 0) + 1} / {medias.length}
            </Text>
            <TouchableOpacity
              onPress={() => setLightboxIdx((p) => (p !== null && p < medias.length - 1 ? p + 1 : p))}
              style={styles.lightboxNavBtn}
            >
              <Text style={styles.lightboxNavText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function TripRecordRenderer({ record, viewType, onClose }: Props) {
  switch (viewType) {
    case 'blog':
      return <BlogView record={record} />;
    case 'album':
      return <AlbumView record={record} />;
    case 'feed':
    default:
      return <FeedView record={record} />;
  }
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  starRow: { flexDirection: 'row', gap: 2 },
  star: { lineHeight: 18 },

  placeholderIcon: { fontSize: 48 },

  // ── Feed ──
  feedCard: {
    backgroundColor: '#0A0A0F',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
  },
  feedImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1A0A2E',
  },
  feedImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedBody: {
    padding: 16,
    gap: 8,
  },
  feedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BF85FC',
  },
  feedDate: {
    fontSize: 11,
    color: '#A1A1B0',
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  feedMemo: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 20,
  },
  feedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  feedCompanions: {
    fontSize: 12,
    color: '#A1A1B0',
  },

  // ── Blog ──
  blogWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  blogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blogCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#BF85FC',
  },
  blogDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  blogContent: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  blogMemoCard: {
    backgroundColor: 'rgba(191,133,252,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#BF85FC',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  blogMemoLabel: {
    fontSize: 11,
    color: '#BF85FC',
    fontWeight: '600',
  },
  blogMemoText: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 20,
  },
  blogKeywords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  blogKeywordTag: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blogKeywordText: {
    fontSize: 11,
    color: '#A78BFA',
  },
  blogCompanions: {
    fontSize: 12,
    color: '#A1A1B0',
  },

  // ── Album ──
  albumWrap: {
    backgroundColor: '#0A0A0F',
    gap: 2,
  },
  albumHeader: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 0,
    marginBottom: 2,
  },
  albumHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  albumFlag: { fontSize: 32 },
  albumCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumDate: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 2,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  albumEmpty: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
  },
  albumEmptyText: {
    fontSize: 14,
    color: '#A1A1B0',
  },

  // ── Lightbox ──
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxCloseText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
  },
  lightboxNav: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  lightboxNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(191,133,252,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxNavText: {
    fontSize: 28,
    color: '#BF85FC',
    lineHeight: 32,
  },
  lightboxNavCount: {
    fontSize: 14,
    color: '#A1A1B0',
    minWidth: 60,
    textAlign: 'center',
  },
});
