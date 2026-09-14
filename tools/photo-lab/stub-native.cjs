// 앱 파일이 import하는 expo·react-native 모듈의 자리 채움. 어떤 속성을 읽어도 noop.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
module.exports = noop;
module.exports.requireNativeModule = () => { throw new Error('photo-lab stub: 네이티브 없음'); };
