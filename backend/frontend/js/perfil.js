const API = "/api";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

let currentUser = null;
let selectedAvatarFile = null;
let previewObjectUrl = null;

const els = {
  alert: document.getElementById("perfil-alert"),
  topbarName: document.getElementById("topbar-user-name"),
  topbarRole: document.getElementById("topbar-user-role"),
  topbarInitials: document.getElementById("topbar-user-initials"),
  menuName: document.getElementById("menu-user-name"),
  menuInitials: document.getElementById("menu-user-initials"),
  nombreCompleto: document.getElementById("perfil-nombre-completo"),
  correoPrincipal: document.getElementById("perfil-correo-principal"),
  rolBadge: document.getElementById("perfil-rol-badge"),
  estadoBadge: document.getElementById("perfil-estado-badge"),
  fechaCreacion: document.getElementById("perfil-fecha-creacion"),
  fechaActualizacion: document.getElementById("perfil-fecha-actualizacion"),
  infoNombre: document.getElementById("perfil-info-nombre"),
  infoCorreo: document.getElementById("perfil-info-correo"),
  infoRol: document.getElementById("perfil-info-rol"),
  infoEstado: document.getElementById("perfil-info-estado"),
  infoArea: document.getElementById("perfil-info-area"),
  infoRutaPrincipal: document.getElementById("perfil-info-ruta-principal"),
  infoEmailVerified: document.getElementById("perfil-info-email-verified"),
  infoMfa: document.getElementById("perfil-info-mfa"),
  infoCreacion: document.getElementById("perfil-info-creacion"),
  infoActualizacion: document.getElementById("perfil-info-actualizacion"),
  securityCuentaProtegida: document.getElementById("perfil-security-cuenta-protegida"),
  securityEmailVerified: document.getElementById("perfil-security-email-verified"),
  securityRol: document.getElementById("perfil-security-rol"),
  securityUltimoAcceso: document.getElementById("perfil-security-ultimo-acceso"),
  securityMfa: document.getElementById("perfil-security-mfa"),
  securityFailedAttempts: document.getElementById("perfil-security-failed-attempts"),
  securityLockedUntil: document.getElementById("perfil-security-locked-until"),
  securityPasswordChanged: document.getElementById("perfil-security-password-changed"),
  avatarImg: document.getElementById("avatar-preview-img"),
  avatarInitials: document.getElementById("avatar-initials"),
  inputAvatar: document.getElementById("input-avatar"),
  btnSelectAvatar: document.getElementById("btn-seleccionar-avatar"),
  btnSaveAvatar: document.getElementById("btn-guardar-avatar"),
  btnBack: document.getElementById("btn-volver-panel"),
  btnBackLabel: document.getElementById("btn-volver-panel-label"),
  btnLogout: document.getElementById("btn-cerrar-sesion"),
  btnLogoutMenu: document.getElementById("btn-cerrar-sesion-menu"),
  btnLogoutFooter: document.getElementById("btn-cerrar-sesion-footer"),
  linkVerPerfilTopbar: document.getElementById("link-ver-perfil-topbar"),
  funcionesTitulo: document.getElementById("perfil-funciones-titulo"),
  funcionesLista: document.getElementById("perfil-funciones-lista"),
  adminCard: document.getElementById("perfil-admin-card"),
};

function calcInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "--";
}

function asBinaryFlag(value) {
  if (value === 1 || value === "1" || value === true) return 1;
  return 0;
}

function displayValue(value, fallback = "No registrado") {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function formatDate(value, fallback = "No disponible") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveRoleLabel(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "Administrador del sistema";
  if (normalized === "SUPERVISOR") return "Supervisor del departamento";
  if (normalized === "OPERADOR") return "Técnico operativo";
  return "No disponible";
}

function resolvePanelRoute(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OPERADOR") return "/tecnico.html";
  if (normalized === "ADMIN") return "/admin.html";
  if (normalized === "SUPERVISOR") return "/dashboard.html";
  return "/login.html";
}

function resolveModuloLabel(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "Administración del sistema";
  if (normalized === "SUPERVISOR") return "Panel Supervisor";
  if (normalized === "OPERADOR") return "Panel Técnico";
  return "No disponible";
}

function resolveRoleFunctions(role) {
  const normalized = String(role || "").toUpperCase();
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
  return ["No disponible"];
}

function setAvatarVisual({ initials, avatarUrl }) {
  if (!els.avatarImg || !els.avatarInitials) return;

  if (avatarUrl) {
    els.avatarImg.src = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    els.avatarImg.classList.remove("d-none");
    els.avatarInitials.classList.add("d-none");
  } else {
    els.avatarImg.removeAttribute("src");
    els.avatarImg.classList.add("d-none");
    els.avatarInitials.textContent = initials;
    els.avatarInitials.classList.remove("d-none");
  }
}

function showPerfilAlert(message, type = "info") {
  if (!els.alert) return;
  els.alert.className = `alert alert-${type}`;
  els.alert.textContent = message;
  els.alert.classList.remove("d-none");
}

function hidePerfilAlert() {
  if (!els.alert) return;
  els.alert.classList.add("d-none");
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.replace("/login.html");
    throw new Error(data.message || "Sesión no válida");
  }

  if (!response.ok) {
    throw new Error(data.message || `Error ${response.status}`);
  }

  return data;
}

