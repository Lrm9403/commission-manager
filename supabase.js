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
        
        // Intentar sincronizar con Supabase si estamos online
        if (this.isOnline) {
          await this.syncProfileToSupabase(localProfile);
        }
        
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
      // Buscar por auth_id primero
      const users = await localDB.getAllByIndex('usuarios', 'auth_id', this.user.id);
      if (users && users.length > 0) {
        return users[0];
      }
      
      // Buscar por email como fallback
      const usersByEmail = await localDB.getAll('usuarios');
      const userByEmail = usersByEmail.find(u => u.email === this.user.email);
      if (userByEmail) {
        return userByEmail;
      }
      
      return null;
    } catch (error) {
      console.warn('Error obteniendo perfil local:', error);
      return null;
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
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString()
    };

    // Generar UUID para Supabase (debe ser formato UUID válido)
    const supabaseId = this.generateUUID();
    
    const localProfile = {
      ...profileData,
      id: supabaseId, // Usar el mismo ID para local y remoto
      local_id: `local_${Date.now()}`, // ID auxiliar local
    };

    try {
      // Guardar localmente primero
      await localDB.add('usuarios', localProfile);
      this.profile = localProfile;
      
      // Intentar guardar en Supabase si estamos online
      if (this.isOnline && this.user.email_confirmed_at) {
        await this.syncProfileToSupabase(localProfile);
      } else {
        // Agregar a cola de sincronización
        await localDB.addToSyncQueue('INSERT', 'usuarios', localProfile.id, localProfile);
      }
      
      return localProfile;
    } catch (error) {
      console.error('Error creando perfil inicial:', error);
      return await this.createEmergencyProfile();
    }
  }

  async createEmergencyProfile() {
    if (!this.user) return null;
    
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
    
    try {
      await localDB.add('usuarios', emergencyProfile);
      this.profile = emergencyProfile;
      return emergencyProfile;
    } catch (error) {
      console.error('Error creando perfil de emergencia:', error);
      return emergencyProfile;
    }
  }

  async syncProfileToSupabase(profile) {
    if (!this.isOnline || !this.user?.email_confirmed_at) {
      return false;
    }

    try {
      // Preparar datos para Supabase (remover campos locales)
      const supabaseData = {
        auth_id: profile.auth_id,
        nombre: profile.nombre,
        nombre_usuario: profile.nombre_usuario,
        email: profile.email,
        config_moneda: profile.config_moneda,
        config_tema: profile.config_tema,
        fecha_creacion: profile.fecha_creacion,
        fecha_actualizacion: profile.fecha_actualizacion
      };

      // Verificar si ya existe en Supabase
      const { data: existingUser, error: checkError } = await this.supabase
        .from('usuarios')
        .select('id')
        .eq('auth_id', profile.auth_id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.warn('Error verificando usuario en Supabase:', checkError);
      }

      let result;
      if (existingUser) {
        // Actualizar usuario existente
        result = await this.supabase
          .from('usuarios')
          .update(supabaseData)
          .eq('auth_id', profile.auth_id);
      } else {
        // Insertar nuevo usuario
        result = await this.supabase
          .from('usuarios')
          .insert([{ ...supabaseData, id: profile.id }]);
      }

      if (result.error) {
        if (result.error.code === '23505') { // Violación de unicidad
          console.warn('Usuario ya existe en Supabase, actualizando...');
          // Intentar actualizar con ID diferente
          supabaseData.id = this.generateUUID();
          const retryResult = await this.supabase
            .from('usuarios')
            .insert([supabaseData]);
          
          if (retryResult.error) {
            throw retryResult.error;
          }
        } else {
          throw result.error;
        }
      }

      console.log('✅ Perfil sincronizado con Supabase');
      return true;
    } catch (error) {
      console.warn('Error sincronizando perfil con Supabase:', error);
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'usuarios', profile.id, profile);
      return false;
    }
  }

  async register(email, password, userData) {
    console.log('📝 Registrando usuario:', email);
    
    try {
      // URL de redirección para GitHub Pages
      const redirectUrl = `${window.location.origin}/commission-manager/#login`;
      
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
        
        // Crear perfil local temporal (sin sincronizar aún)
        const tempProfile = {
          id: this.generateUUID(),
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
    if (!this.profile) return [];
    
    try {
      let empresas = [];
      
      // Intentar obtener de Supabase si hay conexión y email confirmado
      if (this.isOnline && this.user?.email_confirmed_at) {
        try {
          // IMPORTANTE: Usar el ID correcto (el que está en Supabase)
          const { data, error } = await this.supabase
            .from('empresas')
            .select('*')
            .eq('usuario_id', this.profile.id) // Usar el ID del perfil
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
        } catch (supabaseError) {
          console.warn('Error obteniendo empresas de Supabase:', supabaseError);
        }
      }
      
      // Obtener locales
      const empresasLocales = await localDB.getEmpresasByUsuario(this.profile.id);
      
      // Combinar y eliminar duplicados
      const empresasMap = new Map();
      
      // Agregar locales primero
      empresasLocales.forEach(emp => empresasMap.set(emp.id, emp));
      
      // Agregar/actualizar con remotas
      empresas.forEach(emp => empresasMap.set(emp.id, emp));
      
      return Array.from(empresasMap.values());
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return await localDB.getEmpresasByUsuario(this.profile.id).catch(() => []);
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
      const empresaId = this.generateUUID();
      
      const empresaCompleta = {
        id: empresaId,
        usuario_id: this.profile.id, // Usar el ID del perfil (UUID)
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

      // Intentar sincronizar inmediatamente si está online
      if (this.isOnline && this.user?.email_confirmed_at) {
        setTimeout(() => this.syncData(), 1000);
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

  // NUEVAS FUNCIONALIDADES - CONTRATOS
  async createContrato(contratoData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const contratoId = this.generateUUID();
      
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

  async getContratosByEmpresa(empresaId) {
    try {
      let contratos = [];
      
      // Obtener locales
      contratos = await localDB.getContratosByEmpresa(empresaId);
      
      return contratos;
    } catch (error) {
      console.error('Error obteniendo contratos:', error);
      return [];
    }
  }

  // NUEVAS FUNCIONALIDADES - CERTIFICACIONES
  async createCertificacion(certificacionData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const certificacionId = this.generateUUID();
      
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
      await localDB.add('certificaciones', certificacionCompleta);
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'certificaciones', certificacionId, certificacionCompleta);

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
      const certificaciones = await localDB.getCertificacionesByContrato(contratoId);
      return certificaciones;
    } catch (error) {
      console.error('Error obteniendo certificaciones:', error);
      return [];
    }
  }

  // NUEVAS FUNCIONALIDADES - PAGOS
  async createPago(pagoData) {
    if (!this.profile) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    try {
      const pagoId = this.generateUUID();
      
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
      await localDB.add('pagos', pagoCompleto);
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'pagos', pagoId, pagoCompleto);

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
      const pagos = await localDB.getPagosByEmpresa(empresaId);
      return pagos;
    } catch (error) {
      console.error('Error obteniendo pagos:', error);
      return [];
    }
  }

  // SISTEMA DE SINCRONIZACIÓN MEJORADO
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
          await localDB.update('sync_queue', {
            ...item,
            estado: 'procesando',
            fecha_actualizacion: new Date().toISOString()
          });

          let result;
          const dataForSupabase = { ...item.data };
          
          // Remover campos locales antes de enviar a Supabase
          delete dataForSupabase.local_id;
          
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
            // Si es error de duplicado en usuarios, intentar actualizar
            if (result.error.code === '23505' && item.table === 'usuarios') {
              const updateResult = await this.supabase
                .from(item.table)
                .update(dataForSupabase)
                .eq('auth_id', dataForSupabase.auth_id);
              
              if (updateResult.error) throw updateResult.error;
            } else {
              throw result.error;
            }
          }

          await localDB.markSyncItemProcessed(item.id, true);
          successCount++;
          
        } catch (error) {
          console.error(`Error sincronizando ${item.table}:`, error);
          
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

  // UTILIDADES
  generateUUID() {
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
      await localDB.update('usuarios', updatedData);
      this.profile = updatedData;
      
      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('UPDATE', 'usuarios', this.profile.id, updatedData);

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
      const redirectUrl = `${window.location.origin}/commission-manager/#login`;
      
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
}

// Crear instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

// Exportar
export { supabaseManager };
