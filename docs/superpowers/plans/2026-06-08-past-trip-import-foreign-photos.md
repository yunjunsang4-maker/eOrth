# 과거 여행 불러오기 — 거주국가 밖 사진 분석 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩 "과거 여행 불러오기"가 갤러리에서 거주국가 밖(해외)에서 GPS로 찍힌 사진만 분석해 과거 해외 여행을 자동 발견하도록 바꾼다(국내·무GPS 제외, 데모 샘플 제거).

**Architecture:** 필터링·클러스터링·국가매핑 같은 순수 로직을 `src/utils/pastTripScan.ts`로 추출해 `*.verify.ts`로 TDD한다. `TravelImportScreen.tsx`는 갤러리/지오코딩(네이티브)만 담당하고 결과를 순수 함수에 넘긴다.

**Tech Stack:** React Native + Expo, TypeScript, expo-media-library, expo-location, `useSettings`(homeCountryCode). 테스트: `npx tsx <file>.verify.ts`, `npx tsc --noEmit`.

**WIP 주의:** `TravelImportScreen.tsx` 수정 시 지정한 영역만 바꾸고, 커밋은 해당 파일만 `git add` 한다.

---

## 파일 구조

- `src/utils/pastTripScan.ts` (신규) — `COUNTRY_FLAGS`, `countryInfoFromCode`, `clusterForeignTrips`, 타입 `ScannedPhoto`/`ScannedTrip`.
- `src/utils/pastTripScan.verify.ts` (신규) — 순수 로직 검증.
- `src/screens/TravelImportScreen.tsx` (수정) — 위 모듈 사용, 해외 전용 스캔, 데모 샘플 제거, 빈 상태.

---

### Task 1: 순수 스캔 로직 추출 (pastTripScan)

**Files:**
- Create: `src/utils/pastTripScan.ts`
- Test: `src/utils/pastTripScan.verify.ts`

- [ ] **Step 1: 실패하는 검증 스크립트 작성**

```ts
// 과거여행 스캔 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/pastTripScan.verify.ts
import { countryInfoFromCode, clusterForeignTrips, type ScannedPhoto } from './pastTripScan';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const DAY = 24 * 60 * 60 * 1000;
function p(uri: string, code: string | null, t: number): ScannedPhoto {
  const info = code ? countryInfoFromCode(code) : { country: '', countryName: '', countryFlag: '' };
  return { uri, creationTime: t, countryCode: code, countryName: info.countryName, countryFlag: info.countryFlag };
}

// countryInfoFromCode
{
  const jp = countryInfoFromCode('JP');
  assert(jp.countryName === '일본' && jp.countryFlag === '🇯🇵' && jp.country === '🇯🇵 일본', '알려진 코드 매핑');
  const kr = countryInfoFromCode('KR');
  assert(kr.countryName === '한국', 'KR 매핑 추가됨');
  const unknown = countryInfoFromCode('ZZ', 'Zedland');
  assert(unknown.countryFlag === '✈️' && unknown.countryName === 'Zedland', '미등록 코드 폴백');
}

// 홈국가/무GPS 제외
{
  const photos = [
    p('a', 'KR', 100),       // 국내 → 제외
    p('b', null, 200),       // 무GPS → 제외
    p('c', 'JP', 300),       // 해외 → 포함
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 1 && trips[0].countryName === '일본', '국내·무GPS 제외, 해외만');
  assert(trips[0].photoCount === 1, '여행 사진 수 1');
}

// 같은 국가 7일 이내 = 한 여행
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'JP', 2 * DAY),
    p('c', 'JP', 5 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 1 && trips[0].photoCount === 3, '같은국가 7일내 1개 여행');
}

// 같은 국가 7일 초과 = 별도 여행
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'JP', 30 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 2, '같은국가 멀리 떨어지면 2개 여행');
}

// 다른 국가 = 별도 여행, 최신순 정렬
{
  const photos = [
    p('a', 'JP', 0),
    p('b', 'FR', 10 * DAY),
  ];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(trips.length === 2, '다른국가 2개 여행');
  assert(trips[0].countryName === '프랑스', '최신 여행이 앞(내림차순)');
}

// 홈국가가 JP면 KR이 해외로 포함
{
  const photos = [p('a', 'KR', 0), p('b', 'JP', 10)];
  const trips = clusterForeignTrips(photos, 'JP');
  assert(trips.length === 1 && trips[0].countryName === '한국', '홈=JP일 때 KR은 해외');
}

// 날짜 포맷/필드
{
  const photos = [p('a', 'JP', Date.UTC(2025, 2, 1)), p('b', 'JP', Date.UTC(2025, 2, 5))];
  const trips = clusterForeignTrips(photos, 'KR');
  assert(/^\d{4}\.\d{2}\.\d{2}$/.test(trips[0].startDate), 'startDate YYYY.MM.DD');
  assert(trips[0].medias.length === 1 && trips[0].medias[0] === 'a', '대표 미디어=첫 사진');
  assert(trips[0].title === '일본 여행', '제목 국가단위');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/utils/pastTripScan.verify.ts`
