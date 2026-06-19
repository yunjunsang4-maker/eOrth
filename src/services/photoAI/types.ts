/**
 * 온디바이스 AI 사진 추천 — 공용 타입 정의
 *
 * 3단계 파이프라인 전체에서 공유하는 데이터 구조.
 * Step 1(메타데이터 추출 + 그룹화)에서는 PhotoMeta / SpotGroup 만 사용하고,
 * 품질(quality)·의미(semantic) 필드는 Step 2/3에서 채워 넣기 위해 미리 선언한다.
 */

// ─── 좌표 ───
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// ─── Step 2 (기술적 품질 평가) 결과가 채워질 자리 ───
export interface PhotoQuality {
  blurScore?: number;        // 0~1, 높을수록 선명
  exposureScore?: number;    // 0~1, 0.5 부근이 적정 노출
  aestheticsScore?: number;  // OS 미학 점수 (iOS Vision / Android ML Kit)
  passed?: boolean;          // 품질 필터 통과 여부
}

// ─── Step 3 (의미 분석) 결과가 채워질 자리 ───
export interface PhotoSemantic {
  hasFace?: boolean;
  isSmiling?: boolean;
  isFood?: boolean;
  isLandscape?: boolean;
  isLandmark?: boolean;
  isDocument?: boolean;      // 영수증 / 지도 캡처 / 스크린샷 → 제외 대상
  weight?: number;           // 종합 가중치 (베스트컷 선정 점수)
}

// ─── 사진 1장의 메타데이터 (Step 1 산출물) ───
export interface PhotoMeta {
  id: string;                // MediaLibrary asset id
  uri: string;               // 원본 asset uri (네이티브에는 직접 넘기지 않음)
  thumbnailUri: string | null; // 축소 썸네일 경로 (Step 2에서 생성, 분석용)
  creationTime: number;      // 촬영 시각 (epoch ms)
  width: number;
  height: number;
  location: GeoPoint | null; // GPS 없으면 null
  quality?: PhotoQuality;    // Step 2에서 채움
  semantic?: PhotoSemantic;  // Step 3에서 채움
}

// ─── 시간/장소로 묶인 '여행 스팟 그룹' (Step 1 산출물) ───
export interface SpotGroup {
  id: string;                // 그룹 고유 id
  photoIds: string[];        // 소속 사진 id 목록
  startTime: number;         // 그룹 내 가장 빠른 촬영 시각
  endTime: number;           // 그룹 내 가장 늦은 촬영 시각
  center: GeoPoint | null;   // GPS 보유 사진들의 평균 좌표 (없으면 null)
  bestCutIds?: string[];     // Step 3 최종 베스트컷 (1~3장)
}

// ─── 그룹화 옵션 ───
export interface GroupingOptions {
  /** 인접 사진 간 최대 시간 간격 (ms). 기본 30분 */
  timeGapMs?: number;
  /** GPS 인접 판정 반경 (m). 기본 200m */
  distanceThresholdM?: number;
  /** 한 그룹의 최소 사진 수 (이하 단독 컷은 제외 가능). 기본 1 */
  minGroupSize?: number;
}

// ─── 사진 스캔 옵션 ───
export interface ScanOptions {
  /** 가져올 최대 사진 수. 기본 200 */
  limit?: number;
  /** 이 시각 이후 촬영분만 (증분 스캔용, epoch ms) */
  createdAfter?: number;
  /** getAssetInfoAsync 호출 배치 크기 (OOM 방지). 기본 8 */
  batchSize?: number;
}

// ─── 권한/스캔 실패 사유 ───
export type PhotoAIErrorCode =
  | 'PERMISSION_DENIED'   // 갤러리 접근 거부
  | 'NO_ASSETS'           // 가져올 사진 없음
  | 'SCAN_FAILED';        // 그 외 예외

export interface PhotoAIResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: PhotoAIErrorCode;
  errorMessage?: string;
}
