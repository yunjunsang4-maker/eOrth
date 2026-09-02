/**
 * 게시물 서비스 (Supabase posts 테이블)
 *
 * 로컬 recordStore가 진실의 원천(내 글)이고, 이 서비스가 백엔드로 발행/동기화한다.
 * 발행 시 로컬 사진을 Storage에 업로드해 공개 URL로 치환한 뒤 data(JSONB)에 저장.
 * 피드 조회는 '남의 글'만 가져온다(내 글은 로컬에 이미 있음).
 * Supabase 미설정 시 모두 무동작.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
import { uploadImage, uploadImages } from './media';
import { compressImage, THUMB_MAX_EDGE, THUMB_QUALITY } from '../utils/imageCompress';
import type { TravelRecord } from '../store/recordStore';
import type { ServerPostCounts } from '../utils/postCountSync';

// 사진첩 서버본 압축 규격 — 감상·재동기화용으로 충분한 화질. 원본(무압축) 백업은 프리미엄 혜택.
const ALBUM_EDGE = 2048;
const ALBUM_QUALITY = 0.85;

export interface PublishMediaOptions {
  /** 사진첩(medias·대표) 업로드 화질 — 'compressed'=장변 2048 압축본, 'original'=원본 그대로 */
  albumQuality?: 'compressed' | 'original';
  /** 로컬 uri → 업로드된 공개 URL 캐시 — 있으면 재업로드 생략 (수정 때 전 장 재업로드·고아 파일 방지) */
  uploadCache?: Record<string, string>;
  /** 이번 호출에서 새로 업로드된 로컬 uri → URL 매핑 (호출부가 캐시에 병합) */
  onUploaded?: (map: Record<string, string>) => void;
}

