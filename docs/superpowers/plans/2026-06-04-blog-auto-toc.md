# 블로그 AI 자동 목차 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그 발행 시 온디바이스 분석기가 본문을 분석해 소제목(heading 블록)을 제안하고, 사용자가 미리보기 모달에서 확인하면 본문에 직접 삽입하여 상세보기 목차가 자동 생성되게 한다.

**Architecture:** 순수 함수 분석기(`autoToc.ts`)가 `BlogBlock[]`을 받아 `TocSuggestion[]`을 반환한다. `BlogRecordScreen.handleSave`가 발행 직전에 분석을 호출하고, 제안이 2개 이상이면 `AutoTocModal`을 띄운다. 사용자가 선택하면 `applyTocSuggestions`로 heading 블록을 삽입한 새 블록 배열로 발행한다. 기존 `extractHeadings`(PostDetailScreen)가 heading을 추출하므로 목차는 자동으로 따라온다.

**Tech Stack:** React Native (Expo), TypeScript. 테스트는 jest 없이 단독 실행 검증 스크립트(`npx tsx`) + `npx tsc --noEmit`.

---

## File Structure

- **Create** `src/utils/autoToc.ts` — 순수 분석기. `analyzeForToc`, `applyTocSuggestions`, `TocSuggestion` 타입.
- **Create** `src/utils/autoToc.verify.ts` — jest 없는 단독 검증 스크립트(개발용, 앱 번들 미포함).
- **Create** `src/components/AutoTocModal.tsx` — 제안 미리보기/선택 모달.
- **Modify** `src/screens/BlogRecordScreen.tsx` — `buildRecordData`에 블록 인자 추가, `handleSave`에 분석→모달 분기, 모달 렌더.
- **변경 없음**: `src/types/blogBlocks.ts`(`createHeadingBlock`/`HeadingLevel` 재사용), `src/screens/PostDetailScreen.tsx`(목차 자동 동작).

---

### Task 1: 온디바이스 분석기 `autoToc.ts`

**Files:**
- Create: `src/utils/autoToc.ts`
- Test: `src/utils/autoToc.verify.ts`

- [ ] **Step 1: 검증 스크립트 작성 (실패하는 테스트)**

Create `src/utils/autoToc.verify.ts`:

