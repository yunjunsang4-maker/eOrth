/**
 * AppStateSync — 앱 로컬 상태 통합 백업 업로더 (user_app_state)
 *
 * 설정(비-PII)·기록 부가상태·카드 순서를 4초 디바운스로 서버에 백업한다(사용자당 1행).
 * 복원은 useAccountBoundary가 로그인 확정 시점에 수행하고, 복원이 끝난 뒤에만
 * setAppStateBackupArmed(true)로 백업을 연다 — 로그인 전/계정 전환 중의 빈 로컬 상태가
 * 서버 백업을 덮어쓰는 사고 방지(여행카드 유실 실사고의 교훈, 2026-07-10).
 */
import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useCardOrder } from '../store/cardOrderStore';
import { useMoments } from '../store/momentStore';
import { saveAppState } from '../services/appState';
import { isSupabaseConfigured } from '../services/supabase';

// 모듈 게이트 — useAccountBoundary가 로그인 확정 후 true, 처리 시작 시 false로 잠근다
let backupArmed = false;
export function setAppStateBackupArmed(v: boolean) {
  backupArmed = v;
}

export default function AppStateSync() {
  const { exportSettingsBackup } = useSettings();
  const { exportLocalStateBackup } = useRecords();
  const cardOrder = useCardOrder();
  const { exportMomentsBackup } = useMoments();

  const payload = {
    settings: exportSettingsBackup(),
    records: exportLocalStateBackup(),
    cardOrder,
    moments: exportMomentsBackup(), // 텍스트/메타 + photoUrl(사진 서버 백업), 로컬 photoUri 제외
  };
  const json = JSON.stringify(payload);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!backupArmed) return; // 복원 전 — 백업 잠금
    const timer = setTimeout(() => {
      if (!backupArmed) return; // 대기 중 계정 전환 등으로 재잠금된 경우 취소
      saveAppState(payloadRef.current);
    }, 4000);
    return () => clearTimeout(timer);
  }, [json]);

  return null;
}
