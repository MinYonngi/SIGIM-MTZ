/**
 * Auditoría de usuarios internos (solo lectura).
 *
 * Reporta por usuario:
 * - email
 * - role
 * - active
 * - estado_hash: BCRYPT_VALIDO | VACIO | MUY_CORTO | FORMATO_SOSPECHOSO
 * - estado_rol: ROL_VALIDO | ROL_SOSPECHOSO
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const MIN_REASONABLE_HASH_LEN = 20;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const VALID_ROLES = new Set(["ADMIN", "SUPERVISOR", "OPERADOR", "QA", "CONSULTA"]);

function classifyHash(value) {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "VACIO";
  if (trimmed.length < MIN_REASONABLE_HASH_LEN) return "MUY_CORTO";
  if (BCRYPT_HASH_RE.test(trimmed)) return "BCRYPT_VALIDO";
  return "FORMATO_SOSPECHOSO";
}

function classifyRole(value) {
  const role = value == null ? "" : String(value).trim().toUpperCase();
  return VALID_ROLES.has(role) ? "ROL_VALIDO" : "ROL_SOSPECHOSO";
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  try {
    const [rows] = await conn.execute(`
      SELECT id, email, role, active, password_hash
      FROM usuarios
      ORDER BY id ASC
    `);

    const report = rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      active: Number(u.active || 0),
      estado_hash: classifyHash(u.password_hash),
      estado_rol: classifyRole(u.role),
    }));

    const summary = report.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.hash[row.estado_hash] = (acc.hash[row.estado_hash] || 0) + 1;
        acc.rol[row.estado_rol] = (acc.rol[row.estado_rol] || 0) + 1;
        return acc;
      },
      { total: 0, hash: {}, rol: {} }
    );

    console.table(report);
    console.log("\nResumen:", JSON.stringify(summary, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Error en auditoría de password_hash:", err);
  process.exit(1);
});

