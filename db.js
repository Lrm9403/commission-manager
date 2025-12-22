// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 2; // Incrementar versión para forzar creación de tablas
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    console.log('🔧 Inicializando IndexedDB...');
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('❌ Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isInitialized = true;
        console.log(`✅ IndexedDB inicializada correctamente (v${this.dbVersion})`);
        
        // Verificar que las tablas existen
        this.verifyTables().then(resolve).catch(reject);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log(`🔄 Actualizando DB de v${event.oldVersion} a v${event.newVersion}`);
        
        // Crear todas las tablas si no existen
        if (!db.objectStoreNames.contains('usuarios')) {
          try {
            const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
            userStore.createIndex('auth_id', 'auth_id', { unique: true });
            userStore.createIndex('email', 'email', { unique: false });
            userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false });
            console.log('✅ Tabla "usuarios" creada');
          } catch (e) {
            console.log('✅ Tabla "usuarios" ya existe');
          }
        }

        if (!db.objectStoreNames.contains('empresas')) {
          try {
            const companyStore = db.createObjectStore('empresas', { keyPath: 'id', autoIncrement: true });
            companyStore.createIndex('auth_id', 'auth_id', { unique: false });
            companyStore.createIndex('nombre', 'nombre', { unique: false });
            companyStore.createIndex('estado', 'estado', { unique: false });
            console.log('✅ Tabla "empresas" creada');
          } catch (e) {
            console.log('✅ Tabla "empresas" ya existe');
          }
        }

        if (!db.objectStoreNames.contains('contratos')) {
          try {
            const contractStore = db.createObjectStore('contratos', { keyPath: 'id', autoIncrement: true });
            contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
            contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false });
            contractStore.createIndex('estado', 'estado', { unique: false });
            console.log('✅ Tabla "contratos" creada');
          } catch (e) {
            console.log('✅ Tabla "contratos" ya existe');
          }
        }

        if (!db.objectStoreNames.contains('certificaciones')) {
          try {
            const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
            certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
            certificationStore.createIndex('mes', 'mes', { unique: false });
            certificationStore.createIndex('pagado', 'pagado', { unique: false });
            console.log('✅ Tabla "certificaciones" creada');
          } catch (e) {
            console.log('✅ Tabla "certificaciones" ya existe');
          }
        }

        if (!db.objectStoreNames.contains('pagos')) {
          try {
            const paymentStore = db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
            paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
            paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
            paymentStore.createIndex('tipo', 'tipo', { unique: false });
            console.log('✅ Tabla "pagos" creada');
          } catch (e) {
            console.log('✅ Tabla "pagos" ya existe');
          }
        }

        if (!db.objectStoreNames.contains('configuracion')) {
          try {
            db.createObjectStore('configuracion', { keyPath: 'key' });
            console.log('✅ Tabla "configuracion" creada');
          } catch (e) {
            console.log('✅ Tabla "configuracion" ya existe');
          }
        }
        
        console.log('✅ Estructura de IndexedDB verificada');
      };
    });
  }

  async verifyTables() {
    return new Promise((resolve, reject) => {
      console.log('📊 Verificando tablas disponibles:', Array.from(this.db.objectStoreNames));
      resolve();
    });
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
      
      // Verificar que la tabla existe
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return [];
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const result = request.result || [];
          console.log(`📊 Obtenidos ${result.length} registros de ${storeName}`);
          resolve(result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error obteniendo todos de ${storeName}:`, event.target.error);
          resolve([]); // Devolver array vacío en lugar de rechazar
        };
      });
    } catch (error) {
      console.error(`❌ Error en getAll(${storeName}):`, error);
      return [];
    }
  }

  async get(storeName, id) {
    try {
      await this.ensureInitialized();
      
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return null;
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
          console.error(`❌ Error obteniendo de ${storeName}:`, event.target.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error(`❌ Error en get(${storeName}, ${id}):`, error);
      return null;
    }
  }

  async add(storeName, data) {
    try {
      await this.ensureInitialized();
      
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return null;
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        // Generar timestamp
        const timestamp = new Date().toISOString();
        const enhancedData = {
          ...data,
          created_at: timestamp,
          updated_at: timestamp,
          sync_status: 'pending'
        };
        
        // No pasar ID si es autoincrement
        delete enhancedData.id;
        
        const request = store.add(enhancedData);

        request.onsuccess = () => {
          console.log(`✅ Datos agregados a ${storeName} con ID: ${request.result}`);
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error agregando a ${storeName}:`, event.target.error, enhancedData);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error en add(${storeName}):`, error, data);
      return null;
    }
  }

  async update(storeName, id, data) {
    try {
      await this.ensureInitialized();
      
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return null;
      }
      
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
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
          };
          
          // Actualizar
          const putRequest = store.put(updatedData);
          
          putRequest.onsuccess = () => {
            console.log(`✅ Datos actualizados en ${storeName} con ID: ${id}`);
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
    } catch (error) {
      console.error(`❌ Error en update(${storeName}, ${id}):`, error);
      return null;
    }
  }

  async delete(storeName, id) {
    try {
      await this.ensureInitialized();
      
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return false;
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => {
          console.log(`✅ Registro eliminado de ${storeName}: ${id}`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error eliminando de ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`❌ Error en delete(${storeName}, ${id}):`, error);
      return false;
    }
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
      
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.error(`❌ La tabla ${storeName} no existe`);
        return [];
      }
      
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
        
        request.onerror = (event) => {
          console.error(`❌ Error obteniendo por índice de ${storeName}:`, event.target.error);
          resolve([]);
        };
      });
    } catch (error) {
      console.error(`❌ Error en getAllByIndex(${storeName}, ${indexName}, ${key}):`, error);
      return [];
    }
  }

  // Métodos específicos para usuarios (para supabase.js)
  async getUserByAuthId(authId) {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        if (!this.db.objectStoreNames.contains('usuarios')) {
          resolve(null);
          return;
        }
        
        const transaction = this.db.transaction(['usuarios'], 'readonly');
        const store = transaction.objectStore('usuarios');
        const index = store.index('auth_id');
        const request = index.get(authId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
          console.error('❌ Error obteniendo usuario por auth_id:', event.target.error);
          resolve(null);
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
      
      // Verificar si el usuario ya existe
      const existingUser = await this.getUserByAuthId(userData.auth_id);
      
      if (existingUser) {
        // Actualizar usuario existente
        return await this.update('usuarios', existingUser.id, userData);
      } else {
        // Crear nuevo usuario
        return await this.add('usuarios', userData);
      }
    } catch (error) {
      console.error('❌ Error guardando usuario:', error);
      return null;
    }
  }

  // Método set para compatibilidad con supabase.js
  async set(storeName, key, value) {
    return this.setConfig(key, value);
  }

  // Métodos específicos para la aplicación
  async getEmpresas() {
    return this.getAll('empresas');
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

  async getConfig(key) {
    const config = await this.get('configuracion', key);
    return config ? config.value : null;
  }

  async setConfig(key, value) {
    const existing = await this.get('configuracion', key);
    
    if (existing) {
      await this.update('configuracion', key, { value: value });
    } else {
      await this.add('configuracion', {
        key: key,
        value: value
      });
    }
  }
}

// Crear y exportar instancia única
const localDB = new LocalDatabase();

// Hacer disponible globalmente
window.localDB = localDB;

export { localDB };
