// ==========================================
// IMPROVED Service Worker v2
// Features:
// - Better cache management
// - Request logging
// - Smart fallback strategy
// ==========================================

const CACHE_VERSION = 'v2';
const CACHE_NAME = `universal-scanner-${CACHE_VERSION}`;

const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png"
];

const EXTERNAL_RESOURCES = [
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js",
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/esm/index.min.js"
];

// ==========================================
// Install Event - Cache Core Files
// ==========================================

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching core files');
      return cache.addAll(CORE_FILES);
    })
  );
  self.skipWaiting();
});

// ==========================================
// Activate Event - Clean Old Caches
// ==========================================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((n) => n.startsWith('universal-scanner-') && n !== CACHE_NAME)
          .map((n) => {
            console.log('[Service Worker] Deleting old cache:', n);
            return caches.delete(n);
          })
      );
    })
  );
  self.clients.claim();
});

// ==========================================
// Fetch Event - Smart Caching Strategy
// Network-first with fallback to cache
// ==========================================

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't cache browser extensions or non-GET requests
  if (url.protocol === 'chrome-extension:' || request.method !== 'GET') {
    return;
  }

  // Network-first strategy for all requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok && request.destination !== 'image') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }

          // Return offline page if available
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }

          // Return error response for other requests
          return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// ==========================================
// Message Handler - Cache Management from Client
// ==========================================

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
