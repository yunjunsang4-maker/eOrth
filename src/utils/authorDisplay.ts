// 게시물 작성자 표시정보 병합 — 서버 profiles 임베드와 글 안에 직렬화된 스냅샷을 합친다.
//
// 왜 순수 함수로 뺐는가: 이 병합에 **삭제가 전파되지 않는 결함**이 있었다.
// mapRowToRecord가 `prof.profile_photo || rec.user?.photo`처럼 폴백해서, 작성자가 프로필
// 사진을 지우거나(서버 null) 프리미엄을 해지해 아이디 폰트가 풀려도(서버 null) **글 data에
// 발행 당시 박제된 옛 스냅샷이 되살아났다.** 남들 눈에는 지운 프로필 사진이 옛 글에 계속 붙어
// 있었고, 해지한 폰트도 그대로였다.
//
// 규칙:
//   · `public_profiles` 임베드가 **있으면** 그것이 진실이다. null은 "값이 없다"는 뜻이므로
//     그대로 없앤다(undefined). 스냅샷으로 되살리지 않는다.
//   · 임베드가 null/없을 때만(차단 관계·탈퇴로 뷰가 행을 안 주는 경우) 스냅샷으로 폴백한다.
//     이때는 서버가 "값이 없다"고 말한 게 아니라 "아무 말도 못 한 것"이라 옛 값이라도 보여준다.
//   · name/handle은 기존과 같이 서버 우선 + 폴백 유지 — 이름이 빈 카드는 글을 못 읽게 만든다.

/** `public_profiles` 뷰 임베드(POST_SELECT의 profiles 별칭) — 컬럼이 없으면 undefined일 수 있다 */
export interface AuthorProfileRow {
  handle?: string | null;
  emoji?: string | null;
  profile_photo?: string | null;
  handle_font?: string | null;
}

/** 글 data(JSONB)에 직렬화돼 있던 발행 당시 작성자 스냅샷 */
export interface AuthorSnapshot {
  name?: string;
  emoji?: string;
  handle?: string;
  photo?: string;
  font?: string;
}

export interface AuthorDisplay {
  name: string;
  emoji: string;
  handle: string;
  photo?: string;
  font?: string;
}

/** 빈 문자열은 "값 없음"으로 본다 — 서버가 ''를 주는 경우(옛 행)에 빈 아바타가 뜨지 않게 */
const orUndef = (v?: string | null): string | undefined => (v ? v : undefined);

export function mergeAuthorDisplay(
  prof: AuthorProfileRow | null | undefined,
  snapshot?: AuthorSnapshot | null
): AuthorDisplay {
  const snap = snapshot ?? {};
  // 임베드 유무 판정 — 뷰가 행을 못 주면 PostgREST가 null(또는 키 자체 없음)을 준다.
  const hasProfile = !!prof;
  return {
    name: orUndef(prof?.handle) || snap.name || '여행자',
    emoji: orUndef(prof?.emoji) || snap.emoji || '🧳',
    handle: orUndef(prof?.handle) || snap.handle || '',
    // ⚠️ 아래 둘만 폴백 규칙이 다르다 — 임베드가 있으면 서버 null을 그대로 '없음'으로 반영한다.
    photo: hasProfile ? orUndef(prof?.profile_photo) : orUndef(snap.photo),
    font: hasProfile ? orUndef(prof?.handle_font) : orUndef(snap.font),
  };
}
