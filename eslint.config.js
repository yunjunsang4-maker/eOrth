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
      // 글꼴 배율 상한을 우회하지 못하게 한다. React 19에서 함수형 컴포넌트의 defaultProps가
      // 제거돼 `Text.defaultProps = { maxFontSizeMultiplier }` 전역 주입이 불가능하므로,
      // import 출처를 강제하는 것이 유일한 방어선이다. (npm test의 규칙 7이 같은 내용을
      // 중복 검사한다 — expo lint는 src/app/components만 훑기 때문.)
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-native',
          importNames: ['Text', 'TextInput'],
          message: "Text/TextInput은 'src/ui/Text'에서 import하세요 (글꼴 배율 상한 1.2 적용).",
        }],
      }],
    },
  },
  // 래퍼 자신은 react-native의 Text/TextInput을 감싸야 하므로 예외다.
  // flat config는 순서 의존적이라(뒤가 이김) 반드시 위 rules 블록 뒤에 와야 한다.
  {
    files: ['src/ui/Text.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
