import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { isSupabaseConfigured } from '../services/supabase';
import { getMyUserId, getMyProfile, type ProfileRow } from '../services/profile';

// 마지막으로 이 기기에서 로그인한 사용자 id (계정 전환 감지용).
// clearPersistedStores 대상 키(@eorth/records|settings|dm)가 아니라 별도 키라 초기화에도 유지된다.
const LAST_UID_KEY = '@eorth/lastUserId';

/**
 * 계정 경계 처리 훅 (로그인·Splash 공용).
 *
 * 다른 계정으로 로그인/세션 진입하면 이전 계정 로컬 데이터를 비우고,
 * 새 계정 데이터를 서버에서 로컬로 복원(pull)한다. 같은 계정 재진입은 로컬 보존(로컬-우선).
 * 인증 전(Login/Splash, entered=false) 시점에 호출해야 이 사이 ProfileSync/예약발행이
 * stale 데이터를 서버로 밀어올리지 않는다.
 */
export function useAccountBoundary(): () => Promise<void> {
  const {
    setNickname, setHandle, setBio, setBirthday, setGender, setProfilePhoto, resetSettings,
  } = useSettings();
  const { resetRecords, hydrateMyRecords } = useRecords();
  const { resetConversations } = useDM();

  const applyServerProfile = (p: ProfileRow) => {
    if (p.nickname) setNickname(p.nickname);
    if (p.handle) setHandle(p.handle);
    if (p.bio) setBio(p.bio);
    if (p.birthday) setBirthday(p.birthday);
    if (p.gender === 'male' || p.gender === 'female') setGender(p.gender);
    setProfilePhoto(p.profile_photo ?? null);
  };

  return async () => {
    if (!isSupabaseConfigured) return;
    try {
      const uid = await getMyUserId();
      if (!uid) return;
      const last = await AsyncStorage.getItem(LAST_UID_KEY);
      if (last && last !== uid) {
        // 이전 계정 로컬 제거 (오염·오발행·프로필 덮어쓰기 방지)
        resetRecords();
        resetSettings();
        resetConversations();
        await clearPersistedStores().catch(() => {});
        // 새 계정 데이터를 서버에서 복원 (프로필 먼저 → ProfileSync 빈값 덮어쓰기 방지)
        try {
          const p = await getMyProfile();
          if (p) applyServerProfile(p);
        } catch {
          // 프로필 복원 실패해도 진행 (다음 편집 시 동기화됨)
        }
        await hydrateMyRecords();
      }
      await AsyncStorage.setItem(LAST_UID_KEY, uid);
    } catch {
      // 경계 처리 실패해도 로그인/진입 자체는 계속 진행
    }
  };
}
