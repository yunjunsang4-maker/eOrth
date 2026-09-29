// src/utils/timeAgo.verify.ts
// i18n/index.ts 는 expo-localization 때문에 노드에서 못 읽는다 — i18next를 ko/en 리소스로 직접 초기화한다.
import i18n from 'i18next';
import ko from '../i18n/locales/ko';
import en from '../i18n/locales/en';
import { timeAgo } from './timeAgo';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

(async () => {
  await i18n.init({
    resources: { ko: { translation: ko }, en: { translation: en } },
    lng: 'ko',
    fallbackLng: { ja: ['en', 'ko'], default: ['ko'] },
    interpolation: { escapeValue: false },
  });
  const NOW = Date.UTC(2026, 8, 29, 12);
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

  // 한국어 — 예전 하드코딩 문구와 같은 모양(초 단위만 '방금 전'으로 바뀜)
  eq(timeAgo(NOW - 5 * S, NOW), '방금 전', 'ko: 60초 미만 → 방금 전');
  eq(timeAgo(NOW - 3 * M, NOW), '3분 전', 'ko: 3분 전');
  eq(timeAgo(NOW - 2 * H, NOW), '2시간 전', 'ko: 2시간 전');
  eq(timeAgo(NOW - 3 * D, NOW), '3일 전', 'ko: 3일 전');
  eq(timeAgo(NOW - 14 * D, NOW), '2주 전', 'ko: 2주 전');
  eq(timeAgo(NOW - 60 * D, NOW), '2달 전', 'ko: 2달 전');

  // 핵심(11번): 영어에서 한국어가 나오지 않는다
  await i18n.changeLanguage('en');
  eq(timeAgo(NOW - 2 * H, NOW), '2h ago', 'en: 2h ago');
  eq(timeAgo(NOW - 14 * D, NOW), '2w ago', 'en: 2w ago');
  eq(timeAgo(NOW - 60 * D, NOW), '2mo ago', 'en: 2mo ago');

  // 부분 번역 언어는 fallbackLng(en)로 — 앱 설정과 같은 폴백 순서
  await i18n.changeLanguage('ja');
  eq(timeAgo(NOW - 3 * M, NOW), '3m ago', 'ja: time.* 없음 → 영어로 폴백(한국어 아님)');

  // 경계·널 계열
  eq(timeAgo(NaN, NOW), '', 'NaN → 빈 문자열');
  eq(timeAgo(NOW + 5 * M, NOW), 'just now', '미래 시각(서버 시계 앞섬) → 방금으로 클램프');
  eq(/^\d{4}\.\d{2}\.\d{2}$/.test(timeAgo(NOW - 400 * D, NOW)), true, '1년 넘으면 YYYY.MM.DD');

  if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
  console.log('\n✅ 모든 검증 통과');
})();
