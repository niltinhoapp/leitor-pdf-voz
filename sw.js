// Service Worker - PDF Voz Pro
const CACHE_NAME = 'pdf-voz-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/pdf-engine.js',
  './js/tts-engine.js',
  './js/ocr-engine.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
  './exemplo_livro.pdf'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições - Cache First com Fallback de Rede
self.addEventListener('fetch', (event) => {
  // Lida com Web Share Target (quando o Android compartilha um arquivo PDF para o app)
  if (event.request.method === 'POST' && event.request.url.includes('index.html')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const pdfFile = formData.get('pdf');
          if (pdfFile) {
            // Guarda em IndexedDB ou repassa para a janela aberta
            const cache = await caches.open(CACHE_NAME);
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            
            // Redireciona para o index.html com sinalizador de share
            return Response.redirect('./index.html?shared=1', 303);
          }
        } catch (err) {
          console.error('[SW Share Target Error]', err);
        }
        return Response.redirect('./index.html', 303);
      })()
    );
    return;
  }

  // Requisições normais (GET)
  if (event.request.method === 'GET') {
    // Ignora chamadas de APIs externas dinâmicas ou blob URLs
    if (event.request.url.startsWith('blob:') || event.request.url.startsWith('chrome-extension:')) {
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Retorna do cache e tenta atualizar em background (Stale While Revalidate)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse);
                });
              }
            })
            .catch(() => {/* Offline */});
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          // Se for asset local ou biblioteca externa (ex: PDF.js / Tailwind CDN), armazena em cache
          if (
            networkResponse && 
            networkResponse.status === 200 && 
            (event.request.url.includes('cdnjs') || event.request.url.includes('jsdelivr') || event.request.url.includes(self.location.origin))
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Se offline e requisição for HTML, retorna index.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});
