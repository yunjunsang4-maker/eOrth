# 카드 꾹 눌러 DM 빠른 공유 (드래그) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소셜탭 기록 카드를 꾹 눌러 떠오른 카드 고스트를 친구 3명(+기타) 원형 타깃에 드래그해 놓으면, 그 사람 DM에 게시물이 실제로 전송되고 토스트가 뜬다.

**Architecture:** 신규 `DMProvider`(Context)가 대화를 보관하고 `DMScreen`이 이를 읽는다(전송이 실제로 남음). 순수 로직(record→메시지 변환, 상위 친구 정렬, 드롭 히트테스트)은 `src/store/dmShareLogic.ts`에 두고 `*.verify.ts`로 TDD한다. 드래그는 RNGH `Gesture.Pan().activateAfterLongPress()`(탭/더블탭과 자연스럽게 분리) + 클래식 `Animated.ValueXY`(앱 패턴, `runOnJS(true)`로 워클릿 회피)로 구현하고, 고스트/타깃은 SocialScreen 화면 레벨 오버레이로 렌더한다.

**Tech Stack:** React Native + Expo, TypeScript, react-native-gesture-handler, react-native(Animated), 기존 `Toast`. 테스트: `npx tsx <file>.verify.ts`, `npx tsc --noEmit`.

**WIP 주의:** `DMScreen.tsx`·`SocialScreen.tsx`·`App.tsx`는 사용자가 작업 중인 파일이다. 해당 Task의 변경만 수술적으로 적용하고, 커밋은 그 Task에 속한 파일만 `git add` 한다(다른 WIP를 휩쓸지 말 것). 단계마다 `git diff`로 확인한다.

---

## 파일 구조

- `src/store/dmTypes.ts` — `MsgType`, `SharedRecord`, `Message`, `Friend` 타입(DMScreen에서 이전).
- `src/store/dmShareLogic.ts` — 순수: `nowTimeString`, `buildSharedRecord`, `pickTopFriends`, `hitTestTarget`, `TargetRect`.
- `src/store/dmShareLogic.verify.ts` — 순수 로직 단독 검증.
- `src/store/dmStore.tsx` — `DMProvider`/`useDM`: 대화·친구 시드, `addMessage`, `sendRecord`, `topFriends`.
- `src/components/QuickShareOverlay.tsx` — 화면 레벨 오버레이(고스트 + 원형 타깃 + 기타 피커).
- `App.tsx`(수정) — `DMProvider` 추가.
- `src/screens/DMScreen.tsx`(수정) — 로컬 더미/상태 → `useDM` 연결.
- `src/screens/SocialScreen.tsx`(수정) — `DiaryCard` 롱프레스 드래그 + 오버레이 + 토스트.

---

# Phase 1 — DM 스토어 + DMScreen 연결

### Task 1: 공유 타입 정의 (dmTypes)

**Files:**
- Create: `src/store/dmTypes.ts`

- [ ] **Step 1: 타입 작성**

```ts
export type MsgType = 'text' | 'image' | 'record';

export interface SharedRecord {
  id: string;
  country: string;
  content: string;
  viewType: 'feed' | 'blog' | 'album' | 'snap';
  date: string;
  mediaUri?: string;
  albumUris?: string[];
  snapFrontUri?: string;
  snapBackUri?: string;
  snapCaption?: string;
  blogTitle?: string;
  blogPreview?: string;
}

export interface Message {
  id: string;
  type: MsgType;
  text: string;
  isMine: boolean;
  time: string;
  imageUri?: string;
  record?: SharedRecord;
}

export interface Friend {
  id?: string;
  name: string;
  handle: string;
  emoji: string;
  online?: boolean;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS (신규 오류 없음; 기존 `archive/` 오류는 무시)

- [ ] **Step 3: 커밋**

```bash
git add src/store/dmTypes.ts
git commit -m "feat(dm): shared DM types (message, shared record, friend)"
```

---

### Task 2: 순수 로직 (dmShareLogic)

**Files:**
- Create: `src/store/dmShareLogic.ts`
- Test: `src/store/dmShareLogic.verify.ts`

- [ ] **Step 1: 실패하는 검증 스크립트 작성**

```ts
// DM 빠른 공유 순수 로직 검증 (jest 미사용). 실행: npx tsx src/store/dmShareLogic.verify.ts
import { nowTimeString, buildSharedRecord, pickTopFriends, hitTestTarget } from './dmShareLogic';
import type { Friend, Message } from './dmTypes';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// nowTimeString
{
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5)) === '오전 9:05', '오전 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30)) === '오후 2:30', '오후 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0)) === '오전 12:00', '자정 12시');
}

