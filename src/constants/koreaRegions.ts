// 대한민국 시/도 프리셋 — 국내(거주국가) 기록의 지역 선택·여행 카드 구분용.
// GPS 도시명("수원시", "Seoul" 등)이 제각각이라, 프리셋과 정규화로 표기를 통일해
// 같은 지역 기록이 다른 카드로 파편화되는 것을 막는다.
export interface KoreaRegion {
  name: string;   // 카드/기록에 저장되는 표준 표기
  nameEn: string;
  // 정규화 매칭 키워드 — GPS 도시명·영문명에 포함되면 이 지역으로 정규화
  match: string[];
}

export const KOREA_REGIONS: KoreaRegion[] = [
  { name: '서울', nameEn: 'Seoul', match: ['서울', 'seoul'] },
  { name: '부산', nameEn: 'Busan', match: ['부산', 'busan'] },
  { name: '인천', nameEn: 'Incheon', match: ['인천', 'incheon'] },
  { name: '대구', nameEn: 'Daegu', match: ['대구', 'daegu'] },
  { name: '대전', nameEn: 'Daejeon', match: ['대전', 'daejeon'] },
  { name: '광주', nameEn: 'Gwangju', match: ['광주', 'gwangju'] },
  { name: '울산', nameEn: 'Ulsan', match: ['울산', 'ulsan'] },
  { name: '세종', nameEn: 'Sejong', match: ['세종', 'sejong'] },
  { name: '경기', nameEn: 'Gyeonggi', match: ['경기', 'gyeonggi', '수원', 'suwon', '성남', 'seongnam', '용인', 'yongin', '고양', 'goyang', '부천', 'bucheon', '안산', 'ansan', '안양', 'anyang', '화성', 'hwaseong', '평택', 'pyeongtaek', '파주', 'paju', '김포', 'gimpo'] },
  { name: '강원', nameEn: 'Gangwon', match: ['강원', 'gangwon', '춘천', 'chuncheon', '강릉', 'gangneung', '속초', 'sokcho', '원주', 'wonju', '평창', 'pyeongchang'] },
  { name: '충북', nameEn: 'Chungbuk', match: ['충북', '충청북도', 'chungbuk', '청주', 'cheongju', '충주', 'chungju'] },
  { name: '충남', nameEn: 'Chungnam', match: ['충남', '충청남도', 'chungnam', '천안', 'cheonan', '아산', 'asan', '공주', 'gongju', '보령', 'boryeong', '태안', 'taean'] },
  { name: '전북', nameEn: 'Jeonbuk', match: ['전북', '전라북도', 'jeonbuk', '전주', 'jeonju', '군산', 'gunsan', '남원', 'namwon'] },
  { name: '전남', nameEn: 'Jeonnam', match: ['전남', '전라남도', 'jeonnam', '여수', 'yeosu', '순천', 'suncheon', '목포', 'mokpo', '담양', 'damyang'] },
  { name: '경북', nameEn: 'Gyeongbuk', match: ['경북', '경상북도', 'gyeongbuk', '경주', 'gyeongju', '포항', 'pohang', '안동', 'andong', '구미', 'gumi'] },
  { name: '경남', nameEn: 'Gyeongnam', match: ['경남', '경상남도', 'gyeongnam', '창원', 'changwon', '김해', 'gimhae', '통영', 'tongyeong', '거제', 'geoje', '진주', 'jinju', '남해', 'namhae'] },
  { name: '제주', nameEn: 'Jeju', match: ['제주', 'jeju', '서귀포', 'seogwipo'] },
];

/**
 * 같은 지명이 두 시/도에 걸쳐 있을 때의 우선 규칙.
 * 문자열에 signals(상위 시/도 신호)와 over(광역시 이름)가 함께 있으면 winner를 택한다.
 *
 * 광주: '경기도 광주시'·'Gwangju-si, Gyeonggi-do'가 부분 문자열 첫 일치로 광주광역시에
 * 잡히던 문제. 광주광역시 표기에는 '경기'가 함께 나올 수 없으므로, 경기 신호가 있으면
 * 경기도로 보내도 기존 광주광역시 매칭('광주광역시'·'광주 서구'·'Gwangju')은 그대로 산다.
 */
const REGION_PRIORITY: { signals: string[]; over: string[]; winner: string }[] = [
  { signals: ['경기', 'gyeonggi'], over: ['광주', 'gwangju'], winner: '경기' },
];

/**
 * 자유 문자열 지역명(GPS 도시명 등)을 시/도 프리셋으로 정규화.
 * 매칭 실패 시 null — 호출부는 원본을 그대로 쓰거나 미지정 처리.
 */
export function normalizeKoreaRegion(raw?: string | null): KoreaRegion | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // 1) 시/도가 겹치는 지명은 더 구체적인 신호(상위 시/도)를 먼저 본다
  for (const rule of REGION_PRIORITY) {
    if (rule.signals.some((s) => lower.includes(s)) && rule.over.some((o) => lower.includes(o))) {
      const win = KOREA_REGIONS.find((r) => r.name === rule.winner);
      if (win) return win;
    }
  }
  // 2) 일반 부분 문자열 매칭 (프리셋 순서)
  return KOREA_REGIONS.find((r) => r.match.some((m) => lower.includes(m))) ?? null;
}
