# 온보딩 거주국가 설정 (BasicInfo) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩 이름 입력 단계(BasicInfo)에서 거주국가를 선택해 `settingsStore.homeCountryCode`(ISO)로 저장하게 한다. (과거여행 해외 분석의 선행 단계)

**Architecture:** 단일 화면 변경. `constants/countries.ts`의 `term` 첫 토큰을 대문자화해 ISO 코드를 얻는다(`term: 'kr 대한민국 korea'` → `KR`). 인라인 검색 모달로 국가를 고르고 "다음"에서 `setHomeCountryCode`.

**Tech Stack:** React Native + Expo, TypeScript, `useSettings`, `constants/countries.ts`. 검증: `npx tsc --noEmit` + 수동.

---

## 파일 구조
- `src/screens/BasicInfoScreen.tsx` (수정) — 거주국가 필드 + 검색 모달 + 저장.

---

### Task 1: BasicInfo에 거주국가 선택 추가

**Files:**
- Modify: `src/screens/BasicInfoScreen.tsx`

- [ ] **Step 1: import + 타입/헬퍼 추가**

상단 import에 추가:
```ts
import { Modal, FlatList } from 'react-native';
import { COUNTRIES, type Country } from '../constants/countries';
```
> 주의: `Modal`/`FlatList`가 기존 `react-native` import 구문에 없으면 그 구문에 추가한다(중복 import 금지).

파일 상단(컴포넌트 밖)에 헬퍼 추가:
```ts
const codeOf = (c: Country) => c.term.split(' ')[0].toUpperCase();
const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => codeOf(c) === 'KR') ?? COUNTRIES[0];
```

- [ ] **Step 2: settings + 상태 추가**

`useSettings()` 구조분해에 `homeCountryCode`, `setHomeCountryCode` 추가:
```tsx
  const { nickname: storeNickname, setNickname: setStoreNickname, setProfilePhoto, profilePhoto, homeCountryCode, setHomeCountryCode } = useSettings();
```
컴포넌트 상태 추가(닉네임 상태 옆):
```tsx
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find((c) => codeOf(c) === homeCountryCode) ?? DEFAULT_COUNTRY
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
```

- [ ] **Step 3: handleFinish에 거주국가 저장**

```tsx
  const handleFinish = () => {
    setStoreNickname(nickname.trim());
    setProfilePhoto(photo);
    setHomeCountryCode(codeOf(selectedCountry));
    navigation.navigate('TravelImport');
  };
```

- [ ] **Step 4: 거주국가 필드 UI (닉네임 섹션 아래)**

닉네임 `inputSection` View 닫힌 직후, `</ScrollView>` 전에 추가:
```tsx
          {/* 거주국가 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>거주국가</Text>
            <TouchableOpacity
              style={styles.inputWrapper}
              activeOpacity={0.8}
              onPress={() => { setCountrySearch(''); setCountryModalVisible(true); }}
            >
              <Text style={[styles.input, { paddingVertical: 16 }]}>
                {selectedCountry.flag} {selectedCountry.name}
              </Text>
              <Text style={styles.charCount}>변경</Text>
            </TouchableOpacity>
          </View>
```

- [ ] **Step 5: 국가 검색 모달 (return 최상위 LinearGradient 안, KeyboardAvoidingView 뒤)**

`</KeyboardAvoidingView>` 다음, `</LinearGradient>` 전에 추가:
```tsx
        <Modal visible={countryModalVisible} animationType="slide" onRequestClose={() => setCountryModalVisible(false)}>
          <View style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>거주국가 선택</Text>
              <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="국가 검색 (예: 한국, japan)"
              placeholderTextColor={Colors.textMuted}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
            />
            <FlatList
              data={countrySearch.trim()
                ? COUNTRIES.filter((c) => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
                : COUNTRIES}
              keyExtractor={(c) => c.term}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => { setSelectedCountry(item); setCountryModalVisible(false); setCountrySearch(''); }}
                >
                  <Text style={styles.modalItemText}>{item.flag} {item.name}</Text>
                  {codeOf(item) === codeOf(selectedCountry) && <Text style={styles.modalItemCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>
```

- [ ] **Step 6: 모달 스타일 추가 (StyleSheet)**

`styles` 객체에 추가:
```ts
  modalRoot: { flex: 1, backgroundColor: '#0A0118', paddingTop: 60 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  modalTitle: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  modalClose: { fontSize: Typography.fontSize.base, color: Colors.primary, fontFamily: Typography.fontFamily.medium },
  modalSearch: { marginHorizontal: Spacing[6], marginBottom: Spacing[3], backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12, fontSize: Typography.fontSize.base },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalItemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  modalItemCheck: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: 'bold' },
```

- [ ] **Step 7: 부제 카피 보정**

```tsx
            <Text style={styles.subtitle}>eOrth에서 사용할 닉네임과 거주국가를 설정해주세요</Text>
```

- [ ] **Step 8: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `BasicInfoScreen.tsx` 신규 오류 없음(기존 `archive/`만)

- [ ] **Step 9: 커밋**

```bash
git add src/screens/BasicInfoScreen.tsx
git commit -m "feat(onboarding): set home country at BasicInfo step"
```

---

### Task 2: 통합 점검 (수동)

**Files:** 없음

- [ ] **Step 1: 타입 체크**

Run: `npx tsc --noEmit` → 신규 오류 없음(archive 제외)

- [ ] **Step 2: 앱 시나리오**

Run: `npx expo start`
확인:
- BasicInfo에 "거주국가" 필드 표시(기본 🇰🇷 대한민국).
- 탭 → 검색 모달 → "japan"/"일본" 검색 → 일본 선택 → 필드 반영.
- "다음" → TravelImport 이동, 이후 해외 분석이 선택한 거주국가 기준(예: 일본 거주면 한국이 해외로 잡힘).
- BasicInfo 재진입 시 저장된 거주국가가 초기 선택으로 표시.

---

## 자체 검토 메모
- **스펙 커버리지:** 인라인 검색 모달(Task1 Step4–6), term→ISO 저장(Step3 codeOf), 초기값 복원(Step2), 카피(Step7). 매핑됨.
- **타입 일관성:** `Country`/`codeOf`/`selectedCountry` 일관 사용. `homeCountryCode`는 ISO 대문자.
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함.
- **주의:** `Modal`/`FlatList`/`TextInput`는 기존 react-native import에 이미 있는지 확인 후 없는 것만 추가(중복 금지). `TextInput`은 BasicInfo에 이미 import됨.
```
