// Sistema de gestión de certificaciones - Commission Manager Pro
import { localDB } from './db.js';

class CertificacionesManager {
  constructor() {
    this.currentContrato = null;
  }

  async setContrato(contratoId) {
    this.currentContrato = contratoId;
  }

  async createCertificacion(certificacionData) {
    if (!this.currentContrato) {
      return {
        success: false,
        error: 'Selecciona un contrato primero'
      };
    }

    try {
      const certificacionId = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Obtener contrato para validar
      const contrato = await localDB.get('contratos', this.currentContrato);
      if (!contrato) {
        return {
          success: false,
          error: 'Contrato no encontrado'
        };
      }

      // Usar comisión personalizada del contrato o default de la empresa
      let porcentajeComision = certificacionData.porcentaje_comision;
      if (!porcentajeComision) {
        const empresa = await localDB.get('empresas', contrato.empresa_id);
        porcentajeComision = contrato.comision_personalizada || empresa?.comision_default || 1.00;
      }

      // Calcular comisión
      const montoCertificado = parseFloat(certificacionData.monto_certificado) || 0;
      const comisionCalculada = (montoCertificado * porcentajeComision) / 100;
      
      // Validar que el mes sea una fecha válida
      let mes = certificacionData.mes;
      if (!mes) {
        return { success: false, error: 'Mes es requerido' };
      }
      
      // Si es string, convertir a Date
      if (typeof mes === 'string') {
        mes = new Date(mes);
        // Asegurarse de que sea el primer día del mes
        mes = new Date(mes.getFullYear(), mes.getMonth(), 1);
      }

      const certificacionCompleta = {
        id: certificacionId,
        contrato_id: this.currentContrato,
        suplemento_id: certificacionData.suplemento_id || null,
        mes: mes.toISOString().split('T')[0], // Solo fecha YYYY-MM-DD
        monto_certificado: montoCertificado,
        porcentaje_comision: porcentajeComision,
        comision_calculada: comisionCalculada,
        comision_editada: certificacionData.comision_editada || comisionCalculada,
        pagado: certificacionData.pagado || false,
        notas: certificacionData.notas || '',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
      };

      // Validar que no exista certificación para el mismo mes
      const existingCerts = await localDB.getCertificacionesByContrato(this.currentContrato);
      const exists = existingCerts.some(c => {
        const certMonth = new Date(c.mes).toISOString().split('T')[0];
        return certMonth === certificacionCompleta.mes;
      });

      if (exists) {
        return {
          success: false,
          error: 'Ya existe una certificación para este mes'
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

  async getCertificaciones() {
    if (!this.currentContrato) return [];
    
    try {
      const certificaciones = await localDB.getCertificacionesByContrato(this.currentContrato);
      
      // Ordenar por mes (más reciente primero)
      return certificaciones.sort((a, b) => 
        new Date(b.mes) - new Date(a.mes)
      );
    } catch (error) {
      console.error('Error obteniendo certificaciones:', error);
      return [];
    }
  }

  async getCertificacion(id) {
    try {
      return await localDB.get('certificaciones', id);
    } catch (error) {
      console.error('Error obteniendo certificación:', error);
      return null;
    }
  }

  async updateCertificacion(id, certificacionData) {
    try {
      const certificacionActual = await localDB.get('certificaciones', id);
      if (!certificacionActual) {
        return {
          success: false,
          error: 'Certificación no encontrada'
        };
      }

      // Recalcular comisión si se cambia el monto o porcentaje
      let comisionCalculada = certificacionActual.comision_calculada;
      if (certificacionData.monto_certificado || certificacionData.porcentaje_comision) {
        const monto = certificacionData.monto_certificado || certificacionActual.monto_certificado;
        const porcentaje = certificacionData.porcentaje_comision || certificacionActual.porcentaje_comision;
        comisionCalculada = (monto * porcentaje) / 100;
      }

      const updatedData = {
        ...certificacionActual,
        ...certificacionData,
        comision_calculada: comisionCalculada,
        comision_editada: certificacionData.comision_editada || comisionCalculada,
        fecha_actualizacion: new Date().toISOString()
      };

      await localDB.update('certificaciones', updatedData);
      await localDB.addToSyncQueue('UPDATE', 'certificaciones', id, updatedData);

      return {
        success: true,
        certificacion: updatedData,
        message: 'Certificación actualizada correctamente'
      };
    } catch (error) {
      console.error('Error actualizando certificación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteCertificacion(id) {
    try {
      const certificacion = await localDB.get('certificaciones', id);
      if (!certificacion) {
        return {
          success: false,
          error: 'Certificación no encontrada'
        };
      }

      await localDB.delete('certificaciones', id);
      await localDB.addToSyncQueue('DELETE', 'certificaciones', id, certificacion);

      return {
        success: true,
        message: 'Certificación eliminada correctamente'
      };
    } catch (error) {
      console.error('Error eliminando certificación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async marcarComoPagada(id) {
    return this.updateCertificacion(id, { pagado: true });
  }

  async getEstadisticas() {
    if (!this.currentContrato) return null;
    
    try {
      const certificaciones = await this.getCertificaciones();
      
      const totalCertificaciones = certificaciones.length;
      const totalMonto = certificaciones.reduce((sum, c) => sum + (c.monto_certificado || 0), 0);
      const totalComisiones = certificaciones.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
      const pagadas = certificaciones.filter(c => c.pagado);
      const pendientes = certificaciones.filter(c => !c.pagado);
      
      const totalPagado = pagadas.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
      const totalPendiente = pendientes.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);

      return {
        totalCertificaciones,
        totalMonto,
        totalComisiones,
        certificacionesPagadas: pagadas.length,
        certificacionesPendientes: pendientes.length,
        totalPagado,
        totalPendiente,
        porcentajePagado: totalComisiones > 0 ? (totalPagado / totalComisiones) * 100 : 0
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return null;
    }
  }

  async getCertificacionesPorMes(año, mes) {
    try {
      const allCerts = await this.getCertificaciones();
      const targetDate = new Date(año, mes - 1, 1).toISOString().split('T')[0];
      
      return allCerts.filter(c => {
        const certDate = new Date(c.mes).toISOString().split('T')[0];
        return certDate === targetDate;
      });
    } catch (error) {
      console.error('Error obteniendo certificaciones por mes:', error);
      return [];
    }
  }

  async getResumenAnual(año) {
    try {
      const certificaciones = await this.getCertificaciones();
      const resumen = Array(12).fill().map(() => ({
        monto: 0,
        comisiones: 0,
        count: 0
      }));

      certificaciones.forEach(cert => {
        const fecha = new Date(cert.mes);
        if (fecha.getFullYear() === año) {
          const mes = fecha.getMonth();
          resumen[mes].monto += cert.monto_certificado || 0;
          resumen[mes].comisiones += cert.comision_editada || cert.comision_calculada || 0;
          resumen[mes].count++;
        }
      });

      return resumen;
    } catch (error) {
      console.error('Error obteniendo resumen anual:', error);
      return Array(12).fill().map(() => ({ monto: 0, comisiones: 0, count: 0 }));
    }
  }

  // Generar reporte en formato CSV
  async generarReporteCSV() {
    try {
      const certificaciones = await this.getCertificaciones();
      const contrato = await localDB.get('contratos', this.currentContrato);
      
      if (!certificaciones.length || !contrato) {
        return null;
      }

      let csv = 'Mes,Monto Certificado,Porcentaje Comisión,Comisión Calculada,Comisión Editada,Estado,Pagado,Notas\n';
      
      certificaciones.forEach(cert => {
        const mes = new Date(cert.mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const monto = cert.monto_certificado.toFixed(2);
        const porcentaje = cert.porcentaje_comision.toFixed(2);
        const comisionCalc = cert.comision_calculada.toFixed(2);
        const comisionEdit = cert.comision_editada.toFixed(2);
        const estado = cert.pagado ? 'Pagado' : 'Pendiente';
        const pagado = cert.pagado ? 'Sí' : 'No';
        const notas = cert.notas ? `"${cert.notas.replace(/"/g, '""')}"` : '';
        
        csv += `${mes},${monto},${porcentaje}%,${comisionCalc},${comisionEdit},${estado},${pagado},${notas}\n`;
      });

      return csv;
    } catch (error) {
      console.error('Error generando reporte CSV:', error);
      return null;
    }
  }
}

// Crear instancia única
const certificacionesManager = new CertificacionesManager();

// Hacer disponible globalmente
window.certificacionesManager = certificacionesManager;

// Exportar
export { certificacionesManager };