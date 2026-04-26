const db = require("../config/db");

function operadorPuedeVerIncidencia(req, row) {
  if (!req.user || req.user.role !== "OPERADOR") return true;
  if (!row) return false;
  return Number(row.assigned_to) === Number(req.user.id);
}

// =====================================================
// 📌 LISTAR INCIDENCIAS (TABLERO CON FILTROS + PAGINACIÓN)
// GET /api/incidencias?estatus=&tipo_servicio_id=&prioridad=&assigned_to=&q=&from=&to=&page=&limit=
// =====================================================
exports.listarIncidencias = (req, res) => {
  let {
    estatus,
    tipo_servicio_id,
    prioridad,
    assigned_to,
    q,
    from,
    to,
    page = 1,
    limit = 20
  } = req.query;

  if (req.user && req.user.role === "OPERADOR") {
    assigned_to = String(req.user.id);
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (pageNum - 1) * limitNum;

  const where = [];
  const params = [];

  if (estatus) {
    where.push("i.estatus = ?");
    params.push(estatus);
  }

  if (tipo_servicio_id) {
    where.push("i.tipo_servicio_id = ?");
    params.push(parseInt(tipo_servicio_id, 10));
  }

  if (prioridad) {
    where.push("i.prioridad = ?");
    params.push(prioridad);
  }

  if (assigned_to) {
    where.push("i.assigned_to = ?");
    params.push(parseInt(assigned_to, 10));
  }

  if (from) {
    where.push("i.created_at >= ?");
    params.push(`${from} 00:00:00`);
  }

  if (to) {
    where.push("i.created_at <= ?");
    params.push(`${to} 23:59:59`);
  }

  if (q) {
    where.push(`(
      i.folio LIKE ? OR
      i.titulo LIKE ? OR
      i.descripcion LIKE ? OR
      i.direccion LIKE ? OR
      i.colonia LIKE ?
    )`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sqlData = `
    SELECT
      i.*,
      c.nombre AS tipo_servicio,
      i.referencia,
      i.latitud,
      i.longitud,

      CASE
        WHEN i.assigned_at IS NOT NULL AND i.closed_at IS NOT NULL
          THEN TIMESTAMPDIFF(MINUTE, i.assigned_at, i.closed_at)
        ELSE NULL
      END AS tiempo_minutos,

      CASE
        WHEN i.assigned_at IS NOT NULL AND i.closed_at IS NOT NULL
          THEN CAST(
            ROUND(TIMESTAMPDIFF(MINUTE, i.assigned_at, i.closed_at) / 60, 2) AS DECIMAL(10,2)
          )
        ELSE NULL
      END AS tiempo_horas

    FROM incidencias i
    INNER JOIN catalogo_tipos_servicio c ON c.id = i.tipo_servicio_id
    ${whereSql}
    ORDER BY i.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const sqlCount = `
    SELECT COUNT(*) AS total
    FROM incidencias i
    ${whereSql}
  `;

  db.query(sqlCount, params, (errCount, rowsCount) => {
    if (errCount) {
      console.error("Error count incidencias:", errCount);
      return res.status(500).json({ message: "Error al contar incidencias" });
    }

    const total = rowsCount?.[0]?.total ?? 0;

    db.query(sqlData, [...params, limitNum, offset], (errData, rowsData) => {
      if (errData) {
        console.error("Error listar incidencias:", errData);
        return res.status(500).json({ message: "Error al listar incidencias" });
      }

      return res.json({
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum),
        items: rowsData
      });
    });
  });
};

// =====================================================
// 📌 OBTENER INCIDENCIA POR ID (detalle)
// GET /api/incidencias/:id
// =====================================================
exports.obtenerIncidenciaPorId = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  if (!incidenciaId) return res.status(400).json({ message: "ID inválido" });

  const sql = `
    SELECT 
      i.*,
      c.nombre AS tipo_servicio,
      i.referencia,
      i.latitud,
      i.longitud,
      i.direccion,
      i.colonia,
      i.municipio,

      CASE
        WHEN i.assigned_at IS NOT NULL AND i.closed_at IS NOT NULL
          THEN TIMESTAMPDIFF(MINUTE, i.assigned_at, i.closed_at)
        ELSE NULL
      END AS tiempo_minutos,

      CASE
        WHEN i.assigned_at IS NOT NULL AND i.closed_at IS NOT NULL
          THEN CAST(ROUND(TIMESTAMPDIFF(MINUTE, i.assigned_at, i.closed_at) / 60, 2) AS DECIMAL(10,2))
        ELSE NULL
      END AS tiempo_horas

    FROM incidencias i
    INNER JOIN catalogo_tipos_servicio c ON c.id = i.tipo_servicio_id
    WHERE i.id = ?
    LIMIT 1
  `;

  db.query(sql, [incidenciaId], (err, rows) => {
    if (err) {
      console.error("Error al obtener incidencia:", err);
      return res.status(500).json({ message: "Error al obtener la incidencia" });
    }
    if (!rows.length) return res.status(404).json({ message: "Incidencia no encontrada" });
    if (!operadorPuedeVerIncidencia(req, rows[0])) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }
    return res.json(rows[0]);
  });
};

// =====================================================
// 📌 CREAR INCIDENCIA
// POST /api/incidencias
// =====================================================
exports.crearIncidencia = (req, res) => {
  if (req.user && req.user.role === "CONSULTA") {
    return res.status(403).json({
      message: "Permiso denegado: su rol es de solo lectura",
      code: "FORBIDDEN_READ_ONLY",
    });
  }

  const { tipo_servicio_id, descripcion, direccion, referencia, latitud, longitud } = req.body;

  if (!tipo_servicio_id || !descripcion) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  const sql = `
    INSERT INTO incidencias
    (tipo_servicio_id, descripcion, direccion, referencia, latitud, longitud, estatus, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'NUEVA', NOW())
  `;

  db.query(sql, [tipo_servicio_id, descripcion, direccion || "", referencia || null, latitud || null, longitud || null], (err, result) => {
    if (err) {
      console.error("Error al crear incidencia:", err);
      return res.status(500).json({ message: "Error al crear incidencia" });
    }

    return res.status(201).json({
      message: "Incidencia creada correctamente",
      id: result.insertId
    });
  });
};
exports.asignarIncidencia = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);

  const actor_user_id =
    req.body.actor_user_id != null ? req.body.actor_user_id : req.user ? req.user.id : null;
  const target_user_id = req.body.target_user_id ?? req.body.user_id ?? null;
  const comentario = req.body.comentario ?? null;

  if (!incidenciaId || !target_user_id) {
    return res.status(400).json({
      message: "Datos incompletos (id y target_user_id/user_id obligatorios)"
    });
  }

  db.query(
    "SELECT estatus, assigned_to FROM incidencias WHERE id = ?",
    [incidenciaId],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener incidencia:", err);
        return res.status(500).json({
          message: "Error al obtener incidencia",
          error: err.sqlMessage || err.message
        });
      }
      if (!rows.length) return res.status(404).json({ message: "Incidencia no encontrada" });

      const estatusAnterior = rows[0].estatus;
      const assignedAnterior = rows[0].assigned_to;

      // ✅ REGLA SIGIM-MTZ: no permitir asignar si está finalizada
      if (["CERRADA", "RECHAZADA"].includes(estatusAnterior)) {
        return res.status(400).json({
          message: `No se puede asignar una incidencia ${estatusAnterior}. Registre un nuevo reporte (nuevo folio).`
        });
      }

      // Evitar reasignar al mismo usuario
      if (assignedAnterior === target_user_id) {
        return res.status(400).json({
          message: "Ya está asignada a ese usuario (no se realizó cambio)"
        });
      }

      let accion;
      let estatusNuevo = estatusAnterior;

      // Solo reasignar si ya estaba en proceso/activa (pero NO cerrada/rechazada por regla)
      if (["ASIGNADA", "EN_PROCESO", "RESUELTA"].includes(estatusAnterior)) {
        accion = "REASIGNAR";
        estatusNuevo = estatusAnterior;
      } else {
        accion = "ASIGNAR";
        estatusNuevo = "ASIGNADA";
      }

      const sqlUpdate = `
        UPDATE incidencias
        SET assigned_to = ?,
            estatus = ?,
            assigned_at = IF(assigned_at IS NULL, NOW(), assigned_at)
        WHERE id = ?
      `;

      db.query(sqlUpdate, [target_user_id, estatusNuevo, incidenciaId], (err2) => {
        if (err2) {
          console.error("Error al asignar incidencia (UPDATE):", err2);
          return res.status(500).json({
            message: "Error al asignar incidencia",
            error: err2.sqlMessage || err2.message
          });
        }

        const ip = req.ip;
        const ua = req.headers["user-agent"] || null;

        const sqlHistorial = `
          INSERT INTO incidencia_historial
          (incidencia_id, accion, comentario, estatus_anterior, estatus_nuevo, user_id, actor_user_id, target_user_id, ip, user_agent, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const user_id_compat = target_user_id;

        db.query(
          sqlHistorial,
          [
            incidenciaId,
            accion,
            comentario,
            estatusAnterior,
            estatusNuevo,
            user_id_compat,
            actor_user_id,
            target_user_id,
            ip,
            ua
          ],
          (err3) => {
            if (err3) {
              console.error("Error al insertar historial:", err3);
              return res.status(500).json({
                message: "Asignada, pero error al guardar historial",
                error: err3.sqlMessage || err3.message
              });
            }

            return res.json({
              message: accion === "ASIGNAR"
                ? "Incidencia asignada correctamente"
                : "Incidencia reasignada correctamente",
              accion,
              estatus_anterior: estatusAnterior,
              estatus_nuevo: estatusNuevo,
              actor_user_id,
              target_user_id
            });
          }
        );
      });
    }
  );
};
// =====================================================
// 📌 CAMBIAR ESTATUS
// PUT /api/incidencias/:id/estatus
// =====================================================
exports.cambiarEstatus = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  const { estatus, actor_user_id, comentario } = req.body;
  const normalizeStatus = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
  const estatusSolicitado = normalizeStatus(estatus);

  if (!incidenciaId || !estatusSolicitado) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  db.query("SELECT estatus, assigned_to FROM incidencias WHERE id = ?", [incidenciaId], (err, rows) => {
    if (err) return res.status(500).json({ message: "Error al obtener estatus actual" });
    if (!rows.length) return res.status(404).json({ message: "Incidencia no encontrada" });

    const estatusAnterior = normalizeStatus(rows[0].estatus);

    if (req.user && req.user.role === "OPERADOR") {
      if (Number(rows[0].assigned_to) !== Number(req.user.id)) {
        return res.status(403).json({
          message: "Solo puede cambiar estatus de incidencias asignadas a usted",
          code: "FORBIDDEN_NOT_ASSIGNED",
        });
      }

      const lockedStatuses = new Set(["RESUELTA", "CERRADA", "RECHAZADA"]);
      if (lockedStatuses.has(estatusAnterior)) {
        return res.status(409).json({
          message: `La incidencia está bloqueada en estatus ${estatusAnterior} y no puede modificarse`,
          code: "STATUS_LOCKED",
        });
      }

      const allowedTransitions = {
        ASIGNADA: "EN_PROCESO",
        EN_PROCESO: "RESUELTA",
      };
      const nextAllowedStatus = allowedTransitions[estatusAnterior] || null;
      if (!nextAllowedStatus || estatusSolicitado !== nextAllowedStatus) {
        return res.status(400).json({
          message: `Transición no permitida para técnico: ${estatusAnterior || "SIN_ESTATUS"} -> ${estatusSolicitado}`,
          code: "INVALID_STATUS_TRANSITION",
        });
      }

      if (!String(comentario || "").trim()) {
        return res.status(400).json({
          message: "Debe capturar un comentario para cambiar el estatus",
          code: "COMMENT_REQUIRED",
        });
      }
    }

    const sqlUpdate = (estatusSolicitado === "CERRADA")
      ? `UPDATE incidencias SET estatus = ?, closed_at = NOW() WHERE id = ?`
      : `UPDATE incidencias SET estatus = ? WHERE id = ?`;

    const params = (estatusSolicitado === "CERRADA") ? [estatusSolicitado, incidenciaId] : [estatusSolicitado, incidenciaId];

    db.query(sqlUpdate, params, (err2) => {
      if (err2) return res.status(500).json({ message: "Error al cambiar estatus" });

      const sqlHistorial = `
        INSERT INTO incidencia_historial
        (incidencia_id, accion, comentario, estatus_anterior, estatus_nuevo, user_id, actor_user_id, created_at)
        VALUES (?, 'CAMBIAR_ESTATUS', ?, ?, ?, ?, ?, NOW())
      `;

      const actorId = actor_user_id != null ? actor_user_id : req.user ? req.user.id : null;
      const userIdCompat = actorId;
      db.query(sqlHistorial, [incidenciaId, comentario || null, estatusAnterior, estatusSolicitado, userIdCompat, actorId]);

      return res.json({
        message: "Estatus actualizado correctamente",
        estatus_anterior: estatusAnterior,
        estatus_nuevo: estatusSolicitado,
        closed_at_actualizado: estatusSolicitado === "CERRADA"
      });
    });
  });
};

