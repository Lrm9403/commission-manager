// Sistema de gestión de pagos - Commission Manager Pro
import { localDB } from './db.js';

class PagosManager {
  constructor() {
    this.currentEmpresa = null;
  }

  async setEmpresa(empresaId) {
    this.currentEmpresa = empresaId;
  }

  async createPago(pagoData) {
    if (!this.currentEmpresa) {
      return {
        success: false,
        error: 'Selecciona una empresa primero'
      };
    }

    try {
      const pagoId = `pago_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const pagoCompleto = {
        id: pagoId,
        empresa_id: this.currentEmpresa,
        ...pagoData,
        monto_total: parseFloat(pagoData.monto_total) || 0,
        metodo: pagoData.metodo || 'transferencia',
        fecha_pago: pagoData.fecha_pago || new Date().toISOString().split('T')[0],
        notas: pagoData.notas || '',
        fecha_creacion: new Date().toISOString()
      };

      // Validaciones
      if (pagoCompleto.monto_total <= 0) {
        return { success: false, error: 'El monto debe ser mayor a 0' };
      }

      if (!pagoCompleto.tipo || !['especifico', 'global'].includes(pagoCompleto.tipo)) {
        return { success: false, error: 'Tipo de pago inválido. Debe ser "especifico" o "global"' };
      }

      // Si es pago específico, validar que tenga contrato
      if (pagoCompleto.tipo === 'especifico' && !pagoCompleto.contrato_id) {
        return { success: false, error: 'Los pagos específicos requieren un contrato' };
      }

      // Guardar localmente
      await localDB.add('pagos', pagoCompleto);
      
      // Si es pago global, crear distribución automática
      if (pagoCompleto.tipo === 'global') {
        await this.distribuirPagoGlobal(pagoId, pagoCompleto.monto_total);
      }
      
      // Si es pago específico, crear distribución específica
      if (pagoCompleto.tipo === 'especifico' && pagoCompleto.contrato_id) {
        await this.crearDistribucionEspecifica(pagoId, pagoCompleto.contrato_id, pagoCompleto.monto_total);
      }

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

  async distribuirPagoGlobal(pagoId, montoTotal) {
    try {
      // Obtener todas las certificaciones pendientes de la empresa
      const contratos = await localDB.getContratosByEmpresa(this.currentEmpresa);
      let certificacionesPendientes = [];
      
      for (const contrato of contratos) {
        const certs = await localDB.getCertificacionesByContrato(contrato.id);
        const pendientes = certs.filter(c => !c.pagado);
        certificacionesPendientes.push(...pendientes.map(c => ({
          ...c,
          contrato_id: contrato.id
        })));
      }

      if (certificacionesPendientes.length === 0) {
        console.log('No hay certificaciones pendientes para distribuir');
        return;
      }

      // Calcular total de comisiones pendientes
      const totalPendiente = certificacionesPendientes.reduce((sum, c) => 
        sum + (c.comision_editada || c.comision_calculada || 0), 0
      );

      if (totalPendiente === 0) return;

      // Distribuir proporcionalmente
      let montoRestante = montoTotal;
      const distribuciones = [];

      for (const cert of certificacionesPendientes) {
        const comision = cert.comision_editada || cert.comision_calculada || 0;
        const porcentaje = comision / totalPendiente;
        let montoAsignado = Math.min(comision, montoTotal * porcentaje);
        
        // Ajustar para no exceder el monto restante
        montoAsignado = Math.min(montoAsignado, montoRestante);
        
        if (montoAsignado > 0) {
          const distribucionId = `dist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          const distribucion = {
            id: distribucionId,
            pago_id: pagoId,
            contrato_id: cert.contrato_id,
            monto_asignado: montoAsignado,
            fecha_creacion: new Date().toISOString()
          };

          await localDB.add('pagos_distribucion', distribucion);
          await localDB.addToSyncQueue('INSERT', 'pagos_distribucion', distribucionId, distribucion);
          
          distribuciones.push(distribucion);
          montoRestante -= montoAsignado;
          
          // Actualizar certificación como pagada si se cubrió completamente
          if (montoAsignado >= comision) {
            await this.marcarCertificacionComoPagada(cert.id, pagoId);
          }
        }
      }

