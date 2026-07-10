import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { setCardOrder } from '../store/cardOrderStore';
import { setAppStateBackupArmed } from '../components/AppStateSync';
import { isSupabaseConfigured } from '../services/supabase';
import { getMyUserId, getMyProfile, type ProfileRow } from '../services/profile';
import { fetchAppState } from '../services/appState';

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
    setHandle, setBio, setBirthday, setGender, setProfilePhoto, setHomeCountryCode,
    setAccountPublic, setHandleFont, resetSettings, applySettingsBackup,
  } = useSettings();
  const { records, resetRecords, hydrateMyRecords, rearmTripRestore, applyLocalStateBackup } = useRecords();
  const { resetConversations } = useDM();

  const applyServerProfile = (p: ProfileRow) => {
    if (p.handle) setHandle(p.handle);
    if (p.bio) setBio(p.bio);
    if (p.birthday) setBirthday(p.birthday);
    if (p.gender === 'male' || p.gender === 'female') setGender(p.gender);
    if (p.country) setHomeCountryCode(p.country);
    setProfilePhoto(p.profile_photo ?? null);
    // 계정 공개 여부 복원 — 빠뜨리면 리셋 기본값(공개)이 ProfileSync를 타고 is_private=false로
    // 서버에 밀려, 비공개 계정이 사용자 모르게 공개로 뒤집힌다.
    setAccountPublic(!(p.is_private ?? false));
    // 아이디 표시 폰트 복원(해지 정책 '잠금+값 보존'의 값 보존) — 재구독 시 그대로 살아난다
    setHandleFont(p.handle_font ?? null);
  };

  // 앱 상태 통합 백업(user_app_state) 복원 — 설정·기록 부가상태·카드 순서
  const restoreAppState = async () => {
    try {
      const b = await fetchAppState();
      if (!b) return;
      if (b.settings) applySettingsBackup(b.settings);
      if (b.records) applyLocalStateBackup(b.records);
      if (Array.isArray(b.cardOrder)) setCardOrder(b.cardOrder);
    } catch {
      // 복원 실패해도 진행 (로컬 기본값 유지)
    }
  };

  return async () => {
    if (!isSupabaseConfigured) return;
    // 경계 처리 시작 — 복원이 끝나기 전의 로컬 상태(빈/이전 계정)가 서버 백업을
    // 덮어쓰지 못하게 백업을 잠근다. 처리 끝에서 다시 연다.
    setAppStateBackupArmed(false);
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
        await restoreAppState(); // 새 계정의 설정·부가상태 복원 (리셋 직후라 로컬이 빈 상태)
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
          // 재설치/새 기기(로컬이 신선) — 설정·부가상태·카드 순서도 서버 백업에서 복원
          await restoreAppState();
        }
        // 로컬 기록이 비어 있을 때만(초안 손실 위험 없음) 서버에서 내 기록을 가져온다.
        if (records.length === 0) {
          await hydrateMyRecords();
        }
      }
      // 여행카드 서버 복원 재무장 — 스토어 마운트 시점(로그인 전)에 세션이 없어 복원이
      // 스킵됐을 수 있으므로, 로그인이 확정된 여기서 항상 재시도시킨다(로컬 카드가 있으면 no-op).
      rearmTripRestore();
      // 복원까지 끝났으니 앱 상태 백업을 연다 (로그인 확정 + 복원 완료 후에만)
      setAppStateBackupArmed(true);
      await AsyncStorage.setItem(LAST_UID_KEY, uid);
    } catch {
      // 경계 처리 실패해도 로그인/진입 자체는 계속 진행
    }
  };
}
