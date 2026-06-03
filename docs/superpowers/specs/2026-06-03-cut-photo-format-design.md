# 네컷/컷사진 기록 형식 설계 (앨범 대체)

작성일: 2026-06-03
상태: 설계 승인됨 (사용자 "진행해줘")

## 목적
보관 처리된 "앨범" 형식을 대체하는 새 기록 형식. 사용자가 여러 사진을
프레임 레이아웃에 채워 "네컷 사진(포토부스 감성)"을 만든다.
참고: '나만의 네컷' 류 네컷 프레임 앱.

## 핵심 결정 (브레인스토밍)
- **저장 방식**: 데이터(레이아웃·사진URI·프레임) + 미리보기 합성 이미지 둘 다.
  데이터로 재편집 가능, previewUri로 빠른 표시·공유.
- **프레임 종류**: 카탈로그에 '기본'(흰/검 여백·테두리) + '테마'(배경·색·로고 디자인) 둘 다.
  두 방식 모두 사용자가 슬롯에 자기 사진을 채운다.
- **사진 소스**: 갤러리(expo-image-picker). 카메라 촬영은 후순위.
- **슬롯 줌/위치 미세편집**: v1 제외(후순위). v1은 슬롯=사진 cover 채움.
- **합성 렌더링**: RN View 레이아웃 + react-native-view-shot 캡처.

## 데이터 모델 (src/store/recordStore.tsx)
- `RecordViewType`에 `'cut'` 추가 ('album'은 보관 호환 위해 타입 유지, 휴면).
- 기록 객체에 옵셔널 필드 추가:
```ts
cutPhoto?: {
  layout: CutLayout;       // 'two-h'|'two-v'|'three-v'|'four'|'nine'|'film'
  frameId: string;         // cutFrames 카탈로그 id
  photos: string[];        // 슬롯 순서대로 사진 URI (길이 = 슬롯 수)
  previewUri: string;      // view-shot 합성 이미지 경로
}
```

## 레이아웃 사양
| layout | 이름 | 슬롯 | 배치 | 캔버스 비율 |
|---|---|---|---|---|
| two-h | 투컷 가로 | 2 | 1×2 | 4:3 |
| two-v | 투컷 세로 | 2 | 2×1 | 3:4 |
| three-v | 3컷 세로 | 3 | 3×1 | 9:16 |
| four | 4컷 | 4 | 2×2 | 1:1 |
| nine | 9컷 | 9 | 3×3 | 1:1 |
| film | 필름 | 4 | 4×1 세로 스트립 | 1:3 |

## 프레임 카탈로그 (src/constants/cutFrames.ts — 정적 데이터)
```ts
interface CutFrame {
  id: string;
  name: string;
  category: '기본' | '테마';
  layout: CutLayout;
  slots: { x: number; y: number; w: number; h: number }[]; // 캔버스 대비 비율(0~1)
  background: { type: 'color'; value: string } | { type: 'image'; source: any };
  border?: { color: string; width: number; radius: number };
  decorations?: { source: any; x: number; y: number; w: number; h: number }[]; // 로고/스티커
}
```
- 기본 프레임: layout마다 basic-white / basic-black 등.
- 테마 프레임: 디자인 자산(배경 이미지/색/로고) 포함. 초기엔 소수로 시작, 확장 가능.

## 새 화면: src/screens/CutRecordScreen.tsx
흐름:
1. **프레임 선택**: 상단 탭 `[기본 | 테마]` + 카탈로그 그리드. 각 프레임 = 레이아웃+디자인.
2. **사진 채우기**: 캔버스 미리보기에서 빈 슬롯 탭 → 갤러리 선택 → 슬롯에 cover로 채움.
   채운 사진 길게눌러 제거/교체.
3. **저장**: react-native-view-shot으로 캔버스를 1장 이미지로 캡처 → previewUri.
   record(useRecords)에 cutPhoto + 공통 필드(국가·날짜 등) 저장 후 닫기.

## 연결 (앨범 진입점 자리 대체)
- MainScreen `FAB_FORMATS` + 포맷 모달 그리드에 `{ type:'cut', icon:<CutIcon/>, name:'네컷' }` 추가.
- MainScreen `SCREEN_MAP` 2곳에 `cut: 'CutRecord'`.
- AppNavigator: `CutRecord` 라우트 + `CutRecordScreen` import.
- 표시(렌더링):
  - SocialScreen / PostDetailScreen: `viewType==='cut'` → cutPhoto.previewUri 이미지 카드.
  - ProfileScreen / FriendProfileScreen 여행 카드 뱃지: 네컷 아이콘(`CutBadgeIcon`).
- 아이콘: `CutIcon`(FAB용), `CutBadgeIcon`(뱃지용) — 기존 View 기반 아이콘 패턴 따름.

## 신규 의존성
- `react-native-view-shot` (합성 캡처). 디벨롭 빌드라 네이티브 OK.
  `npx expo install react-native-view-shot`.

## 재사용
- 보관된 archive/AlbumRecordScreen의 frameShape·photoSlots·ImagePicker·grid 로직 참고.

## v1 범위 / 비범위
- v1 포함: 6개 레이아웃, 기본 프레임 전체 + 테마 프레임 소수, 갤러리 사진 채우기,
  합성 이미지 저장, FAB 진입·네비·표시 연결.
- v1 제외(후순위): 카메라 촬영, 슬롯 내 줌/위치 편집, 사용자 커스텀 프레임 업로드,
  대량 테마 프레임 라이브러리.

## 호환성/리스크
- 'album' 타입·렌더러는 그대로 유지(휴면) → 기존 데이터 안전.
- view-shot 캡처는 디바이스 픽셀 비율/폰트 로딩 타이밍 주의(캡처 전 레이아웃 안정 대기).
- 테마 프레임 배경 이미지 에셋은 assets/에 추가 필요.
