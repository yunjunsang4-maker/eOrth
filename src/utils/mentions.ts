// 댓글 @언급(mention) 순수 로직 — 표시·자동완성·답글 접두사에 공통으로 쓴다.
//
// 저장 방식은 A안이다(설계 2026-09-09): comments.text 에 `@아이디` 텍스트만 저장하고
// 컬럼을 늘리지 않는다. 서버 트리거(notify_on_mention)가 같은 규칙으로 본문을 다시 파싱해
// 알림을 만들기 때문에, **여기의 토큰 규칙과 schema.sql 의 정규식은 반드시 같아야 한다.**
// 한쪽만 바꾸면 "보라색으로 보이는데 알림은 안 오는" 조용한 어긋남이 생긴다.
//
// React 의존이 없는 순수 함수만 둔다(mentions.verify.ts 로 검증).

/**
 * 언급 토큰 규칙 — `@` + 아이디(`[A-Za-z0-9_]{4,30}`).
 * 아이디 형식은 앱의 HANDLE_RE(EditProfileScreen.tsx:29)와 동일하다.
 *
 * 앞뒤 경계를 왜 이렇게 두는가:
 *  - 앞 `(^|[^A-Za-z0-9_])` — `@` 바로 앞이 아이디 문자면 토큰이 아니다. 이메일
 *    `a@bcde` 의 `@bcde` 가 언급으로 잡히면 엉뚱한 사람에게 알림이 간다.
 *  - 뒤 `(?![A-Za-z0-9_])` — 뒤에 아이디 문자가 이어지면 토큰이 아니다. 31자 이상
 *    아이디는 존재할 수 없으므로 앞 30자만 잘라 매칭하는 오탐을 막는다.
 *
 * ⚠️ 앞 경계는 lookbehind(후방 탐색) 대신 **캡처 그룹 1번**으로 잡는다. Hermes 는
 *    lookbehind 지원이 버전에 따라 흔들려, 런타임에서만 조용히 깨질 수 있어서다.
 *    따라서 매치 시작 위치는 `m.index + m[1].length` 이고 아이디는 `m[2]` 다.
 */
export const MENTION_HANDLE_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,30})(?![A-Za-z0-9_])/g;

/** 아이디에 쓰일 수 있는 문자 1개인가 */
function isHandleChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z')
    || (ch >= 'A' && ch <= 'Z')
    || (ch >= '0' && ch <= '9')
    || ch === '_';
}

/**
 * 스캔용 정규식을 매번 새로 만든다.
 * 전역(`g`) 정규식은 `lastIndex` 를 들고 다니는 상태 객체라, 모듈 상수를 여러 함수가
 * 공유하면 앞선 호출이 남긴 위치부터 스캔해 결과가 조용히 달라진다.
 */
function scanner(): RegExp {
  return new RegExp(MENTION_HANDLE_RE.source, 'g');
}

/** 렌더용 세그먼트 — mention 의 value 는 `@` 포함 원문, handle 은 `@` 없는 아이디 */
export interface MentionSegment {
  type: 'text' | 'mention';
  value: string;
  handle?: string;
}

/**
 * 본문을 텍스트/언급 세그먼트로 쪼갠다(MentionText 렌더용).
 * 세그먼트 value 를 모두 이으면 원문과 정확히 같다 — 한 글자도 잃거나 더하지 않는다.
 */
export function splitMentions(text: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  if (!text) return out;
  const re = scanner();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length; // `@` 위치 (캡처 1번은 앞 경계 문자라 건너뛴다)
    const end = start + 1 + m[2].length;
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) });
    out.push({ type: 'mention', value: text.slice(start, end), handle: m[2] });
    last = end;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/**
 * 본문에 등장한 아이디 목록 — 소문자 정규화·중복 제거·등장 순.
 * 소문자로 맞추는 이유: 서버의 아이디 유일성이 `lower(handle)` 기준이라
 * `@User` 와 `@user` 는 같은 사람이다.
 */
