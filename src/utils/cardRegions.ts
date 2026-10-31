/**
 * 여행 카드에 연결한 방문 지역(TripGroup.visitedRegions) — 순수 로직.
 *
 * 왜 카드에 다는가(2026-11-01 사용자 확정): 예전 소급 태깅은 나라 단위(settingsStore.taggedRegions[ISO3])라
 * "어느 여행에서 간 지역인지"가 남지 않았고 고칠 단위도 나라 전체뿐이었다. 대륙 지도 칩 → 여행 카드 선택 →
 * 그 카드의 지역 선택으로 바꾸면서 저장처를 카드로 옮겼다. 옛 taggedRegions는 지우지 않고 계속 지도에 반영한다.
 *
 * 이 파일은 React·네트워크를 모른다 — `cardRegions.verify.ts`가 가벼운 픽스처로 돈다.
 * mergeTripCards.ts(카드 동기화 병합)도 여기의 정규화를 쓴다.
 */

/** 카드 하나에 연결된 방문 지역 1건. 다국가 카드가 있으므로 국가(ISO3)를 함께 적는다 */
export interface TripCardRegion {
  /** 대륙 지도 국가 코드(ISO3) — settingsStore.taggedRegions의 키와 같은 체계 */
  iso3: string;
  /** 지역 코드('JP-13' 등) — 지도 매칭 키. 이름이 아니라 코드다(regionKeyMigration 이후 체계) */
  nameEn: string;
  /** 저장 시점의 표시 이름(폴백용) — 표시는 regionNameByCode로 현재 언어 이름을 먼저 찾는다 */
  name: string;
}

/**
 * 외부(서버 payload·영속본)에서 온 값을 카드 지역 배열로 정규화한다.
 *
 * - 배열이 아니면 `undefined` — "이 카드는 지역 정보를 모른다"(옛 앱이 올린 payload 포함).
 *   빈 배열 `[]`은 "지역을 전부 지웠다"는 **명시적 값**이라 구분해 그대로 돌려준다(병합 규칙이 이 차이를 쓴다).
 * - 원소는 `iso3`·`nameEn`이 비어 있지 않은 문자열이어야 한다. `name`이 문자열이 아니면 ''로.
 * - 키 순서를 `{ iso3, nameEn, name }`으로 **다시 만든다** — serializeTripCard의 지문(JSON 문자열)이
 *   흔들리지 않게(Postgres jsonb는 키를 자기 규칙으로 재정렬해 돌려준다. tripState.ts 키 순서 주석 참조).
 * - 같은 (iso3, nameEn) 중복은 앞의 것 하나만 남긴다(카드 합치기의 합집합도 이 함수로 한다).
 */
