// Service Worker - Commission Manager Pro
const CACHE_NAME = 'commission-manager-v3';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './icons.css',
  './manifest.json'
];

// CORRECCIÓN: Instalación con manejo de errores individual
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        
        // Cachear cada archivo individualmente con manejo de errores
        const cachePromises = urlsToCache.map(url => {
          return cache.add(url).catch(error => {
            console.warn(`Service Worker: Failed to cache ${url}:`, error);
            // Continuar con otros archivos incluso si uno falla
            return Promise.resolve();
          });
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('Service Worker: Install completed');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Install failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activation completed');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('Service Worker: Activation failed:', error);
      })
  );
});

// CORRECCIÓN: Fetch con excepciones para Supabase
self.addEventListener('fetch', event => {
  // Excluir solicitudes a Supabase del cache
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('axpgwncduujxficolgyt')) {
    console.log('Service Worker: Skipping cache for Supabase request');
    return fetch(event.request);
  }
  
  // Excluir solicitudes de API
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('auth/v1')) {
    return fetch(event.request);
  }
  
  // Solo cachear solicitudes GET
  if (event.request.method !== 'GET') {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }
        
        console.log('Service Worker: Fetching from network', event.request.url);
        
        // IMPORTANTE: Clonar la solicitud porque es un stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Verificar si recibimos una respuesta válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // IMPORTANTE: Clonar la respuesta para cachear
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache)
                  .then(() => {
                    console.log('Service Worker: Cached new resource', event.request.url);
                  })
                  .catch(cacheError => {
                    console.warn('Service Worker: Failed to cache response:', cacheError);
                  });
              });
            
            return response;
          })
          .catch(error => {
            console.error('Service Worker: Fetch failed:', error);
            
            // Si estamos offline y es una navegación, mostrar página offline
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            
            // Para otros tipos de solicitudes, devolver error apropiado
            return new Response('Network error', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
      .catch(error => {
        console.error('Service Worker: Cache match failed:', error);
        return fetch(event.request);
      })
  );
});

// Manejar mensajes desde la aplicación
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: Skipping waiting');
    self.skipWaiting();
  }
});

// Manejar errores no capturados
self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

// Manejar rechazos de promesas no manejados
self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
});
