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
    
    // Inicializar listeners de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Inicializar
    this.init();
  }

  async init() {
    console.log('🔧 Inicializando Supabase Manager...');
    
    try {
      // Asegurarse que localDB esté inicializado
      if (!window.localDB) {
        console.warn('⚠️ localDB no está disponible aún, esperando...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Restaurar sesión
      await this.restoreSession();
      
      // Verificar conexión
      await this.checkConnection();
      
      console.log('✅ Supabase Manager inicializado');
    } catch (error) {
      console.error('❌ Error inicializando Supabase Manager:', error);
    }
  }

  async restoreSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
      }
      
      if (session) {
        this.session = session;
        this.user = session.user;
        console.log('🔑 Sesión restaurada:', this.user.email);
        
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
      }
      
      return null;
    } catch (error) {
      console.error('Error restaurando sesión:', error);
      return null;
    }
  }

  async loadProfile() {
    if (!this.user) return null;
    
    try {
      // Primero intentar desde local
      const localProfile = await this.getLocalProfile();
      if (localProfile) {
        this.profile = localProfile;
        return localProfile;
      }
      
      // Si no hay perfil local, crear uno básico
      return await this.createInitialProfile();
      
    } catch (error) {
      console.error('Error crítico cargando perfil:', error);
      return await this.createEmergencyProfile();
    }
  }

  async getLocalProfile() {
    if (!this.user) return null;
    
    try {
      // Asegurarse que localDB esté inicializado
      if (!window.localDB || !window.localDB.getUserByAuthId) {
        console.warn('localDB no está disponible');
        return null;
      }
      
      // Buscar por auth_id
      return await window.localDB.getUserByAuthId(this.user.id);
    } catch (error) {
      console.warn('Error obteniendo perfil local:', error);
      return null;
    }
  }

  async createInitialProfile() {
    if (!this.user) return null;
    
    const profileData = {
      id: this.generateValidUUID(),
      auth_id: this.user.id,
      nombre: this.user.user_metadata?.nombre || 'Usuario',
      nombre_usuario: this.user.user_metadata?.nombre_usuario || this.user.email.split('@')[0],
      email: this.user.email,
      config_moneda: 'USD',
      config_tema: 'light',
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    try {
      // Asegurarse que localDB esté disponible
      if (!window.localDB || !window.localDB.set) {
        console.error('localDB no está disponible o no tiene método set');
        throw new Error('Base de datos local no disponible');
      }

      // Guardar localmente usando el método correcto
      await window.localDB.set('usuarios', profileData);
      this.profile = profileData;
      
      return profileData;
    } catch (error) {
      console.error('Error creando perfil inicial:', error);
      return await this.createEmergencyProfile();
    }
  }

  async createEmergencyProfile() {
    if (!this.user) return null;
    
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
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('usuarios', emergencyProfile);
      }
      this.profile = emergencyProfile;
      return emergencyProfile;
    } catch (error) {
      console.error('Error creando perfil de emergencia:', error);
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
        
        // Crear perfil local con UUID válido
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
        
        if (window.localDB && window.localDB.set) {
          await window.localDB.set('usuarios', tempProfile);
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
      
      // Cargar perfil (o crear si no existe)
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
    if (!this.user) return [];
    
    try {
      let empresas = [];
      
      // Asegurarse que localDB esté disponible
      if (window.localDB && window.localDB.getAllByIndex) {
        // Obtener locales usando auth_id
        empresas = await window.localDB.getAllByIndex('empresas', 'auth_id', this.user.id);
      }
      
      return empresas;
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return [];
    }
  }

  async createEmpresa(empresaData) {
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const empresaId = this.generateValidUUID();
      
      const empresaCompleta = {
        id: empresaId,
        auth_id: this.user.id,
        ...empresaData,
        estado: empresaData.estado || 'activa',
        comision_default: empresaData.comision_default || 1.00,
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar campos requeridos
      if (!empresaCompleta.nombre || !empresaCompleta.rut || !empresaCompleta.direccion) {
        return {
          success: false,
          error: 'Faltan campos requeridos: nombre, RUT y dirección'
        };
      }

      // Guardar localmente - usando el método correcto
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('empresas', empresaCompleta);
        console.log('✅ Empresa creada localmente:', empresaCompleta.nombre);
      } else {
        throw new Error('Base de datos local no disponible');
      }
      
      return {
        success: true,
        empresa: empresaCompleta,
        message: 'Empresa creada correctamente'
      };
    } catch (error) {
      console.error('Error creando empresa:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido al crear empresa'
      };
    }
  }

  async updateEmpresa(empresaId, empresaData) {
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      // Asegurarse que localDB esté disponible
      if (!window.localDB || !window.localDB.get || !window.localDB.set) {
        throw new Error('Base de datos local no disponible');
      }

      const empresaActual = await window.localDB.get('empresas', empresaId);
      if (!empresaActual || empresaActual.auth_id !== this.user.id) {
        return {
          success: false,
          error: 'Empresa no encontrada o no autorizada'
        };
      }

      const updatedData = {
        ...empresaActual,
        ...empresaData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Actualizar localmente
      await window.localDB.set('empresas', updatedData);

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
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      // Asegurarse que localDB esté disponible
      if (!window.localDB || !window.localDB.get || !window.localDB.delete) {
        throw new Error('Base de datos local no disponible');
      }

      const empresaActual = await window.localDB.get('empresas', empresaId);
      if (!empresaActual || empresaActual.auth_id !== this.user.id) {
        return {
          success: false,
          error: 'Empresa no encontrada o no autorizada'
        };
      }

      // 1. Verificar si hay contratos asociados
      const contratos = await window.localDB.getAllByIndex('contratos', 'empresa_id', empresaId);
      if (contratos.length > 0) {
        return {
          success: false,
          error: 'No se puede eliminar la empresa porque tiene contratos asociados'
        };
      }

      // 2. Eliminar localmente
      await window.localDB.delete('empresas', empresaId);

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
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const contratoId = this.generateValidUUID();
      
      const contratoCompleto = {
        id: contratoId,
        ...contratoData,
        estado: contratoData.estado || 'activo',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar campos requeridos
      if (!contratoCompleto.empresa_id || !contratoCompleto.numero_contrato || !contratoCompleto.nombre || !contratoCompleto.monto_base) {
        return {
          success: false,
          error: 'Faltan campos requeridos: empresa, número de contrato, nombre y monto base'
        };
      }

      // Guardar localmente
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('contratos', contratoCompleto);
      } else {
        throw new Error('Base de datos local no disponible');
      }

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
      if (window.localDB && window.localDB.getAllByIndex) {
        const contratos = await window.localDB.getAllByIndex('contratos', 'empresa_id', empresaId);
        return contratos;
      }
      return [];
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
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('certificaciones', certificacionCompleta);
      } else {
        throw new Error('Base de datos local no disponible');
      }

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
      if (window.localDB && window.localDB.getAllByIndex) {
        const certificaciones = await window.localDB.getAllByIndex('certificaciones', 'contrato_id', contratoId);
        return certificaciones;
      }
      return [];
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
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('pagos', pagoCompleto);
      } else {
        throw new Error('Base de datos local no disponible');
      }

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
      if (window.localDB && window.localDB.getAllByIndex) {
        const pagos = await window.localDB.getAllByIndex('pagos', 'empresa_id', empresaId);
        return pagos;
      }
      return [];
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
      if (!window.localDB || !window.localDB.getAll || !window.localDB.update || !window.localDB.delete) {
        throw new Error('Base de datos local no disponible');
      }

      const pendingItems = await window.localDB.getAll('sync_queue');
      
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
          await window.localDB.update('sync_queue', {
            ...item,
            estado: 'procesando',
            fecha_actualizacion: new Date().toISOString()
          });

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

          await window.localDB.delete('sync_queue', item.id);
          successCount++;
          
        } catch (error) {
          console.error(`Error sincronizando ${item.table}:`, error);
          
          if (item.intentos >= 3) {
            await window.localDB.delete('sync_queue', item.id);
          } else {
            await window.localDB.set('sync_queue', {
              ...item,
              intentos: (item.intentos || 0) + 1
            });
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
      'User not found': 'Usuario no encontrado',
      'For security purposes, you can only request this after 60 seconds': 'Por seguridad, debes esperar 60 segundos antes de intentar nuevamente'
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
      const updatedData = {
        ...this.profile,
        ...profileData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Actualizar localmente
      if (window.localDB && window.localDB.set) {
        await window.localDB.set('usuarios', updatedData);
        this.profile = updatedData;
      } else {
        throw new Error('Base de datos local no disponible');
      }
      
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
      // Primero eliminar todos los datos locales
      if (window.localDB && window.localDB.resetDatabase) {
        await window.localDB.resetDatabase();
      }
      
      // Luego eliminar cuenta en Supabase
      const { error } = await this.supabase.rpc('delete_user');
      
      if (error) throw error;

      return {
        success: true,
        message: 'Cuenta eliminada correctamente'
      };
    } catch (error) {
      console.error('Error eliminando cuenta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Crear instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

// Exportar
export { supabaseManager };
