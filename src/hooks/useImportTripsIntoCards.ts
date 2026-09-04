/**
 * 스캔된 여행(ScannedTrip) → 여행 카드 생성. 과거여행 불러오기(TravelImportScreen.handleImport)의
 * 저장 단계를 그대로 옮긴 것이다 — 체류 중 주변국 여행 제안 배너가 같은 결과물을 만들어야
 * 해서 화면 밖으로 꺼냈다. 저장 규칙이 둘로 갈라지면 한쪽만 고쳐지는 사고가 난다.
 *
 * 순서(불변): classifyImportTarget → 표지 1장 복사 → addImportedAlbum → (체류 흡수 | 여행 그룹) → 사진 풀 보관
 * 화면 관심사(진행 UI·네비게이션·Alert·lastImportAt)는 호출부에 남긴다.
 */
import { useCallback, useRef } from 'react';
import { COUNTRIES } from '../constants/countries';
import { useSettings } from '../store/settingsStore';
import { useRecords, type TravelRecord } from '../store/recordStore';
import type { ScannedTrip } from '../utils/pastTripScan';
import { copyTripCover } from '../utils/importPhotoStore';
import { classifyImportTarget } from '../utils/importRouting';
import { pickCoverCandidates, saveTripPool } from '../utils/tripPhotoPool';

// 썸네일 후보 수. 무작위로 뽑은 사진은 iCloud 오프로드·content:// 자산 등으로 확보에
// 실패할 수 있어 넉넉히 받아 두고 순서대로 시도한다(전부 실패해도 카드는 만든다).
// 3장이었을 땐 그 여행 사진이 대부분 오프로드된 사용자에게서 전부 실패해 목업 카드가 됐다.
export const COVER_COPY_TRIES = 8;

export interface ImportTripsResult {
  tripCount: number;                       // 새로 만든 여행 카드 수(체류 흡수분 제외)
  photoCount: number;                      // 카드에 연결해 둔(=바로 꺼내 쓸 수 있는) 분석 사진 총 장수
  countries: { flag: string; name: string }[];
  // 썸네일 확보 실패 사유 모음 — 개발 빌드에서만 화면에 띄운다.
  // 이 실패는 조용히 지나가면 "카드는 생겼는데 목업 사진"으로만 보여서 원인을 못 찾는다.
  coverErrors: string[];
  created: { record: TravelRecord; tripGroupId: string | null }[];
}

export function useImportTripsIntoCards() {
  const { homeCountryCode } = useSettings();
  const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
  // 체류 카드는 이 콜백이 만들어진 렌더가 아니라 '호출 시점'의 것이어야 한다.
  // useCallback 의존성에 넣으면 스캔 중 체류가 바뀔 때마다 콜백이 새로 만들어져
  // 호출부의 참조가 흔들린다 — 대신 ref로 최신 값을 본다(원본 화면의 클로저와 같은 값).
  const stayRef = useRef(activeStayGroup);
  stayRef.current = activeStayGroup;

  return useCallback(async (
    trips: ScannedTrip[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<ImportTripsResult> => {
    let tripCount = 0;
    let photoCount = 0;
    const countries: { flag: string; name: string }[] = [];
    const coverErrors: string[] = [];
    const created: ImportTripsResult['created'] = [];
    const homeCountryName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;
    // 루프 전체가 같은 체류 카드를 본다 — 원본 화면이 렌더 클로저 값을 끝까지 쓰던 것과 동일
    const stay = stayRef.current;
    const stayCountryName = stay?.stay?.status !== 'ended' ? (stay?.countryName ?? null) : null;

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      onProgress?.(i, trips.length);

      // 갈 곳을 먼저 정한다 — 거주국(skip)이면 기록을 만들지 않는다.
      // (기록부터 만들고 나중에 건너뛰면 어느 카드에도 안 붙은 기록이 남는다)
      const target = classifyImportTarget(trip.countryName, homeCountryName, stayCountryName);
      if (target === 'skip') continue; // clusterForeignTrips가 이미 제외 — 방어적으로 무시

      // 썸네일 — 분석된 사진 중 무작위 1장. (AI 판정이 들어오면 이 선택만 교체하면 된다)
      // 후보 순서도 무작위다. 실패해서 다음 후보로 넘어갈 때 옆 인덱스를 쓰면 방금 실패한
      // 사진과 거의 같은 장면이 나와, 같은 이유로 또 실패한다.
      const cover = await copyTripCover(
        trip.id,
        pickCoverCandidates(trip.photos, COVER_COPY_TRIES).map((c) => ({ id: c.id, uri: c.uri, localUri: c.localUri })),
      );
      const coverUri = cover.uri ?? undefined;
      // 후보를 전부 실패해도 카드는 만든다 — 썸네일 없는 카드가, 여행이 통째로 안 들어오는 것보다 낫다
      // (그 경우 프로필 카드는 이모지+그라데이션 기본 배경으로 떨어진다)
      if (!coverUri && cover.error) coverErrors.push(`${trip.countryName}: ${cover.error}`);
      const coverSrc = cover.source
        ? trip.photos.find((p) => p.uri === cover.source!.uri)
        : undefined;

      const mediaAssetIds: Record<string, string> = {};
      const mediaTimes: Record<string, number> = {};
      if (coverUri && coverSrc?.id) mediaAssetIds[coverUri] = coverSrc.id;
      if (coverUri && coverSrc?.creationTime) mediaTimes[coverUri] = coverSrc.creationTime;

      const rec = addImportedAlbum({
        country: trip.country, countryName: trip.countryName, countryFlag: trip.countryFlag,
        date: trip.date, startDate: trip.startDate, endDate: trip.endDate,
        title: trip.title,
        medias: coverUri ? [coverUri] : [],
        representativePhoto: coverUri,
        mediaAssetIds,
        mediaTimes,
        // 사진첩이 아니라 카드 표지다 — 여행 상세의 형식 목록·프로필 카드 배지에서 빠진다.
        // (사용자가 만들지 않은 '사진 1장짜리 사진첩'이 생긴 것처럼 보이던 문제)
        isImportCover: true,
      });

      // 진행 중 체류국 사진이면 체류 카드로 흡수(백데이팅), 제3국이면 별도 여행 카드
      let groupId: string | null = null;
      if (target === 'stay') {
        absorbIntoStay(rec.id, trip.startDate);
        groupId = stay?.id ?? null;
      } else {
        // 제목에 국기를 넣지 않는다 — 프로필 카드가 `${countryFlag} ${title}`로 렌더링해 중복됨
        groupId = addTripGroup({ title: trip.title, records: [rec.id], coverRecordId: rec.id }).id;
        tripCount += 1;
        countries.push({ flag: trip.countryFlag, name: trip.countryName });
      }
      created.push({ record: rec, tripGroupId: groupId });

      // 분석된 사진을 카드에 연결해 보관 — 원본은 복사하지 않고 갤러리 참조만 남긴다
      if (groupId) {
        await saveTripPool({
          tripGroupId: groupId,
          recordId: rec.id,
          country: trip.country, countryName: trip.countryName, countryFlag: trip.countryFlag,
          title: trip.title, startDate: trip.startDate, endDate: trip.endDate,
          photos: trip.photos.map((p) => ({ id: p.id, uri: p.uri, creationTime: p.creationTime })),
        });
        photoCount += trip.photos.length;
      }
    }
    onProgress?.(trips.length, trips.length);
    return { tripCount, photoCount, countries, coverErrors, created };
  }, [homeCountryCode, addImportedAlbum, addTripGroup, absorbIntoStay]);
}
