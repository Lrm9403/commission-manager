// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 3; // Incrementar versión
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    console.log('🔧 Inicializando IndexedDB (v' + this.dbVersion + ')...');
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('❌ Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isInitialized = true;
        console.log('✅ IndexedDB inicializada correctamente');
        console.log('📊 Tablas disponibles:', Array.from(this.db.objectStoreNames));
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 EVENTO onupgradeneeded EJECUTÁNDOSE!');
        console.log('📊 Actualizando de v' + event.oldVersion + ' a v' + event.newVersion);
        
        const db = event.target.result;
        
        // Crear todas las tablas
        this.createAllTables(db);
      };
    });
  }

  createAllTables(db) {
    // 1. Tabla usuarios
    if (!db.objectStoreNames.contains('usuarios')) {
      console.log('📝 Creando tabla: usuarios');
      const userStore = db.createObjectStore('usuarios', { keyPath: 'id', autoIncrement: true });
      userStore.createIndex('auth_id', 'auth_id', { unique: true });
      userStore.createIndex('email', 'email', { unique: false });
      userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false });
    }

    // 2. Tabla empresas
    if (!db.objectStoreNames.contains('empresas')) {
      console.log('📝 Creando tabla: empresas');
      const companyStore = db.createObjectStore('empresas', { keyPath: 'id', autoIncrement: true });
      companyStore.createIndex('auth_id', 'auth_id', { unique: false });
      companyStore.createIndex('nombre', 'nombre', { unique: false });
      companyStore.createIndex('estado', 'estado', { unique: false });
    }

    // 3. Tabla contratos
    if (!db.objectStoreNames.contains('contratos')) {
      console.log('📝 Creando tabla: contratos');
      const contractStore = db.createObjectStore('contratos', { keyPath: 'id', autoIncrement: true });
      contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false });
      contractStore.createIndex('estado', 'estado', { unique: false });
    }

    // 4. Tabla certificaciones
    if (!db.objectStoreNames.contains('certificaciones')) {
      console.log('📝 Creando tabla: certificaciones');
      const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
      certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
      certificationStore.createIndex('mes', 'mes', { unique: false });
      certificationStore.createIndex('pagado', 'pagado', { unique: false });
    }

    // 5. Tabla pagos
    if (!db.objectStoreNames.contains('pagos')) {
      console.log('📝 Creando tabla: pagos');
      const paymentStore = db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
      paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
      paymentStore.createIndex('tipo', 'tipo', { unique: false });
    }

    // 6. Tabla configuracion
    if (!db.objectStoreNames.contains('configuracion')) {
      console.log('📝 Creando tabla: configuracion');
      db.createObjectStore('configuracion', { keyPath: 'key' });
    }
    
    console.log('✅ Todas las tablas creadas/verificadas');
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.db;
  }

  // Métodos básicos CRUD
  async getAll(storeName) {
    try {
      await this.ensureInitialized();
      
      console.log('📊 Ejecutando getAll para:', storeName);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const result = request.result || [];
          console.log(`✅ getAll(${storeName}): ${result.length} registros`);
          resolve(result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error en getAll(${storeName}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error crítico en getAll(${storeName}):`, error);
      return [];
    }
  }

  async get(storeName, key) {
    try {
      await this.ensureInitialized();
      
      console.log(`📊 Ejecutando get para: ${storeName}, key:`, key);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          console.log(`✅ get(${storeName}, ${key}):`, request.result);
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error en get(${storeName}, ${key}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error en get(${storeName}, ${key}):`, error);
      return null;
    }
  }

  async add(storeName, data) {
    try {
      await this.ensureInitialized();
      
      console.log(`➕ add(${storeName}):`, data);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        // Añadir timestamps
        const enhancedData = {
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sync_status: 'pending'
        };
        
        // Eliminar id si existe (autoincrement)
        delete enhancedData.id;
        
        const request = store.add(enhancedData);

        request.onsuccess = (event) => {
          console.log(`✅ add(${storeName}) exitoso. ID: ${event.target.result}`);
          resolve(event.target.result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error en add(${storeName}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error crítico en add(${storeName}):`, error);
      return null;
    }
  }

  async update(storeName, id, data) {
    try {
      await this.ensureInitialized();
      
      console.log(`✏️ update(${storeName}, ${id}):`, data);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        // Obtener primero
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (!existing) {
            reject(new Error('Registro no encontrado'));
            return;
          }
          
          const updatedData = {
            ...existing,
            ...data,
            id: id,
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
          };
          
          const putRequest = store.put(updatedData);
          
          putRequest.onsuccess = () => {
            console.log(`✅ update(${storeName}, ${id}) exitoso`);
            resolve(updatedData);
          };
          
          putRequest.onerror = (event) => {
            console.error(`❌ Error en update(${storeName}, ${id}):`, event.target.error);
            reject(event.target.error);
          };
        };
        
        getRequest.onerror = (event) => {
          console.error(`❌ Error obteniendo registro en update(${storeName}, ${id}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error en update(${storeName}, ${id}):`, error);
      return null;
    }
  }

  async delete(storeName, id) {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error(`❌ Error en delete(${storeName}, ${id}):`, error);
      return false;
    }
  }

  // Métodos específicos para usuarios
  async getUserByAuthId(authId) {
    try {
      await this.ensureInitialized();
      
      console.log('👤 Buscando usuario con auth_id:', authId);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['usuarios'], 'readonly');
        const store = transaction.objectStore('usuarios');
        const index = store.index('auth_id');
        const request = index.get(authId);

        request.onsuccess = () => {
          console.log('✅ Usuario encontrado:', request.result);
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error('❌ Error en getUserByAuthId:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('❌ Error en getUserByAuthId:', error);
      return null;
    }
  }

  async saveUser(userData) {
    try {
      await this.ensureInitialized();
      
      console.log('💾 Guardando usuario:', userData);
      
      // Buscar si ya existe
      const existing = await this.getUserByAuthId(userData.auth_id);
      
      if (existing) {
        console.log('🔄 Actualizando usuario existente');
        return await this.update('usuarios', existing.id, userData);
      } else {
        console.log('🆕 Creando nuevo usuario');
        return await this.add('usuarios', userData);
      }
    } catch (error) {
      console.error('❌ Error en saveUser:', error);
      return null;
    }
  }

  // Métodos de configuración CORREGIDOS
  async getConfig(key) {
    try {
      await this.ensureInitialized();
      
      console.log('⚙️ Obteniendo configuración:', key);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['configuracion'], 'readonly');
        const store = transaction.objectStore('configuracion');
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          console.log(`✅ Configuración "${key}":`, result ? result.value : 'null');
          resolve(result ? result.value : null);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error obteniendo configuración "${key}":`, event.target.error);
          resolve(null); // Devolver null en lugar de rechazar
        };
      });
    } catch (error) {
      console.error(`❌ Error en getConfig("${key}"):`, error);
      return null;
    }
  }

  async setConfig(key, value) {
    try {
      await this.ensureInitialized();
      
      console.log(`⚙️ Guardando configuración: ${key} =`, value);
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['configuracion'], 'readwrite');
        const store = transaction.objectStore('configuracion');
        
        // Primero verificar si existe
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          const configData = {
            key: key,
            value: value,
            updated_at: new Date().toISOString()
          };
          
          let request;
          if (existing) {
            // Actualizar existente
            request = store.put(configData);
          } else {
            // Crear nuevo
            request = store.add(configData);
          }
          
          request.onsuccess = () => {
            console.log(`✅ Configuración "${key}" guardada`);
            resolve(true);
          };
          
          request.onerror = (event) => {
            console.error(`❌ Error guardando configuración "${key}":`, event.target.error);
            reject(event.target.error);
          };
        };
        
        getRequest.onerror = (event) => {
          console.error(`❌ Error verificando configuración "${key}":`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error en setConfig("${key}"):`, error);
      return false;
    }
  }

  // Método set para compatibilidad
  async set(storeName, key, value) {
    if (storeName === 'configuracion') {
      return await this.setConfig(key, value);
    }
    return false;
  }

  // Métodos específicos de la aplicación
  async getEmpresas() {
    const empresas = await this.getAll('empresas');
    console.log('🏢 Empresas obtenidas:', empresas.length);
    return empresas;
  }

  async getContratos() {
    return this.getAll('contratos');
  }

  async getCertificaciones() {
    return this.getAll('certificaciones');
  }

  async getPagos() {
    return this.getAll('pagos');
  }

  async getContratosByEmpresa(empresaId) {
    return this.getAllByIndex('contratos', 'empresa_id', empresaId);
  }

  async getCertificacionesByContrato(contratoId) {
    return this.getAllByIndex('certificaciones', 'contrato_id', contratoId);
  }

  async getAllByIndex(storeName, indexName, key) {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(key);

        request.onsuccess = () => {
          const result = request.result || [];
          console.log(`📊 Obtenidos ${result.length} registros de ${storeName} por ${indexName}=${key}`);
          resolve(result);
        };
        
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error(`❌ Error en getAllByIndex(${storeName}, ${indexName}, ${key}):`, error);
      return [];
    }
  }

  // Método para limpiar todos los datos (solo para desarrollo)
  async clearAllData() {
    try {
      await this.ensureInitialized();
      
      const storeNames = Array.from(this.db.objectStoreNames);
      console.log('🧹 Limpiando datos de:', storeNames);
      
      for (const storeName of storeNames) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        await store.clear();
        console.log(`✅ Datos limpiados de: ${storeName}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error limpiando datos:', error);
      return false;
    }
  }
}

// Crear y exportar instancia única
const localDB = new LocalDatabase();

// Hacer disponible globalmente
window.localDB = localDB;

// Método de ayuda para debugging
window.debugLocalDB = async function() {
  console.log('🔍 DEBUG LocalDB:');
  console.log('isInitialized:', localDB.isInitialized);
  if (localDB.db) {
    console.log('Tablas:', Array.from(localDB.db.objectStoreNames));
    
    // Mostrar datos de cada tabla
    const tables = ['usuarios', 'empresas', 'contratos', 'certificaciones', 'pagos', 'configuracion'];
    for (const table of tables) {
      if (localDB.db.objectStoreNames.contains(table)) {
        const data = await localDB.getAll(table);
        console.log(`📊 ${table}:`, data);
      }
    }
  }
};

export { localDB };