Expected: FAIL — `Cannot find module './pastTripScan'`

- [ ] **Step 3: 구현**

```ts
export interface ScannedPhoto {
  uri: string;
  creationTime: number;
  countryCode: string | null;   // ISO 국가코드(reverse geocode). GPS 없거나 실패 시 null
  countryName: string;
  countryFlag: string;
}

export interface ScannedTrip {
  id: string;
  country: string;        // "🇯🇵 일본"
  countryName: string;
  countryFlag: string;
  date: string;           // endDate, 'YYYY.MM.DD'
  startDate: string;
  endDate: string;
  rating: number;
  title: string;
  photoCount: number;
  content: string;
  medias: string[];
  weather: string;
  companions: string[];
}

export const COUNTRY_FLAGS: Record<string, { name: string; flag: string }> = {
  KR: { name: '한국', flag: '🇰🇷' },
  JP: { name: '일본', flag: '🇯🇵' },
  US: { name: '미국', flag: '🇺🇸' },
  FR: { name: '프랑스', flag: '🇫🇷' },
  IT: { name: '이탈리아', flag: '🇮🇹' },
  GB: { name: '영국', flag: '🇬🇧' },
  CN: { name: '중국', flag: '🇨🇳' },
  ES: { name: '스페인', flag: '🇪🇸' },
  TH: { name: '태국', flag: '🇹🇭' },
  VN: { name: '베트남', flag: '🇻🇳' },
  PH: { name: '필리핀', flag: '🇵🇭' },
  TW: { name: '대만', flag: '🇹🇼' },
  HK: { name: '홍콩', flag: '🇭🇰' },
  SG: { name: '싱가포르', flag: '🇸🇬' },
  GU: { name: '괌', flag: '🇬🇺' },
  AU: { name: '호주', flag: '🇦🇺' },
  CA: { name: '캐나다', flag: '🇨🇦' },
  DE: { name: '독일', flag: '🇩🇪' },
  CH: { name: '스위스', flag: '🇨🇭' },
};

export function countryInfoFromCode(
  code: string,
  fallbackCountry?: string
): { country: string; countryName: string; countryFlag: string } {
  const detail = COUNTRY_FLAGS[code] || { name: fallbackCountry || code, flag: '✈️' };
  return { country: `${detail.flag} ${detail.name}`, countryName: detail.name, countryFlag: detail.flag };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/** 해외(거주국가 밖) + GPS 있는 사진만 시간/국가 기준 클러스터링 → 여행 카드 */
export function clusterForeignTrips(photos: ScannedPhoto[], homeCountryCode: string): ScannedTrip[] {
  const foreign = photos
    .filter((p) => !!p.countryCode && p.countryCode !== homeCountryCode)
    .sort((a, b) => a.creationTime - b.creationTime);

  interface Cluster {
    code: string;
    countryName: string;
    countryFlag: string;
    country: string;
    photos: string[];
    dates: number[];
  }

  const clusters: Cluster[] = [];
  for (const p of foreign) {
    const last = clusters[clusters.length - 1];
    const sameCountry = !!last && last.code === p.countryCode;
    const withinTime = !!last && p.creationTime - last.dates[last.dates.length - 1] <= SEVEN_DAYS_MS;
    if (last && sameCountry && withinTime) {
      last.photos.push(p.uri);
      last.dates.push(p.creationTime);
    } else {
      clusters.push({
        code: p.countryCode as string,
        countryName: p.countryName,
        countryFlag: p.countryFlag,
        country: `${p.countryFlag} ${p.countryName}`,
        photos: [p.uri],
        dates: [p.creationTime],
      });
    }
  }

  const trips: ScannedTrip[] = clusters.map((c, i) => {
    c.dates.sort((a, b) => a - b);
    const startDate = formatDate(c.dates[0]);
    const endDate = formatDate(c.dates[c.dates.length - 1]);
    return {
      id: `scanned-${c.code}-${i}`,
      country: c.country,
      countryName: c.countryName,
      countryFlag: c.countryFlag,
      date: endDate,
      startDate,
      endDate,
      rating: 5,
      title: `${c.countryName} 여행`,
      photoCount: c.photos.length,
      content: `${c.countryName}에서의 소중한 기록입니다. 총 ${c.photos.length}장의 사진이 타임라인에 저장됩니다.`,
      medias: [c.photos[0]],
      weather: '맑음',
      companions: ['가족'],
    };
  });

  trips.sort(
    (a, b) => new Date(b.date.replace(/\./g, '-')).getTime() - new Date(a.date.replace(/\./g, '-')).getTime()
  );
  return trips;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx src/utils/pastTripScan.verify.ts`
