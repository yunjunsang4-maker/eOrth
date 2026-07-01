// 프라미스에 타임아웃을 건다. ms 안에 못 끝나면 Error('timeout')으로 reject.
// 네트워크가 느리거나 끊긴 상황에서 인증/조회가 무한 대기하는 것을 막는 용도.
// p는 Promise 또는 supabase 쿼리 빌더 같은 PromiseLike도 허용한다.
export function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
