/**
 * GADM → Natural Earth 지역 저장 키 마이그레이션 (순수 함수)
 *
 * 저장 키가 GADM 표기(`USA|NewYork`)에서 ISO 코드(`USA|US-NY`)로 바뀐다.
 * 스토어에 의존하지 않으므로 regionKeyMigration.verify.ts로 단독 검증할 수 있다.
 *
 * 설계: docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md
 */
import { REGION_KEY_ALIASES, REGION_CITY_ALIAS_KEYS } from '../data/regionKeyAliases';

/** 영속 payload의 지역 키 스키마 버전. 이 값보다 낮으면 hydrate에서 1회 변환한다. */
export const REGION_KEY_SCHEMA = 1;

const CITY_KEYS = new Set(REGION_CITY_ALIAS_KEYS);

/** 코드 → 소속 국가(ISO3). 이미 변환된 코드를 재입력했을 때 멱등하게 되돌리기 위한 역인덱스 */
const ISO_BY_CODE = new Map<string, string>();
for (const [k, code] of Object.entries(REGION_KEY_ALIASES)) {
  const iso = k.slice(0, k.indexOf('|'));
  if (!ISO_BY_CODE.has(code)) ISO_BY_CODE.set(code, iso);
}

/** 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 (생성기와 동일 규칙) */
export const normRegion = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** 구 지역명(또는 이미 변환된 코드)을 신 코드로. 못 찾으면 null */
export function resolveRegionCode(iso3: string, oldName: string): string | null {
  // 멱등: 이미 신 코드인 값이 그 국가 소속이면 그대로 돌려준다
  if (ISO_BY_CODE.get(oldName) === iso3) return oldName;
  return REGION_KEY_ALIASES[`${iso3}|${normRegion(oldName)}`] ?? null;
}

/** 이 구 키가 도시 흡수로 만들어졌는지 — 충돌 시 상위 주에 양보한다 */
const isCitySourced = (iso3: string, oldName: string): boolean =>
  CITY_KEYS.has(`${iso3}|${normRegion(oldName)}`);

/**
 * `${ISO3}|${구지역명}` 키 맵을 `${ISO3}|${코드}`로 재작성.
 * - 미매칭 키와 형식이 다른 키는 그대로 남긴다(삭제하지 않는다)
 * - 도시와 상위 주가 같은 코드로 접히면 상위 주 값이 이긴다(입력 순서 무관)
 */
export function migrateRegionKeyMap<V>(map: Record<string, V>): Record<string, V> {
  const next: Record<string, V> = {};
  const fromCity = new Set<string>();

  for (const [key, value] of Object.entries(map)) {
    const sep = key.indexOf('|');
    if (sep < 0) { next[key] = value; continue; }
    const iso3 = key.slice(0, sep);
    const oldName = key.slice(sep + 1);
    const code = resolveRegionCode(iso3, oldName);
    if (!code) { next[key] = value; continue; }

    const newKey = `${iso3}|${code}`;
    const city = isCitySourced(iso3, oldName);
    // 이미 상위 주 값이 들어와 있으면 도시 값은 버린다
    if (newKey in next && city) continue;
    // 도시 값이 먼저 들어와 있었다면 상위 주 값으로 덮는다
    if (newKey in next && !city && !fromCity.has(newKey)) continue;
    next[newKey] = value;
    if (city) fromCity.add(newKey); else fromCity.delete(newKey);
  }
  return next;
}

/** taggedRegions의 nameEn을 코드로. 한글명(name)은 건드리지 않고 코드 기준 중복 제거 */
export function migrateTaggedRegions<T extends { nameEn: string }>(
  m: Record<string, T[]>,
): Record<string, T[]> {
  const next: Record<string, T[]> = {};
  for (const [iso3, list] of Object.entries(m)) {
    if (!Array.isArray(list)) { next[iso3] = list; continue; }
    const seen = new Set<string>();
    const fromCity = new Set<string>();
    const out: T[] = [];
    for (const item of list) {
      if (!item || typeof item.nameEn !== 'string') continue;
      const code = resolveRegionCode(iso3, item.nameEn);
      if (!code) { out.push(item); continue; }
      const city = isCitySourced(iso3, item.nameEn);
      if (seen.has(code)) {
        // 이미 도시 유래로 들어간 자리는 상위 주 항목으로 교체한다
        if (city || !fromCity.has(code)) continue;
        const at = out.findIndex((x) => x.nameEn === code);
        if (at >= 0) out[at] = { ...item, nameEn: code };
        fromCity.delete(code);
        continue;
      }
      seen.add(code);
      if (city) fromCity.add(code);
      out.push({ ...item, nameEn: code });
    }
    next[iso3] = out;
  }
  return next;
}

/** 기록의 regionNameEn을 코드로. 미매칭이면 원본을 그대로 돌려준다 */
export function migrateRegionNameEn(iso3: string, nameEn: string): string {
  return resolveRegionCode(iso3, nameEn) ?? nameEn;
}

/**
 * 스킨별로 중첩된 지역 색까지 변환.
 * 이 함수를 빠뜨리면 스킨을 바꿔 쓰던 사용자만 색이 사라진다.
 */
export function migrateSkinColorStore<S extends { regionColors?: Record<string, string> }>(
  store: Record<string, S>,
): Record<string, S> {
  return Object.fromEntries(
    Object.entries(store).map(([skin, set]) => [
      skin, { ...set, regionColors: migrateRegionKeyMap(set?.regionColors ?? {}) },
    ]),
  ) as Record<string, S>;
}