// buildSharedRecord
{
  const rec: any = { id: 'r1', country: '🇯🇵 일본', content: '교토', viewType: 'feed', date: '2025.03.05', medias: ['m1', 'm2'] };
  const s = buildSharedRecord(rec);
  assert(s.id === 'r1' && s.viewType === 'feed', '피드 기본 필드');
  assert(s.mediaUri === 'm1', '첫 미디어를 대표 이미지로');

  const album: any = { id: 'r2', country: '', content: '', viewType: 'album', date: '', medias: ['a','b','c','d','e'] };
  assert(buildSharedRecord(album).albumUris?.length === 4, '앨범은 최대 4장');

  const blog: any = { id: 'r3', country: '', content: '대체제목', viewType: 'blog', date: '',
    blogBlocks: [{ type: 'heading', value: '진짜제목' }, { type: 'text', value: '본문미리보기' }] };
  const bs = buildSharedRecord(blog);
  assert(bs.blogTitle === '진짜제목', '블로그 heading을 제목으로');
  assert(bs.blogPreview === '본문미리보기', '블로그 text를 미리보기로');
}

// pickTopFriends
{
  const friends: Friend[] = [
    { name: 'A', handle: 'a', emoji: '😀' },
    { name: 'B', handle: 'b', emoji: '😀' },
    { name: 'C', handle: 'c', emoji: '😀' },
    { name: 'D', handle: 'd', emoji: '😀' },
  ];
  const conv: Record<string, Message[]> = {
    a: [{} as Message],
    b: [{} as Message, {} as Message, {} as Message],
    c: [{} as Message, {} as Message],
    d: [],
  };
  const top = pickTopFriends(friends, conv, 3);
  assert(top.length === 3, '상위 3명');
  assert(top[0].handle === 'b' && top[1].handle === 'c' && top[2].handle === 'a', '메시지 수 desc 정렬');
}

// hitTestTarget
{
  const targets = [
    { key: 'f1', x: 0, y: 0, w: 50, h: 50 },
    { key: 'other', x: 0, y: 60, w: 50, h: 50 },
  ];
  assert(hitTestTarget(25, 25, targets) === 'f1', '첫 원 안쪽 명중');
  assert(hitTestTarget(25, 80, targets) === 'other', '기타 원 명중');
  assert(hitTestTarget(200, 200, targets) === null, '바깥은 null');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/store/dmShareLogic.verify.ts`
Expected: FAIL — `Cannot find module './dmShareLogic'`

- [ ] **Step 3: 구현**

```ts
import type { TravelRecord } from './recordStore';
import type { SharedRecord, Message, Friend } from './dmTypes';

export function nowTimeString(d: Date = new Date()): string {
  const hour = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = hour < 12 ? '오전' : '오후';
  return `${ampm} ${hour % 12 || 12}:${min}`;
}

export function buildSharedRecord(r: TravelRecord): SharedRecord {
  const vt = (r.viewType || 'feed') as SharedRecord['viewType'];
  let blogTitle = '';
  let blogPreview = '';
  if (vt === 'blog' && r.blogBlocks?.length) {
    const heading = r.blogBlocks.find((b) => b.type === 'heading');
    blogTitle = (heading && 'value' in heading ? (heading as any).value : '') || r.content;
    const textBlock = r.blogBlocks.find((b) => b.type === 'text');
    blogPreview = textBlock && 'value' in textBlock ? (textBlock as any).value : '';
  }
  return {
    id: r.id,
    country: r.country,
    content: r.content,
    viewType: vt,
    date: r.date,
    mediaUri: r.medias?.[0] || r.snapBackUri,
    albumUris: vt === 'album' ? (r.medias || []).slice(0, 4) : undefined,
    snapFrontUri: r.snapFrontUri,
    snapBackUri: r.snapBackUri,
    snapCaption: r.snapCaption,
    blogTitle: blogTitle || undefined,
    blogPreview: blogPreview || undefined,
  };
}

export function pickTopFriends(
  friends: Friend[],
  conversations: Record<string, Message[]>,
  n: number
): Friend[] {
  return [...friends]
    .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0))
    .slice(0, n);
}

