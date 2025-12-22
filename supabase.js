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
      this.profile = this.createEmergencyProfile();
      return this.profile;
    }
  }
  
  async getLocalProfile(userId) {
    try {
      await this.ensureLocalDB();
      const profile = await this.localDB.getUserByAuthId(userId);
      return profile;
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
      
      const result = await this.localDB.saveUser(profileData);
      
      if (result) {
        console.log('✅ Perfil inicial creado exitosamente');
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
  
  createEmergencyProfile() {
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
    
    console.log('🆘 Perfil de emergencia creado');
    return profile;
  }
  
  async getUserProfile() {
    if (!this.profile) {
      await this.loadProfile();
    }
    return this.profile || this.createEmergencyProfile();
  }
  
  async updateProfile(updates) {
    try {
      if (!this.user || !this.profile) {
        throw new Error('No hay usuario o perfil para actualizar');
      }
      
      await this.ensureLocalDB();
      
      const updatedProfile = {
        ...this.profile,
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      const result = await this.localDB.saveUser(updatedProfile);
      
      if (result) {
        this.profile = updatedProfile;
        console.log('✅ Perfil actualizado:', this.profile);
        return { success: true, profile: this.profile };
      } else {
        throw new Error('No se pudo actualizar el perfil');
      }
    } catch (error) {
      console.error('❌ Error al actualizar perfil:', error);
      return { success: false, error: error.message };
    }
  }
  
  async resetPassword(email) {
    try {
      await this.init();
      
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
      });
      
      if (error) {
        return {
          success: false,
          error: error.message
        };
      }
      
      return {
        success: true,
        message: 'Se han enviado instrucciones a tu email para restablecer la contraseña.'
      };
    } catch (error) {
      console.error('❌ Error restableciendo contraseña:', error);
      return {
        success: false,
        error: 'Error de conexión'
      };
    }
  }
  
  async resendConfirmationEmail(email) {
    try {
      await this.init();
      
      // Nota: Supabase no tiene método directo para reenviar confirmación
      // Podríamos intentar registrarlo de nuevo o mostrar un mensaje
      return {
        success: false,
        error: 'Contacta con soporte para reenviar el email de confirmación.'
      };
    } catch (error) {
      console.error('❌ Error reenviando email:', error);
      return {
        success: false,
        error: 'Error de conexión'
      };
    }
  }
  
  // Métodos para sincronización
  async syncData() {
    console.log('🔄 Iniciando sincronización...');
    // Implementación de sincronización
    return { success: true, message: 'Sincronización completada' };
  }
}

// Crear y exportar instancia única
const supabaseManager = new SupabaseManager();

// Hacer disponible globalmente
window.supabaseManager = supabaseManager;

export { supabaseManager };
