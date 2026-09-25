// sw.js — necesario para que el navegador ofrezca "Instalar".
// Guarda una copia del cascarón de la app (HTML/CSS/JS/íconos propios) para que abra
// aunque no haya internet. NO guarda tus datos: esos siguen viviendo en IndexedDB
// (ver comun.js) y en tu hoja de Google Sheets.

const CACHE = 'directorio-clientes-v1';
const PRECACHE_URLS = [
  './',
  'index.html',
  'login.html',
  'manifest.json',
  'css/base.css',
  'css/app.css',
  'css/login.css',
  'js/comun.js',
  'js/app.js',
  'js/login.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // nunca cachear POST (sincronización con Google Sheets)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fuentes, sql.js, Apps Script: siempre por red

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
