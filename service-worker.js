// service-worker.js
const CACHE_NAME = "nspt-tractage-v3";

const OFFLINE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./roads.geojson",
  "./favicon-32X32.png",
  "./icon-192.png",
  "./manifest.json",
];

// Install : on met juste en cache nos fichiers *du même domaine*.
// Surtout pas les CDN Leaflet / Supabase, c’est ça qui fait planter.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch((err) => {
        // On log l’erreur mais on n’empêche pas l’install
        console.error("[SW] cache.addAll failed:", err);
      })
  );
});

// Activate : on nettoie les vieux caches
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
});

// Fetch : stratégie cache-d’abord pour nos fichiers locaux
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne s’occupe que des GET, et que du même origin (ton GitHub Pages)
  if (req.method !== "GET") return;
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});