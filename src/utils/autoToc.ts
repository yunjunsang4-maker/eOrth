/**
 * 온디바이스 블로그 목차 분석기 (순수 함수, 네트워크/LLM 미사용).
 * 본문 블록을 분석해 소제목(heading) 삽입 지점을 제안한다.
 * 여행 일기 패턴(일차/시간대) + 분량 기반 휴리스틱. 모호하면 보수적으로 제안하지 않는다.
 */
import {
  BlogBlock,
  TextBlock,
  HeadingLevel,
  createHeadingBlock,
} from '../types/blogBlocks';

export interface TocSuggestion {
  /** 이 블록 "앞에" heading을 삽입한다 */
  beforeBlockId: string;
  level: HeadingLevel;
  text: string;
}

// ─── 임계치 ───
const MIN_TEXT_BLOCKS = 3;
const MIN_TOTAL_CHARS = 150;
const EXISTING_HEADING_LIMIT = 2;
const SECTION_CHARS = 500;       // 구조 경계 + 이 분량 누적 시 약한 분할
const SECTION_CHARS_SOLO = 750;  // 신호 없이 분량만으로 분할하는 보수적 임계
const MAX_HEADING_LEN = 20;

// ─── 강한 신호 정규식 ───
// 일차: "1일차", "2일 차", "Day 3", "둘째 날"
const DAY_RE =
  /^\s*(?:(\d{1,2})\s*일\s*차|(?:Day|DAY|day)\s*(\d{1,2})|(첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|여덟째|아홉째|열째)\s*날)/;
// 시간대: 문단 첫머리 + 뒤에 공백/구두점/끝이 오는 경우만
const TIME_RE = /^\s*(새벽|아침|오전|점심|정오|낮|오후|저녁|밤)(?=[\s,.!?·\-—]|$)/;

function truncate(s: string): string {
  const t = s.trim();
  return t.length > MAX_HEADING_LEN ? t.slice(0, MAX_HEADING_LEN).trimEnd() + '…' : t;
}

/** 첫 문장/절(구두점·줄바꿈 전까지)을 다듬어 반환 */
function firstClause(text: string): string {
  const m = text.match(/^[^\n.!?]{1,80}/);
  const clause = (m ? m[0] : text).trim();
  return truncate(clause);
}

/** 신호 라벨 뒤 짧은 보조 문구 추출 */
function trailingExtra(rest: string): string {
  const cleaned = rest.replace(/^[\s,:·\-—]+/, '');
  const m = cleaned.match(/^[^\n.!?]{1,20}/);
  return m ? m[0].trim() : '';
}

function makeDayLabel(m: RegExpMatchArray, text: string): string {
  let label = '';
  if (m[1]) label = `${m[1]}일차`;
  else if (m[2]) label = `${m[2]}일차`;
  else if (m[3]) label = `${m[3]} 날`;
  const extra = trailingExtra(text.slice(m[0].length));
  return extra ? truncate(`${label} — ${extra}`) : label;
}

function makeTimeLabel(marker: string, text: string): string {
  const idx = text.indexOf(marker);
  const extra = trailingExtra(text.slice(idx + marker.length));
  return extra ? truncate(`${marker} — ${extra}`) : marker;
}

export function analyzeForToc(blocks: BlogBlock[]): TocSuggestion[] {
  // ─── 게이트 ───
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text');
  if (textBlocks.length < MIN_TEXT_BLOCKS) return [];
  const totalChars = textBlocks.reduce((n, b) => n + b.value.trim().length, 0);
  if (totalChars < MIN_TOTAL_CHARS) return [];
  const existingHeadings = blocks.filter(b => b.type === 'heading').length;
  if (existingHeadings >= EXISTING_HEADING_LIMIT) return [];

  // ─── 구획 분할 ───
  const suggestions: TocSuggestion[] = [];
  let charsSinceLast = 0;
  let lastWasBreak = false;

  for (const b of blocks) {
    if (b.type !== 'text') {
      if (b.type === 'image' || b.type === 'images' || b.type === 'video' || b.type === 'separator') {
        lastWasBreak = true;
      }
      continue;
    }
    const text = b.value.trim();
    if (!text) continue;

    let heading: string | null = null;
    const dayMatch = text.match(DAY_RE);
    const timeMatch = text.match(TIME_RE);
    if (dayMatch) {
      heading = makeDayLabel(dayMatch, text);
    } else if (timeMatch) {
      heading = makeTimeLabel(timeMatch[1], text);
    } else if (lastWasBreak && charsSinceLast >= SECTION_CHARS) {
      heading = firstClause(text);
    } else if (charsSinceLast >= SECTION_CHARS_SOLO) {
      heading = firstClause(text);
    }

    if (heading) {
      suggestions.push({ beforeBlockId: b.id, level: 2, text: heading });
      charsSinceLast = 0;
    } else {
      charsSinceLast += text.length;
    }
    lastWasBreak = false;
  }

  // ─── 검증: 중복 제거 + 빈 텍스트 제외 ───
  const seen = new Set<string>();
  const deduped = suggestions.filter(s => {
    if (!s.text || seen.has(s.beforeBlockId)) return false;
    seen.add(s.beforeBlockId);
    return true;
  });

  // 소제목이 1개뿐이면 목차 의미 없음
  if (deduped.length < 2) return [];
  return deduped;
}

/** 선택된 제안을 반영한 새 블록 배열 반환(불변). */
export function applyTocSuggestions(
  blocks: BlogBlock[],
  accepted: TocSuggestion[],
): BlogBlock[] {
  if (accepted.length === 0) return blocks;
  const byBlock = new Map<string, TocSuggestion>();
  accepted.forEach(s => byBlock.set(s.beforeBlockId, s));
  const result: BlogBlock[] = [];
  for (const b of blocks) {
    const s = byBlock.get(b.id);
    if (s) result.push(createHeadingBlock(s.text, s.level));
    result.push(b);
  }
  return result;
}
