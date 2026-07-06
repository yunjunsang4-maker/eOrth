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
import type { TravelRecord } from '../store/recordStore';

// 레코드 안의 모든 로컬 이미지 URI를 업로드해 공개 URL로 치환한 사본 반환
async function withUploadedMedia(rec: TravelRecord): Promise<TravelRecord> {
  const copy: TravelRecord = { ...rec };
  if (copy.medias?.length) copy.medias = await uploadImages(copy.medias);
  if (copy.representativePhoto) copy.representativePhoto = await uploadImage(copy.representativePhoto);
  if (copy.snapFrontUri) copy.snapFrontUri = await uploadImage(copy.snapFrontUri);
  if (copy.snapBackUri) copy.snapBackUri = await uploadImage(copy.snapBackUri);
  if (copy.cutPhoto) {
    copy.cutPhoto = {
      ...copy.cutPhoto,
      previewUri: await uploadImage(copy.cutPhoto.previewUri),
      photos: await uploadImages(copy.cutPhoto.photos),
      // 프레임 배경 사진(프리미엄) — 타인 피드 라이브 렌더에도 보여야 하므로 업로드
      frameImage: copy.cutPhoto.frameImage ? await uploadImage(copy.cutPhoto.frameImage) : undefined,
    };
  }
  if (copy.perCountryData) {
    const pcd: NonNullable<TravelRecord['perCountryData']> = {};
    for (const [k, v] of Object.entries(copy.perCountryData)) {
      pcd[k] = { ...v };
      if (v.medias?.length) pcd[k].medias = await uploadImages(v.medias);
      if (v.representativePhoto) pcd[k].representativePhoto = await uploadImage(v.representativePhoto);
    }
    copy.perCountryData = pcd;
  }
  if (copy.blogBlocks?.length) {
    copy.blogBlocks = await Promise.all(
      copy.blogBlocks.map(async (b): Promise<typeof b> => {
        if (b.type === 'image' && b.uri) return { ...b, uri: await uploadImage(b.uri) };
        if (b.type === 'images' && b.items?.length) {
          const items = await Promise.all(b.items.map(async (it) => ({ ...it, uri: await uploadImage(it.uri) })));
          return { ...b, items };
        }
        if (b.type === 'video' && b.uri) {
          return { ...b, uri: await uploadImage(b.uri), thumbnail: b.thumbnail ? await uploadImage(b.thumbnail) : b.thumbnail };
        }
        return b;
      })
    );
  }
  return copy;
}

// 게시물 발행 → 생성된 서버 id(uuid) 반환 (실패/미설정 시 null)
export async function publishPost(rec: TravelRecord): Promise<string | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const uploaded = await withUploadedMedia(rec);
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: uid,
        visibility: rec.visibility ?? 'public',
        view_type: rec.viewType ?? 'feed',
        country_name: rec.countryName ?? null,
        data: uploaded,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

// 게시물 수정
export async function updatePost(remoteId: string, rec: TravelRecord): Promise<void> {
  if (!supabase || !remoteId) return;
  try {
    const uploaded = await withUploadedMedia(rec);
    await supabase
      .from('posts')
      .update({
        visibility: rec.visibility ?? 'public',
        view_type: rec.viewType ?? 'feed',
        country_name: rec.countryName ?? null,
        data: uploaded,
      })
      .eq('id', remoteId);
  } catch {
    // 무시
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
const POST_SELECT = 'id, author_id, data, likes_count, comments_count, created_at, profiles:public_profiles(handle, emoji, profile_photo, handle_font)';

// 피드: 남들의 공개/친구 글을 TravelRecord로 변환해 최신순 반환 (내 글 제외)
export async function fetchFeed(): Promise<TravelRecord[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  try {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .limit(100);
    if (uid) query = query.neq('author_id', uid);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as any[]).map(mapRowToRecord);
  } catch {
    return [];
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
    return (data as any[]).map((row) => ({ ...mapRowToRecord(row), isMyPost: true }));
  } catch {
    return [];
  }
}

// 특정 사용자의 공개 글 (친구 프로필용)
export async function fetchUserPosts(userId: string): Promise<TravelRecord[]> {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', userId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return (data as any[]).map(mapRowToRecord);
  } catch {
    return [];
  }
}
