import { registerRootComponent } from 'expo';

import App from './App';
// 온디바이스 베스트컷 백그라운드 태스크 정의 등록 (앱 시작 시점)
import './src/services/photoAI/backgroundScheduler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
