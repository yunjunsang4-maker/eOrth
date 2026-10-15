/**
 * 블로그 텍스트 블록의 글자 단위 서식(spans) 순수 로직.
 * react-native를 import하지 않는다 — richText.verify.ts가 node(tsx)에서 직접 돌린다.
 *
 * 불변식: spans의 text를 이어 붙이면 블록 value와 같다.
 * 작성 화면은 TextInput children을 spans로 그리는데, RN iOS는 네이티브 텍스트와 새 children
 * 텍스트가 같으면(한글 자판일 땐 문자열만 비교) attributed text를 다시 넣지 않는다. 그래서
 * applyTextChange 결과가 onChangeText로 받은 문자열과 '정확히' 같아야 한글 조합이 안 깨진다.
 */
import type { SpanStyle, TextSpan } from '../types/blogBlocks';

export const SPAN_STYLE_KEYS = [
  'bold', 'italic', 'underline', 'strikethrough', 'color', 'bgColor', 'fontSize', 'fontFamily',
] as const;

const BOOL_KEYS = ['bold', 'italic', 'underline', 'strikethrough'] as const;

/** 객체에서 서식 필드만 뽑는다(undefined는 버린다). 블록 서식·span 서식 공용 */
export function pickStyle(o: SpanStyle): SpanStyle {
  const out: Record<string, unknown> = {};
  for (const k of SPAN_STYLE_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out as SpanStyle;
}

const sameStyle = (a: SpanStyle, b: SpanStyle) => SPAN_STYLE_KEYS.every(k => a[k] === b[k]);

/** 불변식을 지키는 spans면 그대로, 없거나 깨졌으면 null */
export function validSpans(block: { value: string; spans?: TextSpan[] }): TextSpan[] | null {
  const sp = block.spans;
  if (!Array.isArray(sp) || sp.length === 0) return null;
  if (!sp.every(s => s && typeof s.text === 'string')) return null;
  return sp.map(s => s.text).join('') === block.value ? sp : null;
}

/** 편집용 spans — 유효하지 않으면 value 통째로 서식 없는 span 하나 */
export function spansOf(block: { value: string; spans?: TextSpan[] }): TextSpan[] {
  return validSpans(block) ?? (block.value ? [{ text: block.value }] : []);
}

/** 서식이 같은 이웃 span을 합치고 빈 span을 지운다 */
export function normalize(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, s)) out[out.length - 1] = { ...last, text: last.text + s.text };
    else out.push({ ...s });
  }
  return out;
}

/** 저장용 — 서식 있는 span이 하나도 없으면 undefined(옛 글과 같은 모양을 유지) */
export function compactSpans(spans: TextSpan[]): TextSpan[] | undefined {
  const n = normalize(spans);
  return n.some(s => SPAN_STYLE_KEYS.some(k => s[k] !== undefined)) ? n : undefined;
}

/** pos 위치에 span 경계를 만든다 */
function splitAt(spans: TextSpan[], pos: number): TextSpan[] {
  const out: TextSpan[] = [];
  let off = 0;
  for (const s of spans) {
    const end = off + s.text.length;
    if (pos > off && pos < end) {
      out.push({ ...s, text: s.text.slice(0, pos - off) }, { ...s, text: s.text.slice(pos - off) });
    } else out.push(s);
    off = end;
  }
  return out;
}

/** i번째 글자의 span 서식 (범위 밖이면 null) */
function styleOfChar(spans: TextSpan[], i: number): SpanStyle | null {
  let off = 0;
  for (const s of spans) {
    if (i >= off && i < off + s.text.length) return pickStyle(s);
    off += s.text.length;
  }
  return null;
}

