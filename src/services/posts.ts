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
import { compressImage } from '../utils/imageCompress';
import type { TravelRecord } from '../store/recordStore';

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
      if (copy.representativePhoto) copy.representativePhoto = await upAlbum(copy.representativePhoto);
    } finally {
      // 중간 실패해도 여기까지 올라간 장은 캐시로 보고 — 재시도가 이어서 진행되게 (100장 업로드 내성)
      if (Object.keys(uploadedNow).length > 0) opts?.onUploaded?.(uploadedNow);
    }
    // 로컬 전용 캐시는 서버 data에 싣지 않는다
    delete copy.uploadedMediaUrls;
    return copy;
  }
  if (copy.medias?.length) copy.medias = await ups(copy.medias);
  if (copy.representativePhoto) copy.representativePhoto = await up(copy.representativePhoto);
  if (copy.snapFrontUri) copy.snapFrontUri = await up(copy.snapFrontUri);
  if (copy.snapBackUri) copy.snapBackUri = await up(copy.snapBackUri);
  if (copy.cutPhoto) {
    copy.cutPhoto = {
      ...copy.cutPhoto,
      previewUri: await up(copy.cutPhoto.previewUri),
      photos: await ups(copy.cutPhoto.photos),
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
      visibility: rec.visibility ?? 'public',
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
        visibility: rec.visibility ?? 'public',
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

// 게시물 삭제
export async function deletePost(remoteId: string): Promise<void> {
  if (!supabase || !remoteId) return;
  try {
    await supabase.from('posts').delete().eq('id', remoteId);
  } catch {
    // 무시
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

// 피드: 남들의 공개/친구 글을 TravelRecord로 변환해 최신순 반환 (내 글 제외)
export async function fetchFeed(): Promise<TravelRecord[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  try {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      // 커서 페이지네이션 도입 전 임시 상한 — 네트워크 게시물이 이 수를 넘으면
      // 오래된 글이 피드에서 잘린다(베타 규모 기준). 초과 시 무한 스크롤 도입 필요.
      .limit(300);
    if (uid) query = query.neq('author_id', uid);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as any[]).map(mapRowToRecord);
  } catch {
    return [];
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
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', uid)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    const mine = (data as any[]).map((row) => ({ ...mapRowToRecord(row), isMyPost: true }));
    // 내 좋아요 상태 복원 (mapRowToRecord가 liked:false 기본이라 재다운로드 시 유실 방지)
    const { fetchMyLikedPostIds } = await import('./social');
    const likedSet = new Set(await fetchMyLikedPostIds());
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
    // 뷰어(나)의 좋아요 상태 덧씌움 — fetchUserPosts와 동일한 이유(하트 드리프트 방지)
    const { fetchMyLikedPostIds } = await import('./social');
    const likedSet = new Set(await fetchMyLikedPostIds());
    return rec.remoteId && likedSet.has(rec.remoteId) ? { ...rec, liked: true } : rec;
  } catch {
    return null;
  }
}

// 특정 사용자의 공개 글 (친구 프로필용)
export async function fetchUserPosts(userId: string): Promise<TravelRecord[]> {
  if (!supabase || !userId) return [];
  try {
    // visibility는 RLS(posts_select)가 판정 — public은 누구나, friends는 내가 작성자를
    // 팔로우 중일 때만 내려온다. 클라이언트에서 public만 걸면 팔로워 공개 글이
    // 프로필에서 안 보이는 버그가 생긴다 (private은 명시 제외).
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', userId)
      .in('visibility', ['public', 'friends'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    const list = (data as any[]).map(mapRowToRecord);
    // 뷰어(나)의 좋아요 상태 덧씌움 — 없으면 이미 좋아요한 글이 빈 하트로 보여 카운트 드리프트 유발
    const { fetchMyLikedPostIds } = await import('./social');
    const likedSet = new Set(await fetchMyLikedPostIds());
    return list.map((r) => (r.remoteId && likedSet.has(r.remoteId) ? { ...r, liked: true } : r));
  } catch {
    return [];
  }
}