      console.log(`Distribuido pago global: ${distribuciones.length} distribuciones creadas`);
      return distribuciones;
    } catch (error) {
      console.error('Error distribuyendo pago global:', error);
    }
  }

  async crearDistribucionEspecifica(pagoId, contratoId, monto) {
    try {
      const distribucionId = `dist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const distribucion = {
        id: distribucionId,
        pago_id: pagoId,
        contrato_id: contratoId,
        monto_asignado: monto,
        fecha_creacion: new Date().toISOString()
      };

      await localDB.add('pagos_distribucion', distribucion);
      await localDB.addToSyncQueue('INSERT', 'pagos_distribucion', distribucionId, distribucion);

      // Marcar certificaciones como pagadas (hasta el monto asignado)
      await this.aplicarPagoACertificaciones(contratoId, monto, pagoId);

      return distribucion;
    } catch (error) {
      console.error('Error creando distribución específica:', error);
    }
  }

  async aplicarPagoACertificaciones(contratoId, montoDisponible, pagoId) {
    try {
      const certificaciones = await localDB.getCertificacionesByContrato(contratoId);
      const pendientes = certificaciones.filter(c => !c.pagado).sort((a, b) => 
        new Date(a.mes) - new Date(b.mes) // Más antiguas primero
      );

      let montoRestante = montoDisponible;

      for (const cert of pendientes) {
        if (montoRestante <= 0) break;

        const comision = cert.comision_editada || cert.comision_calculada || 0;
        
        if (montoRestante >= comision) {
          // Pagar certificación completa
          await this.marcarCertificacionComoPagada(cert.id, pagoId);
          montoRestante -= comision;
        } else {
          // Pagar parcialmente (en casos futuros podríamos manejar pagos parciales)
          console.log(`Pago insuficiente para certificación ${cert.id}. Se necesita ${comision}, disponible ${montoRestante}`);
          break;
        }
      }

      return montoRestante;
    } catch (error) {
      console.error('Error aplicando pago a certificaciones:', error);
    }
  }

  async marcarCertificacionComoPagada(certificacionId, pagoId) {
    try {
      const certificacion = await localDB.get('certificaciones', certificacionId);
      if (!certificacion) return;

      const updatedCert = {
        ...certificacion,
        pagado: true,
        pago_id: pagoId,
        fecha_actualizacion: new Date().toISOString()
      };

      await localDB.update('certificaciones', updatedCert);
      await localDB.addToSyncQueue('UPDATE', 'certificaciones', certificacionId, updatedCert);
    } catch (error) {
      console.error('Error marcando certificación como pagada:', error);
    }
  }

  async getPagos(filtros = {}) {
    if (!this.currentEmpresa) return [];
    
    try {
      let pagos = await localDB.getPagosByEmpresa(this.currentEmpresa);
      
      // Aplicar filtros
      if (filtros.tipo) {
        pagos = pagos.filter(p => p.tipo === filtros.tipo);
      }
      
      if (filtros.fechaInicio) {
        const fechaInicio = new Date(filtros.fechaInicio);
        pagos = pagos.filter(p => new Date(p.fecha_pago) >= fechaInicio);
      }
      
      if (filtros.fechaFin) {
        const fechaFin = new Date(filtros.fechaFin);
        pagos = pagos.filter(p => new Date(p.fecha_pago) <= fechaFin);
      }
      
      if (filtros.metodo) {
        pagos = pagos.filter(p => p.metodo === filtros.metodo);
      }
      
      // Ordenar por fecha (más recientes primero)
      pagos.sort((a, b) => new Date(b.fecha_pago) - new Date(a.fecha_pago));
      
      // Obtener distribuciones para cada pago
      for (const pago of pagos) {
        pago.distribuciones = await this.getDistribucionesByPago(pago.id);
      }
      
      return pagos;
    } catch (error) {
      console.error('Error obteniendo pagos:', error);
      return [];
    }
  }

  async getDistribucionesByPago(pagoId) {
    try {
      return await localDB.getAllByIndex('pagos_distribucion', 'pago_id', pagoId);
    } catch (error) {
      console.error('Error obteniendo distribuciones:', error);
      return [];
    }
  }

  async getPago(id) {
    try {
      const pago = await localDB.get('pagos', id);
      if (pago) {
        pago.distribuciones = await this.getDistribucionesByPago(id);
      }
      return pago;
    } catch (error) {
      console.error('Error obteniendo pago:', error);
      return null;
    }
  }

  async updatePago(id, pagoData) {
    try {
      const pagoActual = await localDB.get('pagos', id);
      if (!pagoActual) {
        return {
          success: false,
          error: 'Pago no encontrado'
        };
      }

      // No permitir cambiar el tipo si ya tiene distribuciones
      if (pagoData.tipo && pagoData.tipo !== pagoActual.tipo) {
        const distribuciones = await this.getDistribucionesByPago(id);
        if (distribuciones.length > 0) {
          return {
            success: false,
            error: 'No se puede cambiar el tipo de pago porque ya tiene distribuciones asociadas'
          };
        }
      }

      const updatedData = {
        ...pagoActual,
        ...pagoData,
        fecha_actualizacion: new Date().toISOString()
      };

      // Actualizar monto total si se cambia
      if (pagoData.monto_total && pagoData.monto_total !== pagoActual.monto_total) {
        // En una implementación completa, aquí se redistribuiría el pago
        console.log('Monto cambiado, se requiere redistribución manual');
      }

      await localDB.update('pagos', updatedData);
      await localDB.addToSyncQueue('UPDATE', 'pagos', id, updatedData);

      return {
        success: true,
        pago: updatedData,
        message: 'Pago actualizado correctamente'
      };
    } catch (error) {
      console.error('Error actualizando pago:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deletePago(id) {
    try {
      const pago = await localDB.get('pagos', id);
      if (!pago) {
        return {
          success: false,
          error: 'Pago no encontrado'
        };
      }

      // Eliminar distribuciones asociadas
      const distribuciones = await this.getDistribucionesByPago(id);
      for (const dist of distribuciones) {
        await localDB.delete('pagos_distribucion', dist.id);
        await localDB.addToSyncQueue('DELETE', 'pagos_distribucion', dist.id, dist);
      }

      // Revertir certificaciones marcadas como pagadas
      await this.revertirCertificacionesPagadas(id);

      await localDB.delete('pagos', id);
      await localDB.addToSyncQueue('DELETE', 'pagos', id, pago);

      return {
        success: true,
        message: 'Pago eliminado correctamente'
      };
    } catch (error) {
      console.error('Error eliminando pago:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async revertirCertificacionesPagadas(pagoId) {
    try {
      const certificaciones = await localDB.getAll('certificaciones');
      const certificacionesDelPago = certificaciones.filter(c => c.pago_id === pagoId);
      
      for (const cert of certificacionesDelPago) {
        const updatedCert = {
          ...cert,
          pagado: false,
          pago_id: null,
          fecha_actualizacion: new Date().toISOString()
        };
        
        await localDB.update('certificaciones', updatedCert);
        await localDB.addToSyncQueue('UPDATE', 'certificaciones', cert.id, updatedCert);
      }
    } catch (error) {
      console.error('Error revirtiendo certificaciones:', error);
    }
  }

  async getEstadisticasPagos() {
    if (!this.currentEmpresa) return null;
    
    try {
      const pagos = await this.getPagos();
      
      const totalPagos = pagos.length;
      const totalMonto = pagos.reduce((sum, p) => sum + (p.monto_total || 0), 0);
      
      const pagosEspecificos = pagos.filter(p => p.tipo === 'especifico');
      const pagosGlobales = pagos.filter(p => p.tipo === 'global');
      
      const montoEspecificos = pagosEspecificos.reduce((sum, p) => sum + (p.monto_total || 0), 0);
      const montoGlobales = pagosGlobales.reduce((sum, p) => sum + (p.monto_total || 0), 0);
      
      // Agrupar por método de pago
      const porMetodo = {};
      pagos.forEach(pago => {
        const metodo = pago.metodo || 'desconocido';
        porMetodo[metodo] = (porMetodo[metodo] || 0) + (pago.monto_total || 0);
      });
      
      // Estadísticas mensuales (últimos 6 meses)
      const meses = Array(6).fill().map((_, i) => {
        const fecha = new Date();
        fecha.setMonth(fecha.getMonth() - i);
        return {
          mes: fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
          año: fecha.getFullYear(),
          mesNum: fecha.getMonth() + 1,
          total: 0,
          count: 0
        };
      }).reverse();

      pagos.forEach(pago => {
        const fechaPago = new Date(pago.fecha_pago);
        const mesIndex = meses.findIndex(m => 
          m.año === fechaPago.getFullYear() && m.mesNum === (fechaPago.getMonth() + 1)
        );
        
        if (mesIndex >= 0) {
          meses[mesIndex].total += pago.monto_total || 0;
          meses[mesIndex].count++;
        }
      });

      return {
        totalPagos,
        totalMonto,
        pagosEspecificos: pagosEspecificos.length,
        pagosGlobales: pagosGlobales.length,
        montoEspecificos,
        montoGlobales,
        porMetodo,
        estadisticasMensuales: meses,
        promedioMonto: totalPagos > 0 ? totalMonto / totalPagos : 0
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas de pagos:', error);
      return null;
    }
  }

  async generarReportePagosCSV() {
    try {
      const pagos = await this.getPagos();
      const empresa = await localDB.get('empresas', this.currentEmpresa);
      
      if (!pagos.length || !empresa) {
        return null;
      }

      let csv = 'Fecha,Tipo,Método,Monto Total,Notas,Contratos Asociados\n';
      
      for (const pago of pagos) {
        const fecha = new Date(pago.fecha_pago).toLocaleDateString('es-ES');
        const tipo = pago.tipo === 'especifico' ? 'Específico' : 'Global';
        const metodo = pago.metodo || 'No especificado';
        const monto = pago.monto_total.toFixed(2);
        const notas = pago.notas ? `"${pago.notas.replace(/"/g, '""')}"` : '';
        
        let contratosAsociados = '';
        if (pago.distribuciones && pago.distribuciones.length > 0) {
          const contratosIds = [...new Set(pago.distribuciones.map(d => d.contrato_id))];
          contratosAsociados = `"${contratosIds.join(', ')}"`;
        }
        
        csv += `${fecha},${tipo},${metodo},${monto},${notas},${contratosAsociados}\n`;
      }

      return csv;
    } catch (error) {
      console.error('Error generando reporte de pagos:', error);
      return null;
    }
  }
}

// Crear instancia única
const pagosManager = new PagosManager();

// Hacer disponible globalmente
window.pagosManager = pagosManager;

// Exportar
export { pagosManager };