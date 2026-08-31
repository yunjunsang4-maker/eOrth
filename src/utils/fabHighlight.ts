/**
 * FAB 사진첩 강조 조건 — 순수 로직 (사진 AI 형식 추천 설계 §7)
 *
 * 귀국 직후가 사진첩을 만들 마음이 가장 큰 시점인데, 정작 그 경로(FAB → 사진첩)를
 * 모르는 사용자가 많다. 그래서 귀국 판정 후 일정 기간만 FAB 사진첩 버튼에 점 배지를 띄운다.
 *
 * 조건: 귀국 후 7일 이내 && 귀국 이후에 만든 사진첩이 없음.
 *
 * 입력을 전부 인자로 받는 순수 함수인 이유: 실제 값은 AsyncStorage(DETECTOR_KEYS.returnAt /
 * albumCreatedAt)와 Date.now()에서 오는데, 그대로 두면 검증할 수 없다. 읽기는 호출부
 * (RecordFab)에 두고 판정만 여기로 뽑았다.
 */

/** 강조 유지 기간 — 이 창을 넘기면 배지는 조용히 사라진다(영구 배지는 소음이 된다) */
export const FAB_HIGHLIGHT_WINDOW_MS = 7 * 24 * 3600_000;

export function shouldHighlightAlbum(
  returnAt: number | null,
  lastAlbumCreatedAt: number | null,
  now: number
): boolean {
  // 귀국 기록이 없거나 미래 시각이면 강조하지 않는다.
  // 미래 방어가 필요한 이유: 사용자가 기기 시계를 되돌리면 returnAt이 now보다 커지는데,
  // 그때 아래 뺄셈은 음수가 되어 '창 안'으로 통과해 배지가 영구히 남는다.
  if (returnAt === null || returnAt > now) return false;
  if (now - returnAt > FAB_HIGHLIGHT_WINDOW_MS) return false;
  // 귀국 '이후'에 만든 사진첩이 있으면 유도는 끝난 것. 귀국 전 앨범은 이번 여행과 무관하다.
  if (lastAlbumCreatedAt !== null && lastAlbumCreatedAt >= returnAt) return false;
  return true;
}
