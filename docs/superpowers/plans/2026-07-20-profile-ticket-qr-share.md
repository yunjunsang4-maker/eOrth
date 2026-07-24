# 프로필 "마이" 티켓 (QR 프로필 공유) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필탭 통계 행에 "마이" 항목을 추가하고, 탭하면 QR이 담긴 티켓 모달을 띄워 자신의 프로필을 이미지로 저장·공유하게 한다.

**Architecture:** 새 컴포넌트 `ProfileTicketModal`이 티켓 UI·QR·캡처/저장/공유를 캡슐화한다. `ProfileScreen`은 통계 행에 진입 셀만 추가하고 프로필 데이터를 props로 넘긴다. QR은 `eorth://user/<handle>` 형식(친구찾기 스캐너·appLinks 호환), 캡처는 `react-native-view-shot`, 저장은 `expo-media-library`, 공유는 RN `Share`(안드로이드 이미지 공유는 앱 전반과 동일하게 제한적 — 의도됨).

**Tech Stack:** React Native (Expo), TypeScript, react-native-qrcode-svg, react-native-view-shot, expo-media-library, react-i18next. 자동 테스트 프레임워크 없음 — 검증은 `npx tsc --noEmit` + 실기기 수동 확인(프로젝트 관례).

**참고 — 스펙:** `docs/superpowers/specs/2026-07-20-profile-ticket-qr-share-design.md`

**검증 관례:** 이 저장소는 jest가 없다. 각 태스크의 "테스트"는 `npx tsc --noEmit`(타입/문법 게이트)와 명시된 수동 확인이다. 커밋 트레일러는 항상 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. WIP 혼입 방지를 위해 **파일 단위 스테이징**(지정된 파일만 `git add`).

---

### Task 1: i18n 키 추가 (마이 라벨 + 티켓 액션)

**Files:**
- Modify: `src/i18n/locales/ko.ts`
- Modify: `src/i18n/locales/en.ts`

재사용하는 기존 키(추가 불필요, 참고용): `comp.viewerSaved`('기기에 저장했어요'), `comp.viewerSaveFail`('사진을 저장하지 못했어요'), `friends.qrHint`('아이디를 설정하면\n내 QR이 생성돼요'), `friends.setProfileFirst`('프로필(아이디)을 먼저 설정해주세요'), `profile.tripCount`('여행 수'), `profile.neighbors`('이웃').

- [ ] **Step 1: ko.ts — `profile` 네임스페이스에 `myTicket` 추가**

`src/i18n/locales/ko.ts`에서 `tripCount: '여행 수',`가 있는 `profile` 객체를 찾아 그 아래 줄에 추가:

```ts
    myTicket: '마이',
```

- [ ] **Step 2: ko.ts — `profileTicket` 네임스페이스 신설**

`src/i18n/locales/ko.ts`에서 `profile: { ... }` 객체가 끝나는 `},` 바로 다음 줄에 새 네임스페이스를 추가(같은 들여쓰기 레벨):

```ts
  profileTicket: {
    save: '이미지 저장',
    share: '공유',
    closeA11y: '티켓 닫기',
  },
```

- [ ] **Step 3: en.ts — `profile` 네임스페이스에 `myTicket` 추가**

`src/i18n/locales/en.ts`에서 `profile` 객체의 `tripCount` 근처에 추가:

```ts
    myTicket: 'My',
```

- [ ] **Step 4: en.ts — `profileTicket` 네임스페이스 신설**

`src/i18n/locales/en.ts`에서 `profile: { ... }` 객체 종료 `},` 다음 줄에 추가:

```ts
  profileTicket: {
    save: 'Save image',
    share: 'Share',
    closeA11y: 'Close ticket',
  },
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과(0 errors). i18n 객체는 순수 리터럴이라 구조가 맞으면 통과.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "$(cat <<'EOF'
feat(profile): 마이 티켓 i18n 키 추가(profile.myTicket, profileTicket.*)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ProfileTicketModal 컴포넌트 생성

**Files:**
- Create: `src/components/ProfileTicketModal.tsx`

이 컴포넌트가 티켓 UI·QR·캡처/저장/공유를 모두 담는다. 티켓 카드 내부 레이아웃은 **기능용 플레이스홀더**(추후 시각 디자인이 오면 `ticketRef` View 내부만 교체). QR은 `handle`이 있을 때만 표시하고, 없으면 안내 문구 + 저장·공유 버튼 비활성.

- [ ] **Step 1: 파일 전체 작성**

`src/components/ProfileTicketModal.tsx` 생성, 아래 내용 그대로:

```tsx
// 프로필 "마이" 티켓 — QR로 자신의 프로필을 공유하는 모달.
// 티켓 카드(ticketRef)를 이미지로 캡처해 갤러리 저장 / 시스템 공유한다.
// 시각 디자인은 추후 확정 — 지금은 기능용 플레이스홀더 레이아웃(ticketRef View 내부만 교체 예정).
import React, { useRef } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

