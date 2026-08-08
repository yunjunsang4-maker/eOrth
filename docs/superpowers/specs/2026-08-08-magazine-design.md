# 앱 내 매거진 — 설계

2026-08-08 · 대상: 메인탭 좌하단 매거진 버튼 + 바텀시트 뷰어 (구현 전 — 구상·계획 단계)

## 요약

운영자가 인스타그램(@eorth_app)에 발행하는 매거진 콘텐츠를 앱 안에서 그대로 보여준다.
메인탭 좌하단(스냅 버튼 대칭 자리) 버튼 → 바텀시트에 최신호 가로 캐러셀 + 하단 아카이브 행.
발행은 수동 재발행(이미지 업로드 + SQL insert 한 줄), 새 호는 푸시 알림까지(2단계).

## 결정 사항 (사용자 확정)

| 질문 | 결정 |
|---|---|
| 콘텐츠 소스 | 운영자 발행 에디토리얼 — 인스타 매거진 내용을 그대로 |
| 가져오는 방식 | **수동 재발행** (인스타 API 연동·임베드 안 함) |
| 진입 화면 | 최신호 캐러셀 + 하단 아카이브 행 (한 시트에 둘 다) |
| 뷰어 형식 | 시트 안 가로 캐러셀 (풀스크린 전환 없음) |
| 새 호 알림 | 푸시 알림까지 (버튼 미읽음 뱃지 포함) |
| 파이프라인 | **A안: Supabase Storage + 테이블** (gh-pages 정적 JSON 안 기각 — 푸시에 어차피 서버 필요, 이미지를 git에 쌓는 단점만 남음) |

## 1. 진입 버튼 (좌하단)

- 위치: 스냅 버튼 대칭 — `left: 46, bottom: 129, size: 60` (SNAP_BTN 상수 참조).
- **렌더 레이어: CustomTabBar 오버레이(RecordFab과 같은 층)** — 스냅 버튼이 MainScreen이
  아니라 탭 바 오버레이에 그려지므로, 같은 층이어야 z-순서와 숨김(빠른공유 드래그 시
  탭 바와 함께 페이드)이 일관된다. MainScreen에 직접 그리면 안 된다.
- 노출 조건: 스냅 버튼과 동일(메인탭에서만). **기본안: 지구본 화면에서만** — 대륙 모드
  좌하단에는 지역명 칩이 떠 있어 겹침 위험. 대륙 모드 노출 여부는 구현 때 실기기로
  겹침을 보고 확정한다.
- 아이콘: 제작 SVG(펼친 잡지 모양) — 이모지 금지 규칙([아이콘 규칙] CLAUDE.md).
- 미읽음 뱃지: 버튼 우상단 스킨 강조색 점. 판정은 로컬 —
  `최신 issue_no > settingsStore.lastSeenMagazineIssueNo`. 시트를 열면 갱신.

## 2. 바텀시트 UI

- **SheetShell 패턴 재사용**(2e244a6 — 딤은 페이드, 시트만 슬라이드, onClosed 단일 처리).
- 구조(위→아래): 핸들 → 호 제목(`eOrth 매거진 {issue_no}호 · {title}`) →
  가로 캐러셀(페이지 이미지 + 페이지 도트, 기본 비율 4:5) →
  인스타 원본 링크(`instagram_url` 있을 때만, `Linking.openURL`) →
  아카이브 행(과거 호 표지 가로 스크롤 — 탭하면 시트 안에서 그 호로 전환).
- 이미지는 전부 **expo-image + `cachePolicy: "memory-disk"`** — RN Image 금지
  (원본 전체 디코드로 메모리 폭증, 2026-08-08 최적화 점검에서 확인된 함정).
- 작은 화면: 시트 `maxHeight '85%'` + 내부 스크롤 영역 `flexShrink: 1`
  (CutTravelInfoScreen 통화 시트가 모범 패턴 — 568pt에서 하단 잘림 방지).
- 캐러셀 폭 = 화면폭 − 시트 좌우 패딩. 페이지 이미지 비율은 호 단위 고정(4:5 기본).

## 3. 데이터 모델 (Supabase)

