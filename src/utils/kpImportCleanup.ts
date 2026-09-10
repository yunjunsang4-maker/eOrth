/**
 * kpImportCleanup.ts
 * 잘못 만들어진 '북한 여행 카드'의 표지 기록을 골라내는 순수 함수.
 *
 * 왜 필요한가: 국가 판정이 110m 폴리곤을 쓰던 시절(~2026-09-09), 파주 임진각·도라산역 등
 * 남측 접경지에서 찍은 사진이 North Korea로 판정돼 과거여행 불러오기가 가본 적 없는
 * 북한 여행 카드를 만들었다. 폴리곤은 utils/countryLocate에서 10m로 고쳤지만, 이미 만들어져
 * 기기·서버에 남은 카드는 저절로 사라지지 않는다.
 *
 * ⚠️ 대상은 **불러오기가 만든 표지 기록(isImportCover)만**이다. 사용자가 손으로 만든 기록은
 *    절대 대상이 아니다. "이 앱 사용자는 북한에 갈 수 없다"는 전제로 지우는 것이지만,
 *    그 전제를 사용자가 직접 입력한 데이터에까지 적용하면 데이터 파괴다.
 */

/**
 * 북한을 가리키는 countryName 표기.
 *
 * ⚠️ **실제 저장값은 `'KP'`다** — ISO 코드 문자열 그 자체. 이게 목록의 첫 줄인 이유:
 *    불러오기 저장 경로가 `TravelImportScreen.tsx`에서 `countryInfoFromCode(code)`를
 *    **폴백 이름 없이** 부르고, `COUNTRY_FLAGS['KP']`가 `undefined`(북한은
 *    `constants/countries.ts`의 COUNTRIES에 없다)라 `pastTripScan.ts`의
 *    `{ name: fallbackCountry || code }`가 `name = code = 'KP'`로 떨어진다.
 *    오프라인 폴리곤이 준 `'North Korea'`도, 역지오코딩이 준 로케일별 이름도 그 줄에서 버려진다.
 *    (그래서 사용자에게 보이는 카드 제목도 "KP 여행", 국기는 ✈️였다.)
 *
 * 나머지 4종은 방어용이다 — 지오코딩 폴백 경로가 이름을 넘기게 바뀌거나, `countries.ts`에
 * KP가 추가되면 그때부터는 그쪽 값이 저장된다.
 */
const KP_NAMES = new Set([
  'kp', // ← 실제 저장값
  'north korea',
  '북한',
  '조선민주주의인민공화국',
  'korea, north',
]);

/** countryName이 북한을 가리키는가. 대소문자·앞뒤 공백 무시. */
export function isNorthKoreaName(name?: string): boolean {
  if (!name) return false;
  return KP_NAMES.has(name.trim().toLowerCase());
}

/**
 * 오염 시기 커트오프 — 이 시각 **이전**에 만들어진 기록만 정리 대상이다.
 *
 * ⚠️ 이 값은 "오염이 멈추는 시점"이 아니다. **OTA가 전 사용자에게 퍼지는 데 걸리는 시간**을
 *    감싸는 여유다. 폴리곤 수정이 든 번들이 깔리기 전까지 옛 번들 기기는 계속 가짜 북한
 *    카드를 만든다 — 수정일(2026-09-10)로 잡으면 정작 이 작업의 발단이 된 카드부터
 *    커트오프 밖으로 빠진다(사용자 신고가 그날 들어왔다). 그래서 2026-10-01로 잡았다.
 *
 * ⚠️ **배포가 2026-10-01을 넘겨 밀리면 이 상수를 올려야 한다.** 안 그러면 그 사이 옛 번들이
 *    만든 오염 카드가 정리 대상에서 빠진다.
 *
 * ⚠️ 대가: 이 날짜 **이전**에 불러온 진짜 방북 카드는 함께 지워진다. 지금은 그 위험이 사실상
 *    0이다 — 글로벌 확장 전이라 현재 사용자 기반에서 방북 기록이 나올 수 없다.
 *    **글로벌 사용자가 실제로 붙은 뒤에는 이 상수를 더 올리지 마라.** 그때는 오탐(가짜 북한
 *    카드가 남는 것)보다 오삭제(진짜 여행이 지워지는 것)가 더 비싸진다.
 *
 * 왜 영속 플래그(스키마 번호)가 아니라 시각인가:
 *   플래그는 기기마다 상태가 갈린다 — A기기에서 정리가 끝나 플래그가 서면, 그 뒤 B기기에서
 *   동기화로 뒤늦게 넘어온 오염 카드를 A가 영영 안 잡는다. 커트오프는 상태가 없어서
 *   **어느 기기에서 언제 돌아도 같은 답**을 내고, 정리는 계속 멱등으로 남는다.
 *
 * 그리고 이게 없으면 안 되는 이유: **외국인 사용자는 실제로 북한에 갈 수 있다.** 이 앱은
 * 해외로 확장하므로, 커트오프 뒤에 생기는 KP 기록은 지오코딩이 확인해 준 **진짜 방북**이다.
 * 확인 없이 영구 삭제하면 그 사용자의 여행을 파괴한다.
 *
 * 구제 수단: 잘못 지워진 카드도 사진은 갤러리에 그대로 있으므로 다시 불러오면 복구된다.
 */
export const KP_CLEANUP_CUTOFF_MS = Date.parse('2026-10-01T00:00:00+09:00');

/**
 * 정리 대상 기록 id 목록. 조건 셋을 **동시 충족**해야 한다:
 *   ① `isImportCover === true` ② 북한 이름 ③ `timestamp < KP_CLEANUP_CUTOFF_MS`
 * 상태·저장소에 접근하지 않는다 — 삭제는 호출부(recordStore)의 deleteRecord가 한다.
 */
export function findWronglyImportedKpRecords<
  T extends { id: string; countryName?: string; isImportCover?: boolean; timestamp?: number }
>(records: T[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    if (r.isImportCover !== true) continue;
    if (!isNorthKoreaName(r.countryName)) continue;
    // timestamp가 없거나 숫자가 아닌 기록은 **대상에 포함**한다. `addImportedAlbum`이
    // 항상 `Date.now()`를 심으므로 값이 없다는 건 커트오프 이전에 만들어진 옛 기록이라는
    // 뜻이고, 그게 정확히 오염 시기다. 여기서 제외하면 잡아야 할 것을 놓친다.
    const t = r.timestamp;
    if (typeof t === 'number' && Number.isFinite(t) && t >= KP_CLEANUP_CUTOFF_MS) continue;
    out.push(r.id);
  }
  return out;
}
