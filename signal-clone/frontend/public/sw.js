const SHELL_CACHE = 'cheetchat-shell-v4';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(['/', '/index.html']))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match('/index.html').then(cached => {
                const refresh = fetch(request).then(response => {
                    if (response.ok) {
                        // Clone synchronously, before the browser starts consuming the body.
                        const cacheCopy = response.clone();
                        caches.open(SHELL_CACHE)
                            .then(cache => cache.put('/index.html', cacheCopy))
                            .catch(() => {});
                    }
                    return response;
                }).catch(() => cached);
                return cached || refresh;
            })
        );
        return;
    }

    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(response => {
                if (response.ok) {
                    const cacheCopy = response.clone();
                    caches.open(SHELL_CACHE)
                        .then(cache => cache.put(request, cacheCopy))
                        .catch(() => {});
                }
                return response;
            }).catch(() => caches.match(request)))
        );
    }
});

self.addEventListener('push', (event) => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || 'New activity' }; }
    event.waitUntil(self.registration.showNotification(payload.title || 'CHEETCHAT', {
        body: payload.body || 'New activity',
        icon: payload.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: payload.url || '/' },
        tag: payload.tag || 'cheetchat-activity',
        renotify: true,
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const requestedPath = event.notification.data?.url || '/';
    const safePath = typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\')
        ? requestedPath : '/';
    const target = new URL(safePath, self.location.origin).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        for (const client of clients) {
            if ('focus' in client) {
                client.navigate(target);
                return client.focus();
            }
        }
        return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }));
});
