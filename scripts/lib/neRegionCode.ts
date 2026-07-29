/**
 * Natural Earth 10m admin-1 코드 산출 — 별칭 표 생성기와 지오 생성기의 단일 진실 원천.
 *
 * 이 규칙이 두 곳에 복제되면 반드시 어긋나고, 어긋나는 순간 마이그레이션해둔 사용자
 * 저장 키(`${ISO3}|${CODE}`)와 지도의 CODE가 안 맞아 색이 하나도 안 뜬다 — 예외도
 * 로그도 없이 조용히. 규칙을 바꿔야 하면 반드시 여기서만 바꾼다.
 */
import { readFileSync } from 'node:fs';

/** 대륙 지도 대상 국가(ISO3) — countryGeo.LOADERS·ISO2_TO_GEO·REGION_COUNTRIES와 일치해야 한다 */
export const ISO3 = ['ARE','AUT','BRA','CAN','CHN','COL','DEU','EGY','ESP','FRA','GBR','GRC',
                     'ITA','JPN','KOR','MAR','MEX','MYS','NLD','PRT','SAU','THA','TUN','TUR','USA','VNM','ZAF'];

// 병합 대상국 — NE admin-1이 GADM Level-1보다 한 단계 아래라 상위로 묶는다
export const DISSOLVE: Record<string, 'region' | 'geonunit'> = {
  FRA: 'region', ITA: 'region', ESP: 'region', GBR: 'geonunit',
};

// NE 데이터 자체 결함 보정 — 같은 코드가 두 지역에 붙어 있다
const CODE_FIX: Record<string, string> = {
  'COL|Bogota': 'CO-DC',   // 쿤디나마르카와 CO-CUN 중복
  'ESP|Melilla': 'ES-ML',  // 세우타와 ES.CE 중복
};

/**
 * 1차 이름(name·name_en)이 겹치면서 최종 코드가 다른 피처 쌍의 승자를 못 박는다.
 * 못 박지 않으면 NE 피처 순서에 따라 승자가 바뀌어, 사용자의 워싱턴주 색이 어느 날
 * 조용히 D.C.로 간다. 여기 없는 새 충돌은 assert가 throw한다.
 */
const PRIMARY_NAME_WINNER: Record<string, string> = {
  'USA|washington': 'US-WA',  // 워싱턴주가 이긴다 — D.C.는 'districtofcolumbia'로 따로 잡힌다
  'MEX|mexico': 'MX-MEX',     // 멕시코주가 이긴다 — 연방구는 'distritofederal'로 따로 잡힌다
};

/**
 * 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 남김
 *
 * 결합 문자 범위는 반드시 `\u0300-\u036f` 이스케이프 표기로 적는다. 눈에 보이지 않는
 * 결합 문자를 소스에 리터럴로 박아 두면 다음 편집·복사·붙여넣기에서 조용히 사라지거나
 * 다른 문자로 바뀌어도 아무도 못 알아챈다(그 순간 별칭 표와 지오의 코드가 어긋난다).
 */
export const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// region_cod의 점 표기를 하이픈으로 통일 (ES.CE → ES-CE) + NE 원본의 공백류 오염 제거
// (Île-de-France 피처들의 region_cod가 "FR-IDF\t"처럼 탭이 섞여 들어온다)
const dash = (s: string): string => s.replace(/\./g, '-').replace(/\s+/g, '');

/** 최종 코드 형식 검증: `${ISO2}-${영숫자}` 꼴이 아니면 코드 자체가 오염된 것으로 본다 */
const CODE_RE = /^[A-Z]{2}-[A-Za-z0-9]+$/;

export interface NeProps {
  adm0_a3: string; name: string; name_en?: string; name_local?: string;
  name_alt?: string; gn_name?: string; woe_name?: string;
  name_ko?: string;
  iso_3166_2?: string; region?: string; region_cod?: string;
  geonunit?: string; gu_a3?: string; adm1_code?: string;
}

/**
 * NE geojson에서 대상 26개국 피처를 읽는다.
 * iso_3166_2가 '~'로 끝나는 것은 NE가 붙인 비공식/미분류 코드로 실제 행정구역이 아니다
 * (중립지대·남중국해 섬·미분류 잔재 폴리곤 등 5건: ARE 2·CHN 1·COL 1·MEX 1). 그중 UAE
 * "Neutral Zone"(AE-X01~)은 name_en이 "Fujairah"라서 두면 진짜 푸자이라와 충돌한다.
 */
export function loadNeFeatures(path: string): NeProps[] {
  return JSON.parse(readFileSync(path, 'utf8'))
    .features.map((f: any) => f.properties)
    .filter((p: NeProps) => ISO3.includes(p.adm0_a3))
    .filter((p: NeProps) => !(p.iso_3166_2 || '').endsWith('~'));
}

/** 피처 하나의 최종 코드 — 병합 대상국은 그룹 코드를 쓴다 */
export function codeOf(p: NeProps): string {
  const fix = CODE_FIX[`${p.adm0_a3}|${p.name}`];
  let code: string;
  if (fix) {
    code = fix;
  } else {
    const d = DISSOLVE[p.adm0_a3];
    if (d === 'geonunit') code = `GB-${p.gu_a3}`;
    else if (d === 'region') code = dash(p.region_cod || `${p.adm0_a3}-${norm(p.region || '')}`);
    else code = dash(p.iso_3166_2 || p.adm1_code || '');
  }
  if (!CODE_RE.test(code)) throw new Error(`코드 형식 이상: "${code}" (${p.adm0_a3} ${p.name})`);
  return code;
}

/** 1차 이름이 겹치면서 코드가 다른데 승자가 선언돼 있지 않으면 throw */
export function assertNoPrimaryNameConflict(feats: NeProps[]): void {
  const byKey = new Map<string, Set<string>>();
  for (const p of feats) {
    const code = codeOf(p);
    for (const f of ['name', 'name_en'] as const) {
      const v = p[f];
      if (!v) continue;
      const k = `${p.adm0_a3}|${norm(v)}`;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(code);
    }
  }
  const undeclared: string[] = [];
  for (const [k, codes] of byKey) {
    // 코드가 하나면 충돌이 아니다(영국 Halton 두 피처처럼 둘 다 GB-ENG로 접히는 경우 포함)
    if (codes.size < 2) continue;
    if (!PRIMARY_NAME_WINNER[k]) undeclared.push(`${k} → ${[...codes].join(' vs ')}`);
  }
  if (undeclared.length) {
    throw new Error(
      '1차 이름 충돌이 선언되지 않았다. neRegionCode.ts의 PRIMARY_NAME_WINNER에 승자를 못 박아라:\n  '
      + undeclared.join('\n  '),
    );
  }
}

/** 1차 이름 색인에 쓸 코드 — 승자가 선언된 키는 그 값으로 고정한다 */
export function primaryNameCode(iso: string, name: string, code: string): string {
  return PRIMARY_NAME_WINNER[`${iso}|${norm(name)}`] ?? code;
}
