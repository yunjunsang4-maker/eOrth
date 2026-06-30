// ESLint flat config (ESLint 9 + Expo SDK 54)
// 실행: npm run lint  (= expo lint)
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'scripts/icon-svgs.json',
      'cg_tmp.js',
      '**/*.verify.ts', // 검증 스크립트는 npm test로 별도 실행
    ],
  },
  {
    rules: {
      // React Native에는 HTML 엔티티 렌더링이 없어 무의미(한글 텍스트의 ' " 이스케이프 강요).
      'react/no-unescaped-entities': 'off',
    },
  },
]);