// =====================================================
// 📌 REGISTRAR SEGUIMIENTO (SIN CAMBIAR ESTATUS)
// POST /api/incidencias/:id/seguimiento
// =====================================================
exports.registrarSeguimiento = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  const comentario = String(req.body?.comentario || "").trim();

  if (!incidenciaId || !comentario) {
    return res.status(400).json({
      message: "Datos incompletos (id y comentario son obligatorios)",
      code: "VALIDATION",
    });
  }

  db.query(
    "SELECT estatus, assigned_to FROM incidencias WHERE id = ?",
    [incidenciaId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Error al validar incidencia" });
      if (!rows.length) return res.status(404).json({ message: "Incidencia no encontrada" });

      const estatusActual = String(rows[0].estatus || "").trim().toUpperCase();
      if (req.user && req.user.role === "OPERADOR") {
        if (Number(rows[0].assigned_to) !== Number(req.user.id)) {
          return res.status(403).json({
            message: "Solo puede registrar avances en incidencias asignadas a usted",
            code: "FORBIDDEN_NOT_ASSIGNED",
          });
        }

        if (estatusActual !== "EN_PROCESO") {
          return res.status(409).json({
            message: "Solo puede registrar avances en incidencias EN_PROCESO",
            code: "INVALID_TRACKING_STATUS",
          });
        }
      }

      const actorId = req.body?.actor_user_id != null
        ? req.body.actor_user_id
        : req.user
          ? req.user.id
          : null;
      if (!actorId) {
        return res.status(401).json({ message: "No autenticado" });
      }

      const sqlHistorial = `
        INSERT INTO incidencia_historial
        (incidencia_id, accion, comentario, estatus_anterior, estatus_nuevo, user_id, actor_user_id, created_at)
        VALUES (?, 'SEGUIMIENTO', ?, ?, ?, ?, ?, NOW())
      `;

      db.query(
        sqlHistorial,
        [incidenciaId, comentario, estatusActual, estatusActual, actorId, actorId],
        (err2, result) => {
          if (err2) {
            return res.status(500).json({
              message: "Error al registrar seguimiento",
              code: "TRACKING_INSERT_ERROR",
            });
          }
          return res.status(201).json({
            message: "Seguimiento registrado correctamente",
            id: result.insertId,
            incidencia_id: incidenciaId,
            accion: "SEGUIMIENTO",
          });
        }
      );
    }
  );
};

