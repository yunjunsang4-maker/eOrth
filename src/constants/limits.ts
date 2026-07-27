// 기록당 사진 상한 — 피드 기록 작성(NewRecordScreen)과 과거 여행 불러오기
// (ImportPhotoSelectScreen)가 공유한다.
export const MAX_RECORD_PHOTOS = 20;           // 전체 공통(기본)
// 상향치 — 현재는 프리미엄 구독 혜택에서 제외됨. 추후 앱내 재화 구매로 해제 예정(예약값).
export const MAX_RECORD_PHOTOS_PREMIUM = 100;

/**
 * 기록당 사진 상한. (2026-07 수익구조 변경) 사진 제한 상향을 프리미엄 구독 혜택에서 제거 —
 * 프리미엄 여부와 무관하게 모두 기본값. 상향은 추후 앱내 재화 구매로 도입 예정.
 * 호출부 시그니처 유지를 위해 isPremium 인자는 받되 사용하지 않는다.
 */
export const getMaxRecordPhotos = (_isPremium?: boolean): number => MAX_RECORD_PHOTOS;

// 사진첩 한 권당 사진 상한 — 서버본이 압축 업로드라 무료도 100장 (posts.ts ALBUM_EDGE)
export const MAX_ALBUM_PHOTOS = 100;           // 전체 공통(기본)
// 상향치 — 현재는 프리미엄 구독 혜택에서 제외됨. 추후 앱내 재화 구매로 해제 예정(예약값).
export const MAX_ALBUM_PHOTOS_PREMIUM = 200;

/** 사진첩 사진 상한. (위와 동일) 프리미엄 상향 제거 — 모두 기본값. */
export const getMaxAlbumPhotos = (_isPremium?: boolean): number => MAX_ALBUM_PHOTOS;