```ts
/**
 * autoToc 단독 검증 스크립트 (jest 미사용).
 * 실행: npx tsx src/utils/autoToc.verify.ts
 * 앱 코드에서 import 하지 않으므로 번들에 포함되지 않음(개발용).
 */
import { analyzeForToc, applyTocSuggestions } from './autoToc';
import {
  BlogBlock,
  createTextBlock,
  createImageBlock,
  createHeadingBlock,
} from '../types/blogBlocks';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.error('  ✗ ' + msg);
  }
}

const filler = '오늘은 정말 즐거운 하루였고 맛있는 음식도 먹고 좋은 곳도 많이 구경했습니다. 날씨도 좋아서 기분이 최고였어요.';

// 1) 짧은 글 → 제안 없음
{
  const blocks: BlogBlock[] = [createTextBlock('짧은 글입니다.')];
  assert(analyzeForToc(blocks).length === 0, '짧은 글이면 제안 없음');
}

// 2) 텍스트 블록 3개 미만 → 제안 없음 (분량 충분해도)
{
  const blocks: BlogBlock[] = [
    createTextBlock('1일차 ' + filler + filler),
    createTextBlock('2일차 ' + filler + filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '텍스트 블록 3개 미만이면 제안 없음');
}

// 3) 일차 신호가 뚜렷한 긴 글 → 제안 2개 이상
{
  const blocks: BlogBlock[] = [
    createTextBlock('1일차 도쿄 도착. ' + filler),
    createTextBlock('둘째 날 아침 시장 구경. ' + filler),
    createTextBlock('3일차 마지막 일정. ' + filler),
  ];
  const out = analyzeForToc(blocks);
  assert(out.length >= 2, '일차 신호 글이면 제안 2개 이상');
  assert(out.some(s => s.text.startsWith('1일차')), '제안에 "1일차" 포함');
  assert(out.every(s => s.text.length <= 21), '소제목은 말줄임 길이 이내');
}

// 4) 기존 heading 2개 이상 → 제안 없음
{
  const blocks: BlogBlock[] = [
    createHeadingBlock('소제목 A', 2),
    createTextBlock('1일차 도쿄 도착. ' + filler),
    createHeadingBlock('소제목 B', 2),
    createTextBlock('둘째 날 아침. ' + filler),
    createTextBlock('3일차 마지막. ' + filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '기존 heading이 2개 이상이면 제안 없음');
}

// 5) 신호 없는 단일 주제 긴 글 → 제안 없음(목차 불필요)
{
  const blocks: BlogBlock[] = [
    createTextBlock(filler),
    createTextBlock(filler),
    createTextBlock(filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '신호 없는 단일 주제 글이면 제안 없음');
}

// 6) applyTocSuggestions: 대상 블록 앞에 heading 삽입, 순서/개수 보존
{
  const t1 = createTextBlock('가');
  const t2 = createTextBlock('나');
  const t3 = createTextBlock('다');
  const blocks: BlogBlock[] = [t1, t2, t3];
  const next = applyTocSuggestions(blocks, [
    { beforeBlockId: t2.id, level: 2, text: '둘째 섹션' },
  ]);
  assert(next.length === 4, 'heading 1개 삽입 후 길이 4');
  assert(next[1].type === 'heading', 't2 앞에 heading 삽입');
  assert(next[1].type === 'heading' && next[1].value === '둘째 섹션', 'heading 텍스트 일치');
  assert(next[2].id === t2.id, 'heading 다음이 원래 t2');
}

// 7) applyTocSuggestions: 빈 배열이면 원본 그대로
{
  const blocks: BlogBlock[] = [createTextBlock('가'), createTextBlock('나')];
  assert(applyTocSuggestions(blocks, []) === blocks, '제안 없으면 원본 반환');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 검증 스크립트 실행 → 실패 확인**

Run: `npx tsx src/utils/autoToc.verify.ts`
Expected: 실패 — `Cannot find module './autoToc'` (아직 미작성). (최초 실행 시 npx가 tsx를 내려받으므로 네트워크 필요.)

- [ ] **Step 3: 분석기 구현**

Create `src/utils/autoToc.ts`:

```ts
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
const MIN_TOTAL_CHARS = 400;
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
```

- [ ] **Step 4: 검증 스크립트 실행 → 통과 확인**

Run: `npx tsx src/utils/autoToc.verify.ts`
Expected: 모든 항목 `✓`, 마지막 줄 `ALL PASS`, exit 0.

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/utils/autoToc.ts src/utils/autoToc.verify.ts
git commit -m "feat(blog): add on-device auto TOC analyzer"
```

---

### Task 2: 미리보기 모달 `AutoTocModal.tsx`

**Files:**
- Create: `src/components/AutoTocModal.tsx`

- [ ] **Step 1: 컴포넌트 구현**

Create `src/components/AutoTocModal.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type { TocSuggestion } from '../utils/autoToc';

interface AutoTocModalProps {
  visible: boolean;
  suggestions: TocSuggestion[];
  onConfirm: (accepted: TocSuggestion[]) => void; // 추가하고 저장
  onSkip: () => void;                              // 목차 없이 저장
  onClose: () => void;                             // 뒤로(발행 보류)
}

export default function AutoTocModal({
  visible,
  suggestions,
  onConfirm,
  onSkip,
  onClose,
}: AutoTocModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      const init: Record<string, boolean> = {};
      suggestions.forEach(s => { init[s.beforeBlockId] = true; });
      setChecked(init);
    }
  }, [visible, suggestions]);

  const toggle = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const accepted = suggestions.filter(s => checked[s.beforeBlockId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>📋 AI가 목차를 만들었어요</Text>
          <Text style={styles.subtitle}>
            추가할 소제목을 선택하세요. 본문에 소제목으로 삽입돼요.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {suggestions.map(s => {
              const on = !!checked[s.beforeBlockId];
              return (
                <TouchableOpacity
                  key={s.beforeBlockId}
                  style={styles.item}
                  onPress={() => toggle(s.beforeBlockId)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.check}>✓</Text>}
                  </View>
                  <Text
                    style={[styles.itemText, { paddingLeft: (s.level - 1) * 12 }]}
                    numberOfLines={1}
                  >
                    {s.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onSkip}>
              <Text style={styles.btnGhostText}>목차 없이 저장</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, accepted.length === 0 && styles.btnDisabled]}
              onPress={() => onConfirm(accepted)}
              disabled={accepted.length === 0}
            >
              <Text style={styles.btnPrimaryText}>추가하고 저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#2E2E3B',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#A1A1B0', marginTop: 6, marginBottom: 12 },
  list: { flexGrow: 0, marginBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A26',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#A1A1B0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  check: { color: '#0A0A0F', fontSize: 13, fontWeight: '800' },
  itemText: { flex: 1, fontSize: 14, color: '#FFFFFF' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: '#1A1A26' },
  btnGhostText: { color: '#A1A1B0', fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#BF85FC' },
  btnPrimaryText: { color: '#0A0A0F', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/components/AutoTocModal.tsx
git commit -m "feat(blog): add AutoTocModal preview for AI table of contents"
```

