// Sistema de sincronización offline/online
import { localDB } from './db.js';
import { supabaseManager } from './supabase.js';

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.lastSync = null;
    this.syncInterval = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // Configuración de sincronización
    this.config = {
      autoSync: true,
      syncInterval: 30000, // 30 segundos
      batchSize: 50,
      conflictStrategy: 'last-write-wins' // 'last-write-wins', 'manual', 'server-wins'
    };
    
    this.init();
  }

  // Inicializar sistema de sincronización
  init() {
    // Escuchar eventos de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Cargar configuración
    this.loadConfig();
    
    // Iniciar sincronización automática si está habilitada
    if (this.config.autoSync && this.isOnline) {
      this.startAutoSync();
    }
    
    console.log('🔄 Sistema de sincronización inicializado');
  }

  // Cargar configuración desde localStorage
  loadConfig() {
    const savedConfig = localStorage.getItem('syncConfig');
    if (savedConfig) {
      this.config = { ...this.config, ...JSON.parse(savedConfig) };
    }
  }

  // Guardar configuración en localStorage
  saveConfig() {
    localStorage.setItem('syncConfig', JSON.stringify(this.config));
  }

  // Manejar cuando el dispositivo se conecta
  handleOnline() {
    console.log('🌐 Dispositivo online');
    this.isOnline = true;
    this.updateConnectionStatus();
    
    // Intentar sincronizar inmediatamente
    if (this.config.autoSync) {
      setTimeout(() => this.syncPendingChanges(), 1000);
    }
    
    // Reiniciar sincronización automática
    this.startAutoSync();
  }

  // Manejar cuando el dispositivo se desconecta
  handleOffline() {
    console.log('📴 Dispositivo offline');
    this.isOnline = false;
    this.updateConnectionStatus();
    
    // Detener sincronización automática
    this.stopAutoSync();
  }

  // Actualizar indicador de conexión en la UI
  updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;

    if (this.isOnline) {
      statusElement.className = 'connection-status online';
      statusElement.innerHTML = '<i class="bi bi-wifi"></i> Online';
      statusElement.style.display = 'flex';
      
      // Ocultar después de 3 segundos
      setTimeout(() => {
        if (this.isOnline) {
          statusElement.style.display = 'none';
        }
      }, 3000);
    } else {
      statusElement.className = 'connection-status offline';
      statusElement.innerHTML = '<i class="bi bi-wifi-off"></i> Offline';
      statusElement.style.display = 'flex';
    }
  }

  // Iniciar sincronización automática
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.config.autoSync && !this.isSyncing) {
        this.syncPendingChanges();
      }
    }, this.config.syncInterval);
  }

  // Detener sincronización automática
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Sincronizar cambios pendientes
  async syncPendingChanges() {
    if (this.isSyncing || !this.isOnline) {
      console.log('Sincronización en curso o dispositivo offline');
      return;
    }

    this.isSyncing = true;
    this.showSyncIndicator(true);

    try {
      console.log('🔄 Iniciando sincronización...');

      // 1. Obtener cambios pendientes de la cola local
      const pendingItems = await localDB.getPendingSyncItems(this.config.batchSize);
      
      if (pendingItems.length === 0) {
        console.log('✅ No hay cambios pendientes para sincronizar');
        this.lastSync = new Date().toISOString();
        this.updateLastSyncTime();
        return;
      }

      console.log(`📦 Sincronizando ${pendingItems.length} cambios pendientes...`);

      // 2. Procesar cada item de sincronización
      const results = {
        success: [],
        failed: [],
        conflicts: []
      };

      for (const item of pendingItems) {
        try {
          // Verificar si hay conflicto
          const conflict = await this.checkForConflict(item);
          
          if (conflict.hasConflict) {
            console.log(`⚠️ Conflicto detectado en ${item.table} (ID: ${item.record_id})`);
            
            // Manejar conflicto según la estrategia configurada
            const resolvedItem = await this.resolveConflict(item, conflict);
            
            if (resolvedItem) {
              item.data = resolvedItem;
              conflict.resolved = true;
            }
            
            results.conflicts.push({
              item: item,
              conflict: conflict
            });

            // Si no se pudo resolver, saltar este item
            if (!conflict.resolved) {
              await localDB.incrementSyncAttempts(item.id);
              continue;
            }
          }

          // 3. Ejecutar la operación en Supabase
          const success = await this.executeSupabaseOperation(item);
          
          if (success) {
            // 4. Marcar como procesado
            await localDB.markSyncItemProcessed(item.id);
            results.success.push(item);
            
            console.log(`✓ ${item.action} en ${item.table} (ID: ${item.record_id})`);
          } else {
            // Incrementar intentos
            await localDB.incrementSyncAttempts(item.id);
            results.failed.push(item);
            
            console.log(`✗ Error en ${item.action} en ${item.table} (ID: ${item.record_id})`);
          }
        } catch (error) {
          console.error(`Error procesando item ${item.id}:`, error);
          await localDB.incrementSyncAttempts(item.id);
          results.failed.push({
            item: item,
            error: error.message
          });
        }
      }

      // 5. Descargar cambios desde Supabase (sincronización bidireccional)
      if (supabaseManager.user) {
        await this.pullChangesFromSupabase();
      }

      // 6. Actualizar estado
      this.lastSync = new Date().toISOString();
      this.retryCount = 0;
      
      // 7. Mostrar resultados
      this.showSyncResults(results);

      console.log(`✅ Sincronización completada: ${results.success.length} exitosos, ${results.failed.length} fallidos, ${results.conflicts.length} conflictos`);

    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      this.retryCount++;
      
      // Reintentar si no excede el máximo
      if (this.retryCount <= this.maxRetries) {
        console.log(`Reintentando en 5 segundos... (${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.syncPendingChanges(), 5000);
      } else {
        this.showSyncError('Error de sincronización. Revise su conexión.');
      }
    } finally {
      this.isSyncing = false;
      this.showSyncIndicator(false);
      
      // Limpiar items antiguos procesados
      await localDB.cleanupOldSyncItems();
    }
  }

  // Verificar si hay conflicto con datos en Supabase
  async checkForConflict(syncItem) {
    // Solo verificar conflictos para UPDATE
    if (syncItem.action !== 'UPDATE') {
      return { hasConflict: false };
    }

    try {
      // Obtener versión actual en Supabase
      const { data: remoteData, error } = await supabaseManager.supabase
        .from(syncItem.table)
        .select('*')
        .eq('id', syncItem.record_id)
        .single();

      if (error || !remoteData) {
        return { hasConflict: false };
      }

      // Comparar fechas de modificación
      const localUpdate = new Date(syncItem.data.fecha_actualizacion || syncItem.data.updated_at);
      const remoteUpdate = new Date(remoteData.fecha_actualizacion || remoteData.updated_at);

      // Si el dato remoto es más reciente, hay conflicto
      if (remoteUpdate > localUpdate) {
        return {
          hasConflict: true,
          localData: syncItem.data,
          remoteData: remoteData,
          localTimestamp: localUpdate,
          remoteTimestamp: remoteUpdate,
          resolved: false
        };
      }

      return { hasConflict: false };
    } catch (error) {
      console.error('Error verificando conflicto:', error);
      return { hasConflict: false };
    }
  }

  // Resolver conflicto según estrategia configurada
  async resolveConflict(syncItem, conflict) {
    switch (this.config.conflictStrategy) {
      case 'last-write-wins':
        // Usar el dato más reciente
        if (conflict.remoteTimestamp > conflict.localTimestamp) {
          console.log('Usando datos del servidor (más recientes)');
          return conflict.remoteData;
        } else {
          console.log('Usando datos locales (más recientes)');
          return syncItem.data;
        }

      case 'server-wins':
        // Siempre usar datos del servidor
        console.log('Usando datos del servidor (server-wins)');
        return conflict.remoteData;

      case 'manual':
        // Dejar que el usuario decida (implementar UI)
        console.log('Conflicto requiere resolución manual');
        
        // Guardar conflicto para resolución manual
        await this.saveManualConflict(syncItem, conflict);
        return null;

      default:
        console.log('Usando estrategia por defecto (last-write-wins)');
        if (conflict.remoteTimestamp > conflict.localTimestamp) {
          return conflict.remoteData;
        } else {
          return syncItem.data;
        }
    }
  }

  // Guardar conflicto para resolución manual
  async saveManualConflict(syncItem, conflict) {
    const conflictData = {
      id: `conflict_${Date.now()}`,
      sync_item_id: syncItem.id,
      table: syncItem.table,
      record_id: syncItem.record_id,
      local_data: syncItem.data,
      remote_data: conflict.remoteData,
      local_timestamp: conflict.localTimestamp,
      remote_timestamp: conflict.remoteTimestamp,
      fecha_deteccion: new Date().toISOString(),
      resuelto: false
    };

    await localDB.add('conflictos', conflictData);
    
    // Mostrar notificación al usuario
    this.showConflictNotification(syncItem, conflict);
  }

  // Ejecutar operación en Supabase
  async executeSupabaseOperation(syncItem) {
    try {
      let result;

      switch (syncItem.action) {
        case 'INSERT':
          result = await supabaseManager.supabase
            .from(syncItem.table)
            .insert([syncItem.data]);
          break;

        case 'UPDATE':
          result = await supabaseManager.supabase
            .from(syncItem.table)
            .update(syncItem.data)
            .eq('id', syncItem.record_id);
          break;

        case 'DELETE':
          result = await supabaseManager.supabase
            .from(syncItem.table)
            .delete()
            .eq('id', syncItem.record_id);
          break;

        default:
          throw new Error(`Acción no soportada: ${syncItem.action}`);
      }

      if (result.error) {
        console.error(`Error en operación ${syncItem.action}:`, result.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error ejecutando operación ${syncItem.action}:`, error);
      return false;
    }
  }

  // Descargar cambios desde Supabase
  async pullChangesFromSupabase() {
    if (!supabaseManager.user) return;

    try {
      console.log('⬇️ Descargando cambios desde Supabase...');

      // Obtener fecha de última sincronización
      const lastSync = this.lastSync || localStorage.getItem('lastSuccessfulSync');
      
      // Descargar datos del usuario
      const remoteData = await supabaseManager.downloadUserData();
      
      if (!remoteData) {
        console.log('No hay datos remotos para descargar');
        return;
      }

      // Sincronizar datos descargados con la base de datos local
      await this.mergeRemoteData(remoteData);

      console.log('✅ Cambios descargados desde Supabase');

    } catch (error) {
      console.error('Error descargando cambios:', error);
    }
  }

  // Fusionar datos remotos con locales
  async mergeRemoteData(remoteData) {
    // Para cada tabla, actualizar o insertar registros
    const tables = ['empresas', 'contratos', 'suplementos', 'certificaciones', 'pagos', 'pagos_distribucion'];
    
    for (const table of tables) {
      if (remoteData[table] && remoteData[table].length > 0) {
        console.log(`🔄 Fusionando ${remoteData[table].length} registros de ${table}...`);
        
        for (const remoteRecord of remoteData[table]) {
          try {
            // Verificar si existe localmente
            const localRecord = await localDB.get(table, remoteRecord.id);
            
            if (localRecord) {
              // Comparar fechas para determinar cuál es más reciente
              const localDate = new Date(localRecord.fecha_actualizacion || localRecord.updated_at);
              const remoteDate = new Date(remoteRecord.fecha_actualizacion || remoteRecord.updated_at);
              
              if (remoteDate > localDate) {
                // El remoto es más reciente, actualizar local
                await localDB.update(table, remoteRecord);
              }
            } else {
              // No existe localmente, insertar
              await localDB.add(table, remoteRecord);
            }
          } catch (error) {
            console.error(`Error fusionando registro en ${table}:`, error);
          }
        }
      }
    }
  }

  // Mostrar indicador de sincronización
  showSyncIndicator(show) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    if (show) {
      indicator.style.display = 'block';
      indicator.innerHTML = `
        <div class="sync-indicator-content">
          <div class="spinner-small"></div>
          <span>Sincronizando...</span>
        </div>
      `;
    } else {
      indicator.style.display = 'none';
    }
  }

  // Mostrar resultados de sincronización
  showSyncResults(results) {
    const total = results.success.length + results.failed.length + results.conflicts.length;
    
    if (total === 0) return;

    // Crear notificación toast
    const toast = document.createElement('div');
    toast.className = `toast fade-in ${results.failed.length > 0 ? 'toast-warning' : 'toast-success'}`;
    toast.innerHTML = `
      <div class="toast-header">
        <i class="bi bi-arrow-repeat me-2"></i>
        <strong class="me-auto">Sincronización completada</strong>
        <small>${new Date().toLocaleTimeString()}</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        <p>✅ ${results.success.length} exitosos</p>
        ${results.failed.length > 0 ? `<p>❌ ${results.failed.length} fallidos</p>` : ''}
        ${results.conflicts.length > 0 ? `<p>⚠️ ${results.conflicts.length} conflictos</p>` : ''}
        ${results.failed.length > 0 ? 
          '<p class="small text-muted">Los cambios fallados se reintentarán automáticamente.</p>' : ''}
      </div>
    `;

    const container = document.getElementById('toasts-container');
    if (container) {
      container.appendChild(toast);
      
      // Auto-eliminar después de 5 segundos
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 5000);
    }

    // Actualizar tiempo de última sincronización
    this.updateLastSyncTime();
  }

  // Mostrar error de sincronización
  showSyncError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast fade-in toast-error';
    toast.innerHTML = `
      <div class="toast-header">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong class="me-auto">Error de sincronización</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        <p>${message}</p>
        <p class="small">Los cambios se guardaron localmente y se sincronizarán cuando se restablezca la conexión.</p>
      </div>
    `;

    const container = document.getElementById('toasts-container');
    if (container) {
      container.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 8000);
    }
  }

  // Mostrar notificación de conflicto
  showConflictNotification(syncItem, conflict) {
    const toast = document.createElement('div');
    toast.className = 'toast fade-in toast-warning';
    toast.innerHTML = `
      <div class="toast-header">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong class="me-auto">Conflicto detectado</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        <p>Hay un conflicto en ${syncItem.table} (ID: ${syncItem.record_id})</p>
        <p class="small">Los datos fueron modificados tanto localmente como en el servidor.</p>
        <div class="mt-2">
          <button class="btn btn-sm btn-primary me-2" onclick="syncManager.resolveConflictNow('${syncItem.id}')">
            Resolver ahora
          </button>
          <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="toast">
            Más tarde
          </button>
        </div>
      </div>
    `;

    const container = document.getElementById('toasts-container');
    if (container) {
      container.appendChild(toast);
    }
  }

  // Actualizar tiempo de última sincronización en la UI
  updateLastSyncTime() {
    const lastSyncElement = document.getElementById('last-sync-time');
    if (!lastSyncElement || !this.lastSync) return;

    const lastSyncDate = new Date(this.lastSync);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSyncDate) / (1000 * 60));

    let timeText;
    if (diffMinutes < 1) {
      timeText = 'Hace unos segundos';
    } else if (diffMinutes < 60) {
      timeText = `Hace ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      timeText = `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    } else {
      timeText = lastSyncDate.toLocaleDateString();
    }

    lastSyncElement.textContent = `Última sincronización: ${timeText}`;
    lastSyncElement.title = `Sincronizado el: ${lastSyncDate.toLocaleString()}`;
  }

  // Sincronizar manualmente
  async syncNow() {
    if (!this.isOnline) {
      this.showToast('No hay conexión a internet', 'error');
      return;
    }

    if (this.isSyncing) {
      this.showToast('Sincronización en curso...', 'info');
      return;
    }

    this.showToast('Iniciando sincronización manual...', 'info');
    await this.syncPendingChanges();
  }

  // Forzar sincronización completa
  async forceFullSync() {
    if (!this.isOnline) {
      throw new Error('No hay conexión a internet');
    }

    console.log('🔄 Forzando sincronización completa...');
    
    // 1. Subir todos los datos locales
    const localData = await localDB.exportToJSON();
    const uploadResult = await supabaseManager.syncLocalData(localData);
    
    if (!uploadResult.success) {
      throw new Error('Error al subir datos locales');
    }

    // 2. Descargar todos los datos remotos
    await this.pullChangesFromSupabase();

    // 3. Limpiar cola de sincronización
    const pendingItems = await localDB.getPendingSyncItems(1000);
    for (const item of pendingItems) {
      await localDB.markSyncItemProcessed(item.id);
    }

    console.log('✅ Sincronización completa finalizada');
    this.showToast('Sincronización completa completada', 'success');
  }

  // Mostrar toast genérico
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const typeClass = {
      'success': 'toast-success',
      'error': 'toast-error',
      'warning': 'toast-warning',
      'info': 'toast-info'
    }[type] || 'toast-info';

    const icon = {
      'success': 'bi-check-circle',
      'error': 'bi-exclamation-triangle',
      'warning': 'bi-exclamation-circle',
      'info': 'bi-info-circle'
    }[type] || 'bi-info-circle';

    toast.className = `toast fade-in ${typeClass}`;
    toast.innerHTML = `
      <div class="toast-header">
        <i class="bi ${icon} me-2"></i>
        <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    `;

    const container = document.getElementById('toasts-container');
    if (container) {
      container.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 3000);
    }
  }

  // Obtener estado de sincronización
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSync: this.lastSync,
      config: this.config,
      retryCount: this.retryCount
    };
  }

  // Actualizar configuración
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Reiniciar sincronización automática si la configuración cambió
    if (this.config.autoSync && this.isOnline) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }
}

// Exportar instancia única
const syncManager = new SyncManager();
window.syncManager = syncManager;

export { syncManager };