function renderProfile(user) {
  if (!user) return;

  const normalizedRole = String(user.role || "").toUpperCase();
  const roleLabel = displayValue(user.role_display, resolveRoleLabel(normalizedRole));
  const moduloLabel = displayValue(user.modulo, resolveModuloLabel(normalizedRole));
  const rutaPrincipal = displayValue(user.ruta_principal, resolvePanelRoute(normalizedRole));
  const initials = calcInitials(user.name);
  const estadoCuenta = asBinaryFlag(user.active) === 1 ? "Activa" : "Inactiva";
  const emailVerified = asBinaryFlag(user.email_verified) === 1 ? "Verificado" : "No verificado";
  const mfaStatus = asBinaryFlag(user.mfa_enabled) === 1 ? "Activado" : "Desactivado";
  const funciones = Array.isArray(user.funciones) && user.funciones.length
    ? user.funciones
    : resolveRoleFunctions(normalizedRole);

  if (els.topbarName) els.topbarName.textContent = displayValue(user.name, "Usuario");
  if (els.menuName) els.menuName.textContent = displayValue(user.name, "Usuario");
  if (els.topbarRole) els.topbarRole.textContent = roleLabel;
  if (els.topbarInitials) els.topbarInitials.textContent = initials;
  if (els.menuInitials) els.menuInitials.textContent = initials;

  if (els.nombreCompleto) els.nombreCompleto.textContent = displayValue(user.name);
  if (els.correoPrincipal) els.correoPrincipal.textContent = displayValue(user.email);
  if (els.rolBadge) els.rolBadge.textContent = roleLabel;
  if (els.estadoBadge) els.estadoBadge.textContent = estadoCuenta;
  if (els.fechaCreacion) els.fechaCreacion.textContent = formatDate(user.created_at);
  if (els.fechaActualizacion) els.fechaActualizacion.textContent = formatDate(user.updated_at);

  if (els.infoNombre) els.infoNombre.textContent = displayValue(user.name);
  if (els.infoCorreo) els.infoCorreo.textContent = displayValue(user.email);
  if (els.infoRol) els.infoRol.textContent = roleLabel;
  if (els.infoEstado) els.infoEstado.textContent = estadoCuenta;
  if (els.infoArea) els.infoArea.textContent = moduloLabel;
  if (els.infoRutaPrincipal) els.infoRutaPrincipal.textContent = rutaPrincipal;
  if (els.infoEmailVerified) els.infoEmailVerified.textContent = emailVerified;
  if (els.infoMfa) els.infoMfa.textContent = mfaStatus;
  if (els.infoCreacion) els.infoCreacion.textContent = formatDate(user.created_at);
  if (els.infoActualizacion) els.infoActualizacion.textContent = formatDate(user.updated_at);

  if (els.securityCuentaProtegida) {
    els.securityCuentaProtegida.textContent = asBinaryFlag(user.active) === 1 ? "Sesión interna validada" : "Cuenta inactiva";
  }
  if (els.securityEmailVerified) els.securityEmailVerified.textContent = emailVerified;
  if (els.securityRol) els.securityRol.textContent = roleLabel;
  if (els.securityUltimoAcceso) els.securityUltimoAcceso.textContent = formatDate(user.last_login_at);
  if (els.securityMfa) els.securityMfa.textContent = mfaStatus;
  if (els.securityFailedAttempts) {
    els.securityFailedAttempts.textContent = user.failed_login_attempts != null
      ? String(user.failed_login_attempts)
      : "No disponible";
  }
  if (els.securityLockedUntil) {
    els.securityLockedUntil.textContent = formatDate(user.locked_until, "No bloqueada");
  }
  if (els.securityPasswordChanged) {
    els.securityPasswordChanged.textContent = formatDate(user.password_changed_at);
  }

  if (els.funcionesTitulo) {
    els.funcionesTitulo.textContent = `Funciones (${roleLabel})`;
  }
  if (els.funcionesLista) {
    els.funcionesLista.textContent = "";
    funciones.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = displayValue(item, "No disponible");
      els.funcionesLista.appendChild(li);
    });
  }

  if (els.btnBackLabel) {
    els.btnBackLabel.textContent = "Volver al módulo";
  }

  if (els.linkVerPerfilTopbar) {
    els.linkVerPerfilTopbar.setAttribute("href", "/mi-perfil");
  }

  if (els.adminCard) {
    els.adminCard.classList.toggle("d-none", normalizedRole !== "ADMIN");
  }

  setAvatarVisual({ initials, avatarUrl: user.avatar_url });
}

