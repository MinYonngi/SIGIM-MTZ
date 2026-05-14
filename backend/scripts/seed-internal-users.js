/**
 * Semilla de usuarios internos (solo desarrollo / entornos controlados).
 *
 * Requisitos:
 * - Tabla `usuarios` con columnas: name, email, role, active, password_hash
 * - Índice UNIQUE en `email` (para ON DUPLICATE KEY UPDATE)
 *
 * Uso:
 *   En .env: SEED_PASSWORD=UnaClaveSeguraDeAlMenos8
 *   npm run seed:users
 *
 * No commitear contraseñas reales. Tras probar, rotar o borrar SEED_PASSWORD.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const SEED_PASSWORD = process.env.SEED_PASSWORD;
if (!SEED_PASSWORD || String(SEED_PASSWORD).length < 8) {
  console.error(
    "Defina SEED_PASSWORD en .env (mínimo 8 caracteres). Solo para entornos no productivos."
  );
  process.exit(1);
}

async function main() {
  const hash = await bcrypt.hash(String(SEED_PASSWORD), 12);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  const rows = [
    ["Administrador del sistema", "admin.sistema@sigim.local", "ADMIN"],
    ["Supervisor del departamento", "supervisor@sigim.local", "SUPERVISOR"],
    ["Técnico operativo", "operador1@sigim-mtz.com", "OPERADOR"],
  ];

  const sql = `
    INSERT INTO usuarios (name, email, role, active, password_hash)
    VALUES (?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      role = VALUES(role),
      active = 1,
      password_hash = VALUES(password_hash)
  `;

  for (const [name, email, role] of rows) {
    await conn.execute(sql, [name, email, role, hash]);
    console.log("Usuario:", email, "(" + role + ")");
  }

  await conn.end();
  console.log("Listo. Revoca o cambia SEED_PASSWORD cuando termines las pruebas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