// =====================================================
// 📌 HISTORIAL POR INCIDENCIA
// GET /api/incidencias/:id/historial
// =====================================================
exports.obtenerHistorialPorIncidencia = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  if (!incidenciaId) return res.status(400).json({ message: "ID inválido" });

  db.query("SELECT assigned_to FROM incidencias WHERE id = ?", [incidenciaId], (err0, rows0) => {
    if (err0) {
      console.error("Error al verificar incidencia:", err0);
      return res.status(500).json({ message: "Error al consultar incidencia" });
    }
    if (!rows0.length) return res.status(404).json({ message: "Incidencia no encontrada" });
    if (!operadorPuedeVerIncidencia(req, rows0[0])) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }

  const sql = `
    SELECT 
      h.id,
      h.incidencia_id,
      h.accion,
      h.comentario,
      h.estatus_anterior,
      h.estatus_nuevo,
      h.user_id,
      h.actor_user_id,
      h.target_user_id,
      h.created_at,
      u_actor.name AS actor_name,
      u_target.name AS target_name
    FROM incidencia_historial h
    LEFT JOIN usuarios u_actor ON u_actor.id = h.actor_user_id
    LEFT JOIN usuarios u_target ON u_target.id = h.target_user_id
    WHERE h.incidencia_id = ?
    ORDER BY h.id DESC
  `;

  db.query(sql, [incidenciaId], (err, rows) => {
    if (err) {
      console.error("Error al obtener historial:", err);
      return res.status(500).json({ message: "Error al obtener historial" });
    }
    return res.json(rows);
  });
  });
};

