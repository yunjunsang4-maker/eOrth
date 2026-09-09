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
import type { ServerPostRef } from '../utils/mergeMyRecords';
import { mergeAuthorDisplay, type AuthorProfileRow } from '../utils/authorDisplay';

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

/** 발행 결과 — 서버 id와, 그 시점의 서버 `updated_at`(ms). */
export interface PublishResult {
  /** posts.id (서버 uuid) */
  id: string;
  /**
   * 서버 updated_at(ms). 호출부가 로컬 레코드의 `serverUpdatedAt`에 심는다.
   * 안 심으면 방금 내가 쓴 글이 매 동기화마다 "서버가 더 최신"으로 오판돼 본문을 다시 받는다.
   * 회수 경로(23505 재시도)나 구 서버 폴백에서는 없을 수 있다.
   */
  updatedAt?: number;
}

/** ISO 타임스탬프 → ms. 없거나 파싱 실패면 undefined (NaN을 밖으로 흘리지 않는다) */
const toMs = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
};

// 게시물 발행 → 생성된 서버 id(uuid)+updated_at 반환 (실패/미설정 시 null)
export async function publishPost(rec: TravelRecord, opts?: PublishMediaOptions): Promise<PublishResult | null> {
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
    // updated_at 도 함께 회수한다 — 호출부가 로컬 serverUpdatedAt 기준선을 심는다.
    let { data, error } = await supabase.from('posts').insert(row).select('id, updated_at').single();
    if (error?.code === '23505') {
      // 이미 발행된 기록의 재시도(이전 응답 유실 등) → 기존 게시물 id를 회수해 연결
      //
      // ⚠️ 여기에 `.is('deleted_at', null)`을 걸면 안 된다. tombstone된 행의 client_id도
      //    uq_posts_author_client에 그대로 잡혀 있어, 필터를 걸면 회수가 0건 → null →
      //    **발행이 영구 실패**한다(같은 client_id로는 insert도 회수도 불가능해진다).
      //    그렇다고 이 회수가 지운 글을 되살리지도 않는다 — insert가 거부됐으므로 서버의
      //    deleted_at은 그대로고, 로컬 기록은 remoteId만 붙는다. 그 다음 프로브에서
      //    classifyServerPosts가 표식을 보고 로컬에서 지운다. 즉 **부활시키지 않고
      //    로컬 tombstone 경로에 맡긴다**가 현재 동작이다.
      const { data: existing } = await supabase
        .from('posts')
        .select('id, updated_at')
        .eq('author_id', uid)
        .eq('client_id', rec.id)
        .maybeSingle();
      return existing?.id ? { id: existing.id as string, updatedAt: toMs(existing.updated_at) } : null;
    }
    if (error && /client_id/.test(`${error.message} ${error.details ?? ''}`)) {
      // 서버 스키마에 client_id 컬럼이 아직 없음(마이그레이션 전) → 키 없이 재시도(구 동작)
      ({ data, error } = await supabase
        .from('posts')
        .insert({ ...row, client_id: undefined })
        .select('id, updated_at')
        .single());
    }
    if (error || !data) return null;
    return { id: data.id as string, updatedAt: toMs(data.updated_at) };
  } catch {
    return null;
  }
}

/**
 * 게시물 수정.
 *
 * @returns 서버 `updated_at`(ms) — 호출부가 로컬 `serverUpdatedAt`에 심는다.
 *          `null`이면 **실패**(기존 `false`와 같은 자리 — 호출부의 진위 검사는 그대로 동작).
 *          `-1`은 "갱신은 성공했는데 타임스탬프를 못 읽었다" — 성공으로 다뤄야 하므로
 *          truthy 값이어야 하고, 기준선은 심지 않는다(로컬 시계로 심으면 시계가 앞선 기기에서
 *          그 사이 다른 기기가 한 수정을 영영 못 본다).
 *
 * 왜 updated_at을 돌려주는가: 안 심으면 내가 방금 고친 글이 다음 동기화마다
 * "서버가 더 최신"으로 잡혀 본문(data JSONB)을 통째로 다시 받는다(이그레스 낭비).
 */
