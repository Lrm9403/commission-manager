// Integración con Supabase - Commission Manager Pro
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = 'https://axpgwncduujxficolgyt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGd3bmNkdXVqeGZpY29sZ3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDU0NDgsImV4cCI6MjA4MTQ4MTQ0OH0.jCuEskTd5JJt7C_iS7_GzMwA7wOnGHQsT0tFzVLm9CE';

// Crear cliente con configuración optimizada
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'supabase.auth.token'
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  }
});

class SupabaseManager {
  constructor() {
    this.supabase = supabase;
    this.user = null;
    this.session = null;
    this.profile = null;
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    
    // Inicializar listeners de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    console.log('🔧 Supabase Manager creado');
  }
  
async getLocalProfile(userId) {
  try {
    await this.ensureLocalDB();
    const user = await this.localDB.getUserByAuthId(userId);
    
    if (user) {
      console.log('👤 Perfil local encontrado:', user);
      return user;
    } else {
      console.log('👤 No se encontró perfil local');
      return null;
    }
  } catch (error) {
    console.warn('⚠️ Error obteniendo perfil local:', error);
    return null;
  }
}

async createInitialProfile(authId, email, name) {
  try {
    await this.ensureLocalDB();
    
    const profileData = {
      auth_id: authId,
      email: email,
      nombre: name || email.split('@')[0],
      nombre_usuario: email.split('@')[0],
      config_tema: 'light',
      config_moneda: 'USD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const result = await this.localDB.saveUser(profileData);
    
    if (result) {
      console.log('✅ Perfil inicial creado:', profileData);
      return profileData;
    } else {
      console.error('❌ Error al crear perfil inicial');
      throw new Error('No se pudo crear el perfil');
    }
  } catch (error) {
    console.error('❌ Error creando perfil inicial:', error);
    throw error;
  }
}
  
  async init() {
    if (this.isInitialized) {
      console.log('✅ Supabase Manager ya inicializado');
      return;
    }

    console.log('🔧 Inicializando Supabase Manager...');
    
    try {
      // Esperar a que IndexedDB se inicialice si es necesario
      if (typeof localDB === 'undefined' && typeof window.localDB !== 'undefined') {
        await window.localDB.init();
      }

      // Restaurar sesión
      await this.restoreSession();
      
      // Verificar conexión
      await this.checkConnection();
      
      this.isInitialized = true;
      console.log('✅ Supabase Manager inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando Supabase Manager:', error);
      throw error;
    }
  }

  async ensureLocalDB() {
    // Esperar a que localDB esté disponible
    if (!window.localDB) {
      console.warn('⚠️ localDB no disponible, esperando...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!window.localDB) {
        throw new Error('localDB no disponible después de esperar');
      }
    }
    
    // Asegurar que esté inicializado
    if (window.localDB.init) {
      await window.localDB.init();
    }
    
    return window.localDB;
  }

  async restoreSession() {
    try {
      console.log('🔑 Restaurando sesión...');
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
      }
      
      if (session) {
        this.session = session;
        this.user = session.user;
        console.log('✅ Sesión restaurada:', this.user.email);
        
        // Verificar si el email está confirmado
        if (this.user.email_confirmed_at) {
          console.log('✅ Email confirmado');
          // Cargar perfil
          await this.loadProfile();
        } else {
          console.log('⚠️ Email pendiente de confirmación');
          // Mostrar notificación si hay app
          if (window.app && window.app.showToast) {
            window.app.showToast('Por favor confirma tu email', 'warning');
          }
        }
        
        return session;
      } else {
        console.log('ℹ️ No hay sesión activa');
        return null;
      }
    } catch (error) {
      console.error('Error restaurando sesión:', error);
      return null;
    }
  }

  async loadProfile() {
    if (!this.user) {
      console.warn('⚠️ No hay usuario para cargar perfil');
      return null;
    }
    
    console.log('👤 Cargando perfil para usuario:', this.user.id);
    
    try {
      // Primero intentar desde local
      const localProfile = await this.getLocalProfile();
      if (localProfile) {
        this.profile = localProfile;
        console.log('✅ Perfil cargado desde local');
        return localProfile;
      }
      
      // Si no hay perfil local, crear uno básico
      console.log('📝 Creando perfil inicial...');
      return await this.createInitialProfile();
      
    } catch (error) {
      console.error('❌ Error crítico cargando perfil:', error);
      return await this.createEmergencyProfile();
    }
  }

