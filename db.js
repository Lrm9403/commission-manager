// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 4; // Versión incrementada para forzar actualización
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('❌ Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('✅ IndexedDB inicializada correctamente');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('🔄 Actualizando estructura de IndexedDB...');

        // Tabla de usuarios
        if (!db.objectStoreNames.contains('usuarios')) {
          const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
          userStore.createIndex('auth_id', 'auth_id', { unique: false }); // Cambiado a unique: false
          userStore.createIndex('email', 'email', { unique: false }); // Cambiado a unique: false
          userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false }); // Cambiado a unique: false
        }

        // Tabla de empresas
        if (!db.objectStoreNames.contains('empresas')) {
          const companyStore = db.createObjectStore('empresas', { keyPath: 'id' });
          companyStore.createIndex('usuario_id', 'usuario_id', { unique: false });
          companyStore.createIndex('nombre', 'nombre', { unique: false });
          companyStore.createIndex('estado', 'estado', { unique: false });
        }

        // Tabla de contratos
        if (!db.objectStoreNames.contains('contratos')) {
          const contractStore = db.createObjectStore('contratos', { keyPath: 'id' });
          contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false }); // Cambiado a unique: false
          contractStore.createIndex('estado', 'estado', { unique: false });
          contractStore.createIndex('fecha_creacion', 'fecha_creacion', { unique: false });
        }

        // Tabla de suplementos
        if (!db.objectStoreNames.contains('suplementos')) {
          const supplementStore = db.createObjectStore('suplementos', { keyPath: 'id' });
          supplementStore.createIndex('contrato_id', 'contrato_id', { unique: false });
          supplementStore.createIndex('fecha_suplemento', 'fecha_suplemento', { unique: false });
        }

        // Tabla de certificaciones
        if (!db.objectStoreNames.contains('certificaciones')) {
          const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id' });
          certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
          certificationStore.createIndex('mes', 'mes', { unique: false });
          certificationStore.createIndex('contrato_mes', ['contrato_id', 'mes'], { unique: false }); // Cambiado a unique: false
          certificationStore.createIndex('pagado', 'pagado', { unique: false });
        }

        // Tabla de pagos
        if (!db.objectStoreNames.contains('pagos')) {
          const paymentStore = db.createObjectStore('pagos', { keyPath: 'id' });
          paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
          paymentStore.createIndex('tipo', 'tipo', { unique: false });
        }

        // Tabla de distribución de pagos
        if (!db.objectStoreNames.contains('pagos_distribucion')) {
          const distributionStore = db.createObjectStore('pagos_distribucion', { keyPath: 'id' });
          distributionStore.createIndex('pago_id', 'pago_id', { unique: false });
          distributionStore.createIndex('contrato_id', 'contrato_id', { unique: false });
        }

        // ✅ TABLA DE SINCRONIZACIÓN CORREGIDA
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          syncStore.createIndex('estado', 'estado', { unique: false });
          syncStore.createIndex('tabla', 'tabla', { unique: false });
          syncStore.createIndex('fecha_creacion', 'fecha_creacion', { unique: false });
        }

        // Tabla de configuración
        if (!db.objectStoreNames.contains('configuracion')) {
          const configStore = db.createObjectStore('configuracion', { keyPath: 'key' });
        }

        // Tabla de conflictos
        if (!db.objectStoreNames.contains('conflictos')) {
          const conflictStore = db.createObjectStore('conflictos', { keyPath: 'id' });
          conflictStore.createIndex('resuelto', 'resuelto', { unique: false });
        }

        // Tabla de backups
        if (!db.objectStoreNames.contains('backups')) {
          const backupStore = db.createObjectStore('backups', { keyPath: 'id' });
          backupStore.createIndex('fecha', 'fecha', { unique: false });
        }

        console.log('✅ Estructura de IndexedDB creada/actualizada');
      };
    });

    return this.initPromise;
  }

  // Métodos CRUD genéricos
  async add(storeName, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async get(storeName, id) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getAll(storeName, indexName = null, query = null) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      let request;
      if (indexName && query !== undefined) {
        const index = store.index(indexName);
        const keyRange = IDBKeyRange.only(query);
        request = index.getAll(keyRange);
      } else if (indexName) {
        const index = store.index(indexName);
        request = index.getAll();
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async update(storeName, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async delete(storeName, id) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getByIndex(storeName, indexName, key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getAllByIndex(storeName, indexName, key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const keyRange = IDBKeyRange.only(key);
      const request = index.getAll(keyRange);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // ✅ MÉTODO CORREGIDO PARA OBTENER ITEMS DE SINCRONIZACIÓN PENDIENTES
  async getPendingSyncItems(limit = 50) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sync_queue'], 'readonly');
      const store = transaction.objectStore('sync_queue');
      
      // Obtener todos los items
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result || [];
        
        // Filtrar manualmente items pendientes (estado = 'pendiente')
        const pendingItems = items.filter(item => item.estado === 'pendiente');
        
        // Ordenar por fecha_creacion (más antiguos primero)
        pendingItems.sort((a, b) => {
          const dateA = new Date(a.fecha_creacion || 0);
          const dateB = new Date(b.fecha_creacion || 0);
          return dateA - dateB;
        });
        
        // Limitar cantidad
        resolve(pendingItems.slice(0, limit));
      };

      request.onerror = (event) => {
        console.error('Error al obtener items de sincronización:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ✅ MÉTODO CORREGIDO PARA AGREGAR A LA COLA DE SINCRONIZACIÓN
  async addToSyncQueue(action, table, recordId, data) {
    const syncItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action: action, // 'INSERT', 'UPDATE', 'DELETE'
      table: table,
      record_id: recordId,
      data: data,
      estado: 'pendiente', // 'pendiente', 'procesando', 'completado', 'error'
      intentos: 0,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    return this.add('sync_queue', syncItem);
  }

  // ✅ MÉTODO CORREGIDO PARA MARCAR ITEM COMO PROCESADO
  async markSyncItemProcessed(syncId, success = true, error = null) {
    const item = await this.get('sync_queue', syncId);
    if (item) {
      item.estado = success ? 'completado' : 'error';
      item.intentos += 1;
      item.error = error;
      item.fecha_actualizacion = new Date().toISOString();
      await this.update('sync_queue', item);
    }
  }

  async incrementSyncAttempts(syncId) {
    const item = await this.get('sync_queue', syncId);
    if (item) {
      item.intentos += 1;
      item.fecha_actualizacion = new Date().toISOString();
      await this.update('sync_queue', item);
    }
  }

  async cleanupOldSyncItems(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const allItems = await this.getAll('sync_queue');
    const oldItems = allItems.filter(item => {
      const itemDate = new Date(item.fecha_creacion);
      return itemDate < cutoffDate && item.estado === 'completado';
    });

    let deletedCount = 0;
    for (const item of oldItems) {
      try {
        await this.delete('sync_queue', item.id);
        deletedCount++;
      } catch (error) {
        console.error('Error eliminando item antiguo:', error);
      }
    }

    console.log(`🗑️ Limpiados ${deletedCount} items de sincronización antiguos`);
    return deletedCount;
  }

  async getStats() {
    const stores = [
      'usuarios', 'empresas', 'contratos', 'suplementos', 
      'certificaciones', 'pagos', 'sync_queue', 'configuracion'
    ];

    const stats = {};
    let totalItems = 0;
    
    for (const storeName of stores) {
      try {
        const items = await this.getAll(storeName);
        const count = items ? items.length : 0;
        stats[storeName] = count;
        totalItems += count;
      } catch (error) {
        stats[storeName] = 0;
      }
    }

    stats.total = totalItems;
    stats.lastUpdated = new Date().toISOString();
    
    return stats;
  }

  async exportToJSON() {
    await this.init();
    
    const exportData = {};
    const storeNames = Array.from(this.db.objectStoreNames);
    
    for (const storeName of storeNames) {
      try {
        exportData[storeName] = await this.getAll(storeName);
      } catch (error) {
        console.error(`Error al exportar ${storeName}:`, error);
        exportData[storeName] = [];
      }
    }

    // Agregar metadatos
    exportData._metadata = {
      exportDate: new Date().toISOString(),
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      totalStores: storeNames.length,
      appVersion: '2.0.0'
    };

    return exportData;
  }

  async importFromJSON(jsonData) {
    await this.init();
    
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error('Datos JSON inválidos');
    }

    const storeNames = Array.from(this.db.objectStoreNames);
    let importedCount = 0;
    let errorCount = 0;

    for (const storeName of storeNames) {
      if (jsonData[storeName] && Array.isArray(jsonData[storeName])) {
        const items = jsonData[storeName];
        
        for (const item of items) {
          try {
            // Verificar si el item ya existe
            const existing = await this.get(storeName, item.id);
            if (existing) {
              await this.update(storeName, item);
            } else {
              await this.add(storeName, item);
            }
            importedCount++;
          } catch (error) {
            console.error(`Error al importar item en ${storeName}:`, error);
            errorCount++;
          }
        }
      }
    }

    return {
      success: errorCount === 0,
      imported: importedCount,
      errors: errorCount,
      totalStores: storeNames.length
    };
  }

  async autoBackup() {
    try {
      const backupData = await this.exportToJSON();
      const backupKey = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      
      // Guardar backup en localStorage como fallback
      const backupString = JSON.stringify(backupData);
      if (backupString.length < 5 * 1024 * 1024) { // 5MB limit
        localStorage.setItem(backupKey, backupString);
      }
      
      // También guardar en IndexedDB
      await this.add('backups', {
        id: backupKey,
        data: backupData,
        fecha: new Date().toISOString(),
        size: backupString.length
      });

      // Mantener solo los últimos 5 backups
      const backupKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('backup_'))
        .sort()
        .reverse();
      
      if (backupKeys.length > 5) {
        for (let i = 5; i < backupKeys.length; i++) {
          localStorage.removeItem(backupKeys[i]);
        }
      }

      console.log(`✅ Backup automático realizado: ${backupKey}`);
      return {
        success: true,
        key: backupKey,
        date: new Date().toISOString(),
        itemCount: Object.values(backupData).reduce((sum, arr) => sum + (arr.length || 0), 0)
      };
    } catch (error) {
      console.error('Error en backup automático:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async restoreFromBackup(backupKey) {
    try {
      let backupData;
      
      // Intentar desde localStorage primero
      const localStorageData = localStorage.getItem(backupKey);
      if (localStorageData) {
        backupData = JSON.parse(localStorageData);
      } else {
        // Intentar desde IndexedDB
        const backupRecord = await this.get('backups', backupKey);
        if (!backupRecord) {
          throw new Error(`Backup ${backupKey} no encontrado`);
        }
        backupData = backupRecord.data;
      }

      const result = await this.importFromJSON(backupData);

      console.log(`✅ Restauración completada desde ${backupKey}`);
      return {
        success: true,
        backupKey: backupKey,
        ...result
      };
    } catch (error) {
      console.error('Error en restauración:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cleanupOldData(days = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let cleanedCount = 0;
    const storesToClean = ['certificaciones', 'pagos'];

    for (const storeName of storesToClean) {
      try {
        const items = await this.getAll(storeName);
        const oldItems = items.filter(item => {
          const itemDate = new Date(item.fecha_creacion || item.fecha_pago || item.mes || 0);
          return itemDate < cutoffDate;
        });

        for (const item of oldItems) {
          await this.delete(storeName, item.id);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error al limpiar ${storeName}:`, error);
      }
    }

    console.log(`🗑️ Limpiados ${cleanedCount} registros antiguos`);
    return cleanedCount;
  }

  async migrateFromLocalStorage() {
    try {
      const legacyData = localStorage.getItem('commissionManagerData');
      if (!legacyData) {
        return { success: true, migrated: 0, message: 'No hay datos legacy para migrar' };
      }

      const parsedData = JSON.parse(legacyData);
      let migratedCount = 0;

      // Mapear datos legacy
      if (parsedData.empresas) {
        for (const empresa of parsedData.empresas) {
          try {
            await this.add('empresas', {
              id: empresa.id || `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              ...empresa,
              fecha_creacion: new Date().toISOString(),
              fecha_actualizacion: new Date().toISOString()
            });
            migratedCount++;
          } catch (error) {
            console.error('Error migrando empresa:', error);
          }
        }
      }

      // Limpiar datos legacy después de migrar
      localStorage.removeItem('commissionManagerData');

      return {
        success: true,
        migrated: migratedCount,
        message: `Migrados ${migratedCount} registros desde localStorage`
      };
    } catch (error) {
      console.error('Error en migración:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkIntegrity() {
    const issues = [];
    const storeNames = Array.from(this.db.objectStoreNames);

    for (const storeName of storeNames) {
      try {
        const count = (await this.getAll(storeName)).length;
        console.log(`✓ ${storeName}: ${count} registros`);
      } catch (error) {
        issues.push({
          store: storeName,
          error: error.message
        });
        console.error(`✗ ${storeName}: Error - ${error.message}`);
      }
    }

    return {
      status: issues.length === 0 ? 'OK' : 'ISSUES',
      stores: storeNames.length,
      issues: issues,
      timestamp: new Date().toISOString()
    };
  }

  async resetDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onsuccess = () => {
        console.log('Base de datos eliminada');
        this.db = null;
        this.initPromise = null;
        resolve(true);
      };

      request.onerror = (event) => {
        console.error('Error al eliminar base de datos:', event.target.error);
        reject(event.target.error);
      };

      request.onblocked = () => {
        console.warn('Base de datos bloqueada para eliminación');
        reject(new Error('Base de datos bloqueada. Cierre todas las pestañas y reintente.'));
      };
    });
  }

  // Métodos específicos para la aplicación
  async getUserByEmail(email) {
    return this.getByIndex('usuarios', 'email', email);
  }

  async getEmpresasByUsuario(usuarioId) {
    return this.getAllByIndex('empresas', 'usuario_id', usuarioId);
  }

  async getContratosByEmpresa(empresaId) {
    return this.getAllByIndex('contratos', 'empresa_id', empresaId);
  }

  async getCertificacionesByContrato(contratoId) {
    return this.getAllByIndex('certificaciones', 'contrato_id', contratoId);
  }

  async getPagosByEmpresa(empresaId) {
    return this.getAllByIndex('pagos', 'empresa_id', empresaId);
  }

  async getConfig(key) {
    const config = await this.get('configuracion', key);
    return config ? config.value : null;
  }

  async setConfig(key, value) {
    await this.update('configuracion', {
      key: key,
      value: value,
      updated: new Date().toISOString()
    });
  }
}

// Crear instancia única
const localDB = new LocalDatabase();

// Hacer disponible globalmente
window.localDB = localDB;

// Inicializar automáticamente cuando se importa
localDB.init().catch(console.error);

export { localDB };
