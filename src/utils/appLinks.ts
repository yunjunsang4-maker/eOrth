// 앱 내부 딥링크(eorth://) 공용 유틸 — 생성·파싱·화면 이동을 한곳에서 관리한다.
// 링크를 만드는 쪽(프로필/게시물 복사·공유)과 여는 쪽(AppNavigator 딥링크, DM 메시지
// 링크 탭)이 서로 다른 형식을 쓰면 "링크를 눌러도 아무 일도 없는" 문제가 재발하므로
// 반드시 이 모듈을 통해서만 만들고 파싱할 것.
import { getProfileByHandle } from '../services/profile';
import { fetchPostById } from '../services/posts';

// 생성 스킴은 반드시 소문자 eorth:// — 안드로이드 인텐트 필터는 스킴 대소문자를
// 구분하므로 eOrth:// 로 만든 링크는 외부 앱에서 탭해도 앱이 열리지 않는다.
export const profileLink = (handle: string) => `eorth://profile/${encodeURIComponent(handle)}`;
export const postLink = (id: string) => `eorth://post/${encodeURIComponent(id)}`;

// 파싱은 대소문자 무관 + 구형식 호환: eorth://user/<handle>(QR·구버전 공유),
// eOrth://profile/<handle>(구버전 복사 링크) 모두 받아준다.
const PROFILE_RE = /eorth:\/\/(?:profile|user)\/([^\s/?#]+)/i;
const POST_RE = /eorth:\/\/post\/([^\s/?#]+)/i;

// 메시지 본문에서 앱 링크 구간을 분리하기 위한 split용(캡처 그룹 필수)
export const APP_LINK_SPLIT_RE = /(eorth:\/\/(?:profile|user|post)\/\S+)/gi;

export type AppLink =
  | { type: 'profile'; handle: string }
  | { type: 'post'; id: string };

export function parseAppLink(url: string | null | undefined): AppLink | null {
  if (!url) return null;
  const s = url.trim();
  const post = POST_RE.exec(s);
  if (post) {
    const id = decodeURIComponent(post[1]).replace(/\/+$/, '');
    return id ? { type: 'post', id } : null;
  }
  const prof = PROFILE_RE.exec(s);
  if (prof) {
    const handle = decodeURIComponent(prof[1]).replace(/^@/, '').replace(/\/+$/, '');
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
