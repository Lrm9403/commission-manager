// Sistema de gestión de contratos - Commission Manager Pro
import { localDB } from './db.js';
import { supabaseManager } from './supabase.js';

class ContratosManager {
  constructor() {
    this.currentEmpresa = null;
  }

  async setEmpresa(empresaId) {
    this.currentEmpresa = empresaId;
  }

  async createContrato(contratoData) {
    if (!this.currentEmpresa) {
      return {
        success: false,
        error: 'Selecciona una empresa primero'
      };
    }

    try {
      const contratoId = `con_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const contratoCompleto = {
        id: contratoId,
        empresa_id: this.currentEmpresa,
        ...contratoData,
        estado: contratoData.estado || 'activo',
        comision_personalizada: contratoData.comision_personalizada || null,
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validaciones
      if (!contratoCompleto.numero_contrato) {
        return { success: false, error: 'Número de contrato es requerido' };
      }
      if (!contratoCompleto.nombre) {
        return { success: false, error: 'Nombre del contrato es requerido' };
      }
      if (!contratoCompleto.monto_base || contratoCompleto.monto_base <= 0) {
        return { success: false, error: 'Monto base debe ser mayor a 0' };
      }

      // Formatear monto base
      contratoCompleto.monto_base = parseFloat(contratoCompleto.monto_base);

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

  async getContratos() {
    if (!this.currentEmpresa) return [];
    
    try {
      const contratos = await localDB.getContratosByEmpresa(this.currentEmpresa);
      
      // Ordenar por fecha de creación (más recientes primero)
      return contratos.sort((a, b) => 
        new Date(b.fecha_creacion) - new Date(a.fecha_creacion)
      );
    } catch (error) {
      console.error('Error obteniendo contratos:', error);
      return [];
    }
  }

  async getContrato(id) {
    try {
      return await localDB.get('contratos', id);
    } catch (error) {
      console.error('Error obteniendo contrato:', error);
      return null;
    }
  }

  async updateContrato(id, contratoData) {
    try {
      const contratoActual = await localDB.get('contratos', id);
      if (!contratoActual) {
        return {
          success: false,
          error: 'Contrato no encontrado'
        };
      }

      const updatedData = {
        ...contratoActual,
        ...contratoData,
        fecha_actualizacion: new Date().toISOString()
      };

      await localDB.update('contratos', updatedData);
      await localDB.addToSyncQueue('UPDATE', 'contratos', id, updatedData);

      return {
        success: true,
        contrato: updatedData,
        message: 'Contrato actualizado correctamente'
      };
    } catch (error) {
      console.error('Error actualizando contrato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteContrato(id) {
    try {
      const contrato = await localDB.get('contratos', id);
      if (!contrato) {
        return {
          success: false,
          error: 'Contrato no encontrado'
        };
      }

      // Verificar si tiene certificaciones
      const certificaciones = await localDB.getCertificacionesByContrato(id);
      if (certificaciones.length > 0) {
        return {
          success: false,
          error: 'No se puede eliminar el contrato porque tiene certificaciones asociadas'
        };
      }

      await localDB.delete('contratos', id);
      await localDB.addToSyncQueue('DELETE', 'contratos', id, contrato);

      return {
        success: true,
        message: 'Contrato eliminado correctamente'
      };
    } catch (error) {
      console.error('Error eliminando contrato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getEstadisticasContrato(contratoId) {
    try {
      const contrato = await localDB.get('contratos', contratoId);
      if (!contrato) return null;

      const certificaciones = await localDB.getCertificacionesByContrato(contratoId);
      const suplementos = await localDB.getAllByIndex('suplementos', 'contrato_id', contratoId);

      const montoTotalSuplementos = suplementos.reduce((sum, s) => sum + (s.monto || 0), 0);
      const montoTotalCertificaciones = certificaciones.reduce((sum, c) => sum + (c.monto_certificado || 0), 0);
      const comisionesTotales = certificaciones.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
      const comisionesPagadas = certificaciones
        .filter(c => c.pagado)
        .reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);

      return {
        contrato,
        totalCertificaciones: certificaciones.length,
        montoBase: contrato.monto_base || 0,
        montoSuplementos: montoTotalSuplementos,
        montoCertificado: montoTotalCertificaciones,
        porcentajeAvance: contrato.monto_base > 0 ? (montoTotalCertificaciones / contrato.monto_base) * 100 : 0,
        comisionesTotales,
        comisionesPagadas,
        comisionesPendientes: comisionesTotales - comisionesPagadas,
        suplementos: suplementos.length
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return null;
    }
  }

  async cambiarEstadoContrato(id, nuevoEstado) {
    const estadosValidos = ['activo', 'completado', 'cancelado'];
    
    if (!estadosValidos.includes(nuevoEstado)) {
      return {
        success: false,
        error: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
      };
    }

    return this.updateContrato(id, { estado: nuevoEstado });
  }

  // Método para generar número de contrato automático
  generarNumeroContrato(empresaNombre) {
    const fecha = new Date();
    const año = fecha.getFullYear();
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const dia = fecha.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    
    const siglas = empresaNombre
      .split(' ')
      .map(palabra => palabra.charAt(0))
      .join('')
      .toUpperCase()
      .substr(0, 3);
    
    return `${siglas}-${año}${mes}${dia}-${random}`;
  }

  // Filtros y búsqueda
  async buscarContratos(filtros = {}) {
    try {
      let contratos = await this.getContratos();
      
      // Aplicar filtros
      if (filtros.estado) {
        contratos = contratos.filter(c => c.estado === filtros.estado);
      }
      
      if (filtros.busqueda) {
        const busqueda = filtros.busqueda.toLowerCase();
        contratos = contratos.filter(c => 
          c.nombre.toLowerCase().includes(busqueda) ||
          c.numero_contrato.toLowerCase().includes(busqueda) ||
          (c.notas && c.notas.toLowerCase().includes(busqueda))
        );
      }
      
      if (filtros.fechaInicio) {
        const fechaInicio = new Date(filtros.fechaInicio);
        contratos = contratos.filter(c => new Date(c.fecha_creacion) >= fechaInicio);
      }
      
      if (filtros.fechaFin) {
        const fechaFin = new Date(filtros.fechaFin);
        contratos = contratos.filter(c => new Date(c.fecha_creacion) <= fechaFin);
      }
      
      return contratos;
    } catch (error) {
      console.error('Error buscando contratos:', error);
      return [];
    }
  }
}

// Crear instancia única
const contratosManager = new ContratosManager();

// Hacer disponible globalmente
window.contratosManager = contratosManager;

// Exportar
export { contratosManager };