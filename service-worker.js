const CACHE_NAME = 'commission-manager-v3'; // Cambiar versión
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './supabase.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('🔄 Cache abierto, agregando recursos...');
        return cache.addAll(urlsToCache)
          .then(() => console.log('✅ Recursos cacheados correctamente'))
          .catch(err => console.log('⚠️ Error cacheando algunos recursos:', err));
      })
      .then(() => {
        // Forzar activación inmediata
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Limpiar caches viejos
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Eliminando cache viejo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Tomar control inmediato de todas las pestañas
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  // Solo cachear solicitudes GET del mismo origen
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si encontramos en cache, devolverlo
        if (response) {
          return response;
        }
        
        // Clonar la solicitud porque fetch consume el body
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Verificar que la respuesta sea válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clonar la respuesta para cachearla
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('❌ Error en fetch:', error);
            // Para archivos HTML, devolver la página principal
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./');
            }
            return new Response('Error de conexión', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});
