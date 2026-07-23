// ─── 배지 데이터 (전 화면 공용) ───
// 조건 로직은 utils/badgeRules, 표시는 ProfileScreen, 전역 판정은 hooks/useBadgeEarning에서 사용.

import type { ImageSourcePropType } from 'react-native';

export interface Badge {
  id: number;
  emoji: string;
  name: string;
  desc: string;
  earned: boolean; // static 기본값(데이터 판정 대상은 무시됨)
  glow: string;
  image?: ImageSourcePropType; // 커스텀 디자인 배지 — 있으면 이모지 대신 이미지로 렌더 (자체 테두리 포함)
}

// 전체 카탈로그(숨김 포함). 정의는 지우지 않고 남겨 둔다 — 숨김 해제 시 그대로 복귀.
const ALL_BADGES: Badge[] = [
  // 대륙 & 첫 방문 배지 (1 ~ 7)
  { id: 1, emoji: '🛫', name: '역사적인 당신의 첫 발자취!', desc: '첫 기록', earned: true, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/first-record.png') },
  { id: 2, emoji: '🌏', name: '아시아에서의 첫발!', desc: '아시아 첫방문', earned: true, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/asia-first.png') },
  { id: 3, emoji: '🇪🇺', name: '유럽에서의 첫발!', desc: '유럽 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/europe-first.png') },
  { id: 4, emoji: '🍁', name: '북미에서의 첫발!', desc: '북아메리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/northamerica-first.png') },
  { id: 5, emoji: '🌴', name: '남미에서의 첫발!', desc: '남아메리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/southamerica-first.png') },
  { id: 6, emoji: '🦘', name: '오세아니아에서의 첫발!', desc: '오세아니아 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)', image: require('../../assets/badges/oceania-first.png') },
  { id: 7, emoji: '🦁', name: '아프리카에서의 첫발', desc: '아프리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 여행 동행 & 스타일 배지 (9 ~ 15)
  { id: 9, emoji: '🎒', name: '혼자만의 감성을 즐기는 유형인가요?', desc: '홀로 여행', earned: true, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/solo-travel.png') },
  { id: 10, emoji: '💑', name: '여행에서 안 싸웠길 바래요^^', desc: '커플 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/couple-travel.png') },
  { id: 11, emoji: '👵', name: '당신의 첫 효도인가요?', desc: '부모님 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/parents-travel.png') },
  { id: 12, emoji: '🤝', name: '여행을 계획한 메이트에게 불평하지 마세요.', desc: '메이트 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/friend-travel.png') },
  { id: 13, emoji: '🎂', name: '생일 축하드립니다', desc: '생일 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/birthday-travel.png') },
  { id: 14, emoji: '⚡', name: '스피드 트래블러', desc: '당일치기 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 15, emoji: '🚗', name: '가스는 잠궜죠?', desc: '30일 이상 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 국가 & 지역 탐방 배지 (16 ~ 34)
  { id: 16, emoji: '🇯🇵', name: '히사시부리!', desc: '일본 재방문', earned: true, glow: 'rgba(47,244,150,0.5)' },
  { id: 17, emoji: '🍣', name: '열도에 새긴 발걸음', desc: '일본 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 18, emoji: '🥢', name: '젓가락만 챙기세요!', desc: '중국과 일본 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 19, emoji: '🇺🇸', name: '미주투어', desc: '미국 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 20, emoji: '🇨🇳', name: '중국투어', desc: '중국 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 21, emoji: '⛪', name: '당신은 종교대통합을 이뤘어요', desc: '각기 다른 종교국가 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 22, emoji: '🏝️', name: '섬 입문자', desc: '섬 3번 방문 (Lv.1)', earned: true, glow: 'rgba(47,244,150,0.5)' },
  { id: 23, emoji: '🛥️', name: '섬 탐험가', desc: '섬 5번 방문 (Lv.2)', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 24, emoji: '👑', name: '섬 정복자', desc: '섬 10번 방문 (Lv.3)', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 25, emoji: '🗽', name: '당신도 이제 뉴욕커', desc: '뉴욕 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 26, emoji: '🎲', name: '당신은 타짜인가요?', desc: '카지노 지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 27, emoji: '☯️', name: '동방의 수호자', desc: '한자 문화권 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 28, emoji: '🇬🇧', name: 'You can speak english, right?', desc: '영어권(미국,영국,호주,캐나다,뉴질랜드) 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 29, emoji: '🐪', name: '오아시스는 찾으셨나요?', desc: '사막지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 30, emoji: '🥵', name: '데오드란트를 추천해 드릴까요?', desc: '열대지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 31, emoji: '🛂', name: '한국여권의 힘!', desc: '무비자 입국 가능 국가 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 32, emoji: '✈️', name: '월드투어는 성공적이었나요?', desc: '한번에 여러나라 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 33, emoji: '🌀', name: '이건 데자뷰?!', desc: '정확히 1년만에 같은 곳 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 34, emoji: '💖', name: '이 나라와 사랑에 빠지셨군요!', desc: '같은 나라 재방문 5회', earned: false, glow: 'rgba(47,244,150,0.5)' },

  // 여행 마일스톤 배지 (35 ~ 61)
  { id: 35, emoji: '🚶', name: '초보 여행자', desc: '3개국 방문 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)', image: require('../../assets/badges/traveler-lv1.png') },
  { id: 36, emoji: '🏃', name: '신흥 탐험가', desc: '5개국 방문 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)', image: require('../../assets/badges/traveler-lv2.png') },
  { id: 37, emoji: '🗺️', name: '네이션 컬렉터', desc: '10개국 방문 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)', image: require('../../assets/badges/traveler-lv3.png') },
  { id: 38, emoji: '🌎', name: '글로벌 트래블러', desc: '20개국 방문 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 39, emoji: '🪐', name: '월드 마스터', desc: '30개국 방문 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 40, emoji: '👾', name: '세계 정복자', desc: '50개국 방문 (Lv.6)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 41, emoji: '🛡️', name: '전설의 탐험가', desc: '100개국 방문 (Lv.7)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 42, emoji: '🧭', name: '국경없는 이방인', desc: '모든 대륙 1개국 이상 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 43, emoji: '🏆', name: '지구정복자', desc: '모든 국가 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 44, emoji: '🗺️', name: '대륙 정복자', desc: '대륙 하나의 모든 국가 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 45, emoji: '✍️', name: '여행 기록가', desc: '여행기록 5개 달성 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 46, emoji: '📖', name: '여행 일지 마스터', desc: '여행기록 10개 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 48, emoji: '⭐', name: '별점 입문자', desc: '별점 1점 기록 (Lv.1)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 49, emoji: '🌟', name: '별점 탐색자', desc: '별점 2점 기록 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 50, emoji: '⚖️', name: '별점 중립파', desc: '별점 3점 기록 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 51, emoji: '💯', name: '별점 후한 편', desc: '별점 4점 기록 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 52, emoji: '🥇', name: '별점 마스터', desc: '별점 5점 기록 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 53, emoji: '📅', name: '당신의 사계절은 여행으로 채워졌네요', desc: '매분기 여행', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 54, emoji: '💎', name: '저희의 워너비이십니다.', desc: '매달 여행', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 55, emoji: '🕰️', name: '잊지말아줘요..', desc: '1년전 오늘 기록 조회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 56, emoji: '🌱', name: '배지 입문', desc: '배지 5개 달성 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 57, emoji: '📂', name: '배지 수집가', desc: '배지 10개 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 58, emoji: '🔥', name: '배지 매니아', desc: '배지 30개 달성 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 59, emoji: '🎓', name: '배지 마스터', desc: '배지 50개 달성 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 60, emoji: '🏆', name: '배지 챔피언', desc: '배지 100개 달성 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 61, emoji: '👑', name: '배지 레전드', desc: '배지 200개 달성 (Lv.6)', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 시즌 & 기념일 배지 (63 ~ 65)
  { id: 63, emoji: '🎍', name: '새해복 많이 받으세요!', desc: '해가 바뀌는 기간 중 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 64, emoji: '🥗', name: '다이어트는 성공하셨나요?', desc: '여름휴가 여행(7~8월)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 65, emoji: '🧣', name: '당신은 겨울잠이 없군요', desc: '겨울휴가 여행(1~2월)', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 기록 형식 배지 (66 ~ 71)
  { id: 66, emoji: '📝', name: '블로그의 달인', desc: '블로그 형식 기록 10개 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 67, emoji: '🎞️', name: '스트립 큐레이터', desc: '스트립 기록 5개 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 68, emoji: '⚡', name: '스냅 마스터', desc: '스냅 기록 30개 달성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 69, emoji: '🎨', name: '만능 기록자', desc: '피드+블로그+스트립+스냅 각각 1개 이상 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 70, emoji: '🖼️', name: '프레임 콜렉터', desc: '스트립 프레임 5종 이상 사용', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 71, emoji: '🗞️', name: '피드의 달인', desc: '피드 형식 기록 20개 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 소셜 배지 (73 ~ 85)
  { id: 73, emoji: '💬', name: '첫 DM', desc: '메이트에게 첫 DM 전송', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 74, emoji: '🔗', name: '공유왕', desc: '게시물 공유 10회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 75, emoji: '🧚', name: '댓글 요정', desc: '댓글 50개 작성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 76, emoji: '🔥', name: '인싸 여행러', desc: '게시물에 좋아요 100개 받기', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 77, emoji: '👥', name: '여행 메이트', desc: '같은 메이트와 동행기록 5회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 78, emoji: '🦋', name: '소셜 나비', desc: '메이트 50명 달성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 80, emoji: '📥', name: '첫 공유받기', desc: '다른 사람이 내 게시물을 DM으로 공유', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 81, emoji: '👋', name: '첫 메이트', desc: '메이트 1명 달성 (Lv.1)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 82, emoji: '🎉', name: '인싸의 시작', desc: '메이트 10명 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 83, emoji: '👑', name: '인맥왕', desc: '메이트 100명 달성 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 84, emoji: '🤝', name: '첫 동행', desc: '앱 메이트와 동행기록 1회 (Lv.1)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 85, emoji: '👫', name: '동행 메이트', desc: '앱 메이트와 동행기록 3회 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 스냅 특별 배지 (88 ~ 90)
  { id: 88, emoji: '🔥', name: '스냅 스트릭', desc: '7일 연속 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 89, emoji: '🦉', name: '야행성 스냅', desc: '새벽 2~5시 사이 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 90, emoji: '🌅', name: '일출 스냅', desc: '오전 5~7시 사이 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 기록 습관 배지 (97 ~ 104)
  { id: 97, emoji: '💪', name: '꾸준함의 힘', desc: '30일 연속 기록', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 98, emoji: '📅', name: '새해 첫 기록', desc: '1월 1일에 기록 작성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 99, emoji: '🎄', name: '크리스마스 트래블러', desc: '12월 25일에 여행 기록', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 101, emoji: '☔', name: '비 오는 날의 기록', desc: '날씨 \'비\'로 기록 10회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 102, emoji: '❄️', name: '눈의 나라', desc: '날씨 \'눈\'으로 기록 5회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 103, emoji: '🥰', name: '별점 후한 사람', desc: '별점 5점 기록 10개', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 104, emoji: '🧐', name: '까다로운 평론가', desc: '별점 1점 기록 3개', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 앱 활용 배지 (112 ~ 114)
  { id: 112, emoji: '🏃', name: '꾸준한 여행자', desc: '앱 연속 접속 30일 (Lv.1)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 113, emoji: '💝', name: '충성 유저', desc: '앱 연속 접속 50일 (Lv.2)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 114, emoji: '🔥', name: 'eOrth 마니아', desc: '앱 연속 접속 100일 (Lv.3)', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 특별 & 시즌 배지 (115 ~ 121)
  { id: 115, emoji: '🎂', name: 'eOrth 1주년', desc: '앱 설치 후 1년 경과', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 116, emoji: '🚀', name: '얼리어답터', desc: '앱 출시 첫 달 가입', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 118, emoji: '🌸', name: '벚꽃 시즌', desc: '3~4월 일본 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 119, emoji: '🍺', name: '옥토버페스트', desc: '10월 독일 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 120, emoji: '🎭', name: '카니발 참가자', desc: '2~3월 브라질 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 121, emoji: '🌌', name: '오로라 헌터', desc: '노르웨이/아이슬란드/핀란드 겨울 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },

  // 동행 추가 배지 (123~124) — 여행 동행 & 스타일 그룹에 함께 표시됨
  { id: 123, emoji: '👨‍👩‍👧‍👦', name: '가족과 함께라면 어디든', desc: '가족 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/family-travel.png') },
  { id: 124, emoji: '🧑‍🤝‍🧑', name: '우애가 돈독하시네요!', desc: '형제 여행', earned: false, glow: 'rgba(255,100,100,0.5)', image: require('../../assets/badges/sibling-travel.png') },

  // 국가별 여러 지역 방문 추가 배지 (125~) — '국가 & 지역 탐방' 그룹에 함께 표시됨
  { id: 125, emoji: '🇩🇪', name: '독일투어', desc: '독일 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 126, emoji: '🇪🇸', name: '스페인투어', desc: '스페인 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 127, emoji: '🇬🇧', name: '영국투어', desc: '영국 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 128, emoji: '🇫🇷', name: '프랑스투어', desc: '프랑스 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 129, emoji: '🇮🇹', name: '이탈리아투어', desc: '이탈리아 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
];

// ─── 출시 축소: 잠시 숨김 처리한 배지 (eOrth_배지목록_정리본.xlsx, 2026-07-18 확정 46개만 노출) ───
// 되살릴 때는 이 집합에서 id를 빼기만 하면 된다. 정의(ALL_BADGES)·판정 규칙(badgeRules)은 그대로 남아 있고,
// 숨김 중 충족한 조건·행동 배지도 badgeEarnedAt에 계속 쌓이므로 해제 즉시 획득 상태로 복귀한다.
export const HIDDEN_BADGE_IDS = new Set<number>([
  14, 15,                                              // 동행/스타일: 당일치기 · 30일 이상
  18, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 33, 34,  // 국가&지역: 젓가락·종교·섬·카지노·한자·영어권·사막·열대·무비자·데자뷰·재방문5회
  38, 39, 40, 41, 42, 43, 44,                          // 마일스톤: 20~100개국 · 모든 대륙 · 지구/대륙 정복
  48, 49, 50, 51, 52, 53, 54, 55,                      // 마일스톤: 별점 1~5점 · 매분기 · 매달 · 1년전 기록 조회
  59, 60, 61,                                          // 마일스톤: 배지 50·100·200개
  66, 67, 68, 69, 70, 71,                              // 기록 형식 배지 전체
  73, 74, 75, 76, 77, 78, 80, 83,                      // 소셜: DM·공유왕·댓글·좋아요·여행메이트·나비·공유받기·인맥왕
  88, 89, 90,                                          // 스냅 특별 배지 전체
  97, 101, 102, 103, 104,                              // 기록 습관: 연속30일 · 비 · 눈 · 별점5×10 · 별점1×3
  115, 118, 119, 120, 121,                             // 특별&시즌: 1주년 · 벚꽃 · 옥토버페스트 · 카니발 · 오로라
]);

// 출시 노출 배지(46개) — 화면 표시·개수 집계는 전부 이 목록을 쓴다.
export const BADGES: Badge[] = ALL_BADGES.filter((b) => !HIDDEN_BADGE_IDS.has(b.id));

// 배지 목록 모달의 챕터(카테고리) 구성.
// range: 연속 id 구간. ids: 비연속 id를 순서대로 명시(range 대신). extra: range 뒤에 덧붙일 id.
export interface BadgeCategory { name: string; range: [number, number]; ids?: number[]; extra?: number[]; }
export const BADGE_CATEGORIES: BadgeCategory[] = [
  { name: '대륙 & 첫 방문 배지', range: [1, 7] },
  { name: '여행 동행 & 스타일 배지', range: [9, 15], ids: [9, 10, 11, 12, 123, 124, 13, 14, 15] },
  { name: '국가 & 지역 탐방 배지', range: [16, 34], extra: [125, 126, 127, 128, 129] },
  { name: '여행 마일스톤 배지', range: [35, 61] },
  { name: '시즌 & 기념일 배지', range: [63, 65] },
  { name: '기록 형식 배지', range: [66, 71] },
  { name: '소셜 배지', range: [73, 85] },
  { name: '스냅 특별 배지', range: [88, 90] },
  { name: '기록 습관 배지', range: [97, 104] },
  { name: '앱 활용 배지', range: [112, 114] },
  { name: '특별 & 시즌 배지', range: [115, 121] },
];

// ─── 챕터별 자동 번호 ('챕터-순번', 예: '1-1') — 내부 편집 참고용 ───
// UI에는 노출하지 않는다(사용자에겐 안 보임). 소스에서 배지를 찾거나 추가할 때 참고하는 내부 코드.
// 카테고리(=챕터) 순서 × 챕터 내 실제 표시 순서로 산출하며, 삭제된 빈 id는 건너뛴다.
// 디버깅: console.log(BADGE_CODE) 또는 BADGE_CODE[id].
const buildBadgeCodes = (): Record<number, string> => {
  const codes: Record<number, string> = {};
  const exists = new Set(BADGES.map((b) => b.id));
  BADGE_CATEGORIES.forEach((cat, ci) => {
    let ordered: number[];
    if (cat.ids) {
      ordered = [...cat.ids];
    } else {
      ordered = [];
      for (let i = cat.range[0]; i <= cat.range[1]; i++) ordered.push(i);
    }
    if (cat.extra) ordered = [...ordered, ...cat.extra];
    let n = 0;
    for (const id of ordered) {
      if (!exists.has(id)) continue; // 삭제된 빈 번호 skip
      n += 1;
      codes[id] = `${ci + 1}-${n}`;
    }
  });
  return codes;
};
export const BADGE_CODE: Record<number, string> = buildBadgeCodes();
