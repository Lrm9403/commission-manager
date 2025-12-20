// Sistema de gestión de empresas - Commission Manager Pro
import { localDB } from './db.js';
import { syncManager } from './sync.js';

class EmpresasManager {
  constructor() {
    this.currentUser = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  // Estructura de datos para empresas
  getEmpresaStructure() {
    return {
      id: null, // Auto-increment por IndexedDB
      user_id: this.currentUser?.id || null,
      nombre: '',
      director: '',
      descripcion: '',
      comision_default: 1.00,
      estado: 'activa',
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
  }

  // Validaciones
  validateEmpresa(empresaData) {
    const errors = [];
    
    if (!empresaData.nombre || empresaData.nombre.trim() === '') {
      errors.push('El nombre de la empresa es requerido');
    }
    
    if (empresaData.comision_default !== undefined) {
      const comision = parseFloat(empresaData.comision_default);
      if (isNaN(comision) || comision < 0.1 || comision > 100) {
        errors.push('La comisión debe estar entre 0.1% y 100%');
      }
    }
    
    if (empresaData.estado && !['activa', 'inactiva'].includes(empresaData.estado)) {
      errors.push('Estado inválido. Debe ser "activa" o "inactiva"');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // CRUD Methods
  async createEmpresa(empresaData) {
    try {
      // Validar datos
      const validation = this.validateEmpresa(empresaData);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Preparar datos
      const empresaCompleta = {
        ...this.getEmpresaStructure(),
        ...empresaData,
        user_id: this.currentUser?.id,
        nombre: empresaData.nombre.trim(),
        director: empresaData.director?.trim() || '',
        descripcion: empresaData.descripcion?.trim() || '',
        comision_default: parseFloat(empresaData.comision_default) || 1.00,
        estado: empresaData.estado || 'activa'
      };

      // IMPORTANTE: No pasar ID si es autoincrement
      delete empresaCompleta.id;

      // Guardar en IndexedDB
      const id = await localDB.add('empresas', empresaCompleta);
      
      if (id) {
        // Actualizar el objeto con el ID generado
        empresaCompleta.id = id;
        
        // Agregar a cola de sincronización
        await syncManager.addChangeForSync('empresas', 'INSERT', empresaCompleta);
        
        return {
          success: true,
          empresa: empresaCompleta,
          message: 'Empresa creada correctamente'
        };
      } else {
        return {
          success: false,
          error: 'Error al guardar empresa localmente'
        };
      }
    } catch (error) {
      console.error('Error creando empresa:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido al crear empresa'
      };
    }
  }

  async getEmpresa(id) {
    try {
      const empresa = await localDB.get('empresas', id);
      
      // Filtrar empresas eliminadas lógicamente
      if (empresa && empresa.deleted_at) {
        return null;
      }
      
      return empresa;
    } catch (error) {
      console.error('Error obteniendo empresa:', error);
      return null;
    }
  }

  async getAllEmpresas() {
    try {
      const empresas = await localDB.getAll('empresas');
      
      // Filtrar solo empresas del usuario actual y no eliminadas
      return empresas.filter(empresa => 
        empresa.user_id === this.currentUser?.id && 
        !empresa.deleted_at
      );
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return [];
    }
  }

  async updateEmpresa(id, empresaData) {
    try {
      // Obtener empresa existente
      const empresaExistente = await this.getEmpresa(id);
      if (!empresaExistente) {
        return {
          success: false,
          error: 'Empresa no encontrada'
        };
      }

      // Validar datos
      const validation = this.validateEmpresa(empresaData);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Preparar datos actualizados
      const empresaActualizada = {
        ...empresaExistente,
        ...empresaData,
        nombre: empresaData.nombre?.trim() || empresaExistente.nombre,
        director: empresaData.director?.trim() || empresaExistente.director,
        descripcion: empresaData.descripcion?.trim() || empresaExistente.descripcion,
        comision_default: empresaData.comision_default !== undefined 
          ? parseFloat(empresaData.comision_default) 
          : empresaExistente.comision_default,
        estado: empresaData.estado || empresaExistente.estado,
        updated_at: new Date().toISOString(),
        sync_status: 'pending'
      };

      // Actualizar en IndexedDB
      const success = await localDB.update('empresas', id, empresaActualizada);
      
      if (success) {
        // Agregar a cola de sincronización
        await syncManager.addChangeForSync('empresas', 'UPDATE', empresaActualizada);
        
        return {
          success: true,
          empresa: empresaActualizada,
          message: 'Empresa actualizada correctamente'
        };
      } else {
        return {
          success: false,
          error: 'Error al actualizar empresa localmente'
        };
      }
    } catch (error) {
      console.error('Error actualizando empresa:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido al actualizar empresa'
      };
    }
  }

  async deleteEmpresa(id, force = false) {
    try {
      const empresa = await this.getEmpresa(id);
      if (!empresa) {
        return {
          success: false,
          error: 'Empresa no encontrada'
        };
      }

      // Verificar si hay contratos asociados
      const contratos = await localDB.getContratosByEmpresa(id);
      if (contratos.length > 0 && !force) {
        return {
          success: false,
          error: 'No se puede eliminar la empresa porque tiene contratos asociados'
        };
      }

      if (force) {
        // Eliminación forzada - eliminar físicamente
        await localDB.delete('empresas', id);
        await syncManager.addChangeForSync('empresas', 'DELETE', { id });
        
        return {
          success: true,
          message: 'Empresa eliminada permanentemente'
        };
      } else {
        // Eliminación lógica
        const empresaActualizada = {
          ...empresa,
          estado: 'inactiva',
          sync_status: 'pending',
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await localDB.update('empresas', id, empresaActualizada);
        await syncManager.addChangeForSync('empresas', 'UPDATE', empresaActualizada);
        
        return {
          success: true,
          message: 'Empresa marcada como inactiva'
        };
      }
    } catch (error) {
      console.error('Error eliminando empresa:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido al eliminar empresa'
      };
    }
  }

  // Métodos de búsqueda y filtrado
  async searchEmpresas(query) {
    try {
      const empresas = await this.getAllEmpresas();
      
      if (!query) return empresas;
      
      const searchTerm = query.toLowerCase().trim();
      
      return empresas.filter(empresa => 
        empresa.nombre.toLowerCase().includes(searchTerm) ||
        (empresa.director && empresa.director.toLowerCase().includes(searchTerm)) ||
        (empresa.descripcion && empresa.descripcion.toLowerCase().includes(searchTerm))
      );
    } catch (error) {
      console.error('Error buscando empresas:', error);
      return [];
    }
  }

  async filterEmpresas(filters = {}) {
    try {
      let empresas = await this.getAllEmpresas();
      
      if (filters.estado) {
        empresas = empresas.filter(empresa => empresa.estado === filters.estado);
      }
      
      if (filters.minComision !== undefined) {
        empresas = empresas.filter(empresa => 
          empresa.comision_default >= parseFloat(filters.minComision)
        );
      }
      
      if (filters.maxComision !== undefined) {
        empresas = empresas.filter(empresa => 
          empresa.comision_default <= parseFloat(filters.maxComision)
        );
      }
      
      if (filters.fechaDesde) {
        const fechaDesde = new Date(filters.fechaDesde);
        empresas = empresas.filter(empresa => 
          new Date(empresa.created_at) >= fechaDesde
        );
      }
      
      if (filters.fechaHasta) {
        const fechaHasta = new Date(filters.fechaHasta);
        empresas = empresas.filter(empresa => 
          new Date(empresa.created_at) <= fechaHasta
        );
      }
      
      return empresas;
    } catch (error) {
      console.error('Error filtrando empresas:', error);
      return [];
    }
  }

  // Métodos de estadísticas
  async getEmpresasStats() {
    try {
      const empresas = await this.getAllEmpresas();
      
      const total = empresas.length;
      const activas = empresas.filter(e => e.estado === 'activa').length;
      const inactivas = empresas.filter(e => e.estado === 'inactiva').length;
      
      // Calcular comisión promedio
      const comisionPromedio = total > 0 
        ? empresas.reduce((sum, e) => sum + e.comision_default, 0) / total 
        : 0;
      
      // Empresas por mes (últimos 6 meses)
      const empresasPorMes = this.calcularEmpresasPorMes(empresas);
      
      return {
        total,
        activas,
        inactivas,
        comisionPromedio: parseFloat(comisionPromedio.toFixed(2)),
        empresasPorMes
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas de empresas:', error);
      return {
        total: 0,
        activas: 0,
        inactivas: 0,
        comisionPromedio: 0,
        empresasPorMes: []
      };
    }
  }

  calcularEmpresasPorMes(empresas) {
    const meses = [];
    const hoy = new Date();
    
    // Últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date();
      fecha.setMonth(hoy.getMonth() - i);
      
      const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
      const mesNombre = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      
      // Contar empresas creadas en este mes
      const empresasMes = empresas.filter(empresa => {
        const fechaEmpresa = new Date(empresa.created_at);
        return `${fechaEmpresa.getFullYear()}-${(fechaEmpresa.getMonth() + 1).toString().padStart(2, '0')}` === mesKey;
      });
      
      meses.push({
        mes: mesNombre,
        cantidad: empresasMes.length,
        empresas: empresasMes.map(e => e.nombre)
      });
    }
    
    return meses;
  }

  // Métodos de exportación
  async exportEmpresasToCSV() {
    try {
      const empresas = await this.getAllEmpresas();
      
      if (empresas.length === 0) {
        return null;
      }
      
      let csv = 'Nombre,Director,Comisión Default,Estado,Descripción,Fecha Creación\n';
      
      empresas.forEach(empresa => {
        const nombre = `"${empresa.nombre.replace(/"/g, '""')}"`;
        const director = `"${(empresa.director || '').replace(/"/g, '""')}"`;
        const comision = empresa.comision_default.toFixed(2);
        const estado = empresa.estado;
        const descripcion = `"${(empresa.descripcion || '').replace(/"/g, '""')}"`;
        const fechaCreacion = new Date(empresa.created_at).toLocaleDateString('es-ES');
        
        csv += `${nombre},${director},${comision}%,${estado},${descripcion},${fechaCreacion}\n`;
      });
      
      return csv;
    } catch (error) {
      console.error('Error exportando empresas a CSV:', error);
      return null;
    }
  }

  async exportEmpresasToJSON() {
    try {
      const empresas = await this.getAllEmpresas();
      
      return {
        metadata: {
          exportDate: new Date().toISOString(),
          totalEmpresas: empresas.length,
          appVersion: '2.0.0'
        },
        empresas: empresas.map(empresa => ({
          ...empresa,
          // Formatear fechas para mejor legibilidad
          created_at: new Date(empresa.created_at).toLocaleString('es-ES'),
          updated_at: new Date(empresa.updated_at).toLocaleString('es-ES'),
          deleted_at: empresa.deleted_at ? new Date(empresa.deleted_at).toLocaleString('es-ES') : null
        }))
      };
    } catch (error) {
      console.error('Error exportando empresas a JSON:', error);
      return null;
    }
  }

  // Sincronización con Supabase
  async syncWithSupabase() {
    try {
      if (!this.currentUser) {
        return {
          success: false,
          error: 'Usuario no autenticado'
        };
      }

      const empresas = await this.getAllEmpresas();
      const pendingSync = empresas.filter(e => e.sync_status === 'pending');
      
      if (pendingSync.length === 0) {
        return {
          success: true,
          message: 'No hay empresas pendientes de sincronización',
          synced: 0
        };
      }

      // En una implementación real, aquí se enviarían a Supabase
      // Por ahora, solo marcamos como sincronizadas
      let syncedCount = 0;
      
      for (const empresa of pendingSync) {
        try {
          // Simular envío a Supabase
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Marcar como sincronizada
          await localDB.update('empresas', empresa.id, {
            sync_status: 'synced',
            updated_at: new Date().toISOString()
          });
          
          syncedCount++;
        } catch (error) {
          console.error(`Error sincronizando empresa ${empresa.id}:`, error);
          // Mantener como pendiente para reintentar
        }
      }
      
      return {
        success: true,
        message: `Sincronizadas ${syncedCount} empresas`,
        synced: syncedCount
      };
    } catch (error) {
      console.error('Error en sincronización de empresas:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Métodos de utilidad
  formatComision(comision) {
    return `${parseFloat(comision).toFixed(2)}%`;
  }

  getEstadoBadge(estado) {
    switch(estado) {
      case 'activa':
        return {
          text: 'Activa',
          color: '#22c55e',
          bgColor: '#dcfce7'
        };
      case 'inactiva':
        return {
          text: 'Inactiva',
          color: '#64748b',
          bgColor: '#f1f5f9'
        };
      default:
        return {
          text: 'Desconocido',
          color: '#64748b',
          bgColor: '#f1f5f9'
        };
    }
  }

  // Método para obtener empresas para select/options
  async getEmpresasForSelect() {
    try {
      const empresas = await this.getAllEmpresas();
      
      return empresas
        .filter(empresa => empresa.estado === 'activa')
        .map(empresa => ({
          value: empresa.id,
          label: empresa.nombre,
          comision: empresa.comision_default
        }));
    } catch (error) {
      console.error('Error obteniendo empresas para select:', error);
      return [];
    }
  }
}

// Crear instancia única
const empresasManager = new EmpresasManager();

// Hacer disponible globalmente
window.empresasManager = empresasManager;

// Exportar
export { empresasManager };