// QR 스캔 호환: 친구찾기 스캐너(USER_LINK_RE = eorth://user/...)가 user 형식만 받으므로
// 여기서도 user 형식으로 인코딩한다(profileLink의 profile 형식을 쓰면 스캔이 안 됨).
const userLink = (code: string) => `eorth://user/${code}`;

export interface ProfileTicketModalProps {
  visible: boolean;
  onClose: () => void;
  handle: string;        // 아이디(없으면 '' → QR 대신 안내)
  name: string;          // 표시 이름(= handle)
  photo: string | null;  // 프로필 사진 uri
  homeLabel: string;     // 예: "🇰🇷 대한민국"
  tripCount: number;
  neighborCount: number;
}

export default function ProfileTicketModal({
  visible, onClose, handle, name, photo, homeLabel, tripCount, neighborCount,
}: ProfileTicketModalProps) {
  const { t } = useTranslation();
  const ticketRef = useRef<View>(null);
  const hasHandle = !!handle;

  // 티켓 카드 영역을 PNG로 캡처 — 실패 시 null
  const capture = async (): Promise<string | null> => {
    try {
      return await captureRef(ticketRef, { format: 'png', quality: 1 });
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      // writeOnly 권한 — iOS는 '추가 전용' 팝업이라 부담이 적다(PhotoViewerModal과 동일)
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert(t('comp.viewerSaveFail')); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(t('comp.viewerSaved'));
    } catch {
      Alert.alert(t('comp.viewerSaveFail'));
    }
  };

  const handleShare = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      // iOS는 이미지 전송, Android는 RN Share 한계로 제한적(앱 전반과 동일 — 의도됨)
      await Share.share({ url: uri });
    } catch {
      // 취소 등 — 무해화
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('profileTicket.closeA11y')}
        />

        {/* 캡처 대상 — 티켓 카드. 추후 시각 디자인은 이 View 내부만 교체 */}
        <View ref={ticketRef} collapsable={false} style={st.ticket}>
          <View style={st.header}>
            {photo
              ? <Image source={{ uri: photo }} style={st.avatar} />
              : <View style={[st.avatar, st.avatarEmpty]} />}
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{name || t('friends.setProfileFirst')}</Text>
              {hasHandle && <Text style={st.handle} numberOfLines={1}>@{handle}</Text>}
              <Text style={st.home} numberOfLines={1}>{homeLabel}</Text>
            </View>
          </View>

          <View style={st.stats}>
            <Text style={st.statText}>{t('profile.tripCount')} {tripCount}</Text>
            <Text style={st.statText}>{t('profile.neighbors')} {neighborCount}</Text>
          </View>

          <View style={st.qrWrap}>
            {hasHandle
              ? <QRCode value={userLink(handle)} size={160} color="#000000" backgroundColor="#FFFFFF" quietZone={8} />
              : <Text style={st.qrHint}>{t('friends.qrHint')}</Text>}
          </View>
        </View>

        {/* 액션 — 캡처 대상 밖(버튼이 티켓 이미지에 찍히지 않게) */}
        <View style={st.actions}>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleSave}
            accessibilityRole="button"
          >
            <Text style={st.actionText}>{t('profileTicket.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleShare}
            accessibilityRole="button"
          >
            <Text style={st.actionText}>{t('profileTicket.share')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  // 티켓 카드(플레이스홀더) — 흰 배경(QR 대비 확보). 추후 디자인 교체 대상.
  ticket: { width: '100%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E5E5EA' },
  avatarEmpty: { backgroundColor: '#D8D8DE' },
  name: { fontSize: 17, fontWeight: '800', color: '#0A0A0F' },
  handle: { fontSize: 13, color: '#6B21A8', marginTop: 1 },
  home: { fontSize: 13, color: '#555', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 14 },
  statText: { fontSize: 13, color: '#333' },
  qrWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 176 },
  qrHint: { fontSize: 13, color: '#888', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%', maxWidth: 340 },
  actionBtn: { flex: 1, backgroundColor: '#6B21A8', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과. `captureRef`·`MediaLibrary`·`QRCode` 타입 모두 기존 설치 패키지라 해결됨. 미해결 시 import 경로/패키지명 오타 확인.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProfileTicketModal.tsx
git commit -m "$(cat <<'EOF'
feat(profile): 마이 티켓 모달 — QR 표시 + 이미지 저장/공유

티켓 카드를 view-shot으로 캡처해 MediaLibrary 저장·RN Share 공유.
QR은 eorth://user/<handle>(친구찾기 스캐너 호환), 아이디 미설정 시 안내+버튼 비활성.
시각 디자인은 플레이스홀더 — 추후 ticketRef 내부만 교체.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ProfileScreen에 "마이" 진입 셀 + 모달 연결

**Files:**
- Modify: `src/screens/ProfileScreen.tsx` (StatCard 시그니처, statsRow, 모달 상태·렌더, 스타일)

`StatCard`에 `icon` 옵션을 추가해 "마이" 셀이 숫자 대신 티켓 아이콘을 쓰도록 재사용한다.

- [ ] **Step 1: StatCard가 icon을 받도록 확장**

`src/screens/ProfileScreen.tsx`에서 아래 기존 정의:

```tsx
const StatCard = ({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) => (
  <LiquidPressable onPress={onPress} intensity={0.06} style={styles.statCol}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel} {...andFitText}>{label}</Text>
  </LiquidPressable>
);
```

을 다음으로 교체:

```tsx
const StatCard = ({
  value,
  label,
  onPress,
  icon,
}: {
  value?: string;
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode; // 숫자 대신 표시할 아이콘("마이" 셀 티켓 아이콘)
}) => (
  <LiquidPressable onPress={onPress} intensity={0.06} style={styles.statCol}>
    {icon ?? <Text style={styles.statValue}>{value}</Text>}
    <Text style={styles.statLabel} {...andFitText}>{label}</Text>
  </LiquidPressable>
);
```

- [ ] **Step 2: ProfileTicketModal import 추가**

파일 상단 import 블록(다른 컴포넌트 import들 근처, 예: `import CountryMapView`·`import GrainOverlay` 등이 있는 구역)에 한 줄 추가:

```tsx
import ProfileTicketModal from '../components/ProfileTicketModal';
```

- [ ] **Step 3: 모달 표시 상태 추가**

메인 컴포넌트 내부 상태 선언부(예: `const [actionSheetVisible, setActionSheetVisible] = useState(false);` 근처)에 추가:

```tsx
  const [ticketVisible, setTicketVisible] = useState(false);
```

- [ ] **Step 4: statsRow에 "마이" 셀 추가**

아래 기존 statsRow:

```tsx
            <View style={styles.statsRow}>
              <StatCard value={String(displayTrips.length)} label={t('profile.tripCount')} />
              <StatCard value={String(neighborCount)} label={t('profile.neighbors')} onPress={() => navigation.navigate('FollowerList')} />
            </View>
```

를 다음으로 교체(세 번째 셀 추가):

```tsx
            <View style={styles.statsRow}>
              <StatCard value={String(displayTrips.length)} label={t('profile.tripCount')} />
              <StatCard value={String(neighborCount)} label={t('profile.neighbors')} onPress={() => navigation.navigate('FollowerList')} />
              <StatCard
                icon={<Image source={require('../../assets/ticket.png')} style={styles.statTicketIcon} />}
                label={t('profile.myTicket')}
                onPress={() => setTicketVisible(true)}
              />
            </View>
```

- [ ] **Step 5: 모달 렌더 추가**

다른 모달들이 렌더되는 구역(예: PhotoViewerModal `{profilePhoto && ( ... )}` 근처, 컴포넌트 return의 최상위 Fragment/뷰 안 끝부분)에 추가. 거주국 라벨은 화면의 기존 규칙(`COUNTRY_DATA[homeCountryCode]`, 폴백 대한민국)과 동일하게 계산해 넘긴다:

```tsx
      <ProfileTicketModal
        visible={ticketVisible}
        onClose={() => setTicketVisible(false)}
        handle={handle}
        name={profileName}
        photo={profilePhoto}
        homeLabel={(() => {
          const home = COUNTRY_DATA[homeCountryCode] || { name: '대한민국', flag: '🇰🇷' };
          return `${home.flag} ${home.name}`;
        })()}
        tripCount={displayTrips.length}
        neighborCount={neighborCount}
      />
```

- [ ] **Step 6: 티켓 아이콘 스타일 추가**

`styles` StyleSheet 안, `statValue`/`statLabel` 근처에 추가(숫자 lineHeight 26과 높이를 맞춰 정렬 유지):

```tsx
  statTicketIcon: {
    width: 24,
    height: 26,
    resizeMode: 'contain',
  },
```

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과. `Image`·`COUNTRY_DATA`·`handle`·`profileName`·`profilePhoto`·`homeCountryCode`·`displayTrips`·`neighborCount`는 이미 이 파일 스코프에 존재(각각 Image 태그 사용부, 거주국 표시부, useSettings 구조분해, statsRow에서 확인됨). 미해결 심볼 오류가 나면 해당 변수명이 스코프에 실제로 있는지 재확인.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ProfileScreen.tsx
git commit -m "$(cat <<'EOF'
feat(profile): 통계 행에 마이 티켓 진입 셀 + 모달 연결

StatCard에 icon 옵션 추가해 재사용, 여행 수·이웃 옆에 티켓 아이콘 "마이" 셀.
탭 시 ProfileTicketModal 오픈(프로필 데이터·거주국 라벨 props 전달).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 실기기 수동 검증

**Files:** (없음 — 검증만)

이 저장소는 자동 UI 테스트가 없다. 아래 항목을 실기기(또는 개발 빌드)에서 확인한다. 문제 발견 시 해당 태스크로 돌아가 수정.

- [ ] **Step 1: 진입점 표시 확인**

프로필탭 통계 행에 `여행 수 · 이웃 · 마이`(티켓 아이콘)가 나란히 보이는지. 아이콘이 흰색으로 다른 숫자와 세로 정렬이 맞는지.

- [ ] **Step 2: 티켓 오픈·QR 표시 확인**

"마이" 탭 → 티켓 모달이 뜨고, 프로필 사진·이름·@아이디·거주국·여행 수·이웃 수·중앙 QR이 보이는지. 배경(어두운 오버레이) 탭 시 닫히는지.

- [ ] **Step 3: 저장 확인**

"이미지 저장" 탭 → 권한 팝업 수락 → "기기에 저장했어요" Alert → 갤러리에 티켓 이미지(액션 버튼은 안 찍히고 티켓 카드만)가 저장됐는지.

- [ ] **Step 4: 공유 확인**

"공유" 탭 → iOS: 공유 시트에 티켓 이미지가 뜨는지. Android: 시트가 뜨는지(이미지 전송 제한은 알려진 상태 — 크래시만 없으면 통과).

- [ ] **Step 5: QR 스캔 왕복 확인**

저장한 QR 이미지를 다른 기기 화면에 띄우고, 이 앱 친구찾기 → QR 스캔으로 찍었을 때 **내 프로필(FriendProfile)로 이동**하는지. (핵심 회귀: 인코딩 형식이 스캐너와 일치하는지 검증)

- [ ] **Step 6: 아이디 미설정 엣지 케이스**

아이디가 없는 상태(신규/미설정 계정)에서 "마이" 탭 → QR 자리에 안내 문구(`friends.qrHint`)가 뜨고, 저장·공유 버튼이 비활성(흐리게)인지. 탭해도 아무 동작·크래시 없는지.

- [ ] **Step 7: 최종 커밋(문서 체크 반영, 코드 변경 없으면 생략)**

수동 검증 중 코드 수정이 있었으면 해당 파일만 스테이징해 커밋. 없으면 이 단계 생략.

---

## 완료 기준

- 프로필탭 `여행 수 · 이웃 · 마이` 3열, "마이" = 티켓 아이콘
- "마이" 탭 → QR 티켓 모달, 이미지 저장(양 플랫폼) + 공유(iOS 이미지 / Android 제한)
- 저장한 QR을 친구찾기 스캐너로 찍으면 내 프로필로 이동
- 아이디 미설정 시 안내 + 버튼 비활성
- `npx tsc --noEmit` 통과
- 티켓 시각 디자인은 추후 `ProfileTicketModal.tsx`의 `ticketRef` View 내부 교체로 반영(데이터 바인딩은 이미 완비)
