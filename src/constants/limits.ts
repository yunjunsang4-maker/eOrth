// 기록당 사진 상한 — 피드 기록 작성(NewRecordScreen)과 과거 여행 불러오기
// (ImportPhotoSelectScreen)가 공유한다.
export const MAX_RECORD_PHOTOS = 20;           // 무료
export const MAX_RECORD_PHOTOS_PREMIUM = 100;  // 프리미엄 구독

/** 프리미엄 여부에 따른 기록당 사진 상한 */
export const getMaxRecordPhotos = (isPremium: boolean): number =>
  isPremium ? MAX_RECORD_PHOTOS_PREMIUM : MAX_RECORD_PHOTOS;
