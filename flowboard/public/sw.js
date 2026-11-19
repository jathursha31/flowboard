// 📱 Service worker: website ku "offline la um open aagura" sakthi
// Pages = mudhalla internet, illana save panna copy. /assets files = save panna copy (perusu maaraadhu).
// /api (tasks, login) KANDIPPAA save pannakoodaadhu: eppovum server la irunthu fresh ah.
const CACHE = 'flowboard-v1';
const SHELL = ['/', '/logo.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

// 🧹 Pazhaya version cache ah azhi
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname === '/login') return;

  // 📄 Page (/, /app, /account...): internet first, illana saved "/" (React thaan page ah kaattum)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error()))
    );
    return;
  }

  // 📦 /assets/index-abc123.js maari (peru la hash irukku, maaradhu): saved copy first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 🖼️ Matha files (icons, fonts illa): internet first, illana saved copy
  event.respondWith(fetch(request).catch(() => caches.match(request).then((hit) => hit || Response.error())));
});

// 🆕 🔔 Push: server anuppina alert ah kaattu (website moodi irundhaalum)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Flowboard', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/app' }, // namma site page mattum
    })
  );
});

// 👆 Alert click pannaa: Flowboard tab irundhaa adhai, illana pudhu tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) return tab.focus().then((c) => c.navigate(target));
      return self.clients.openWindow(target);
    })
  );
});
