// settingsStore.hapticsEnabled(영속) → utils/haptics의 모듈 플래그를 동기화하는 브리지.
// SettingsProvider 안에서 렌더되어, 사용자가 스위치를 끄면 전 호출부가 즉시 조용해진다.
// (i18n/LanguageBridge와 같은 역할·같은 모양 — 스토어 값을 비-React 모듈에 흘려보낸다)
import { useEffect } from 'react';
import { useSettings } from '../store/settingsStore';
import { setHapticsEnabled } from '../utils/haptics';

export default function HapticsBridge() {
  const { hapticsEnabled } = useSettings();
  useEffect(() => {
    setHapticsEnabled(hapticsEnabled);
  }, [hapticsEnabled]);
  return null;
}
