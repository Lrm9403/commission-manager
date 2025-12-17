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

      // Obtener saldo disponible del contrato
      const contratosManager = window.contratosManager;
      const resultadoValidacion = await contratosManager.validarMontoCertificable(
        this.currentContrato, 
        certificacionData.monto_certificado
      );
      
      if (!resultadoValidacion.success) {
        return {
          success: false,
          error: resultadoValidacion.error,
          saldo_disponible: resultadoValidacion.saldo_disponible
        };
      }

      const montoCertificado = parseFloat(certificacionData.monto_certificado) || 0;
      
      // Usar comisión personalizada del contrato o default de la empresa
      let porcentajeComision = certificacionData.porcentaje_comision;
      if (!porcentajeComision) {
        const empresa = await localDB.get('empresas', contrato.empresa_id);
        porcentajeComision = contrato.comision_personalizada || empresa?.comision_default || 1.00;
      }

      // Calcular comisión SOLO sobre el monto certificado
      const comisionCalculada = (montoCertificado * porcentajeComision) / 100;
      
      // Validar que el mes sea una fecha válida
      let mes = certificacionData.mes;
      if (!mes) {
        return { 
          success: false, 
          error: 'Mes es requerido',
          saldo_disponible: resultadoValidacion.saldo_disponible
        };
      }
      
      // Si es string, convertir a Date
      if (typeof mes === 'string') {
        mes = new Date(mes);
        // Asegurarse de que sea el primer día del mes
        mes = new Date(mes.getFullYear(), mes.getMonth(), 1);
      }

      // Validar que no sea fecha futura
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (mes > hoy) {
        return {
          success: false,
          error: 'No se puede crear certificación para meses futuros',
          saldo_disponible: resultadoValidacion.saldo_disponible
        };
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
          error: 'Ya existe una certificación para este mes',
          saldo_disponible: resultadoValidacion.saldo_disponible
        };
      }

      // Guardar certificación localmente
      await localDB.add('certificaciones', certificacionCompleta);
      
      // ACTUALIZAR SALDO DISPONIBLE DEL CONTRATO
      const resultadoSaldo = await contratosManager.actualizarSaldoDisponible(
        this.currentContrato, 
        montoCertificado, 
        'restar'
      );

      if (!resultadoSaldo.success) {
        // Revertir la certificación si falla la actualización del saldo
        await localDB.delete('certificaciones', certificacionId);
        return {
          success: false,
          error: `Error actualizando saldo: ${resultadoSaldo.error}`,
          saldo_disponible: resultadoValidacion.saldo_disponible
        };
      }

      // Agregar a cola de sincronización
      await localDB.addToSyncQueue('INSERT', 'certificaciones', certificacionId, certificacionCompleta);

      return {
        success: true,
        certificacion: certificacionCompleta,
        saldo_disponible: resultadoSaldo.saldo_disponible,
        saldo_restante: resultadoValidacion.saldo_restante,
        message: `Certificación creada correctamente. Saldo disponible: ${resultadoSaldo.saldo_disponible.toFixed(2)}`
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

      // Obtener contrato
      const contrato = await localDB.get('contratos', certificacionActual.contrato_id);
      if (!contrato) {
        return {
          success: false,
          error: 'Contrato no encontrado'
        };
      }

      let montoAnterior = certificacionActual.monto_certificado || 0;
      let montoNuevo = certificacionData.monto_certificado !== undefined 
        ? parseFloat(certificacionData.monto_certificado) 
        : montoAnterior;
      
      // Si cambia el monto, validar saldo disponible
      if (certificacionData.monto_certificado !== undefined && 
          Math.abs(montoNuevo - montoAnterior) > 0.01) {
        
        const diferencia = montoNuevo - montoAnterior;
        
        if (diferencia > 0) {
          // Si se aumenta el monto, verificar que haya suficiente saldo
          const contratosManager = window.contratosManager;
          const resultadoValidacion = await contratosManager.validarMontoCertificable(
            certificacionActual.contrato_id, 
            diferencia
          );
          
          if (!resultadoValidacion.success) {
            return {
              success: false,
              error: `No se puede aumentar el monto: ${resultadoValidacion.error}`
            };
          }
        }
      }

      // Recalcular comisión si se cambia el monto o porcentaje
      let comisionCalculada = certificacionActual.comision_calculada;
      if (certificacionData.monto_certificado || certificacionData.porcentaje_comision) {
        const monto = montoNuevo;
        const porcentaje = certificacionData.porcentaje_comision || certificacionActual.porcentaje_comision;
        comisionCalculada = (monto * porcentaje) / 100;
      }

      const updatedData = {
        ...certificacionActual,
        ...certificacionData,
        monto_certificado: montoNuevo,
        comision_calculada: comisionCalculada,
        comision_editada: certificacionData.comision_editada || comisionCalculada,
        fecha_actualizacion: new Date().toISOString()
      };

      await localDB.update('certificaciones', updatedData);
      
      // Si cambió el monto, actualizar saldo del contrato
      if (certificacionData.monto_certificado !== undefined && 
          Math.abs(montoNuevo - montoAnterior) > 0.01) {
        
        const diferencia = montoNuevo - montoAnterior;
        const contratosManager = window.contratosManager;
        
        if (diferencia > 0) {
          // Restar la diferencia (aumentó el monto)
          await contratosManager.actualizarSaldoDisponible(
            certificacionActual.contrato_id, 
            diferencia, 
            'restar'
          );
        } else if (diferencia < 0) {
          // Sumar la diferencia (disminuyó el monto)
          await contratosManager.actualizarSaldoDisponible(
            certificacionActual.contrato_id, 
            Math.abs(diferencia), 
            'sumar'
          );
        }
      }

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

      const contratoId = certificacion.contrato_id;
      const montoCertificado = certificacion.monto_certificado || 0;
      
      // Obtener información del contrato antes de eliminar
      const contrato = await localDB.get('contratos', contratoId);
      const saldoAnterior = contrato?.saldo_disponible !== undefined 
        ? contrato.saldo_disponible 
        : contrato?.monto_base || 0;
      
      // Eliminar certificación
      await localDB.delete('certificaciones', id);
      
      // RESTAURAR SALDO DISPONIBLE DEL CONTRATO
      const contratosManager = window.contratosManager;
      const resultadoSaldo = await contratosManager.actualizarSaldoDisponible(
        contratoId, 
        montoCertificado, 
        'sumar'
      );

      await localDB.addToSyncQueue('DELETE', 'certificaciones', id, certificacion);

      return {
        success: true,
        saldo_restaurado: resultadoSaldo.saldo_disponible,
        saldo_anterior: saldoAnterior,
        monto_restaurado: montoCertificado,
        message: `Certificación eliminada correctamente. Saldo restaurado: ${resultadoSaldo.saldo_disponible.toFixed(2)}`
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

      // Obtener saldo disponible del contrato
      const contratosManager = window.contratosManager;
      const saldoDisponible = await contratosManager.getSaldoDisponible(this.currentContrato);

      return {
        totalCertificaciones,
        totalMonto,
        totalComisiones,
        certificacionesPagadas: pagadas.length,
        certificacionesPendientes: pendientes.length,
        totalPagado,
        totalPendiente,
        saldoDisponible: saldoDisponible || 0,
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

  // NUEVO MÉTODO: Obtener saldo disponible del contrato actual
  async getSaldoDisponible() {
    if (!this.currentContrato) return null;
    
    try {
      const contratosManager = window.contratosManager;
      return await contratosManager.getSaldoDisponible(this.currentContrato);
    } catch (error) {
      console.error('Error obteniendo saldo disponible:', error);
      return null;
    }
  }

  // NUEVO MÉTODO: Validar si un monto es certificable
  async validarMontoCertificable(monto) {
    if (!this.currentContrato) {
      return { success: false, error: 'No hay contrato seleccionado' };
    }

    try {
      const contratosManager = window.contratosManager;
      return await contratosManager.validarMontoCertificable(this.currentContrato, monto);
    } catch (error) {
      console.error('Error validando monto:', error);
      return { success: false, error: error.message };
    }
  }

  // NUEVO MÉTODO: Obtener límite máximo certificable
  async getLimiteMaximoCertificable() {
    if (!this.currentContrato) return 0;
    
    try {
      const saldo = await this.getSaldoDisponible();
      return saldo || 0;
    } catch (error) {
      console.error('Error obteniendo límite máximo:', error);
      return 0;
    }
  }

  // Generar reporte en formato CSV
  async generarReporteCSV() {
    try {
      const certificaciones = await this.getCertificaciones();
      const contrato = await localDB.get('contratos', this.currentContrato);
      const estadisticas = await this.getEstadisticas();
      
      if (!certificaciones.length || !contrato) {
        return null;
      }

      let csv = 'Contrato,Empresa,Mes,Monto Certificado,Porcentaje Comisión,Comisión Calculada,Comisión Editada,Estado,Pagado,Notas\n';
      
      // Obtener nombre de la empresa
      const empresa = await localDB.get('empresas', contrato.empresa_id);
      const empresaNombre = empresa?.nombre || 'Empresa no encontrada';
      
      certificaciones.forEach(cert => {
        const mes = new Date(cert.mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const monto = cert.monto_certificado.toFixed(2);
        const porcentaje = cert.porcentaje_comision.toFixed(2);
        const comisionCalc = cert.comision_calculada.toFixed(2);
        const comisionEdit = cert.comision_editada.toFixed(2);
        const estado = cert.pagado ? 'Pagado' : 'Pendiente';
        const pagado = cert.pagado ? 'Sí' : 'No';
        const notas = cert.notas ? `"${cert.notas.replace(/"/g, '""')}"` : '';
        
        csv += `${contrato.nombre},${empresaNombre},${mes},${monto},${porcentaje}%,${comisionCalc},${comisionEdit},${estado},${pagado},${notas}\n`;
      });

      // Agregar resumen
      csv += '\nRESUMEN\n';
      csv += `Total Certificaciones:,${estadisticas.totalCertificaciones}\n`;
      csv += `Total Monto Certificado:,${estadisticas.totalMonto.toFixed(2)}\n`;
      csv += `Total Comisiones:,${estadisticas.totalComisiones.toFixed(2)}\n`;
      csv += `Comisiones Pagadas:,${estadisticas.totalPagado.toFixed(2)}\n`;
      csv += `Comisiones Pendientes:,${estadisticas.totalPendiente.toFixed(2)}\n`;
      csv += `Saldo Disponible:,${estadisticas.saldoDisponible.toFixed(2)}\n`;

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