export function extractMentionHandles(text: string): string[] {
  if (!text) return [];
  const re = scanner();
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = m[2].toLowerCase();
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

/** 자동완성이 지금 편집 중인 토큰의 범위와 검색어 */
export interface ActiveMention {
  start: number; // `@` 의 인덱스
  end: number;   // 커서 위치 (교체 대상의 끝)
  query: string; // `@` 다음부터 커서 앞까지 — 0자 이상
}

/**
 * 커서 바로 앞에서 편집 중인 `@토큰`을 찾는다. 없으면 null.
 *
 * - 검색어는 0자 이상이다(`@` 만 친 순간부터 후보를 띄운다).
 * - **커서까지만** 범위로 잡는다. 커서가 토큰 한가운데여도 뒤쪽 글자는 건드리지 않는다
 *   (오타를 고치려고 중간에 커서를 둔 것일 수 있어, 뒤를 통째로 지우면 사용자가 놀란다).
 * - `@` 앞이 아이디 문자면 언급이 아니다(이메일 방어 — MENTION_HANDLE_RE 주석 참조).
 */
export function findActiveMention(text: string, cursor: number): ActiveMention | null {
  if (!text) return null;
  const pos = Math.max(0, Math.min(cursor, text.length));
  let i = pos - 1;
  // 커서 앞의 아이디 문자열을 거슬러 올라간다. 31자를 넘으면 유효한 아이디가 될 수 없다.
  while (i >= 0 && isHandleChar(text[i])) {
    if (pos - i > 31) return null;
    i -= 1;
  }
  if (i < 0 || text[i] !== '@') return null;
  if (i > 0 && isHandleChar(text[i - 1])) return null; // 이메일 등 — `@` 앞이 아이디 문자
  const query = text.slice(i + 1, pos);
  if (query.length > 30) return null;
  return { start: i, end: pos, query };
}

/**
 * 후보를 골랐을 때 본문을 갱신한다 — 범위를 `@아이디 `(뒤 공백 1개)로 교체.
 * 공백을 붙이는 이유: 공백이 없으면 다음 글자가 아이디에 붙어 토큰이 깨지고,
 * 사용자가 매번 스페이스를 직접 눌러야 한다.
 */
export function applyMention(
  text: string,
  range: { start: number; end: number },
  handle: string,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  const inserted = `@${handle} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    cursor: start + inserted.length,
  };
}

/**
 * 후보로 쓸 수 있는 아이디인가 — `MENTION_HANDLE_RE` 의 아이디 부분과 **같은 규칙**이다.
 * (전역 플래그가 없어야 한다. `test()` 를 반복 호출할 때 `lastIndex` 가 남으면 결과가 튄다)
 */
const CANDIDATE_HANDLE_RE = /^[A-Za-z0-9_]{4,30}$/;

/**
 * 자동완성 후보 걸러내기 — **아이디 형식 검사**, 접두 일치(대소문자 무시), 나 제외,
 * 아이디 중복 제거, 상한.
 *
 * 서버 검색을 하지 않는다(설계 결정). 후보는 호출부가 모아 온 로컬 데이터
 * (내 메이트 + 글 작성자 + 이 글의 댓글 작성자)이므로 순서도 호출부 의도를 그대로 지킨다.
 * 검색어가 빈 문자열이면(= `@` 만 친 상태) 상한까지 전부 보여준다.
 *
 * ⚠️ 형식 검사를 **여기서** 하는 이유: 후보의 아이디 자리에는 폴백 표시명이 섞여 들어온다.
 *    `social.ts` 의 `p.handle || '여행자'`, `recordStore` 의 `handle || '나'`,
 *    메이트의 `p.handle || p.id`(uuid) 가 그 예다. 이런 값을 칩으로 띄우면 탭했을 때
 *    `@여행자 ` / `@<uuid> ` 가 본문에 박히는데, 한글이거나 `-` 가 섞이고 30자를 넘어서
 *    `MENTION_HANDLE_RE` 에도 서버 `notify_on_mention` 정규식에도 잡히지 않는다.
 *    보라 강조도 안 되고 알림도 안 가는 "태그했는데 아무 일도 없는" 죽은 토큰이 된다.
 *    호출부(화면) 3곳에 같은 검사를 흩뿌리는 대신 유틸 한 곳에서 막는다.
 */
export function filterMentionCandidates<T extends { handle: string }>(
  candidates: T[],
  query: string,
  opts?: { exclude?: string; limit?: number },
): T[] {
  const limit = opts?.limit ?? 8;
  if (!candidates || candidates.length === 0 || limit <= 0) return [];
  // 호출부가 `@` 를 포함해 넘겨도 같게 동작하도록 앞의 `@` 는 떼고 본다.
  const q = query.trim().replace(/^@/, '').toLowerCase();
  const ex = (opts?.exclude ?? '').trim().replace(/^@/, '').toLowerCase();
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    const h = (c?.handle ?? '').trim().toLowerCase();
    if (!h) continue;
    if (!CANDIDATE_HANDLE_RE.test(h)) continue; // 표시명·uuid 폴백 제거(위 주석)
    if (ex && h === ex) continue;
    if (seen.has(h)) continue; // 첫 등장만 남긴다(메이트 목록과 댓글 작성자가 겹친다)
    if (q && !h.startsWith(q)) continue;
    seen.add(h);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** 답글 입력창에 미리 채워 둘 접두사 — `@아이디 ` (뒤 공백 1개) */
export function buildReplyPrefix(handle: string): string {
  return `@${handle} `;
}

/**
 * 답글 접두사를 보장한다 — 이미 그 사람으로 시작하면 그대로 둔다(중복 삽입 방지).
 * 같은 답글 버튼을 두 번 눌러도 `@a @a ` 가 되지 않아야 한다.
 *
 * 경계를 함께 본다: 접두사 판정을 문자열 시작만으로 하면 `@username…` 으로 시작하는
 * 본문에 `@user` 답글 접두사가 "이미 있다"고 오판해 엉뚱한 사람에게 답글이 간다.
 */
export function ensureReplyPrefix(text: string, handle: string): string {
  const h = (handle ?? '').trim();
  if (!h) return text;
  const prefix = `@${h}`;
  const body = text ?? '';
  if (body.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    const next = body[prefix.length];
    if (next === undefined || !isHandleChar(next)) return body;
  }
  return buildReplyPrefix(h) + body;
}
