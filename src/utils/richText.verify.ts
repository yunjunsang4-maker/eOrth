// src/utils/richText.verify.ts — 글자 단위 서식(spans) 순수 로직 검증
import {
  spansOf, validSpans, normalize, compactSpans, applyStyle, applyTextChange, styleAt, layoutRuns,
} from './richText';
import type { TextSpan } from '../types/blogBlocks';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}
const join = (sp: TextSpan[]) => sp.map(s => s.text).join('');
// 짝 없는 서로게이트(이모지 반쪽)가 span 안에 생기면 화면에 깨진 글자로 보인다
const hasLoneSurrogate = (sp: TextSpan[]) => sp.some(s => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s.text));

const AB_CD: TextSpan[] = [{ text: 'ab' }, { text: 'cd', bold: true }];

// ── 중간 삽입: 새 글자는 바로 앞 글자 서식(네이티브 typingAttributes와 같은 규칙)
eq(applyTextChange(AB_CD, 'abXcd', null, 2), [{ text: 'abX' }, { text: 'cd', bold: true }], '중간 삽입: 일반 글자 뒤 → 일반');
eq(applyTextChange(AB_CD, 'abcYd', null, 3), [{ text: 'ab' }, { text: 'cYd', bold: true }], '중간 삽입: 굵은 글자 뒤 → 굵게');
eq(applyTextChange([{ text: 'a', bold: true }, { text: 'b' }], 'Xab', null, 0), [{ text: 'Xa', bold: true }, { text: 'b' }], '맨 앞 삽입은 뒤 글자 서식');
eq(applyTextChange([], '가', null, 0), [{ text: '가' }], '빈 본문에 첫 글자');

// ── 삭제
eq(applyTextChange(AB_CD, 'ad', null, 1), [{ text: 'a' }, { text: 'd', bold: true }], '경계를 걸친 삭제');
eq(applyTextChange(AB_CD, '', null, 0), [], '전체 삭제 → 빈 spans');

// ── 범위 치환: 지운 첫 글자 서식을 이어받는다
eq(applyTextChange(AB_CD, 'aZd', null, 1), [{ text: 'aZ' }, { text: 'd', bold: true }], '범위 치환(b~c → Z): 첫 지운 글자 b의 서식');
eq(applyTextChange(AB_CD, 'abZ', null, 2), [{ text: 'ab' }, { text: 'Z', bold: true }], '굵은 범위를 덮어 쓰면 굵게 유지');

// ── pendingStyle: 커서에서 고른 서식은 다음 입력 글자에만, 물려받은 서식 위에 덮는다
eq(applyTextChange([{ text: 'abc' }], 'abcd', { bold: true }, 3), [{ text: 'abc' }, { text: 'd', bold: true }], 'pending 굵게 → 새 글자만 굵게');
eq(applyTextChange([{ text: 'ab', color: '#FF3B30' }], 'abc', { bold: true }, 2), [{ text: 'ab', color: '#FF3B30' }, { text: 'c', color: '#FF3B30', bold: true }], 'pending은 앞 글자 색 위에 덮는다');
eq(applyTextChange([{ text: 'ab', bold: true }], 'abc', { bold: false }, 2), [{ text: 'ab', bold: true }, { text: 'c', bold: false }], 'pending 굵게 끄기');

// ── 한글 조합: 조합 중 한 글자 교체가 서식을 잃으면 안 된다
let k: TextSpan[] = [{ text: '안녕' }];
k = applyTextChange(k, '안녕ㅎ', { bold: true }, 2);
k = applyTextChange(k, '안녕하', null, 3);
k = applyTextChange(k, '안녕한', null, 3);
eq(k, [{ text: '안녕' }, { text: '한', bold: true }], '조합 ㅎ→하→한: pending 굵게 유지');
k = applyTextChange(k, '안녕한ㄱ', null, 3);
k = applyTextChange(k, '안녕한글', null, 4);
eq(k, [{ text: '안녕' }, { text: '한글', bold: true }], '다음 음절도 앞 글자 서식(굵게) 이어받음');
eq(applyTextChange([{ text: '가' }, { text: '나', color: '#BF85FC' }, { text: '다' }], '가낙다', null, 1),
  [{ text: '가' }, { text: '낙', color: '#BF85FC' }, { text: '다' }], '가운데 색 글자 나→낙 교체: 색 유지');