Expected: PASS — `ALL PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/utils/pastTripScan.ts src/utils/pastTripScan.verify.ts
git commit -m "feat(import): pure foreign-trip clustering + country mapping"
```

---

### Task 2: TravelImportScreen 해외 전용 스캔으로 전환

**Files:**
- Modify: `src/screens/TravelImportScreen.tsx`

- [ ] **Step 1: import 교체 + 로컬 상수 제거**

상단에서 `useSettings`와 순수 모듈을 import 한다(기존 `useRecords` import 아래):
```ts
import { useSettings } from '../store/settingsStore';
import { countryInfoFromCode, clusterForeignTrips, type ScannedPhoto, type ScannedTrip } from '../utils/pastTripScan';
```
그리고 파일 상단의 로컬 `const COUNTRY_FLAGS = {...}` 정의와 `const SUGGESTED_TRIPS = [...]` 정의를 **삭제**한다(이제 util/순수 로직이 대체, 데모 샘플 제거).

- [ ] **Step 2: 상태/거주국가 연동**

컴포넌트 본문에서:
```tsx
  const { addRecord } = useRecords();
  const { homeCountryCode } = useSettings();
```
`scannedTrips` 상태 타입을 `ScannedTrip[]`로, `usingMockData` 상태는 제거:
```tsx
  const [scannedTrips, setScannedTrips] = useState<ScannedTrip[]>([]);
```
(기존 `const [usingMockData, setUsingMockData] = useState(false);` 줄 삭제, 이 변수 참조도 모두 제거)

- [ ] **Step 3: 권한 거부 시 빈 상태(데모 제거)**

`requestPermission`에서 갤러리 거부 시 데모 스캔을 제안하던 Alert 분기를 빈 상태로 바꾼다:
```tsx
      } else {
        setPermissionStatus('denied');
        setScanFinished(true);
        setScannedTrips([]);
      }
```

- [ ] **Step 4: startScan을 해외 전용으로 재작성**

