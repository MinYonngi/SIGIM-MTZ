const db = require("../config/db");
const logger = require("../utils/logger");

exports.health = (req, res) => {
  res.json({
    ok: true,
    module: "admin",
    role_required: "ADMIN",
    timestamp: new Date().toISOString(),
  });
};

exports.dashboard = (req, res) => {
  const sqlUsuarios = `
    SELECT
      COUNT(*) AS totalUsuarios,
      SUM(active = 1) AS usuariosActivos,
      SUM(active = 0) AS usuariosInactivos,
      SUM(role = 'ADMIN') AS totalAdmins,
      SUM(role = 'SUPERVISOR') AS totalSupervisores,
      SUM(role = 'OPERADOR') AS totalOperadores
    FROM usuarios
  `;

  const sqlIncidencias = "SELECT COUNT(*) AS totalIncidencias FROM incidencias";
  const sqlEvidencias = "SELECT COUNT(*) AS totalEvidencias FROM incidencia_archivos";

  db.query(sqlUsuarios, (errUsuarios, rowsUsuarios) => {
    if (errUsuarios) {
      logger.error("admin.dashboard usuarios:", errUsuarios);
      return res.status(500).json({ message: "Error al consultar métricas de usuarios" });
    }

    db.query(sqlIncidencias, (errIncidencias, rowsIncidencias) => {
      if (errIncidencias) {
        logger.error("admin.dashboard incidencias:", errIncidencias);
        return res.status(500).json({ message: "Error al consultar métricas de incidencias" });
      }

      db.query(sqlEvidencias, (errEvidencias, rowsEvidencias) => {
        if (errEvidencias) {
          logger.error("admin.dashboard evidencias:", errEvidencias);
          return res.status(500).json({ message: "Error al consultar métricas de evidencias" });
        }

        const usuarios = rowsUsuarios && rowsUsuarios[0] ? rowsUsuarios[0] : {};
        const incidencias = rowsIncidencias && rowsIncidencias[0] ? rowsIncidencias[0] : {};
        const evidencias = rowsEvidencias && rowsEvidencias[0] ? rowsEvidencias[0] : {};

        return res.json({
          totalUsuarios: Number(usuarios.totalUsuarios || 0),
          usuariosActivos: Number(usuarios.usuariosActivos || 0),
          usuariosInactivos: Number(usuarios.usuariosInactivos || 0),
          totalAdmins: Number(usuarios.totalAdmins || 0),
          totalSupervisores: Number(usuarios.totalSupervisores || 0),
          totalOperadores: Number(usuarios.totalOperadores || 0),
          totalIncidencias: Number(incidencias.totalIncidencias || 0),
          totalEvidencias: Number(evidencias.totalEvidencias || 0),
        });
      });
    });
  });
};
