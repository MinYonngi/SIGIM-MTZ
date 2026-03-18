const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

const els = {
  form: document.getElementById("form-login"),
  email: document.getElementById("input-email"),
  password: document.getElementById("input-password"),
  btnSubmit: document.getElementById("btn-submit"),
  btnText: document.getElementById("btn-text"),
  btnSpinner: document.getElementById("btn-spinner"),
  alertError: document.getElementById("alert-error"),
  alertErrorMsg: document.getElementById("alert-error-msg")
};

function setLoading(isLoading) {
  els.btnSubmit.disabled = isLoading;
  els.btnSpinner.classList.toggle("d-none", !isLoading);
  els.btnText.classList.toggle("d-none", isLoading);
}

function showError(msg) {
  if (msg) {
    els.alertErrorMsg.textContent = msg;
    els.alertError.classList.remove("d-none");
  } else {
    els.alertError.classList.add("d-none");
  }
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = els.email.value.trim();
  const password = els.password.value;

  if (!email || !password) return;

  showError(null);
  setLoading(true);

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Error de credenciales");

    localStorage.setItem("sigim_token", data.token);
    localStorage.setItem("sigim_user", JSON.stringify(data.user));

    const role = (data.user?.role || "").toLowerCase();
    window.location.href = role === "tecnico" ? "tecnico.html" : "dashboard.html";

  } catch (error) {
    showError(error.message);
    els.password.value = "";
    els.password.focus();
  } finally {
    setLoading(false);
  }
});