export interface TargetRect { key: string; x: number; y: number; w: number; h: number }

export function hitTestTarget(px: number, py: number, targets: TargetRect[]): string | null {
  for (const t of targets) {
    if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) return t.key;
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx src/store/dmShareLogic.verify.ts`
Expected: PASS — `ALL PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/store/dmShareLogic.ts src/store/dmShareLogic.verify.ts
git commit -m "feat(dm): pure logic for share record, top friends, hit-test"
```

---

### Task 3: DM 스토어 (dmStore)

**Files:**
- Create: `src/store/dmStore.tsx`

- [ ] **Step 1: 구현**

```tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { TravelRecord } from './recordStore';
import type { Friend, Message, MsgType, SharedRecord } from './dmTypes';
import { buildSharedRecord, nowTimeString, pickTopFriends } from './dmShareLogic';

// ── 시드 (기존 DMScreen DUMMY_CHATS / SocialScreen SHARE_FRIENDS 이전) ──
const INITIAL_FRIENDS: Friend[] = [
  { id: '1', name: '김민지', handle: 'minji_travel', emoji: '🌸', online: true },
  { id: '2', name: '이준호', handle: 'junho_world', emoji: '🏄', online: true },
  { id: '3', name: '박서연', handle: 'seoyeon_log', emoji: '✈️', online: false },
  { id: '4', name: '최우진', handle: 'woojin_trip', emoji: '🗺️', online: false },
  { id: '5', name: '정하늘', handle: 'haneul_sky', emoji: '🌅', online: false },
  { id: '6', name: '강도윤', handle: 'doyun_go', emoji: '🎒', online: true },
];

const INITIAL_CONVERSATIONS: Record<string, Message[]> = {
  minji_travel: [
    { id: '1', type: 'text', text: '파리 어때? 날씨 좋아?', isMine: false, time: '오후 2:10' },
    { id: '2', type: 'text', text: '완전 좋아! 에펠탑 앞이야 지금', isMine: true, time: '오후 2:11' },
    { id: '3', type: 'text', text: '파리 사진 너무 예쁘다!', isMine: false, time: '오후 2:12' },
  ],
  junho_world: [
    { id: '1', type: 'text', text: '이번 여름에 어디 갈 거야?', isMine: true, time: '오후 1:30' },
    { id: '2', type: 'text', text: '일본이랑 태국 고민 중', isMine: false, time: '오후 1:32' },
    { id: '3', type: 'text', text: '다음 여행 어디로 갈 거야?', isMine: false, time: '오후 1:45' },
  ],
  seoyeon_log: [
    { id: '1', type: 'text', text: '태국 맛집 알아?', isMine: true, time: '오전 11:20' },
    { id: '2', type: 'text', text: '태국 맛집 리스트 보내줄게', isMine: false, time: '오전 11:25' },
  ],
  woojin_trip: [
    { id: '1', type: 'text', text: '오사카 가고 싶다', isMine: true, time: '어제' },
    { id: '2', type: 'text', text: '같이 일본 갈래?', isMine: false, time: '어제' },
  ],
  haneul_sky: [
    { id: '1', type: 'text', text: '발리 스냅 봤어! 대박', isMine: false, time: '어제' },
  ],
  doyun_go: [
    { id: '1', type: 'text', text: '베트남 숙소 추천해줘', isMine: false, time: '어제' },
  ],
};

export interface NewMessage {
  type: MsgType;
  text: string;
  isMine?: boolean;
  imageUri?: string;
  record?: SharedRecord;
}

interface DMContextType {
  conversations: Record<string, Message[]>;
  friends: Friend[];
  addMessage: (handle: string, msg: NewMessage) => void;
  sendRecord: (handle: string, record: TravelRecord) => void;
  topFriends: (n: number) => Friend[];
}

const DMContext = createContext<DMContextType | null>(null);

export function DMProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Record<string, Message[]>>(INITIAL_CONVERSATIONS);
  const [friends] = useState<Friend[]>(INITIAL_FRIENDS);

  const addMessage = useCallback((handle: string, msg: NewMessage) => {
    setConversations((prev) => {
      const m: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: msg.type,
        text: msg.text,
        isMine: msg.isMine ?? true,
        time: nowTimeString(),
        imageUri: msg.imageUri,
        record: msg.record,
      };
      return { ...prev, [handle]: [...(prev[handle] ?? []), m] };
    });
  }, []);

  const sendRecord = useCallback((handle: string, record: TravelRecord) => {
    addMessage(handle, { type: 'record', text: '', record: buildSharedRecord(record) });
  }, [addMessage]);

  const topFriends = useCallback((n: number) => pickTopFriends(friends, conversations, n), [friends, conversations]);

  return (
    <DMContext.Provider value={{ conversations, friends, addMessage, sendRecord, topFriends }}>
      {children}
    </DMContext.Provider>
  );
}

