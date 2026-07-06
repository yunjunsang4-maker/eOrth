export function timeAgo(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''; // NaN 방어 ("NaN초 전" 방지)
  const now = Date.now();
  // 서버 시각이 기기 시계보다 조금 앞설 수 있다(방금 단 댓글 등) — 음수는 0으로 클램프
  const diff = Math.max(0, Math.floor((now - timestamp) / 1000)); // 초 단위

  if (diff < 60) return `${diff}초 전`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}달 전`;

  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}
