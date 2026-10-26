import Constants from 'expo-constants';

// 표시·기록용 앱 버전 — app.json "version"(빌드·OTA 매니페스트에 실린 값)을 읽는다.
// 예전엔 설정 '앱 버전' 행·푸터·피드백 기록에 'v1.0.0'을 하드코딩해 실제 버전(1.1.x)과 어긋났다(2026-10-26).
export const APP_VERSION = `v${Constants.expoConfig?.version ?? '?'}`;