// ── 같은 글자 반복: caret으로 변경 위치를 고정
eq(applyTextChange([{ text: 'a' }, { text: 'a', bold: true }], 'aaa', null, 1),
  [{ text: 'aa' }, { text: 'a', bold: true }], "'a|a(굵게)' 사이 입력 → 앞 글자(일반) 서식");
eq(applyTextChange([{ text: 'a' }, { text: 'a', bold: true }], 'aaa'),
  [{ text: 'a' }, { text: 'aa', bold: true }], 'caret 없으면 끝에 붙인 것으로 본다(차선)');
// 낡은 caret(QA LOW-1): caret 0으로는 'ab'→'abX'가 설명되지 않는다 → 무시하고 끝 삽입으로. 'b'의 굵게가 지워지면 안 된다
eq(applyTextChange([{ text: 'a' }, { text: 'b', bold: true }], 'abX', null, 0),
  [{ text: 'a' }, { text: 'bX', bold: true }], '낡은 caret(0)은 무시 — 사이 글자 서식 보존');
eq(applyTextChange([{ text: 'ab', color: '#FF3B30' }, { text: 'cd' }], 'abd', null, 0),
  [{ text: 'ab', color: '#FF3B30' }, { text: 'd' }], '낡은 caret(0) + 삭제: 앞 글자 색 보존');

// ── 이모지(서로게이트 쌍)
const emo = applyTextChange([{ text: '😀' }], '😁😀', { bold: true });
eq(emo, [{ text: '😁', bold: true }, { text: '😀' }], '이모지 앞에 이모지 삽입: 쌍 중간을 자르지 않음');
eq(hasLoneSurrogate(emo), false, '이모지 삽입 결과에 반쪽 서로게이트 없음');
const emo2 = applyTextChange([{ text: '😀', bold: true }, { text: '😀' }], '😀😁', { color: '#FF3B30' });
eq(emo2, [{ text: '😀', bold: true }, { text: '😁', color: '#FF3B30' }], '이모지 교체');
eq(hasLoneSurrogate(emo2), false, '이모지 교체 결과에 반쪽 서로게이트 없음');

// ── applyStyle: 선택 범위 서식 + 경계 쪼개기 + 합치기
const plain: TextSpan[] = [{ text: 'abcdef' }];
let b = applyStyle(plain, 2, 4, { bold: true });
eq(b, [{ text: 'ab' }, { text: 'cd', bold: true }, { text: 'ef' }], '범위 [2,4) 굵게 → 3조각');
b = applyStyle(b, 1, 5, { bold: true });
eq(b, [{ text: 'a' }, { text: 'bcde', bold: true }, { text: 'f' }], '겹치는 범위 굵게 → 이웃 합치기');
eq(applyStyle(b, 3, 6, { color: '#FF3B30' }),
  [{ text: 'a' }, { text: 'bc', bold: true }, { text: 'de', bold: true, color: '#FF3B30' }, { text: 'f', color: '#FF3B30' }],
  'span 경계를 걸친 색 적용: 기존 서식 유지하며 쪼갬');
eq(applyStyle(plain, 4, 2, { italic: true }), [{ text: 'ab' }, { text: 'cd', italic: true }, { text: 'ef' }], '뒤집힌 범위도 처리');
eq(applyStyle(plain, 3, 3, { bold: true }), plain, '빈 범위는 그대로');
eq(applyStyle(plain, -5, 99, { fontSize: 22 }), [{ text: 'abcdef', fontSize: 22 }], '범위 밖 값은 잘라낸다');

// ── normalize / compactSpans
eq(normalize([{ text: 'a', bold: true }, { text: '' }, { text: 'b', bold: true }, { text: 'c' }]),
  [{ text: 'ab', bold: true }, { text: 'c' }], '빈 span 제거 + 같은 서식 합치기');
eq(compactSpans([{ text: 'a' }, { text: 'b' }]), undefined, '서식 없는 spans는 저장 안 함(옛 글 모양 유지)');
eq(compactSpans([{ text: 'a' }, { text: 'b', bold: true }]), [{ text: 'a' }, { text: 'b', bold: true }], '서식 있으면 저장');