// =====================================================
// 📌 FULL: DETALLE + HISTORIAL
// GET /api/incidencias/:id/full
// =====================================================
exports.obtenerIncidenciaFull = (req, res) => {
  const incidenciaId = parseInt(req.params.id, 10);
  if (!incidenciaId) return res.status(400).json({ message: "ID inválido" });

  const sqlDetalle = `
    SELECT 
      i.*,
      c.nombre AS tipo_servicio
    FROM incidencias i
    INNER JOIN catalogo_tipos_servicio c ON c.id = i.tipo_servicio_id
    WHERE i.id = ?
    LIMIT 1
  `;

  const sqlHistorial = `
    SELECT 
      h.id,
      h.incidencia_id,
      h.accion,
      h.comentario,
      h.estatus_anterior,
      h.estatus_nuevo,
      h.user_id,
      h.created_at
    FROM incidencia_historial h
    WHERE h.incidencia_id = ?
    ORDER BY h.id DESC
  `;

  db.query(sqlDetalle, [incidenciaId], (err, rowsDetalle) => {
    if (err) {
      console.error("Error al obtener detalle:", err);
      return res.status(500).json({ message: "Error al obtener el detalle" });
    }
    if (!rowsDetalle.length) return res.status(404).json({ message: "Incidencia no encontrada" });

    const detalle = rowsDetalle[0];
    if (!operadorPuedeVerIncidencia(req, detalle)) {
      return res.status(404).json({ message: "Incidencia no encontrada" });
    }

    db.query(sqlHistorial, [incidenciaId], (err2, rowsHistorial) => {
      if (err2) {
        console.error("Error al obtener historial:", err2);
        return res.status(500).json({ message: "Error al obtener historial" });
      }

      return res.json({ detalle, historial: rowsHistorial });
    });
  });
};

