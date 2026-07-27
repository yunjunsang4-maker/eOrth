// 초대 귀속 보관함 — 미인증(로그인/온보딩 전) 상태에서 받은 초대 딥링크(eorth://user|profile/<handle>)의
// 핸들을 보관했다가, 온보딩 완료 후 첫 메인 진입에서 메이트 연결 넛지로 소비한다.
// 원샷(consume이 읽고 즉시 삭제)·7일 만료. 저장/소비 외 다른 경로로 읽지 말 것.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'eorth-pending-invite';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export async function savePendingInvite(handle: string): Promise<void> {
  if (!handle) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ handle, ts: Date.now() }));
  } catch {
    // 보관 실패는 조용히 무시 — 초대 귀속은 부가 기능
  }
}

// 읽고 즉시 삭제(원샷). 없거나 손상·만료(7일)면 null.
export async function consumePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { handle?: string; ts?: number };
    if (!v?.handle || typeof v.ts !== 'number') return null;
    if (Date.now() - v.ts > MAX_AGE_MS) return null;
    return v.handle;
  } catch {
    return null;
  }
}