`startScan`을 아래로 교체(시그니처에서 `forceMock` 제거):
```tsx
  const startScan = async (hasLocationPermission: boolean) => {
    setScanning(true);
    setProgress(0);
    setScannedTrips([]);

    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        first: 150,
        mediaType: 'photo',
        sortBy: 'creationTime',
      });
      if (!assets || assets.length === 0) throw new Error('No photos found in gallery');

      const totalAssets = assets.length;
      const assetInfos: { id: string; uri: string; creationTime: number; location: any }[] = [];
      const chunkSize = 15;

      for (let i = 0; i < totalAssets; i += chunkSize) {
        const chunk = assets.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(async (asset) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              return { id: asset.id, uri: asset.uri, creationTime: asset.creationTime || Date.now(), location: info.location };
            } catch {
              return { id: asset.id, uri: asset.uri, creationTime: asset.creationTime || Date.now(), location: undefined };
            }
          })
        );
        assetInfos.push(...results);
        setProgress(Math.min(60, Math.round(((i + chunk.length) / totalAssets) * 60)));
      }

      // 지오코딩 (해외 사진만 ScannedPhoto로 수집)
      const geocodeCache: Record<string, { code: string; name: string } | null> = {};
      const scanned: ScannedPhoto[] = [];

      for (let i = 0; i < assetInfos.length; i++) {
        const info = assetInfos[i];
        setProgress(60 + Math.min(35, Math.round((i / totalAssets) * 35)));

        if (!(hasLocationPermission && info.location && info.location.latitude && info.location.longitude)) {
          continue; // GPS 없음 → 제외
        }
        const lat = info.location.latitude;
        const lon = info.location.longitude;
        const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;

        let geo = geocodeCache[cacheKey];
        if (geo === undefined) {
          try {
            const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            const addr = res && res[0];
            geo = addr?.isoCountryCode ? { code: addr.isoCountryCode, name: addr.country || addr.isoCountryCode } : null;
          } catch {
            geo = null;
          }
          geocodeCache[cacheKey] = geo;
        }
        if (!geo) continue; // 지오코딩 실패 → 제외

        const cinfo = countryInfoFromCode(geo.code, geo.name);
        scanned.push({
          uri: info.uri,
          creationTime: info.creationTime,
          countryCode: geo.code,
          countryName: cinfo.countryName,
          countryFlag: cinfo.countryFlag,
        });
      }

      const trips = clusterForeignTrips(scanned, homeCountryCode);
      setProgress(100);
      setTimeout(() => {
        setScanning(false);
        setScanFinished(true);
        setScannedTrips(trips);
      }, 400);
    } catch (error) {
      console.error('Scan failed:', error);
      setProgress(100);
      setTimeout(() => {
        setScanning(false);
        setScanFinished(true);
        setScannedTrips([]);
      }, 400);
    }
  };
```

`requestPermission` 내부의 `startScan(...)` 호출들에서 두 번째 인자(`forceMock`)를 쓰던 부분이 있으면 제거하고 `startScan(locStatus === 'granted')` / `startScan(false)` 형태로 맞춘다.

- [ ] **Step 5: 결과/빈 상태 렌더**

결과 영역에서 `usingMockData` 안내 박스(`fallbackAlert`)를 제거하고, 스캔 완료 시 결과가 없으면 빈 상태를 보여준다. `) : (` /* Scanned ... */ 블록을 아래로 교체:
```tsx
        ) : scannedTrips.length === 0 ? (
          /* 빈 상태 — 해외 사진 못 찾음/권한 거부 */
          <View style={styles.centerArea}>
            <View style={styles.globeGlowWrap}>
              <View style={styles.glowBg} />
              <View style={styles.mockGlobe}>
                <Text style={styles.mockGlobeEmoji}>🔍</Text>
              </View>
            </View>
            <Text style={styles.scanText}>해외 여행 사진을 찾지 못했어요</Text>
            <Text style={[styles.resultDesc, { textAlign: 'center', paddingHorizontal: 20 }]}>
              거주국가 밖에서 GPS가 기록된 사진이 없어요.{'\n'}위치 접근을 허용하면 더 잘 찾을 수 있어요.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
              <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.btnGrad}>
                <Text style={styles.btnText}>수동으로 기록하기</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
              <Text style={styles.skipText}>건너뛰기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Scanned Suggested Trips List View */
          <View style={styles.resultsArea}>
            <Text style={styles.resultTitle}>
              총 <Text style={styles.accentText}>{scannedTrips.length}개</Text>의 해외 여행을 발견했습니다!
            </Text>
            <Text style={styles.resultDesc}>가져올 여행 기록을 선택해 주세요. 지구본에 바로 연동됩니다.</Text>

            <View style={styles.listWrap}>
              {scannedTrips.map((trip) => {
                const isSelected = selectedIds.includes(trip.id);
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={[styles.tripCard, isSelected && styles.tripCardSelected]}
                    onPress={() => toggleSelect(trip.id)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: trip.medias[0] }} style={styles.cardImage} />
                    <View style={styles.cardInfo}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.countryBadge}>
                          <Text style={styles.countryText}>{trip.country}</Text>
                        </View>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                      </View>
                      <Text style={styles.cardTitle}>{trip.title}</Text>
                      <Text style={styles.cardDate}>{trip.startDate} ~ {trip.endDate.substring(5)}</Text>
                      <Text style={styles.cardContent} numberOfLines={2}>{trip.content}</Text>
                      <View style={styles.cardFooter}>
                        <Text style={styles.photoCountText}>📷 사진 {trip.photoCount}장 발견</Text>
                        <Text style={styles.ratingText}>★ {trip.rating}.0</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
```

