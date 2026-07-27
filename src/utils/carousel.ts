// src/utils/carousel.ts
// 자동 슬라이드 다음 인덱스 (순환). 범위 밖 current는 0으로 방어.
export function nextIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}
