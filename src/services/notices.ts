/**
 * 운영자 공지 가져오기 — 약관·방침처럼 GitHub Pages에 올린 정적 JSON을 읽는다.
 * 파싱·표시 판정은 utils/noticeFeed(순수 모듈)가 하고, 여기서는 네트워크만 담당한다.
 *
 * 실패하면 조용히 빈 목록을 준다. 공지를 못 불러왔다고 설정 화면이 깨지거나
 * 에러가 뜨면 안 된다 — 다음 실행에서 다시 시도하면 된다.
 */
import { parseNotices, type Notice } from '../utils/noticeFeed';

// 약관·방침과 같은 게시 위치(SettingsScreen의 TERMS_URL과 같은 Pages 사이트)
const NOTICES_URL = 'https://yunjunsang4-maker.github.io/eOrth/notices.json';

// 설정 화면 진입을 막지 않도록 짧게 끊는다
const TIMEOUT_MS = 6000;

export async function fetchNotices(lang: string): Promise<Notice[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // Pages는 CDN 캐시가 길어, 갓 올린 공지가 안 보이는 것을 막는다
      const res = await fetch(`${NOTICES_URL}?t=${Math.floor(Date.now() / 60000)}`, {
        signal: ctrl.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return [];
      return parseNotices(await res.json(), lang);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return []; // 오프라인·타임아웃·JSON 깨짐 — 다음 실행에서 재시도
  }
}