// 업로드 실패(uploadImage가 원본 로컬 URI를 그대로 반환) 감지 — 로컬 file:// 경로가
// 서버에 발행되면 다른 사용자 기기에서 그 사진이 영구히 깨져 보인다(재업로드 경로 없음).
// 실패는 throw로 전파해 발행 자체를 중단시킨다 (호출부 catch → 동기화 실패 토스트).
const requireRemote = (u: string): string => {
  if (/^https?:\/\//.test(u)) return u;
  throw new Error('media_upload_failed');
};
const up = async (u: string): Promise<string> => requireRemote(await uploadImage(u));
const ups = async (arr: string[]): Promise<string[]> => (await uploadImages(arr)).map(requireRemote);

// 레코드 안의 모든 로컬 이미지 URI를 업로드해 공개 URL로 치환한 사본 반환.
// 한 장이라도 업로드 실패하면 throw (부분 성공 상태로 발행하지 않음).
async function withUploadedMedia(rec: TravelRecord, opts?: PublishMediaOptions): Promise<TravelRecord> {
  const copy: TravelRecord = { ...rec };
  const isAlbum = rec.viewType === 'album';

  // ─── 목록용 축소본(썸네일) ───
  // 피드·스토리·여행카드 커버는 1600px 원본을 그대로 받아 쓰고 있었다. 카드 크기의 5배가 넘는
  // 픽셀을 매번 내려받는 셈이라 이그레스가 그대로 태워졌다. 여기서 '원본 URL → 축소본 URL' 맵을
  // 만들어 data에 실어 보내면, 목록 렌더러(utils/thumbUrl)가 축소본을 골라 쓴다.
  // 수정 발행이면 기존 맵을 이어받는다 — 이미 올린 사진의 축소본을 다시 만들 필요가 없다.
  const thumbs: Record<string, string> = { ...(rec.thumbs ?? {}) };
  // 업로드된 원본 URL에 대응하는 축소본을 만들어 올린다. 실패는 무시(원본으로 표시될 뿐).
  const addThumb = async (localUri: string, remoteUrl: string): Promise<string> => {
    if (thumbs[remoteUrl]) return remoteUrl;
    try {
      const small = await compressImage(localUri, THUMB_MAX_EDGE, THUMB_QUALITY);
      if (small === localUri) return remoteUrl; // 이미 충분히 작음 — 원본을 그대로 쓰는 게 이득
      const url = await uploadImage(small);
      if (/^https?:\/\//.test(url)) thumbs[remoteUrl] = url;
    } catch {
      /* 썸네일 생성/업로드 실패는 발행을 막지 않는다 */
    }
    return remoteUrl;
  };
  // 목록에 노출되는 사진 전용 업로드 — 원본 업로드 + 축소본 생성.
  // (이미 원격 URL이면 로컬 원본이 없어 축소본을 만들 수 없으므로 그대로 둔다)
  const upCover = async (u: string): Promise<string> => {
    if (/^https?:\/\//.test(u)) return u;
    return addThumb(u, await up(u));
  };
  // 사진첩 전용 업로드 — 캐시 재사용 + (압축 화질이면) 장변 축소 후 업로드
  const uploadedNow: Record<string, string> = {};
  const cache = opts?.uploadCache ?? {};
  const upAlbum = async (u: string): Promise<string> => {
    if (/^https?:\/\//.test(u)) return u;
    const hit = cache[u] ?? uploadedNow[u];
    if (hit) return hit;
    const src = opts?.albumQuality === 'compressed' ? await compressImage(u, ALBUM_EDGE, ALBUM_QUALITY) : u;
    const url = requireRemote(await uploadImage(src));
    uploadedNow[u] = url;
    return url;
  };
  if (isAlbum) {
    try {
      if (copy.medias?.length) {
        const out: string[] = [];
        for (const u of copy.medias) out.push(await upAlbum(u));
        copy.medias = out;
      }
      if (copy.representativePhoto) {
        const cover = copy.representativePhoto;
        copy.representativePhoto = await upAlbum(cover);
        // 앨범 커버는 프로필 여행카드 목록에 뜨므로 축소본을 만든다(본문 100장은 대상 아님)
        if (!/^https?:\/\//.test(cover)) await addThumb(cover, copy.representativePhoto);
      }
    } finally {
      // 중간 실패해도 여기까지 올라간 장은 캐시로 보고 — 재시도가 이어서 진행되게 (100장 업로드 내성)
      if (Object.keys(uploadedNow).length > 0) opts?.onUploaded?.(uploadedNow);
    }
    // 로컬 전용 캐시는 서버 data에 싣지 않는다
    delete copy.uploadedMediaUrls;
    if (Object.keys(thumbs).length > 0) copy.thumbs = thumbs;
    return copy;
  }
  // medias[0]는 피드 카드가 그리는 사진이라 축소본을 만든다. 나머지는 상세에서만 쓰여 원본만 올린다.
  if (copy.medias?.length) {
    const [first, ...rest] = copy.medias;
    copy.medias = [await upCover(first), ...(await ups(rest))];
  }
  if (copy.representativePhoto) copy.representativePhoto = await upCover(copy.representativePhoto);
  if (copy.snapFrontUri) copy.snapFrontUri = await upCover(copy.snapFrontUri);
  if (copy.snapBackUri) copy.snapBackUri = await upCover(copy.snapBackUri);
  if (copy.cutPhoto) {
    // 네컷은 피드에서 4장을 라이브 합성해 그린다 — 4장 모두 축소본이 필요하다
    const cutPhotos: string[] = [];
    for (const p of copy.cutPhoto.photos) cutPhotos.push(await upCover(p));
    copy.cutPhoto = {
      ...copy.cutPhoto,
      previewUri: await upCover(copy.cutPhoto.previewUri),
      photos: cutPhotos,
      // 프레임 배경 사진(프리미엄) — 타인 피드 라이브 렌더에도 보여야 하므로 업로드
      frameImage: copy.cutPhoto.frameImage ? await up(copy.cutPhoto.frameImage) : undefined,
    };
  }
  if (copy.perCountryData) {
    const pcd: NonNullable<TravelRecord['perCountryData']> = {};
    for (const [k, v] of Object.entries(copy.perCountryData)) {
      pcd[k] = { ...v };
      if (v.medias?.length) pcd[k].medias = await ups(v.medias);
      if (v.representativePhoto) pcd[k].representativePhoto = await up(v.representativePhoto);
    }
    copy.perCountryData = pcd;
  }
  if (copy.blogBlocks?.length) {
    copy.blogBlocks = await Promise.all(
      copy.blogBlocks.map(async (b): Promise<typeof b> => {
        if (b.type === 'image' && b.uri) return { ...b, uri: await up(b.uri) };
        if (b.type === 'images' && b.items?.length) {
          const items = await Promise.all(b.items.map(async (it) => ({ ...it, uri: await up(it.uri) })));
          return { ...b, items };
        }
        if (b.type === 'video' && b.uri) {
          return { ...b, uri: await up(b.uri), thumbnail: b.thumbnail ? await up(b.thumbnail) : b.thumbnail };
        }
        return b;
      })
    );
  }
  if (Object.keys(thumbs).length > 0) copy.thumbs = thumbs;
  return copy;
}

// 게시물 발행 → 생성된 서버 id(uuid) 반환 (실패/미설정 시 null)
export async function publishPost(rec: TravelRecord, opts?: PublishMediaOptions): Promise<string | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  // 업로드 실패는 try 밖에서 throw로 전파 — 호출부(publishToBackend)의 catch가
  // 사용자에게 동기화 실패를 알린다. (깨진 로컬 경로로 발행하는 것보다 발행 중단이 옳다)
  const uploaded = await withUploadedMedia(rec, opts);
  try {
    const row = {
      author_id: uid,
      visibility: rec.visibility ?? 'neighbors',
      view_type: rec.viewType ?? 'feed',
      country_name: rec.countryName ?? null,
      data: uploaded,
      // 멱등성 키 — 오프라인 재동기화·응답 유실 재시도가 중복 게시물을 만들지 않게
      client_id: rec.id,
    };
    let { data, error } = await supabase.from('posts').insert(row).select('id').single();
    if (error?.code === '23505') {
      // 이미 발행된 기록의 재시도(이전 응답 유실 등) → 기존 게시물 id를 회수해 연결
      const { data: existing } = await supabase
        .from('posts')
        .select('id')
        .eq('author_id', uid)
        .eq('client_id', rec.id)
        .maybeSingle();
      return (existing?.id as string) ?? null;
    }
    if (error && /client_id/.test(`${error.message} ${error.details ?? ''}`)) {
      // 서버 스키마에 client_id 컬럼이 아직 없음(마이그레이션 전) → 키 없이 재시도(구 동작)
      ({ data, error } = await supabase
        .from('posts')
        .insert({ ...row, client_id: undefined })
        .select('id')
        .single());
    }
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

// 게시물 수정 — 성공 여부 반환 (원본 재백업 스윕 등에서 사용)
export async function updatePost(remoteId: string, rec: TravelRecord, opts?: PublishMediaOptions): Promise<boolean> {
  if (!supabase || !remoteId) return false;
  // 업로드 실패는 throw로 전파 (publishPost와 동일 — 깨진 로컬 경로로 갱신 방지)
  const uploaded = await withUploadedMedia(rec, opts);
  try {
    const { error } = await supabase
      .from('posts')
      .update({
        visibility: rec.visibility ?? 'neighbors',
        view_type: rec.viewType ?? 'feed',
        country_name: rec.countryName ?? null,
        data: uploaded,
      })
      .eq('id', remoteId);
    return !error;
  } catch {
    return false;
  }
}

// 게시물 삭제 — 성공 여부 반환(호출부가 성공했을 때만 Storage 사진을 지우도록).
// 실패를 throw하지 않는 기존 계약은 유지한다(호출부의 .catch는 그대로 동작).
export async function deletePost(remoteId: string): Promise<boolean> {
  if (!supabase || !remoteId) return false;
  try {
    const { error } = await supabase.from('posts').delete().eq('id', remoteId);
    return !error;
  } catch {
    return false; // 네트워크 실패 등 — 서버 게시물이 남아 있으므로 사진도 지우면 안 된다
  }
}

// posts 행 → TravelRecord 변환 (피드/프로필 공통)
function mapRowToRecord(row: any): TravelRecord {
  const rec = (row.data ?? {}) as TravelRecord;
  const prof = row.profiles ?? {};
  return {
    ...rec,
    id: row.id,
    remoteId: row.id,
    authorId: row.author_id,
    isMyPost: false,
    liked: false, // 작성자가 직렬화한 liked 값이 뷰어에게 새어나오지 않게 기본 false — 호출부가 내 좋아요로 덧씌움
    likes: row.likes_count ?? rec.likes ?? 0,
    comments: row.comments_count ?? rec.comments ?? 0,
    timestamp: rec.timestamp ?? new Date(row.created_at).getTime(),
    user: {
      name: prof.handle || rec.user?.name || '여행자',
      emoji: prof.emoji || rec.user?.emoji || '🧳',
      handle: prof.handle || rec.user?.handle || '',
      photo: prof.profile_photo || rec.user?.photo || undefined,
      font: prof.handle_font || rec.user?.font || undefined, // 아이디 표시 폰트(프리미엄) — 프로필이 최신
    },
  } as TravelRecord;
}

// 작성자 표시는 public_profiles 뷰로 임베드 — profiles 테이블은 본인 행만 select 가능(RLS)해
// 직접 임베드하면 타인 작성자 정보가 null이 된다. 별칭 'profiles'로 응답 키를 유지한다.
// ⚠️ FK 힌트(!posts_author_id_fkey) 필수 — 힌트 없이 뷰를 임베드하면 PostgREST가
//    관계 후보를 여러 개 찾아 PGRST201(모호) 오류를 낸다 (실서버 확인됨).
const POST_SELECT = 'id, author_id, data, likes_count, comments_count, created_at, profiles:public_profiles!posts_author_id_fkey(handle, emoji, profile_photo, handle_font)';

// ─── 피드 조회 (커서 페이지네이션) ───
//
// 예전에는 limit(300) 단발 조회였다. 그 설계의 문제 두 가지를 여기서 없앤다.
//   ① 이웃이 늘면 300번째 밖의 글이 피드에서 영영 사라졌다(더 받을 방법이 없었음).
//   ② 새로고침 한 번에 300건의 data(JSONB 전체 — 블로그 본문·사진 URL·perCountryData)를
//      내려받아 이그레스와 DB CPU를 그대로 태웠다.
// 이제 FEED_PAGE_SIZE 단위로 끊어 받고, 화면 하단에서 다음 페이지를 이어 받는다.
export const FEED_PAGE_SIZE = 20;

/** 다음 페이지 시작점 — 마지막으로 받은 행의 created_at (ISO 문자열) */
export type FeedCursor = string;

export interface FeedPage {
  posts: TravelRecord[];
  /** 다음 호출에 넘길 커서. null이면 더 없음 */
  nextCursor: FeedCursor | null;
  hasMore: boolean;
}

// 피드 스트림에서 제외할 뷰 타입:
//   · album — 사진첩은 게시물이 아니라 앨범이라 클라이언트가 어차피 버린다(SocialScreen allVisible).
//             그런데 medias가 최대 100장이라 '버릴 것'을 받느라 피드 응답이 가장 크게 부풀었다.
//   · snap  — 스토리 라인 전용. 타임라인 페이지에 섞이면 페이지 경계에 따라 스토리가 들쭉날쭉해져
//             fetchFeedSnaps로 분리해 받는다.
// ⚠️ view_type 은 nullable(옛 행)이라 neq/not-in 만 쓰면 NULL 행이 통째로 빠진다(NULL 비교 → NULL).
//    is.null 을 명시적으로 OR 해서 옛 글이 피드에서 사라지지 않게 한다.
const TIMELINE_VIEW_TYPES = 'view_type.is.null,and(view_type.neq.album,view_type.neq.snap)';

/**
 * 피드 한 페이지 — 남들의 메이트 공개 글을 최신순으로 (내 글 제외).
 *
 * ⚠️ 실패는 반드시 null 로 구분한다(빈 배열 아님). 예전엔 오류도 [] 로 돌려줘서
 *    호출부가 "글이 하나도 없다"와 구분하지 못했고, 그 결과 ①네트워크 오류인데
 *    "아직 기록이 없어요 + 첫 기록 남기기" 안내가 뜨고 ②빈 배열이 피드 캐시를
 *    덮어써 오프라인 재시작 시 마지막 피드까지 사라졌다.
 */
export async function fetchFeed(cursor?: FeedCursor | null, limit = FEED_PAGE_SIZE): Promise<FeedPage | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  try {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .or(TIMELINE_VIEW_TYPES)
      .order('created_at', { ascending: false })
      // created_at 동률에서도 페이지 순서가 흔들리지 않게 id를 2차 정렬키로 둔다
      .order('id', { ascending: false })
      .limit(limit);
    if (uid) query = query.neq('author_id', uid);
    // lt가 아니라 lte + 호출부 중복 제거 — 같은 created_at 이 페이지 경계에 걸렸을 때
    // lt는 그 행들을 통째로 건너뛰지만(글 유실), lte는 최악이라도 중복 1건이라 안전하다.
    if (cursor) query = query.lte('created_at', cursor);
    const { data, error } = await query;
    if (error || !data) return null;
    const rows = data as any[];
    const last = rows.length > 0 ? (rows[rows.length - 1].created_at as string) : null;
    // 커서가 앞으로 나아가지 못하면(한 페이지가 전부 같은 created_at) 무한 루프가 되므로 중단한다.
    const advanced = !!last && last !== cursor;
    return {
      posts: rows.map(mapRowToRecord),
      nextCursor: advanced ? last : null,
      hasMore: rows.length === limit && advanced,
    };
  } catch {
    return null;
  }
}

/**
 * 스냅(스토리 라인) 전용 조회 — 타임라인 페이지와 무관하게 최신 스냅을 한 번에 받는다.
 * 스냅은 사진 2장짜리 가벼운 기록이라 이 수량을 받아도 응답이 작다.
 * 실패 시 null (피드와 동일 계약 — 호출부가 기존 스냅을 지우지 않게).
 */
export async function fetchFeedSnaps(limit = 50): Promise<TravelRecord[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  try {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('view_type', 'snap')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (uid) query = query.neq('author_id', uid);
    const { data, error } = await query;
    if (error || !data) return null;
    return (data as any[]).map(mapRowToRecord);
  } catch {
    return null;
  }
}

// 내 게시물 전체 삭제 — 설정 > 데이터 초기화용. 성공 여부 반환(실패 시 호출부가 초기화를 중단).
// 서버를 안 지우면 타인 피드에 글이 계속 노출되고, 다음 복원(hydrateMyPosts)이 서버 사본을
// 다시 내려받아 로컬 초기화가 무효가 된다. (post_likes·comments는 FK cascade로 함께 정리)
export async function deleteAllMyPosts(): Promise<boolean> {
  if (!supabase) return true; // 로컬 모드: 지울 서버 게시물 없음
  const uid = await getMyUserId();
  if (!uid) return true; // 비로그인: 서버 게시물 없음
  try {
    const { error } = await supabase.from('posts').delete().eq('author_id', uid);
    return !error;
  } catch {
    return false;
  }
}

// 내 글 전체(공개·비공개 포함) — 계정 전환 시 로컬 복원(pull)용. isMyPost=true로 표시.
export async function fetchMyPosts(): Promise<TravelRecord[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    // ⚠️ 단발 limit(200)이면 호출부(hydrateMyRecords)가 로컬 records를 통째 교체하면서
    //    201번째부터의 오래된 기록이 복원되지 않고 사라진다 → range로 전량 조회한다.
    const PAGE = 200;
    const MAX_POSTS = 2000; // 안전 상한 — 비정상 응답으로 루프가 무한정 도는 것을 막는다
    const rows: any[] = [];
    const seen = new Set<string>(); // created_at 동률로 페이지 경계가 겹칠 때의 중복 제거
    for (let from = 0; from < MAX_POSTS; from += PAGE) {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', uid)
        // created_at 동률에서도 페이지 경계가 흔들리지 않게 id를 2차 정렬키로 둔다
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        if (from === 0) return []; // 첫 페이지부터 실패 — 기존 계약대로 빈 배열
        break;                     // 중간 실패는 받은 데이터(최신순)까지만 — 기존 limit(200) 수준으로 열화
      }
      if (!data || data.length === 0) break;
      for (const row of data as any[]) {
        if (row?.id && seen.has(row.id)) continue;
        if (row?.id) seen.add(row.id);
        rows.push(row);
      }
      if (data.length < PAGE) break; // 마지막 페이지
    }
    const mine = rows.map((row) => ({ ...mapRowToRecord(row), isMyPost: true }));
    // 내 좋아요 상태 복원 (mapRowToRecord가 liked:false 기본이라 재다운로드 시 유실 방지)
    // 전량 조회(fetchMyLikedPostIds)는 PostgREST 1000행 상한에서 오래된 좋아요가 조용히
    // 빠진다 — 이 목록의 id들만 조회하는 페이지 방식(fetchMyLikesFor)으로 상한과 무관하게.
    const { fetchMyLikesFor } = await import('./social');
    const likedSet = await fetchMyLikesFor(mine.map((r) => r.remoteId).filter(Boolean) as string[]);
    return mine.map((r) => (r.remoteId && likedSet.has(r.remoteId) ? { ...r, liked: true } : r));
  } catch {
    return [];
  }
}

// 단일 게시물 조회 — 딥링크(eorth://post/<id>)·DM 링크로 진입 시 스토어에 없는 글의 폴백용.
// id가 서버 uuid가 아니면(발신자 로컬 id 등) 조회가 실패하며 null을 반환한다.
export async function fetchPostById(postId: string): Promise<TravelRecord | null> {
  if (!supabase || !postId) return null;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .maybeSingle();
    if (error || !data) return null;
    const rec = mapRowToRecord(data);
    // 뷰어(나)의 좋아요 상태 덧씌움 — fetchUserPosts와 동일한 이유(하트 드리프트 방지).
    // 단건이므로 전량 조회 대신 이 id만 조회(1000행 상한 무관).
    const { fetchMyLikesFor } = await import('./social');
    const likedSet = rec.remoteId ? await fetchMyLikesFor([rec.remoteId]) : new Set<string>();
    return rec.remoteId && likedSet.has(rec.remoteId) ? { ...rec, liked: true } : rec;
  } catch {
    return null;
  }
}

/**
 * 주어진 게시물들의 서버 카운터만 조회 — remoteId → { likes, comments }.
 *
 * 내 글의 카운터는 남이 좋아요·댓글을 남기면 서버(posts.likes_count/comments_count)에만
 * 쌓이고 앱으로 돌아오지 않았다(fetchFeed는 내 글을 제외하고, hydrateMyRecords는 계정 전환
 * 때만 돈다). 이 함수가 그 경로다 — data(JSONB 본문·사진)를 빼고 숫자 컬럼만 받아
 * 이그레스가 거의 없다.
 *
 * ⚠️ 이름이 비슷한 `post_counts` RPC(services/social.ts)와는 다른 것이다.
 *    그쪽은 '사용자별 글 개수', 이쪽은 '게시물별 반응 수'다.
 *
 * ⚠️ 실패는 반드시 null 로 구분한다(빈 Map 아님). 빈 Map을 돌려주면 호출부가
 *    "서버에 좋아요·댓글이 0개"로 오해할 여지가 생긴다.
 */
export async function fetchPostStatsFor(postIds: string[]): Promise<Map<string, ServerPostCounts> | null> {
  if (!supabase || postIds.length === 0) return new Map();
  try {
    // 200개 단위 청크 — 대량 id를 .in() 하나로 보내면 URL 길이 한도에 걸린다(fetchMyLikesFor와 동일).
    const CHUNK = 200;
    const out = new Map<string, ServerPostCounts>();
    for (let i = 0; i < postIds.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('posts')
        .select('id, likes_count, comments_count')
        .in('id', postIds.slice(i, i + CHUNK));
      if (error) {
        // 첫 청크부터 실패 = 조회 자체 실패 → null(로컬 유지). 중간 실패는 받은 만큼만 반영한다
        // (부분 Map은 호출부가 '없는 id는 건드리지 않는' 규칙으로 안전하게 처리한다).
        if (out.size === 0) return null;
        break;
      }
      for (const r of (data ?? []) as any[]) {
        if (typeof r?.id !== 'string') continue;
        out.set(r.id, {
          // 옛 행·이상 응답이면 undefined로 둔다 — 병합 쪽이 그 축의 로컬 값을 지킨다
          likes: typeof r.likes_count === 'number' ? r.likes_count : undefined,
          comments: typeof r.comments_count === 'number' ? r.comments_count : undefined,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

// 특정 사용자의 공개 글 (메이트 프로필용)
export async function fetchUserPosts(userId: string): Promise<TravelRecord[]> {
  if (!supabase || !userId) return [];
  try {
    // 메이트 공개(neighbors) 글만 — 실제 접근 판정은 RLS(are_neighbors)가 하고, private은 제외.
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', userId)
      .eq('visibility', 'neighbors')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    const list = (data as any[]).map(mapRowToRecord);
    // 뷰어(나)의 좋아요 상태 덧씌움 — 없으면 이미 좋아요한 글이 빈 하트로 보여 카운트 드리프트 유발.
    // 이 목록의 id들만 조회(fetchMyLikesFor) — 전량 조회의 1000행 상한 하트 유실 방지.
    const { fetchMyLikesFor } = await import('./social');
    const likedSet = await fetchMyLikesFor(list.map((r) => r.remoteId).filter(Boolean) as string[]);
    return list.map((r) => (r.remoteId && likedSet.has(r.remoteId) ? { ...r, liked: true } : r));
  } catch {
    return [];
  }
}
