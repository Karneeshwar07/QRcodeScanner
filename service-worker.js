// Minimal service worker — mainly here so the browser considers this app
// "installable" as a PWA. It caches the core files so the app shell still
// opens even with a flaky connection (the camera/scanning itself always
// needs a live connection for the ZXing library, though).

const CACHE_NAME = "universal-scanner-v1";
const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for everything, falling back to cache if offline
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
