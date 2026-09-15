/**
 * 광고(스폰서) 여행 패키지 — 현재 목록은 의도적으로 비어 있다.
 *
 * [왜 비었나]
 * 원래 여기에는 MVP 시연용 더미 4건(일본·태국·프랑스·베트남)이 박혀 있었다. 그런데
 * partner 가 실존하지 않는 회사명이고, affiliateUrl 은 전부 example.com 죽은 주소,
 * imageUrl 은 picsum 랜덤 스톡, priceText 는 실제 상품 없는 가격이었다. 이건 Google
 * 게시자 정책의 '허위 표현 — 거짓 제휴 주장' 및 '기만적 행위 — 거짓 광고'에 정면으로
 * 걸린다(AdMob 게시자 계정 신청 2회 거부 후 정책 감사에서 확인). MainScreen 의
 * SHOW_GLOBE_ADS 플래그가 false라 렌더되지는 않았지만, 불리언 하나만 뒤집히면 즉시
 * 라이브가 되는 상태였으므로 데이터 자체를 번들에서 들어냈다.
 *
 * [다시 채울 때의 조건 — 반드시 지킬 것]
 * - partner 는 **실제로 계약이 체결된 제휴사명**이어야 한다. 가상의 회사명 금지.
 * - affiliateUrl 은 **실제로 동작하는 추적 링크**여야 한다. example.com 류 금지.
 * - imageUrl / priceText 도 마찬가지로 실제 상품의 것이어야 한다. picsum 등 랜덤 스톡
 *   이미지나 임의로 지어낸 가격을 넣지 말 것.
 * - 요약하면: 자리표시(placeholder) 데이터를 다시 넣지 마라. 시연이 필요하면 이 파일이
 *   아니라 개발 전용 경로에서 처리한다.
 *
 * [동작 규약 — 채울 때 유효]
 * countryNameEn 은 지구본 GeoJSON(holtzy/world.geojson)의 properties.name 과 정확히
 * 일치해야 마커가 뜬다.
 *
 * 타입·함수(기계 장치)는 호출부(MainScreen, SponsoredPackageCard)가 컴파일되어야 하므로
 * 그대로 유지한다. 빈 배열에서도 세 함수 모두 안전하게 동작한다([] / [] / undefined).
 * 추후 원격(JSON/Supabase)·제휴 API 연동으로 교체 예정.
 */
export interface SponsoredPackage {
  id: string;
  countryNameEn: string; // 지구본 매칭용 영문 국가명 (GeoJSON)
  countryNameKo: string; // 표시용 한글 국가명
  title: string; // 상품명
  partner: string; // 투어사/제휴사명 (표기 의무) — 실제 계약된 제휴사만
  priceText?: string; // "₩890,000~"
  imageUrl?: string; // 대표 이미지(선택)
  affiliateUrl: string; // 파트너ID/clickId 포함 제휴 링크 — 실제 동작하는 링크만
}

/**
 * 스폰서 상품 목록. 위 주석의 조건을 모두 만족하는 실제 제휴 상품만 넣을 것.
 * 비어 있는 것이 현재의 올바른 상태다.
 */
export const SPONSORED_PACKAGES: SponsoredPackage[] = [];

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
