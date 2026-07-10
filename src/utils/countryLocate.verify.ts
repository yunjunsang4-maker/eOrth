/**
 * countryLocate 검증 — npx tsx src/utils/countryLocate.verify.ts
 * 대표 좌표가 올바른 ISO2로 판정되는지, 바다는 null인지 확인한다.
 */
import { locateCountry } from './countryLocate';

const CASES: { name: string; lat: number; lon: number; expect: string | null }[] = [
  { name: '도쿄',        lat: 35.6762,  lon: 139.6503,  expect: 'JP' },
  { name: '오사카',      lat: 34.6937,  lon: 135.5023,  expect: 'JP' },
  { name: '서울',        lat: 37.5665,  lon: 126.9780,  expect: 'KR' },
  { name: '부산',        lat: 35.1796,  lon: 129.0756,  expect: 'KR' },
  { name: '파리',        lat: 48.8566,  lon: 2.3522,    expect: 'FR' },
  { name: '런던',        lat: 51.5074,  lon: -0.1278,   expect: 'GB' },
  { name: '뉴욕',        lat: 40.7128,  lon: -74.0060,  expect: 'US' },
  { name: '방콕',        lat: 13.7563,  lon: 100.5018,  expect: 'TH' },
  { name: '시드니',      lat: -33.8688, lon: 151.2093,  expect: 'AU' },
  { name: '로마',        lat: 41.9028,  lon: 12.4964,   expect: 'IT' },
  { name: '베를린',      lat: 52.5200,  lon: 13.4050,   expect: 'DE' },
  { name: '타이베이',    lat: 25.0330,  lon: 121.5654,  expect: 'TW' },
  { name: '하노이',      lat: 21.0285,  lon: 105.8542,  expect: 'VN' },
  { name: '모스크바',    lat: 55.7558,  lon: 37.6173,   expect: 'RU' },
  { name: '태평양(바다)', lat: 20,      lon: -160,      expect: null },
];

let pass = 0, fail = 0;
const t0 = Date.now();
for (const c of CASES) {
  const r = locateCountry(c.lat, c.lon);
  const got = r?.code ?? null;
  const ok = got === c.expect;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: expect=${c.expect} got=${got}${r ? ` (${r.name})` : ''}`);
}
// 성능 — 인덱스 빌드 후 1만 회 판정 시간
const t1 = Date.now();
for (let i = 0; i < 10000; i++) locateCountry(35 + (i % 10) * 0.01, 135 + (i % 10) * 0.01);
const t2 = Date.now();
console.log(`\n초기화+15케이스: ${t1 - t0}ms / 판정 1만회: ${t2 - t1}ms`);
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
if (fail > 0) process.exit(1);
