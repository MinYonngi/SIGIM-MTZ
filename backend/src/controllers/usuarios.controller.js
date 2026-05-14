const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../config/db");
const logger = require("../utils/logger");

const AVATARS_DIR = path.join(__dirname, "../../uploads/avatars");
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const AVATAR_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const REQUIRED_AVATAR_COLUMNS = ["avatar_filename", "avatar_mime", "avatar_size", "avatar_updated_at"];

function ensureAvatarsDir() {
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

function getUsuariosColumns(callback) {
  db.query("SHOW COLUMNS FROM usuarios", (err, rows) => {
    if (err) return callback(err);
    const cols = new Set((rows || []).map((r) => String(r.Field || "").trim().toLowerCase()));
    return callback(null, cols);
  });
}

function resolveModuloByRole(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OPERADOR") return "Panel Técnico";
  if (normalized === "ADMIN") return "Administración del sistema";
  if (normalized === "SUPERVISOR") return "Panel Supervisor";
  return "No disponible";
}

function resolveRoleDisplayByRole(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "Administrador del sistema";
  if (normalized === "OPERADOR") return "Técnico operativo";
  if (normalized === "SUPERVISOR") return "Supervisor del departamento";
  return normalized || "No disponible";
}

function resolveRoleFunctions(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "SUPERVISOR") {
    return [
      "Revisar incidencias",
      "Asignar incidencias a técnicos",
      "Dar seguimiento",
      "Consultar historial de incidencias",
      "Generar reportes",
      "Revisar evidencias",
    ];
  }
  if (normalized === "OPERADOR") {
    return [
      "Ver incidencias asignadas",
      "Cambiar estatus permitido",
      "Agregar seguimiento",
      "Subir evidencias",
      "Consultar ubicación",
      "Registrar avance operativo",
    ];
  }
  if (normalized === "ADMIN") {
    return [
      "Gestión de usuarios internos",
      "Gestión de roles permitidos",
      "Seguridad y auditoría",
      "Mantenimiento del sistema",
      "Catálogos del sistema",
      "Supervisión general",
    ];
  }
  return ["No disponible"];
}

function resolvePanelRouteByRole(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OPERADOR") return "/tecnico.html";
  if (normalized === "ADMIN") return "/admin.html";
  if (normalized === "SUPERVISOR") return "/dashboard.html";
  return "/login.html";
}

function avatarUrlFromFilename(filename) {
  if (!filename) return null;
  return `/uploads/avatars/${encodeURIComponent(path.basename(String(filename)))}`;
}

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildUserProfile(row, cols) {
  const role = String(row.role || "").toUpperCase();
  const active = Number(row.active || 0);
  const emailVerified = cols.has("email_verified") ? Number(row.email_verified || 0) : null;
  const failedLoginAttempts = cols.has("failed_login_attempts")
    ? Number(row.failed_login_attempts || 0)
    : null;
  const mfaEnabled = cols.has("mfa_enabled") ? Number(row.mfa_enabled || 0) : null;
  const rutaPrincipal = resolvePanelRouteByRole(role);
  const funciones = resolveRoleFunctions(role);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    role_display: resolveRoleDisplayByRole(role),
    active,
    email_verified: emailVerified,
    last_login_at: cols.has("last_login_at") ? parseDateOrNull(row.last_login_at) : null,
    failed_login_attempts: failedLoginAttempts,
    locked_until: cols.has("locked_until") ? parseDateOrNull(row.locked_until) : null,
    mfa_enabled: mfaEnabled,
    password_changed_at: cols.has("password_changed_at")
      ? parseDateOrNull(row.password_changed_at)
      : null,
    modulo: resolveModuloByRole(role),
    ruta_principal: rutaPrincipal,
    funciones,
    area: cols.has("area") ? row.area || null : null,
    created_at: cols.has("created_at") ? parseDateOrNull(row.created_at) : null,
    updated_at: cols.has("updated_at") ? parseDateOrNull(row.updated_at) : null,
    avatar_url: cols.has("avatar_filename") ? avatarUrlFromFilename(row.avatar_filename) : null,
    avatar_filename: cols.has("avatar_filename") ? row.avatar_filename || null : null,
    security: {
      cuenta_protegida: active === 1,
      acceso_interno: true,
      rol_asignado: role,
      ultimo_acceso: cols.has("last_login_at") ? parseDateOrNull(row.last_login_at) : null,
    },
  };
}