// ── 깨진 spans 폴백 (구버전 앱이 value만 고친 경우 등)
eq(spansOf({ value: 'abcd', spans: AB_CD }), AB_CD, '유효한 spans는 그대로');
eq(spansOf({ value: 'abcde', spans: AB_CD }), [{ text: 'abcde' }], 'value와 어긋난 spans → 평문 폴백');
eq(validSpans({ value: 'abcde', spans: AB_CD }), null, 'value와 어긋나면 validSpans null');
eq(spansOf({ value: 'ab', spans: [{ text: 'ab' }, { bold: true } as any] }), [{ text: 'ab' }], 'text 없는 span → 폴백');
eq(spansOf({ value: 'ab', spans: 'x' as any }), [{ text: 'ab' }], '배열 아님 → 폴백');
eq(spansOf({ value: 'ab' }), [{ text: 'ab' }], 'spans 없음(옛 글) → 평문 하나');
eq(spansOf({ value: '', spans: [{ text: 'x' }] }), [], '빈 value + 낡은 spans → 빈 배열');
eq(validSpans({ value: '', spans: [] }), null, '빈 spans 배열 → null');

// ── styleAt: 툴바·피커 활성 표시
const mix: TextSpan[] = [{ text: 'ab', bold: true, color: '#FF3B30' }, { text: 'cd', color: '#FF3B30' }];
eq(styleAt(mix, 0, 2), { bold: true, color: '#FF3B30' }, '범위 전체 굵게 → 굵게 켜짐');
eq(styleAt(mix, 1, 3), { color: '#FF3B30' }, '일부만 굵게 → 굵게 꺼짐, 공통 색은 유지');
eq(styleAt([{ text: 'a', fontSize: 13 }, { text: 'b', fontSize: 22 }], 0, 2), {}, '크기가 섞이면 크기 없음(체크 표시 없음)');
eq(styleAt(mix, 3, 3), { color: '#FF3B30' }, '커서: 바로 앞 글자 서식');
eq(styleAt(mix, 0, 0), { bold: true, color: '#FF3B30' }, '커서가 맨 앞: 첫 글자 서식');
eq(styleAt(mix, 99, 99), { color: '#FF3B30' }, '커서가 끝 너머(낡은 선택값): 마지막 글자 서식');
eq(styleAt([], 0, 0, { bold: true }), { bold: true }, '빈 본문: 블록 서식');
eq(styleAt([{ text: 'ab', bold: false }], 0, 2, { bold: true, fontSize: 18 }), { fontSize: 18 }, '블록 굵게 위에 span 굵게 끄기 → 꺼짐');

// ── layoutRuns: 문단마다 가장 큰 글자 기준 줄 높이, 텍스트는 그대로
const runs = layoutRuns([{ text: 'ab\nc' }, { text: 'd', fontSize: 26 }, { text: '\n\ne', fontSize: 13 }], 15);
eq(runs.map(r => [r.text, r.lineSize]), [['ab\n', 15], ['c', 26], ['d', 26], ['\n', 26], ['\n', 13], ['e', 13]], '줄바꿈 뒤에서 쪼개고 문단별 최대 크기');
eq(runs.map(r => r.text).join(''), 'ab\ncd\n\ne', 'layoutRuns는 텍스트를 바꾸지 않는다(IME 불변식)');

// ── IME 불변식 퍼즈: 무작위 편집을 거듭해도 spans를 이어 붙이면 언제나 새 평문
let seed = 7;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const POOL = ['a', 'b', '가', '나', 'ㅎ', '😀', '\n', ' '];
let fz: TextSpan[] = [];
let ok = true;
for (let i = 0; i < 500; i++) {
  const cur = join(fz);
  // 코드포인트 단위로 자르는 편집(실제 입력처럼 이모지를 반쪽 내지 않음)
  const cps = Array.from(cur);
  const at = rnd(cps.length + 1), del = rnd(3);
  const ins = Array.from({ length: rnd(3) }, () => POOL[rnd(POOL.length)]).join('');
  const next = [...cps.slice(0, at), ins, ...cps.slice(at + del)].join('');
  const caret = cps.slice(0, at).join('').length;
  fz = applyTextChange(fz, next, rnd(3) === 0 ? { bold: true } : null, caret);
  if (rnd(4) === 0) { const L = next.length; const x = rnd(L + 1), y = rnd(L + 1); fz = applyStyle(fz, x, y, { color: '#BF85FC' }); }
  if (join(fz) !== next || fz.some(s => !s.text)) { ok = false; console.error('  퍼즈 실패', i, JSON.stringify(next), JSON.stringify(fz)); break; }
}
eq(ok, true, '무작위 편집 500회: join(spans) === 새 평문, 빈 span 없음');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