```sql
create table if not exists public.magazine_issues (
  id            uuid primary key default gen_random_uuid(),
  issue_no      int not null unique,          -- 호수 (뱃지 비교 키)
  title_ko      text not null,
  title_en      text,                          -- 없으면 ko 폴백
  pages         text[] not null,               -- 페이지 이미지 URL, 순서 = 배열 순서
  cover_url     text,                          -- 없으면 첫 페이지(Postgres 배열은 1-기반: pages[1], JS에선 pages[0])
  instagram_url text,                          -- 원본 게시물 링크(선택)
  published_at  timestamptz not null default now(),
  active        boolean not null default true
);
```

- RLS: `ad_campaigns`와 동일 패턴 — `active = true and published_at <= now()` 행만
  누구나(비로그인 포함) select. 삽입·수정·삭제 정책 없음 → service_role(SQL Editor)만 쓰기.
- 이미지: Storage `media` 버킷 `magazine/issue-{no}/p{n}.jpg`. 긴변 1440px JPEG 권장
  (선명도·용량 균형 — 캐러셀 표시 폭은 최대 ~400pt@3x).
- **발행 절차 = ① 이미지 업로드(대시보드) ② insert 한 줄.** 앱 반영은 캐시 TTL 내 자동.
- i18n: 이미지는 한국어 원본 그대로(다국어 이미지 없음), 제목만 `title_en` 폴백.

## 4. 앱 데이터 흐름

- `services/magazine.ts` 신설 — `fetchMagazineIssues()`:
  `services/adCampaigns.ts`와 같은 구조(AsyncStorage 캐시 → TTL 신선하면 네트워크 생략,
  실패 시 만료 캐시 폴백, 둘 다 없으면 빈 배열). **TTL 12시간**(발행 빈도가 낮다).
- 로드 시점: 시트 열 때. 버튼 뱃지용 최신호 확인만 메인 진입 시 1회(캐시 우선) —
  앱 시작 비용 0 유지.
- 미읽음 상태: `settingsStore.lastSeenMagazineIssueNo: number`(persist, 기기 로컬).
  시트가 열리면 최신호 번호로 갱신.
- 오프라인: 이미 본 호 = 메타 캐시 + expo-image 디스크 캐시로 열람 가능.
  한 번도 못 받았으면 시트에 빈 상태 문구(오류 아님, 안내 톤).

## 5. 새 호 푸시 (2단계)

- `magazine_issues` insert 트리거 → pg_net으로 `send-push` Edge Function 호출
  (신고 알림 `notify_report_alert` 트리거와 같은 패턴). 발행 SQL 한 줄에 푸시가 딸려 나간다.
- **`send-push` 확장 필요**: 현재 개인 대상 위주 → 전체 발송 경로 추가
  (`push_tokens` 전량, Expo push 100건 배치). 작업량의 대부분이 여기다.
- 정책: 마케팅성 푸시이므로 `notifPrefs`에 매거진 수신 토글(기본 on, 설정에서 off).
  문구는 이모지 없는 앱 푸시 규칙 그대로.
- 트리거에 Vault 시크릿이 얽히므로 pg_cron 401 사태(2026-08-07)의 교훈 적용 —
  등록 후 **실행 결과(`net._http_response`)까지 확인**해야 완료다.

## 구현 단계 분리

| 단계 | 내용 | 완결성 |
|---|---|---|
| 1단계 | 버튼+뱃지, 바텀시트, `magazine_issues` 테이블+RLS, `services/magazine.ts`, settingsStore 필드 | 이것만으로 기능 완결(열어본 사람은 다 봄) |
| 2단계 | insert 트리거 + send-push 전체 발송 경로 + notifPrefs 토글 + 설정 UI | 도달률 향상 |

## 검증 (`*.verify.ts`, npm test)

- 미읽음 판정(최신 issue_no vs lastSeen) 순수 로직.
- 캐시 폴백(신선/만료/없음 × 네트워크 성공/실패) — adCampaigns와 같은 표로.
- 실기기(자동화 불가, 문서화): 568pt 시트 높이, 이미지 로드/디스크 캐시 오프라인 열람,
  대륙 모드 지역명 칩과 버튼 겹침, 빠른공유 드래그 시 버튼 페이드.

## 범위 밖 (명시적 제외, 1차)

- 좋아요·댓글·앱내 공유 카드.
- 인스타 자동 동기화(Graph API) — 수동 재발행 확정.
- 호 내 텍스트 본문(이미지가 곧 본문), 다국어 이미지.
- 풀스크린 뷰어 — 시트 안 캐러셀로 충분, 반응 보고 후속.
