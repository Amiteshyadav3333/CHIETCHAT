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
