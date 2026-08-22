/**
 * 미디어 업로드 서비스 (Supabase Storage 'media' 버킷)
 *
 * 로컬 file:// 사진을 업로드해 공개 URL로 바꾼다(메이트가 보려면 필수).
 * 이미 http(s) URL이거나 Supabase 미설정 시 입력 그대로 반환(무동작).
 * 경로 규칙: media/<uid>/<시간>-<랜덤>.<ext>  (RLS: 본인 폴더만 쓰기)
 *
 * ⚠ 이 파일의 uploadImage가 **앱 전체에서 Storage에 쓰는 유일한 지점**이다
 * (`storage.from(...).upload(` 는 src 전체에서 아래 한 줄뿐이며,
 *  scripts/media-exif-guard.verify.mjs가 그 사실을 정적으로 지킨다).
 * 그래서 위치 메타데이터 제거도 화면별이 아니라 여기서 한 번만 한다.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
import { fileExt, guessContentType, planMetadataStrip } from '../utils/mediaUploadPlan';
import { stripImageMetadata } from '../utils/imageCompress';

/** 단일 파일(이미지/영상) 업로드 → 공개 URL (실패/미설정/원격이면 원본 그대로) */
export async function uploadImage(uri: string): Promise<string> {
  if (!supabase || !uri) return uri;
  if (/^https?:\/\//.test(uri)) return uri; // 이미 원격
  const uid = await getMyUserId();
  if (!uid) return uri;
  try {
    // ── 위치 메타데이터 제거 (초크포인트) ──
    // media 버킷은 public이라 URL만 알면 비인증으로 원본을 내려받을 수 있다. 사진 파일 안의
    // EXIF GPS가 그대로 올라가면 촬영 위치가 사실상 공개된다. 판정 규칙은 utils/mediaUploadPlan.ts.
    let src = uri;
    const plan = planMetadataStrip(uri);
    if (plan.action === 'strip') {
      const cleaned = await stripImageMetadata(uri, plan.format);
      // 실패 시 원본을 올리면 그게 곧 위치 유출이다 → 업로드를 포기한다(fail-closed).
      // 원본 uri를 그대로 돌려주는 것은 이 함수의 기존 '업로드 실패' 신호와 같아서
      // 호출부가 이미 전부 처리하고 있다: posts.requireRemote는 throw로 발행 중단,
      // dmStore.mustUpload는 throw로 전송 실패, momentStore·ProfileSync는 건너뛰고 다음에 재시도.
      if (!cleaned) return uri;
      src = cleaned;
    }
    // Content-Type·확장자는 **재인코딩 결과** 기준으로 잡는다. HEIC는 저장 포맷이 없어
    // jpeg로 나가므로, 원본 uri로 잡으면 image/heic 라벨이 붙은 JPEG가 올라간다.
    const contentType = guessContentType(src);
    const ext = fileExt(src);
    // Expo 권장 패턴: file:// 를 fetch → ArrayBuffer 로 업로드
    const arraybuffer = await fetch(src).then((r) => r.arrayBuffer());
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

/**
 * 업로드된 공개 URL들의 Storage 원본 삭제 (본인 폴더만 — media_delete_own RLS).
 * media 버킷 공개 URL이 아닌 항목(로컬 file:// 등)은 무시. 실패는 조용히(고아로 남음).
 */
export async function removeMediaUrls(urls: string[]): Promise<void> {
  if (!supabase) return;
  const marker = '/storage/v1/object/public/media/';
  const paths = urls
    .filter((u) => typeof u === 'string' && u.includes(marker))
    .map((u) => decodeURIComponent(u.split(marker)[1].split('?')[0]));
  if (paths.length === 0) return;
  try {
    await supabase.storage.from('media').remove(paths);
  } catch {
    /* 무시 — 남은 파일은 탈퇴 sweep에서 정리 */
  }
}
