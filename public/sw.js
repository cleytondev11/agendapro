const CACHE = 'agendapro-v21';
const ASSETS = ['/index.html', '/app.js', '/nichos.js', '/assinar.js', '/tour.js', '/qrcode.js', '/style.css', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Rede primeiro (sempre a versão mais nova); cache só quando estiver sem internet. A API nunca é cacheada.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('.mp4') || e.request.headers.has('range')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('/index.html')))
  );
});

// Notificações (agendamentos, cancelamentos, avisos ao cliente).
// Com o app aberto e na tela, o próprio app toca o som e mostra o aviso; senão, notificação do sistema com som e vibração.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'AgendaPro', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    ws.forEach(w => w.postMessage({ tipo: 'push', title: d.title, body: d.body }));
    if (ws.some(w => w.visibilityState === 'visible' && w.focused)) return;
    return self.registration.showNotification(d.title || 'AgendaPro', {
      body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      tag: 'agendapro-' + Date.now(), renotify: true, silent: false, requireInteraction: false,
      vibrate: [200, 100, 200, 100, 300], data: { url: d.url || './' }
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return self.clients.openWindow(e.notification.data.url);
  }));
});
