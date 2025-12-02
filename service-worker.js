// service-worker.js

// ↑ change juste la version quand tu veux forcer une mise à jour
const CACHE_NAME = "nspt-tractage-v6";

const OFFLINE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./roads.geojson",
  "./favicon-32.png",
  "./icon-192.png",
  "./manifest.json"
];

// INSTALL : on pré-cache uniquement les fichiers hébergés sur ton GitHub Pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch((err) => {
        console.error("[SW] cache.addAll failed:", err);
      })
  );

  // le nouveau service worker s’active immédiatement
  self.skipWaiting();
});

// ACTIVATE : on supprime les anciens caches et on prend le contrôle des clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  // contrôle immédiat des pages déjà ouvertes
  return self.clients.claim();
});

// FETCH :
// - on ne gère que les requêtes GET
// - uniquement sur le même domaine (pas les CDN Supabase / Leaflet)
// - stratégie : cache d’abord, sinon réseau
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});