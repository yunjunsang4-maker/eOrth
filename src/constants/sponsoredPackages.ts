/**
 * 광고(스폰서) 여행 패키지 — MVP용 정적 데이터.
 *
 * 지구본의 해당 국가 영토에 광고 마커가 빛나고, 탭하면 카드가 떠서 제휴 링크로 연결된다.
 * 사용자가 링크를 통해 구매하면 제휴 네트워크가 clickId로 추적해 수수료를 정산한다(앱은 클릭만 전달).
 *
 * countryNameEn 은 지구본 GeoJSON(holtzy/world.geojson)의 properties.name 과 정확히 일치해야 마커가 뜬다.
 * 추후 원격(JSON/Supabase)·제휴 API 연동으로 교체 예정.
 */
export interface SponsoredPackage {
  id: string;
  countryNameEn: string; // 지구본 매칭용 영문 국가명 (GeoJSON)
  countryNameKo: string; // 표시용 한글 국가명
  title: string; // 상품명
  partner: string; // 투어사/제휴사명 (표기 의무)
  priceText?: string; // "₩890,000~"
  imageUrl?: string; // 대표 이미지(선택)
  affiliateUrl: string; // 파트너ID/clickId 포함 제휴 링크
}

export const SPONSORED_PACKAGES: SponsoredPackage[] = [
  {
    id: 'jp-osaka-3d',
    countryNameEn: 'Japan',
    countryNameKo: '일본',
    title: '오사카·교토 3박 4일 자유여행 패키지',
    partner: '여행파트너투어',
    priceText: '₩459,000~',
    imageUrl: 'https://picsum.photos/seed/osaka/600/360',
    affiliateUrl: 'https://example.com/aff?pkg=jp-osaka-3d&utm_source=eorth',
  },
  {
    id: 'th-bangkok-5d',
    countryNameEn: 'Thailand',
    countryNameKo: '태국',
    title: '방콕·파타야 5일 올인클루시브',
    partner: '스마일트래블',
    priceText: '₩699,000~',
    imageUrl: 'https://picsum.photos/seed/bangkok/600/360',
    affiliateUrl: 'https://example.com/aff?pkg=th-bangkok-5d&utm_source=eorth',
  },
  {
    id: 'fr-paris-6d',
    countryNameEn: 'France',
    countryNameKo: '프랑스',
    title: '파리·근교 6일 부티크 투어',
    partner: '유로익스플로러',
    priceText: '₩1,890,000~',
    imageUrl: 'https://picsum.photos/seed/paris/600/360',
    affiliateUrl: 'https://example.com/aff?pkg=fr-paris-6d&utm_source=eorth',
  },
  {
    id: 'vn-danang-4d',
    countryNameEn: 'Vietnam',
    countryNameKo: '베트남',
    title: '다낭·호이안 4일 리조트 패키지',
    partner: '바캉스코리아',
    priceText: '₩529,000~',
    imageUrl: 'https://picsum.photos/seed/danang/600/360',
    affiliateUrl: 'https://example.com/aff?pkg=vn-danang-4d&utm_source=eorth',
  },
];

/** 지구본에 마커를 띄울 국가들의 GeoJSON 영문명 (중복 제거) */
export function getSponsoredCountryNamesEn(): string[] {
  return Array.from(new Set(SPONSORED_PACKAGES.map((p) => p.countryNameEn)));
}

/** 지구본 미니 카드 마커용 항목 — 국가별 첫 상품 1개씩(제목·가격 포함) */
export interface SponsoredMarkerItem {
  nameEn: string; // 지구본 매칭용 영문 국가명
  label: string; // 미니 카드 제목
  price?: string;
  image?: string; // 미니 카드 썸네일
}
export function getSponsoredMarkerItems(): SponsoredMarkerItem[] {
  const seen = new Set<string>();
  const items: SponsoredMarkerItem[] = [];
  for (const p of SPONSORED_PACKAGES) {
    if (seen.has(p.countryNameEn)) continue;
    seen.add(p.countryNameEn);
    items.push({ nameEn: p.countryNameEn, label: p.title, price: p.priceText, image: p.imageUrl });
  }
  return items;
}

/** 영문 국가명으로 광고 패키지 찾기 (해당 국가의 첫 상품) */
export function getSponsoredByCountryEn(nameEn: string): SponsoredPackage | undefined {
  return SPONSORED_PACKAGES.find((p) => p.countryNameEn === nameEn);
}
