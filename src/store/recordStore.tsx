import React, { createContext, useContext, useState } from 'react';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
export type Visibility = 'private' | 'friends' | 'public';

export type RecordViewType =
  | 'feed'        // 피드 (기본값)
  | 'blog'        // 블로그
  | 'album'       // 앨범 (보관, 휴면)
  | 'snap'        // 스냅 (BeReal 스타일)
  | 'cut';        // 네컷/컷사진

export interface TravelRecord {
  id: string;
  user: { name: string; emoji: string; handle: string };
  country: string;          // 예: "🇯🇵 일본" (대표 국가, 하위 호환)
  countryName: string;      // 예: "일본"
  countryFlag: string;      // 예: "🇯🇵"
  countries?: { flag: string; name: string }[];  // 복수 국가 지원
  perCountryData?: Record<string, {              // 국가별 데이터
    medias?: string[];
    startDate?: string;
    endDate?: string;
    rating?: number;
    representativePhoto?: string;
  }>;
  representativePhoto?: string; // 대표 사진 (지구본/대륙 활성화용)
  date: string;             // 예: "2025.04.13"
  content: string;
  likes: number;
  comments: number;
  liked: boolean;
  isVoyager?: boolean;  // 보관 처리됨 (미사용)
  isMyPost?: boolean;
  visibility: Visibility;
  timestamp: number;
  // v2 새 필드
  memo?: string;
  rating?: number;
  companions?: string[];
  companionFriends?: string[];
  medias?: string[];
  mediaPrivacy?: Record<number, string[]>;
  budget?: { amount: number; currency: string };
  weather?: string;
  flightType?: string;
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  viewType?: RecordViewType;  // 뷰 형식 (기본값 'feed')
  tripGroupId?: string | null;    // 묶음 여행 ID
  tripGroupOrder?: number | null; // 묶음 안에서 순서
  // v3 블로그 확장 필드
  blogBlocks?: BlogBlock[];           // 블록 기반 콘텐츠 (viewType='blog'일 때)
  blogCategory?: BlogCategory;       // 블로그 카테고리
  scheduledAt?: number;               // 예약 발행 시각 (timestamp, 없으면 즉시 발행)
  isDraft?: boolean;                  // 임시저장 여부
  // v4 스냅 필드 (viewType='snap'일 때)
  snapFrontUri?: string;              // 전면 카메라 사진
  snapBackUri?: string;               // 후면 카메라 사진
  snapCaption?: string;               // 한줄 캡션
  snapDetectedCountry?: string;       // 감지된 국가명
  snapLateSeconds?: number;           // 알림 후 촬영까지 소요 시간(초)
  snapExpiresAt?: number;             // 24시간 후 만료 시각
  snapViewed?: boolean;               // 스냅 열람 여부
  // v5 네컷 필드 (viewType='cut'일 때)
  cutPhoto?: {
    layout: import('../constants/cutFrames').CutLayout;
    frameId: string;
    frameColor?: string;              // 기본 프레임의 사용자 지정 색 (RGB)
    photos: string[];                 // 슬롯 순서대로 사진 URI
    previewUri: string;               // 합성 미리보기 이미지
  };
  regionName?: string;                // 예: "도쿄" (대륙 기록 시 사용)
  regionNameEn?: string;              // 예: "Tokyo" (대륙 기록 시 사용)
}

// ─────────────────────────────────────────────
// 여행 묶음 타입
// ─────────────────────────────────────────────
export interface TripGroup {
  id: string;
  title: string;
  records: string[];       // 포함된 TravelRecord id 배열
  createdAt: Date;
  coverRecordId: string;   // 대표 기록 id
}

