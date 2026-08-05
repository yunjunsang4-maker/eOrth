// 갤러리 자산 이미지 — iOS의 ph:// URI를 자가 복구해 렌더한다.
//
// 배경: 과거여행 스캔이 성능 때문에 사진마다 getAssetInfoAsync를 부르지 않게 되면서
// (utils/scanSampling.ts 참조) 대부분의 사진 uri가 iOS 원본 형식인 ph://<localIdentifier>로
// 남는다. RN Image가 ph://를 못 그리는 환경에서는 선택 그리드가 검은 타일이 된다.
//
// 동작: 우선 받은 uri로 그리고, 로드에 실패했을 때만 MediaLibrary로 실제 file:// 경로를
// 한 번 받아 교체한다. ph://가 정상 렌더되는 환경에서는 추가 비용이 0이고, 아닌 환경에서도
// 화면에 보이는 사진만(자산당 1회, 전역 캐시 공유) 해석한다.
//
// ⚠️ RN Image를 쓰지 않는 이유(로딩 지연의 원인) —
//   RN Image는 로컬 원본을 '표시 크기와 무관하게' 통째로 디코딩한다. 가져오기 결과의
//   114pt 그리드 셀 하나에 1,200만 화소 원본을 매번 펼치는 셈이라, 한 화면(30장 남짓)만
//   그려도 수백 MB를 디코딩하며 몇 초씩 멈췄다.
//   expo-image는 뷰 프레임을 로더에 넘겨 iOS에서는 PHImageManager에 '셀 크기'로 요청하고
//   (Photos가 미리 만들어 둔 썸네일이 바로 온다), 안드로이드에서는 Glide가 뷰 크기로
//   다운샘플링한다. 원본 디코딩 자체가 사라지므로 체감 로딩이 수십 배 빨라진다.
import React, { useState, useCallback } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

// assetId → 해석된 file:// 경로. 화면·리스트를 넘나들어도 자산당 1회만 조회한다.
const resolved = new Map<string, string>();
// 해석 실패(삭제된 자산·iCloud 오프로드 등) — 무한 재시도를 막는다
const failed = new Set<string>();

export function clearAssetImageCache() {
  resolved.clear();
  failed.clear();
}

// RN Image의 resizeMode ↔ expo-image의 contentFit (호출부 계약 유지용)
const FIT: Record<NonNullable<Props['resizeMode']>, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
};

interface Props {
  uri: string;
  /** 갤러리 자산 id — 있어야 ph:// 실패 시 복구가 가능하다 */
  assetId?: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

export default function AssetImage({ uri, assetId, style, resizeMode = 'cover' }: Props) {
  const [src, setSrc] = useState<string>(() => (assetId && resolved.get(assetId)) || uri);

  const handleError = useCallback(async () => {
    if (!assetId || failed.has(assetId)) return;
    const hit = resolved.get(assetId);
    if (hit && hit !== src) { setSrc(hit); return; }
    try {

      const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
      // 여기서만 원본을 요구한다(iCloud 오프로드분 포함) — 보이는 사진에 한정
      const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: true });
      if (info.localUri && info.localUri !== src) {
        resolved.set(assetId, info.localUri);
        setSrc(info.localUri);
        return;
      }
      failed.add(assetId);
    } catch {
      failed.add(assetId);
    }
  }, [assetId, src]);

  return (
    <Image
      source={{ uri: src }}
      style={style}
      contentFit={FIT[resizeMode]}
      // 리스트 셀 재사용 시 이전 사진이 남아 보이지 않게 — 자산이 바뀌면 뷰를 초기화한다
      recyclingKey={assetId ?? uri}
      // 그리드는 스크롤하며 같은 사진을 반복해 지나므로 메모리 캐시가 특히 크게 먹힌다
      cachePolicy="memory-disk"
      // 썸네일이 즉시 오는 경로라 페이드가 오히려 느려 보인다 — 끈다
      transition={0}
      onError={handleError}
    />
  );
}
