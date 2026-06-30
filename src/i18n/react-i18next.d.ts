// react-i18next의 t() 키 자동완성·타입체크용 보강. 키 출처는 ko.ts.
import 'react-i18next';
import type ko from './locales/ko';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof ko;
    };
  }
}
