const db = require('../config/db');

// =====================================================
// 📌 LISTAR TÉCNICOS/OPERADORES ACTIVOS (para dropdown)
// GET /api/usuarios/tecnicos
// =====================================================
exports.listarTecnicos = (req, res) => {
  const sql = `
    SELECT id, name
    FROM usuarios
    WHERE active = 1
      AND role = 'OPERADOR'
    ORDER BY name ASC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error('Error listar técnicos:', err);
      return res.status(500).json({ message: 'Error al consultar técnicos' });
    }
    return res.json(rows);
  });
};