import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { useMoments } from '../store/momentStore';
import { useTravelDna } from '../store/travelDnaStore';
import { clearPersistedStores } from '../store/persist';
import { setCardOrder } from '../store/cardOrderStore';
import { setAppStateBackupArmed } from '../components/AppStateSync';
import { isSupabaseConfigured } from '../services/supabase';
import { getMyUserId, getMyProfile, type ProfileRow } from '../services/profile';
import { fetchAppState } from '../services/appState';
import { unregisterPushToken } from '../services/pushToken';

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
    onboardedAt, setOnboardedAt,
    setHandle, setBio, setProfilePhoto, setHomeCountryCode,
    setHandleFont, resetSettings, applySettingsBackup,
  } = useSettings();
  const { records, resetRecords, hydrateMyRecords, rearmTripRestore, applyLocalStateBackup } = useRecords();
  const { resetConversations } = useDM();
  const { resetMoments, applyMomentsBackup } = useMoments();
  const { clear: clearTravelDna } = useTravelDna();

  const applyServerProfile = (p: ProfileRow) => {
    if (p.handle) setHandle(p.handle);
    if (p.bio) setBio(p.bio);
    // birthday/gender는 profiles 테이블·ProfileRow 타입에서 제거되어 더는 서버에서
    // 읽어올 수 없다(App Store 5.1.1(v) 대응, 생년월일/성별 수집 폐지).
    // 서버가 온보딩 완료를 알고 있으면 로컬 사본을 채운다 — 오프라인 판정이 이 값만 본다.
    if (p.onboarded_at) setOnboardedAt(Date.parse(p.onboarded_at) || Date.now());
    if (p.country) setHomeCountryCode(p.country);
    setProfilePhoto(p.profile_photo ?? null);
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
      // moments: id 기준 병합(로컬 우선) — photoUri 보존을 위해 덮어쓰기 대신 병합
      if (Array.isArray(b.moments)) applyMomentsBackup(b.moments);
    } catch {
      // 복원 실패해도 진행 (로컬 기본값 유지)
    }
  };

  return async () => {
    if (!isSupabaseConfigured) return;
    // 경계 처리 시작 — 복원이 끝나기 전의 로컬 상태(빈/이전 계정)가 서버 백업을
    // 덮어쓰지 못하게 백업을 잠근다. 처리 끝에서 다시 연다.
    setAppStateBackupArmed(false);
    // 예외로 중단돼도 백업을 다시 열어도 안전한 상태인지 — 같은 계정 재진입(로컬이 원본)이면 true.
    // 계정 전환/새 기기 복원 '도중' 실패는 잠금을 유지한다(부분 복원 상태가 서버 백업을 덮지 않게).
    // 과거엔 catch에서 아무것도 안 해 예외 한 번에 그 세션 내내 백업이 무음으로 중단됐다.
    let armSafeOnError = false;
    try {
      const uid = await getMyUserId();
      if (!uid) return;
      const last = await AsyncStorage.getItem(LAST_UID_KEY);
      armSafeOnError = !last || last === uid; // 전환이 아니면 로컬이 원본 — 실패해도 백업 재개 안전
      if (last && last !== uid) {
        // 계정 전환(다른 계정): 이전 계정 로컬 제거 후 새 계정 데이터를 서버에서 복원.
        // 푸시 토큰 삭제 — 세션이 살아있는 이 시점에 실행해야 RLS가 통과된다(클리어 후엔 권한 없음).
        await unregisterPushToken().catch(() => {});
        resetRecords();
        resetSettings();
        resetConversations();
        resetMoments();
        // travelDna는 인메모리 상태라 clearPersistedStores(디스크)만으로는 안 지워진다 —
        // Provider가 전환 중 언마운트되지 않아 이전 계정의 answers/label이 그대로 남는다.
        clearTravelDna();
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
        armSafeOnError = true; // 전환 복원 완료 — 이후 실패는 백업 재개 안전
      } else if (last !== uid) {
        // 새 기기/이 설치 최초 진입(last=null): 로컬을 지우지 않는다(이 사용자의 로컬 초안 보존).
        // 기존 사용자가 새 기기에서 로그인할 때 빈 로컬이 서버 프로필을 덮어쓰는 것을 막기 위해,
        // 이 기기에서 온보딩을 마치지 않았으면(=로컬 프로필이 비어 있으면) 서버에서 복원한다
        // (handle·기본정보 유실 방지). onboardedAt은 온보딩 완료 시각(0=미완료)이라 birthday와
        // 같은 "로컬 프로필이 채워졌는가" 판정을 대신할 수 있다.
        if (!onboardedAt) {
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
      // 경계 처리 실패해도 로그인/진입 자체는 계속 진행.
      // 같은 계정 재진입(또는 복원 완료 후) 실패라면 백업 잠금은 풀어 둔다 —
      // 안 풀면 이 세션의 설정·부가상태 변경이 서버에 전혀 백업되지 않는다.
      if (armSafeOnError) setAppStateBackupArmed(true);
    }
  };
}
