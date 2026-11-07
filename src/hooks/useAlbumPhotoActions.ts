/**
 * 사진첩(앨범) 사진 액션 — 삭제·커버(대표 사진) 지정·유리 지구본 사진 지정.
 * TripRecordScreen에 있던 doDeletePhotos·handleSetCover·handleSetGlobeCover·handleViewerDelete를 동작 그대로 옮긴 것이다 —
 * 사진첩 화면(뷰어 액션 바·다중 삭제)과 하루 보기(AlbumDayScreen 뷰어 액션 바)가 같은 결과를 내야 해서 화면 밖으로 꺼냈다.
 * 규칙이 두 벌로 갈리면 한쪽만 고쳐지는 사고가 난다(대표 사진 승계·여행카드 coverUri 동기화).
 *
 * 인덱스는 전부 record.medias 전역 인덱스 — 뷰어 순서(타임라인·그날 순서)에서 되돌리는 건 호출부 몫이다.
 * record는 스토어 최신본을 넘길 것(화면이 records.find(...) ?? paramRecord로 고른 값).
 */
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { warn } from '../utils/haptics';
import { removePhotosAt } from '../utils/albumSections';
import { countryLabel } from '../utils/countryLabel';
import { useRecordData, useRecordActions, type TravelRecord } from '../store/recordStore';

export function useAlbumPhotoActions(record: TravelRecord) {
  const { t, i18n } = useTranslation();
  const { tripGroups } = useRecordData();
  const { updateRecord, updateTripGroup, setCountryCover } = useRecordActions();
  const medias = record.medias ?? [];

  // 사진 제거 공용(단일/다중) — 대표 사진 승계 + 여행카드 커버 동기화
  const deletePhotos = (indexes: number[]) => {
    const nextMedias = removePhotosAt(medias, indexes);
    const rm = new Set(indexes);
    const coverDeleted = !!record.representativePhoto && medias.some((u, i) => rm.has(i) && u === record.representativePhoto);
    const nextRep = coverDeleted ? nextMedias[0] : record.representativePhoto;
    updateRecord(record.id, { medias: nextMedias, representativePhoto: nextRep });
    // 여행카드 썸네일은 group.coverUri(크롭본 등 오버라이드)를 최우선으로 쓰므로,
    // 대표 사진이 바뀌면 이 기록을 커버로 쓰는 카드의 coverUri도 새 대표로 동기화(스테일 방지)
    if (coverDeleted) {
      tripGroups
        .filter((g) => g.coverRecordId === record.id && g.coverUri)
        .forEach((g) => updateTripGroup(g.id, { coverUri: nextRep }));
    }
  };

  // 뷰어에서 커버(대표 사진) 지정 — 이 앨범을 커버로 쓰는 여행카드 썸네일(크롭 오버라이드 포함)도 동기화
  const setCover = (index: number) => {
    const uri = medias[index];
    if (!uri) return;
    updateRecord(record.id, { representativePhoto: uri, representativePhotoSource: uri });
    tripGroups
      .filter((g) => g.coverRecordId === record.id && g.coverUri)
      .forEach((g) => updateTripGroup(g.id, { coverUri: uri }));
    Alert.alert(t('trip.albumCoverSet'));
  };

  // 뷰어에서 유리 지구본 활성화 사진 지정 — 그 나라 대표사진 핀(countryCovers)을 이 사진으로 고정한다.
  // 핀은 getCountryPhoto에서 최신순 폴백보다 우선하므로, 이후 새 기록이 생겨도 이 사진이 유지된다.
  const setGlobeCover = (index: number) => {
    const uri = medias[index];
    if (!uri) return;
    // 다국가 기록이면 어느 나라의 지구본 사진으로 쓸지 고른다(핀은 나라 단위라 한 번에 하나).
    const names = (record.countries?.length ? record.countries.map((c) => c.name) : [record.countryName]).filter(Boolean);
    const apply = (name: string) => {
      setCountryCover(name, record.id, uri);
      Alert.alert(t('trip.globeCoverSet', { country: countryLabel(name, i18n.language) }));
    };
    if (names.length <= 1) {
      if (names[0]) apply(names[0]);
      return;
    }
    Alert.alert(t('trip.globeCoverPickTitle'), t('trip.globeCoverPickBody'), [
      ...names.map((n) => ({ text: countryLabel(n, i18n.language), onPress: () => apply(n) })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  // 뷰어 액션 바 '삭제' — 단일 사진(index는 medias 전역 인덱스, 호출부가 뷰어 순서에서 되돌려 준다)
  const confirmDeletePhoto = (globalIndex: number) => {
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('trip.albumDeletePhotoTitle'), t('trip.albumDeletePhotoMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.delete'), style: 'destructive', onPress: () => deletePhotos([globalIndex]) },
    ]);
  };

  return { deletePhotos, setCover, setGlobeCover, confirmDeletePhoto };
}