> 주의: 하단 가져오기 바(`scanFinished && ...`)는 결과가 0개면 보이면 안 된다. 조건을 `scanFinished && scannedTrips.length > 0` 으로 바꾼다.

- [ ] **Step 6: 부제 카피 보정**

헤더 부제 문구를 교체:
```tsx
          <Text style={styles.subtitle}>
            내 갤러리에서 거주국가 밖에서 찍은 사진을 분석해{'\n'}다녀온 해외 여행을 자동으로 찾아드려요.
          </Text>
```

- [ ] **Step 7: 미사용 정리 + 타입 체크**

- `fallbackAlert`/`fallbackAlertText` 스타일은 더 이상 참조되지 않으면 남겨둬도 컴파일 무해(선택적으로 제거).
- `usingMockData` 잔여 참조가 없는지 확인.

Run: `npx tsc --noEmit`
Expected: `TravelImportScreen.tsx` 신규 오류 없음(기존 `archive/`만)

- [ ] **Step 8: 커밋**

```bash
git add src/screens/TravelImportScreen.tsx
git commit -m "feat(import): scan foreign-only past trips via homeCountryCode, drop mock"
```

---

### Task 3: 통합 점검 (수동)

**Files:** 없음

- [ ] **Step 1: 정적 검증**

Run:
```bash
npx tsx src/utils/pastTripScan.verify.ts
npx tsc --noEmit
```
Expected: verify `ALL PASS`, tsc 신규 오류 없음(archive 제외).

- [ ] **Step 2: 앱 실행 시나리오**

Run: `npx expo start`
확인:
- 온보딩 "과거 여행 불러오기" → 권한 허용 → 스캔 → **해외(거주국가 밖) GPS 사진만** 국가/기간별 카드로 표시.
- 국내(거주국가)·위치없는 사진은 결과에 안 나옴, 데모 샘플(일본/프랑스/미국)도 안 뜸.
- 해외 사진이 없으면 **빈 상태**("해외 여행 사진을 찾지 못했어요") + 수동/건너뛰기.
- 갤러리/위치 권한 거부 → 빈 상태.
- 카드 선택 → 가져오기 → Main, 기록 반영.

---

## 자체 검토 메모

- **스펙 커버리지:** 해외 GPS만(Task1 clusterForeignTrips 필터), homeCountryCode 사용(Task2 Step2), KR 매핑 추가/지역분기 제거(Task1 COUNTRY_FLAGS·국가단위), 데모 제거+빈 상태(Task2 Step3·5), 카피(Step6). 매핑됨.
- **타입 일관성:** `ScannedPhoto`/`ScannedTrip`(Task1)을 Task2에서 동일 사용. `clusterForeignTrips`/`countryInfoFromCode` 시그니처 일치.
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함.