export async function updatePost(remoteId: string, rec: TravelRecord, opts?: PublishMediaOptions): Promise<number | null> {
  if (!supabase || !remoteId) return null;
  // 업로드 실패는 throw로 전파 (publishPost와 동일 — 깨진 로컬 경로로 갱신 방지)
  const uploaded = await withUploadedMedia(rec, opts);
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({
        visibility: rec.visibility ?? 'neighbors',
        view_type: rec.viewType ?? 'feed',
        country_name: rec.countryName ?? null,
        data: uploaded,
      })
      .eq('id', remoteId)
      .select('updated_at')
      .maybeSingle();
    if (error) return null;
    return toMs(data?.updated_at) ?? -1;
  } catch {
    return null;
  }
}

// 게시물 삭제 — soft delete(삭제표식). 성공 여부 반환(호출부가 성공했을 때만 Storage 사진을 지우도록).
// 실패를 throw하지 않는 기존 계약은 유지한다(호출부의 .catch는 그대로 동작).
//
// 왜 행을 지우지 않는가: 행이 사라지면 다른 기기가 "지워졌다"와 "이번 조회가 부분 실패했다"를
// 구분할 수 없어 로컬 기록을 지워도 되는지 판정할 수 없다(supabase/schema.sql posts 섹션 참조).
// 표식을 남기면 그 기기가 다음 프로브에서 명시적 삭제를 보고 로컬에서도 지운다.
// ⚠️ 표식만 남은 행은 모든 읽기 경로가 `.is('deleted_at', null)`로 걸러낸다 — 하나라도 빠지면
//    지운 글이 남의 피드에 되살아난다.
export async function deletePost(remoteId: string): Promise<boolean> {
  if (!supabase || !remoteId) return false;
  try {
    const { error } = await supabase
      .from('posts')
      // ⚠️ 본문(data)도 함께 비운다. 표식만 남기면 삭제한 글의 전문·사진 URL이 purge를 걸기
      //    전까지 서버에 무기한 남는데, 앱은 "되돌릴 수 없이 삭제"라고 안내한다. 다른 기기는
      //    표식만 보고 지우므로 본문은 필요 없다. (Storage 파일 정리는 호출부가 로컬 기록에서
      //    수집한 URL로 따로 한다 — recordStore.deleteRecord 참조)
      .update({ deleted_at: new Date().toISOString(), data: {} })
      .eq('id', remoteId);
    if (!error) return true;
    // deleted_at 컬럼이 아직 없는 서버(마이그레이션 전) → 구 동작(hard delete)으로 폴백.
    // ⚠️ **오류 메시지에 deleted_at이 있을 때만** 폴백한다. 모든 오류를 삼키면 RLS 거부·권한
    //    오류까지 hard delete로 이어져, 고쳐야 할 문제가 조용히 가려진다.
    if (/deleted_at/.test(`${error.message} ${error.details ?? ''}`)) {
      const { error: hardErr } = await supabase.from('posts').delete().eq('id', remoteId);
      return !hardErr;
    }
    return false;
  } catch {
    return false; // 네트워크 실패 등 — 서버 게시물이 남아 있으므로 사진도 지우면 안 된다
  }
}

