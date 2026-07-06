/**
 * SupabaseSecureStorage
 *
 * Supabase 세션(access·refresh 토큰)을 OS 보안 저장소(iOS Keychain / Android Keystore)에
 * 저장하기 위한 supabase-js storage 어댑터.
 * 기존에는 AsyncStorage 평문에 저장돼 루팅/탈옥·기기 백업 시 토큰이 노출될 수 있었다.
 *
 * 설계 요점:
 * - expo-secure-store는 네이티브 모듈이라 dev 빌드 재빌드 전에는 링크되지 않는다.
 *   ExpoSecureStore가 모듈 로드 시점에 requireNativeModule()을 호출하므로, 정적 import는
 *   재빌드 전 앱을 크래시시킨다. 따라서 lazy require + try/catch로 접근해, 네이티브가
 *   없으면 자동으로 AsyncStorage로 폴백한다(현재 빌드가 깨지지 않음).
 * - SecureStore 값은 항목당 2048바이트 제한이 있어, 세션 JSON을 바이트 기준으로 청크
 *   분할해 여러 키(`${key}.0`, `${key}.1` …)에 나눠 저장하고, 베이스 키에 청크 개수를 둔다.
 * - 재빌드 후 첫 읽기 시 기존 AsyncStorage 평문 세션을 SecureStore로 1회 이전하고 평문
 *   사본을 제거한다(사용자 재로그인 불필요).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store 모듈 핸들 캐시
//   undefined = 아직 시도 안 함, null = 사용 불가(폴백), object = 사용 가능
type SecureStoreModule = typeof import('expo-secure-store');
let secureStore: SecureStoreModule | null | undefined;

function getSecureStore(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  try {
    // 네이티브 미링크(재빌드 전)면 requireNativeModule()이 throw → 폴백
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-secure-store') as unknown as SecureStoreModule;
    secureStore = typeof mod.getItemAsync === 'function' ? mod : null;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

// 2048바이트 한계 아래로 안전 여유를 둔 청크 바이트 예산
const CHUNK_BYTE_BUDGET = 1800;

/** UTF-8 바이트 기준으로 문자열을 분할(서로게이트 쌍을 쪼개지 않음). */
function splitByBytes(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let bytes = 0;
    let i = start;
    while (i < value.length) {
      const code = value.charCodeAt(i);
      const isHighSurrogate = code >= 0xd800 && code < 0xdc00 && i + 1 < value.length;
      const charBytes = isHighSurrogate ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (bytes + charBytes > CHUNK_BYTE_BUDGET) break;
      bytes += charBytes;
      i += isHighSurrogate ? 2 : 1;
    }
    if (i === start) i = start + 1; // 안전장치: 최소 1코드유닛 진행
    chunks.push(value.slice(start, i));
    start = i;
  }
  return chunks.length > 0 ? chunks : [''];
}

// 각 청크는 `${key}.${index}`에 저장한다.
function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function readChunked(mod: SecureStoreModule, key: string): Promise<string | null> {
  const meta = await mod.getItemAsync(key);
  if (meta == null) return null;
  const count = parseInt(meta, 10);
  if (!Number.isInteger(count) || count < 0) return null;
  let result = '';
  for (let i = 0; i < count; i++) {
    const part = await mod.getItemAsync(chunkKey(key, i));
    if (part == null) return null; // 손상 → 없는 것으로 취급
    result += part;
  }
  return result;
}

async function writeChunked(mod: SecureStoreModule, key: string, value: string): Promise<void> {
  await removeChunked(mod, key); // 이전 청크 정리(개수가 줄어드는 경우 대비)
  const chunks = splitByBytes(value);
  for (let i = 0; i < chunks.length; i++) {
    await mod.setItemAsync(chunkKey(key, i), chunks[i]);
  }
  await mod.setItemAsync(key, String(chunks.length));
}

async function removeChunked(mod: SecureStoreModule, key: string): Promise<void> {
  const meta = await mod.getItemAsync(key);
  let count = 0;
  if (meta != null) {
    const parsed = parseInt(meta, 10);
    if (Number.isInteger(parsed) && parsed >= 0) count = parsed;
  }
  for (let i = 0; i < count; i++) {
    await mod.deleteItemAsync(chunkKey(key, i)).catch(() => {});
  }
  // 고아 청크 정리 — 이전 쓰기가 메타 기록 전에 중단됐으면 메타보다 큰 인덱스의
  // 청크가 남는다(메타 기준 삭제로는 영영 안 지워짐). 메타 이후 몇 칸을 추가로 지운다.
  for (let i = count; i < count + 4; i++) {
    await mod.deleteItemAsync(chunkKey(key, i)).catch(() => {});
  }
  await mod.deleteItemAsync(key).catch(() => {});
}

/**
 * 현재 세션 저장 백엔드(진단용).
 *   'secure'   = OS 보안 저장소(iOS Keychain / Android Keystore) 사용 중
 *   'fallback' = 네이티브 미링크(재빌드 전) → AsyncStorage 평문 폴백
 * 토큰 값은 절대 노출하지 않고 백엔드 종류만 반환한다.
 */
export function getStorageBackend(): 'secure' | 'fallback' {
  return getSecureStore() ? 'secure' : 'fallback';
}

/** supabase-js의 storage 인터페이스(getItem/setItem/removeItem) 구현. */
export const SupabaseSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const mod = getSecureStore();
    if (!mod) {
      // 재빌드 전: 기존 AsyncStorage 사용(동작 유지)
      return AsyncStorage.getItem(key);
    }
    const secure = await readChunked(mod, key);
    if (secure != null) return secure;
    // 마이그레이션: 과거 AsyncStorage 평문 세션을 SecureStore로 1회 이전
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      try {
        await writeChunked(mod, key, legacy);
        await AsyncStorage.removeItem(key); // 평문 사본 제거
      } catch {
        // 이전 실패 시에도 세션 자체는 반환해 로그인 상태를 유지
      }
      return legacy;
    }
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const mod = getSecureStore();
    if (!mod) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await writeChunked(mod, key, value);
    // 폴백 시기에 남았을 수 있는 평문 사본 제거
    await AsyncStorage.removeItem(key).catch(() => {});
  },

  async removeItem(key: string): Promise<void> {
    const mod = getSecureStore();
    if (mod) {
      await removeChunked(mod, key);
    }
    // 폴백 시기에 쌓였을 수 있는 평문 사본도 항상 제거
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
