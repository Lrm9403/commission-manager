const CACHE_NAME = 'commission-manager-v2';
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
  );
});

self.addEventListener('fetch', event => {
  // Solo cachear solicitudes GET
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si encontramos en cache, devolverlo
        if (response) {
          return response;
        }
        
        // Si no está en cache, hacer la solicitud
        return fetch(event.request)
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
            // Puedes devolver una página de error o algo por defecto
            return new Response('Error de conexión', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
