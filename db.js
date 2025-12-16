// Configuración de IndexedDB para almacenamiento local
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 1;
    this.initPromise = null;
  }

  // Inicializar la base de datos
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error al abrir IndexedDB:', event.target.error);
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

        // Crear store para usuarios
        if (!db.objectStoreNames.contains('usuarios')) {
          const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
          userStore.createIndex('email', 'email', { unique: true });
          userStore.createIndex('username', 'username', { unique: true });
        }

        // Crear store para empresas
        if (!db.objectStoreNames.contains('empresas')) {
          const companyStore = db.createObjectStore('empresas', { keyPath: 'id' });
          companyStore.createIndex('usuario_id', 'usuario_id', { unique: false });
          companyStore.createIndex('nombre', 'nombre', { unique: false });
        }

        // Crear store para contratos
        if (!db.objectStoreNames.contains('contratos')) {
          const contractStore = db.createObjectStore('contratos', { keyPath: 'id' });
          contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: true });
          contractStore.createIndex('estado', 'estado', { unique: false });
        }

        // Crear store para suplementos
        if (!db.objectStoreNames.contains('suplementos')) {
          const supplementStore = db.createObjectStore('suplementos', { keyPath: 'id' });
          supplementStore.createIndex('contrato_id', 'contrato_id', { unique: false });
        }

        // Crear store para certificaciones
        if (!db.objectStoreNames.contains('certificaciones')) {
          const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id' });
          certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
          certificationStore.createIndex('mes', 'mes', { unique: false });
          certificationStore.createIndex('contrato_mes', ['contrato_id', 'mes'], { unique: true });
        }

        // Crear store para pagos
        if (!db.objectStoreNames.contains('pagos')) {
          const paymentStore = db.createObjectStore('pagos', { keyPath: 'id' });
          paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
          paymentStore.createIndex('tipo', 'tipo', { unique: false });
        }

        // Crear store para distribución de pagos
        if (!db.objectStoreNames.contains('pagos_distribucion')) {
          const distributionStore = db.createObjectStore('pagos_distribucion', { keyPath: 'id' });
          distributionStore.createIndex('pago_id', 'pago_id', { unique: false });
          distributionStore.createIndex('contrato_id', 'contrato_id', { unique: false });
        }

        // Crear store para cola de sincronización
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          syncStore.createIndex('procesado', 'procesado', { unique: false });
          syncStore.createIndex('tabla', 'tabla', { unique: false });
          syncStore.createIndex('fecha_creacion', 'fecha_creacion', { unique: false });
        }

        // Crear store para configuración
        if (!db.objectStoreNames.contains('configuracion')) {
          const configStore = db.createObjectStore('configuracion', { keyPath: 'key' });
        }

        console.log('✅ Estructura de IndexedDB creada');
      };
    });

    return this.initPromise;
  }

  // Método genérico para agregar un registro
  async add(storeName, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al agregar en ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método genérico para obtener un registro por ID
  async get(storeName, id) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al obtener de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método genérico para obtener todos los registros
  async getAll(storeName, indexName = null, query = null) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      let request;
      if (indexName) {
        const index = store.index(indexName);
        request = index.getAll(query);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al obtener todos de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método genérico para actualizar un registro
  async update(storeName, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al actualizar en ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método genérico para eliminar un registro
  async delete(storeName, id) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        console.error(`Error al eliminar de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método para obtener registros por índice y rango
  async getByIndex(storeName, indexName, key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al obtener por índice de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método para obtener todos los registros por índice
  async getAllByIndex(storeName, indexName, key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error(`Error al obtener todos por índice de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método para agregar a la cola de sincronización
  async addToSyncQueue(action, table, recordId, data) {
    const syncItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      action: action, // 'INSERT', 'UPDATE', 'DELETE'
      table: table,
      record_id: recordId,
      data: data,
      intentos: 0,
      procesado: false,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    return this.add('sync_queue', syncItem);
  }

  // Método para obtener cambios pendientes de sincronización
  async getPendingSyncItems(limit = 50) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sync_queue'], 'readonly');
      const store = transaction.objectStore('sync_queue');
      const index = store.index('procesado');
      
      // Obtener items no procesados, ordenados por fecha
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => {
        const items = request.result;
        // Ordenar por fecha_creacion (más antiguos primero)
        items.sort((a, b) => new Date(a.fecha_creacion) - new Date(b.fecha_creacion));
        // Limitar cantidad
        resolve(items.slice(0, limit));
      };

      request.onerror = (event) => {
        console.error('Error al obtener items de sincronización pendientes:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Método para marcar item de sincronización como procesado
  async markSyncItemProcessed(syncId) {
    const item = await this.get('sync_queue', syncId);
    if (item) {
      item.procesado = true;
      item.fecha_actualizacion = new Date().toISOString();
      await this.update('sync_queue', item);
    }
  }

  // Método para incrementar intentos de sincronización
  async incrementSyncAttempts(syncId) {
    const item = await this.get('sync_queue', syncId);
    if (item) {
      item.intentos += 1;
      item.fecha_actualizacion = new Date().toISOString();
      await this.update('sync_queue', item);
    }
  }

  // Método para limpiar items de sincronización procesados (más de 7 días)
  async cleanupOldSyncItems() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const allItems = await this.getAll('sync_queue');
    const oldProcessedItems = allItems.filter(item => 
      item.procesado && new Date(item.fecha_creacion) < sevenDaysAgo
    );

    for (const item of oldProcessedItems) {
      await this.delete('sync_queue', item.id);
    }

    console.log(`🗑️ Limpiados ${oldProcessedItems.length} items de sincronización antiguos`);
  }

  // Método para obtener estadísticas de la base de datos
  async getStats() {
    const stores = [
      'usuarios', 'empresas', 'contratos', 
      'suplementos', 'certificaciones', 'pagos',
      'sync_queue'
    ];

    const stats = {};
    
    for (const storeName of stores) {
      try {
        const items = await this.getAll(storeName);
        stats[storeName] = items ? items.length : 0;
      } catch (error) {
        stats[storeName] = 0;
      }
    }

    return stats;
  }

  // Método para exportar toda la base de datos a JSON
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
    exportData.metadata = {
      exportDate: new Date().toISOString(),
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      totalStores: storeNames.length
    };

    return exportData;
  }

  // Método para importar datos desde JSON
  async importFromJSON(jsonData) {
    await this.init();
    
    // Validar estructura básica
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
      success: true,
      imported: importedCount,
      errors: errorCount,
      totalStores: storeNames.length
    };
  }

  // Método para realizar backup automático
  async autoBackup() {
    try {
      const backupData = await this.exportToJSON();
      const backupKey = `backup_${new Date().toISOString().split('T')[0]}`;
      
      // Guardar backup en localStorage como fallback
      localStorage.setItem(backupKey, JSON.stringify(backupData));
      
      // Mantener solo los últimos 7 backups
      const backupKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('backup_'))
        .sort()
        .reverse();
      
      if (backupKeys.length > 7) {
        for (let i = 7; i < backupKeys.length; i++) {
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

  // Método para restaurar desde backup
  async restoreFromBackup(backupKey) {
    try {
      const backupData = localStorage.getItem(backupKey);
      if (!backupData) {
        throw new Error(`Backup ${backupKey} no encontrado`);
      }

      const parsedData = JSON.parse(backupData);
      const result = await this.importFromJSON(parsedData);

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

  // Método para limpiar datos antiguos (más de 1 año)
  async cleanupOldData() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    let cleanedCount = 0;
    const storesToClean = ['certificaciones', 'pagos'];

    for (const storeName of storesToClean) {
      try {
        const items = await this.getAll(storeName);
        const oldItems = items.filter(item => {
          const itemDate = new Date(item.fecha_creacion || item.fecha_pago || item.mes);
          return itemDate < oneYearAgo;
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

  // Método para migrar desde localStorage (si existe)
  async migrateFromLocalStorage() {
    try {
      const legacyData = localStorage.getItem('commissionManagerData');
      if (!legacyData) {
        return { success: true, migrated: 0, message: 'No hay datos legacy para migrar' };
      }

      const parsedData = JSON.parse(legacyData);
      let migratedCount = 0;

      // Mapear datos legacy a la nueva estructura
      if (parsedData.empresas) {
        for (const empresa of parsedData.empresas) {
          try {
            await this.add('empresas', {
              id: empresa.id || `legacy_${Date.now()}_${Math.random()}`,
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

  // Método para verificar integridad de la base de datos
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

  // Método para resetear la base de datos (solo en desarrollo)
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
}

// Exportar instancia única
const localDB = new LocalDatabase();
window.localDB = localDB; // Para acceso global

export { localDB };