// Sistema de reportes y estadísticas - Commission Manager Pro
import { localDB } from './db.js';

class ReportesManager {
  constructor() {
    this.formatoMoneda = 'USD';
  }

  setFormatoMoneda(moneda) {
    this.formatoMoneda = moneda;
  }

  formatMoneda(valor) {
    const formatter = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: this.formatoMoneda,
      minimumFractionDigits: 2
    });
    return formatter.format(valor);
  }

  async generarReporteEmpresa(empresaId, periodo = 'mes') {
    try {
      const empresa = await localDB.get('empresas', empresaId);
      if (!empresa) {
        return { error: 'Empresa no encontrada' };
      }

      const contratos = await localDB.getContratosByEmpresa(empresaId);
      const estadisticasContratos = [];
      let totalMontoContratos = 0;
      let totalCertificaciones = 0;
      let totalComisiones = 0;
      let totalComisionesPagadas = 0;

      for (const contrato of contratos) {
        const certificaciones = await localDB.getCertificacionesByContrato(contrato.id);
        const suplementos = await localDB.getAllByIndex('suplementos', 'contrato_id', contrato.id);
        
        const montoSuplementos = suplementos.reduce((sum, s) => sum + (s.monto || 0), 0);
        const montoCertificado = certificaciones.reduce((sum, c) => sum + (c.monto_certificado || 0), 0);
        const comisiones = certificaciones.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
        const comisionesPagadas = certificaciones
          .filter(c => c.pagado)
          .reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
        
        const estadistica = {
          contrato: contrato.nombre,
          numero: contrato.numero_contrato,
          estado: contrato.estado,
          montoBase: contrato.monto_base,
          montoSuplementos,
          montoTotal: contrato.monto_base + montoSuplementos,
          montoCertificado,
          porcentajeAvance: contrato.monto_base > 0 ? (montoCertificado / contrato.monto_base) * 100 : 0,
          certificaciones: certificaciones.length,
          comisiones,
          comisionesPagadas,
          comisionesPendientes: comisiones - comisionesPagadas
        };

        estadisticasContratos.push(estadistica);
        
        totalMontoContratos += contrato.monto_base + montoSuplementos;
        totalCertificaciones += certificaciones.length;
        totalComisiones += comisiones;
        totalComisionesPagadas += comisionesPagadas;
      }

      // Obtener pagos de la empresa
      const pagos = await localDB.getPagosByEmpresa(empresaId);
      const totalPagos = pagos.reduce((sum, p) => sum + (p.monto_total || 0), 0);

      return {
        empresa: {
          nombre: empresa.nombre,
          director: empresa.director,
          comisionDefault: empresa.comision_default
        },
        resumen: {
          totalContratos: contratos.length,
          totalMontoContratos,
          totalCertificaciones,
          totalComisiones,
          totalComisionesPagadas,
          totalComisionesPendientes: totalComisiones - totalComisionesPagadas,
          totalPagos,
          saldoPendiente: totalComisiones - totalComisionesPagadas - totalPagos
        },
        contratos: estadisticasContratos,
        periodo: this.getPeriodoActual(periodo),
        generado: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generando reporte de empresa:', error);
      return { error: error.message };
    }
  }

  async generarReporteContrato(contratoId) {
    try {
      const contrato = await localDB.get('contratos', contratoId);
      if (!contrato) {
        return { error: 'Contrato no encontrado' };
      }

      const empresa = await localDB.get('empresas', contrato.empresa_id);
      const certificaciones = await localDB.getCertificacionesByContrato(contratoId);
      const suplementos = await localDB.getAllByIndex('suplementos', 'contrato_id', contratoId);
      const pagos = await localDB.getAll('pagos_distribucion')
        .then(dists => dists.filter(d => {
          // Obtener contrato de la distribución
          return d.contrato_id === contratoId;
        }));

      // Ordenar certificaciones por mes
      certificaciones.sort((a, b) => new Date(a.mes) - new Date(b.mes));

      // Calcular estadísticas
      const montoSuplementos = suplementos.reduce((sum, s) => sum + (s.monto || 0), 0);
      const montoCertificado = certificaciones.reduce((sum, c) => sum + (c.monto_certificado || 0), 0);
      const comisiones = certificaciones.reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
      const comisionesPagadas = certificaciones
        .filter(c => c.pagado)
        .reduce((sum, c) => sum + (c.comision_editada || c.comision_calculada || 0), 0);
      
      const pagosAsignados = pagos.reduce((sum, p) => sum + (p.monto_asignado || 0), 0);

      // Resumen por mes
      const resumenMensual = {};
      certificaciones.forEach(cert => {
        const mes = new Date(cert.mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        if (!resumenMensual[mes]) {
          resumenMensual[mes] = {
            montoCertificado: 0,
            comisiones: 0,
            count: 0
          };
        }
        resumenMensual[mes].montoCertificado += cert.monto_certificado || 0;
        resumenMensual[mes].comisiones += cert.comision_editada || cert.comision_calculada || 0;
        resumenMensual[mes].count++;
      });

      return {
        contrato: {
          nombre: contrato.nombre,
          numero: contrato.numero_contrato,
          estado: contrato.estado,
          fechaInicio: contrato.fecha_inicio,
          fechaFin: contrato.fecha_fin,
          montoBase: contrato.monto_base,
          comisionPersonalizada: contrato.comision_personalizada,
          notas: contrato.notas
        },
        empresa: empresa ? {
          nombre: empresa.nombre,
          director: empresa.director
        } : null,
        estadisticas: {
          montoTotal: contrato.monto_base + montoSuplementos,
          montoSuplementos,
          montoCertificado,
          porcentajeAvance: contrato.monto_base > 0 ? (montoCertificado / contrato.monto_base) * 100 : 0,
          totalCertificaciones: certificaciones.length,
          totalSuplementos: suplementos.length,
          comisionesTotales: comisiones,
          comisionesPagadas,
          comisionesPendientes: comisiones - comisionesPagadas,
          pagosAsignados,
          saldo: comisiones - comisionesPagadas - pagosAsignados
        },
        certificaciones: certificaciones.map(cert => ({
          mes: new Date(cert.mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
          montoCertificado: cert.monto_certificado,
          porcentajeComision: cert.porcentaje_comision,
          comisionCalculada: cert.comision_calculada,
          comisionEditada: cert.comision_editada,
          pagado: cert.pagado,
          notas: cert.notas
        })),
        suplementos: suplementos.map(sup => ({
          descripcion: sup.descripcion,
          monto: sup.monto,
          fecha: sup.fecha_suplemento
        })),
        resumenMensual,
        generado: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generando reporte de contrato:', error);
      return { error: error.message };
    }
  }

  async generarReporteGeneral(usuarioId) {
    try {
      const empresas = await localDB.getEmpresasByUsuario(usuarioId);
      const reporteEmpresas = [];
      let totalGeneral = {
        empresas: 0,
        contratos: 0,
        montoTotal: 0,
        certificaciones: 0,
        comisiones: 0,
        comisionesPagadas: 0,
        pagos: 0
      };

      for (const empresa of empresas) {
        const reporte = await this.generarReporteEmpresa(empresa.id);
        if (!reporte.error) {
          reporteEmpresas.push({
            empresa: reporte.empresa.nombre,
            ...reporte.resumen
          });

          totalGeneral.empresas++;
          totalGeneral.contratos += reporte.resumen.totalContratos;
          totalGeneral.montoTotal += reporte.resumen.totalMontoContratos;
          totalGeneral.certificaciones += reporte.resumen.totalCertificaciones;
          totalGeneral.comisiones += reporte.resumen.totalComisiones;
          totalGeneral.comisionesPagadas += reporte.resumen.totalComisionesPagadas;
          totalGeneral.pagos += reporte.resumen.totalPagos;
        }
      }

      // Tendencia mensual (últimos 6 meses)
      const tendenciaMensual = await this.calcularTendenciaMensual(usuarioId);

      return {
        resumenGeneral: totalGeneral,
        empresas: reporteEmpresas,
        tendenciaMensual,
        periodo: this.getPeriodoActual('anual'),
        generado: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generando reporte general:', error);
      return { error: error.message };
    }
  }

  async calcularTendenciaMensual(usuarioId) {
    try {
      const meses = Array(6).fill().map((_, i) => {
        const fecha = new Date();
        fecha.setMonth(fecha.getMonth() - i);
        return {
          mes: fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
          año: fecha.getFullYear(),
          mesNum: fecha.getMonth() + 1,
          comisiones: 0,
          pagos: 0,
          certificaciones: 0
        };
      }).reverse();

      const empresas = await localDB.getEmpresasByUsuario(usuarioId);
      
      for (const empresa of empresas) {
        const contratos = await localDB.getContratosByEmpresa(empresa.id);
        
        for (const contrato of contratos) {
          const certificaciones = await localDB.getCertificacionesByContrato(contrato.id);
          
          certificaciones.forEach(cert => {
            const fechaCert = new Date(cert.mes);
            const mesIndex = meses.findIndex(m => 
              m.año === fechaCert.getFullYear() && m.mesNum === (fechaCert.getMonth() + 1)
            );
            
            if (mesIndex >= 0) {
              meses[mesIndex].certificaciones++;
              meses[mesIndex].comisiones += cert.comision_editada || cert.comision_calculada || 0;
              
              if (cert.pagado) {
                meses[mesIndex].pagos += cert.comision_editada || cert.comision_calculada || 0;
              }
            }
          });
        }
      }

      return meses;
    } catch (error) {
      console.error('Error calculando tendencia mensual:', error);
      return [];
    }
  }

  getPeriodoActual(tipo) {
    const ahora = new Date();
    
    switch(tipo) {
      case 'dia':
        return ahora.toLocaleDateString('es-ES');
      case 'semana':
        const inicioSemana = new Date(ahora);
        inicioSemana.setDate(ahora.getDate() - ahora.getDay());
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(inicioSemana.getDate() + 6);
        return `${inicioSemana.toLocaleDateString('es-ES')} - ${finSemana.toLocaleDateString('es-ES')}`;
      case 'mes':
        return ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      case 'anual':
        return ahora.getFullYear().toString();
      default:
        return ahora.toLocaleDateString('es-ES');
    }
  }

  async exportarReporteCSV(reporte, tipo) {
    try {
      let csv = '';
      
      switch(tipo) {
        case 'empresa':
          csv = this.generarCSVEmpresa(reporte);
          break;
        case 'contrato':
          csv = this.generarCSVContrato(reporte);
          break;
        case 'general':
          csv = this.generarCSVGeneral(reporte);
          break;
        default:
          return null;
      }
      
      return csv;
    } catch (error) {
      console.error('Error exportando reporte CSV:', error);
      return null;
    }
  }

  generarCSVEmpresa(reporte) {
    let csv = `Reporte de Empresa: ${reporte.empresa.nombre}\n`;
    csv += `Generado: ${new Date(reporte.generado).toLocaleDateString('es-ES')}\n\n`;
    
    csv += 'RESUMEN GENERAL\n';
    csv += 'Total Contratos,Monto Total Contratos,Total Certificaciones,Total Comisiones,Comisiones Pagadas,Comisiones Pendientes,Total Pagos,Saldo Pendiente\n';
    csv += `${reporte.resumen.totalContratos},${this.formatMoneda(reporte.resumen.totalMontoContratos)},${reporte.resumen.totalCertificaciones},${this.formatMoneda(reporte.resumen.totalComisiones)},${this.formatMoneda(reporte.resumen.totalComisionesPagadas)},${this.formatMoneda(reporte.resumen.totalComisionesPendientes)},${this.formatMoneda(reporte.resumen.totalPagos)},${this.formatMoneda(reporte.resumen.saldoPendiente)}\n\n`;
    
    csv += 'DETALLE DE CONTRATOS\n';
    csv += 'Contrato,Número,Estado,Monto Base,Suplementos,Monto Total,Monto Certificado,% Avance,Certificaciones,Comisiones,Comisiones Pagadas,Comisiones Pendientes\n';
    
    reporte.contratos.forEach(cto => {
      csv += `"${cto.contrato}","${cto.numero}","${cto.estado}",${this.formatMoneda(cto.montoBase)},${this.formatMoneda(cto.montoSuplementos)},${this.formatMoneda(cto.montoTotal)},${this.formatMoneda(cto.montoCertificado)},${cto.porcentajeAvance.toFixed(2)}%,${cto.certificaciones},${this.formatMoneda(cto.comisiones)},${this.formatMoneda(cto.comisionesPagadas)},${this.formatMoneda(cto.comisionesPendientes)}\n`;
    });
    
    return csv;
  }

  generarCSVContrato(reporte) {
    let csv = `Reporte de Contrato: ${reporte.contrato.nombre}\n`;
    csv += `Número: ${reporte.contrato.numero}\n`;
    csv += `Generado: ${new Date(reporte.generado).toLocaleDateString('es-ES')}\n\n`;
    
    csv += 'ESTADÍSTICAS\n';
    csv += 'Monto Total,Monto Suplementos,Monto Certificado,% Avance,Certificaciones,Suplementos,Comisiones Totales,Comisiones Pagadas,Comisiones Pendientes,Pagos Asignados,Saldo\n';
    csv += `${this.formatMoneda(reporte.estadisticas.montoTotal)},${this.formatMoneda(reporte.estadisticas.montoSuplementos)},${this.formatMoneda(reporte.estadisticas.montoCertificado)},${reporte.estadisticas.porcentajeAvance.toFixed(2)}%,${reporte.estadisticas.totalCertificaciones},${reporte.estadisticas.totalSuplementos},${this.formatMoneda(reporte.estadisticas.comisionesTotales)},${this.formatMoneda(reporte.estadisticas.comisionesPagadas)},${this.formatMoneda(reporte.estadisticas.comisionesPendientes)},${this.formatMoneda(reporte.estadisticas.pagosAsignados)},${this.formatMoneda(reporte.estadisticas.saldo)}\n\n`;
    
    csv += 'CERTIFICACIONES\n';
    csv += 'Mes,Monto Certificado,% Comisión,Comisión Calculada,Comisión Editada,Estado,Notas\n';
    
    reporte.certificaciones.forEach(cert => {
      csv += `"${cert.mes}",${this.formatMoneda(cert.montoCertificado)},${cert.porcentajeComision.toFixed(2)}%,${this.formatMoneda(cert.comisionCalculada)},${this.formatMoneda(cert.comisionEditada)},"${cert.pagado ? 'Pagado' : 'Pendiente'}","${cert.notas || ''}"\n`;
    });
    
    if (reporte.suplementos.length > 0) {
      csv += '\nSUPLEMENTOS\n';
      csv += 'Descripción,Monto,Fecha\n';
      
      reporte.suplementos.forEach(sup => {
        csv += `"${sup.descripcion}",${this.formatMoneda(sup.monto)},"${sup.fecha}"\n`;
      });
    }
    
    return csv;
  }

  generarCSVGeneral(reporte) {
    let csv = `Reporte General - Commission Manager Pro\n`;
    csv += `Generado: ${new Date(reporte.generado).toLocaleDateString('es-ES')}\n`;
    csv += `Período: ${reporte.periodo}\n\n`;
    
    csv += 'RESUMEN GENERAL\n';
    csv += 'Empresas,Contratos,Monto Total,Certificaciones,Comisiones,Comisiones Pagadas,Pagos\n';
    csv += `${reporte.resumenGeneral.empresas},${reporte.resumenGeneral.contratos},${this.formatMoneda(reporte.resumenGeneral.montoTotal)},${reporte.resumenGeneral.certificaciones},${this.formatMoneda(reporte.resumenGeneral.comisiones)},${this.formatMoneda(reporte.resumenGeneral.comisionesPagadas)},${this.formatMoneda(reporte.resumenGeneral.pagos)}\n\n`;
    
    csv += 'DETALLE POR EMPRESA\n';
    csv += 'Empresa,Contratos,Monto Total,Certificaciones,Comisiones,Comisiones Pagadas,Comisiones Pendientes,Pagos,Saldo Pendiente\n';
    
    reporte.empresas.forEach(emp => {
      csv += `"${emp.empresa}",${emp.totalContratos},${this.formatMoneda(emp.totalMontoContratos)},${emp.totalCertificaciones},${this.formatMoneda(emp.totalComisiones)},${this.formatMoneda(emp.totalComisionesPagadas)},${this.formatMoneda(emp.totalComisionesPendientes)},${this.formatMoneda(emp.totalPagos)},${this.formatMoneda(emp.saldoPendiente)}\n`;
    });
    
    if (reporte.tendenciaMensual.length > 0) {
      csv += '\nTENDENCIA MENSUAL (Últimos 6 meses)\n';
      csv += 'Mes,Certificaciones,Comisiones,Pagos\n';
      
      reporte.tendenciaMensual.forEach(mes => {
        csv += `"${mes.mes}",${mes.certificaciones},${this.formatMoneda(mes.comisiones)},${this.formatMoneda(mes.pagos)}\n`;
      });
    }
    
    return csv;
  }

  async generarGraficoBarras(datos, tipo) {
    // Esta función generaría un gráfico en canvas
    // Por simplicidad, devolvemos datos estructurados para que el frontend los renderice
    return {
      tipo: 'barras',
      datos: datos,
      config: {
        labels: datos.map(d => d.label || d.mes),
        valores: datos.map(d => d.valor || d.comisiones),
        colores: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      }
    };
  }

  async generarGraficoTorta(datos, tipo) {
    return {
      tipo: 'pizza',
      datos: datos,
      config: {
        labels: datos.map(d => d.label),
        valores: datos.map(d => d.valor),
        colores: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
      }
    };
  }
}

// Crear instancia única
const reportesManager = new ReportesManager();

// Hacer disponible globalmente
window.reportesManager = reportesManager;

// Exportar
export { reportesManager };