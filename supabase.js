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
        console.log('🔄 Sesión restaurada:', this.user.email);
        
        // Verificar si el email está confirmado
        if (this.user.email_confirmed_at) {
          console.log('✅ Email confirmado');
          // Cargar perfil
          await this.loadProfile();
        } else {
          console.log('📧 Email pendiente de confirmación');
          // Mostrar mensaje al usuario
          this.showEmailConfirmationWarning();
        }
        
        return session;
      }
      
      return null;
    } catch (error) {
      console.error('Error restaurando sesión:', error);
      return null;
    }
  }

  showEmailConfirmationWarning() {
    // Esta función será llamada desde la interfaz
    if (window.app && window.app.showToast) {
      window.app.showToast('Por favor confirma tu email para acceder a todas las funciones', 'warning');
    }
  }

  async loadProfile() {
    if (!this.user) return null;
    
    try {
      // Primero intentar desde Supabase
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', this.user.id)
        .maybeSingle();
      
      if (error) {
        console.warn('Error cargando perfil desde Supabase:', error.message);
        
        // Si es error 406 (Not Acceptable) u otro error, usar datos locales
        if (error.code === '406' || error.code === 'PGRST116' || error.code === 'PGRST204') {
          console.log('📱 Usando datos locales para perfil');
          return await this.getLocalProfile();
        }
        throw error;
      }
      
      if (data) {
        this.profile = data;
        
        // Sincronizar con local
        await localDB.update('usuarios', {
          ...data,
          fecha_actualizacion: new Date().toISOString()
        }).catch(() => {
          // Si falla, intentar agregar
          localDB.add('usuarios', {
            ...data,
            fecha_creacion: new Date().toISOString(),
            fecha_actualizacion: new Date().toISOString()
          });
        });
        
        return data;
      }
      
      // Si no hay datos en Supabase, crear perfil básico
      return await this.createInitialProfile();
      
    } catch (error) {
      console.error('Error crítico cargando perfil:', error);
      return await this.getLocalProfile();
    }
  }

  async getLocalProfile() {
    if (!this.user) return null;
    
    try {
      const localProfile = await localDB.getByIndex('usuarios', 'email', this.user.email);
      if (localProfile) {
        this.profile = localProfile;
        return localProfile;
      }
      
      // Crear perfil local básico
      const basicProfile = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        auth_id: this.user.id,
        nombre: this.user.user_metadata?.nombre || 'Usuario',
        nombre_usuario: this.user.user_metadata?.nombre_usuario || this.user.email.split('@')[0],
        email: this.user.email,
        config_moneda: 'USD',
        config_tema: 'auto',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };
      
      await localDB.add('usuarios', basicProfile);
      this.profile = basicProfile;
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'usuarios', basicProfile.id, basicProfile);
      
      return basicProfile;
    } catch (error) {
      console.error('Error obteniendo perfil local:', error);
      
      // Crear perfil de emergencia
      const emergencyProfile = {
        id: `emergency_${Date.now()}`,
        auth_id: this.user.id,
        nombre: 'Usuario',
        nombre_usuario: 'usuario',
        email: this.user.email,
        config_moneda: 'USD',
        config_tema: 'auto',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };
      
      this.profile = emergencyProfile;
      return emergencyProfile;
    }
  }

  async createInitialProfile() {
    if (!this.user) return null;
    
    const profileData = {
      auth_id: this.user.id,
      nombre: this.user.user_metadata?.nombre || 'Usuario',
      nombre_usuario: this.user.user_metadata?.nombre_usuario || this.user.email.split('@')[0],
      email: this.user.email,
      config_moneda: 'USD',
      config_tema: 'auto',
      fecha_creacion: new Date().toISOString()
    };

    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .insert([profileData])
        .select()
        .single();

      if (error) {
        console.warn('Error creando perfil en Supabase:', error);
        
        // Guardar localmente
        const localProfile = {
          ...profileData,
          id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fecha_actualizacion: new Date().toISOString()
        };
        
        await localDB.add('usuarios', localProfile);
        this.profile = localProfile;
        
        // Agregar a cola de sincronización
        await localDB.addToSyncQueue('INSERT', 'usuarios', localProfile.id, localProfile);
        
        return localProfile;
      }

      this.profile = data;
      
      // Guardar localmente también
      await localDB.add('usuarios', {
        ...data,
        fecha_actualizacion: new Date().toISOString()
      });
      
      return data;
    } catch (error) {
      console.error('Error creando perfil inicial:', error);
      return await this.getLocalProfile();
    }
  }

  async register(email, password, userData) {
    console.log('📝 Registrando usuario:', email);
    
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: userData.nombre,
            nombre_usuario: userData.nombre_usuario,
            email_verified: false
          },
          emailRedirectTo: `${window.location.origin}#login`,
          emailConfirmOptions: {
            subject: 'Confirma tu cuenta - Commission Manager Pro',
            message: `
Hola ${userData.nombre},

Gracias por registrarte en Commission Manager Pro. 
Por favor confirma tu email haciendo clic en el siguiente enlace:

##CONFIRMATION_LINK##

Si no solicitaste esta cuenta, puedes ignorar este email.

Saludos,
El equipo de Commission Manager Pro
`
          }
        }
      });

      if (error) {
        console.error('Error en registro:', error);
        return {
          success: false,
          error: this.translateAuthError(error.message),
          code: error.code,
          message: this.translateAuthError(error.message)
        };
      }

      if (data.user) {
        console.log('✅ Usuario registrado:', data.user.email);
        
        // Guardar usuario temporalmente
        this.user = data.user;
        
        // Crear perfil local temporal
        const tempProfile = {
          id: `temp_${Date.now()}`,
          auth_id: data.user.id,
          nombre: userData.nombre,
          nombre_usuario: userData.nombre_usuario,
          email: email,
          config_moneda: 'USD',
          config_tema: 'auto',
          fecha_creacion: new Date().toISOString(),
          fecha_actualizacion: new Date().toISOString(),
          email_confirmado: false
        };
        
        await localDB.add('usuarios', tempProfile);
        this.profile = tempProfile;
        
        return {
          success: true,
          user: data.user,
          needsEmailVerification: true,
          message: 'Registro exitoso. Hemos enviado un email de confirmación a tu dirección. Por favor revisa tu bandeja de entrada y confirma tu email antes de iniciar sesión.'
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

      // Verificar si el email está confirmado
      if (!data.user.email_confirmed_at) {
        console.log('📧 Email no confirmado');
        return {
          success: false,
          error: 'Por favor confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.',
          needsEmailConfirmation: true,
          user: data.user
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

  async resendConfirmationEmail(email) {
    try {
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}#login`
        }
      });

      if (error) throw error;

      return { 
        success: true,
        message: 'Se ha reenviado el email de confirmación. Por favor revisa tu bandeja de entrada.'
      };
    } catch (error) {
      console.error('Error reenviando email de confirmación:', error);
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

  async resetPassword(email) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      return { 
        success: true,
        message: 'Se ha enviado un email con las instrucciones para restablecer tu contraseña.'
      };
    } catch (error) {
      console.error('Error en recuperación:', error);
      return {
        success: false,
        error: error.message
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
        message: 'Contraseña actualizada correctamente.'
      };
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      return {
        success: false,
        error: error.message
      };
    }
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
        ...profileData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Actualizar localmente primero
      await localDB.update('usuarios', {
        ...this.profile,
        ...updatedData
      });

      // Actualizar en Supabase si hay conexión
      if (this.isOnline) {
        const { data, error } = await this.supabase
          .from('usuarios')
          .update(updatedData)
          .eq('auth_id', this.user.id)
          .select()
          .single();

        if (error) {
          console.warn('Error actualizando perfil en Supabase:', error);
          
          // Agregar a cola de sincronización
          await localDB.addToSyncQueue('UPDATE', 'usuarios', this.profile.id, updatedData);
        } else {
          this.profile = data;
        }
      } else {
        // Si está offline, agregar a cola de sincronización
        await localDB.addToSyncQueue('UPDATE', 'usuarios', this.profile.id, updatedData);
      }

      // Actualizar perfil local
      this.profile = { ...this.profile, ...updatedData };

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

  async deleteAccount() {
    if (!this.user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      // 1. Eliminar datos locales
      await localDB.delete('usuarios', this.profile?.id || this.user.id);
      
      // 2. Eliminar empresas y datos relacionados localmente
      const empresas = await localDB.getEmpresasByUsuario(this.profile?.id || this.user.id);
      for (const empresa of empresas) {
        await localDB.delete('empresas', empresa.id);
      }
      
      // 3. Cerrar sesión
      await this.logout();
      
      // 4. Intentar eliminar de Supabase (si hay conexión)
      if (this.isOnline) {
        const { error } = await this.supabase
          .from('usuarios')
          .delete()
          .eq('auth_id', this.user.id);
          
        if (error) {
          console.warn('No se pudo eliminar cuenta de Supabase:', error);
        }
      }

      return {
        success: true,
        message: 'Cuenta eliminada correctamente'
      };
    } catch (error) {
      console.error('Error al eliminar cuenta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserProfile() {
    return this.profile;
  }

  async getEmpresas() {
    if (!this.profile) return [];
    
    try {
      let empresas = [];
      
      // Intentar obtener de Supabase si hay conexión
      if (this.isOnline) {
        const { data, error } = await this.supabase
          .from('empresas')
          .select('*')
          .eq('usuario_id', this.profile.id)
          .order('fecha_creacion', { ascending: false });

        if (!error && data) {
          empresas = data;
          
          // Sincronizar con local
          for (const empresa of empresas) {
            await localDB.update('empresas', {
              ...empresa,
              fecha_actualizacion: new Date().toISOString()
            }).catch(() => {
              localDB.add('empresas', {
                ...empresa,
                fecha_creacion: new Date().toISOString(),
                fecha_actualizacion: new Date().toISOString()
              });
            });
          }
        }
      }
      
      // Si no hay datos online o hay error, obtener locales
      if (empresas.length === 0) {
        empresas = await localDB.getEmpresasByUsuario(this.profile.id);
      }
      
      return empresas;
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return await localDB.getEmpresasByUsuario(this.profile.id);
    }
  }

  async createEmpresa(empresaData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const empresaId = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const empresaCompleta = {
        id: empresaId,
        usuario_id: this.profile.id,
        ...empresaData,
        estado: empresaData.estado || 'activa',
        comision_default: empresaData.comision_default || 1.00,
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Guardar localmente
      await localDB.add('empresas', empresaCompleta);
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'empresas', empresaId, empresaCompleta);

      return {
        success: true,
        empresa: empresaCompleta,
        message: 'Empresa creada correctamente'
      };
    } catch (error) {
      console.error('Error creando empresa:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateEmpresa(empresaId, empresaData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const empresaActual = await localDB.get('empresas', empresaId);
      if (!empresaActual || empresaActual.usuario_id !== this.profile.id) {
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
      await localDB.update('empresas', updatedData);
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('UPDATE', 'empresas', empresaId, updatedData);

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
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const empresaActual = await localDB.get('empresas', empresaId);
      if (!empresaActual || empresaActual.usuario_id !== this.profile.id) {
        return {
          success: false,
          error: 'Empresa no encontrada o no autorizada'
        };
      }

      // 1. Verificar si hay contratos asociados
      const contratos = await localDB.getContratosByEmpresa(empresaId);
      if (contratos.length > 0) {
        return {
          success: false,
          error: 'No se puede eliminar la empresa porque tiene contratos asociados'
        };
      }

      // 2. Eliminar localmente
      await localDB.delete('empresas', empresaId);
      
      // 3. Agregar a cola de sincronización
      await localDB.addToSyncQueue('DELETE', 'empresas', empresaId, empresaActual);

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

  async getContratosByEmpresa(empresaId) {
    try {
      let contratos = [];
      
      if (this.isOnline) {
        const { data, error } = await this.supabase
          .from('contratos')
          .select('*')
          .eq('empresa_id', empresaId)
          .order('fecha_creacion', { ascending: false });

        if (!error && data) {
          contratos = data;
          
          // Sincronizar con local
          for (const contrato of contratos) {
            await localDB.update('contratos', {
              ...contrato,
              fecha_actualizacion: new Date().toISOString()
            }).catch(() => {
              localDB.add('contratos', {
                ...contrato,
                fecha_creacion: new Date().toISOString(),
                fecha_actualizacion: new Date().toISOString()
              });
            });
          }
        }
      }
      
      if (contratos.length === 0) {
        contratos = await localDB.getContratosByEmpresa(empresaId);
      }
      
      return contratos;
    } catch (error) {
      console.error('Error obteniendo contratos:', error);
      return await localDB.getContratosByEmpresa(empresaId);
    }
  }

  async createContrato(contratoData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const contratoId = `con_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const contratoCompleto = {
        id: contratoId,
        ...contratoData,
        estado: contratoData.estado || 'activo',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Guardar localmente
      await localDB.add('contratos', contratoCompleto);
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'contratos', contratoId, contratoCompleto);

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

  async syncData() {
    if (!this.isOnline) {
      return {
        success: false,
        error: 'Sin conexión a internet'
      };
    }

    console.log('🔄 Iniciando sincronización de datos...');
    
    try {
      // 1. Obtener cambios pendientes locales
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
      
      // 2. Procesar cada cambio
      for (const item of pendingItems) {
        try {
          // Marcar como procesando
          await localDB.update('sync_queue', {
            ...item,
            estado: 'procesando',
            fecha_actualizacion: new Date().toISOString()
          });

          let result;
          
          switch (item.action) {
            case 'INSERT':
              // Remover el id local para que Supabase genere uno nuevo
              const insertData = { ...item.data };
              delete insertData.id; // Supabase generará un UUID
              
              result = await this.supabase
                .from(item.table)
                .insert([insertData]);
              break;
              
            case 'UPDATE':
              result = await this.supabase
                .from(item.table)
                .update(item.data)
                .eq('id', item.record_id);
              break;
              
            case 'DELETE':
              result = await this.supabase
                .from(item.table)
                .delete()
                .eq('id', item.record_id);
              break;
          }

          if (result.error) {
            throw new Error(result.error.message);
          }

          // Marcar como completado
          await localDB.markSyncItemProcessed(item.id, true);
          successCount++;
          
        } catch (error) {
          console.error(`Error sincronizando ${item.table} ${item.record_id}:`, error);
          
          // Marcar como error si tiene muchos intentos
          if (item.intentos >= 3) {
            await localDB.markSyncItemProcessed(item.id, false, error.message);
          } else {
            await localDB.incrementSyncAttempts(item.id);
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
    
    // Intentar sincronizar automáticamente
    setTimeout(async () => {
      try {
        await this.syncData();
      } catch (error) {
        console.error('Error en sincronización automática:', error);
      }
    }, 2000);
  }

  async handleOffline() {
    console.log('📴 Sin conexión');
    this.isOnline = false;
  }

  translateAuthError(errorMessage) {
    const translations = {
      'Invalid login credentials': 'Credenciales inválidas',
      'Email not confirmed': 'Email no confirmado. Por favor verifica tu email antes de iniciar sesión.',
      'User already registered': 'Usuario ya registrado',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      'Invalid email': 'Email inválido',
      'User not found': 'Usuario no encontrado',
      'Unable to validate email address: invalid format': 'Formato de email inválido',
      'To signup, please provide your email': 'Por favor proporciona tu email para registrarte',
      'Signup requires a valid password': 'Se requiere una contraseña válida para registrarse'
    };
    
    return translations[errorMessage] || errorMessage;
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

  // Subida de archivos (logos)
  async uploadFile(bucket, file, path) {
    if (!this.isOnline) {
      return {
        success: false,
        error: 'Sin conexión a internet'
      };
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      // Obtener URL pública
      const { data: { publicUrl } } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      return {
        success: true,
        path: data.path,
        url: publicUrl,
        message: 'Archivo subido correctamente'
      };
    } catch (error) {
      console.error('Error al subir archivo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(bucket, path) {
    if (!this.isOnline) {
      return {
        success: false,
        error: 'Sin conexión a internet'
      };
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;

      return { 
        success: true,
        message: 'Archivo eliminado correctamente'
      };
    } catch (error) {
      console.error('Error al eliminar archivo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verificar estado de confirmación de email
  async checkEmailConfirmation() {
    if (!this.user) return false;
    
    try {
      const { data, error } = await this.supabase.auth.getUser();
      
      if (error) throw error;
      
      return data.user.email_confirmed_at !== null;
    } catch (error) {
      console.error('Error verificando confirmación de email:', error);
      return false;
    }
  }
}

// Crear instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

// Exportar
export { supabaseManager };
