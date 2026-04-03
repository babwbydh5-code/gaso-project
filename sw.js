const CACHE_NAME = 'gasfinder-sudan-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

// Install Event - Caching basic assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Service Worker: Caching critical assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event - Cleaning old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Removing old cache...', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch Event - Cache-First Strategy
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests for non-essential items
    if (!event.request.url.startsWith(self.location.origin) && 
        !event.request.url.includes('unpkg.com') && 
        !event.request.url.includes('cdnjs.cloudflare.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return from cache OR fetch from net
            return response || fetch(event.request).then((fetchRes) => {
                // If successful fetch from net, update cache for next time
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, fetchRes.clone());
                    return fetchRes;
                });
            }).catch(() => {
                // If offline and not in cache, optionally show an offline page
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
