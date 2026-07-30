/**
 * photo-location — 로컬 Expo Module 의 JS 바인딩
 *
 * 사진의 GPS 좌표만 배치로 읽는다. expo-media-library의 getAssetInfoAsync는 좌표와 함께
 * localUri·exif까지 만들면서 원본 파일을 열기 때문에 회당 15.5ms가 들었다(실측 1,383회
 * = 21.5초, 스캔 전체의 69.6%). 이 모듈은 좌표만 가져온다.
 *
 * 네이티브가 없는 환경(Expo Go / 이 모듈이 들어가기 전 빌드 / 웹)에서는 requireNativeModule이
 * throw하므로 null로 폴백하고, isPhotoLocationAvailable로 가용성을 노출한다.
 * 호출부는 이 플래그를 보고 기존 getAssetInfoAsync 경로를 그대로 쓴다.
 */

import { requireNativeModule } from 'expo-modules-core';

/** 네이티브 응답 형태: { 자산id: [위도, 경도] }. 좌표 없는 사진은 키 자체가 없다. */
export type NativeLocationMap = Record<string, [number, number]>;

interface PhotoLocationNativeModule {
  getLocations(assetIds: string[]): Promise<NativeLocationMap>;
}

let nativeModule: PhotoLocationNativeModule | null = null;
try {
  nativeModule = requireNativeModule<PhotoLocationNativeModule>('PhotoLocation');
} catch {
  nativeModule = null;
}

/** 네이티브 좌표 배치 조회를 실제로 쓸 수 있는지 */
export const isPhotoLocationAvailable = nativeModule !== null;

/**
 * 자산 id 배열의 좌표를 한 번에 읽는다. 네이티브가 없으면 빈 객체를 반환하니,
 * 호출부는 isPhotoLocationAvailable로 미리 갈라 두는 것이 맞다.
 */
export async function getLocations(assetIds: string[]): Promise<NativeLocationMap> {
  if (!nativeModule || assetIds.length === 0) return {};
  return nativeModule.getLocations(assetIds);
}
