/**
 * Normalización controlada de un usuario interno (objetivo único).
 *
 * Reglas:
 * - Requiere exactamente un objetivo: --email o --id
 * - Solo aplica cambios explícitos:
 *   --set-role=ADMIN|OPERADOR
 *   --reset-password="..."
 *   --activate
 * - Soporta --dry-run (no ejecuta UPDATE)
 *
 * Ejemplos:
 *   npm run normalize:user -- --email tecnico1@sigim-mtz.com --set-role OPERADOR --activate --dry-run
 *   npm run normalize:user -- --id 2 --set-role OPERADOR --reset-password "NuevaClave#2026" --activate
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 8;
const ALLOWED_ROLES = new Set(["ADMIN", "OPERADOR"]);

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

function exitWithUsage(message) {
  if (message) console.error(message);
  console.error(
    [
      "Uso:",
      "  npm run normalize:user -- --email <correo> [--set-role ADMIN|OPERADOR] [--reset-password \"...\"] [--activate] [--dry-run]",
      "  npm run normalize:user -- --id <id> [--set-role ADMIN|OPERADOR] [--reset-password \"...\"] [--activate] [--dry-run]",
      "",
      "Notas:",
      "  - Debe indicar un único objetivo: --email o --id",
      "  - Sin acciones explícitas no se ejecuta nada",
    ].join("\n")
  );
  process.exit(1);
}

function maskHash(hashValue) {
  const hash = hashValue == null ? "" : String(hashValue);
  if (!hash) return "(vacío)";
  if (hash.length <= 12) return `${hash.slice(0, 4)}...`;
  return `${hash.slice(0, 7)}...${hash.slice(-4)}`;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetEmail = args.email ? String(args.email).trim().toLowerCase() : "";
  const targetIdRaw = args.id ? String(args.id).trim() : "";
  const dryRun = Boolean(args["dry-run"]);
  const activate = Boolean(args.activate);

  if ((targetEmail && targetIdRaw) || (!targetEmail && !targetIdRaw)) {
    exitWithUsage("Debe especificar exactamente uno: --email o --id.");
  }

  const targetId = targetIdRaw ? Number(targetIdRaw) : null;
  if (targetIdRaw && (!Number.isInteger(targetId) || targetId <= 0)) {
    exitWithUsage("El valor de --id debe ser un entero positivo.");
  }

  const requestedRole = args["set-role"] ? String(args["set-role"]).trim().toUpperCase() : "";
  if (requestedRole && !ALLOWED_ROLES.has(requestedRole)) {
    exitWithUsage("Rol inválido en --set-role. Permitidos: ADMIN, OPERADOR.");
  }

  const newPassword = args["reset-password"] ? String(args["reset-password"]) : "";
  if (newPassword && newPassword.length < MIN_PASSWORD_LEN) {
    exitWithUsage(`La contraseña en --reset-password debe tener al menos ${MIN_PASSWORD_LEN} caracteres.`);
  }

  const hasAction = Boolean(requestedRole || newPassword || activate);
  if (!hasAction) {
    exitWithUsage("Debe indicar al menos una acción: --set-role, --reset-password o --activate.");
  }

  const conn = await connectDb();
  try {
    const [rows] = targetEmail
      ? await conn.execute(
          `
            SELECT id, email, role, active, password_hash
            FROM usuarios
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            LIMIT 1
          `,
          [targetEmail]
        )
      : await conn.execute(
          `
            SELECT id, email, role, active, password_hash
            FROM usuarios
            WHERE id = ?
            LIMIT 1
          `,
          [targetId]
        );

    if (!rows.length) {
      console.error("No se encontró usuario objetivo.");
      process.exit(1);
    }

    const before = rows[0];
    const updates = [];
    const values = [];
    const applied = [];

    if (requestedRole && requestedRole !== String(before.role || "").toUpperCase()) {
      updates.push("role = ?");
      values.push(requestedRole);
      applied.push({ campo: "role", antes: before.role || "", despues: requestedRole });
    }

    if (activate && Number(before.active || 0) !== 1) {
      updates.push("active = 1");
      applied.push({ campo: "active", antes: Number(before.active || 0), despues: 1 });
    }

    if (newPassword) {
      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      updates.push("password_hash = ?");
      values.push(newHash);
      applied.push({
        campo: "password_hash",
        antes: maskHash(before.password_hash),
        despues: maskHash(newHash),
      });
    }

    if (!applied.length) {
      console.log("Sin cambios: el usuario ya cumple con los valores solicitados.");
      console.log(
        JSON.stringify(
          {
            objetivo: { id: before.id, email: before.email },
            dryRun,
            cambiosSolicitados: { setRole: requestedRole || null, resetPassword: Boolean(newPassword), activate },
            cambiosAplicados: [],
          },
          null,
          2
        )
      );
      return;
    }

    const summary = {
      objetivo: { id: before.id, email: before.email },
      dryRun,
      cambiosAplicados: applied,
    };

    if (dryRun) {
      console.log("DRY-RUN: no se aplicaron cambios.");
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const whereValues = targetEmail ? [targetEmail] : [targetId];
    const sql = `
      UPDATE usuarios
      SET ${updates.join(", ")}
      WHERE ${targetEmail ? "LOWER(TRIM(email)) = LOWER(TRIM(?))" : "id = ?"}
      LIMIT 1
    `;
    await conn.execute(sql, [...values, ...whereValues]);

    const [afterRows] = await conn.execute(
      `
        SELECT id, email, role, active, password_hash
        FROM usuarios
        WHERE id = ?
        LIMIT 1
      `,
      [before.id]
    );
    const after = afterRows[0];

    const finalSummary = {
      ...summary,
      despues: {
        role: after.role,
        active: Number(after.active || 0),
        password_hash: maskHash(after.password_hash),
      },
    };

    console.log("Cambios aplicados correctamente.");
    console.log(JSON.stringify(finalSummary, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Error en normalización de usuario:", err);
  process.exit(1);
});

