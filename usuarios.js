const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const els = { tbE: document.getElementById('tbody-empleados'), tbC: document.getElementById('tbody-ciudadanos'), form: document.getElementById('form-usuario'), title: document.getElementById('modalUsuarioTitle') };

async function fetchJSON(url, options = {}) { try { const res = await fetch(url, options); return await res.json(); } catch(e) { return null; } }

async function cargarEmpleados() {
  const data = await fetchJSON(`${API}/usuarios/empleados`); if (!data || !data.length) return;
  els.tbE.innerHTML = "";
  data.forEach(u => { els.tbE.innerHTML += `<tr><td class="fw-bold">${u.nombre}</td><td>${u.correo}</td><td><span class="badge ${u.rol==='ADMIN'?'bg-primary':'bg-secondary'}">${u.rol}</span></td><td><button class="btn btn-sm btn-outline-primary" onclick='editarUsuario(${JSON.stringify(u)})'><i class="bi bi-pencil"></i></button></td></tr>`; });
}

async function cargarCiudadanos() {
  const data = await fetchJSON(`${API}/usuarios/ciudadanos`); if (!data || !data.length) return;
  els.tbC.innerHTML = "";
  data.forEach(c => { els.tbC.innerHTML += `<tr><td class="fw-bold">${c.nombre}</td><td>${c.telefono||'-'}</td><td><span class="badge bg-info text-dark">${c.total_reportes} reportes</span></td></tr>`; });
}

window.abrirModalUsuario = function() { els.form.reset(); document.getElementById('usuario-id').value = ""; els.title.textContent = "Nuevo Empleado"; bootstrap.Modal.getOrCreateInstance(document.getElementById("modalUsuario")).show(); }
window.editarUsuario = function(u) { els.form.reset(); els.title.textContent = "Editar Empleado"; document.getElementById('usuario-id').value = u.id; document.getElementById('usuario-nombre').value = u.nombre; document.getElementById('usuario-correo').value = u.correo; document.getElementById('usuario-rol').value = u.rol; bootstrap.Modal.getOrCreateInstance(document.getElementById("modalUsuario")).show(); }

els.form.addEventListener('submit', async (e) => {
  e.preventDefault(); const id = document.getElementById('usuario-id').value;
  const body = { nombre: document.getElementById('usuario-nombre').value, correo: document.getElementById('usuario-correo').value, rol: document.getElementById('usuario-rol').value };
  const pass = document.getElementById('usuario-password').value; if(pass) body.password = pass;
  const res = await fetchJSON(id ? `${API}/usuarios/${id}` : `${API}/usuarios`, { method: id ? 'PUT' : 'POST', headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  if (res) { bootstrap.Modal.getInstance(document.getElementById("modalUsuario")).hide(); cargarEmpleados(); }
});

document.addEventListener("DOMContentLoaded", () => { cargarEmpleados(); cargarCiudadanos(); });