const API = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

// SESION DESACTIVADA PARA EVITAR QUE TE SAQUE DEL DASHBOARD
// let currentUser = null;
// const userStr = localStorage.getItem("sigim_user");
// if(userStr) currentUser = JSON.parse(userStr);

const els = {
  total: document.getElementById("kpi-total"),
  nuevas: document.getElementById("kpi-nuevas"),
  asignadas: document.getElementById("kpi-asignadas"),
  enproceso: document.getElementById("kpi-enproceso"),
  tbody: document.getElementById("tbody-incidencias"),
  btnRecargar: document.getElementById("btn-recargar"),
  modalFolio: document.getElementById("modal-folio"),
  selectTecnicos: document.getElementById("select-tecnicos"),
  inputComentario: document.getElementById("input-comentario"),
  btnAsignar: document.getElementById("btn-asignar"),
  lblLoading: document.getElementById("lbl-loading"),
  toastOk: document.getElementById("toastOk"),
  toastOkMsg: document.getElementById("toastOkMsg"),
};

let currentIncidencia = null;
let bsModal = null;
let bsToast = null;
let catalogoMap = {};
let chartInstance = null;

function setLoading(isLoading) {
  if (!els.lblLoading) return;
  els.lblLoading.classList.toggle("d-none", !isLoading);
  els.btnRecargar.disabled = !!isLoading;
}

function showToast(msg) {
  if (!els.toastOk) return alert(msg);
  if (!bsToast) bsToast = bootstrap.Toast.getOrCreateInstance(els.toastOk, { delay: 2200 });
  els.toastOkMsg.textContent = msg;
  bsToast.show();
}

function statusClass(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("cerr") || t.includes("resuel")) return "badge-ok";
  if (t.includes("nuev")) return "badge-warn";
  if (t.includes("proceso")) return "badge-warn";
  return "";
}

function badge(text) {
  const extra = statusClass(text);
  return `<span class="badge-status ${extra}">${text || ""}</span>`;
}

function escapeHTML(str) {
  if (!str) return "";
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function fetchJSON(url, options = {}) {
  const headers = options.headers || {};
  // headers["Authorization"] = `Bearer ${localStorage.getItem("sigim_token")}`;
  options.headers = headers;

  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
    return data;
  } catch (error) {
    console.warn(`Esperando conexión a base de datos en: ${url}`);
    return null; 
  }
}

async function cargarCatalogo() {
  const data = await fetchJSON(`${API}/catalogo/tipos-servicio`);
  catalogoMap = {};
  if (data) {
    const items = Array.isArray(data) ? data : (data.items || data.data || []);
    items.forEach(s => { catalogoMap[s.id] = s.nombre; });
  }
}

async function cargarKPIs() {
  const data = await fetchJSON(`${API}/incidencias/resumen`);
  if (data) {
    els.total.textContent = data.total ?? 0;
    els.nuevas.textContent = data.nuevas ?? 0;
    els.asignadas.textContent = data.asignadas ?? 0;
    els.enproceso.textContent = data.en_proceso ?? 0;
  }
}

