const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const els = { form: document.getElementById('form-perfil'), nombre: document.getElementById('perfil-nombre'), correo: document.getElementById('perfil-correo'), pass1: document.getElementById('perfil-pass1'), pass2: document.getElementById('perfil-pass2'), txtNombre: document.getElementById('txt-nombre-perfil') };

async function fetchJSON(url, options = {}) { try { const res = await fetch(url, options); if (!res.ok) throw new Error("Fallo"); return await res.json(); } catch (error) { return null; } }

async function cargarPerfil() {
  const data = await fetchJSON(`${API}/perfil`);
  if (data) { els.nombre.value = data.nombre; els.correo.value = data.correo; els.txtNombre.textContent = data.nombre; }
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault(); if (els.pass1.value !== els.pass2.value) return alert("Las contraseñas no coinciden.");
  const body = { nombre: els.nombre.value }; if (els.pass1.value) body.password = els.pass1.value;
  const res = await fetchJSON(`${API}/perfil`, { method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res) alert("Perfil actualizado."); else alert("Esperando conexión BD.");
});
document.addEventListener("DOMContentLoaded", cargarPerfil);