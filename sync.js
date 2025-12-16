// Sistema de sincronización offline/online - Commission Manager Pro
import { localDB } from './db.js';
import { supabaseManager } from './supabase.js';

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.lastSync = localStorage.getItem('lastSync');
    this.syncInterval = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    
    // Configuración
    this.config = {
      autoSync: localStorage.getItem('autoSync') !== 'false',
      syncInterval: parseInt(localStorage.getItem('syncInterval')) || 30000,
      conflictStrategy: localStorage.getItem('conflictStrategy') || 'last-write-wins',
      batchSize: 20
    };
    
    // Estado
    this.status = 'idle';
    this.pendingChanges = 0;
    this.lastError = null;
    
    // Inicializar
    this.init();
  }

  async init() {
    console.log('🔄 Sistema de sincronización inicializando...');
    
    // Escuchar eventos de conexión
    window.addEventListener('online', () => this.handleConnectionChange(true));
    window.addEventListener('offline', () => this.handleConnectionChange(false));
    
    // Cargar cambios pendientes
    await this.updatePendingCount();
    
    // Iniciar sincronización automática si está habilitada
    if (this.config.autoSync) {
      this.startAutoSync();
    }
    
    // Actualizar estado inicial
    this.updateConnectionStatus();
    
    console.log('✅ Sistema de sincronización listo');
  }

  handleConnectionChange(isOnline) {
    this.isOnline = isOnline;
    
    if (isOnline) {
      console.log('🌐 Conexión restablecida');
      this.updateConnectionStatus('online');
      
      // Intentar sincronizar después de 2 segundos
      setTimeout(() => {
        if (this.config.autoSync && !this.isSyncing) {
          this.sync();
        }
      }, 2000);
      
      // Reanudar sincronización automática
      this.startAutoSync();
    } else {
      console.log('📴 Sin conexión');
      this.updateConnectionStatus('offline');
      this.stopAutoSync();
    }
  }

  updateConnectionStatus(status = null) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;
    
    const actualStatus = status || (this.isOnline ? 'online' : 'offline');
    
    statusElement.className = `connection-status ${actualStatus}`;
    statusElement.innerHTML = `
      <div class="status-indicator ${actualStatus}"></div>
      <span>${actualStatus === 'online' ? 'En línea' : 'Sin conexión'}</span>
      ${this.pendingChanges > 0 ? `<span class="pending-badge">${this.pendingChanges}</span>` : ''}
    `;
    
    // Mostrar/ocultar según sea necesario
    if (actualStatus === 'online' && this.pendingChanges === 0) {
      setTimeout(() => {
        if (this.isOnline && this.pendingChanges === 0) {
          statusElement.style.opacity = '0';
          setTimeout(() => {
            if (statusElement.style.opacity === '0') {
              statusElement.style.display = 'none';
            }
          }, 300);
        }
      }, 3000);
    } else {
      statusElement.style.display = 'flex';
      statusElement.style.opacity = '1';
    }
  }

  async updatePendingCount() {
    try {
      const pendingItems = await localDB.getPendingSyncItems(100);
      this.pendingChanges = pendingItems.length;
      this.updateConnectionStatus();
      return this.pendingChanges;
    } catch (error) {
      console.error('Error actualizando conteo pendiente:', error);
      this.pendingChanges = 0;
      return 0;
    }
  }

  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.config.autoSync && !this.isSyncing && this.pendingChanges > 0) {
        console.log('⏰ Sincronización automática iniciada');
        this.sync();
      }
    }, this.config.syncInterval);
    
    console.log(`🔄 Sincronización automática configurada cada ${this.config.syncInterval/1000} segundos`);
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async sync() {
    if (this.isSyncing) {
      console.log('⏳ Sincronización ya en curso');
      return {
        success: false,
        error: 'Sincronización ya en curso'
      };
    }
    
    if (!this.isOnline) {
      console.log('📴 No hay conexión para sincronizar');
      return {
        success: false,
        error: 'Sin conexión a internet'
      };
    }
    
    this.isSyncing = true;
    this.status = 'syncing';
    this.retryCount = 0;
    
    // Mostrar indicador
    this.showSyncIndicator(true);
    
    console.log('🔄 Iniciando sincronización...');
    
    try {
      // 1. Sincronizar cambios locales con Supabase
      const syncResult = await this.syncLocalToRemote();
      
      // 2. Si la sincronización fue exitosa, descargar cambios remotos
      if (syncResult.success && syncResult.synced > 0) {
        await this.syncRemoteToLocal();
      }
      
      // 3. Actualizar estado
      this.lastSync = new Date().toISOString();
      localStorage.setItem('lastSync', this.lastSync);
      
      // 4. Limpiar items antiguos
      await localDB.cleanupOldSyncItems();
      
      // 5. Actualizar conteo pendiente
      await this.updatePendingCount();
      
      this.status = 'success';
      this.lastError = null;
      
      console.log(`✅ Sincronización completada: ${syncResult.synced || 0} cambios`);
      
      // Mostrar notificación
      this.showSyncNotification(syncResult);
      
      return {
        success: true,
        ...syncResult,
        timestamp: this.lastSync
      };
      
    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      
      this.status = 'error';
      this.lastError = error.message;
      this.retryCount++;
      
      // Reintentar si no excede el máximo
      if (this.retryCount <= this.maxRetries) {
        console.log(`↻ Reintentando en 5 segundos... (${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(() => {
          if (this.isOnline) {
            this.sync();
          }
        }, 5000);
      } else {
        this.showSyncError('Error de sincronización. Revise su conexión.');
      }
      
      return {
        success: false,
        error: error.message,
        retryCount: this.retryCount
      };
      
    } finally {
      this.isSyncing = false;
      this.showSyncIndicator(false);
    }
  }

  async syncLocalToRemote() {
    console.log('📤 Sincronizando cambios locales con remoto...');
    
    try {
      // Usar el método de syncData de SupabaseManager
      const result = await supabaseManager.syncData();
      
      if (!result.success) {
        throw new Error(result.error || 'Error desconocido en sincronización');
      }
      
      return {
        success: true,
        synced: result.synced || 0,
        errors: result.errors || 0
      };
      
    } catch (error) {
      console.error('Error sincronizando local a remoto:', error);
      throw error;
    }
  }

  async syncRemoteToLocal() {
    console.log('📥 Descargando cambios desde remoto...');
    
    if (!supabaseManager.user) {
      console.log('⚠️ Usuario no autenticado, omitiendo descarga');
      return;
    }
    
    try {
      // 1. Obtener perfil actualizado
      await supabaseManager.loadProfile();
      
      // 2. Obtener empresas actualizadas
      const empresas = await supabaseManager.getEmpresas();
      
      // 3. Para cada empresa, obtener contratos, certificaciones, etc.
      for (const empresa of empresas) {
        // Aquí iría la lógica para descargar datos relacionados
        // Por ahora solo actualizamos la empresa
        await localDB.update('empresas', empresa);
      }
      
      console.log(`✅ Descargadas ${empresas.length} empresas`);
      
    } catch (error) {
      console.error('Error descargando cambios remotos:', error);
      // No lanzamos error para no interrumpir la sincronización principal
    }
  }

  async checkForConflicts(localItem, remoteData) {
    // Implementación básica de detección de conflictos
    const localDate = new Date(localItem.data.fecha_actualizacion || localItem.fecha_creacion);
    const remoteDate = new Date(remoteData.fecha_actualizacion || remoteData.fecha_creacion);
    
    if (remoteDate > localDate) {
      return {
        hasConflict: true,
        localData: localItem.data,
        remoteData: remoteData,
        localTimestamp: localDate,
        remoteTimestamp: remoteDate,
        resolved: false
      };
    }
    
    return { hasConflict: false };
  }

  async resolveConflict(conflict, strategy = null) {
    const useStrategy = strategy || this.config.conflictStrategy;
    
    switch (useStrategy) {
      case 'last-write-wins':
        // Usar el más reciente
        if (conflict.remoteTimestamp > conflict.localTimestamp) {
          console.log('🔄 Usando datos remotos (más recientes)');
          return conflict.remoteData;
        } else {
          console.log('🔄 Usando datos locales (más recientes)');
          return conflict.localData;
        }
        
      case 'server-wins':
        console.log('🔄 Usando datos del servidor (server-wins)');
        return conflict.remoteData;
        
      case 'manual':
        console.log('🔄 Conflicto requiere resolución manual');
        await this.saveManualConflict(conflict);
        return null;
        
      default:
        console.log('🔄 Usando estrategia por defecto (last-write-wins)');
        if (conflict.remoteTimestamp > conflict.localTimestamp) {
          return conflict.remoteData;
        } else {
          return conflict.localData;
        }
    }
  }

  async saveManualConflict(conflict) {
    // Guardar conflicto para resolución manual
    const conflictData = {
      id: `conflict_${Date.now()}`,
      table: conflict.table,
      record_id: conflict.record_id,
      local_data: conflict.localData,
      remote_data: conflict.remoteData,
      local_timestamp: conflict.localTimestamp,
      remote_timestamp: conflict.remoteTimestamp,
      fecha_deteccion: new Date().toISOString(),
      resuelto: false
    };

    await localDB.add('conflictos', conflictData);
    
    // Mostrar notificación
    this.showConflictNotification(conflictData);
  }

  showSyncIndicator(show) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;
    
    if (show) {
      indicator.style.display = 'flex';
      indicator.innerHTML = `
        <div class="sync-spinner"></div>
        <span>Sincronizando cambios...</span>
      `;
    } else {
      indicator.style.display = 'none';
    }
  }

  showSyncNotification(result) {
    const container = document.getElementById('toasts-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-success fade-in';
    
    let message = 'Sincronización completada';
    if (result.synced > 0) {
      message += ` - ${result.synced} cambios sincronizados`;
    }
    if (result.errors > 0) {
      message += ` (${result.errors} errores)`;
    }
    
    toast.innerHTML = `
      <div class="toast-header">
        <i class="icon icon-check-circle"></i>
        <strong>Sincronización</strong>
        <small>${new Date().toLocaleTimeString()}</small>
        <button class="toast-close">&times;</button>
      </div>
      <div class="toast-body">
        <p>${message}</p>
        ${result.errors > 0 ? 
          '<p class="small">Los cambios con errores se reintentarán automáticamente.</p>' : ''}
      </div>
    `;
    
    container.appendChild(toast);
    
    // Configurar botón de cierre
    toast.querySelector('.toast-close').onclick = () => toast.remove();
    
    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  showSyncError(message) {
    const container = document.getElementById('toasts-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-error fade-in';
    
    toast.innerHTML = `
      <div class="toast-header">
        <i class="icon icon-x-circle"></i>
        <strong>Error de sincronización</strong>
        <button class="toast-close">&times;</button>
      </div>
      <div class="toast-body">
        <p>${message}</p>
        <p class="small">Los cambios se guardaron localmente.</p>
      </div>
    `;
    
    container.appendChild(toast);
    
    toast.querySelector('.toast-close').onclick = () => toast.remove();
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 8000);
  }

  showConflictNotification(conflict) {
    const container = document.getElementById('toasts-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-warning fade-in';
    
    toast.innerHTML = `
      <div class="toast-header">
        <i class="icon icon-alert-triangle"></i>
        <strong>Conflicto detectado</strong>
        <button class="toast-close">&times;</button>
      </div>
      <div class="toast-body">
        <p>Hay un conflicto en ${conflict.table}</p>
        <p class="small">Los datos fueron modificados tanto localmente como en el servidor.</p>
        <div class="mt-2">
          <button class="btn-resolve btn-sm">Resolver ahora</button>
          <button class="toast-close btn-sm ml-2">Más tarde</button>
        </div>
      </div>
    `;
    
    container.appendChild(toast);
    
    // Configurar botones
    toast.querySelector('.toast-close').onclick = () => toast.remove();
    toast.querySelector('.btn-resolve').onclick = () => {
      this.openConflictResolver(conflict);
      toast.remove();
    };
  }

  openConflictResolver(conflict) {
    // Implementar interfaz de resolución de conflictos
    console.log('Abriendo resolvedor de conflictos para:', conflict);
    // En una implementación completa, esto abriría un modal
  }

  async forceSync() {
    console.log('🚀 Forzando sincronización completa...');
    
    if (!this.isOnline) {
      this.showSyncError('No hay conexión a internet');
      throw new Error('No hay conexión a internet');
    }
    
    // 1. Sincronizar todos los cambios locales
    const syncResult = await this.syncLocalToRemote();
    
    if (!syncResult.success) {
      throw new Error(syncResult.error);
    }
    
    // 2. Descargar todos los datos remotos
    await this.syncRemoteToLocal();
    
    // 3. Limpiar caché si es necesario
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('🧹 Caché limpiada');
      } catch (error) {
        console.warn('Error limpiando caché:', error);
      }
    }
    
    console.log('✅ Sincronización forzada completada');
    
    return {
      success: true,
      message: 'Sincronización completa completada',
      synced: syncResult.synced || 0
    };
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      status: this.status,
      lastSync: this.lastSync,
      pendingChanges: this.pendingChanges,
      lastError: this.lastError,
      config: this.config,
      retryCount: this.retryCount
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Guardar en localStorage
    localStorage.setItem('autoSync', this.config.autoSync);
    localStorage.setItem('syncInterval', this.config.syncInterval);
    localStorage.setItem('conflictStrategy', this.config.conflictStrategy);
    
    // Reiniciar sincronización automática si es necesario
    if (this.config.autoSync && this.isOnline) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
    
    return this.config;
  }

  async getSyncStats() {
    try {
      const pendingItems = await localDB.getPendingSyncItems(1000);
      const allItems = await localDB.getAll('sync_queue');
      
      const stats = {
        pending: pendingItems.length,
        total: allItems.length,
        byStatus: {},
        byTable: {},
        lastWeek: 0
      };
      
      // Contar por estado
      allItems.forEach(item => {
        const status = item.estado || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        
        const table = item.table || 'unknown';
        stats.byTable[table] = (stats.byTable[table] || 0) + 1;
        
        // Contar items de la última semana
        const itemDate = new Date(item.fecha_creacion);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        if (itemDate > weekAgo) {
          stats.lastWeek++;
        }
      });
      
      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas de sincronización:', error);
      return null;
    }
  }

  // Métodos de utilidad para la aplicación
  async addChangeForSync(table, action, data) {
    const recordId = data.id || `temp_${Date.now()}`;
    
    const syncItem = {
      table,
      action,
      record_id: recordId,
      data,
      estado: 'pendiente',
      intentos: 0,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };
    
    try {
      await localDB.add('sync_queue', syncItem);
      await this.updatePendingCount();
      
      // Si estamos online y la sincronización automática está activada, sincronizar inmediatamente
      if (this.isOnline && this.config.autoSync && !this.isSyncing) {
        setTimeout(() => this.sync(), 1000);
      }
      
      return {
        success: true,
        syncId: syncItem.id,
        message: 'Cambio agregado a la cola de sincronización'
      };
    } catch (error) {
      console.error('Error agregando cambio a la cola:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async clearSyncQueue() {
    try {
      const allItems = await localDB.getAll('sync_queue');
      let deletedCount = 0;
      
      for (const item of allItems) {
        if (item.estado === 'completado' || item.estado === 'error') {
          await localDB.delete('sync_queue', item.id);
          deletedCount++;
        }
      }
      
      await this.updatePendingCount();
      
      return {
        success: true,
        deleted: deletedCount,
        message: `Cola limpiada: ${deletedCount} items eliminados`
      };
    } catch (error) {
      console.error('Error limpiando cola de sincronización:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Crear instancia única
const syncManager = new SyncManager();

// Hacer disponible globalmente
window.syncManager = syncManager;

// Exportar
export { syncManager };

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
  console.log('📡 Sync Manager listo');
  
  // Agregar estilos para los indicadores
  const styles = `
    .connection-status {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    }
    
    .connection-status.online {
      background: rgba(34, 197, 94, 0.9);
      color: white;
    }
    
    .connection-status.offline {
      background: rgba(239, 68, 68, 0.9);
      color: white;
    }
    
    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    
    .status-indicator.online {
      background: #22c55e;
      box-shadow: 0 0 10px #22c55e;
    }
    
    .status-indicator.offline {
      background: #ef4444;
      box-shadow: 0 0 10px #ef4444;
    }
    
    .pending-badge {
      background: white;
      color: #3b82f6;
      font-size: 12px;
      font-weight: bold;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
    }
    
    .sync-indicator {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 20px;
      background: rgba(59, 130, 246, 0.9);
      color: white;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      display: none;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      backdrop-filter: blur(10px);
    }
    
    .sync-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .toast {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      margin-bottom: 10px;
      max-width: 350px;
      overflow: hidden;
      animation: slideInRight 0.3s ease;
    }
    
    .toast-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      gap: 8px;
    }
    
    .toast-header i {
      font-size: 16px;
    }
    
    .toast-header strong {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
    }
    
    .toast-header small {
      color: #64748b;
      font-size: 12px;
    }
    
    .toast-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }
    
    .toast-close:hover {
      background: #f1f5f9;
    }
    
    .toast-body {
      padding: 16px;
      font-size: 14px;
      color: #475569;
    }
    
    .toast-body .small {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }
    
    .toast-success .toast-header {
      background: #22c55e;
      color: white;
      border-bottom-color: #16a34a;
    }
    
    .toast-error .toast-header {
      background: #ef4444;
      color: white;
      border-bottom-color: #dc2626;
    }
    
    .toast-warning .toast-header {
      background: #f59e0b;
      color: white;
      border-bottom-color: #d97706;
    }
    
    .btn-resolve {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .btn-resolve:hover {
      background: #2563eb;
    }
    
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .fade-in {
      animation: fadeIn 0.3s ease;
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
  
  // Crear elementos DOM si no existen
  if (!document.getElementById('connection-status')) {
    const connectionStatus = document.createElement('div');
    connectionStatus.id = 'connection-status';
    connectionStatus.className = 'connection-status';
    document.body.appendChild(connectionStatus);
  }
  
  if (!document.getElementById('sync-indicator')) {
    const syncIndicator = document.createElement('div');
    syncIndicator.id = 'sync-indicator';
    syncIndicator.className = 'sync-indicator';
    document.body.appendChild(syncIndicator);
  }
  
  if (!document.getElementById('toasts-container')) {
    const toastsContainer = document.createElement('div');
    toastsContainer.id = 'toasts-container';
    toastsContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 350px;
    `;
    document.body.appendChild(toastsContainer);
  }
});