  async getLocalProfile() {
    if (!this.user) return null;
    
    try {
      const localDB = await this.ensureLocalDB();
      const profile = await localDB.getUserByAuthId(this.user.id);
      
      if (profile) {
        console.log('📄 Perfil encontrado localmente:', profile.nombre);
        return profile;
      }
      
      console.log('📭 No se encontró perfil local');
      return null;
    } catch (error) {
      console.warn('⚠️ Error obteniendo perfil local:', error.message);
      return null;
    }
  }

  async createInitialProfile() {
    if (!this.user) return null;
    
    console.log('🆕 Creando perfil inicial para:', this.user.email);
    
    const profileData = {
      id: this.generateValidUUID(),
      auth_id: this.user.id,
      nombre: this.user.user_metadata?.nombre || this.user.email.split('@')[0],
      nombre_usuario: this.user.user_metadata?.nombre_usuario || this.user.email.split('@')[0],
      email: this.user.email,
      config_moneda: 'USD',
      config_tema: 'light',
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    try {
      const localDB = await this.ensureLocalDB();
      
      // Guardar localmente
      await localDB.set('usuarios', profileData);
      this.profile = profileData;
      
      console.log('✅ Perfil inicial creado:', profileData.nombre);
      return profileData;
    } catch (error) {
      console.error('❌ Error creando perfil inicial:', error);
      throw error; // Propagamos el error para que lo maneje loadProfile
    }
  }

  async createEmergencyProfile() {
    if (!this.user) return null;
    
    console.log('🆘 Creando perfil de emergencia');
    
    const emergencyProfile = {
      id: this.generateValidUUID(),
      auth_id: this.user.id,
      nombre: 'Usuario',
      nombre_usuario: 'usuario',
      email: this.user.email,
      config_moneda: 'USD',
      config_tema: 'light',
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };
    
    try {
      // Intentar guardar aunque localDB falle
      if (window.localDB && window.localDB.set) {
        try {
          await window.localDB.set('usuarios', emergencyProfile);
        } catch (dbError) {
          console.warn('No se pudo guardar perfil de emergencia en IndexedDB:', dbError);
        }
      }
      
      this.profile = emergencyProfile;
      console.log('✅ Perfil de emergencia creado');
      return emergencyProfile;
    } catch (error) {
      console.error('❌ Error crítico creando perfil de emergencia:', error);
      // Devolvemos el perfil de emergencia de todos modos
      this.profile = emergencyProfile;
      return emergencyProfile;
    }
  }

  async register(email, password, userData) {
    console.log('📝 Registrando usuario:', email);
    
    try {
      const redirectUrl = window.location.origin;
      
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: userData.nombre,
            nombre_usuario: userData.nombre_usuario
          },
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        console.error('Error en registro:', error);
        return {
          success: false,
          error: this.translateAuthError(error.message),
          code: error.code
        };
      }

      console.log('✅ Usuario registrado:', data.user?.email);
      
      if (data.user) {
        this.user = data.user;
        
        // Crear perfil local
        const tempProfile = {
          id: this.generateValidUUID(),
          auth_id: data.user.id,
          nombre: userData.nombre,
          nombre_usuario: userData.nombre_usuario,
          email: email,
          config_moneda: 'USD',
          config_tema: 'light',
          fecha_creacion: new Date().toISOString(),
          fecha_actualizacion: new Date().toISOString(),
          email_confirmado: false
        };
        
        try {
          const localDB = await this.ensureLocalDB();
          await localDB.set('usuarios', tempProfile);
        } catch (dbError) {
          console.warn('No se pudo guardar perfil temporal:', dbError);
        }
        
        this.profile = tempProfile;
        
        return {
          success: true,
          user: data.user,
          needsEmailVerification: true,
          message: 'Registro exitoso. Revisa tu email para confirmar tu cuenta.'
        };
      }

      return {
        success: false,
        error: 'No se pudo crear el usuario',
        needsEmailVerification: true
      };
    } catch (error) {
      console.error('Error en registro:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async login(email, password) {
    console.log('🔑 Iniciando sesión:', email);
    
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('Error en login:', error);
        return {
          success: false,
          error: this.translateAuthError(error.message),
          code: error.code
        };
      }

      this.user = data.user;
      this.session = data.session;
      
      console.log('✅ Sesión iniciada:', data.user.email);
      
      // Cargar perfil
      await this.loadProfile();
      
      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } catch (error) {
      console.error('Error en login:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async logout() {
    console.log('🚪 Cerrando sesión...');
    
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        console.error('Error en logout:', error);
        return {
          success: false,
          error: error.message
        };
      }

      this.user = null;
      this.session = null;
      this.profile = null;
      this.isInitialized = false;
      
      console.log('✅ Sesión cerrada');
      
      return { success: true };
    } catch (error) {
      console.error('Error en logout:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getEmpresas() {
    if (!this.user) {
      console.warn('⚠️ No hay usuario autenticado');
      return [];
    }
    
    try {
      const localDB = await this.ensureLocalDB();
      const empresas = await localDB.getEmpresasByAuthId(this.user.id);
      
      console.log(`📊 Empresas encontradas: ${empresas.length}`);
      return empresas;
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return [];
    }
  }

  async createEmpresa(empresaData) {
    console.log('🏢 Creando empresa:', empresaData.nombre);
    
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      // Generar ID único
      const empresaId = this.generateValidUUID();
      
      // Validar datos
      if (!empresaData.nombre || !empresaData.nombre.trim()) {
        return {
          success: false,
          error: 'El nombre de la empresa es requerido'
        };
      }

      const empresaCompleta = {
        id: empresaId,
        auth_id: this.user.id,
        nombre: empresaData.nombre.trim(),
        director: empresaData.director || '',
        descripcion: empresaData.descripcion || '',
        comision_default: empresaData.comision_default || 1.00,
        estado: empresaData.estado || 'activa',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Guardar localmente
      await localDB.set('empresas', empresaCompleta);
      
      console.log('✅ Empresa creada:', empresaCompleta.nombre);
      
      return {
        success: true,
        empresa: empresaCompleta,
        message: 'Empresa creada correctamente'
      };
    } catch (error) {
      console.error('❌ Error creando empresa:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido al crear empresa'
      };
    }
  }

  async updateEmpresa(empresaId, empresaData) {
    console.log('✏️ Actualizando empresa:', empresaId);
    
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const empresaActual = await localDB.get('empresas', empresaId);
      if (!empresaActual) {
        return {
          success: false,
          error: 'Empresa no encontrada'
        };
      }

      if (empresaActual.auth_id !== this.user.id) {
        return {
          success: false,
          error: 'No tienes permiso para modificar esta empresa'
        };
      }

      const updatedData = {
        ...empresaActual,
        ...empresaData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar nombre
      if (updatedData.nombre && !updatedData.nombre.trim()) {
        return {
          success: false,
          error: 'El nombre de la empresa es requerido'
        };
      }

      // Actualizar localmente
      await localDB.set('empresas', updatedData);

      console.log('✅ Empresa actualizada:', updatedData.nombre);
      
      return {
        success: true,
        empresa: updatedData,
        message: 'Empresa actualizada correctamente'
      };
    } catch (error) {
      console.error('Error actualizando empresa:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteEmpresa(empresaId) {
    console.log('🗑️ Eliminando empresa:', empresaId);
    
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const empresaActual = await localDB.get('empresas', empresaId);
      if (!empresaActual) {
        return {
          success: false,
          error: 'Empresa no encontrada'
        };
      }

      if (empresaActual.auth_id !== this.user.id) {
        return {
          success: false,
          error: 'No tienes permiso para eliminar esta empresa'
        };
      }

      // Verificar si hay contratos asociados
      const contratos = await localDB.getContratosByEmpresa(empresaId);
      if (contratos.length > 0) {
        return {
          success: false,
          error: 'No se puede eliminar la empresa porque tiene contratos asociados'
        };
      }

      // Eliminar localmente
      await localDB.delete('empresas', empresaId);

      console.log('✅ Empresa eliminada');
      
      return {
        success: true,
        message: 'Empresa eliminada correctamente'
      };
    } catch (error) {
      console.error('Error eliminando empresa:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // CONTRATOS
  async createContrato(contratoData) {
    console.log('📄 Creando contrato');
    
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const contratoId = this.generateValidUUID();
      
      const contratoCompleto = {
        id: contratoId,
        ...contratoData,
        estado: contratoData.estado || 'activo',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar campos requeridos
      const requiredFields = ['empresa_id', 'numero_contrato', 'nombre', 'monto_base'];
      const missingFields = requiredFields.filter(field => !contratoCompleto[field]);
      
      if (missingFields.length > 0) {
        return {
          success: false,
          error: `Faltan campos requeridos: ${missingFields.join(', ')}`
        };
      }

      // Guardar localmente
      await localDB.set('contratos', contratoCompleto);

      console.log('✅ Contrato creado:', contratoCompleto.nombre);
      
      return {
        success: true,
        contrato: contratoCompleto,
        message: 'Contrato creado correctamente'
      };
    } catch (error) {
      console.error('Error creando contrato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getContratosByEmpresa(empresaId) {
    try {
      const localDB = await this.ensureLocalDB();
      const contratos = await localDB.getContratosByEmpresa(empresaId);
      return contratos;
    } catch (error) {
      console.error('Error obteniendo contratos:', error);
      return [];
    }
  }

  // CERTIFICACIONES
  async createCertificacion(certificacionData) {
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const certificacionId = this.generateValidUUID();
      
      // Calcular comisión automáticamente
      const porcentaje = certificacionData.porcentaje_comision || 1.00;
      const comisionCalculada = (certificacionData.monto_certificado * porcentaje) / 100;
      
      const certificacionCompleta = {
        id: certificacionId,
        ...certificacionData,
        porcentaje_comision: porcentaje,
        comision_calculada: comisionCalculada,
        comision_editada: certificacionData.comision_editada || comisionCalculada,
        pagado: certificacionData.pagado || false,
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar campos requeridos
      if (!certificacionCompleta.contrato_id || !certificacionCompleta.mes || !certificacionCompleta.monto_certificado) {
        return {
          success: false,
          error: 'Faltan campos requeridos: contrato, mes y monto certificado'
        };
      }

      // Guardar localmente
      await localDB.set('certificaciones', certificacionCompleta);

      return {
        success: true,
        certificacion: certificacionCompleta,
        message: 'Certificación creada correctamente'
      };
    } catch (error) {
      console.error('Error creando certificación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getCertificacionesByContrato(contratoId) {
    try {
      const localDB = await this.ensureLocalDB();
      const certificaciones = await localDB.getCertificacionesByContrato(contratoId);
      return certificaciones;
    } catch (error) {
      console.error('Error obteniendo certificaciones:', error);
      return [];
    }
  }

  // PAGOS
  async createPago(pagoData) {
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const pagoId = this.generateValidUUID();
      
      const pagoCompleto = {
        id: pagoId,
        ...pagoData,
        fecha_creacion: new Date().toISOString()
      };

      // Validar campos requeridos
      if (!pagoCompleto.empresa_id || !pagoCompleto.tipo || !pagoCompleto.monto_total || !pagoCompleto.fecha_pago) {
        return {
          success: false,
          error: 'Faltan campos requeridos: empresa, tipo, monto total y fecha de pago'
        };
      }

      // Guardar localmente
      await localDB.set('pagos', pagoCompleto);

      return {
        success: true,
        pago: pagoCompleto,
        message: 'Pago registrado correctamente'
      };
    } catch (error) {
      console.error('Error creando pago:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getPagosByEmpresa(empresaId) {
    try {
      const localDB = await this.ensureLocalDB();
      const pagos = await localDB.getPagosByEmpresa(empresaId);
      return pagos;
    } catch (error) {
      console.error('Error obteniendo pagos:', error);
      return [];
    }
  }

  // SINCRONIZACIÓN
  async syncData() {
    if (!this.isOnline) {
      return {
        success: false,
        error: 'Sin conexión a internet'
      };
    }

    if (!this.user?.email_confirmed_at) {
      return {
        success: false,
        error: 'Email no confirmado. Confirma tu email para sincronizar.'
      };
    }

    console.log('🔄 Iniciando sincronización de datos...');
    
    try {
      const localDB = await this.ensureLocalDB();
      const pendingItems = await localDB.getPendingSyncItems();
      
      if (pendingItems.length === 0) {
        return {
          success: true,
          message: 'No hay cambios pendientes para sincronizar',
          synced: 0
        };
      }

      let successCount = 0;
      let errorCount = 0;
      
      for (const item of pendingItems) {
        try {
          // Procesar cada item
          let result;
          const dataForSupabase = { ...item.data };
          
          // Para empresas, usar auth_id
          if (item.table === 'empresas') {
            dataForSupabase.auth_id = this.user.id;
          }

          switch (item.action) {
            case 'INSERT':
              result = await this.supabase
                .from(item.table)
                .insert([dataForSupabase]);
              break;
              
            case 'UPDATE':
              result = await this.supabase
                .from(item.table)
                .update(dataForSupabase)
                .eq('id', dataForSupabase.id);
              break;
              
            case 'DELETE':
              result = await this.supabase
                .from(item.table)
                .delete()
                .eq('id', item.record_id);
              break;
          }

          if (result.error) {
            throw result.error;
          }

          // Eliminar de la cola
          await localDB.delete('sync_queue', item.id);
          successCount++;
          
        } catch (error) {
          console.error(`Error sincronizando ${item.table}:`, error);
          
          // Incrementar intentos
          const updatedItem = {
            ...item,
            intentos: (item.intentos || 0) + 1,
            fecha_actualizacion: new Date().toISOString()
          };
          
          if (updatedItem.intentos >= 3) {
            await localDB.delete('sync_queue', item.id);
          } else {
            await localDB.set('sync_queue', updatedItem);
          }
          
          errorCount++;
        }
      }

      console.log(`✅ Sincronización completada: ${successCount} exitosos, ${errorCount} fallidos`);
      
      return {
        success: errorCount === 0,
        synced: successCount,
        errors: errorCount,
        message: `Sincronizados ${successCount} cambios`
      };
      
    } catch (error) {
      console.error('Error en sincronización:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // UTILIDADES
  generateValidUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  translateAuthError(errorMessage) {
    const translations = {
      'Invalid login credentials': 'Credenciales inválidas',
      'Email not confirmed': 'Email no confirmado. Por favor verifica tu email.',
      'User already registered': 'Usuario ya registrado',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      'Invalid email': 'Email inválido',
      'User not found': 'Usuario no encontrado'
    };
    
    return translations[errorMessage] || errorMessage;
  }

  async checkConnection() {
    try {
      const startTime = Date.now();
      
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('count', { count: 'exact', head: true })
        .limit(1);

      const latency = Date.now() - startTime;
      
      if (error) {
        this.isOnline = false;
        return {
          connected: false,
          error: error.message,
          latency
        };
      }

      this.isOnline = true;
      return {
        connected: true,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.isOnline = false;
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async handleOnline() {
    console.log('🌐 Conexión restablecida');
    this.isOnline = true;
    
    // Sincronizar si el email está confirmado
    if (this.user?.email_confirmed_at) {
      setTimeout(async () => {
        try {
          await this.syncData();
        } catch (error) {
          console.error('Error en sincronización automática:', error);
        }
      }, 2000);
    }
  }

  async handleOffline() {
    console.log('📴 Sin conexión');
    this.isOnline = false;
  }

  // Métodos de utilidad
  isAuthenticated() {
    return !!this.user;
  }

  getUserId() {
    return this.user?.id;
  }

  getUserEmail() {
    return this.user?.email;
  }

  getSession() {
    return this.session;
  }

  async getUserProfile() {
    return this.profile;
  }

  async updateProfile(profileData) {
    if (!this.user || !this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const localDB = await this.ensureLocalDB();
      
      const updatedData = {
        ...this.profile,
        ...profileData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Actualizar localmente
      await localDB.set('usuarios', updatedData);
      this.profile = updatedData;
      
      // Aplicar tema inmediatamente
      if (profileData.config_tema) {
        document.documentElement.setAttribute('data-theme', profileData.config_tema);
      }

      return {
        success: true,
        profile: this.profile,
        message: 'Perfil actualizado'
      };
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async resendConfirmationEmail(email) {
    try {
      const redirectUrl = window.location.origin;
      
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      return { 
        success: true,
        message: 'Se ha reenviado el email de confirmación'
      };
    } catch (error) {
      console.error('Error reenviando email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async resetPassword(email) {
    try {
      const redirectUrl = window.location.origin;
      
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Se han enviado las instrucciones para restablecer tu contraseña'
      };
    } catch (error) {
      console.error('Error restableciendo contraseña:', error);
      return {
        success: false,
        error: this.translateAuthError(error.message)
      };
    }
  }

  async updatePassword(newPassword) {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Contraseña actualizada correctamente'
      };
    } catch (error) {
      console.error('Error actualizando contraseña:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async deleteAccount() {
    try {
      const { error } = await this.supabase.auth.admin.deleteUser(this.user.id);
      
      if (error) throw error;
      
      await this.logout();
      
      return {
        success: true,
        message: 'Cuenta eliminada correctamente'
      };
    } catch (error) {
      console.error('Error eliminando cuenta:', error);
      return {
        success: false,
        error: 'No se pudo eliminar la cuenta'
      };
    }
  }
}

// Crear instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    supabaseManager.init().catch(console.error);
  }, 1000);
});

// Exportar
export { supabaseManager };