// ─────────────────────────────────────────────
// 초기 더미 데이터 (기존 SocialScreen 데이터 이전)
// ─────────────────────────────────────────────
const INITIAL_RECORDS: TravelRecord[] = [
  // ─── feed 형식 ───
  {
    id: 'seed-1',
    user: { name: '탐험가 민지', emoji: '🧭', handle: 'minji_explorer' },
    country: '🇮🇹 이탈리아',
    countryName: '이탈리아',
    countryFlag: '🇮🇹',
    countries: [{ flag: '🇮🇹', name: '이탈리아' }, { flag: '🇫🇷', name: '프랑스' }],
    date: '2025.03.15',
    content: '로마의 트레비 분수에 동전을 던졌어요. 다시 돌아오고 싶다는 소원이 이루어지길!',
    likes: 24,
    comments: 8,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 12,
    viewType: 'feed',
    startDate: '2025.03.12',
    endDate: '2025.03.15',
    companions: ['연인'],
    weather: '화창',
    rating: 5,
    budget: { amount: 2500, currency: 'EUR' },
    flightType: '경유',
    keywords: ['유럽', '로마', '분수'],
  },
  // ─── blog 형식 ───
  {
    id: 'seed-blog',
    user: { name: '블로거 하윤', emoji: '✍️', handle: 'hayun_blog' },
    country: '🇻🇳 베트남',
    countryName: '베트남',
    countryFlag: '🇻🇳',
    countries: [{ flag: '🇻🇳', name: '베트남' }],
    date: '2025.04.20',
    content: '호이안 3박 4일 여행기. 밤의 등불 축제와 바구니 배 체험, 그리고 반미의 천국.',
    likes: 56,
    comments: 14,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 8,
    viewType: 'blog',
    startDate: '2025.04.17',
    endDate: '2025.04.20',
    companions: ['친구'],
    weather: '화창',
    rating: 5,
    keywords: ['호이안', '등불축제', '반미', '바구니배', '베트남'],
    blogBlocks: [
      { id: 'sb-h1', type: 'heading', value: '호이안, 등불이 켜지는 마을', level: 1, align: 'center' },
      { id: 'sb-t1', type: 'text', value: '베트남 다낭에서 차로 40분. 호이안 올드타운에 도착하면 시간이 멈춘 듯한 풍경이 펼쳐진다. 노란 벽과 색색의 등불, 좁은 골목에서 풍기는 향신료 냄새. 이곳은 사진으로 담을 수 없는 감성이 있다.' },
      { id: 'sb-sep1', type: 'separator', style: 'dots' },
      { id: 'sb-h2', type: 'heading', value: '🏮 첫째 날 — 올드타운 산책', level: 2 },
      { id: 'sb-t2', type: 'text', value: '숙소에 짐을 풀자마자 올드타운으로 향했다. 낮의 호이안은 조용하고 한적했다. 일본식 다리(내원교)를 건너고, 풍흥 고가를 구경했다. 입장권 하나로 여러 곳을 돌 수 있어서 좋았다.\n\n해가 지기 시작하면서 분위기가 완전히 달라졌다. 하나둘 켜지는 등불, 투본강에 비치는 불빛들. 소원 등불을 강에 띄우는 사람들의 모습이 정말 아름다웠다.' },
      { id: 'sb-q1', type: 'quote', value: '호이안의 밤은 낮과 완전히 다른 세계다. 등불 하나에 소원 하나, 강물 위로 천천히 흘러간다.' },
      { id: 'sb-h3', type: 'heading', value: '🛶 둘째 날 — 바구니 배 & 쿠킹 클래스', level: 2 },
      { id: 'sb-t3', type: 'text', value: '아침 일찍 캄탄 마을로 이동해서 바구니 배(퉁 짜이)를 탔다. 현지 아저씨가 배 위에서 빙글빙글 돌려주는데, 무서우면서도 너무 재밌었다. 코코넛 야자수 숲 사이로 유유히 떠다니는 시간이 힐링 그 자체.\n\n오후에는 쿠킹 클래스에 참여했다. 시장에서 직접 재료를 사고, 반미와 반쎄오, 스프링롤을 만들었다. 내가 만든 반미가 이렇게 맛있을 줄이야!' },
      { id: 'sb-sep2', type: 'separator', style: 'line' },
      { id: 'sb-h4', type: 'heading', value: '🍜 맛집 추천 BEST 3', level: 2 },
      { id: 'sb-t4', type: 'text', value: '1. 반미 프엉 (Banh Mi Phuong) — 앤서니 보데인이 극찬한 그 반미. 줄이 길어도 먹을 가치가 있다.\n\n2. 까오라우 (Cao Lau) — 호이안에서만 먹을 수 있는 특별한 국수. 쫄깃한 면발에 돼지고기 토핑이 일품.\n\n3. 화이트 로즈 (White Rose) — 새우로 만든 만두인데 장미 모양이라 이름이 화이트 로즈. 달콤한 소스에 찍어 먹으면 끝.' },
      { id: 'sb-h5', type: 'heading', value: '💰 경비 정리', level: 2 },
      { id: 'sb-t5', type: 'text', value: '항공: 인천↔다낭 직항 왕복 38만 원\n숙소: 올드타운 부티크 호텔 3박 21만 원\n식비: 하루 평균 3만 원 (길거리 음식 위주)\n액티비티: 바구니 배 + 쿠킹 클래스 약 7만 원\n\n총 합계: 약 80만 원 (1인 기준)' },
      { id: 'sb-sep3', type: 'separator', style: 'thick' },
      { id: 'sb-t6', type: 'text', value: '호이안은 화려하지 않지만, 오래 기억에 남는 여행지였다. 다음에는 우기 직전 9월에 다시 와서 좀 더 한적한 호이안을 느껴보고 싶다.', bold: true },
    ] as BlogBlock[],
    budget: { amount: 800000, currency: 'KRW' },
    flightType: '직항',
    memo: '올드타운 입장권 12만동(약 6천원). 5곳 선택 가능. 야시장은 꼭 가볼 것.',
  },
  // ─── cut 형식 (네컷/필름) ───
  {
    id: 'seed-cut',
    user: { name: '네컷장인 도이', emoji: '🎞️', handle: 'doe_cut' },
    country: '🇯🇵 일본',
    countryName: '일본',
    countryFlag: '🇯🇵',
    countries: [{ flag: '🇯🇵', name: '일본' }],
    date: '2025.05.10',
    content: '교토 골목에서 담은 필름 네컷 📸',
    likes: 38,
    comments: 6,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 4,
    viewType: 'cut',
    keywords: ['교토', '네컷', '필름'],
    cutPhoto: {
      layout: 'film',
      frameId: 'theme-film-mono',
      photos: [
        'https://picsum.photos/seed/eorth-cut1/400/520',
        'https://picsum.photos/seed/eorth-cut2/400/520',
        'https://picsum.photos/seed/eorth-cut3/400/520',
        'https://picsum.photos/seed/eorth-cut4/400/520',
      ],
      previewUri: '',
    },
    medias: ['https://picsum.photos/seed/eorth-cut1/400/520'],
  },
  // 4컷 (브루클린 벽돌 테마)
  {
    id: 'seed-cut2',
    user: { name: '컷부심 레오', emoji: '📷', handle: 'leo_4cut' },
    country: '🇫🇷 프랑스',
    countryName: '프랑스',
    countryFlag: '🇫🇷',
    countries: [{ flag: '🇫🇷', name: '프랑스' }],
    date: '2025.05.08',
    content: '파리 네컷 브루클린 벽돌 🧱',
    likes: 27,
    comments: 4,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 16,
    viewType: 'cut',
    keywords: ['파리', '네컷', '브루클린벽돌'],
    cutPhoto: {
      layout: 'four-compact',
      frameId: 'theme-brick-four',
      photos: [
        'https://picsum.photos/seed/eorth-c2a/400/400',
        'https://picsum.photos/seed/eorth-c2b/400/400',
        'https://picsum.photos/seed/eorth-c2c/400/400',
        'https://picsum.photos/seed/eorth-c2d/400/400',
      ],
      previewUri: '',
    },
    medias: ['https://picsum.photos/seed/eorth-c2a/400/400'],
  },
  // 9컷 (기본 프레임 + 크림색)
  {
    id: 'seed-cut3',
    user: { name: '모아찍기 수아', emoji: '🧩', handle: 'sua_9cut' },
    country: '🇪🇸 스페인',
    countryName: '스페인',
    countryFlag: '🇪🇸',
    countries: [{ flag: '🇪🇸', name: '스페인' }],
    date: '2025.05.06',
    content: '바르셀로나 9컷 모음 🧱',
    likes: 19,
    comments: 2,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    viewType: 'cut',
    keywords: ['바르셀로나', '네컷'],
    cutPhoto: {
      layout: 'nine',
      frameId: 'basic-nine',
      frameColor: '#F5EBE0',
      photos: [
        'https://picsum.photos/seed/eorth-c3a/300/300',
        'https://picsum.photos/seed/eorth-c3b/300/300',
        'https://picsum.photos/seed/eorth-c3c/300/300',
        'https://picsum.photos/seed/eorth-c3d/300/300',
        'https://picsum.photos/seed/eorth-c3e/300/300',
        'https://picsum.photos/seed/eorth-c3f/300/300',
        'https://picsum.photos/seed/eorth-c3g/300/300',
        'https://picsum.photos/seed/eorth-c3h/300/300',
        'https://picsum.photos/seed/eorth-c3i/300/300',
      ],
      previewUri: '',
    },
    medias: ['https://picsum.photos/seed/eorth-c3a/300/300'],
  },
  // 필름 (모노 필름 테마)
  {
    id: 'seed-cut4',
    user: { name: '필름러 지오', emoji: '🎞️', handle: 'geo_film' },
    country: '🇮🇹 이탈리아',
    countryName: '이탈리아',
    countryFlag: '🇮🇹',
    countries: [{ flag: '🇮🇹', name: '이탈리아' }],
    date: '2025.05.04',
    content: '로마 필름 🎞️',
    likes: 33,
    comments: 5,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 28,
    viewType: 'cut',
    keywords: ['로마', '필름', '네컷'],
    cutPhoto: {
      layout: 'film',
      frameId: 'theme-film-mono',
      photos: [
        'https://picsum.photos/seed/eorth-c4a/400/520',
        'https://picsum.photos/seed/eorth-c4b/400/520',
        'https://picsum.photos/seed/eorth-c4c/400/520',
        'https://picsum.photos/seed/eorth-c4d/400/520',
      ],
      previewUri: '',
    },
    medias: ['https://picsum.photos/seed/eorth-c4a/400/520'],
  },
  // 3컷 세로 (기본 프레임 + 로즈색)
  {
    id: 'seed-cut5',
    user: { name: '세로감성 미루', emoji: '🌷', handle: 'miru_3cut' },
    country: '🇬🇧 영국',
    countryName: '영국',
    countryFlag: '🇬🇧',
    countries: [{ flag: '🇬🇧', name: '영국' }],
    date: '2025.05.02',
    content: '런던 3컷 세로 🌧️',
    likes: 22,
    comments: 3,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 36,
    viewType: 'cut',
    keywords: ['런던', '네컷'],
    cutPhoto: {
      layout: 'three-v',
      frameId: 'basic-three-v',
      frameColor: '#CD7F7D',
      photos: [
        'https://picsum.photos/seed/eorth-c5a/360/640',
        'https://picsum.photos/seed/eorth-c5b/360/640',
        'https://picsum.photos/seed/eorth-c5c/360/640',
      ],
      previewUri: '',
    },
    medias: ['https://picsum.photos/seed/eorth-c5a/360/640'],
  },
  // ─── snap 형식 (BeReal 스타일) ───
  {
    id: 'seed-snap',
    user: { name: '순간포착 유나', emoji: '⚡', handle: 'yuna_snap' },
    country: '🇹🇭 태국',
    countryName: '태국',
    countryFlag: '🇹🇭',
    countries: [{ flag: '🇹🇭', name: '태국' }],
    date: '2025.05.21',
    content: '',
    likes: 73,
    comments: 31,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 3,
    viewType: 'snap',
    snapCaption: '방콕 카오산로드에서 갑자기 울린 알림 🔔',
    snapDetectedCountry: '태국',
    snapLateSeconds: 47,
    snapExpiresAt: Date.now() + 1000 * 60 * 60 * 21,
    keywords: ['방콕', '카오산로드', '스냅'],
  },
  // ─── snap 형식 2 ───
  {
    id: 'seed-snap2',
    user: { name: '도쿄러버 하나', emoji: '🌸', handle: 'hana_tokyo' },
    country: '🇯🇵 일본',
    countryName: '일본',
    countryFlag: '🇯🇵',
    countries: [{ flag: '🇯🇵', name: '일본' }],
    date: '2025.05.22',
    content: '',
    likes: 45,
    comments: 12,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 1,
    viewType: 'snap',
    snapCaption: '시부야 스크램블에서 찰칵! 사람 진짜 많다 😵',
    snapDetectedCountry: '일본',
    snapLateSeconds: 12,
    snapExpiresAt: Date.now() + 1000 * 60 * 60 * 23,
    keywords: ['도쿄', '시부야', '스냅'],
  },
  // ─── snap 형식 3 (유나의 두 번째 스냅) ───
  {
    id: 'seed-snap3',
    user: { name: '순간포착 유나', emoji: '⚡', handle: 'yuna_snap' },
    country: '🇹🇭 태국',
    countryName: '태국',
    countryFlag: '🇹🇭',
    countries: [{ flag: '🇹🇭', name: '태국' }],
    date: '2025.05.21',
    content: '',
    likes: 38,
    comments: 9,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
    viewType: 'snap',
    snapCaption: '팟타이 먹다가 알림 와서 급하게 찍음 🍜',
    snapDetectedCountry: '태국',
    snapLateSeconds: 5,
    snapExpiresAt: Date.now() + 1000 * 60 * 60 * 22,
    keywords: ['방콕', '팟타이', '스냅'],
  },
  // ─── 기존 feed (viewType 미지정 = 기본 feed) ───
  {
    id: 'seed-2',
    user: { name: '나그네 준서', emoji: '🗺️', handle: 'junser_traveler' },
    country: '🇬🇷 그리스',
    countryName: '그리스',
    countryFlag: '🇬🇷',
    countries: [{ flag: '🇬🇷', name: '그리스' }],
    date: '2025.03.10',
    content: '산토리니의 파란 지붕과 하얀 벽... 사진으로는 다 담을 수 없어. 눈으로 직접 봐야 해.',
    likes: 41,
    comments: 12,
    liked: true,
    visibility: 'friends',
    timestamp: Date.now() - 1000 * 60 * 60 * 32,
    startDate: '2025.03.08',
    endDate: '2025.03.12',
    companions: ['혼자'],
    weather: '맑음',
    rating: 5,
  },
  {
    id: 'seed-3',
    user: { name: '여행자 서연', emoji: '✈️', handle: 'seoyeon_travel' },
    country: '🇯🇵 일본',
    countryName: '일본',
    countryFlag: '🇯🇵',
    countries: [{ flag: '🇯🇵', name: '일본' }, { flag: '🇰🇷', name: '한국' }, { flag: '🇹🇼', name: '대만' }],
    date: '2025.03.05',
    content: '교토 아라시야마 대나무 숲. 새벽 6시에 도착했더니 사람이 없어서 완전 독차지했어요.',
    likes: 67,
    comments: 19,
    liked: false,
    visibility: 'public',
    timestamp: Date.now() - 1000 * 60 * 60 * 20,
    startDate: '2025.03.01',
    endDate: '2025.03.07',
    companions: ['가족'],
    weather: '구름조금',
    rating: 4,
    budget: { amount: 800000, currency: 'JPY' },
    flightType: '직항',
    keywords: ['교토', '아라시야마', '대나무숲'],
  },
];

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
export interface BlockedUser {
  name: string;
  emoji: string;
  blockedAt: number;
}

