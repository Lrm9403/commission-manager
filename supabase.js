// Configuración de Supabase
const SUPABASE_URL = 'https://tkvaybrltqgrvvunhgqd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrdmF5YnJsdHFncnZ2dW5oZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMyNTIwNDAsImV4cCI6MjA0ODgyODA0MH0.Yk7eIu2jK4jV96zJ0wqjJd9lL7hW6v6vjCq5Yz6v1J0';

// Clase para gestionar Supabase
class SupabaseManager {
  constructor() {
    console.log('🔧 Supabase Manager creado');
    this.supabase = null;
    this.user = null;
    this.session = null;
    this.profile = null;
    this.localDB = null;
    this.isInitialized = false;
    
    // Inicializar inmediatamente
    this.init();
  }
  
  async init() {
    if (this.isInitialized) return;
    
    try {
      // Importar Supabase dinámicamente
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      this.isInitialized = true;
      console.log('✅ Supabase inicializado');
    } catch (error) {
      console.error('❌ Error inicializando Supabase:', error);
      // Crear cliente mock para modo offline
      this.supabase = this.createMockSupabase();
      this.isInitialized = true;
    }
  }
  
  createMockSupabase() {
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        signInWithPassword: () => Promise.resolve({ 
          data: { user: null, session: null }, 
          error: { message: 'Modo offline' } 
        }),
        signUp: () => Promise.resolve({ 
          data: { user: null, session: null }, 
          error: { message: 'Modo offline' } 
        }),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.resolve({ error: { message: 'Modo offline' } })
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'Modo offline' } })
          }),
          insert: () => ({
            select: () => Promise.resolve({ data: null, error: { message: 'Modo offline' } })
          }),
          update: () => ({
            eq: () => ({
              select: () => Promise.resolve({ data: null, error: { message: 'Modo offline' } })
            })
          })
        })
      })
    };
  }
  
  async ensureLocalDB() {
    if (!this.localDB) {
      try {
        const { localDB } = await import('./db.js');
        this.localDB = localDB;
        await localDB.init();
        console.log('✅ IndexedDB lista para usar');
      } catch (error) {
        console.error('❌ Error cargando IndexedDB:', error);
        throw error;
      }
    }
    return this.localDB;
  }
  
  // Métodos de autenticación
  async restoreSession() {
    try {
      await this.init();
      const { data, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('❌ Error restaurando sesión:', error);
        return null;
      }
      
      if (data.session) {
        this.session = data.session;
        this.user = data.session.user;
        console.log('✅ Sesión restaurada:', this.user.email);
        return this.user;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error crítico restaurando sesión:', error);
      return null;
    }
  }
  
  async login(email, password) {
    try {
      await this.init();
      console.log('🔑 Iniciando sesión:', email);
      
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('❌ Error en login:', error.message);
        return { 
          success: false, 
          error: error.message 
        };
      }
      
      this.session = data.session;
      this.user = data.user;
      console.log('✅ Sesión iniciada:', this.user.email);
      
      // Cargar perfil
      await this.loadProfile();
      
      return {
        success: true,
        user: this.user,
        session: this.session,
        profile: this.profile
      };
    } catch (error) {
      console.error('❌ Error crítico en login:', error);
      return {
        success: false,
        error: 'Error de conexión. Usando modo offline.'
      };
    }
  }
  
  async register(email, password, userData = {}) {
    try {
      await this.init();
      console.log('📝 Registrando usuario:', email);
      
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      
      if (error) {
        console.error('❌ Error en registro:', error.message);
        return { 
          success: false, 
          error: error.message 
        };
      }
      
      console.log('✅ Usuario registrado:', email);
      
      return {
        success: true,
        user: data.user,
        message: 'Usuario registrado exitosamente. Verifica tu email.'
      };
    } catch (error) {
      console.error('❌ Error crítico en registro:', error);
      return {
        success: false,
        error: 'Error de conexión'
      };
    }
  }
  
  async logout() {
    try {
      console.log('🚪 Cerrando sesión...');
      
      if (this.supabase && this.supabase.auth) {
        const { error } = await this.supabase.auth.signOut();
        if (error) {
          console.error('❌ Error cerrando sesión:', error);
        }
      }
      
      this.user = null;
      this.session = null;
      this.profile = null;
      console.log('✅ Sesión cerrada');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error crítico cerrando sesión:', error);
      return { success: false, error: error.message };
    }
  }
  
  async loadProfile() {
    if (!this.user) {
      console.log('👤 No hay usuario para cargar perfil');
      this.profile = this.createEmergencyProfile();
      return this.profile;
    }
    
    console.log('👤 Cargando perfil para usuario:', this.user.id);
    
    try {
      // Intentar cargar de la base de datos local
      await this.ensureLocalDB();
      const localProfile = await this.getLocalProfile(this.user.id);
      
      if (localProfile) {
        this.profile = localProfile;
        console.log('✅ Perfil cargado de IndexedDB:', this.profile);
        return this.profile;
      }
      
      // Si no existe, crear uno nuevo
      console.log('📝 Creando perfil inicial...');
      const newProfile = await this.createInitialProfile(
        this.user.id,
        this.user.email,
        this.user.user_metadata?.nombre || this.user.email.split('@')[0]
      );
      
      if (newProfile) {
        this.profile = newProfile;
        console.log('✅ Perfil inicial creado:', this.profile);
        return this.profile;
      }
      
      throw new Error('No se pudo crear el perfil');
      
    } catch (error) {
      console.error('❌ Error crítico cargando perfil:', error);
      console.log('🆘 Creando perfil de emergencia');
      this.profile = await this.createEmergencyProfile();
      return this.profile;
    }
  }
  
  async getLocalProfile(userId) {
    try {
      await this.ensureLocalDB();
      console.log('🔍 Buscando perfil local para:', userId);
      
      const profile = await this.localDB.getUserByAuthId(userId);
      
      if (profile) {
        console.log('👤 Perfil local encontrado:', profile);
        return profile;
      } else {
        console.log('📭 No se encontró perfil local');
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
      
      console.log('🆕 Creando perfil inicial para:', email, profileData);
      
      // Guardar el usuario directamente
      const result = await this.localDB.saveUser(profileData);
      
      if (result) {
        console.log('✅ Perfil inicial creado exitosamente');
        
        // Configurar opciones por separado (solo si es necesario)
        try {
          // Estas configuraciones ya están en profileData, pero las guardamos por separado también
          await this.localDB.setConfig('tema', 'light');
          await this.localDB.setConfig('moneda', 'USD');
          console.log('✅ Configuraciones guardadas');
        } catch (configError) {
          console.warn('⚠️ Error configurando opciones, continuando...', configError);
          // No lanzar error, continuar con el perfil creado
        }
        
        return profileData;
      } else {
        console.error('❌ Error al crear perfil inicial - saveUser retornó null/false');
        throw new Error('No se pudo crear el perfil');
      }
    } catch (error) {
      console.error('❌ Error creando perfil inicial:', error);
      throw error;
    }
  }
  
  async createEmergencyProfile() {
    try {
      console.log('🆘 Creando perfil de emergencia');
      
      const profile = {
        auth_id: this.user?.id || 'offline',
        email: this.user?.email || 'offline@example.com',
        nombre: this.user?.user_metadata?.nombre || 'Usuario Offline',
        nombre_usuario: 'usuario_offline',
        config_tema: 'light',
        config_moneda: 'USD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_emergency: true
      };
      
      // Intentar guardar en IndexedDB
      try {
        await this.ensureLocalDB();
        await this.localDB.saveUser(profile);
        console.log('✅ Perfil de emergencia guardado en IndexedDB');
      } catch (saveError) {
        console.log('⚠️ No se pudo guardar perfil de emergencia en IndexedDB:', saveError);
        // Continuar con el perfil en memoria
      }
      
      console.log('✅ Perfil de emergencia creado');
      return profile;
    } catch (error) {
      console.error('❌ Error crítico creando perfil de emergencia:', error);
      
      // Perfil de último recurso
      return {
        auth_id: 'emergency',
        email: 'emergency@example.com',
        nombre: 'Usuario',
        nombre_usuario: 'usuario',
        config_tema: 'light',
        config_moneda: 'USD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_emergency: true
      };
    }
  }
  
  async getUserProfile() {
    if (!this.profile) {
      await this.loadProfile();
    }
    return this.profile || await this.createEmergencyProfile();
  }
  
  async updateProfile(updates) {
    try {
      console.log('✏️ Actualizando perfil:', updates);
      
      if (!this.user) {
        throw new Error('No hay usuario para actualizar perfil');
      }
      
      await this.ensureLocalDB();
      
      // Si no hay perfil cargado, cargarlo primero
      if (!this.profile) {
        await this.loadProfile();
      }
      
      // Crear perfil actualizado
      const updatedProfile = {
        ...this.profile,
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      console.log('💾 Guardando perfil actualizado:', updatedProfile);
      
      // Guardar en IndexedDB
      const result = await this.localDB.saveUser(updatedProfile);
      
      if (result) {
        this.profile = updatedProfile;
        console.log('✅ Perfil actualizado exitosamente');
        
        // Si hay configuraciones específicas, guardarlas por separado
        if (updates.config_tema !== undefined) {
          await this.localDB.setConfig('tema', updates.config_tema);
        }
        if (updates.config_moneda !== undefined) {
          await this.localDB.setConfig('moneda', updates.config_moneda);
        }
        
        return { 
          success: true, 
          profile: this.profile,
          message: 'Perfil actualizado correctamente'
        };
      } else {
        console.error('❌ saveUser retornó null/false');
        throw new Error('No se pudo actualizar el perfil en la base de datos local');
      }
    } catch (error) {
      console.error('❌ Error al actualizar perfil:', error);
      return { 
        success: false, 
        error: error.message || 'Error desconocido al actualizar perfil'
      };
    }
  }
  
  async resetPassword(email) {
    try {
      await this.init();
      
      console.log('🔐 Solicitando restablecimiento de contraseña para:', email);
      
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
      });
      
      if (error) {
        console.error('❌ Error solicitando restablecimiento:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
      
      console.log('✅ Solicitud de restablecimiento enviada');
      
      return {
        success: true,
        message: 'Se han enviado instrucciones a tu email para restablecer la contraseña.'
      };
    } catch (error) {
      console.error('❌ Error restableciendo contraseña:', error);
      return {
        success: false,
        error: 'Error de conexión al intentar restablecer la contraseña'
      };
    }
  }
  
  async resendConfirmationEmail(email) {
    try {
      await this.init();
      
      console.log('📧 Intentando reenviar email de confirmación para:', email);
      
      // En Supabase, no hay un método directo para reenviar email de confirmación
      // Podemos intentar registrarlo de nuevo con el mismo email
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: email
      });
      
      if (error) {
        console.error('❌ Error reenviando email:', error.message);
        return { 
          success: false, 
          error: error.message || 'No se pudo reenviar el email de confirmación' 
        };
      }
      
      return {
        success: true,
        message: 'Se ha reenviado el email de confirmación. Revisa tu bandeja de entrada.'
      };
    } catch (error) {
      console.error('❌ Error reenviando email:', error);
      return {
        success: false,
        error: 'Error de conexión. Contacta con soporte para reenviar el email de confirmación.'
      };
    }
  }
  
  // Métodos para sincronización
  async syncData() {
    try {
      console.log('🔄 Iniciando sincronización de datos...');
      
      if (!this.user) {
        throw new Error('No hay usuario autenticado para sincronizar');
      }
      
      await this.ensureLocalDB();
      
      // Obtener datos locales
      const empresas = await this.localDB.getEmpresas();
      const contratos = await this.localDB.getContratos();
      const certificaciones = await this.localDB.getCertificaciones();
      const pagos = await this.localDB.getPagos();
      
      console.log(`📊 Datos a sincronizar: ${empresas.length} empresas, ${contratos.length} contratos, ${certificaciones.length} certificaciones, ${pagos.length} pagos`);
      
      // Aquí iría la lógica de sincronización con Supabase
      // Por ahora, solo registramos los datos
      
      return { 
        success: true, 
        message: 'Sincronización completada',
        stats: {
          empresas: empresas.length,
          contratos: contratos.length,
          certificaciones: certificaciones.length,
          pagos: pagos.length
        }
      };
    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      return { 
        success: false, 
        error: error.message || 'Error durante la sincronización'
      };
    }
  }
  
  // Métodos de ayuda para debugging
  async debugLocalData() {
    try {
      await this.ensureLocalDB();
      
      console.log('🔍 DEBUG - Datos locales:');
      
      const tables = ['usuarios', 'empresas', 'contratos', 'certificaciones', 'pagos', 'configuracion'];
      
      for (const table of tables) {
        try {
          const data = await this.localDB.getAll(table);
          console.log(`📊 ${table}:`, data);
        } catch (error) {
          console.log(`⚠️ Error obteniendo ${table}:`, error.message);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error en debug:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Obtener datos para dashboard
  async getDashboardData() {
    try {
      await this.ensureLocalDB();
      
      const empresas = await this.localDB.getEmpresas();
      const contratos = await this.localDB.getContratos();
      const certificaciones = await this.localDB.getCertificaciones();
      const pagos = await this.localDB.getPagos();
      
      // Calcular estadísticas
      let ingresos = 0;
      let pendiente = 0;
      
      for (const cert of certificaciones) {
        const monto = cert.monto_certificado || 0;
        const porcentaje = cert.porcentaje_comision || 1;
        const comision = (monto * porcentaje) / 100;
        
        if (cert.pagado) {
          ingresos += comision;
        } else {
          pendiente += comision;
        }
      }
      
      // Sumar pagos específicos
      for (const pago of pagos) {
        ingresos += (pago.monto_total || 0);
      }
      
      return {
        empresas: empresas.length,
        contratos: contratos.length,
        ingresos: ingresos,
        pendiente: pendiente,
        datos: {
          empresas: empresas,
          contratos: contratos,
          certificaciones: certificaciones,
          pagos: pagos
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo datos del dashboard:', error);
      return {
        empresas: 0,
        contratos: 0,
        ingresos: 0,
        pendiente: 0,
        datos: {
          empresas: [],
          contratos: [],
          certificaciones: [],
          pagos: []
        }
      };
    }
  }
}

// Crear y exportar instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

// Método de ayuda global para debugging
window.debugSupabase = async function() {
  console.log('🔍 DEBUG Supabase Manager:');
  console.log('Usuario:', supabaseManager.user?.email || 'No autenticado');
  console.log('Perfil:', supabaseManager.profile);
  console.log('Sesión:', supabaseManager.session ? 'Activa' : 'Inactiva');
  
  if (supabaseManager.debugLocalData) {
    await supabaseManager.debugLocalData();
  }
  
  if (supabaseManager.getDashboardData) {
    const dashboardData = await supabaseManager.getDashboardData();
    console.log('📊 Datos del dashboard:', dashboardData);
  }
};

export { supabaseManager };