// posts 행 → TravelRecord 변환 (피드/프로필 공통)
function mapRowToRecord(row: any): TravelRecord {
  const rec = (row.data ?? {}) as TravelRecord;
  // ⚠️ `?? {}`로 뭉개지 않는다 — "임베드가 없다(차단·탈퇴)"와 "임베드는 있는데 값이 null이다
  //    (사진 삭제·프리미엄 해지)"를 구분해야 삭제가 전파된다. 판정 규칙은 mergeAuthorDisplay.
  const prof = (row.profiles ?? null) as AuthorProfileRow | null;
  return {
    ...rec,
    id: row.id,
    remoteId: row.id,
    authorId: row.author_id,
    isMyPost: false,
    liked: false, // 작성자가 직렬화한 liked 값이 뷰어에게 새어나오지 않게 기본 false — 호출부가 내 좋아요로 덧씌움
    // 이 사본이 맞춰진 서버 버전. **반드시 행(row)의 값으로 덮는다** — data(JSONB) 안에도
    // 발행 당시의 옛 serverUpdatedAt이 직렬화돼 있어서, 스프레드만 두면 그 낡은 값이 남아
    // 수정 전파 판정이 영구히 틀어진다.
    serverUpdatedAt: toMs(row.updated_at),
    likes: row.likes_count ?? rec.likes ?? 0,
    comments: row.comments_count ?? rec.comments ?? 0,
    timestamp: rec.timestamp ?? new Date(row.created_at).getTime(),
    // 작성자 표시 — 사진·폰트는 임베드가 있으면 서버 null을 그대로 '없음'으로 반영한다.
    // 예전엔 `prof.profile_photo || rec.user?.photo`로 폴백해, 사진을 지우거나 프리미엄을
    // 해지해도 글 data에 박제된 옛 스냅샷이 되살아나 남들 눈에는 그대로 남아 있었다.
    user: mergeAuthorDisplay(prof, rec.user),
  } as TravelRecord;
}

// 작성자 표시는 public_profiles 뷰로 임베드 — profiles 테이블은 본인 행만 select 가능(RLS)해
// 직접 임베드하면 타인 작성자 정보가 null이 된다. 별칭 'profiles'로 응답 키를 유지한다.
// ⚠️ FK 힌트(!posts_author_id_fkey) 필수 — 힌트 없이 뷰를 임베드하면 PostgREST가
//    관계 후보를 여러 개 찾아 PGRST201(모호) 오류를 낸다 (실서버 확인됨).
// updated_at 을 함께 받는다 — 받은 사본의 '서버 버전 기준선'(TravelRecord.serverUpdatedAt)이 된다.
// 숫자 컬럼 하나라 응답 크기 영향은 없다.
const POST_SELECT = 'id, author_id, data, likes_count, comments_count, created_at, updated_at, profiles:public_profiles!posts_author_id_fkey(handle, emoji, profile_photo, handle_font)';

