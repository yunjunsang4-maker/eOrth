/**
 * 형식 추천 상태 저장 알림 — photoAI/recoStorage.saveRecoState가 쓰기를 마칠 때마다 tripGroupId로 알린다.
 *
 * 왜 필요한가: RecoSection은 분석 중(status 'pending')에 5초마다 AsyncStorage를 다시 읽어 진행률·완료를
 * 반영했다(폴링). 상태를 쓰는 곳은 recoEngine.runFormatReco 하나이고 그건 RecoSection이 같은 JS 런타임에서
 * 부른다 — 백그라운드 태스크(photoAI/backgroundScheduler → pipeline.ts)는 추천 상태를 쓰지 않는다.
 * 그러니 '쓰는 순간 알림'으로 폴링을 대신할 수 있다(쓰기 0회면 깨어남도 0회).
 *
 * useSyncExternalStore 저장소(icons/palette.ts·constants/lateFonts.ts)가 아니라 순수 이벤트인 이유:
 * 받는 쪽이 할 일이 비동기 재읽기(AsyncStorage)라 동기 스냅샷으로 줄 값이 없다.
 *
 * react-native를 import하지 않는다 — recoStorage가 동적 import()로 부르는데, 그 파일의 순수 구역은
 * recoStorage.verify.ts가 node에서 돌린다.
 */
type Listener = (tripGroupId: string) => void;

const listeners = new Set<Listener>();

export function subscribeRecoStateSaved(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function notifyRecoStateSaved(tripGroupId: string): void {
  listeners.forEach((l) => l(tripGroupId));
}
