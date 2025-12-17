// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 6;
    this.initPromise = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      console.log('🔧 Inicializando IndexedDB...');
      
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('❌ Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
        this.initPromise = null;
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isInitialized = true;
        console.log('✅ IndexedDB inicializada correctamente');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('🔄 Actualizando estructura de IndexedDB...');

        // Crear o recrear todas las tablas
        this.createObjectStores(db);
        
        console.log('✅ Estructura de IndexedDB creada/actualizada');
      };
    });

    return this.initPromise;
  }

  createObjectStores(db) {
    // Eliminar store existente si tiene problema de índice único
    if (db.objectStoreNames.contains('usuarios')) {
      db.deleteObjectStore('usuarios');
    }
    
    // Tabla de usuarios (con índice UNIQUE corregido)
    const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
    userStore.createIndex('auth_id', 'auth_id', { unique: true });
    userStore.createIndex('email', 'email', { unique: true }); // Este será único
    userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false });

    // Tabla de empresas
    if (!db.objectStoreNames.contains('empresas')) {
      const companyStore = db.createObjectStore('empresas', { keyPath: 'id', autoIncrement: true });
      companyStore.createIndex('auth_id', 'auth_id', { unique: false });
      companyStore.createIndex('nombre', 'nombre', { unique: false });
      companyStore.createIndex('estado', 'estado', { unique: false });
    } else {
      // Actualizar store existente
      const companyStore = db.transaction.objectStore('empresas');
      try { companyStore.createIndex('auth_id', 'auth_id', { unique: false }); } catch(e) {}
      try { companyStore.createIndex('nombre', 'nombre', { unique: false }); } catch(e) {}
      try { companyStore.createIndex('estado', 'estado', { unique: false }); } catch(e) {}
    }

    // Tabla de contratos
    if (!db.objectStoreNames.contains('contratos')) {
      const contractStore = db.createObjectStore('contratos', { keyPath: 'id', autoIncrement: true });
      contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false });
      contractStore.createIndex('estado', 'estado', { unique: false });
      contractStore.createIndex('fecha_creacion', 'fecha_creacion', { unique: false });
    }

    // Tabla de suplementos
    if (!db.objectStoreNames.contains('suplementos')) {
      const supplementStore = db.createObjectStore('suplementos', { keyPath: 'id', autoIncrement: true });
      supplementStore.createIndex('contrato_id', 'contrato_id', { unique: false });
      supplementStore.createIndex('fecha_suplemento', 'fecha_suplemento', { unique: false });
    }

    // Tabla de certificaciones
    if (!db.objectStoreNames.contains('certificaciones')) {
      const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
      certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
      certificationStore.createIndex('mes', 'mes', { unique: false });
      certificationStore.createIndex('pagado', 'pagado', { unique: false });
    }

    // Tabla de pagos
    if (!db.objectStoreNames.contains('pagos')) {
      const paymentStore = db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
      paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
      paymentStore.createIndex('tipo', 'tipo', { unique: false });
    }

    // Tabla de distribución de pagos
    if (!db.objectStoreNames.contains('pagos_distribucion')) {
      const distributionStore = db.createObjectStore('pagos_distribucion', { keyPath: 'id', autoIncrement: true });
      distributionStore.createIndex('pago_id', 'pago_id', { unique: false });
      distributionStore.createIndex('contrato_id', 'contrato_id', { unique: false });
    }

    // Tabla de sincronización
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
      const conflictStore = db.createObjectStore('conflictos', { keyPath: 'id', autoIncrement: true });
      conflictStore.createIndex('resuelto', 'resuelto', { unique: false });
    }

    // Tabla de backups
    if (!db.objectStoreNames.contains('backups')) {
      const backupStore = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      backupStore.createIndex('fecha', 'fecha', { unique: false });
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.db;
  }

  // Método set (insertar o actualizar)
  async set(storeName, data) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Verificar si el objeto tiene ID
      if (!data.id) {
        if (store.keyPath && typeof store.keyPath === 'string') {
          // Generar ID automáticamente si la store tiene autoIncrement
          delete data.id;
        } else {
          data.id = this.generateUUID();
        }
      }
      
      // Usamos put que hace insert o update automáticamente
      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`✅ Datos guardados en ${storeName}:`, data.id || 'nuevo registro');
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        console.error(`❌ Error guardando en ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async get(storeName, id) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getAll(storeName) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async add(storeName, data) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // No pasar ID si es autoincrement
      if (store.keyPath && typeof store.keyPath === 'string' && data[store.keyPath] === undefined) {
        delete data.id;
      }
      
      const request = store.add(data);

      request.onsuccess = () => {
        console.log(`✅ Datos agregados a ${storeName}:`, data);
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        console.error(`❌ Error agregando a ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async update(storeName, id, data) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Primero obtener el registro existente
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        if (!existingData) {
          reject(new Error('Registro no encontrado'));
          return;
        }
        
        // Combinar con datos nuevos
        const updatedData = {
          ...existingData,
          ...data,
          id: id, // Asegurar que el ID se mantenga
          updated_at: new Date().toISOString()
        };
        
        // Actualizar
        const putRequest = store.put(updatedData);
        
        putRequest.onsuccess = () => {
          console.log(`✅ Datos actualizados en ${storeName}:`, id);
          resolve(updatedData);
        };
        
        putRequest.onerror = (event) => {
          console.error(`❌ Error actualizando en ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      };
      
      getRequest.onerror = (event) => {
        console.error(`❌ Error obteniendo registro de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async delete(storeName, id) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`✅ Registro eliminado de ${storeName}:`, id);
        resolve(true);
      };
      
      request.onerror = (event) => {
        console.error(`❌ Error eliminando de ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getByIndex(storeName, indexName, key) {
    await this.ensureInitialized();
    
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
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(key);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Métodos específicos para la aplicación
  async getUserByAuthId(authId) {
    return this.getByIndex('usuarios', 'auth_id', authId);
  }

  async getUserByEmail(email) {
    return this.getByIndex('usuarios', 'email', email);
  }

  async getEmpresasByAuthId(authId) {
    return this.getAllByIndex('empresas', 'auth_id', authId);
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
    await this.set('configuracion', {
      key: key,
      value: value,
      updated: new Date().toISOString()
    });
  }

  // Métodos de sincronización
  async addToSyncQueue(action, table, recordId, data) {
    const syncItem = {
      action: action,
      table: table,
      record_id: recordId,
      data: data,
      estado: 'pendiente',
      intentos: 0,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    return this.add('sync_queue', syncItem);
  }

  async getPendingSyncItems() {
    const allItems = await this.getAll('sync_queue');
    return allItems.filter(item => item.estado === 'pendiente');
  }

  // Métodos de backup y utilidades
  async exportToJSON() {
    await this.ensureInitialized();
    
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

    exportData._metadata = {
      exportDate: new Date().toISOString(),
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      appVersion: '2.0.0'
    };

    return exportData;
  }

  async resetDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onsuccess = () => {
        console.log('Base de datos eliminada');
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
        resolve(true);
      };

      request.onerror = (event) => {
        console.error('Error al eliminar base de datos:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async checkIntegrity() {
    await this.ensureInitialized();
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
      issues: issues
    };
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async saveOrUpdateUser(userData) {
    try {
      // Primero verificar si ya existe un usuario con el mismo email
      const existingUser = await this.getUserByEmail(userData.email);
      
      if (existingUser) {
        // Actualizar usuario existente
        return await this.set('usuarios', {
          ...existingUser,
          ...userData,
          updated_at: new Date().toISOString()
        });
      } else {
        // Crear nuevo usuario
        return await this.add('usuarios', {
          ...userData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error guardando/actualizando usuario:', error);
      throw error;
    }
  }
}

// Crear y exportar instancia única
const localDB = new LocalDatabase();

// Hacer disponible globalmente
window.localDB = localDB;

export { localDB };