---

### Task 3: `BlogRecordScreen` 연동

**Files:**
- Modify: `src/screens/BlogRecordScreen.tsx`

- [ ] **Step 1: import 추가**

`src/components/StickerPicker` import 아래 줄(파일 상단 import 블록)에 추가:

```tsx
import AutoTocModal from '../components/AutoTocModal';
import { analyzeForToc, applyTocSuggestions, TocSuggestion } from '../utils/autoToc';
```

(`BlogBlock` 타입은 이미 `../types/blogBlocks`에서 import 되어 있으므로 추가 불필요.)

- [ ] **Step 2: 상태 추가**

`const [draftListVisible, setDraftListVisible] = useState(false);` 줄 바로 아래에 추가:

```tsx
  // ─── AI 자동 목차 ───
  const [tocModalVisible, setTocModalVisible] = useState(false);
  const [tocSuggestions, setTocSuggestions] = useState<TocSuggestion[]>([]);
```

- [ ] **Step 3: `buildRecordData`가 블록 인자를 받도록 수정**

기존:

```tsx
  const buildRecordData = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const photos = blocksToPhotos(blocks);
    const bodyText = blocksToPlainText(blocks);
```

변경:

```tsx
  const buildRecordData = (blocksOverride?: BlogBlock[]) => {
    const srcBlocks = blocksOverride ?? blocks;
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const photos = blocksToPhotos(srcBlocks);
    const bodyText = blocksToPlainText(srcBlocks);
```

그리고 같은 함수의 return 객체 마지막 줄을 변경:

기존: `      blogBlocks: blocks,`
변경: `      blogBlocks: srcBlocks,`

(`handleDraftSave`는 `buildRecordData()`를 인자 없이 호출하므로 그대로 현재 blocks 사용 — 영향 없음.)

- [ ] **Step 4: `handleSave`에 분석→모달 분기 + publish 헬퍼 추가**

기존:

```tsx
  const handleSave = () => {
    if (!selectedCountry) { Alert.alert('국가 선택', '여행한 국가를 선택해주세요.'); return; }
    const bodyText = blocksToPlainText(blocks);
    if (!title.trim() && !bodyText) { Alert.alert('내용 입력', '제목이나 본문을 작성해주세요.'); return; }
    if (companions.length === 0) { Alert.alert('동행자 선택', '동행자를 선택해주세요.'); return; }
    if (rating <= 0) { Alert.alert('별점 입력', '별점을 입력해주세요.'); return; }
    addRecord(buildRecordData());
    navigation.goBack();
  };
```

변경:

```tsx
  const publish = (finalBlocks: BlogBlock[]) => {
    addRecord(buildRecordData(finalBlocks));
    navigation.goBack();
  };

  const handleSave = () => {
    if (!selectedCountry) { Alert.alert('국가 선택', '여행한 국가를 선택해주세요.'); return; }
    const bodyText = blocksToPlainText(blocks);
    if (!title.trim() && !bodyText) { Alert.alert('내용 입력', '제목이나 본문을 작성해주세요.'); return; }
    if (companions.length === 0) { Alert.alert('동행자 선택', '동행자를 선택해주세요.'); return; }
    if (rating <= 0) { Alert.alert('별점 입력', '별점을 입력해주세요.'); return; }

    // AI 목차 분석: 제안이 2개 이상이면 미리보기 모달, 아니면 그대로 발행
    const suggestions = analyzeForToc(blocks);
    if (suggestions.length >= 2) {
      setTocSuggestions(suggestions);
      setTocModalVisible(true);
      return;
    }
    publish(blocks);
  };
```

