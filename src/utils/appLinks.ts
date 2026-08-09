// 앱 내부 딥링크(eorth://) 공용 유틸 — 생성·파싱·화면 이동을 한곳에서 관리한다.
// 링크를 만드는 쪽(프로필/게시물 복사·공유)과 여는 쪽(AppNavigator 딥링크, DM 메시지
// 링크 탭)이 서로 다른 형식을 쓰면 "링크를 눌러도 아무 일도 없는" 문제가 재발하므로
// 반드시 이 모듈을 통해서만 만들고 파싱할 것.
import { getProfileByHandle } from '../services/profile';
import { fetchPostById } from '../services/posts';
import { APP_SCHEME } from './appVariant';

// 생성 스킴은 반드시 소문자 — 안드로이드 인텐트 필터는 스킴 대소문자를 구분한다.
// 변형(베타 eorthbeta://)은 자기 스킴으로 만들고 판다 — DB가 분리돼 정식과 상호작용이 없다.
export const profileLink = (handle: string) => `${APP_SCHEME}://profile/${encodeURIComponent(handle)}`;
export const postLink = (id: string) => `${APP_SCHEME}://post/${encodeURIComponent(id)}`;

// 파싱은 대소문자 무관 + 구형식 호환: <scheme>://user/<handle>(QR·구버전 공유) 포함.
const PROFILE_RE = new RegExp(`${APP_SCHEME}:\\/\\/(?:profile|user)\\/([^\\s/?#]+)`, 'i');
const POST_RE = new RegExp(`${APP_SCHEME}:\\/\\/post\\/([^\\s/?#]+)`, 'i');

// 메시지 본문에서 앱 링크 구간을 분리하기 위한 split용(캡처 그룹 필수)
export const APP_LINK_SPLIT_RE = new RegExp(`(${APP_SCHEME}:\\/\\/(?:profile|user|post)\\/\\S+)`, 'gi');

export type AppLink =
  | { type: 'profile'; handle: string }
  | { type: 'post'; id: string };

// decodeURIComponent는 잘못된 퍼센트 인코딩(예: eorth://post/100%)에서 URIError를 던진다.
// DM 메시지 렌더 도중 던지면 전역 에러 화면으로 튕겨 대화방에 영영 못 들어가므로,
// 디코드 실패는 예외가 아니라 "링크 아님(null)"으로 다룬다.
const safeDecode = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
};

export function parseAppLink(url: string | null | undefined): AppLink | null {
  if (!url) return null;
  const s = url.trim();
  const post = POST_RE.exec(s);
  if (post) {
    const decoded = safeDecode(post[1]);
    if (decoded === null) return null;
    const id = decoded.replace(/\/+$/, '');
    return id ? { type: 'post', id } : null;
  }
  const prof = PROFILE_RE.exec(s);
  if (prof) {
    const decoded = safeDecode(prof[1]);
    if (decoded === null) return null;
    const handle = decoded.replace(/^@/, '').replace(/\/+$/, '');
    if (!handle || handle === 'unknown') return null;
    return { type: 'profile', handle };
  }
  return null;
}

type NavigateFn = (name: string, params?: object) => void;

// 파싱된 링크를 실제 화면 이동으로 옮긴다.
// - 프로필: 핸들을 서버에서 조회해 해당 프로필 화면으로 직행,
//   조회 실패(미가입·로컬 모드·오프라인)면 메이트찾기 검색으로 폴백해 무반응을 막는다.
// - 게시물: 서버에서 글을 받아 폴백 record와 함께 상세 화면으로 이동
//   (스토어에 없는 글도 열리도록 — PostDetail의 record 폴백 경로 활용).
export async function openAppLink(link: AppLink, navigate: NavigateFn): Promise<void> {
  if (link.type === 'profile') {
    const p = await getProfileByHandle(link.handle).catch(() => null);
    if (p) {
      navigate('FriendProfile', { userId: p.id, username: p.handle || link.handle, handle: p.handle ?? undefined });
    } else {
      navigate('FriendSearch', { initialQuery: link.handle, ts: Date.now() });
    }
    return;
  }
  const rec = await fetchPostById(link.id).catch(() => null);
  navigate('PostDetail', rec ? { postId: rec.id, record: rec } : { postId: link.id });
}