export function sanitizeCardRegions(v: unknown): TripCardRegion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: TripCardRegion[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const { iso3, nameEn, name } = x as Record<string, unknown>;
    if (typeof iso3 !== 'string' || !iso3 || typeof nameEn !== 'string' || !nameEn) continue;
    const k = `${iso3}|${nameEn}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ iso3, nameEn, name: typeof name === 'string' ? name : '' });
  }
  return out;
}

/**
 * 카드의 지역 목록에서 **한 나라분만** 새 선택으로 갈아끼운다(다른 나라 지역은 그대로).
 *
 * 다국가 카드(스페인·포르투갈 한 장)에서 스페인 지도로 저장해도 포르투갈 지역이 지워지면 안 된다.
 * 결과가 비면 `[]`(명시적 삭제 — 동기화로 "지웠다"가 전파돼야 한다). 단 원래 정보가 없었고(undefined)
 * 고른 것도 없으면 `undefined` 그대로 — 아무것도 안 했는데 카드가 바뀌어 업로드되는 것을 막는다.
 */
export function replaceCountryRegions(
  current: TripCardRegion[] | undefined,
  iso3: string,
  picked: TripCardRegion[],
): TripCardRegion[] | undefined {
  if (current === undefined && picked.length === 0) return undefined;
  // 기존 순서를 보존한다 — 다른 나라분은 그대로, 이 나라분은 여전히 고른 것만 제자리에 남기고,
  // 새로 고른 것만 뒤에 붙인다. 다시 조립하면 [ESP, PRT]로 저장된 카드가 선택을 안 바꿔도
  // [PRT, ESP]로 바뀌어 '변경됨' 판정 → 헛 업로드가 나갔다(QA F4).
  const pickedKeys = new Set(picked.map((p) => p.nameEn));
  const kept = (current ?? []).filter((v) => v.iso3 !== iso3 || pickedKeys.has(v.nameEn));
  const have = new Set(kept.filter((v) => v.iso3 === iso3).map((v) => v.nameEn));
  return sanitizeCardRegions([...kept, ...picked.filter((p) => !have.has(p.nameEn)).map((p) => ({ ...p, iso3 }))]);
}

/** 기록 판정에 필요한 최소 shape — recordStore의 TravelRecord가 구조적으로 들어맞는다 */
export interface CardRegionRecord {
  id: string;
  viewType?: string;
  countryName?: string;
  countries?: { name: string }[];
}

/** 카드 판정에 필요한 최소 shape — recordStore의 TripGroup이 구조적으로 들어맞는다 */
export interface CardRegionGroup {
  id: string;
  records: string[];
  countryName?: string;
}

/**
 * 대륙 지도 한 나라(한글 국가명)의 '방문 지역 연결' 후보.
 *
 * - 기록 기준은 대륙 활성화·칩 기록 수와 같다: 스냅 제외, 대표 국가 또는 다국가 목록에 그 나라가 있는 기록.
 * - cards: 그런 기록을 하나라도 담은 카드. 단 다국가 **분할 카드**(countryName 오버라이드가 있음)는
 *   오버라이드가 이 나라일 때만 — 같은 기록을 나눠 가진 포르투갈 분할 카드가 스페인 목록에 뜨지 않게.
 * - looseRecordIds: 그런 기록 중 위 카드 어디에도 없는 것(카드를 지워도 기록은 남는다·날짜 없는 기록 등).
 *   화면은 이걸 '기타' 항목 하나로 묶어 나라 단위 저장(옛 taggedRegions)으로 보낸다.
 * 카드 순서는 입력(tripGroups — 새 카드가 앞) 그대로.
 */
export function pickCountryCards<G extends CardRegionGroup>(
  groups: G[],
  records: CardRegionRecord[],
  countryKo: string,
): { cards: G[]; looseRecordIds: string[] } {
  const matched: string[] = [];
  for (const r of records) {
    if (r.viewType === 'snap') continue;
    if (r.countryName === countryKo || r.countries?.some((c) => c.name === countryKo)) matched.push(r.id);
  }
  if (matched.length === 0) return { cards: [], looseRecordIds: [] };
  const m = new Set(matched);
  const cards = groups.filter(
    (g) => (!g.countryName || g.countryName === countryKo) && g.records.some((id) => m.has(id)),
  );
  const inCard = new Set<string>();
  for (const g of cards) for (const id of g.records) inCard.add(id);
  return { cards, looseRecordIds: matched.filter((id) => !inCard.has(id)) };
}

/**
 * 지금 **살아 있는** 카드 지역 — 그 나라의 `pickCountryCards` 후보 카드에 달린 그 나라 지역만.
 *
 * 왜 거르는가(QA F1): 지도가 카드 지역을 무조건 보여 주면, 시트(=pickCountryCards)에는 그 카드가 안 떠서
 * 지울 방법이 없는 지역이 생긴다 — 다국가 카드에서 스페인 기록만 지웠을 때, 포르투갈 분할 카드가 스페인
 * 카드를 흡수했을 때. 표시 범위와 편집 범위를 같은 판정으로 맞춘다. 옛 taggedRegions가 그 나라 기록이
 * 사라지면 함께 정리되던 것과 같은 효과다(카드 데이터 자체는 지우지 않는다 — 기록이 돌아오면 다시 보인다.
 * 지우면 동기화 업로드가 따라 나가고, 기록 동기화가 늦게 도착한 기기에서 멀쩡한 지역을 지울 수 있다).
 *
 * @param iso3ToKo ISO3 → 기록에 저장되는 한글 국가명(모르는 코드면 그 나라 지역은 살아 있지 않다)
 */
export function liveCardRegions<G extends CardRegionGroup & { visitedRegions?: TripCardRegion[] }>(
  groups: G[],
  records: CardRegionRecord[],
  iso3ToKo: Record<string, string>,
): TripCardRegion[] {
  const liveCards = new Map<string, Set<string>>(); // iso3 → 그 나라 후보 카드 id
  const out: TripCardRegion[] = [];
  for (const g of groups) {
    for (const v of g.visitedRegions ?? []) {
      let ids = liveCards.get(v.iso3);
      if (!ids) {
        const ko = iso3ToKo[v.iso3];
        ids = new Set(ko ? pickCountryCards(groups, records, ko).cards.map((c) => c.id) : []);
        liveCards.set(v.iso3, ids);
      }
      if (ids.has(g.id)) out.push(v);
    }
  }
  return out;
}
