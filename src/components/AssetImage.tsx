// 갤러리 자산 이미지 — iOS의 ph:// URI를 자가 복구해 렌더한다.
//
// 배경: 과거여행 스캔이 성능 때문에 사진마다 getAssetInfoAsync를 부르지 않게 되면서
// (utils/scanSampling.ts 참조) 대부분의 사진 uri가 iOS 원본 형식인 ph://<localIdentifier>로
// 남는다. RN Image가 ph://를 못 그리는 환경에서는 선택 그리드가 검은 타일이 된다.
//
// 동작: 우선 받은 uri로 그리고, 로드에 실패했을 때만 MediaLibrary로 실제 file:// 경로를
// 한 번 받아 교체한다. ph://가 정상 렌더되는 환경에서는 추가 비용이 0이고, 아닌 환경에서도
// 화면에 보이는 사진만(자산당 1회, 전역 캐시 공유) 해석한다.
import React, { useState, useCallback } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

// assetId → 해석된 file:// 경로. 화면·리스트를 넘나들어도 자산당 1회만 조회한다.
const resolved = new Map<string, string>();
// 해석 실패(삭제된 자산·iCloud 오프로드 등) — 무한 재시도를 막는다
const failed = new Set<string>();

export function clearAssetImageCache() {
  resolved.clear();
  failed.clear();
}

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

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} onError={handleError} />;
}
