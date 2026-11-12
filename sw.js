/* sw.js — уведомления в 6:00 + PWA-кэш */

const CACHE_NAME = 'morning-run-v6';
const QUOTE_URL = '/__quote-data';
const PERIODIC_TAG = 'morning-quote';
const PRECACHE_URLS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_QUOTE') {
    const payload = {
      quote: data.quote || '',
      dateLabel: data.dateLabel || '',
      savedAt: Date.now()
    };
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache =>
        cache.put(
          new Request(QUOTE_URL),
          new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
        )
      )
    );
  }
});

async function getSavedQuote() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(QUOTE_URL);
    return res ? await res.json() : null;
  } catch (e) { return null; }
}

async function showMorningNotification() {
  let quoteText = 'Пора бежать. Цитата дня ждёт на сайте.';
  let dateLabel = '';
  const saved = await getSavedQuote();
  if (saved && saved.quote) {
    quoteText = '«' + saved.quote + '»';
    dateLabel = saved.dateLabel || '';
  }
  const icon = 'data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#0a0a0a'/><text x='50' y='68' font-size='60' text-anchor='middle' fill='#ffb000' font-family='sans-serif'>↑</text></svg>"
  );
  const badge = 'data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='#ffb000'/></svg>"
  );
  await self.registration.showNotification('Утренний бег · 6:00', {
    body: quoteText + (dateLabel ? '\n' + dateLabel : ''),
    tag: 'morning-quote',
    renotify: true,
    icon, badge,
    data: { url: './' }
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_TAG) event.waitUntil(showMorningNotification());
});
self.addEventListener('sync', (event) => {
  if (event.tag === PERIODIC_TAG) event.waitUntil(showMorningNotification());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.endsWith(QUOTE_URL)) return;
  if (req.url.includes('open-meteo.com') || req.url.includes('counterapi.dev')) return;

  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fb = await caches.match('./index.html');
      if (fb) return fb;
      return new Response('Offline', { status: 503 });
    })
  );
});