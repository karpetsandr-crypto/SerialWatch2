// Service worker: приложение открывается без интернета, постеры и библиотека Firebase кэшируются.
const VERSION = "v5";
const SHELL = "sw-shell-" + VERSION;
const IMGS = "sw-img-v1";
const LIBS = "sw-libs-v1";
const KEEP = [SHELL, IMGS, LIBS];
const ASSETS = [
  "./", "./index.html", "./app.css", "./app.js", "./i18n.js", "./config.js", "./manifest.webmanifest",
  "./fonts/Lora.woff", "./fonts/Inter-Regular.woff", "./fonts/Inter-SemiBold.woff",
  "./icons/icon-192.png", "./icons/icon-512.png"
];
const MAX_IMGS = 400;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => KEEP.indexOf(k) < 0).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, cacheName, limit) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) {
    c.put(req, res.clone());
    if (limit) trim(cacheName, limit);
  }
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(cacheFirst(req, LIBS));
  } else if (url.hostname === "image.tmdb.org" || url.hostname === "cdn.myanimelist.net") {
    e.respondWith(cacheFirst(req, IMGS, MAX_IMGS));
  }
  // остальное (TMDB API, Firebase) идёт напрямую
});
