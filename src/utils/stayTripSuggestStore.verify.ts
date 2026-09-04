// 제안 대기 목록 저장소의 순수 부분 검증 (만료·병합·스누즈·파싱)
//
// 영속(AsyncStorage) 쪽은 검증 대상이 아니다 — 이 저장소에는 테스트 러너·목이 없다.
// 순수 함수만 여기서 못 박고, 영속 경로는 실기기 체크리스트로 넘긴다.
import {
  prunePending, mergePending, visibleSuggestions, snoozeSuggestion, removeSuggestions,
  parsePending, parseDismissed, SUGGESTION_TTL_MS, SNOOZE_MS,
} from './stayTripSuggestStore';
import type { TripSuggestion } from './stayTripSuggest';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const H = 3600_000;
const D = 24 * H;
const NOW = 1757200000000;
const mk = (key: string, detectedAt: number, extra: Partial<TripSuggestion> = {}): TripSuggestion => ({
  key, country: '🇨🇿 체코', countryCode: 'CZ', countryName: '체코', countryFlag: '🇨🇿',
  startDate: '2026.09.05', endDate: '2026.09.06', photoCount: 6,
  photos: [{ uri: 'ph://a' }], lastPhotoAt: detectedAt - D, detectedAt, ...extra,
});

// 만료 — 감지 후 7일이 지나면 조용히 사라진다
eq(prunePending([mk('a', NOW - 8 * D), mk('b', NOW - D)], NOW).map((s) => s.key), ['b'], '7일 지난 제안 제거');
eq(prunePending([mk('a', NOW - 7 * D)], NOW).length, 1, '정확히 7일 = 아직 유지(경계 포함)');
eq(prunePending([], NOW), [], '빈 목록');
// 시계 이상 — 미래 detectedAt은 버린다(fabHighlight와 같은 방어)
eq(prunePending([mk('f', NOW + D)], NOW), [], '미래 시각 제안 제거');

// 병합 — 기존 항목은 detectedAt·snooze를 보존하고 새 키만 뒤에 붙는다
{
  const prev = [mk('a', NOW - 2 * D, { snoozeUntil: NOW + H })];
  const fresh = [mk('a', NOW), mk('b', NOW)];
  const out = mergePending(prev, fresh, NOW);
  eq(out.map((s) => s.key), ['a', 'b'], '병합: 순서 = 기존 → 새 키');
  eq(out[0].detectedAt, NOW - 2 * D, '병합: 기존 detectedAt 보존(소멸 시계가 리셋되지 않는다)');
  eq(out[0].snoozeUntil, NOW + H, '병합: 기존 스누즈 보존');
  eq(out[1].detectedAt, NOW, '병합: 새 항목 detectedAt = now');
}
// 병합은 만료도 함께 — 재검사 시점에 죽은 항목이 되살아나지 않는다
eq(mergePending([mk('old', NOW - 9 * D)], [], NOW), [], '병합: 만료 항목은 새 목록에서 빠진다');
// 사진 목록은 새 스캔 결과로 갱신 — 같은 키인데 사진이 더 잡혔으면 최신을 쓴다
{
  const out = mergePending([mk('a', NOW - D, { photoCount: 5 })], [mk('a', NOW, { photoCount: 7 })], NOW);
  eq(out[0].photoCount, 7, '병합: 사진 수는 최신 스캔');
}

// 표시 — 스누즈 중인 항목은 숨긴다
{
  const list = [mk('a', NOW, { snoozeUntil: NOW + H }), mk('b', NOW, { snoozeUntil: NOW - 1 }), mk('c', NOW)];
  eq(visibleSuggestions(list, NOW).map((s) => s.key), ['b', 'c'], '표시: snoozeUntil이 지났거나 없는 것만');
}

// 스누즈 — 24시간
{
  const out = snoozeSuggestion([mk('a', NOW), mk('b', NOW)], 'a', NOW);
  eq(out[0].snoozeUntil, NOW + SNOOZE_MS, '스누즈: 해당 키에 now+24h');
  eq(out[1].snoozeUntil, undefined, '스누즈: 다른 키는 그대로');
  eq(snoozeSuggestion([mk('a', NOW)], '없는키', NOW).length, 1, '스누즈: 없는 키는 무변화');
}

// 제거 — 카드 생성·거절 후
eq(removeSuggestions([mk('a', NOW), mk('b', NOW), mk('c', NOW)], ['a', 'c']).map((s) => s.key), ['b'], '제거: 여러 키');
eq(removeSuggestions([mk('a', NOW)], []).length, 1, '제거: 빈 키 목록 = 무변화');

// 파싱 — 저장된 JSON이 깨졌거나 형태가 다르면 빈 목록(부가 기능은 되살리지 않는다)
eq(parsePending(null), [], '파싱: null');
eq(parsePending('not json'), [], '파싱: 깨진 JSON');
eq(parsePending('{"a":1}'), [], '파싱: 배열 아님');
eq(parsePending(JSON.stringify([mk('a', NOW), { key: 'no-fields' }, null])).map((s) => s.key), ['a'], '파싱: 필드 빠진 항목만 버림');
// countryCode는 여행 id(파일 경로)와 키의 재료라 없으면 통째로 버려야 한다
// ('suggest-…-undefined-…' 폴더가 만들어지는 것을 막는다)
{
  const noCode = JSON.parse(JSON.stringify(mk('a', NOW))) as Record<string, unknown>;
  delete noCode.countryCode;
  eq(parsePending(JSON.stringify([noCode, mk('b', NOW)])).map((s) => s.key), ['b'], '파싱: countryCode 없는 항목은 버림');
  eq(parsePending(JSON.stringify([{ ...noCode, countryCode: '' }])).length, 0, '파싱: countryCode 빈 문자열도 버림');
}
eq(parseDismissed(null), [], '파싱(거절): null');
eq(parseDismissed('["a", 1, "b", ""]'), ['a', 'b'], '파싱(거절): 문자열만');

eq(SUGGESTION_TTL_MS, 7 * D, 'TTL = 7일');
eq(SNOOZE_MS, 24 * H, '스누즈 = 24시간');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
