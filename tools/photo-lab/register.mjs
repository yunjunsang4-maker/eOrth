// tsx는 .ts를 CJS require 경로로 읽으므로 ESM 훅이 아니라 _resolveFilename을 가로챈다.
// 사용: node --import tsx --import file:///<abs>/tools/photo-lab/register.mjs <script.ts>
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
const STUB = fileURLToPath(new URL('./stub-native.cjs', import.meta.url));
const isNative = (s) => s.startsWith('expo') || s.startsWith('react-native') || s.startsWith('@react-native');
const orig = Module._resolveFilename;
Module._resolveFilename = function (spec, ...rest) {
  return isNative(spec) ? STUB : orig.call(this, spec, ...rest);
};
