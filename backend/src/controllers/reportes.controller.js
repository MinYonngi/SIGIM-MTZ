const pool = require("../config/db");
const db = pool.promise();

// =====================================================
// 📊 REPORTE DE DIGITALIZACIÓN
// GET /api/reportes/digitalizacion?fechaInicio=2024-01-01&fechaFin=2024-12-31&tipo=cumplimiento&totalRecibidos=1000
// =====================================================
exports.reporteDigitalizacion = async (req, res) => {
  const { fechaInicio, fechaFin, tipo = 'cumplimiento', totalRecibidos } = req.query;
  
  console.log('🔍 reporteDigitalizacion - Parámetros recibidos:', { fechaInicio, fechaFin, tipo, totalRecibidos });
  
  // Validar conexión a BD
  if (!db) {
    console.error('❌ Error: Conexión a BD no disponible');
    return res.status(500).json({ message: "Error de conexión a base de datos" });
  }
  
  if (tipo === 'pilotaje' && !totalRecibidos) {
    return res.status(400).json({ 
      message: "Para modo pilotaje debe especificar totalRecibidos" 
    });
  }
  
  try {
    if (tipo === 'pilotaje') {
      // Opción A: Pilotaje con parámetro real
      const sqlCapturados = `SELECT COUNT(*) as capturados_sigim FROM incidencias WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`;
      console.log('🔍 Ejecutando SQL pilotaje:', sqlCapturados);
      console.log('🔍 Parámetros SQL:', [fechaInicio, fechaFin]);
      
      const [capturados] = await db.query(sqlCapturados, [fechaInicio, fechaFin]);
      console.log('🔍 Resultado SQL pilotaje:', capturados);
      
      const porcentaje = (capturados[0].capturados_sigim / parseInt(totalRecibidos)) * 100;
      
      const fechaGeneracion = new Date();
      const fechaGeneracionIso = fechaGeneracion.toISOString();
      const fechaGeneracionLocal = fechaGeneracion.toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        hour12: false,
      });
      return res.json({
        tipo_indicador: 'Pilotaje de captura digital',
        capturados_sigim: capturados[0].capturados_sigim,
        total_recibidos: parseInt(totalRecibidos),
        porcentaje_captura: Math.round(porcentaje * 100) / 100,
        fecha_generacion: fechaGeneracionIso,
        fecha_generacion_local: fechaGeneracionLocal,
      });
    } else {
      // Opción B: Cumplimiento de registro (indicador interno del periodo)
      const sql = `
        SELECT 
            COUNT(*) as total_reportes,
            COUNT(*) as registros_digitales,
            100.00 as porcentaje_cumplimiento,
            'Cumplimiento de registro digital del periodo (100% por lógica interna)' as indicador
        FROM incidencias 
        WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      `;
      
      console.log('🔍 Ejecutando SQL cumplimiento:', sql);
      console.log('🔍 Parámetros SQL:', [fechaInicio, fechaFin]);
      
      const [result] = await db.query(sql, [fechaInicio, fechaFin]);
      console.log('🔍 Resultado SQL cumplimiento:', result);
      
      const fechaGeneracion = new Date();
      const fechaGeneracionIso = fechaGeneracion.toISOString();
      const fechaGeneracionLocal = fechaGeneracion.toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        hour12: false,
      });
      return res.json({
        tipo_indicador: 'Cumplimiento de registro digital',
        total_reportes: result[0].total_reportes,
        registros_digitales: result[0].registros_digitales,
        porcentaje_cumplimiento: result[0].porcentaje_cumplimiento,
        fecha_generacion: fechaGeneracionIso,
        fecha_generacion_local: fechaGeneracionLocal,
      });
    }
  } catch (error) {
    console.error('❌ Error en reporteDigitalizacion:', error);
    console.error('❌ SQL Message:', error.sqlMessage || 'No SQL message');
    console.error('❌ Stack trace:', error.stack);
    return res.status(500).json({ 
      message: "Error al generar reporte de digitalización", 
      error: error.message,
      sqlMessage: error.sqlMessage 
    });
  }
};