interface RecordContextType {
  records: TravelRecord[];
  addRecord: (record: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>) => void;
  updateRecord: (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => void;
  deleteRecord: (id: string) => void;
  toggleLike: (id: string) => void;
  archivedIds: string[];
  archiveRecord: (id: string) => void;
  unarchiveRecord: (id: string) => void;
  blockedUsers: BlockedUser[];
  blockUser: (user: { name: string; emoji: string }) => void;
  unblockUser: (name: string) => void;
  tripGroups: TripGroup[];
  addTripGroup: (group: Omit<TripGroup, 'id' | 'createdAt'>) => void;
  deleteTripGroup: (id: string) => void;
  updateTripGroup: (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => void;
  markSnapViewed: (id: string) => void;
  // 임시저장
  drafts: TravelRecord[];
  saveDraft: (record: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>) => string;
  updateDraft: (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => void;
  deleteDraft: (id: string) => void;
  publishDraft: (id: string) => void;
  addImportedAlbum: (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
  }) => string; // 생성된 record id 반환
}

const RecordContext = createContext<RecordContextType | null>(null);

export function RecordProvider({ children }: { children: React.ReactNode }) {
  const { nickname, handle } = useSettings();
  const [records, setRecords] = useState<TravelRecord[]>(INITIAL_RECORDS);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [tripGroups, setTripGroups] = useState<TripGroup[]>([]);
  const [drafts, setDrafts] = useState<TravelRecord[]>([]);

  // ─── 기록 → 여행 카드(트립 그룹) 자동 연결 ───
  // 같은 국가 + 기간이 겹치거나 7일 이내로 가까운 그룹이 있으면 그 그룹에 추가,
  // 없으면 새 그룹(프로필 여행 카드)을 생성한다.
  const GROUP_GAP_MS = 7 * 24 * 60 * 60 * 1000;
  const parseRecDate = (s?: string): number | null => {
    if (!s) return null;
    const t = new Date(s.replace(/\./g, '-')).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const linkRecordToTrip = (rec: TravelRecord) => {
    const country = rec.countryName;
    const recStart = parseRecDate(rec.startDate) ?? parseRecDate(rec.date);
    const recEnd = parseRecDate(rec.endDate) ?? recStart;
    if (!country || recStart == null || recEnd == null) return; // 국가/날짜 없으면 매칭 불가

    setTripGroups((prev) => {
      const match = prev.find((g) => {
        const members = g.records
          .map((id) => records.find((r) => r.id === id))
          .filter(Boolean) as TravelRecord[];
        if (members.length === 0 || members[0].countryName !== country) return false;
        let gStart = Infinity;
        let gEnd = -Infinity;
        for (const m of members) {
          const s = parseRecDate(m.startDate) ?? parseRecDate(m.date);
          const e = parseRecDate(m.endDate) ?? s;
          if (s != null) gStart = Math.min(gStart, s);
          if (e != null) gEnd = Math.max(gEnd, e);
        }
        if (!Number.isFinite(gStart) || !Number.isFinite(gEnd)) return false;
        return recStart <= gEnd + GROUP_GAP_MS && recEnd >= gStart - GROUP_GAP_MS;
      });

      if (match) {
        if (match.records.includes(rec.id)) return prev;
        return prev.map((g) => (g.id === match.id ? { ...g, records: [...g.records, rec.id] } : g));
      }
      const newGroup: TripGroup = {
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${country} 여행`,
        records: [rec.id],
        coverRecordId: rec.id,
        createdAt: new Date(),
      };
      return [newGroup, ...prev];
    });
  };

  const addRecord = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>
  ) => {
    const newRecord: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: nickname,
        handle: handle,
      },
      id: `rec-${Date.now()}`,
      likes: 0,
      comments: 0,
      liked: false,
      isMyPost: true,
      timestamp: data.scheduledAt || Date.now(),
      isDraft: false,
    };
    setRecords((prev) => [newRecord, ...prev]);
    linkRecordToTrip(newRecord); // 프로필 여행 카드 자동 생성/연결
  };

  const updateRecord = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
  };

  const deleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setArchivedIds((prev) => prev.filter((i) => i !== id));
  };

  // ─── 임시저장 ───
  const saveDraft = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>
  ): string => {
    const draftId = `draft-${Date.now()}`;
    const draft: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: nickname,
        handle: handle,
      },
      id: draftId,
      likes: 0,
      comments: 0,
      liked: false,
      isMyPost: true,
      timestamp: Date.now(),
      isDraft: true,
    };
    setDrafts((prev) => [draft, ...prev]);
    return draftId;
  };

  const updateDraft = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...changes, timestamp: Date.now() } : d))
    );
  };

  const deleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const publishDraft = (id: string) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const published: TravelRecord = {
      ...draft,
      id: `rec-${Date.now()}`,
      isDraft: false,
      timestamp: draft.scheduledAt || Date.now(),
    };
    setRecords((prev) => [published, ...prev]);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    linkRecordToTrip(published); // 프로필 여행 카드 자동 생성/연결
  };

  const archiveRecord = (id: string) => {
    setArchivedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unarchiveRecord = (id: string) => {
    setArchivedIds((prev) => prev.filter((i) => i !== id));
  };

  const toggleLike = (id: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
          : r
      )
    );
  };

  const markSnapViewed = (id: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id && !r.snapViewed ? { ...r, snapViewed: true } : r
      )
    );
  };

  const blockUser = (user: { name: string; emoji: string }) => {
    setBlockedUsers((prev) => {
      if (prev.some((b) => b.name === user.name)) return prev;
      return [...prev, { ...user, blockedAt: Date.now() }];
    });
  };

  const unblockUser = (name: string) => {
    setBlockedUsers((prev) => prev.filter((b) => b.name !== name));
  };

  const addImportedAlbum = (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
  }): string => {
    const id = `rec-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rec: TravelRecord = {
      id,
      user: { name: '', emoji: '🗺️', handle: '' },
      country: data.country,
      countryName: data.countryName,
      countryFlag: data.countryFlag,
      date: data.date,
      startDate: data.startDate,
      endDate: data.endDate,
      content: data.title,
      likes: 0, comments: 0, liked: false,
      isMyPost: true,
      visibility: 'private',
      timestamp: Date.now(),
      viewType: 'album',
      medias: data.medias,
    };
    setRecords((prev) => [rec, ...prev]);
    return id;
  };

  const addTripGroup = (data: Omit<TripGroup, 'id' | 'createdAt'>) => {
    const newGroup: TripGroup = {
      ...data,
      id: `grp-${Date.now()}`,
      createdAt: new Date(),
    };
    setTripGroups((prev) => [newGroup, ...prev]);
  };

  const deleteTripGroup = (id: string) => {
    setTripGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const updateTripGroup = (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => {
    setTripGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...changes } : g))
    );
  };

  return (
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