function unlinkIfExists(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.warn("No se pudo eliminar archivo previo de avatar:", err && err.message ? err.message : err);
  }
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureAvatarsDir();
      cb(null, AVATARS_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.user && req.user.id ? Number(req.user.id) : "user";
    const ext = AVATAR_MIME_EXT[file.mimetype] || ".jpg";
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `avatar-${userId}-${stamp}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      return cb(new Error("Formato no permitido. Use JPG, PNG o WEBP."));
    }
    return cb(null, true);
  },
}).single("avatar");

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
      logger.error("Error listar técnicos:", err);
      return res.status(500).json({ message: "Error al consultar técnicos" });
    }
    return res.json(rows);
  });
};

// =====================================================
// 📌 PERFIL DEL USUARIO AUTENTICADO
// GET /api/usuarios/me
// =====================================================
exports.obtenerMiPerfil = (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "No autenticado", code: "UNAUTHENTICATED" });
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  getUsuariosColumns((colsErr, cols) => {
    if (colsErr) {
      logger.error("Error obteniendo columnas de usuarios:", colsErr);
      return res.status(500).json({ message: "Error al consultar perfil" });
    }

    const selectParts = ["id", "name", "email", "role", "active"];
    if (cols.has("area")) selectParts.push("area");
    if (cols.has("created_at")) selectParts.push("created_at");
    if (cols.has("updated_at")) selectParts.push("updated_at");
    if (cols.has("avatar_filename")) selectParts.push("avatar_filename");
    if (cols.has("email_verified")) selectParts.push("email_verified");
    if (cols.has("last_login_at")) selectParts.push("last_login_at");
    if (cols.has("failed_login_attempts")) selectParts.push("failed_login_attempts");
    if (cols.has("locked_until")) selectParts.push("locked_until");
    if (cols.has("mfa_enabled")) selectParts.push("mfa_enabled");
    if (cols.has("password_changed_at")) selectParts.push("password_changed_at");

    const sql = `
      SELECT ${selectParts.join(", ")}
      FROM usuarios
      WHERE id = ?
      LIMIT 1
    `;

    db.query(sql, [req.user.id], (err, rows) => {
      if (err) {
        logger.error("Error obteniendo perfil del usuario:", err);
        return res.status(500).json({ message: "Error al consultar perfil" });
      }
      if (!rows.length) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      const profile = buildUserProfile(rows[0], cols);
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"50f0eb"},body:JSON.stringify({sessionId:"50f0eb",runId:"diagnostic-1",hypothesisId:"H4",location:"usuarios.controller.js:obtenerMiPerfil",message:"Perfil retornado por /api/usuarios/me",data:{sessionUserId:req.user.id,dbUserId:rows[0].id,dbRole:rows[0].role,returnedRole:profile.role,rutaPrincipal:profile.ruta_principal},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"298080"},body:JSON.stringify({sessionId:"298080",runId:"pre-fix",hypothesisId:"H4",location:"usuarios.controller.js:257",message:"Perfil construido desde usuarios/me",data:{sessionUserId:req.user.id,dbUserId:rows[0].id,dbEmail:rows[0].email,dbRole:rows[0].role,rutaPrincipal:profile.ruta_principal,roleDisplay:profile.role_display},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return res.json({ user: profile });
    });
  });
};

// =====================================================
// 📌 ACTUALIZAR AVATAR DEL USUARIO AUTENTICADO
// PUT /api/usuarios/me/avatar (multipart/form-data, field: avatar)
// =====================================================
exports.actualizarMiAvatar = (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "No autenticado", code: "UNAUTHENTICATED" });
  }

  avatarUpload(req, res, (uploadErr) => {
    if (uploadErr) {
      const isSizeError = uploadErr && uploadErr.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        message: isSizeError
          ? "La imagen excede el tamaño máximo permitido (2MB)."
          : uploadErr.message || "No fue posible cargar la imagen.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Seleccione una imagen para continuar." });
    }

    getUsuariosColumns((colsErr, cols) => {
      if (colsErr) {
        unlinkIfExists(req.file.path);
        logger.error("Error obteniendo columnas de usuarios:", colsErr);
        return res.status(500).json({ message: "Error al actualizar avatar" });
      }

      const missingColumns = REQUIRED_AVATAR_COLUMNS.filter((c) => !cols.has(c));
      if (missingColumns.length) {
        unlinkIfExists(req.file.path);
        return res.status(500).json({
          message: `Falta migración de avatar en tabla usuarios (${missingColumns.join(", ")}).`,
          code: "MISSING_AVATAR_MIGRATION",
        });
      }

      db.query(
        "SELECT id, avatar_filename FROM usuarios WHERE id = ? LIMIT 1",
        [req.user.id],
        (selErr, rows) => {
          if (selErr) {
            unlinkIfExists(req.file.path);
            logger.error("Error validando usuario para avatar:", selErr);
            return res.status(500).json({ message: "Error al actualizar avatar" });
          }

          if (!rows.length) {
            unlinkIfExists(req.file.path);
            return res.status(404).json({ message: "Usuario no encontrado" });
          }

          const previousAvatar = rows[0].avatar_filename ? path.basename(String(rows[0].avatar_filename)) : null;
          const updateParts = [
            "avatar_filename = ?",
            "avatar_mime = ?",
            "avatar_size = ?",
            "avatar_updated_at = NOW()",
          ];
          const params = [req.file.filename, req.file.mimetype, req.file.size];

          if (cols.has("updated_at")) {
            updateParts.push("updated_at = NOW()");
          }

          const sql = `
            UPDATE usuarios
            SET ${updateParts.join(", ")}
            WHERE id = ?
          `;
          params.push(req.user.id);

          db.query(sql, params, (updErr) => {
            if (updErr) {
              unlinkIfExists(req.file.path);
              logger.error("Error actualizando avatar en BD:", updErr);
              return res.status(500).json({ message: "Error al guardar avatar" });
            }

            if (previousAvatar && previousAvatar !== req.file.filename) {
              unlinkIfExists(path.join(AVATARS_DIR, previousAvatar));
            }

            return res.json({
              ok: true,
              message: "Foto de perfil actualizada correctamente.",
              avatar: {
                filename: req.file.filename,
                mime: req.file.mimetype,
                size: req.file.size,
                url: avatarUrlFromFilename(req.file.filename),
              },
            });
          });
        }
      );
    });
  });
};