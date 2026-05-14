const API = "/api";

const els = {
  alert: document.getElementById("admin-alert"),
  userName: document.getElementById("admin-user-name"),
  menuUserName: document.getElementById("menu-user-name"),
  topbarUserInitials: document.getElementById("topbar-user-initials"),
  menuUserInitials: document.getElementById("menu-user-initials"),
  linkVerPerfilTopbar: document.getElementById("link-ver-perfil-topbar"),
  btnLogout: document.getElementById("admin-btn-logout"),
  btnLogoutMenu: document.getElementById("btn-cerrar-sesion-menu"),
  totalUsuarios: document.getElementById("kpi-total-usuarios"),
  usuariosActivos: document.getElementById("kpi-usuarios-activos"),
  usuariosInactivos: document.getElementById("kpi-usuarios-inactivos"),
  totalAdmins: document.getElementById("kpi-total-admins"),
  totalSupervisores: document.getElementById("kpi-total-supervisores"),
  totalOperadores: document.getElementById("kpi-total-operadores"),
  totalIncidencias: document.getElementById("kpi-total-incidencias"),
  totalEvidencias: document.getElementById("kpi-total-evidencias"),
};

function showAlert(message, type = "info") {
  if (!els.alert) return;
  els.alert.className = `alert alert-${type}`;
  els.alert.textContent = message;
  els.alert.classList.remove("d-none");
}

function setKpi(element, value) {
  if (!element) return;
  element.textContent = String(Number(value || 0));
}

function calcInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AD";
}

function redirectByRole(role) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "ADMIN") return "/admin.html";
  if (normalized === "SUPERVISOR") return "/dashboard.html";
  if (normalized === "OPERADOR") return "/tecnico.html";
  return "/login.html";
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

async function ensureAdminSession() {
  const me = await fetchJSON(`${API}/auth/me`);
  const user = me && me.user ? me.user : null;

  if (!user) {
    window.location.replace("/login.html");
    return null;
  }

  const displayName = user.name || "Administrador";
  const initials = calcInitials(displayName);

  if (els.userName) {
    els.userName.textContent = displayName;
  }
  if (els.menuUserName) els.menuUserName.textContent = displayName;
  if (els.topbarUserInitials) els.topbarUserInitials.textContent = initials;
  if (els.menuUserInitials) els.menuUserInitials.textContent = initials;
  if (els.linkVerPerfilTopbar) els.linkVerPerfilTopbar.setAttribute("href", "/admin/perfil");

  if (String(user.role || "").toUpperCase() !== "ADMIN") {
    window.location.replace(redirectByRole(user.role));
    return null;
  }

  return user;
}

async function loadDashboard() {
  const data = await fetchJSON(`${API}/admin/dashboard`);
  setKpi(els.totalUsuarios, data.totalUsuarios);
  setKpi(els.usuariosActivos, data.usuariosActivos);
  setKpi(els.usuariosInactivos, data.usuariosInactivos);
  setKpi(els.totalAdmins, data.totalAdmins);
  setKpi(els.totalSupervisores, data.totalSupervisores);
  setKpi(els.totalOperadores, data.totalOperadores);
  setKpi(els.totalIncidencias, data.totalIncidencias);
  setKpi(els.totalEvidencias, data.totalEvidencias);
}

async function logout() {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch (_) {
    // noop
  }
  window.location.replace("/login.html");
}

function bindSidebarNavActive() {
  const links = Array.from(document.querySelectorAll(".admin-sidebar .nav-link[href^='#']"));
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

async function init() {
  try {
    const user = await ensureAdminSession();
    if (!user) return;
    bindSidebarNavActive();
    await loadDashboard();
  } catch (error) {
    showAlert(error.message || "No se pudo cargar el panel administrador", "danger");
  }
}

els.btnLogout?.addEventListener("click", logout);
els.btnLogoutMenu?.addEventListener("click", logout);
init();
