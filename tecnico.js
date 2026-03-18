const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const els = { tbody: document.getElementById("tbody-incidencias") };

async function fetchJSON(url, options = {}) { try { const res = await fetch(url, options); return await res.json(); } catch (e) { return null; } }

async function cargarDatos() {
  const data = await fetchJSON(`${API}/incidencias/tecnico`);
  if (!data || !data.length) return;
  els.tbody.innerHTML = "";
  data.forEach(i => {
    els.tbody.innerHTML += `<tr><td>${i.folio}</td><td>${i.titulo}</td><td>${i.estatus}</td><td>${i.prioridad}</td><td>${i.tipo}</td>
    <td><button class="btn btn-sm btn-warning" data-action="actualizar" data-id="${i.id}" data-estatus="${i.estatus}">Estatus</button></td></tr>`;
  });
}

document.getElementById("btn-recargar").addEventListener("click", cargarDatos);

els.tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]"); if (!btn) return;
  document.getElementById("form-actualizar-estatus").dataset.id = btn.dataset.id;
  const sel = document.getElementById("select-nuevo-estatus"); sel.innerHTML = `<option value="">Seleccione...</option>`;
  if(btn.dataset.estatus === 'ASIGNADA') sel.innerHTML += `<option value="EN_PROCESO">En Proceso</option>`;
  if(btn.dataset.estatus === 'EN_PROCESO') sel.innerHTML += `<option value="RESUELTA">Resuelta</option>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById("modalActualizarEstatus")).show();
});

document.getElementById("select-nuevo-estatus").addEventListener("change", (e) => {
  const d = document.getElementById("div-evidencia"); const i = document.getElementById("input-evidencia");
  if (e.target.value === 'RESUELTA') { d.classList.remove('d-none'); i.required = true; } else { d.classList.add('d-none'); i.required = false; }
});

document.getElementById("form-actualizar-estatus").addEventListener("submit", async (e) => {
  e.preventDefault(); alert("Enviando foto y estatus...");
  bootstrap.Modal.getInstance(document.getElementById("modalActualizarEstatus")).hide();
});

document.addEventListener("DOMContentLoaded", cargarDatos);