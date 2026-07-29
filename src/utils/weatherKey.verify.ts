// src/utils/weatherKey.verify.ts
import { normalizeWeather } from './weatherKey';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// canonical 6종은 자기 자신으로
for (const k of ['맑음', '부분흐림', '흐림', '비', '눈', '바람']) {
  eq(normalizeWeather(k), k, `canonical 유지: ${k}`);
}

// 별칭 — 과거 기록·가져오기 데이터
eq(normalizeWeather('화창'), '맑음', '별칭: 화창 → 맑음');
eq(normalizeWeather('구름많음'), '흐림', '별칭: 구름많음 → 흐림');
eq(normalizeWeather('소나기'), '부분흐림', '별칭: 소나기 → 부분흐림');
eq(normalizeWeather('천둥'), '비', '별칭: 천둥 → 비');
eq(normalizeWeather('폭설'), '눈', '별칭: 폭설 → 눈');
eq(normalizeWeather('안개'), '흐림', '별칭: 안개 → 흐림');

// 공백 표기 흔들림 흡수
eq(normalizeWeather('구름 조금'), '부분흐림', '공백 무시: 구름 조금');
eq(normalizeWeather(' 맑음 '), '맑음', '공백 무시: 앞뒤 여백');

// 모르는 값·빈값은 null → 호출부가 칩을 감춘다(뜻 모를 기본 아이콘 노출 방지)
eq(normalizeWeather('알수없음'), null, '미지의 표기 → null');
eq(normalizeWeather(''), null, '빈 문자열 → null');
eq(normalizeWeather(undefined), null, 'undefined → null');
eq(normalizeWeather(null), null, 'null → null');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