// 삭제표식(tombstone) 제외 — 아래 읽기 경로 전부에 `.is('deleted_at', null)`이 붙어 있다:
//   fetchFeed / fetchFeedSnaps / fetchMyPosts / fetchPostsByIds / fetchPostById /
//   fetchPostStatsFor / fetchUserPosts
// ⚠️ 한 군데라도 빠지면 지운 글이 남의 피드·프로필·딥링크에 되살아난다.
//    유일한 예외는 fetchMyPostIds다 — 그쪽은 표식을 **봐야** 삭제를 전파할 수 있다.

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
      .is('deleted_at', null) // 삭제표식 제외
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
      .is('deleted_at', null) // 삭제표식 제외
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
// 다시 내려받아 로컬 초기화가 무효가 된다.
//
// 단건 삭제와 같은 **soft delete**다. 처음에는 "계정 글 전부 없애기라 표식을 남길 이유가 없다"고
// hard delete로 뒀는데, 삭제 전파가 생긴 뒤로는 그 판단이 뒤집힌다 — 표식이 없으면
// `classifyServerPosts`가 볼 것이 없어 **"되돌릴 수 없이 삭제"한 기록이 다른 기기에는 통째로
// 남는다.** 글 1건 삭제는 전파되는데 전체 초기화만 안 되는 정책 불일치이기도 하다.
// (기존 post_likes·comments는 FK cascade가 안 도므로 서버에 남지만, 글이 모든 읽기 경로에서
//  걸러지므로 노출되지 않는다. 완전 제거는 계정 삭제(delete-account Edge Function)의 몫이다.)
export async function deleteAllMyPosts(): Promise<boolean> {
  if (!supabase) return true; // 로컬 모드: 지울 서버 게시물 없음
  const uid = await getMyUserId();
  if (!uid) return true; // 비로그인: 서버 게시물 없음
  try {
    const { error } = await supabase
      .from('posts')
      // deletePost와 같은 이유로 본문도 비운다 — "데이터 초기화"는 되돌릴 수 없다고 안내한다.
      .update({ deleted_at: new Date().toISOString(), data: {} })
      .eq('author_id', uid)
      .is('deleted_at', null); // 이미 지운 글의 표식 시각을 덮어쓰지 않는다(purge 기준일이 밀린다)
    if (!error) return true;
    // deleted_at 컬럼이 없는 구 서버 → 구 동작(hard delete)으로 폴백. deletePost와 같은 규칙 —
    // **오류 메시지에 deleted_at이 있을 때만** 폴백한다(권한·RLS 오류를 가리지 않게).
    if (/deleted_at/.test(`${error.message} ${error.details ?? ''}`)) {
      const { error: hardErr } = await supabase.from('posts').delete().eq('author_id', uid);
      return !hardErr;
    }
    return false;
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
        .is('deleted_at', null) // 삭제표식 제외 — 다른 기기에서 지운 글을 복원하지 않는다
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

// ─── 내 글 id 프로브 + 부족분만 받기 (기기 간 동기화) ───
//
// 왜 전량(fetchMyPosts)이 아니라 두 단계인가:
//   POST_SELECT는 data(JSONB) 전체 — 블로그 본문·사진 URL·최대 100장 medias — 를 실어온다.
//   포그라운드 복귀마다 전량을 받으면 이그레스를 그대로 태운다. 정상 상태(빠진 글 없음)에서는
//   uuid 목록 한 번으로 끝나야 하고, 실제로 빠진 글이 있을 때만 그 id들의 본문을 받는다.
//
// ⚠️ 기기 시계 기반 워터마크(created_at > lastSyncAt)는 쓰지 않는다. 이 저장소에서 실제
//    사고가 있었다 — 기기 시계가 미래로 튀면 그 뒤에 쓴 글이 영영 유실된다. id 집합 비교는
//    시계에 의존하지 않는다.

/**
 * 내 글의 서버 id + client_id + updated_at + deleted_at 조회 —
 * 본문(data)을 받지 않아 응답이 uuid 몇 개 크기다.
 *
 * · `client_id` — 발행 orphan 대조용. `classifyServerPosts`(utils/mergeMyRecords.ts) 주석 참조.
 * · `updated_at` — 다른 기기에서 **수정**됐는지 판정. 로컬 `serverUpdatedAt`보다 크면 본문을 다시 받는다.
 * · `deleted_at` — 다른 기기에서 **삭제**됐는지 판정. 여기에만 삭제표식 필터를 걸지 않는다
 *   (표식을 봐야 로컬에서도 지울 수 있다).
 * 전부 스칼라 컬럼이라 응답 크기는 사실상 그대로다.
 *
 * ⚠️ 실패는 반드시 null 로 구분한다(빈 배열 아님 — fetchFeed와 같은 계약).
 *    빈 배열로 돌려주면 호출부가 "서버에 내 글이 하나도 없다"로 오해한다.
 */
export async function fetchMyPostIds(): Promise<ServerPostRef[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  // ── 구 서버(마이그레이션 전) 폴백 단계 ──
  // 없는 컬럼을 select하면 쿼리 자체가 실패해 **프로브가 영구히 null**(= 동기화 전면 사망)이 된다.
  // publishPost가 쓰는 폴백과 같은 방식으로, 오류가 지목한 컬럼만 떼어내고 다시 시도한다.
  //   1단계 탈락(deleted_at/updated_at 없음) → **삭제·수정 전파가 꺼진다**(글 추가만 동작, A안 수준).
  //   2단계 탈락(client_id 없음)            → 발행 orphan 방어까지 꺼진다.
  // 열화일 뿐 사고는 아니지만, "안 되는데요"의 1순위 원인이므로 여기서만 조용히 넘어간다.
  let columns = 'id, client_id, updated_at, deleted_at';
  const degrade = (msg: string): boolean => {
    if (columns.includes('deleted_at') && /deleted_at|updated_at/.test(msg)) {
      columns = 'id, client_id';
      return true;
    }
    if (columns.includes('client_id') && /client_id/.test(msg)) {
      columns = 'id';
      return true;
    }
    return false;
  };
  try {
    const PAGE = 200;
    const MAX_POSTS = 2000; // 안전 상한 — 비정상 응답으로 루프가 무한정 도는 것을 막는다
    const out: ServerPostRef[] = [];
    const seen = new Set<string>(); // created_at 동률로 페이지 경계가 겹칠 때의 중복 제거
    for (let from = 0; from < MAX_POSTS; from += PAGE) {
      // fetchMyPosts와 같은 페이징 규격 — 두 경로가 보는 '내 글'의 범위가 어긋나면
      // 프로브가 빠진 글을 계속 보고하거나(무한 요청) 영영 놓친다.
      const page = async () =>
        supabase!
          .from('posts')
          .select(columns)
          .eq('author_id', uid)
          // created_at 동률에서도 페이지 경계가 흔들리지 않게 id를 2차 정렬키로 둔다
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + PAGE - 1);
      let { data, error } = await page();
      // 컬럼이 없어서 실패한 것이면 한 단계씩 떼어내며 재시도한다(이후 페이지도 그 컬럼 집합으로).
      while (error && degrade(`${error.message} ${error.details ?? ''}`)) {
        ({ data, error } = await page());
      }
      if (error) {
        if (from === 0) return null; // 첫 페이지부터 실패 — 실패는 null
        break;                       // 중간 실패는 받은 것까지만(부분 목록)
      }
      if (!data || data.length === 0) break;
      for (const row of data as any[]) {
        const id = row?.id as string | undefined;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          clientId: (row?.client_id as string | null | undefined) ?? null,
          updatedAt: toMs(row?.updated_at) ?? null,
          deletedAt: toMs(row?.deleted_at) ?? null,
        });
      }
      if (data.length < PAGE) break; // 마지막 페이지
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 주어진 서버 id들의 게시물 본문을 받아 내 글(TravelRecord)로 변환한다 — fetchMyPostIds의 짝.
 *
 * 실패한 청크는 건너뛰고 받은 것만 반환한다(빈 배열도 정상 반환값). 호출부는 이 결과를
 * mergeMyRecords로 병합하므로 부분 결과가 로컬을 훼손하지 않고, 못 받은 것은 다음 동기화에서
 * 다시 '빠진 글'로 잡힌다.
 */
export async function fetchPostsByIds(ids: string[]): Promise<TravelRecord[]> {
  if (!supabase || ids.length === 0) return [];
  // ⚠️ author 검증은 쿼리에 넣는다(fetchMyPosts와 같은 방식). 결과에 무조건 isMyPost:true를
  //    붙이므로, 호출부가 실수로 남의 글 id를 넘기면 남의 글이 '내 글'로 로컬에 박히고
  //    되돌리기 어렵다(백업·재발행 경로까지 오염). 구조적으로 막는다.
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    // 200개 단위 청크 — 대량 id를 .in() 하나로 보내면 URL 길이 한도에 걸린다(fetchMyLikesFor와 동일 규격)
    const CHUNK = 200;
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', uid)
        .is('deleted_at', null) // 삭제표식 제외 — 지운 글의 본문을 다시 받아 되살리지 않는다
        .in('id', ids.slice(i, i + CHUNK));
      if (error || !data) continue; // 실패 청크는 건너뛴다 — 다음 동기화에서 다시 잡힌다
      rows.push(...(data as any[]));
    }
    const mine = rows.map((row) => ({ ...mapRowToRecord(row), isMyPost: true }));
    // 내 좋아요 상태 복원 — mapRowToRecord가 liked:false 기본이라 그냥 두면 재다운로드한 글의
    // 하트가 전부 꺼진 채 들어온다 (fetchMyPosts와 같은 처리).
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
      .is('deleted_at', null) // 삭제표식 제외 — 지운 글의 딥링크는 '없는 글'이어야 한다
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
        .is('deleted_at', null) // 삭제표식 제외
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
      .is('deleted_at', null) // 삭제표식 제외
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
