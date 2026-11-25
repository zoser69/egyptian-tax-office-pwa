const CACHE_NAME = 'egyptian-tax-office-pwa-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './styles.css',
  './data.js',
  './data_refs.js',
  './app_core.js',
  './app_views.js',
  './app_calc_law91.js',
  './app_calc.js',
  './app_memo.js',
  './app_events.js',
  './app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('supabase.co') !== -1) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// استقبال أوامر الإشعارات المحلية أو السحابية وعرضها على الموبايل والكمبيوتر
self.addEventListener('push', (event) => {
  let payload = {
    title: 'دفتر المكتب الضريبي',
    body: 'تنبيه جديد من دفتر الجلسات والملفات الضريبية',
    tag: 'tax-office-push-' + Date.now(),
    url: './index.html#view-tasks'
  };
  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign(payload, parsed);
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icon.svg',
      badge: './icon.svg',
      dir: 'rtl',
      lang: 'ar',
      tag: payload.tag,
      renotify: true,
      vibrate: [180, 80, 180],
      data: { url: payload.url || './index.html#view-tasks' }
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_LOCAL_NOTIFICATION') return;
  const title = event.data.title || 'دفتر المكتب الضريبي';
  const options = Object.assign({
    body: '',
    icon: './icon.svg',
    badge: './icon.svg',
    dir: 'rtl',
    lang: 'ar',
    tag: 'tax-office-notif-' + Date.now(),
    renotify: true,
    vibrate: [180, 80, 180],
    data: { url: event.data.url || './index.html#view-tasks' }
  }, event.data.options || {});
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICKED', url: targetUrl });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
