// Expo 기본 설정에 지구본 지도 데이터 확장자(.geodata)만 에셋으로 추가한다.
// .json으로 두면 Metro가 소스로 취급해 JS 번들(OTA마다 통째로 내려감)에 들어가므로
// 전용 확장자로 에셋 처리 → GlobeView가 expo-asset + 파일 읽기로 필요할 때만 읽는다.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('geodata');

module.exports = config;
