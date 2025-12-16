// Configuración de Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabaseUrl = 'https://axpgwncduujxficolgyt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGd3bmNkdXVqeGZpY29sZ3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDU0NDgsImV4cCI6MjA4MTQ4MTQ0OH0.jCuEskTd5JJt7C_iS7_GzMwA7wOnGHQsT0tFzVLm9CE';

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Clase para manejar operaciones con Supabase
class SupabaseManager {
  constructor() {
    this.supabase = supabase;
    this.user = null;
    this.session = null;
  }

  // Inicializar sesión desde almacenamiento local
  async initSession() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      this.session = session;
      
      if (session) {
        this.user = session.user;
        console.log('✅ Sesión de Supabase restaurada');
      }
      
      return session;
    } catch (error) {
      console.error('Error al inicializar sesión:', error);
      return null;
    }
  }

  // Registrar usuario
  async register(email, password, userData) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });

      if (error) throw error;

      if (data.user) {
        this.user = data.user;
        this.session = data.session;
        
        // Crear perfil en la tabla usuarios
        const profileData = {
          auth_id: data.user.id,
          nombre: userData.nombre || '',
          nombre_usuario: userData.nombre_usuario || email.split('@')[0],
          email: email,
          config_moneda: 'USD',
          config_tema: 'auto',
          fecha_creacion: new Date().toISOString()
        };

        const { error: profileError } = await this.supabase
          .from('usuarios')
          .insert([profileData]);

        if (profileError) {
          console.warn('Error al crear perfil:', profileError);
        }

        return {
          success: true,
          user: data.user,
          session: data.session
        };
      }

      return {
        success: false,
        error: 'No se pudo crear el usuario'
      };
    } catch (error) {
      console.error('Error en registro:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Iniciar sesión
  async login(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.user = data.user;
      this.session = data.session;

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

  // Cerrar sesión
  async logout() {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) throw error;

      this.user = null;
      this.session = null;

      return { success: true };
    } catch (error) {
      console.error('Error en logout:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Recuperar contraseña
  async resetPassword(email) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error en recuperación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cambiar contraseña
  async updatePassword(newPassword) {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obtener perfil del usuario
  async getUserProfile() {
    if (!this.user) return null;

    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', this.user.id)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error al obtener perfil:', error);
      return null;
    }
  }

  // Actualizar perfil
  async updateProfile(profileData) {
    if (!this.user) return null;

    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .update({
          ...profileData,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('auth_id', this.user.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        profile: data
      };
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Eliminar cuenta
  async deleteAccount() {
    if (!this.user) return null;

    try {
      // Primero eliminar perfil
      const { error: profileError } = await this.supabase
        .from('usuarios')
        .delete()
        .eq('auth_id', this.user.id);

      if (profileError) throw profileError;

      // Luego eliminar usuario de auth
      const { error: authError } = await this.supabase.auth.admin.deleteUser(
        this.user.id
      );

      if (authError) throw authError;

      // Cerrar sesión localmente
      this.user = null;
      this.session = null;

      return { success: true };
    } catch (error) {
      console.error('Error al eliminar cuenta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sincronizar datos locales con Supabase
  async syncLocalData(localData) {
    try {
      const results = {
        success: [],
        failed: []
      };

      // Sincronizar empresas
      if (localData.empresas && localData.empresas.length > 0) {
        for (const empresa of localData.empresas) {
          try {
            const { data, error } = await this.supabase
              .from('empresas')
              .upsert(empresa, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              });

            if (error) throw error;

            results.success.push({
              table: 'empresas',
              id: empresa.id
            });
          } catch (error) {
            results.failed.push({
              table: 'empresas',
              id: empresa.id,
              error: error.message
            });
          }
        }
      }

      // Sincronizar contratos
      if (localData.contratos && localData.contratos.length > 0) {
        for (const contrato of localData.contratos) {
          try {
            const { data, error } = await this.supabase
              .from('contratos')
              .upsert(contrato, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              });

            if (error) throw error;

            results.success.push({
              table: 'contratos',
              id: contrato.id
            });
          } catch (error) {
            results.failed.push({
              table: 'contratos',
              id: contrato.id,
              error: error.message
            });
          }
        }
      }

      // Sincronizar certificaciones
      if (localData.certificaciones && localData.certificaciones.length > 0) {
        for (const certificacion of localData.certificaciones) {
          try {
            const { data, error } = await this.supabase
              .from('certificaciones')
              .upsert(certificacion, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              });

            if (error) throw error;

            results.success.push({
              table: 'certificaciones',
              id: certificacion.id
            });
          } catch (error) {
            results.failed.push({
              table: 'certificaciones',
              id: certificacion.id,
              error: error.message
            });
          }
        }
      }

      // Sincronizar pagos
      if (localData.pagos && localData.pagos.length > 0) {
        for (const pago of localData.pagos) {
          try {
            const { data, error } = await this.supabase
              .from('pagos')
              .upsert(pago, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              });

            if (error) throw error;

            results.success.push({
              table: 'pagos',
              id: pago.id
            });
          } catch (error) {
            results.failed.push({
              table: 'pagos',
              id: pago.id,
              error: error.message
            });
          }
        }
      }

      return {
        success: true,
        results: results,
        summary: {
          total: results.success.length + results.failed.length,
          success: results.success.length,
          failed: results.failed.length
        }
      };
    } catch (error) {
      console.error('Error en sincronización:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Descargar datos desde Supabase
  async downloadUserData() {
    if (!this.user) return null;

    try {
      // Obtener perfil del usuario
      const profile = await this.getUserProfile();
      if (!profile) throw new Error('No se encontró el perfil del usuario');

      // Obtener empresas del usuario
      const { data: empresas, error: empresasError } = await this.supabase
        .from('empresas')
        .select('*')
        .eq('usuario_id', profile.id);

      if (empresasError) throw empresasError;

      // Obtener contratos de las empresas
      let allContratos = [];
      let allSuplementos = [];
      let allCertificaciones = [];
      let allPagos = [];
      let allPagosDistribucion = [];

      for (const empresa of empresas) {
        // Contratos de la empresa
        const { data: contratos, error: contratosError } = await this.supabase
          .from('contratos')
          .select('*')
          .eq('empresa_id', empresa.id);

        if (!contratosError && contratos) {
          allContratos = [...allContratos, ...contratos];

          // Para cada contrato, obtener suplementos y certificaciones
          for (const contrato of contratos) {
            // Suplementos del contrato
            const { data: suplementos } = await this.supabase
              .from('suplementos')
              .select('*')
              .eq('contrato_id', contrato.id);

            if (suplementos) {
              allSuplementos = [...allSuplementos, ...suplementos];
            }

            // Certificaciones del contrato
            const { data: certificaciones } = await this.supabase
              .from('certificaciones')
              .select('*')
              .eq('contrato_id', contrato.id);

            if (certificaciones) {
              allCertificaciones = [...allCertificaciones, ...certificaciones];
            }
          }
        }

        // Pagos de la empresa
        const { data: pagos, error: pagosError } = await this.supabase
          .from('pagos')
          .select('*')
          .eq('empresa_id', empresa.id);

        if (!pagosError && pagos) {
          allPagos = [...allPagos, ...pagos];

          // Para cada pago, obtener distribución
          for (const pago of pagos) {
            const { data: distribucion } = await this.supabase
              .from('pagos_distribucion')
              .select('*')
              .eq('pago_id', pago.id);

            if (distribucion) {
              allPagosDistribucion = [...allPagosDistribucion, ...distribucion];
            }
          }
        }
      }

      return {
        usuario: profile,
        empresas: empresas || [],
        contratos: allContratos || [],
        suplementos: allSuplementos || [],
        certificaciones: allCertificaciones || [],
        pagos: allPagos || [],
        pagos_distribucion: allPagosDistribucion || [],
        metadata: {
          downloadDate: new Date().toISOString(),
          userId: this.user.id,
          totalEmpresas: empresas?.length || 0,
          totalContratos: allContratos.length,
          totalCertificaciones: allCertificaciones.length,
          totalPagos: allPagos.length
        }
      };
    } catch (error) {
      console.error('Error al descargar datos:', error);
      return null;
    }
  }

  // Verificar conexión a Supabase
  async checkConnection() {
    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('count')
        .limit(1);

      if (error) throw error;

      return {
        connected: true,
        latency: Date.now() // Podríamos medir latencia aquí
      };
    } catch (error) {
      console.error('Error de conexión a Supabase:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  // Subir archivo (logo de empresa)
  async uploadFile(bucket, file, path) {
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
        url: publicUrl
      };
    } catch (error) {
      console.error('Error al subir archivo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Eliminar archivo
  async deleteFile(bucket, path) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error al eliminar archivo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obtener estadísticas del usuario
  async getUserStats() {
    if (!this.user) return null;

    try {
      const profile = await this.getUserProfile();
      if (!profile) return null;

      const { data: empresas, error: empresasError } = await this.supabase
        .from('empresas')
        .select('id')
        .eq('usuario_id', profile.id);

      if (empresasError) throw empresasError;

      const empresaIds = empresas.map(e => e.id);
      
      let stats = {
        totalEmpresas: empresas.length,
        totalContratos: 0,
        totalCertificaciones: 0,
        totalPagos: 0,
        montoTotalContratos: 0,
        comisionesPendientes: 0,
        comisionesPagadas: 0
      };

      if (empresaIds.length > 0) {
        // Obtener contratos
        const { data: contratos } = await this.supabase
          .from('contratos')
          .select('monto_base, estado')
          .in('empresa_id', empresaIds);

        if (contratos) {
          stats.totalContratos = contratos.length;
          stats.montoTotalContratos = contratos.reduce((sum, c) => sum + (c.monto_base || 0), 0);
        }

        // Obtener certificaciones
        const { data: certificaciones } = await this.supabase
          .from('certificaciones')
          .select('comision_calculada')
          .in('contrato_id', 
            contratos ? contratos.map(c => c.id) : []
          );

        if (certificaciones) {
          stats.totalCertificaciones = certificaciones.length;
          const totalComisiones = certificaciones.reduce((sum, cert) => 
            sum + (cert.comision_calculada || 0), 0
          );
          // Aquí necesitaríamos lógica para determinar cuáles están pagadas
          stats.comisionesPendientes = totalComisiones;
        }

        // Obtener pagos
        const { data: pagos } = await this.supabase
          .from('pagos')
          .select('monto_total')
          .in('empresa_id', empresaIds);

        if (pagos) {
          stats.totalPagos = pagos.length;
          stats.comisionesPagadas = pagos.reduce((sum, p) => sum + (p.monto_total || 0), 0);
        }
      }

      return stats;
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      return null;
    }
  }
}

// Exportar instancia única
const supabaseManager = new SupabaseManager();
window.supabaseManager = supabaseManager;

export { supabaseManager };