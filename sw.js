/* 예장포커스 서비스워커
 * - 페이지·CSS·JS·데이터는 "네트워크 우선"(배포 직후에도 항상 최신), 오프라인이면 마지막으로 본 사본을 보여 준다.
 * - 사진은 "캐시 우선 + 백그라운드 갱신". 영상(mp4)과 다른 사이트 요청은 건드리지 않는다.
 * 캐시 구조를 바꿀 때는 VERSION 을 올리면 옛 캐시가 지워진다. */
const VERSION = 'yf-v1';
const PAGES = VERSION + '-pages';
const IMAGES = VERSION + '-images';
const MAX_IMAGES = 150;
const OFFLINE = '/%EB%A9%94%EC%9D%B8%ED%99%94%EB%A9%B4/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(['/', OFFLINE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, fallbackToOffline) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (fallbackToOffline) { const off = await cache.match(OFFLINE); if (off) return off; }
    throw err;
  }
}

async function imageStrategy(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req);
  const fetching = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { cache.put(req, res.clone()); trim(IMAGES, MAX_IMAGES); }
    return res;
  }).catch(() => hit);
  return hit || fetching;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.headers.has('range') || /\.(mp4|webm|mov)$/i.test(url.pathname)) return;
  if (url.pathname === '/sw.js') return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, true)); return; }
  if (req.destination === 'image' || /\/assets\/(images|og|icons)\//.test(url.pathname)) { e.respondWith(imageStrategy(req)); return; }
  e.respondWith(networkFirst(req, false));
});
