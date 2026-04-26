const API = "/api";

const form = document.getElementById("login-form");
const alertEl = document.getElementById("login-alert");
const submitBtn = document.getElementById("login-submit");
const wrapEmail = document.getElementById("wrap-email");
const wrapPassword = document.getElementById("wrap-password");
const inputPassword = document.getElementById("login-password");
const togglePwd = document.getElementById("login-toggle-password");
const btnVerify2fa = document.getElementById("btn-verify-2fa");
const wrap2fa = document.getElementById("wrap-2fa");
const divider2fa = document.querySelector(".login-interno-2fa-divider");
const text2fa = document.querySelector(".login-interno-security");

let twoFactorEnabled = false;

function showAlert(kind, msg) {
  if (!alertEl) return;
  const cls =
    kind === "warning"
      ? "alert-warning"
      : kind === "info"
        ? "alert-info"
        : "alert-danger";
  alertEl.className = `alert login-interno-alert py-2 px-3 small ${cls}`;
  alertEl.textContent = msg;
  alertEl.classList.remove("d-none");
}

function hideAlert() {
  if (!alertEl) return;
  alertEl.classList.add("d-none");
  alertEl.textContent = "";
}

function clearFieldErrors() {
  wrapEmail?.classList.remove("is-invalid");
  wrapPassword?.classList.remove("is-invalid");
}

function validateFormFields() {
  clearFieldErrors();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  let ok = true;
  if (!email) {
    wrapEmail?.classList.add("is-invalid");
    ok = false;
  }
  if (!password) {
    wrapPassword?.classList.add("is-invalid");
    ok = false;
  }
  return ok;
}

if (togglePwd && inputPassword) {
  togglePwd.addEventListener("click", () => {
    const isPwd = inputPassword.getAttribute("type") === "password";
    inputPassword.setAttribute("type", isPwd ? "text" : "password");
    const icon = togglePwd.querySelector("i");
    if (icon) {
      icon.className = isPwd ? "bi bi-eye-slash" : "bi bi-eye";
    }
    togglePwd.setAttribute(
      "aria-label",
      isPwd ? "Ocultar contraseña" : "Mostrar contraseña"
    );
  });
}

btnVerify2fa?.addEventListener("click", () => {
  if (twoFactorEnabled) return;
  showAlert(
    "info",
    "La verificación en dos pasos no está activa en el servidor. Use solo correo y contraseña."
  );
});

function setTwoFactorVisibility(enabled) {
  twoFactorEnabled = Boolean(enabled);
  const displayMode = enabled ? "" : "none";
  if (divider2fa) divider2fa.style.display = displayMode;
  if (wrap2fa) wrap2fa.style.display = displayMode;
  if (btnVerify2fa) {
    btnVerify2fa.style.display = displayMode;
    btnVerify2fa.disabled = !enabled;
  }
  if (text2fa) text2fa.style.display = displayMode;
}

async function syncTwoFactorAvailability() {
  try {
    const r = await fetch(`${API}/auth/health`, { credentials: "include" });
    if (!r.ok) {
      setTwoFactorVisibility(false);
      return;
    }
    const data = await r.json().catch(() => ({}));
    setTwoFactorVisibility(data.twoFactorEnabled === true);
  } catch (_) {
    setTwoFactorVisibility(false);
  }
}

setTwoFactorVisibility(false);
syncTwoFactorAvailability();

(async function redirectIfAlreadyLoggedIn() {
  try {
    const r = await fetch(`${API}/auth/me`, { credentials: "include" });
    if (!r.ok) return;
    const data = await r.json();
    const role = data.user && data.user.role;
    window.location.replace(role === "OPERADOR" ? "/tecnico" : "/");
  } catch (_) {
    /* ignorar */
  }
})();

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();
    clearFieldErrors();

    if (!validateFormFields()) {
      showAlert("warning", "Complete correo y contraseña.");
      return;
    }

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === "INVALID_JSON")
          showAlert("warning", data.message || "Petición inválida. Recargue la página e intente de nuevo.");
        else if (data.code === "INACTIVE") showAlert("warning", data.message || "Usuario inactivo");
        else if (data.code === "NO_PASSWORD") showAlert("warning", data.message || "Cuenta sin contraseña configurada");
        else if (data.code === "RATE_LIMIT") showAlert("warning", data.message || "Demasiados intentos. Espere unos minutos.");
        else if (data.code === "CREDENTIALS") showAlert("danger", data.message || "Credenciales incorrectas");
        else if (data.code === "VALIDATION") showAlert("warning", data.message || "Datos incompletos");
        else showAlert("danger", data.message || "Error del servidor al iniciar sesión");
        return;
      }

      window.location.replace(data.redirectTo || "/");
    } catch (_) {
      showAlert("danger", "No se pudo conectar con el servidor.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