// =====================================================
// 📌 RESUMEN / KPIs PARA DASHBOARD
// GET /api/incidencias/resumen
// =====================================================
exports.resumenIncidencias = (req, res) => {
  let sql = `
    SELECT
      COUNT(*) AS total,
      SUM(estatus = 'NUEVA') AS nuevas,
      SUM(estatus = 'ASIGNADA') AS asignadas,
      SUM(estatus = 'EN_PROCESO') AS en_proceso,
      SUM(estatus = 'RESUELTA') AS resueltas,
      SUM(estatus = 'CERRADA') AS cerradas,
      SUM(estatus = 'RECHAZADA') AS rechazadas
    FROM incidencias
  `;
  const params = [];
  if (req.user && req.user.role === "OPERADOR") {
    sql += " WHERE assigned_to = ?";
    params.push(req.user.id);
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Error resumen incidencias:", err);
      return res.status(500).json({ message: "Error al obtener resumen" });
    }

    const r = rows?.[0] || {};
    return res.json({
      total: Number(r.total || 0),
      nuevas: Number(r.nuevas || 0),
      asignadas: Number(r.asignadas || 0),
      en_proceso: Number(r.en_proceso || 0),
      resueltas: Number(r.resueltas || 0),
      cerradas: Number(r.cerradas || 0),
      rechazadas: Number(r.rechazadas || 0),
    });
  });
};