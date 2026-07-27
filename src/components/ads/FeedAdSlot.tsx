import React, { useState } from 'react';
import { useFeedAdSource } from '../../hooks/useFeedAdSource';
import AffiliatePolaroidCard from './AffiliatePolaroidCard';
import AdMobPolaroidCard from './AdMobPolaroidCard';
import FeedAdCard from './FeedAdCard';
import type { HouseAd } from '../../constants/houseAds';

// 광고 슬롯 하나를 그리는 래퍼.
//
// 존재 이유: SocialScreen의 columns[ci].map(...) 안에서는 훅을 호출할 수 없다.
// 소스 결정(훅)과 렌더 분기를 이 컴포넌트가 떠안는다.

interface Props {
  /** 폴라로이드 슬롯 순번 (0부터) */
  slot: number;
  /** 제휴·AdMob이 모두 없을 때 그릴 하우스 광고 */
  houseAd: HouseAd;
  /** 폴라로이드 기울기(도) */
  tilt: number;
}

export default function FeedAdSlot({ slot, houseAd, tilt }: Props) {
  const source = useFeedAdSource(slot);
  // 제휴 이미지가 깨지면 이 슬롯은 남은 세션 동안 하우스로 고정한다.
  const [degraded, setDegraded] = useState(false);

  if (source.kind === 'affiliate' && !degraded) {
    return (
      <AffiliatePolaroidCard
        campaign={source.campaign}
        tilt={tilt}
        onFallback={() => setDegraded(true)}
      />
    );
  }

  if (source.kind === 'admob') {
    return <AdMobPolaroidCard ad={source.ad} tilt={tilt} />;
  }

  return (
    <FeedAdCard
      ad={houseAd}
      variant="polaroid"
      tilt={tilt}
      onPress={() => { /* 하우스 광고는 눌러도 이동 없음 */ }}
    />
  );
}
