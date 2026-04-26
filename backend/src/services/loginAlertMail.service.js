const nodemailer = require("nodemailer");

const ALERT_ROLES = new Set(["SUPERVISOR", "OPERADOR"]);
let transporter;

function isMailEnabled() {
  return String(process.env.MAIL_ENABLED || "false").toLowerCase() === "true";
}

function parseSecure(value) {
  return String(value || "false").toLowerCase() === "true";
}

function getRecipients() {
  const raw = process.env.MAIL_TO_ALERTS || "";
  return raw
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseSecure(process.env.SMTP_SECURE);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

function sendLoginAlertMail({ name, email, role, ip, userAgent, loginAt }) {
  if (!isMailEnabled()) {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H1", location: "loginAlertMail.service.js:43", message: "Mail deshabilitado, se omite alerta", data: { mailEnabled: false }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return Promise.resolve(false);
  }

  if (!ALERT_ROLES.has(role)) {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H2", location: "loginAlertMail.service.js:50", message: "Rol no aplica para alerta", data: { role }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return Promise.resolve(false);
  }

  const recipients = getRecipients();
  if (!recipients.length) {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H3", location: "loginAlertMail.service.js:58", message: "Sin destinatarios MAIL_TO_ALERTS", data: { recipientsCount: 0 }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return Promise.resolve(false);
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) {
    return Promise.reject(new Error("MAIL_FROM o SMTP_USER no configurado"));
  }

  const when = (loginAt || new Date()).toISOString();
  const subject = `[SIGIM-MTZ] Login exitoso (${role})`;
  const text = [
    "Se detecto un inicio de sesion exitoso.",
    `Rol: ${role}`,
    `Usuario: ${name || "(sin nombre)"}`,
    `Correo: ${email || "(sin correo)"}`,
    `Fecha: ${when}`,
    `IP: ${ip || "(no disponible)"}`,
    `User-Agent: ${userAgent || "(no disponible)"}`,
  ].join("\n");

  // #region agent log
  fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H4", location: "loginAlertMail.service.js:79", message: "Intentando envio SMTP de alerta", data: { role, recipientsCount: recipients.length, hostConfigured: Boolean(process.env.SMTP_HOST), port: Number(process.env.SMTP_PORT || 587) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  return getTransporter()
    .sendMail({
      from,
      to: recipients.join(", "),
      subject,
      text,
    })
    .then((result) => {
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/9b4d23ee-cd50-4693-9616-c2870834d19c", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "527186" }, body: JSON.stringify({ sessionId: "527186", runId: "pre-fix", hypothesisId: "H4", location: "loginAlertMail.service.js:91", message: "Envio SMTP completado", data: { acceptedCount: Array.isArray(result && result.accepted) ? result.accepted.length : 0, rejectedCount: Array.isArray(result && result.rejected) ? result.rejected.length : 0 }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      return result;
    });
}

module.exports = {
  sendLoginAlertMail,
};
