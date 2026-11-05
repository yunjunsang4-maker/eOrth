import React, { useState, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Text } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { countryLabel } from '../utils/countryLabel';
import PhotoViewerModal from './PhotoViewerModal';
import AlbumTimeline from './AlbumTimeline';
import { effectiveMediaTimes } from '../utils/albumSections';
import { TravelRecord, RecordViewType } from '../store/recordStore';
import { CameraIcon } from '../components/icons';
import CutPhotoCanvas from './CutPhotoCanvas';
import { stageWidthNow } from '../utils/stage';

const SCREEN_W = stageWidthNow();

interface Props {
  record: TravelRecord;
  viewType: RecordViewType;
  onClose?: () => void;
  // 사진첩(앨범) 편집 — 내 기록 화면(TripRecordScreen)에서만 전달
  albumEditable?: boolean;
  onAlbumAddPhotos?: () => void;
  onAlbumStartSelect?: () => void; // 다중 선택 모드 진입 (삭제는 선택 액션 바에서)
  onAlbumSetCover?: (index: number) => void; // 뷰어에서 커버(여행카드 썸네일)로 지정 — medias 전역 인덱스
  onAlbumSetGlobeCover?: (index: number) => void; // 뷰어에서 유리 지구본 활성화 사진(국가 대표사진)으로 지정
  // 다중 선택 모드 — 탭이 선택 토글로 바뀌고 체크 오버레이 표시
  albumSelecting?: boolean;
  albumSelected?: number[];
  onAlbumToggleSelect?: (globalIndex: number) => void;
  onAlbumRemoveAt?: (globalIndex: number) => void; // 뷰어 액션 바 '삭제'
  onAlbumReanalyze?: () => void; // '날짜 다시 찾기' — 촬영시각 없는 사진만 다시 찾음
  albumReanalyzing?: boolean;
  onAlbumSelectIndexes?: (indexes: number[]) => void; // 날짜 줄 ⋯ '선택' — 그날 사진을 골라 둔 채 선택 모드로
  onAlbumOpenDay?: (dayKey: string) => void; // 날짜 줄 '>' — 그날 하루 보기(AlbumDayScreen)
  onAlbumAddPhotosForDay?: (dayKey: string) => void; // 날짜 줄 ⋯ '이 날 찍은 사진 추가' — 그날 기기 사진 격자(DateRangePhotoSheet)
  albumDayPlaces?: Record<string, string>; // 날짜 키 → 그날 장소 이름(메모리 값, 내 사진첩만)
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
  const { t, i18n } = useTranslation();
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
          <Text style={styles.feedCountry}>{record.countryFlag} {countryLabel(record.countryName, i18n.language)}</Text>
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
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.blogWrap}>
      {/* 국가 + 날짜 헤더 */}
      <View style={styles.blogHeader}>
        <Text style={styles.blogCountry}>{record.countryFlag} {countryLabel(record.countryName, i18n.language)}</Text>
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
// 3. Album — 촬영시각 세로 타임라인 (AlbumTimeline)
// 수동 섹션·꾹 눌러 끌기 재정렬은 2026-11 타임라인으로 대체돼 제거됐다.
// ─────────────────────────────────────────────
function AlbumView({ record, editable, onAddPhotos, onStartSelect, onSetCover, onSetGlobeCover, selecting, selected, onToggleSelect, onRemoveAt, onReanalyze, reanalyzing, onSelectIndexes, onOpenDay, onAddPhotosForDay, dayPlaces }: {
  record: TravelRecord;
  editable?: boolean;
  onAddPhotos?: () => void;
  onStartSelect?: () => void;
  onSetCover?: (index: number) => void;
  onSetGlobeCover?: (index: number) => void;
  selecting?: boolean;
  selected?: number[];
  onToggleSelect?: (globalIndex: number) => void;
  onRemoveAt?: (globalIndex: number) => void;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  onSelectIndexes?: (indexes: number[]) => void;
  onOpenDay?: (dayKey: string) => void;
  onAddPhotosForDay?: (dayKey: string) => void;
  dayPlaces?: Record<string, string>;
}) {
  const { t } = useTranslation();
  // 뷰어는 타임라인 표시 순서(order)로 넘긴다 — 뷰어 위치 at은 order 기준이라
  // 커버·지구본·삭제 콜백에 넘길 땐 order[at]으로 medias 전역 인덱스로 되돌린다.
  // order는 연 시점 스냅샷: 뷰어가 떠 있는 동안 medias가 바뀌는 건 삭제뿐이고, 삭제는 뷰어를 닫는다.
  const [viewer, setViewer] = useState<{ order: number[]; at: number } | null>(null);
  const medias = record.medias ?? [];
  // 업로드 캐시 역매핑까지 더한 촬영시각 — medias가 서버 URL로 바뀌어도 로컬 키 시각이 맞게 붙는다.
  // 재분석 대상(albumReanalyze)도 같은 함수를 써서 '날짜 미상'·버튼 노출·대상이 어긋나지 않는다.
  const mediaTimes = useMemo(
    () => effectiveMediaTimes({ mediaTimes: record.mediaTimes, uploadedMediaUrls: record.uploadedMediaUrls }),
    [record.mediaTimes, record.uploadedMediaUrls],
  );
  const toGlobal = (fn?: (index: number) => void) =>
    fn && viewer ? (i: number) => { const g = viewer.order[i]; if (g != null) fn(g); } : undefined;

  return (
    <View style={styles.albumWrap}>
      {/* 국가·기간 헤더 카드는 2026-11-03 시안에서 빠졌다 — 기간·장수는 TripRecordScreen 상단 정보 줄 */}

      {medias.length === 0 && !editable ? (
        <View style={styles.albumEmpty}>
          <CameraIcon size={48} color="#A1A1B0" />
          <Text style={styles.albumEmptyText}>{t('comp.noPhotos')}</Text>
        </View>
      ) : (
        <View style={styles.albumTimelineWrap}>
          <AlbumTimeline
            medias={medias}
            mediaTimes={mediaTimes}
            thumbs={record.thumbs}
            width={SCREEN_W}
            inset={16}
            onPressPhoto={(gi, order) => setViewer({ order, at: Math.max(0, order.indexOf(gi)) })}
            selecting={selecting}
            selected={selected}
            onToggleSelect={onToggleSelect}
            // 날짜 줄 ⋯ — 그날 사진 선택 / 이 날 찍은 사진 추가. 작은 선택지 둘이라 시스템 Alert로 띄운다(iOS·안드로이드 공통).
            // '날짜 미상' 줄은 고를 날짜가 없어 일반 '사진 추가'(onAddPhotos — 내 사진첩은 기록 기간 격자, 기간 없으면 시스템 선택기)
            onDayMenu={editable && (onSelectIndexes || onAddPhotos || onAddPhotosForDay) ? (indexes, label, dayKey) => {
              const forDay = dayKey !== 'undated' && onAddPhotosForDay;
              Alert.alert(label, undefined, [
                ...(onSelectIndexes ? [{ text: t('trip.albumSelect'), onPress: () => onSelectIndexes(indexes) }] : []),
                ...(forDay ? [{ text: t('trip.albumAddDayPhotos'), onPress: () => forDay(dayKey) }]
                  : onAddPhotos ? [{ text: t('comp.albumAddPhotos'), onPress: onAddPhotos }] : []),
                { text: t('common.cancel'), style: 'cancel' as const },
              ]);
            } : undefined}
            dayPlaces={dayPlaces}
            onOpenDay={onOpenDay}
            onReanalyze={editable ? onReanalyze : undefined}
            reanalyzing={reanalyzing}
          />
        </View>
      )}
      {editable && medias.length > 0 && !selecting && onStartSelect && (
        <TouchableOpacity style={styles.albumSelectBtn} onPress={onStartSelect} activeOpacity={0.8}>
          <Text style={styles.albumSelectBtnTxt}>✓ {t('trip.albumSelect')}</Text>
        </TouchableOpacity>
      )}

      {/* 전체화면 뷰어 — 스와이프 + 핀치 줌 + n/m. 내 사진첩이면 공유/저장/커버/삭제 액션 바 */}
      <PhotoViewerModal
        visible={viewer !== null}
        uris={viewer ? viewer.order.map((i) => medias[i]) : medias}
        initialIndex={viewer?.at ?? 0}
        onClose={() => setViewer(null)}
        showActions={editable}
        onSetGlobeCover={editable ? toGlobal(onSetGlobeCover) : undefined}
        onSetCover={editable ? toGlobal(onSetCover) : undefined}
        onDelete={editable ? toGlobal(onRemoveAt) : undefined}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// 4. Snap (BeReal 스타일)
// ─────────────────────────────────────────────
function SnapView({ record }: { record: TravelRecord }) {
  const { t, i18n } = useTranslation();
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
        <Text style={styles.snapCountry}>{record.countryFlag} {countryLabel(record.countryName, i18n.language)}</Text>
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
  const { t, i18n } = useTranslation();
  const photos = record.cutPhoto?.photos ?? [];
  return (
    <View style={styles.cutWrap}>
      {/* 헤더 */}
      <View style={styles.cutHeader}>
        <Text style={styles.cutCountry}>{record.countryFlag} {countryLabel(record.countryName, i18n.language)}</Text>
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
export default function TripRecordRenderer({ record, viewType, onClose, albumEditable, onAlbumAddPhotos, onAlbumStartSelect, onAlbumSetCover, onAlbumSetGlobeCover, albumSelecting, albumSelected, onAlbumToggleSelect, onAlbumRemoveAt, onAlbumReanalyze, albumReanalyzing, onAlbumSelectIndexes, onAlbumOpenDay, onAlbumAddPhotosForDay, albumDayPlaces }: Props) {
  switch (viewType) {
    case 'blog':
      return <BlogView record={record} />;
    case 'album':
      return (
        <AlbumView
          record={record}
          editable={albumEditable}
          onAddPhotos={onAlbumAddPhotos}
          onStartSelect={onAlbumStartSelect}
          onSetCover={onAlbumSetCover}
          onSetGlobeCover={onAlbumSetGlobeCover}
          selecting={albumSelecting}
          selected={albumSelected}
          onToggleSelect={onAlbumToggleSelect}
          onRemoveAt={onAlbumRemoveAt}
          onReanalyze={onAlbumReanalyze}
          reanalyzing={albumReanalyzing}
          onSelectIndexes={onAlbumSelectIndexes}
          onOpenDay={onAlbumOpenDay}
          onAddPhotosForDay={onAlbumAddPhotosForDay}
          dayPlaces={albumDayPlaces}
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
  // 시안: 상단 정보 줄 아래 30 → 첫 날짜 줄
  albumTimelineWrap: {
    paddingTop: 30,
  },
  albumSelectBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  albumSelectBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
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