async function loadProfile() {
  let data;

  try {
    data = await fetchJSON(`${API}/usuarios/me`);
  } catch (err) {
    const fallback = await fetchJSON(`${API}/auth/me`);
    const u = fallback.user || {};
    data = {
      user: {
        id: u.id || null,
        name: u.name || null,
        email: u.email || null,
        role: u.role || null,
        active: 1,
        email_verified: null,
        last_login_at: null,
        failed_login_attempts: null,
        locked_until: null,
        mfa_enabled: null,
        password_changed_at: null,
        created_at: null,
        updated_at: null,
        role_display: resolveRoleLabel(u.role),
        modulo: resolveModuloLabel(u.role),
        ruta_principal: resolvePanelRoute(u.role),
        funciones: resolveRoleFunctions(u.role),
        avatar_url: null,
      },
    };
  }

  currentUser = data.user || null;
  renderProfile(currentUser);
}

function resetPreviewObjectUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

function onAvatarFileSelected(file) {
  selectedAvatarFile = null;
  if (els.btnSaveAvatar) els.btnSaveAvatar.disabled = true;
  hidePerfilAlert();

  if (!file) return;
  if (!ALLOWED_MIME.has(file.type)) {
    showPerfilAlert("Formato inválido. Selecciona JPG, PNG o WEBP.", "warning");
    return;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    showPerfilAlert("La imagen supera el tamaño máximo permitido (2MB).", "warning");
    return;
  }

  selectedAvatarFile = file;
  if (els.btnSaveAvatar) els.btnSaveAvatar.disabled = false;

  resetPreviewObjectUrl();
  previewObjectUrl = URL.createObjectURL(file);
  setAvatarVisual({
    initials: calcInitials(currentUser?.name),
    avatarUrl: previewObjectUrl,
  });
}

async function saveAvatar() {
  if (!selectedAvatarFile || !els.btnSaveAvatar) return;

  hidePerfilAlert();
  els.btnSaveAvatar.disabled = true;
  const originalText = els.btnSaveAvatar.innerHTML;
  els.btnSaveAvatar.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Guardando...`;

  try {
    const body = new FormData();
    body.append("avatar", selectedAvatarFile);
    await fetchJSON(`${API}/usuarios/me/avatar`, {
      method: "PUT",
      body,
    });
    showPerfilAlert("Foto de perfil actualizada correctamente.", "success");
    selectedAvatarFile = null;
    resetPreviewObjectUrl();
    await loadProfile();
  } catch (err) {
    showPerfilAlert(err.message || "No se pudo actualizar la foto de perfil.", "danger");
  } finally {
    els.btnSaveAvatar.disabled = !selectedAvatarFile;
    els.btnSaveAvatar.innerHTML = originalText;
  }
}

async function logout() {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch (_) {
    // noop
  }
  window.location.replace("/login.html");
}

function bindEvents() {
  els.btnSelectAvatar?.addEventListener("click", () => els.inputAvatar?.click());

  els.inputAvatar?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    onAvatarFileSelected(file);
  });

  els.btnSaveAvatar?.addEventListener("click", saveAvatar);

  els.btnBack?.addEventListener("click", () => {
    const target = currentUser?.ruta_principal || resolvePanelRoute(currentUser?.role);
    window.location.href = target;
  });

  els.btnLogout?.addEventListener("click", logout);
  els.btnLogoutMenu?.addEventListener("click", logout);
  els.btnLogoutFooter?.addEventListener("click", logout);
}

(async () => {
  try {
    bindEvents();
    await loadProfile();
  } catch (err) {
    showPerfilAlert(err.message || "No fue posible cargar el perfil.", "danger");
  }
})();
