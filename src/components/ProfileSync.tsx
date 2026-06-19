import { useEffect } from 'react';
import { useSettings } from '../store/settingsStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { isSupabaseConfigured } from '../services/supabase';
import { upsertMyProfile } from '../services/profile';
import { uploadImage } from '../services/media';

// 로그인(인증 진입) 후 로컬 프로필을 Supabase profiles 테이블로 동기화한다.
// 프로필 항목이 바뀔 때마다 upsert. 로컬 사진은 Storage에 올려 공개 URL로 저장.
// Supabase 미설정 시 아무 것도 하지 않음(로컬 유지).
export default function ProfileSync() {
  const entered = useIsAppEntered();
  const { nickname, handle, bio, birthday, gender, profilePhoto, setProfilePhoto } = useSettings();

  useEffect(() => {
    if (!entered || !isSupabaseConfigured) return;
    (async () => {
      // 로컬 file:// 사진은 업로드해 공개 URL로 바꾼다(한 번 올리면 http라 재업로드 안 함)
      let photoUrl: string | null = profilePhoto && /^https?:\/\//.test(profilePhoto) ? profilePhoto : null;
      if (profilePhoto && !photoUrl) {
        const uploaded = await uploadImage(profilePhoto);
        if (/^https?:\/\//.test(uploaded)) {
          photoUrl = uploaded;
          setProfilePhoto(uploaded); // 로컬도 원격 URL로 교체 → 다음 동기화 때 재업로드 방지
        }
      }
      upsertMyProfile({
        nickname: nickname || null,
        handle: handle || null,
        bio: bio || null,
        birthday: birthday || null,
        gender: gender || null,
        profile_photo: photoUrl,
      }).catch(() => {});
    })();
  }, [entered, nickname, handle, bio, birthday, gender, profilePhoto]);

  return null;
}
