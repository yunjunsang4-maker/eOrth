// 기록당 사진 상한 — 피드 기록 작성(NewRecordScreen)과 과거 여행 불러오기
// (ImportPhotoSelectScreen)가 공유한다.
export const MAX_RECORD_PHOTOS = 20;           // 무료
export const MAX_RECORD_PHOTOS_PREMIUM = 100;  // 프리미엄 구독

/** 프리미엄 여부에 따른 기록당 사진 상한 */
export const getMaxRecordPhotos = (isPremium: boolean): number =>
  isPremium ? MAX_RECORD_PHOTOS_PREMIUM : MAX_RECORD_PHOTOS;

// 사진첩 한 권당 사진 상한 — 서버본이 압축 업로드라 무료도 100장 (posts.ts ALBUM_EDGE)
export const MAX_ALBUM_PHOTOS = 100;           // 무료
export const MAX_ALBUM_PHOTOS_PREMIUM = 200;   // 프리미엄 구독 (원본 백업과 함께 사진첩 혜택)

/** 프리미엄 여부에 따른 사진첩 사진 상한 */
export const getMaxAlbumPhotos = (isPremium: boolean): number =>
  isPremium ? MAX_ALBUM_PHOTOS_PREMIUM : MAX_ALBUM_PHOTOS;
