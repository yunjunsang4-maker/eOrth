# 사진 AI 형식 추천 — 실기기 검증 체크리스트 (EAS dev 빌드 필요)

네이티브 photo-vision 확장은 로컬에서 컴파일 검증이 불가능했다(로컬 prebuild 금지).
EAS dev 빌드 후 iOS/Android 각각 확인할 것. 전부 통과 전에는 OTA·정식 반영 금지.

## 네이티브 신호 (양 플랫폼)
- [ ] iOS 빌드 성공 (PhotoVisionAnalyzer.swift 컴파일)
- [ ] Android 빌드 성공 (PhotoVisionAnalyzer.kt 컴파일)
- [ ] analyzePhotos 반환에 sceneLabels(≤10)·faceCount·hasText·colorStats·dhash가 채워짐
- [ ] dhash: 같은 사진 연사 2장 → 해밍 거리 ≤ 6 확인
- [ ] 100장 앨범 분석 소요 시간 측정 (목표: 2분 이내, 메인 스레드 프리즈 없음)
- [ ] 분석 중 배터리·발열 체감 확인

## 추천 흐름
- [ ] 앨범(사진 ≥4장) 저장 → TripDetail 진입 시 "AI가 사진을 보고 있어요…" → 카드 교체
- [ ] 카드 탭 → 피드/블로그/스트립 화면에 사진 프리필 확인 (블로그는 DAY 헤딩+이미지 블록)
- [ ] 스트립 프리필: 사진 수와 프레임 슬롯 수 일치
- [ ] 카드 X → 재진입 시 재노출 안 됨
- [ ] 앨범 이어 담기 → 카드 갱신(재분석) 확인
- [ ] Expo Go(네이티브 없음) → 섹션 자체 미노출, 크래시 없음
- [ ] 게스트 모드(타인 여행) → 섹션 미노출
- [ ] 분석 진행 중(pending) 앨범을 편집하면 옛 카드가 잠깐 보이는지 (경합 조건 R1)
- [ ] FAB 배지 좌표(bottom:46, left:50%+18) 실기기 시각 확인 (iOS/Android × ko/en)

## 유도 퍼널
- [ ] 거주국을 JP로 바꿔 귀국 시뮬레이션(메모리 eorth-detector-state-persistence 절차) →
      귀국 알림 1건만 발송(이중 발송 없음), 탭 시 AlbumCreate로 이동
- [ ] FAB 열면 사진첩 버튼에 보라 점 배지, 앨범 만들면 사라짐
- [ ] 위치 권한 거부 상태에서도 앨범 저장→추천 카드 정상 (알림·배지만 무동작)

## 파리티 주의점
- [ ] iOS/Android에서 같은 앨범의 추천 컨셉이 크게 다르지 않은지 육안 비교
      (라벨 체계 차이 — 차이가 크면 labelTaxonomy.ts만 조정)
- [ ] Android isSmiling만 지원(iOS 항상 false) → fun 컨셉이 iOS에서 덜 잡히는지 확인
