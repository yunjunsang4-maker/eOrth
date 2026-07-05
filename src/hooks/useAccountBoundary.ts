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
    birthday,
    setHandle, setBio, setBirthday, setGender, setProfilePhoto, setHomeCountryCode, resetSettings,
  } = useSettings();
  const { records, resetRecords, hydrateMyRecords } = useRecords();
  const { resetConversations } = useDM();

  const applyServerProfile = (p: ProfileRow) => {
    if (p.handle) setHandle(p.handle);
    if (p.bio) setBio(p.bio);
    if (p.birthday) setBirthday(p.birthday);
    if (p.gender === 'male' || p.gender === 'female') setGender(p.gender);
    if (p.country) setHomeCountryCode(p.country);
    setProfilePhoto(p.profile_photo ?? null);
  };

  return async () => {
    if (!isSupabaseConfigured) return;
    try {
      const uid = await getMyUserId();
      if (!uid) return;
      const last = await AsyncStorage.getItem(LAST_UID_KEY);
      if (last && last !== uid) {
        // 계정 전환(다른 계정): 이전 계정 로컬 제거 후 새 계정 데이터를 서버에서 복원.
        resetRecords();
        resetSettings();
        resetConversations();
        await clearPersistedStores().catch(() => {});
        // 프로필 먼저 복원 → ProfileSync가 빈값으로 서버를 덮어쓰지 않도록.
        try {
          const p = await getMyProfile();
          if (p) applyServerProfile(p);
        } catch {
          // 프로필 복원 실패해도 진행 (다음 편집 시 동기화됨)
        }
        await hydrateMyRecords();
      } else if (last !== uid) {
        // 새 기기/이 설치 최초 진입(last=null): 로컬을 지우지 않는다(이 사용자의 로컬 초안 보존).
        // 기존 사용자가 새 기기에서 로그인할 때 빈 로컬이 서버 프로필을 덮어쓰는 것을 막기 위해,
        // 로컬 프로필이 비어 있으면 서버에서 복원한다(handle·기본정보 유실 방지).
        if (!birthday || !birthday.trim()) {
          try {
            const p = await getMyProfile();
            if (p) applyServerProfile(p);
          } catch {
            // 복원 실패해도 진행
          }
        }
        // 로컬 기록이 비어 있을 때만(초안 손실 위험 없음) 서버에서 내 기록을 가져온다.
        if (records.length === 0) {
          await hydrateMyRecords();
        }
      }
      await AsyncStorage.setItem(LAST_UID_KEY, uid);
    } catch {
      // 경계 처리 실패해도 로그인/진입 자체는 계속 진행
    }
  };
}
