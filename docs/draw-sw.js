/**
 * 부스 뽑기 오프라인 캐시 — 서비스 워커.
 *
 * 왜 있는가: 재고가 스태프 기기의 localStorage에만 있고 서버가 없다.
 * 이미 열려 있는 페이지는 네트워크를 안 쓰지만, 축제장 와이파이가 끊긴 상태에서
 * 한 번이라도 새로고침하면(관리 패널의 '날짜 다시 고르기'가 location.reload()를 부른다)
 * 페이지 자체를 못 받아 와 부스가 멈춘다. 그걸 막는 것이 이 파일의 유일한 역할이다.
 *
 * ⚠️ 캐시 우선(cache-first)이라 값을 고쳐 다시 게시해도 이미 캐시를 받은 기기는
 *    옛 파일을 계속 쓴다. 재게시할 때는 반드시 아래 CACHE 버전을 올릴 것.
 *
 * 개인정보·네트워크 원칙: 아무것도 기록하지 않고 아무 데도 보내지 않는다.
 * 동일 출처 GET만 다루고 그 외 요청은 손대지 않는다.
 */

/** 캐시 이름 = 버전. 게시본을 고칠 때마다 v2, v3… 로 올린다 */
const CACHE = 'eorth-draw-v4';

/**
 * 프리캐시 대상. 이 페이지는 외부 폰트·이미지·CDN을 하나도 쓰지 않으므로
 * (CSS는 인라인, 아이콘은 인라인 SVG) 이 둘이면 오프라인 부팅에 충분하다.
 * 경로는 서비스 워커 위치 기준 상대경로다 — 공개본이 저장소 이름 경로 아래에
 * 놓이더라도 절대경로처럼 어긋나지 않는다.
 */
// draw-admin.html은 오프라인에서 할 수 있는 일이 없다(모든 값이 서버에 있다).
// 그래도 담는 이유는, 노트북 와이파이가 잠깐 끊겼을 때 브라우저 오류 페이지 대신
// "연결 끊김"이 찍힌 콘솔이 떠야 스태프가 상황을 알아볼 수 있기 때문이다.
const ASSETS = ['./draw.html', './draw-admin.html', './draw-core.js'];

self.addEventListener('install', (event) => {
  // cache: 'reload'로 받아야 한다. 그냥 addAll(ASSETS)를 하면 HTTP 캐시를 경유하므로,
  // gh-pages의 max-age 창(약 10분) 안에 캐시 버전을 올려 재방문하면 새 이름의 캐시에
  // 옛 파일이 그대로 담긴다. 그러면 버전을 올린 의미가 사라지는데, 증상은
  // "버전을 올렸는데도 옛 값이 나온다"라 원인을 찾기가 매우 어렵다.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // 부스 기기는 탭이 하나뿐이라 '다음에 닫았다 열면 적용'을 기다릴 이유가 없다
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // 첫 방문에서도 이 워커가 곧바로 페이지를 맡게 한다 — 안 그러면 캐시가 채워져도
      // 그 탭은 다음 새로고침까지 워커 없이 돈다.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET이 아닌 것은 그대로 흘려보낸다(응답을 가로채면 캐시 대상도 아니면서 실패 경로만 는다)
  if (req.method !== 'GET') return;

  // 동일 출처만. 서드파티 URL은 캐시하지도 요청하지도 않는다.
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 캐시 우선 → 없으면 네트워크. 부스에서는 최신성보다 "열린다"가 우선이다.
  // ignoreSearch: 링크에 ?v=1 같은 꼬리가 붙어도 같은 파일로 본다. 부스에서 카톡·북마크로
  // 연 링크에 꼬리가 붙어도 오프라인에서 열리게 하려는 의도된 선택이다.
  //
  // ⚠️ 그 대가: "import·링크에 ?v=를 붙여 캐시를 우회한다"는 흔한 응급 수단이 여기서는
  //    통하지 않는다. 꼬리가 뭐든 같은 캐시 항목으로 매칭되기 때문이다.
  //    옛 파일에서 빠져나오는 길은 위 CACHE 버전을 올려 재게시하는 것 하나뿐이다.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      // 캐시에도 없고 네트워크도 실패하면 그대로 실패시킨다 —
      // 가짜 200을 만들어 주면 빈 화면의 원인을 스태프가 영원히 못 찾는다.
      return fetch(req);
    }),
  );
});
