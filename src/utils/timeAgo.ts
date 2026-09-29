import i18n from 'i18next';

// 상대 시간 표기. 문구는 time.* 키(FriendsScreen·NotificationScreen과 같은 키) — 예전엔 한국어가
// 박혀 있어 모든 언어에서 "n시간 전"이 나왔다(2026-09-29 소셜 탭 점검 11번).
// ja·zh-Hant·es·fr 은 time.* 가 없어 fallbackLng(en)로 떨어진다 — 앱의 다른 시간 표기와 같다.
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestamp)) return ''; // NaN 방어 ("NaN초 전" 방지)
  // 서버 시각이 기기 시계보다 조금 앞설 수 있다(방금 단 댓글 등) — 음수는 0으로 클램프
  const diff = Math.max(0, Math.floor((now - timestamp) / 1000)); // 초 단위

  if (diff < 60) return i18n.t('time.justNow');
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return i18n.t('time.minAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('time.hourAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('time.dayAgo', { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return i18n.t('time.weekAgo', { n: weeks });
  const months = Math.floor(days / 30);
  if (months < 12) return i18n.t('time.monthAgo', { n: months });

  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}
