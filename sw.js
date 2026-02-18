const CACHE_NAME = 'puzzle-master-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './assets/images/stage_1.png',
  './assets/images/stage_2.png',
  './assets/images/stage_3.png',
  './assets/images/stage_4.png',
  './assets/images/stage_5.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