- [ ] **Step 5: 모달 렌더 추가**

`FullScreenImageViewer`가 렌더되는 부분(또는 JSX 최하단, 닫는 `</SafeAreaView>` 바로 위)에 추가. `FullScreenImageViewer` 렌더 직후에 삽입:

```tsx
      <AutoTocModal
        visible={tocModalVisible}
        suggestions={tocSuggestions}
        onConfirm={(accepted) => {
          setTocModalVisible(false);
          publish(applyTocSuggestions(blocks, accepted));
        }}
        onSkip={() => {
          setTocModalVisible(false);
          publish(blocks);
        }}
        onClose={() => setTocModalVisible(false)}
      />
```

> `FullScreenImageViewer` 렌더 위치는 `grep -n "FullScreenImageViewer" src/screens/BlogRecordScreen.tsx`로 JSX에서 사용된 줄을 찾아 그 닫는 태그 뒤에 둔다.

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 7: 검증 스크립트 재실행 (회귀 확인)**

Run: `npx tsx src/utils/autoToc.verify.ts`
Expected: `ALL PASS`.

- [ ] **Step 8: 커밋**

```bash
git add src/screens/BlogRecordScreen.tsx
git commit -m "feat(blog): wire AI auto TOC into BlogRecord save flow"
```

---

### Task 4: 앱에서 수동 검증

**Files:** (없음 — 실행 확인만)

- [ ] **Step 1: 앱 실행**

Run: `npx expo start`
디바이스/에뮬레이터에서 앱을 연다.

- [ ] **Step 2: 긴 여행 블로그 작성 후 저장**

블로그 기록 화면에서 국가·동행자·별점 입력 후, 본문에 "1일차 ...", "2일차 ...", "3일차 ..." 형태로 단락을 나눠 충분히 길게(각 단락 100자 이상) 작성하고 `저장`.
Expected: `📋 AI가 목차를 만들었어요` 모달이 뜨고 "1일차/2일차/3일차" 소제목 제안이 보인다.

- [ ] **Step 3: 추가하고 저장 → 상세보기 목차 확인**

모달에서 일부 체크 해제 후 `추가하고 저장`. 발행된 글을 상세보기로 연다.
Expected: 본문에 소제목이 삽입되어 있고, 상단 `📋 목차`에 선택한 소제목들이 나타난다.

- [ ] **Step 4: 짧은 글은 모달 미표시 확인**

짧은 단일 단락 글을 작성하고 `저장`.
Expected: 모달 없이 바로 발행된다(목차 불필요 케이스).

---

## Self-Review

- **Spec coverage:** 게이트(짧은 글/heading 다수)→Task1 Step3 게이트, 구획 분할(일차/시간대/구조/분량)→DAY_RE·TIME_RE·lastWasBreak·charsSinceLast, 소제목 생성→makeDayLabel/makeTimeLabel/firstClause, 미리보기 모달→Task2, 본문 직접 삽입→applyTocSuggestions+Task3 Step5, 목차 불필요 자동 처리→`length < 2` 반환 및 `>= 2` 분기, PostDetailScreen 무변경→설계대로. 모두 커버됨.
- **Placeholder scan:** TODO/“적절히 처리” 류 없음. 모든 코드 단계에 실제 코드 포함.
- **Type consistency:** `TocSuggestion`(beforeBlockId/level/text)이 autoToc.ts·verify·AutoTocModal·BlogRecordScreen에서 동일하게 사용. `analyzeForToc`/`applyTocSuggestions` 시그니처 일치. `createHeadingBlock(value, level)` 시그니처는 blogBlocks.ts와 일치. `buildRecordData(blocksOverride?)` 변경이 `handleDraftSave`의 무인자 호출과 호환.
