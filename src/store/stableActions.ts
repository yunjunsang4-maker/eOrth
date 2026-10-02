/**
 * 참조가 영구히 안정된 액션 묶음을 만든다 ("최신 참조" 패턴).
 *
 * RecordProvider의 액션 대부분은 useCallback 없는 일반 클로저라 렌더마다 새로 생긴다.
 * 그 함수들을 그대로 Context에 넣으면 소비자 전원이 매번 리렌더된다. 그렇다고 70개 클로저를
 * 일일이 useCallback으로 바꾸면 deps 하나 빠뜨릴 때마다 낡은 상태를 읽는 버그가 생긴다.
 *
 * 대신 Provider는 매 렌더 `ref.current`에 최신 클로저 묶음을 넣고, 여기서 **마운트 시 1회**
 * 이름마다 `(...a) => ref.current[name](...a)` 래퍼를 만들어 Context에 준다. 래퍼 참조는
 * 바뀌지 않고, 호출하는 순간에는 항상 가장 최근 렌더의 클로저가 실행된다.
 *
 * ⚠️ "현재 상태를 읽어 값을 돌려주는" 함수(isBlocked 같은)는 여기 넣으면 안 된다.
 * React Compiler로 컴파일된 소비자가 `isBlocked(x)` 결과를 `[isBlocked, x]`에 메모하므로,
 * 참조가 영구 안정이면 상태가 바뀌어도 화면이 굳는다. 그런 함수는 근거 상태를 deps로 한
 * 데이터 슬라이스에 둔다.
 *
 * 키 목록은 생성 시점의 `ref.current`에서 고정된다 — 이후 렌더에 새 키가 생겨도 래퍼는 없다
 * (Provider가 매번 같은 객체 리터럴을 넣으므로 실제로는 일어나지 않는다).
 */
type AnyFn = (...args: any[]) => any;

export function makeStableActions<T extends { [K in keyof T]: AnyFn }>(ref: { readonly current: T }): T {
  const out = {} as Record<string, AnyFn>;
  for (const key of Object.keys(ref.current)) {
    out[key] = (...args: unknown[]) => (ref.current as Record<string, AnyFn>)[key](...args);
  }
  return out as T;
}
