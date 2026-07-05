import { useEffect } from 'react';
import { useSettings, genHandle } from '../store/settingsStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { isSupabaseConfigured } from '../services/supabase';
import { upsertMyProfile } from '../services/profile';
import { uploadImage } from '../services/media';
import { emitToast } from '../store/toastStore';
import i18n from '../i18n';

// 로그인(인증 진입) 후 로컬 프로필을 Supabase profiles 테이블로 동기화한다.
// 프로필 항목이 바뀔 때마다 upsert. 로컬 사진은 Storage에 올려 공개 URL로 저장.
// Supabase 미설정 시 아무 것도 하지 않음(로컬 유지).
export default function ProfileSync() {
  const entered = useIsAppEntered();
  const { handle, handleChosen, bio, birthday, gender, profilePhoto, homeCountryCode, accountPublic, handleFont, setProfilePhoto, setHandle } = useSettings();

  useEffect(() => {
    if (!entered || !isSupabaseConfigured) return;
    // 생일이 비어 있으면(온보딩 전 또는 새 기기에서 아직 서버 복원 전) 서버 프로필을 덮어쓰지 않는다.
    // → 기존 사용자의 서버 프로필(handle·기본정보)이 빈 값으로 초기화되는 것을 방지.
    if (!birthday || !birthday.trim()) return;
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
      const baseFields = {
        bio: bio || null,
        birthday: birthday || null,
        gender: gender || null,
        country: homeCountryCode || null,
        profile_photo: photoUrl,
        is_private: !accountPublic, // 계정 공개 설정(온보딩·계정설정 토글) → 서버 RLS가 비공개 잠금에 사용
        handle_font: handleFont, // 아이디 표시 폰트(프리미엄) — 타인 화면 렌더용
      };
      // handle을 undefined로 넘기면 upsert에서 제외 → 서버 handle을 건드리지 않고 나머지만 동기화.
      const doUpsert = (h: string | null | undefined) =>
        upsertMyProfile(h === undefined ? baseFields : { handle: h, ...baseFields });

      const res = await doUpsert(handle || null);
      if (res.handleConflict) {
        if (handleChosen) {
          // 사용자가 직접 고른 아이디의 충돌(가입 레이스 등) → 절대 임의 값으로 덮어쓰지 않는다.
          // 나머지 프로필은 handle 없이 동기화하고, 사용자에게 아이디 변경을 안내한다.
          await doUpsert(undefined);
          emitToast(i18n.t('editProfile.handleTakenSync'));
        } else {
          // 자동 생성 handle의 충돌(사용자가 고르지 않음) → 새 handle 재생성 후 1회 재시도.
          const fresh = genHandle();
          const retry = await doUpsert(fresh);
          if (retry.ok) setHandle(fresh);
        }
      }
    })();
  }, [entered, handle, handleChosen, bio, birthday, gender, profilePhoto, homeCountryCode, accountPublic, handleFont]);

  return null;
}
