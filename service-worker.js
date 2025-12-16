// Service Worker para Commission Manager Pro - GitHub Pages compatible
const CACHE_NAME = 'commission-manager-v2.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './supabase.js',
  './sync.js',
  './manifest.json'
];

// Archivos a cachear dinámicamente
const DYNAMIC_CACHE = 'dynamic-v2';

self.addEventListener('install', event => {
  console.log('🛠️ Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cacheando archivos esenciales...');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('✅ Instalación completada');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE) {
            console.log(`🗑️ Eliminando cache antiguo: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('✅ Activación completada');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // Excluir solicitudes no GET
  if (event.request.method !== 'GET') return;
  
  // Excluir extensiones de Chrome
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Para archivos HTML, usar network-first
  if (event.request.url.includes('.html') || 
      event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(response => response || caches.match('./index.html'));
        })
    );
    return;
  }
  
  // Para archivos estáticos (CSS, JS), usar cache-first
  if (event.request.url.includes('.css') || 
      event.request.url.includes('.js') ||
      event.request.url.includes('.json')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) return response;
          
          return fetch(event.request)
            .then(response => {
              const responseClone = response.clone();
              caches.open(DYNAMIC_CACHE)
                .then(cache => cache.put(event.request, responseClone));
              return response;
            })
            .catch(() => {
              // Fallback genérico para JS/CSS
              if (event.request.url.includes('.js')) {
                return new Response('console.log("Offline mode");', {
                  headers: { 'Content-Type': 'application/javascript' }
                });
              }
            });
        })
    );
    return;
  }
  
  // Para solicitudes de API/Supabase, usar network-first
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return response;
        })
        .catch(error => {
          console.log('📴 Offline - Supabase request failed');
          return new Response(JSON.stringify({ 
            offline: true, 
            message: 'Modo offline activado' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // Estrategia por defecto: network-first
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Solo cachear respuestas exitosas
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Manejar mensajes desde la aplicación
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => caches.delete(cache))
      );
    });
  }
});

// Sincronización en background
self.addEventListener('sync', event => {
  console.log('🔄 Service Worker: Sync event:', event.tag);
  
  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(
      syncPendingChanges()
        .then(() => console.log('✅ Sync completed'))
        .catch(error => console.error('❌ Sync error:', error))
    );
  }
});

async function syncPendingChanges() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ 
      type: 'BACKGROUND_SYNC_STARTED',
      timestamp: new Date().toISOString()
    });
  });
  
  // Simular sincronización (en producción se conectaría a Supabase)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  clients.forEach(client => {
    client.postMessage({ 
      type: 'BACKGROUND_SYNC_COMPLETED',
      timestamp: new Date().toISOString(),
      success: true
    });
  });
  
  return Promise.resolve();
}

// Notificaciones push (configuración básica)
self.addEventListener('push', event => {
  console.log('📱 Push notification received');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Commission Manager', body: event.data.text() };
    }
  }
  
  const options = {
    body: data.body || 'Nueva actualización disponible',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir aplicación'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Commission Manager', options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked');
  
  event.notification.close();
  
  const action = event.action;
  
  if (action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then(clientList => {
      // Buscar ventana existente
      for (const client of clientList) {
        if (client.url.includes('./') && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Abrir nueva ventana si no existe
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || './');
      }
    })
  );
});

// Manejo offline para páginas
const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commission Manager - Offline</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
        }
        p {
            font-size: 1.1em;
            opacity: 0.9;
            margin-bottom: 30px;
        }
        .icon {
            font-size: 4em;
            margin-bottom: 20px;
        }
        button {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📡</div>
        <h1>Sin conexión</h1>
        <p>Estás trabajando en modo offline. Los cambios se sincronizarán cuando recuperes la conexión.</p>
        <button onclick="window.location.reload()">Reintentar conexión</button>
    </div>
</body>
</html>
`;

// Cachear página offline
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        new Request('./offline.html', {
          headers: { 'Content-Type': 'text/html' }
        })
      ]);
    })
  );
});
