// Base de datos local IndexedDB - Commission Manager Pro
class LocalDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'CommissionManagerDB';
    this.dbVersion = 1;
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
        console.log('🔄 Creando estructura de IndexedDB...');

        // Crear todas las tablas si no existen
        if (!db.objectStoreNames.contains('usuarios')) {
          const userStore = db.createObjectStore('usuarios', { keyPath: 'id' });
          userStore.createIndex('auth_id', 'auth_id', { unique: true });
          userStore.createIndex('email', 'email', { unique: false });
          userStore.createIndex('nombre_usuario', 'nombre_usuario', { unique: false });
        }

        if (!db.objectStoreNames.contains('empresas')) {
          const companyStore = db.createObjectStore('empresas', { keyPath: 'id', autoIncrement: true });
          companyStore.createIndex('auth_id', 'auth_id', { unique: false });
          companyStore.createIndex('nombre', 'nombre', { unique: false });
          companyStore.createIndex('estado', 'estado', { unique: false });
        }

        if (!db.objectStoreNames.contains('contratos')) {
          const contractStore = db.createObjectStore('contratos', { keyPath: 'id', autoIncrement: true });
          contractStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          contractStore.createIndex('numero_contrato', 'numero_contrato', { unique: false });
          contractStore.createIndex('estado', 'estado', { unique: false });
        }

        if (!db.objectStoreNames.contains('certificaciones')) {
          const certificationStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
          certificationStore.createIndex('contrato_id', 'contrato_id', { unique: false });
          certificationStore.createIndex('mes', 'mes', { unique: false });
          certificationStore.createIndex('pagado', 'pagado', { unique: false });
        }

        if (!db.objectStoreNames.contains('pagos')) {
          const paymentStore = db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
          paymentStore.createIndex('empresa_id', 'empresa_id', { unique: false });
          paymentStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
          paymentStore.createIndex('tipo', 'tipo', { unique: false });
        }

        if (!db.objectStoreNames.contains('configuracion')) {
          db.createObjectStore('configuracion', { keyPath: 'key' });
        }

        console.log('✅ Estructura de IndexedDB creada');
      };
    });

    return this.initPromise;
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.db;
  }

  // Métodos básicos CRUD
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

  async add(storeName, data) {
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // No pasar ID si es autoincrement
      delete data.id;
      
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
          id: id // Asegurar que el ID se mantenga
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

  async getContratosByEmpresa(empresaId) {
    return this.getAllByIndex('contratos', 'empresa_id', empresaId);
  }

  async getCertificacionesByContrato(contratoId) {
    return this.getAllByIndex('certificaciones', 'contrato_id', contratoId);
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
    await this.add('configuracion', {
      key: key,
      value: value,
      updated: new Date().toISOString()
    });
  }
}

// Crear y exportar instancia única
const localDB = new LocalDatabase();

// Hacer disponible globalmente
window.localDB = localDB;

export { localDB };
