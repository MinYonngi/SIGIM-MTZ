/**
 * Reset de contraseñas internas (ADMIN / OPERADOR) con bcrypt cost 12.
 *
 * Uso:
 *   npm run reset:passwords -- --password "NuevaClaveSegura123"
 *   npm run reset:passwords -- --email admin@sigim.local --password "NuevaClaveSegura123"
 *   npm run reset:passwords -- --role OPERADOR --password "NuevaClaveSegura123"
 *
 * También puede leer RESET_PASSWORD desde .env si no se pasa --password.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const DEFAULT_TARGET_ROLES = ["ADMIN", "OPERADOR"];
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 8;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usageAndExit() {
  console.error(
    [
      "Uso:",
      "  npm run reset:passwords -- --password \"NuevaClaveSegura123\"",
      "  npm run reset:passwords -- --email admin@sigim.local --password \"NuevaClaveSegura123\"",
      "  npm run reset:passwords -- --role OPERADOR --password \"NuevaClaveSegura123\"",
      "",
      "Opciones:",
      "  --password   Contraseña en texto plano a hashear (si falta, usa RESET_PASSWORD de .env)",
      "  --email      Resetea solo el usuario con ese correo",
      "  --role       Resetea solo usuarios con rol dado",
      "  --help       Muestra esta ayuda",
    ].join("\n")
  );
  process.exit(1);
}

async function connectDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usageAndExit();

  const targetEmail = args.email ? String(args.email).trim().toLowerCase() : "";
  const targetRole = args.role ? String(args.role).trim().toUpperCase() : "";
  const plainPassword = String(args.password || process.env.RESET_PASSWORD || "");

  if (!plainPassword || plainPassword.length < MIN_PASSWORD_LEN) {
    console.error(`Defina --password o RESET_PASSWORD con mínimo ${MIN_PASSWORD_LEN} caracteres.`);
    process.exit(1);
  }

  if (targetRole && !["ADMIN", "OPERADOR", "SUPERVISOR", "QA", "CONSULTA"].includes(targetRole)) {
    console.error("Rol inválido. Use: ADMIN, OPERADOR, SUPERVISOR, QA o CONSULTA.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const conn = await connectDb();

  try {
    let result;
    if (targetEmail) {
      [result] = await conn.execute(
        `
          UPDATE usuarios
          SET password_hash = ?, active = 1
          WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
        `,
        [hash, targetEmail]
      );
      console.log(`Objetivo: email=${targetEmail}`);
    } else if (targetRole) {
      [result] = await conn.execute(
        `
          UPDATE usuarios
          SET password_hash = ?, active = 1
          WHERE role = ?
        `,
        [hash, targetRole]
      );
      console.log(`Objetivo: role=${targetRole}`);
    } else {
      [result] = await conn.execute(
        `
          UPDATE usuarios
          SET password_hash = ?, active = 1
          WHERE role IN (?, ?)
        `,
        [hash, DEFAULT_TARGET_ROLES[0], DEFAULT_TARGET_ROLES[1]]
      );
      console.log(`Objetivo por defecto: roles=${DEFAULT_TARGET_ROLES.join(",")}`);
    }

    console.log(`Filas afectadas: ${result.affectedRows}`);
    console.log("Listo. Contraseñas actualizadas con bcrypt cost 12.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Error en reset de contraseñas:", err);
  process.exit(1);
});

