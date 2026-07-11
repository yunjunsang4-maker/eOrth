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
import { useTranslation } from 'react-i18next';
import PhotoViewerModal from './PhotoViewerModal';
import { sectionSlices } from '../utils/albumSections';
import { TravelRecord, RecordViewType } from '../store/recordStore';
import { CameraIcon } from '../components/icons';
import CutPhotoCanvas from './CutPhotoCanvas';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  record: TravelRecord;
  viewType: RecordViewType;
  onClose?: () => void;
  // 사진첩(앨범) 편집 — 내 기록 화면(TripRecordScreen)에서만 전달
  albumEditable?: boolean;
  onAlbumAddPhotos?: (sectionIndex?: number) => void;
  onAlbumPhotoAction?: (index: number) => void; // 길게 누르기: 이동/삭제
  onAlbumAddSection?: () => void;
  onAlbumSectionMenu?: (sectionIndex: number) => void; // 헤더 ⋯: 이름변경/삭제
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
  const { t } = useTranslation();
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
              {record.companions.length > 2 ? t('comp.andMore', { count: record.companions.length - 2 }) : ''}
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
  const { t } = useTranslation();
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
          <Text style={styles.blogMemoLabel}>{t('comp.memo')}</Text>
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

function AlbumView({ record, editable, onAddPhotos, onPhotoAction, onAddSection, onSectionMenu }: {
  record: TravelRecord;
  editable?: boolean;
  onAddPhotos?: (sectionIndex?: number) => void;
  onPhotoAction?: (index: number) => void;
  onAddSection?: () => void;
  onSectionMenu?: (sectionIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const medias = record.medias ?? [];
  // 섹션(세분화) — medias의 연속 구간 분할. 없으면 평면 그리드.
  const slices = record.albumSections && record.albumSections.length > 0
    ? sectionSlices(record.albumSections, medias.length)
    : null;

  const photoTile = (uri: string, globalIdx: number) => (
    <TouchableOpacity
      key={`${uri}-${globalIdx}`}
      onPress={() => setLightboxIdx(globalIdx)}
      onLongPress={editable && onPhotoAction ? () => onPhotoAction(globalIdx) : undefined}
      delayLongPress={350}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri }}
        style={{ width: ALBUM_CELL, height: ALBUM_CELL, backgroundColor: '#1A0A2E' }}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

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

      {slices ? (
        /* ── 섹션 모드 — 섹션별 헤더 + 그리드 ── */
        <>
          {slices.map((sec, si) => (
            <View key={sec.id}>
              <View style={styles.albumSectionHeader}>
                <Text style={styles.albumSectionTitle}>{sec.title}</Text>
                <Text style={styles.albumSectionCount}>{sec.count}</Text>
                <View style={{ flex: 1 }} />
                {editable && onAddPhotos && (
                  <TouchableOpacity style={styles.albumSectionBtn} onPress={() => onAddPhotos(si)} accessibilityRole="button" accessibilityLabel={t('comp.albumAddPhotos')}>
                    <Text style={styles.albumSectionBtnTxt}>＋</Text>
                  </TouchableOpacity>
                )}
                {editable && onSectionMenu && (
                  <TouchableOpacity style={styles.albumSectionBtn} onPress={() => onSectionMenu(si)} accessibilityRole="button">
                    <Text style={styles.albumSectionBtnTxt}>⋯</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.albumGrid}>
                {medias.slice(sec.start, sec.end).map((uri, i) => photoTile(uri, sec.start + i))}
                {sec.count === 0 && (
                  <Text style={styles.albumSectionEmpty}>{t('comp.albumSectionEmpty')}</Text>
                )}
              </View>
            </View>
          ))}
          {editable && onAddSection && (
            <TouchableOpacity style={styles.albumSectionAdd} onPress={onAddSection} activeOpacity={0.8}>
              <Text style={styles.albumSectionAddTxt}>＋ {t('comp.albumAddSection')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        /* ── 평면 그리드 ── */
        <>
          <View style={styles.albumGrid}>
            {medias.map((uri, i) => photoTile(uri, i))}
            {editable && onAddPhotos && (
              <TouchableOpacity style={styles.albumAddTile} onPress={() => onAddPhotos()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('comp.albumAddPhotos')}>
                <Text style={styles.albumAddPlus}>＋</Text>
                <Text style={styles.albumAddLabel}>{t('comp.albumAddPhotos')}</Text>
              </TouchableOpacity>
            )}
            {medias.length === 0 && !editable && (
              <View style={styles.albumEmpty}>
                <CameraIcon size={48} color="#A1A1B0" />
                <Text style={styles.albumEmptyText}>{t('comp.noPhotos')}</Text>
              </View>
            )}
          </View>
          {editable && onAddSection && medias.length > 0 && (
            <TouchableOpacity style={styles.albumSectionAdd} onPress={onAddSection} activeOpacity={0.8}>
              <Text style={styles.albumSectionAddTxt}>🗂 {t('comp.albumMakeSections')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* 전체화면 뷰어 — 스와이프 + 핀치 줌 + n/m */}
      <PhotoViewerModal
        visible={lightboxIdx !== null}
        uris={medias}
        initialIndex={lightboxIdx ?? 0}
        onClose={() => setLightboxIdx(null)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// 4. Snap (BeReal 스타일)
// ─────────────────────────────────────────────
function SnapView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  const lateText = (() => {
    if (!record.snapLateSeconds || record.snapLateSeconds <= 0) return null;
    const s = record.snapLateSeconds;
    if (s < 60) return t('comp.snapLateSec', { s });
    return t('comp.snapLateMin', { m: Math.floor(s / 60), s: s % 60 });
  })();

  return (
    <View style={styles.snapWrap}>
      {/* 헤더 */}
      <View style={styles.snapHeader}>
        <Text style={styles.snapCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.snapDate}>{record.date}</Text>
      </View>

      {/* 사진 영역 */}
      <View style={styles.snapPhotoArea}>
        {/* 후면 사진 (메인) */}
        <View style={styles.snapBackPhoto}>
          {record.snapBackUri ? (
            <Image source={{ uri: record.snapBackUri }} style={styles.snapBackImg} resizeMode="cover" />
          ) : (
            <View style={styles.snapPlaceholderBg}>
              <Text style={styles.snapPlaceholderEmoji}>📸</Text>
            </View>
          )}
        </View>

        {/* 전면 사진 (PIP) */}
        {record.snapFrontUri ? (
          <View style={styles.snapPipWrap}>
            <Image source={{ uri: record.snapFrontUri }} style={styles.snapPipImg} resizeMode="cover" />
          </View>
        ) : (
          <View style={styles.snapPipWrap}>
            <View style={styles.snapPipPlaceholder}>
              <Text style={{ fontSize: 16 }}>🤳</Text>
            </View>
          </View>
        )}

        {/* 촬영 지연 뱃지 */}
        {lateText && (
          <View style={styles.snapLateBadge}>
            <Text style={styles.snapLateBadgeText}>⏱ {lateText}</Text>
          </View>
        )}
      </View>

      {/* 캡션 */}
      {record.snapCaption ? (
        <Text style={styles.snapCaption}>{record.snapCaption}</Text>
      ) : null}

      {/* 별점 */}
      {record.rating ? (
        <View style={{ marginTop: 8 }}>
          <StarRow rating={record.rating} size={14} />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// 5. Cut (스트립)
// ─────────────────────────────────────────────
function CutView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  const photos = record.cutPhoto?.photos ?? [];
  return (
    <View style={styles.cutWrap}>
      {/* 헤더 */}
      <View style={styles.cutHeader}>
        <Text style={styles.cutCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.cutDate}>{record.date}</Text>
      </View>

      {/* 스트립 캔버스 */}
      {record.cutPhoto ? (
        <View style={styles.cutCanvasWrap}>
          <CutPhotoCanvas
            frameId={record.cutPhoto.frameId}
            photos={photos}
            transforms={record.cutPhoto.transforms}
            width={SCREEN_W - 32}
            bgOverride={record.cutPhoto.frameColor}
            bgImageOverride={record.cutPhoto.frameImage}
            capture
            showLogo={!record.cutPhoto.noLogo}
            stamp={record.cutPhoto.stamp}
          />
        </View>
      ) : (
        <View style={styles.cutEmpty}>
          <Text style={{ fontSize: 48 }}>🎞️</Text>
          <Text style={styles.cutEmptyText}>{t('comp.noCut')}</Text>
        </View>
      )}

      {/* 설명 */}
      {record.content ? (
        <Text style={styles.cutContent}>{record.content}</Text>
      ) : null}

      {/* 별점 */}
      {record.rating ? (
        <View style={{ marginTop: 8 }}>
          <StarRow rating={record.rating} size={14} />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function TripRecordRenderer({ record, viewType, onClose, albumEditable, onAlbumAddPhotos, onAlbumPhotoAction, onAlbumAddSection, onAlbumSectionMenu }: Props) {
  switch (viewType) {
    case 'blog':
      return <BlogView record={record} />;
    case 'album':
      return (
        <AlbumView
          record={record}
          editable={albumEditable}
          onAddPhotos={onAlbumAddPhotos}
          onPhotoAction={onAlbumPhotoAction}
          onAddSection={onAlbumAddSection}
          onSectionMenu={onAlbumSectionMenu}
        />
      );
    case 'snap':
      return <SnapView record={record} />;
    case 'cut':
      return <CutView record={record} />;
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
  albumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  albumSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumSectionCount: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  albumSectionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  albumSectionBtnTxt: {
    fontSize: 15,
    color: '#A1A1B0',
    lineHeight: 18,
  },
  albumSectionEmpty: {
    fontSize: 12,
    color: '#5A5A6E',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  albumSectionAdd: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  albumSectionAddTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1B0',
  },
  albumAddTile: {
    width: ALBUM_CELL,
    height: ALBUM_CELL,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  albumAddPlus: {
    fontSize: 26,
    color: '#A1A1B0',
    lineHeight: 30,
  },
  albumAddLabel: {
    fontSize: 11,
    color: '#A1A1B0',
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

  // ── Snap ──
  snapWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  snapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snapCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD60A',
  },
  snapDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  snapPhotoArea: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#1C1C28',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  snapBackPhoto: {
    width: '100%',
    height: '100%',
  },
  snapBackImg: {
    width: '100%',
    height: '100%',
  },
  snapPlaceholderBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapPlaceholderEmoji: {
    fontSize: 48,
  },
  snapPipWrap: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: '28%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0A0A0F',
    overflow: 'hidden',
    backgroundColor: '#1E1E2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  snapPipImg: {
    width: '100%',
    height: '100%',
  },
  snapPipPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapLateBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(255,214,10,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  snapLateBadgeText: {
    color: '#0A0A0F',
    fontSize: 11,
    fontWeight: '700',
  },
  snapCaption: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // ── Cut ──
  cutWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  cutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cutCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#BF85FC',
  },
  cutDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  cutCanvasWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutEmpty: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1C28',
    borderRadius: 16,
  },
  cutEmptyText: {
    fontSize: 14,
    color: '#A1A1B0',
  },
  cutContent: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
});
