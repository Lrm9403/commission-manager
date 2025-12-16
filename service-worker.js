// Service Worker para Commission Manager Pro
const CACHE_NAME = 'commission-manager-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Archivos esenciales para el funcionamiento de la app
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/db.js',
  '/sync.js',
  '/auth.js',
  '/api.js'
];

// Archivos estáticos para caché
const STATIC_ASSETS = [
  // Agrega aquí otros assets estáticos
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheando archivos esenciales...');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('Service Worker: Instalación completada');
        return self.skipWaiting();
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  
  // Limpiar caches antiguos
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Limpiando cache antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activación completada');
      return self.clients.claim();
    })
  );
});

// Estrategia de cache: Network First con fallback a Cache
self.addEventListener('fetch', event => {
  // Evitar solicitudes de chrome-extension
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Para solicitudes de API, usar Network First
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clonar la respuesta para cachear
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback al cache si hay error de red
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para archivos estáticos, usar Cache First
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retornar del cache si existe
        if (response) {
          return response;
        }

        // Si no está en cache, obtener de la red
        return fetch(event.request)
          .then(response => {
            // Verificar respuesta válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar respuesta para cachear
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Si estamos offline y es una página, mostrar página offline
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            
            // Para otros recursos, retornar respuesta vacía
            return new Response('', {
              status: 408,
              statusText: 'Offline'
            });
          });
      })
  );
});

// Manejar mensajes desde la app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Sincronización en background
self.addEventListener('sync', event => {
  console.log('Service Worker: Sincronización en background:', event.tag);
  
  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(syncPendingChanges());
  }
});

// Función para sincronizar cambios pendientes
async function syncPendingChanges() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STARTED'
      });
    });

    // Aquí iría la lógica de sincronización
    console.log('Sincronizando cambios pendientes...');
    
    return Promise.resolve();
  } catch (error) {
    console.error('Error en sincronización:', error);
    return Promise.reject(error);
  }
}

// Notificaciones push
self.addEventListener('push', event => {
  console.log('Service Worker: Notificación push recibida');
  
  let data = {};
  if (event.data) {
    data = event.data.json();
  }
  
  const options = {
    body: data.body || 'Nueva actualización disponible',
    icon: 'icons/icon-192x192.png',
    badge: 'icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Commission Manager', options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notificación clickeada');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Abrir o enfocar la ventana existente
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Abrir nueva ventana si no existe
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url || '/');
        }
      })
  );
});