/**
 * 미디어 업로드 서비스 (Supabase Storage 'media' 버킷)
 *
 * 로컬 file:// 사진을 업로드해 공개 URL로 바꾼다(친구가 보려면 필수).
 * 이미 http(s) URL이거나 Supabase 미설정 시 입력 그대로 반환(무동작).
 * 경로 규칙: media/<uid>/<시간>-<랜덤>.<ext>  (RLS: 본인 폴더만 쓰기)
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';

const fileExt = (uri: string): string => {
  const m = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] || 'jpg').toLowerCase();
};

const guessContentType = (uri: string): string => {
  switch (fileExt(uri)) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic':
    case 'heif': return 'image/heic';
    case 'gif': return 'image/gif';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'm4v': return 'video/x-m4v';
    case 'webm': return 'video/webm';
    default: return 'image/jpeg';
  }
};

/** 단일 파일(이미지/영상) 업로드 → 공개 URL (실패/미설정/원격이면 원본 그대로) */
export async function uploadImage(uri: string): Promise<string> {
  if (!supabase || !uri) return uri;
  if (/^https?:\/\//.test(uri)) return uri; // 이미 원격
  const uid = await getMyUserId();
  if (!uid) return uri;
  try {
    const contentType = guessContentType(uri);
    const ext = fileExt(uri);
    // Expo 권장 패턴: file:// 를 fetch → ArrayBuffer 로 업로드
    const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
    if (!arraybuffer || (arraybuffer as ArrayBuffer).byteLength === 0) return uri;
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, arraybuffer, {
      contentType,
      upsert: false,
    });
    if (error) return uri;
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data?.publicUrl || uri;
  } catch {
    return uri; // 네트워크/디코딩 실패 시 로컬 유지
  }
}

/** 여러 파일 중 첫 비어있지 않은 것만 업로드하는 단축 헬퍼 (옵셔널 필드용) */
export async function uploadMaybe(uri?: string): Promise<string | undefined> {
  if (!uri) return uri;
  return uploadImage(uri);
}

/** 여러 이미지 업로드 (순차) */
export async function uploadImages(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const u of uris) out.push(await uploadImage(u));
  return out;
}
