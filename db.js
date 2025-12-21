// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    // Intentar detectar la versión actual
    this.dbVersion = 6; // Versión actual conocida
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      console.log('🔧 Inicializando IndexedDB...');
      
      // Primero, obtener la versión actual
      const request = indexedDB.open(this.dbName);
      
      request.onerror = (event) => {
        console.error('❌ Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const currentVersion = db.version;
        console.log(`📊 Versión actual de la DB: ${currentVersion}`);
        db.close();
        
        // Ahora abrir con la versión correcta
        this.openWithVersion(currentVersion, resolve, reject);
      };
    });
  }

  openWithVersion(version, resolve, reject) {
    const request = indexedDB.open(this.dbName, version);
    
    request.onerror = (event) => {
      console.error('❌ Error al abrir IndexedDB con versión:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      this.db = event.target.result;
      this.isInitialized = true;
      console.log(`✅ IndexedDB inicializada correctamente (v${version})`);
      resolve(this.db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      console.log(`🔄 Actualizando DB de v${oldVersion} a v${event.newVersion}`);
      
      // Si no existe la tabla de usuarios, crearla
      if (!db.objectStoreNames.contains('usuarios')) {
        const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
        userStore.createIndex('auth_id', 'auth_id', { unique: true });
        userStore.createIndex('email', 'email', { unique: false });
        userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false });
        console.log('✅ Tabla "usuarios" creada');
      }

      // Si no existe la tabla de empresas, crearla
      if (!db.objectStoreNames.contains('empresas')) {
        const companyStore = db.createObjectStore('empresas', { keyPath: 'id', autoIncrement: true });
        companyStore.createIndex('auth_id', 'auth_id', { unique: false });
        companyStore.createIndex('nombre', 'nombre', { unique: false });
        companyStore.createIndex('estado', 'estado', { unique: false });
        console.log('✅ Tabla "empresas" creada');
      }

      // Si no existe la tabla de contratos, crearla
      if (!db.objectStoreNames.contains('contratos')) {
        const contractStore = db.createObjectStore('contratos', { keyPath: 'id', autoIncrement: true });
        contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
        contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false });
        contractStore.createIndex('estado', 'estado', { unique: false });
        console.log('✅ Tabla "contratos" creada');
      }

      // Si no existe la tabla de certificaciones, crearla
      if (!db.objectStoreNames.contains('certificaciones')) {
        const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
        certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
        certificationStore.createIndex('mes', 'mes', { unique: false });
        certificationStore.createIndex('pagado', 'pagado', { unique: false });
        console.log('✅ Tabla "certificaciones" creada');
      }

      // Si no existe la tabla de pagos, crearla
      if (!db.objectStoreNames.contains('pagos')) {
        const paymentStore = db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
        paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
        paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
        paymentStore.createIndex('tipo', 'tipo', { unique: false });
        console.log('✅ Tabla "pagos" creada');
      }

      // Si no existe la tabla de configuración, crearla
      if (!db.objectStoreNames.contains('configuracion')) {
        db.createObjectStore('configuracion', { keyPath: 'key' });
        console.log('✅ Tabla "configuracion" creada');
      }
      
      console.log('✅ Estructura de IndexedDB actualizada');
    };
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
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          console.log(`📊 Obtenidos ${request.result?.length || 0} registros de ${storeName}`);
          resolve(request.result || []);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error obteniendo todos de ${storeName}:`, event.target.error);
          reject(event.target.error);
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
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error(`❌ Error en get(${storeName}, ${id}):`, error);
      return null;
    }
  }

  async add(storeName, data) {
    try {
      await this.ensureInitialized();
      
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
          console.log(`✅ Datos agregados a ${storeName} con ID: ${request.result}`, enhancedData);
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error(`❌ Error agregando a ${storeName}:`, event.target.error);
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
            console.log(`✅ Datos actualizados en ${storeName} con ID: ${id}`, updatedData);
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
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(key);

        request.onsuccess = () => {
          console.log(`📊 Obtenidos ${request.result?.length || 0} registros de ${storeName} por ${indexName}=${key}`);
          resolve(request.result || []);
        };
        
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error(`❌ Error en getAllByIndex(${storeName}, ${indexName}, ${key}):`, error);
      return [];
    }
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