/** [start, end) 범위에 patch 서식을 적용 */
export function applyStyle(spans: TextSpan[], start: number, end: number, patch: SpanStyle): TextSpan[] {
  const len = spans.reduce((n, s) => n + s.text.length, 0);
  const a = Math.max(0, Math.min(start, end)), b = Math.min(len, Math.max(start, end));
  if (a >= b) return normalize(spans);
  let off = 0;
  const parts = splitAt(splitAt(spans, a), b).map(s => {
    const from = off;
    off += s.text.length;
    return from >= a && off <= b ? { ...s, ...patch } : s;
  });
  return normalize(parts);
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * 평문 변경을 spans에 반영. 결과 spans를 이어 붙이면 반드시 newText다(IME 불변식).
 * - 바뀐 구간 = 이전·새 평문의 공통 앞부분/뒷부분 사이. 서로게이트 쌍(이모지) 중간은 자르지 않는다.
 * - caret: 변경 직전 커서 시작. 같은 글자가 반복될 때("aa"→"aaa") 변경 위치를 커서 쪽으로 고정한다.
 *   caret 위치로는 설명이 안 되는 변경이면(낡은 caret) 무시한다.
 * - 새 글자 서식: 지운 글자가 있으면 그 첫 글자 서식(한글 조합 "ㅎ"→"하"가 서식을 잃지 않게),
 *   없으면 바로 앞 글자, 맨 앞이면 뒤 글자 — RN 네이티브 typingAttributes와 같은 규칙.
 *   pendingStyle은 그 위에 덮는다.
 */
export function applyTextChange(
  spans: TextSpan[], newText: string, pendingStyle?: SpanStyle | null, caret?: number,
): TextSpan[] {
  const old = spans.map(s => s.text).join('');
  if (old === newText) return spans;
  const max = Math.min(old.length, newText.length);
  let p = 0;
  while (p < max && old.charCodeAt(p) === newText.charCodeAt(p)) p++;
  if (p > 0 && isHigh(old.charCodeAt(p - 1))) p--;
  let s = 0;
  while (s < max - p && old.charCodeAt(old.length - 1 - s) === newText.charCodeAt(newText.length - 1 - s)) s++;
  if (s > 0 && isLow(old.charCodeAt(old.length - s))) s--;
  // caret 고정: 같은 길이의 변경을 caret 위치에 놓아도 앞뒤가 맞을 때만 쓴다. 맞지 않으면(낡은 caret)
  // 무시하고 기본 diff — 안 그러면 caret~실제 변경점 사이 글자가 '지웠다 다시 쓴' 것으로 처리돼 서식을 잃는다.
  if (caret !== undefined && caret >= 0 && caret < p && !isHigh(old.charCodeAt(caret - 1))) {
    const delLen = old.length - p - s, insLen = newText.length - p - s;
    if (old.slice(caret + delLen) === newText.slice(caret + insLen)) {
      p = caret;
      s = old.length - caret - delLen;
    }
  }

  const delEnd = old.length - s;
  const ins = newText.slice(p, newText.length - s);
  const inherited =
    (delEnd > p ? styleOfChar(spans, p) : null) ??
    (p > 0 ? styleOfChar(spans, p - 1) : styleOfChar(spans, delEnd)) ?? {};

  let off = 0;
  const before: TextSpan[] = [], after: TextSpan[] = [];
  for (const sp of splitAt(splitAt(spans, p), delEnd)) {
    const from = off;
    off += sp.text.length;
    if (off <= p) before.push(sp);
    else if (from >= delEnd) after.push(sp);
  }
  return normalize([...before, { text: ins, ...inherited, ...pendingStyle }, ...after]);
}

/**
 * 선택 범위(또는 커서)의 실효 서식 — 툴바·피커 활성 표시용. base는 블록 서식.
 * 범위: 굵게 등은 범위 전체가 켜져 있을 때만 true, 색·크기·글꼴은 전부 같을 때만 값.
 * 커서: 다음에 입력할 글자가 물려받을 서식(바로 앞 글자, 맨 앞이면 뒤 글자).
 */
export function styleAt(spans: TextSpan[], start: number, end: number, base: SpanStyle = {}): SpanStyle {
  const a = Math.min(start, end), b = Math.max(start, end);
  const eff = (st: SpanStyle | null): SpanStyle => ({ ...base, ...(st ?? {}) });
  if (a === b) {
    const len = spans.reduce((n, s) => n + s.text.length, 0);
    return eff(styleOfChar(spans, a > 0 ? Math.min(a, len) - 1 : 0));
  }
  const styles: SpanStyle[] = [];
  let off = 0;
  for (const s of spans) {
    const from = off;
    off += s.text.length;
    if (off > a && from < b) styles.push(eff(pickStyle(s)));
  }
  if (styles.length === 0) return eff(null);
  const out: Record<string, unknown> = {};
  for (const k of SPAN_STYLE_KEYS) {
    if ((BOOL_KEYS as readonly string[]).includes(k)) {
      if (styles.every(x => !!x[k])) out[k] = true;
    } else if (styles.every(x => x[k] === styles[0][k]) && styles[0][k] !== undefined) {
      out[k] = styles[0][k];
    }
  }
  return out as SpanStyle;
}

/**
 * 그리기용 조각 — span을 줄바꿈 뒤에서 쪼개고 문단(줄바꿈 단위)마다 가장 큰 글자 크기(lineSize)를 붙인다.
 * iOS는 문단 첫 글자의 줄 높이를 문단 전체에 쓰므로, span마다 제 크기로 lineHeight를 주면
 * 작은 글자로 시작한 문단의 큰 글자가 잘린다 → 문단 안에선 가장 큰 글자 기준으로 통일한다.
 * 텍스트는 바꾸지 않는다(이어 붙이면 원문 그대로 — IME 불변식 유지).
 */
export function layoutRuns(spans: TextSpan[], baseSize: number): { text: string; style: SpanStyle; lineSize: number }[] {
  const pieces: { text: string; style: SpanStyle; para: number }[] = [];
  let para = 0;
  for (const s of spans) {
    const style = pickStyle(s);
    let from = 0;
    while (from < s.text.length) {
      const nl = s.text.indexOf('\n', from);
      const to = nl < 0 ? s.text.length : nl + 1; // 줄바꿈은 앞 문단에 붙인다
      pieces.push({ text: s.text.slice(from, to), style, para });
      if (nl >= 0) para++;
      from = to;
    }
  }
  const maxSize: number[] = [];
  for (const pc of pieces) maxSize[pc.para] = Math.max(maxSize[pc.para] ?? 0, pc.style.fontSize ?? baseSize);
  return pieces.map(pc => ({ text: pc.text, style: pc.style, lineSize: maxSize[pc.para] }));
}
