/**
 * 기간 안에 찍은 기기 사진 목록을 '한 번에' 읽는다 — 기간 사진 격자(components/record/DateRangePhotoSheet)와
 * 사진첩 만들기 2단계(AlbumCreateScreen)가 같이 쓴다.
 *
 * 왜 한 번에·변환 없이인가(2026-11-05 사진첩 만들기 지연 실기기 확인):
 *  - 페이지(200장)씩 스크롤에 맞춰 늘리면 날짜 칩도 따라 늘어나 "칩이 하나씩 뜬다"로 보이고,
 *    스크롤 끝마다 같은 비용을 다시 기다린다. getAssetsAsync는 메타만 돌려주므로 1,000장 단위로
 *    몇 번 돌아도 1초 안쪽이다. 상한은 폭주 방어(한 달 여행 5천 장 여유).
 *  - 목록 단계에서 장마다 getAssetInfoAsync(ph:// → file://, 장당 15ms+)를 돌리면 200장에 3초+가 걸린다.
 *    격자는 AssetImage(expo-image)가 ph://를 셀 크기로 바로 그리므로 변환하지 않는다 —
 *    경로 변환은 호출부가 '확정 시 선택분만' 한다.
 */
import * as MediaLibrary from 'expo-media-library';
import type { DayRangeMs } from './dateRangePhotoPick';

const PAGE_SIZE = 1000;
const MAX_PHOTOS = 8000;

export type RangePhoto = {
  id: string;
  /** 갤러리가 준 uri 그대로(iOS는 ph://, 안드로이드는 file://). 표시는 AssetImage, 파일이 필요하면 확정 시 변환 */
  uri: string;
  creationTime?: number;
};

/** range(로컬 하루 경계 ms — dayRangeMs) 안의 사진 전부, 촬영시각 오름차순(여행 시작일부터). 권한 확인은 호출부 몫 */
export async function fetchPhotosInRange(range: DayRangeMs): Promise<RangePhoto[]> {
  const out: RangePhoto[] = [];
  let after: string | undefined;
  do {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: 'photo',
      // [key, ascending] — 문자열만 넘기면 내림차순(최신 먼저)이라 여행 시작일부터 보이게 오름차순을 명시
      sortBy: [['creationTime', true]],
      createdAfter: range.startMs,
      createdBefore: range.endMs,
    });
    for (const a of page.assets) out.push({ id: a.id, uri: a.uri, creationTime: a.creationTime || undefined });
    after = page.hasNextPage ? page.endCursor : undefined;
  } while (after && out.length < MAX_PHOTOS);
  return out;
}
