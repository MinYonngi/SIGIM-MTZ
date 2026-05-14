const bcrypt = require("bcrypt");
const db = require("../config/db");
const { sendLoginAlertMail } = require("../services/loginAlertMail.service");
const logger = require("../utils/logger");

const CREDENTIALS_MSG = "Credenciales incorrectas";
const NO_PASSWORD_MSG = "Cuenta sin contraseña configurada. Contacte al administrador.";
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function isValidStoredBcryptHash(value) {
  const normalized = value == null ? "" : String(value).trim();
  if (!normalized) return false;
  return BCRYPT_HASH_RE.test(normalized);
}

function redirectForRole(role) {
  switch (role) {
    case "ADMIN":
      return "/admin.html";
    case "SUPERVISOR":
      return "/dashboard.html";
    case "OPERADOR":
      return "/tecnico.html";
    default:
      return null;
  }
}

function getClientIp(req) {
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || "";
}

exports.login = (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim() : "";
  const password = req.body && req.body.password != null ? String(req.body.password) : "";
  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"298080"},body:JSON.stringify({sessionId:"298080",runId:"pre-fix",hypothesisId:"H1",location:"auth.controller.js:40",message:"Intento de login recibido",data:{emailNormalized:email.toLowerCase()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (!email || !password) {
    return res.status(400).json({
      message: "Correo y contraseña son obligatorios",
      code: "VALIDATION",
    });
  }

  const sql = `
    SELECT id, name, email, role, active, password_hash
    FROM usuarios
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
    LIMIT 1
  `;

  db.query(sql, [email], (err, rows) => {
    if (err) {
      logger.error("auth.login DB:", err);
      return res.status(500).json({
        message: "Error del servidor al iniciar sesión",
        code: "SERVER_ERROR",
      });
    }

    if (!rows.length) {
      return res.status(401).json({ message: CREDENTIALS_MSG, code: "CREDENTIALS" });
    }

    const u = rows[0];
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"50f0eb"},body:JSON.stringify({sessionId:"50f0eb",runId:"diagnostic-1",hypothesisId:"H1",location:"auth.controller.js:rowSelected",message:"Fila de usuario seleccionada en login",data:{requestEmail:email.toLowerCase(),dbUserId:u.id,dbEmail:String(u.email||"").toLowerCase(),dbRole:u.role,dbActive:u.active},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"298080"},body:JSON.stringify({sessionId:"298080",runId:"pre-fix",hypothesisId:"H1",location:"auth.controller.js:71",message:"Usuario encontrado para login",data:{requestedEmail:email.toLowerCase(),dbEmail:String(u.email||"").toLowerCase(),role:u.role,userId:u.id,active:u.active},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!u.active || u.active === 0) {
      return res.status(403).json({
        message: "Usuario inactivo. Contacte al administrador.",
        code: "INACTIVE",
      });
    }

    if (!u.password_hash) {
      return res.status(403).json({
        message: NO_PASSWORD_MSG,
        code: "NO_PASSWORD",
      });
    }

    if (!isValidStoredBcryptHash(u.password_hash)) {
      logger.warn(`auth.login hash inválido para userId=${u.id}. Verificar almacenamiento de password_hash.`);
      return res.status(403).json({
        message: NO_PASSWORD_MSG,
        code: "NO_PASSWORD",
      });
    }

    bcrypt.compare(password, u.password_hash, (cmpErr, ok) => {
      if (cmpErr) {
        logger.error("auth.login bcrypt:", cmpErr);
        return res.status(500).json({
          message: "Error del servidor al verificar credenciales",
          code: "SERVER_ERROR",
        });
      }

      if (!ok) {
        return res.status(401).json({ message: CREDENTIALS_MSG, code: "CREDENTIALS" });
      }

      req.session.regenerate((regErr) => {
        if (regErr) {
          logger.error("auth.login regenerate:", regErr);
          return res.status(500).json({
            message: "Error al iniciar sesión",
            code: "SESSION_ERROR",
          });
        }

        req.session.userId = u.id;
        req.session.role = u.role;
        req.session.name = u.name;
        req.session.email = u.email;

        const redirectTo = redirectForRole(u.role);
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"50f0eb"},body:JSON.stringify({sessionId:"50f0eb",runId:"diagnostic-1",hypothesisId:"H2",location:"auth.controller.js:redirectForRole",message:"Redireccion calculada en backend para login",data:{userId:u.id,role:u.role,redirectTo},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!redirectTo) {
          return res.status(403).json({
            message: "Rol no permitido para acceso interno",
            code: "INVALID_ROLE",
          });
        }
        const userPayload = {
          id: u.id,
          name: u.name,
          role: u.role,
          email: u.email,
        };

        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error("auth.login session.save:", saveErr);
            return res.status(500).json({
              message: "Error al guardar la sesión",
              code: "SESSION_ERROR",
            });
          }

          // #region agent log
          fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"298080"},body:JSON.stringify({sessionId:"298080",runId:"pre-fix",hypothesisId:"H2",location:"auth.controller.js:144",message:"Sesion guardada tras login",data:{sessionUserId:req.session.userId,sessionRole:req.session.role,sessionEmail:req.session.email,redirectTo},timestamp:Date.now()})}).catch(()=>{});
          // #endregion

          // #region agent log
          fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H2", location: "auth.controller.js:139", message: "Login exitoso y sesion guardada", data: { role: u.role, willTriggerMail: u.role === "SUPERVISOR" || u.role === "OPERADOR" }, timestamp: Date.now() }) }).catch(() => {});
          // #endregion

          if (u.role === "SUPERVISOR" || u.role === "OPERADOR") {
            sendLoginAlertMail({
              name: u.name,
              email: u.email,
              role: u.role,
              ip: getClientIp(req),
              userAgent: req.get("user-agent") || "",
              loginAt: new Date(),
            }).catch((mailErr) => {
              // #region agent log
              fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H5", location: "auth.controller.js:152", message: "Fallo envio de alerta, login continua", data: { role: u.role, errorName: mailErr && mailErr.name ? mailErr.name : "Error", errorMessage: mailErr && mailErr.message ? mailErr.message : "unknown" }, timestamp: Date.now() }) }).catch(() => {});
              // #endregion
              logger.error("auth.login alert email:", mailErr);
            });
          }

          // #region agent log
          fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H5", location: "auth.controller.js:158", message: "Respondiendo login al cliente", data: { ok: true, role: u.role }, timestamp: Date.now() }) }).catch(() => {});
          // #endregion

          return res.json({
            ok: true,
            redirectTo,
            user: userPayload,
          });
        });
      });
    });
  });
};

exports.logout = (req, res) => {
  if (!req.session) {
    return res.json({ ok: true });
  }
  req.session.destroy((err) => {
    if (err) {
      logger.error("auth.logout:", err);
      return res.status(500).json({ message: "Error al cerrar sesión", code: "LOGOUT_ERROR" });
    }
    res.clearCookie("sigim.sid", { path: "/" });
    return res.json({ ok: true });
  });
};

exports.me = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado", code: "UNAUTHENTICATED" });
  }
  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"298080"},body:JSON.stringify({sessionId:"298080",runId:"pre-fix",hypothesisId:"H3",location:"auth.controller.js:204",message:"Consulta auth/me",data:{sessionUserId:req.session&&req.session.userId?req.session.userId:null,sessionRole:req.session&&req.session.role?req.session.role:null,sessionEmail:req.session&&req.session.email?req.session.email:null,userId:req.user.id,userRole:req.user.role,userEmail:req.user.email},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  return res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
    },
  });
};
