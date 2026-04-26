const express = require("express");
const db = require("../config/db");
const { requireAuth, forbidConsultaMutation } = require("../middleware/auth.middleware");

const router = express.Router();

// Público (sin sesión): requerido por Portal Ciudadano. No mover tras requireAuth sin revisar consecuencias.
// Respuesta mínima: solo id + nombre. La consulta solo incluye filas activas (WHERE active = 1), ordenadas por nombre.
router.get("/tipos-servicio", (req, res) => {
  const sql = `
    SELECT id, nombre
    FROM catalogo_tipos_servicio
    WHERE active = 1
    ORDER BY nombre
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error al consultar tipos de servicio:", err);
      return res.status(500).json({ message: "Error al consultar tipos de servicio" });
    }

    res.json(rows);
  });
});

router.use(requireAuth);
router.use(forbidConsultaMutation);

router.get("/ping", (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