export function useDM() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDM must be used within DMProvider');
  return ctx;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS (신규 오류 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/store/dmStore.tsx
git commit -m "feat(dm): DMProvider with conversations, sendRecord, topFriends"
```

---

### Task 4: App에 DMProvider 추가

**Files:**
- Modify: `src/App.tsx` (실제 경로 `App.tsx`)

- [ ] **Step 1: import 추가**

`App.tsx` 상단, `import { RecordProvider } ...` 아래에 추가:

```ts
import { DMProvider } from './src/store/dmStore';
```

- [ ] **Step 2: Provider 트리에 삽입**

기존:
```tsx
        <RecordProvider>
          <StatusBar style="light" backgroundColor="#0A0118" translucent />
          <SnapDetector />
          <AppNavigator />
        </RecordProvider>
```
→ 교체:
```tsx
        <RecordProvider>
          <DMProvider>
            <StatusBar style="light" backgroundColor="#0A0118" translucent />
            <SnapDetector />
            <AppNavigator />
          </DMProvider>
        </RecordProvider>
```

- [ ] **Step 3: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → PASS
```bash
git add App.tsx
git commit -m "feat(dm): mount DMProvider in app tree"
```

---

### Task 5: DMScreen을 스토어에 연결

**Files:**
- Modify: `src/screens/DMScreen.tsx`

기존 로컬 `DUMMY_CHATS`/타입/메시지 상태를 스토어로 대체한다. (이 파일은 WIP — 아래 명시한 부분만 수정)

- [ ] **Step 1: import 교체**

상단 import 영역에서, 로컬 타입 사용을 스토어 타입/훅으로 바꾼다. `useRecords` import 아래에 추가:

```ts
import { useDM } from '../store/dmStore';
import type { Message, MsgType, SharedRecord } from '../store/dmTypes';
```

- [ ] **Step 2: 로컬 타입/더미 제거**

`DMScreen.tsx`에서 로컬로 선언된 `type MsgType`, `interface SharedRecord`, `interface Message`, `const DUMMY_CHATS` 정의를 삭제한다(이제 `dmTypes`/`dmStore`가 소유). `getTimeString` 함수는 그대로 둔다(다른 곳에서 쓰일 수 있음).

- [ ] **Step 3: 컴포넌트에서 스토어 사용**

`export default function DMScreen` 본문에서:

기존:
```tsx
  const { records } = useRecords();
  const [messages, setMessages] = useState<Message[]>(
    DUMMY_CHATS[friend.handle] || []
  );
```
→ 교체:
```tsx
  const { records } = useRecords();
  const { conversations, addMessage: dmAddMessage, sendRecord } = useDM();
  const messages = conversations[friend.handle] ?? [];
```

- [ ] **Step 4: addMessage / shareRecord / sharePostId를 스토어로 위임**

기존 로컬 `addMessage`를 아래로 교체:
```tsx
  const addMessage = (msg: Omit<Message, 'id' | 'isMine' | 'time'>) => {
    dmAddMessage(friend.handle, { type: msg.type, text: msg.text, imageUri: msg.imageUri, record: msg.record });
  };
```

`sharePostId` 자동 전송 `useEffect`의 본문(`setMessages([...])` 부분)을 아래로 교체:
```tsx
  useEffect(() => {
    if (!sharePostId || sharedRef.current) return;
    sharedRef.current = true;
    const r = records.find(rec => rec.id === sharePostId);
    if (!r) return;
    sendRecord(friend.handle, r);
  }, [sharePostId]);
```

`shareRecord(r)` 함수의 `addMessage({ type:'record', ... record:{...} })` 호출을 아래로 교체:
```tsx
  const shareRecord = (r: TravelRecord) => {
    setRecordPickerOpen(false);
    sendRecord(friend.handle, r);
  };
```

> 주의: `setMessages`를 더 이상 사용하지 않는다. 남아있는 `setMessages` 참조가 있으면 모두 위 스토어 경로로 바꾼다. `blogTitle/blogPreview/vt` 추출 로직은 `sendRecord`(스토어의 `buildSharedRecord`)가 대신하므로 DMScreen에서 제거해도 된다.

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS — `DMScreen.tsx` 신규 오류 없음 (기존 `archive/` 오류만)

- [ ] **Step 6: 커밋**

```bash
git add src/screens/DMScreen.tsx
git commit -m "feat(dm): DMScreen reads/writes conversations via DMProvider"
```

---

# Phase 2 — 드래그 오버레이 + 소셜탭 연결

### Task 6: QuickShareOverlay 컴포넌트

**Files:**
- Create: `src/components/QuickShareOverlay.tsx`

화면 레벨 오버레이. 어두운 배경 + 카드 옆 원형 타깃 4개(친구3+기타) + 고스트(드래그 위치 따라). 타깃이 배치되면 각 원의 화면 좌표를 부모에 보고하고, 드롭 판정/전송은 부모(SocialScreen)가 한다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import React from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, Image } from 'react-native';
import type { Friend, SharedRecord } from '../store/dmTypes';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CIRCLE = 56;
const GAP = 14;

export interface CardRect { x: number; y: number; w: number; h: number }

export default function QuickShareOverlay({
  visible,
  record,
  cardRect,
  side,
  pos,
  friends,
  hoveredKey,
  onTargetLayout,
  onCancel,
}: {
  visible: boolean;
  record: SharedRecord | null;
  cardRect: CardRect | null;
  side: 'left' | 'right';
  pos: Animated.ValueXY;
  friends: Friend[];           // 상위 3명
  hoveredKey: string | null;
  onTargetLayout: (key: string, rect: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  if (!visible || !cardRect) return null;

  // 타깃 키 목록: 친구 handle + 'other'
  const targets = [...friends.map((f) => ({ key: f.handle, emoji: f.emoji, label: f.name })),
                   { key: 'other', emoji: '⊙', label: '기타' }];

  // 카드 옆 세로 배치 시작 좌표
  const colX = side === 'right'
    ? Math.min(cardRect.x + cardRect.w + GAP, SCREEN_W - CIRCLE - 8)
    : Math.max(cardRect.x - CIRCLE - GAP, 8);
  const totalH = targets.length * CIRCLE + (targets.length - 1) * GAP;
  let startY = cardRect.y + cardRect.h / 2 - totalH / 2;
  startY = Math.max(40, Math.min(startY, SCREEN_H - totalH - 40));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 어두운 배경 (탭/취소) */}
      <TouchableOpacity style={[StyleSheet.absoluteFill, st.dim]} activeOpacity={1} onPress={onCancel} />

      {/* 원형 타깃 */}
      {targets.map((t, i) => {
        const cy = startY + i * (CIRCLE + GAP);
        const hovered = hoveredKey === t.key;
        return (
          <View
            key={t.key}
            style={[st.target, { left: colX, top: cy, width: CIRCLE, height: CIRCLE }, hovered && st.targetHover]}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              onTargetLayout(t.key, { x, y, w: width, h: height });
            }}
            pointerEvents="none"
          >
            <Text style={st.targetEmoji}>{t.emoji}</Text>
            <Text style={st.targetLabel} numberOfLines={1}>{t.label}</Text>
          </View>
        );
      })}

      {/* 드래그 고스트 (카드 미리보기) */}
      <Animated.View
        pointerEvents="none"
        style={[
          st.ghost,
          { transform: [{ translateX: Animated.subtract(pos.x, CIRCLE) }, { translateY: Animated.subtract(pos.y, CIRCLE) }] },
        ]}
      >
        {record?.mediaUri ? (
          <Image source={{ uri: record.mediaUri }} style={st.ghostImg} resizeMode="cover" />
        ) : (
          <View style={[st.ghostImg, st.ghostEmpty]}>
            <Text style={{ fontSize: 24 }}>📝</Text>
          </View>
        )}
        <Text style={st.ghostText} numberOfLines={1}>{record?.blogTitle || record?.content || record?.country || '기록'}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  target: {
    position: 'absolute',
    borderRadius: CIRCLE / 2,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetHover: { borderColor: '#BF85FC', backgroundColor: '#3A2A55', transform: [{ scale: 1.12 }] },
  targetEmoji: { fontSize: 20 },
  targetLabel: { position: 'absolute', bottom: -16, fontSize: 9, color: '#A1A1B0', width: 64, textAlign: 'center' },
  ghost: {
    position: 'absolute',
    width: 112,
    borderRadius: 12,
    backgroundColor: '#1A0A2E',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.5)',
    padding: 6,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  ghostImg: { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#2A2735' },
  ghostEmpty: { alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: '#FFFFFF', fontSize: 11, marginTop: 4 },
});
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/QuickShareOverlay.tsx
git commit -m "feat(dm): QuickShareOverlay (ghost + circular targets)"
```

---

### Task 7: SocialScreen 롱프레스 드래그 연결

**Files:**
- Modify: `src/screens/SocialScreen.tsx`

`DiaryCard`를 RNGH `Gesture.Pan().activateAfterLongPress(250)`로 감싸 드래그를 받고, 화면 레벨에서 `QuickShareOverlay` + 토스트를 렌더한다. 드롭 판정/전송은 SocialScreen이 수행. (WIP 파일 — 아래 변경만 적용)

- [ ] **Step 1: import 추가 (상단)**

```ts
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import QuickShareOverlay, { type CardRect } from '../components/QuickShareOverlay';
import { useDM } from '../store/dmStore';
import { hitTestTarget, type TargetRect } from '../store/dmShareLogic';
import { buildSharedRecord } from '../store/dmShareLogic';
```
(`Toast`, `Animated`, `useRef`, `useState`는 이미 import 되어 있음)

- [ ] **Step 2: DiaryCard에 드래그 제스처 추가**

`DiaryCard`는 `mode/navigation/...` props를 받는다. 여기에 빠른공유 제어 props를 추가한다. `function DiaryCard({ item, mode, navigation, toggleLike, showCounts, onArchive, onDelete, onBlock }: any)` 시그니처에 `onQuickStart, onQuickMove, onQuickEnd, dragPos` 를 추가:

```tsx
function DiaryCard({ item, mode, navigation, toggleLike, showCounts, onArchive, onDelete, onBlock, onQuickStart, onQuickMove, onQuickEnd, dragPos }: any) {
```

`const card = (() => { ... })();` 로 카드 엘리먼트를 만든 뒤(이미 그런 구조), 측정용 ref를 두고 제스처로 감싼다. `onMore`/return 부근에 추가:

```tsx
  const cardRef = useRef<View>(null);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(250)
    .onStart((e) => {
      cardRef.current?.measureInWindow((x, y, w, h) => {
        onQuickStart(item, { x, y, w, h } as CardRect);
        dragPos.setValue({ x: e.absoluteX, y: e.absoluteY });
      });
    })
    .onUpdate((e) => {
      dragPos.setValue({ x: e.absoluteX, y: e.absoluteY });
      onQuickMove(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      onQuickEnd(e.absoluteX, e.absoluteY);
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View ref={cardRef} collapsable={false}>
        {card}
      </View>
      {/* ...기존 Modal/ShareBottomSheet/ReportModal 들은 이 아래 형제로 유지... */}
    </GestureDetector>
  );
```

> 주의: 기존 `return ( <> {card} <Modal .../> <ReportModal .../> </> )` 구조를, 위처럼 `card`를 `GestureDetector><View ref>`로 감싸고 모달들은 형제로 둔다. `GestureDetector`의 자식은 단일 네이티브 뷰여야 하므로, 모달들은 `<>...</>`로 함께 묶되 첫 자식이 `View ref`가 되도록 한다:
```tsx
  return (
    <>
      <GestureDetector gesture={panGesture}>
        <View ref={cardRef} collapsable={false}>{card}</View>
      </GestureDetector>
      <Modal /* 점3개 메뉴 */ ... />
      <ReportModal ... />
    </>
  );
```

- [ ] **Step 3: 메인 SocialScreen 컴포넌트에 빠른공유 상태 추가**

메인 화면 컴포넌트(렌더 함수, `columns`/`return` 보유) 상단에 추가:

```tsx
  const { sendRecord, topFriends, friends } = useDM();
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [quick, setQuick] = useState<{ active: boolean; item: any; cardRect: CardRect | null; side: 'left' | 'right' }>({ active: false, item: null, cardRect: null, side: 'right' });
  const [quickHover, setQuickHover] = useState<string | null>(null);
  const quickTargets = useRef<TargetRect[]>([]);
  const [quickToast, setQuickToast] = useState('');
  const [quickToastVisible, setQuickToastVisible] = useState(false);
  const quickToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const top3 = topFriends(3);

  const showQuickToast = (msg: string) => {
    if (quickToastTimer.current) clearTimeout(quickToastTimer.current);
    setQuickToast(msg); setQuickToastVisible(true);
    quickToastTimer.current = setTimeout(() => setQuickToastVisible(false), 1800);
  };

  const handleQuickStart = (item: any, cardRect: CardRect) => {
    const side: 'left' | 'right' = cardRect.x < SCREEN_W_SOCIAL / 2 ? 'right' : 'left';
    quickTargets.current = [];
    setQuick({ active: true, item, cardRect, side });
    setQuickHover(null);
  };
  const handleQuickMove = (px: number, py: number) => {
    setQuickHover(hitTestTarget(px, py, quickTargets.current));
  };
  const handleQuickEnd = (px: number, py: number) => {
    const key = hitTestTarget(px, py, quickTargets.current);
    const item = quick.item;
    setQuick({ active: false, item: null, cardRect: null, side: 'right' });
    setQuickHover(null);
    if (!key || !item) return;
    if (key === 'other') {
      setOtherPickerItem(item);   // 기타 피커 오픈 (Step 5)
      return;
    }
    const friend = top3.find((f) => f.handle === key);
    if (friend) {
      sendRecord(friend.handle, item);
      showQuickToast(`${friend.name}님에게 전송됨`);
    }
  };
  const onQuickTargetLayout = (key: string, rect: { x: number; y: number; w: number; h: number }) => {
    const others = quickTargets.current.filter((t) => t.key !== key);
    quickTargets.current = [...others, { key, ...rect }];
  };
```

파일 상단 상수 영역(컴포넌트 밖)에 화면 폭 상수 추가(이미 `Dimensions`가 import 됨):
```ts
const SCREEN_W_SOCIAL = Dimensions.get('window').width;
```

- [ ] **Step 4: DiaryCard 호출부에 props 전달**

`columns[ci].map((item) => ( <DiaryCard ... /> ))` 의 `<DiaryCard>`에 props 추가:
```tsx
                  <DiaryCard
                    key={item.id}
                    item={item}
                    mode={diaryCardMode}
                    navigation={navigation}
                    toggleLike={toggleLike}
                    showCounts={showCounts}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onBlock={blockUser}
                    onQuickStart={handleQuickStart}
                    onQuickMove={handleQuickMove}
                    onQuickEnd={handleQuickEnd}
                    dragPos={dragPos}
                  />
```

- [ ] **Step 5: 오버레이 + 기타 피커 + 토스트 렌더**

메인 화면 `return (<View style={{flex:1}}> ... </View>)`의 최상위 `</View>` 직전에 추가:

```tsx
      <QuickShareOverlay
        visible={quick.active}
        record={quick.item ? buildSharedRecord(quick.item) : null}
        cardRect={quick.cardRect}
        side={quick.side}
        pos={dragPos}
        friends={top3}
        hoveredKey={quickHover}
        onTargetLayout={onQuickTargetLayout}
        onCancel={() => { setQuick({ active: false, item: null, cardRect: null, side: 'right' }); setQuickHover(null); }}
      />
      <Toast visible={quickToastVisible} message={quickToast} />
      {/* 기타 피커 */}
      <Modal visible={!!otherPickerItem} transparent animationType="slide" onRequestClose={() => setOtherPickerItem(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOtherPickerItem(null)} />
          <View style={ss.sheet}>
            <View style={ss.handle} />
            <Text style={ss.sheetTitle}>보낼 친구 선택</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {friends.map((f) => (
                <TouchableOpacity
                  key={f.handle}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const it = otherPickerItem;
                    setOtherPickerItem(null);
                    if (it) { sendRecord(f.handle, it); showQuickToast(`${f.name}님에게 전송됨`); }
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{f.emoji}</Text>
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>
```

그리고 `otherPickerItem` 상태를 Step 3 상태들 옆에 추가:
```tsx
  const [otherPickerItem, setOtherPickerItem] = useState<any>(null);
```

> 주의: `useDM()`는 컴포넌트 본문 상단(Step 3)에서 한 번만 호출하고 `friends`까지 구조분해해 받는다(훅을 JSX 안에서 호출하지 말 것). 피커는 그 `friends`를 사용한다.

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS — `SocialScreen.tsx` 신규 오류 없음 (기존 `archive/`만)

- [ ] **Step 7: 커밋**

```bash
git add src/screens/SocialScreen.tsx
git commit -m "feat(dm): long-press drag quick-share on social cards"
```

---

### Task 8: 통합 점검 (앱 실행)

**Files:** 없음 (수동)

- [ ] **Step 1: 정적 검증**

Run:
```bash
npx tsc --noEmit
npx tsx src/store/dmShareLogic.verify.ts
```
Expected: tsc 신규 오류 없음, verify `ALL PASS`

- [ ] **Step 2: 앱 실행 시나리오**

Run: `npx expo start`

확인:
- 소셜탭 카드 **꾹 누름** → 어두워지며 카드 옆(왼쪽 열→오른쪽, 오른쪽 열→왼쪽)에 친구3+기타 원형 4개 + 고스트.
- 고스트를 친구 원 위로 끌면 그 원이 강조(hover), 떼면 **"○○님에게 전송됨" 토스트**, 소셜탭 유지.
- 그 친구 DM 방을 열면(예: DM 목록 → 해당 친구) 게시물 메시지가 **실제로 남아있음**.
- 기타에 떼면 친구 선택 시트 → 선택 시 전송 + 토스트.
- 빈 곳에 떼면 아무 일 없이 닫힘.
- **짧은 탭=상세, 더블탭=좋아요**가 여전히 정상(드래그는 250ms 이상 눌러야 시작).
- 마소너리 세로 스크롤 정상(짧게 누르고 스크롤 시 드래그 안 걸림).

- [ ] **Step 3: 회귀 확인**

- DM 화면 진입/입력/사진/기록 공유 정상(스토어 연결 후).
- 기존 `ShareBottomSheet`(점3개→공유는 이제 네이티브 공유) 등 다른 동작 영향 없음.

---

## 자체 검토 메모

- **스펙 커버리지:** 조용히 전송+토스트(Task7), DM 스토어 지속(Task3,5), 플로팅 고스트 드래그(Task6,7), 카드 옆 자동 좌/우(Task7 side), 상위 3명(Task2 pickTopFriends), 기타 피커(Task7 Step5). 모두 매핑됨.
- **타입 일관성:** `Friend/Message/SharedRecord`(Task1)·`TargetRect`(Task2)·`CardRect`(Task6)·`useDM` 반환(Task3)을 후속 Task에서 동일 사용.
- **WIP 보호:** 각 Task는 자기 파일만 `git add`. DMScreen/SocialScreen/App은 사용자 WIP 위에 수정.
- **리스크(Task7):** RNGH `activateAfterLongPress` + 화면레벨 오버레이 좌표 측정이 통합 난이도가 높음. 드롭 좌표는 `measureInWindow`/`absoluteX` 같은 화면(window) 좌표계로 통일해 히트테스트(타깃 `onLayout`은 부모 absolute 기준이므로, 필요 시 타깃도 `measureInWindow`로 보정).
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함.
```
