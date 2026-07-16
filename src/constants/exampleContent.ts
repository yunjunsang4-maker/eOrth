// src/constants/exampleContent.ts
// eOrth 공식 예시 콘텐츠 — 빈 소셜탭에 주입되는 번들 데이터. 서버 저장/발행 없음.
import { Image } from 'react-native';
import type { TravelRecord } from '../store/recordStore';

const asUri = (m: number) => Image.resolveAssetSource(m).uri;

// 예시 기록 카드 (피드 형식) — 진짜 게시물처럼 보이되 isExample로 구동
export const EXAMPLE_FEED_RECORD: TravelRecord = {
  id: 'example-feed-1',
  user: { name: 'eOrth', emoji: '🌏', handle: 'eorth' },
  country: '🇺🇸 미국',
  countryName: '미국',
  countryFlag: '🇺🇸',
  date: '2026.05.20',
  timestamp: new Date('2026-05-20').getTime(),
  content: '뉴욕에서의 하루 ☀️ 오늘 걸은 만큼 지도가 채워졌어요. 피드 기록은 이렇게 사진과 글로 남겨요.',
  viewType: 'feed',
  medias: [asUri(require('../../assets/example/feed1.jpg'))],
  visibility: 'neighbors',
  likes: 0,
  comments: 0,
  liked: false,
  isMyPost: false,
  isExample: true,
};

// 데모 스냅 — 스냅 링에 노출, 탭하면 스토리로
export const EXAMPLE_SNAP: TravelRecord = {
  id: 'example-snap-1',
  user: { name: 'eOrth', emoji: '🌏', handle: 'eorth' },
  country: '🇺🇸 미국',
  countryName: '미국',
  countryFlag: '🇺🇸',
  date: '2026.05.20',
  timestamp: new Date('2026-05-20').getTime(),
  content: '스냅은 여행 중 순간을 한 장으로 — 이렇게 보여요',
  viewType: 'snap',
  medias: [asUri(require('../../assets/example/snap1.jpg'))],
  visibility: 'neighbors',
  likes: 0,
  comments: 0,
  liked: false,
  isMyPost: false,
  isExample: true,
};

// 기능 소개 슬라이드 (지구본·통계·배지) — FeatureShowcaseCard가 순회
export interface FeatureSlide { image: number; titleKey: string; descKey: string; }
export const FEATURE_SLIDES: FeatureSlide[] = [
  { image: require('../../assets/example/feature-globe.jpg'), titleKey: 'socialEmpty.featGlobeTitle', descKey: 'socialEmpty.featGlobeDesc' },
  { image: require('../../assets/example/feature-stats.jpg'), titleKey: 'socialEmpty.featStatsTitle', descKey: 'socialEmpty.featStatsDesc' },
  { image: require('../../assets/example/feature-badge.jpg'), titleKey: 'socialEmpty.featBadgeTitle', descKey: 'socialEmpty.featBadgeDesc' },
];