function renderChart(items) {
  const ctx = document.getElementById('chartServicios');
  if(!ctx) return;
  
  const conteo = {};
  if (items && items.length > 0) {
    items.forEach(i => {
      const tipo = catalogoMap[i.tipo_servicio_id] || "Otros";
      conteo[tipo] = (conteo[tipo] || 0) + 1;
    });
  }

  if (chartInstance) chartInstance.destroy(); 
  
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(conteo).length ? Object.keys(conteo) : ['Sin datos'],
      datasets: [{
        data: Object.values(conteo).length ? Object.values(conteo) : [1],
        backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'],
        borderWidth: 0
      }]
    },
    options: { cutout: '70%', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

async function cargarIncidencias() {
  const data = await fetchJSON(`${API}/incidencias?limit=25&page=1`);
  els.tbody.innerHTML = "";
  
  const items = Array.isArray(data) ? data : (data?.items || data?.data || []);

  items.forEach(i => {
    const tr = document.createElement("tr");
    const tipoNombre = catalogoMap[i.tipo_servicio_id] || "";

    tr.innerHTML = `
      <td class="fw-bold">${escapeHTML(i.folio)}</td>
      <td>${escapeHTML(i.titulo ?? "")}</td>
      <td>${badge(i.estatus)}</td>
      <td>${badge(i.prioridad)}</td>
      <td>${escapeHTML(tipoNombre)}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-primary btn-pill" data-action="asignar" data-id="${i.id}" data-folio="${i.folio}" data-estatus="${i.estatus}">Asignar</button>
          <button class="btn btn-sm btn-info btn-pill" data-action="seguimiento" data-id="${i.id}" data-folio="${i.folio}" data-estatus="${i.estatus}"><i class="bi bi-clock-history"></i></button>
        </div>
      </td>
    `;
    els.tbody.appendChild(tr);
  });

  if (!items.length) {
    els.tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-4">Esperando registros de la base de datos...</td></tr>`;
  }

  renderChart(items);
}

async function cargarTecnicos() {
  const tecnicos = await fetchJSON(`${API}/usuarios/tecnicos`);
  els.selectTecnicos.innerHTML = "";
  if (tecnicos) {
    tecnicos.forEach(t => {
      els.selectTecnicos.innerHTML += `<option value="${t.id}">${t.name || t.nombre}</option>`;
    });
  } else {
    els.selectTecnicos.innerHTML = `<option value="">Sin conexión a BD</option>`;
  }
}

function abrirModalAsignar({ id, folio }) {
  currentIncidencia = { id, folio };
  els.modalFolio.textContent = `Folio: ${folio}`;
  els.inputComentario.value = "";
  bsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalAsignar"));
  bsModal.show();
}

function cerrarModal() {
  if (bsModal) bsModal.hide();
  currentIncidencia = null;
}

async function cargarHistorial(id) {
  const data = await fetchJSON(`${API}/incidencias/${id}/historial`);
  const tbodySeguimiento = document.getElementById("tbody-seguimiento");
  tbodySeguimiento.innerHTML = "";

  if (!data || !data.length) {
    return tbodySeguimiento.innerHTML = `<tr><td colspan="5" class="text-center text-secondary py-3">No hay movimientos registrados</td></tr>`;
  }

  data.forEach(item => {
    tbodySeguimiento.innerHTML += `<tr><td>${new Date(item.created_at).toLocaleString('es-MX')}</td><td><span class="badge bg-secondary">${escapeHTML(item.accion)}</span></td><td>${escapeHTML(item.comentario || '-')}</td><td>${escapeHTML(item.actor_name || item.actor_user_id || '-')}</td><td>${escapeHTML(item.target_name || item.target_user_id || '-')}</td></tr>`;
  });
}

async function abrirModalSeguimiento(incidencia) {
  const { id, folio, estatus } = incidencia;
  document.getElementById("seg-folio").textContent = `Folio: ${folio}`;
  document.getElementById("seg-estatus").textContent = `Estatus: ${estatus}`;
  await cargarHistorial(id);
  bootstrap.Modal.getOrCreateInstance(document.getElementById("modalSeguimiento")).show();
}

async function asignarIncidencia() {
  if (!currentIncidencia) return;
  const tecnicoId = parseInt(els.selectTecnicos.value, 10);
  if (!tecnicoId) return alert("Selecciona un técnico válido");

  const body = { actor_user_id: 1, target_user_id: tecnicoId, comentario: els.inputComentario.value || null };

  await fetchJSON(`${API}/incidencias/${currentIncidencia.id}/asignar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  cerrarModal();
  await recargarTodo();
  showToast("Incidencia asignada ✅");
}

async function recargarTodo() {
  setLoading(true);
  try {
    await cargarCatalogo();
    await cargarKPIs();
    await cargarIncidencias();
  } finally {
    setLoading(false);
  }
}

els.btnRecargar.addEventListener("click", recargarTodo);
els.btnAsignar.addEventListener("click", asignarIncidencia);

els.tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const { action, id, folio, estatus } = btn.dataset;

  if (action === "seguimiento") {
    setLoading(true);
    await abrirModalSeguimiento({ id, folio, estatus });
    setLoading(false);
  } else if (action === "asignar") {
    if (estatus && estatus.toUpperCase() !== "NUEVA") return showToast(`No se puede asignar. Estatus actual: ${estatus}`);
    setLoading(true);
    await cargarTecnicos();
    abrirModalAsignar({ id, folio });
    setLoading(false);
  }
});

// Init
(async () => {
  try { await recargarTodo(); }
  catch (e) { console.error(e); }
})();