// =====================================================
// 🕐 REPORTE DE TIEMPO DE RESPUESTA INICIAL
// GET /api/reportes/tiempo-respuesta?fechaInicio=2024-01-01&fechaFin=2024-12-31
// =====================================================
exports.reporteTiempoRespuesta = async (req, res) => {
  const { fechaInicio, fechaFin } = req.query;
  
  console.log('🔍 reporteTiempoRespuesta - Parámetros recibidos:', { fechaInicio, fechaFin });
  
  // Validar conexión a BD
  if (!db) {
    console.error('❌ Error: Conexión a BD no disponible');
    return res.status(500).json({ message: "Error de conexión a base de datos" });
  }
  
  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({
      message: "Debe especificar fechaInicio y fechaFin",
    });
  }
  
  try {
    // Cálculo desde incidencias (sin dependencia de incidencia_historial)
    // "Primera respuesta" = fecha de asignación inicial (assigned_at)
    const sql = `
      SELECT 
          i.folio,
          c.nombre AS tipo_servicio,
          i.created_at as fecha_registro,
          i.assigned_at as fecha_primera_respuesta,
          CASE 
            WHEN i.assigned_at IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(HOUR, i.created_at, i.assigned_at)
          END as tiempo_horas,
          CASE 
            WHEN i.assigned_at IS NULL THEN 'SIN RESPUESTA'
            WHEN TIMESTAMPDIFF(HOUR, i.created_at, i.assigned_at) <= 24 THEN 'CUMPLE'
            ELSE 'NO CUMPLE'
          END as cumplimiento
      FROM incidencias i
      LEFT JOIN catalogo_tipos_servicio c ON c.id = i.tipo_servicio_id
      WHERE i.created_at >= ? AND i.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY i.created_at
    `;
    
    console.log('🔍 Ejecutando SQL tiempo respuesta:', sql);
    console.log('🔍 Parámetros SQL:', [fechaInicio, fechaFin]);
    
    const [results] = await db.query(sql, [fechaInicio, fechaFin]);
    console.log('🔍 Resultado SQL tiempo respuesta:', results);
    
    // Debug detallado de tiempo
    results.forEach((item, index) => {
      console.log(`🔍 Incidencia ${index + 1}:`, {
        folio: item.folio,
        tiempo_horas: item.tiempo_horas,
        tipo_tiempo: typeof item.tiempo_horas,
        cumplimiento: item.cumplimiento
      });
    });
    
    // Calcular estadísticas
    const total = results.length;
    const cumplen = results.filter(r => r.cumplimiento === 'CUMPLE').length;
    const noCumplen = results.filter(r => r.cumplimiento === 'NO CUMPLE').length;
    const sinRespuesta = results.filter(r => r.cumplimiento === 'SIN RESPUESTA').length;
    
    console.log('🔍 Estadísticas calculadas:', { total, cumplen, noCumplen, sinRespuesta });
    
    const fechaGeneracion = new Date();
    const fechaGeneracionIso = fechaGeneracion.toISOString();
    const fechaGeneracionLocal = fechaGeneracion.toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      hour12: false,
    });
    return res.json({
      criterio: '24 horas naturales desde registro hasta asignación inicial (assigned_at)',
      acciones_consideradas: ['ASIGNACIÓN INICIAL (campo incidencias.assigned_at)'],
      estadisticas: {
        total_incidencias: total,
        cumplen: cumplen,
        no_cumplen: noCumplen,
        sin_respuesta: sinRespuesta,
        porcentaje_cumplimiento: total > 0 ? Math.round((cumplen / total) * 100) : 0
      },
      resultados: results,
      fecha_generacion: fechaGeneracionIso,
      fecha_generacion_local: fechaGeneracionLocal,
    });
  } catch (error) {
    console.error('❌ Error en reporteTiempoRespuesta:', error);
    console.error('❌ SQL Message:', error.sqlMessage || 'No SQL message');
    console.error('❌ Stack trace:', error.stack);
    return res.status(500).json({ 
      message: "Error al generar reporte de tiempo de respuesta", 
      error: error.message,
      sqlMessage: error.sqlMessage 
    });
  }
};
